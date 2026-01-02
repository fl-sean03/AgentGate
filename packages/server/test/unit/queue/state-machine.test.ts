import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorkOrderStateMachine,
  InvalidTransitionError,
  StateMachineConfig,
} from '../../../src/queue/state-machine.js';
import { WorkOrderState, StateEvent } from '../../../src/queue/types.js';

describe('WorkOrderStateMachine', () => {
  let config: StateMachineConfig;
  let sm: WorkOrderStateMachine;

  beforeEach(() => {
    config = {
      workOrderId: 'test-123',
      maxRetries: 3,
    };
    sm = new WorkOrderStateMachine(config);
  });

  describe('initialization', () => {
    it('should start in PENDING state by default', () => {
      expect(sm.currentState).toBe('PENDING');
    });

    it('should accept custom initial state', () => {
      const customSm = new WorkOrderStateMachine({
        ...config,
        initialState: 'RUNNING',
      });
      expect(customSm.currentState).toBe('RUNNING');
    });

    it('should start with zero retry count', () => {
      expect(sm.retryCount).toBe(0);
    });

    it('should start with empty history', () => {
      expect(sm.history).toHaveLength(0);
    });
  });

  describe('happy path transitions', () => {
    it('should transition PENDING → PREPARING on claim', () => {
      sm.claim();
      expect(sm.currentState).toBe('PREPARING');
    });

    it('should transition PREPARING → RUNNING on ready', () => {
      sm.claim();
      sm.ready();
      expect(sm.currentState).toBe('RUNNING');
    });

    it('should transition RUNNING → COMPLETED on complete', () => {
      sm.claim();
      sm.ready();
      sm.complete({ exitCode: 0 });
      expect(sm.currentState).toBe('COMPLETED');
      expect(sm.isTerminal).toBe(true);
    });
  });

  describe('failure and retry path', () => {
    it('should transition RUNNING → WAITING_RETRY on retryable failure', () => {
      sm.claim();
      sm.ready();
      sm.fail({ message: 'Timeout', retryable: true });
      expect(sm.currentState).toBe('WAITING_RETRY');
    });

    it('should transition WAITING_RETRY → PENDING on retry', () => {
      sm.claim();
      sm.ready();
      sm.fail({ message: 'Timeout', retryable: true });
      sm.retry();
      expect(sm.currentState).toBe('PENDING');
      expect(sm.retryCount).toBe(1);
    });

    it('should transition to FAILED after max retries', () => {
      for (let i = 0; i <= config.maxRetries; i++) {
        sm.claim();
        sm.ready();
        const state = sm.fail({ message: 'Timeout', retryable: true });
        if (i < config.maxRetries) {
          expect(state).toBe('WAITING_RETRY');
          sm.retry();
        } else {
          expect(state).toBe('FAILED');
        }
      }
      expect(sm.isTerminal).toBe(true);
    });

    it('should transition directly to FAILED on non-retryable error', () => {
      sm.claim();
      sm.ready();
      const state = sm.fail({ message: 'Fatal error', retryable: false });
      expect(state).toBe('FAILED');
      expect(sm.isTerminal).toBe(true);
    });
  });

  describe('cancellation', () => {
    it('should allow cancellation from PENDING', () => {
      sm.cancel('User requested');
      expect(sm.currentState).toBe('CANCELLED');
      expect(sm.isTerminal).toBe(true);
    });

    it('should allow cancellation from WAITING_RETRY', () => {
      sm.claim();
      sm.ready();
      sm.fail({ message: 'Timeout', retryable: true });
      sm.cancel('User requested');
      expect(sm.currentState).toBe('CANCELLED');
    });
  });

  describe('invalid transitions', () => {
    it('should throw on invalid transition from PENDING', () => {
      expect(() => sm.ready()).toThrow(InvalidTransitionError);
      expect(() => sm.complete({ exitCode: 0 })).toThrow(InvalidTransitionError);
    });

    it('should throw on invalid transition from RUNNING', () => {
      sm.claim();
      sm.ready();
      expect(() => sm.claim()).toThrow(InvalidTransitionError);
      expect(() => sm.cancel()).toThrow(InvalidTransitionError);
    });

    it('should throw on transition from terminal state', () => {
      sm.claim();
      sm.ready();
      sm.complete({ exitCode: 0 });
      expect(() => sm.claim()).toThrow(InvalidTransitionError);
      expect(() => sm.fail({ message: 'Error', retryable: true })).toThrow(InvalidTransitionError);
    });

    it('should include helpful error message', () => {
      try {
        sm.ready();
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidTransitionError);
        const err = e as InvalidTransitionError;
        expect(err.workOrderId).toBe('test-123');
        expect(err.fromState).toBe('PENDING');
        expect(err.event).toBe('READY');
        expect(err.validEvents).toContain('CLAIM');
        expect(err.validEvents).toContain('CANCEL');
      }
    });
  });

  describe('event emission', () => {
    it('should emit state-changed on transition', () => {
      const handler = vi.fn();
      sm.on('state-changed', handler);

      sm.claim();

      expect(handler).toHaveBeenCalledTimes(1);
      const transition = handler.mock.calls[0][0];
      expect(transition.fromState).toBe('PENDING');
      expect(transition.toState).toBe('PREPARING');
      expect(transition.event).toBe('CLAIM');
    });

    it('should emit terminal-reached on terminal state', () => {
      const handler = vi.fn();
      sm.on('terminal-reached', handler);

      sm.claim();
      sm.ready();
      sm.complete({ exitCode: 0 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('COMPLETED', 'test-123');
    });
  });

  describe('history tracking', () => {
    it('should record all transitions', () => {
      sm.claim();
      sm.ready();
      sm.complete({ exitCode: 0, output: 'Success' });

      expect(sm.history).toHaveLength(3);
      expect(sm.history[0].event).toBe('CLAIM');
      expect(sm.history[1].event).toBe('READY');
      expect(sm.history[2].event).toBe('COMPLETE');
      expect(sm.history[2].metadata).toEqual({ exitCode: 0, output: 'Success' });
    });

    it('should include timestamps', () => {
      const before = new Date();
      sm.claim();
      const after = new Date();

      expect(sm.history[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(sm.history[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('utility methods', () => {
    it('should report valid events', () => {
      expect(sm.getValidEvents()).toEqual(['CLAIM', 'CANCEL']);

      sm.claim();
      expect(sm.getValidEvents()).toEqual(['READY', 'FAIL']);
    });

    it('should check transition validity', () => {
      expect(sm.canTransition('CLAIM')).toBe(true);
      expect(sm.canTransition('READY')).toBe(false);

      sm.claim();
      expect(sm.canTransition('CLAIM')).toBe(false);
      expect(sm.canTransition('READY')).toBe(true);
    });
  });
});
