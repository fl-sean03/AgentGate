import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryManager } from '../../../src/queue/retry-manager.js';
import { WorkOrderStateMachine } from '../../../src/queue/state-machine.js';

describe('RetryManager', () => {
  let retryManager: RetryManager;

  beforeEach(() => {
    vi.useFakeTimers();
    retryManager = new RetryManager({
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      jitterFactor: 0,  // No jitter for predictable tests
    });
  });

  afterEach(() => {
    retryManager.cancelAll();
    vi.useRealTimers();
  });

  function createStateMachine(id: string): WorkOrderStateMachine {
    const sm = new WorkOrderStateMachine({
      workOrderId: id,
      maxRetries: 3,
    });
    // Transition to a state where retry is valid
    sm.claim();
    sm.ready();
    sm.fail({ message: 'Test error', retryable: true });
    return sm;
  }

  describe('shouldRetry', () => {
    it('should return true for retryable error within limit', () => {
      const sm = new WorkOrderStateMachine({
        workOrderId: 'test',
        maxRetries: 3,
      });
      expect(retryManager.shouldRetry('test', sm, true)).toBe(true);
    });

    it('should return false for non-retryable error', () => {
      const sm = new WorkOrderStateMachine({
        workOrderId: 'test',
        maxRetries: 3,
      });
      expect(retryManager.shouldRetry('test', sm, false)).toBe(false);
    });

    it('should return false when max retries exceeded', () => {
      const sm = new WorkOrderStateMachine({
        workOrderId: 'test',
        maxRetries: 3,
      });
      // Simulate reaching max retries (3)
      // First retry
      sm.claim();
      sm.ready();
      sm.fail({ message: 'Error', retryable: true });
      sm.retry();
      // Second retry
      sm.claim();
      sm.ready();
      sm.fail({ message: 'Error', retryable: true });
      sm.retry();
      // Third retry
      sm.claim();
      sm.ready();
      sm.fail({ message: 'Error', retryable: true });
      sm.retry();

      // Now retryCount is 3, which equals maxRetries (3)
      expect(retryManager.shouldRetry('test', sm, true)).toBe(false);
    });
  });

  describe('calculateDelay', () => {
    it('should calculate exponential backoff', () => {
      expect(retryManager.calculateDelay(0)).toBe(1000);   // 1000 * 2^0 = 1000
      expect(retryManager.calculateDelay(1)).toBe(2000);   // 1000 * 2^1 = 2000
      expect(retryManager.calculateDelay(2)).toBe(4000);   // 1000 * 2^2 = 4000
      expect(retryManager.calculateDelay(3)).toBe(8000);   // 1000 * 2^3 = 8000
    });

    it('should cap at max delay', () => {
      expect(retryManager.calculateDelay(10)).toBe(10000); // Capped
    });
  });

  describe('scheduleRetry', () => {
    it('should schedule retry with correct delay', () => {
      const sm = createStateMachine('test');
      const scheduled = vi.fn();
      retryManager.on('retry-scheduled', scheduled);

      retryManager.scheduleRetry('test', sm, 'Test error');

      expect(scheduled).toHaveBeenCalledWith('test', 1000, 1);
      expect(retryManager.getRetryState('test')).toBeDefined();
    });

    it('should trigger retry callback after delay', () => {
      const sm = createStateMachine('test');
      const callback = vi.fn();
      retryManager.setRetryCallback(callback);

      retryManager.scheduleRetry('test', sm, 'Test error');

      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalledWith('test');
    });

    it('should transition state machine on retry', () => {
      const sm = createStateMachine('test');
      retryManager.setRetryCallback(() => {});

      retryManager.scheduleRetry('test', sm, 'Test error');
      vi.advanceTimersByTime(1000);

      expect(sm.currentState).toBe('PENDING');
      expect(sm.retryCount).toBe(1);
    });
  });

  describe('cancelRetry', () => {
    it('should cancel scheduled retry', () => {
      const sm = createStateMachine('test');
      const callback = vi.fn();
      retryManager.setRetryCallback(callback);

      retryManager.scheduleRetry('test', sm, 'Test error');
      retryManager.cancelRetry('test');

      vi.advanceTimersByTime(1000);

      expect(callback).not.toHaveBeenCalled();
      expect(retryManager.getRetryState('test')).toBeUndefined();
    });

    it('should emit cancelled event', () => {
      const sm = createStateMachine('test');
      const cancelled = vi.fn();
      retryManager.on('retry-cancelled', cancelled);

      retryManager.scheduleRetry('test', sm, 'Test error');
      retryManager.cancelRetry('test');

      expect(cancelled).toHaveBeenCalledWith('test');
    });
  });

  describe('cancelAll', () => {
    it('should cancel all scheduled retries', () => {
      const sm1 = createStateMachine('test1');
      const sm2 = createStateMachine('test2');
      const callback = vi.fn();
      retryManager.setRetryCallback(callback);

      retryManager.scheduleRetry('test1', sm1, 'Error');
      retryManager.scheduleRetry('test2', sm2, 'Error');
      retryManager.cancelAll();

      vi.advanceTimersByTime(10000);

      expect(callback).not.toHaveBeenCalled();
      expect(retryManager.getPendingRetries()).toHaveLength(0);
    });
  });

  describe('jitter', () => {
    it('should add randomness when jitter factor is set', () => {
      const jitterManager = new RetryManager({
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        jitterFactor: 0.5,
      });

      // With jitter, delays should vary
      const delays = new Set<number>();
      for (let i = 0; i < 10; i++) {
        delays.add(jitterManager.calculateDelay(0));
      }

      // With 50% jitter, delays should be between 1000 and 1500
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(1000);
        expect(delay).toBeLessThanOrEqual(1500);
      }
    });
  });

  describe('getStats', () => {
    it('should return stats with pending count and policy', () => {
      const sm = createStateMachine('test');
      retryManager.scheduleRetry('test', sm, 'Error');

      const stats = retryManager.getStats();

      expect(stats.pendingCount).toBe(1);
      expect(stats.policy.maxRetries).toBe(3);
      expect(stats.policy.baseDelayMs).toBe(1000);
    });
  });

  describe('getPendingRetries', () => {
    it('should return all pending retry states', () => {
      const sm1 = createStateMachine('test1');
      const sm2 = createStateMachine('test2');

      retryManager.scheduleRetry('test1', sm1, 'Error 1');
      retryManager.scheduleRetry('test2', sm2, 'Error 2');

      const pending = retryManager.getPendingRetries();

      expect(pending).toHaveLength(2);
      expect(pending.map(p => p.workOrderId).sort()).toEqual(['test1', 'test2']);
    });
  });

  describe('event emission', () => {
    it('should emit retry-triggered when retry executes', () => {
      const sm = createStateMachine('test');
      const triggered = vi.fn();
      retryManager.on('retry-triggered', triggered);
      retryManager.setRetryCallback(() => {});

      retryManager.scheduleRetry('test', sm, 'Error');
      vi.advanceTimersByTime(1000);

      expect(triggered).toHaveBeenCalledWith('test', 1);
    });

    it('should emit retry-cancelled for each cancelled retry in cancelAll', () => {
      const sm1 = createStateMachine('test1');
      const sm2 = createStateMachine('test2');
      const cancelled = vi.fn();
      retryManager.on('retry-cancelled', cancelled);

      retryManager.scheduleRetry('test1', sm1, 'Error');
      retryManager.scheduleRetry('test2', sm2, 'Error');
      retryManager.cancelAll();

      expect(cancelled).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle scheduling same work order twice (cancels first)', () => {
      const sm = createStateMachine('test');
      const scheduled = vi.fn();
      const cancelled = vi.fn();
      retryManager.on('retry-scheduled', scheduled);
      retryManager.on('retry-cancelled', cancelled);

      retryManager.scheduleRetry('test', sm, 'Error 1');
      retryManager.scheduleRetry('test', sm, 'Error 2');

      expect(scheduled).toHaveBeenCalledTimes(2);
      expect(cancelled).toHaveBeenCalledTimes(1);
      expect(retryManager.getPendingRetries()).toHaveLength(1);
      expect(retryManager.getRetryState('test')?.lastError).toBe('Error 2');
    });

    it('should handle cancelRetry for non-existent work order', () => {
      const result = retryManager.cancelRetry('non-existent');
      expect(result).toBe(false);
    });

    it('should handle retry without callback set', () => {
      const sm = createStateMachine('test');

      // No callback set - should not throw
      retryManager.scheduleRetry('test', sm, 'Error');
      vi.advanceTimersByTime(1000);

      // State machine should still transition
      expect(sm.currentState).toBe('PENDING');
    });
  });
});
