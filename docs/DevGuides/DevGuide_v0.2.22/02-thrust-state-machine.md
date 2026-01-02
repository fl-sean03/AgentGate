# 02 - Thrust: Work Order State Machine

## Objective

Implement an explicit, event-sourced state machine for work order lifecycle management that:
- Enforces valid state transitions at compile-time and runtime
- Maintains complete audit trail of all transitions
- Emits events for other components to react to
- Provides clear error messages for invalid transitions

## Current State Analysis

### Existing Implementation
```typescript
// Current: Implicit string-based status
workOrder.status = 'running';  // No validation!

// Problems:
// 1. Any string can be assigned
// 2. Invalid transitions are silently allowed
// 3. No history of transitions
// 4. No events emitted
```

### Target Implementation
```typescript
// New: Explicit state machine
workOrder.stateMachine.claim();  // PENDING → PREPARING
// Throws if invalid transition
// Logs transition with timestamp
// Emits 'state-changed' event
```

## Subtasks

### Subtask 2.1: Define State Types and Transitions

Create the type definitions for all valid states and transitions.

**Files Created:**
- `packages/server/src/queue/types.ts`

```typescript
/**
 * All possible work order states.
 */
export type WorkOrderState =
  | 'PENDING'       // Submitted, waiting in queue
  | 'PREPARING'     // Scheduler claimed it, setting up execution
  | 'RUNNING'       // Actively executing in sandbox
  | 'COMPLETED'     // Finished successfully
  | 'FAILED'        // Failed after max retries or fatal error
  | 'WAITING_RETRY' // Failed, waiting for retry delay
  | 'CANCELLED';    // Cancelled by user

/**
 * Events that trigger state transitions.
 */
export type StateEvent =
  | 'SUBMIT'    // → PENDING
  | 'CLAIM'     // PENDING → PREPARING
  | 'READY'     // PREPARING → RUNNING
  | 'COMPLETE'  // RUNNING → COMPLETED
  | 'FAIL'      // RUNNING → WAITING_RETRY | FAILED
  | 'RETRY'     // WAITING_RETRY → PENDING
  | 'CANCEL';   // PENDING → CANCELLED

/**
 * Valid state transitions map.
 * Key: current state, Value: map of event → next state
 */
export const STATE_TRANSITIONS: Record<WorkOrderState, Partial<Record<StateEvent, WorkOrderState>>> = {
  PENDING: {
    CLAIM: 'PREPARING',
    CANCEL: 'CANCELLED',
  },
  PREPARING: {
    READY: 'RUNNING',
    FAIL: 'WAITING_RETRY',  // Preparation failure
  },
  RUNNING: {
    COMPLETE: 'COMPLETED',
    FAIL: 'WAITING_RETRY',  // Will check retries in fail handler
  },
  COMPLETED: {},  // Terminal state
  FAILED: {},     // Terminal state
  WAITING_RETRY: {
    RETRY: 'PENDING',
    CANCEL: 'CANCELLED',
  },
  CANCELLED: {},  // Terminal state
};

/**
 * Terminal states (no further transitions possible).
 */
export const TERMINAL_STATES: WorkOrderState[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

/**
 * Record of a state transition for audit trail.
 */
export interface StateTransition {
  readonly id: string;
  readonly workOrderId: string;
  readonly fromState: WorkOrderState;
  readonly toState: WorkOrderState;
  readonly event: StateEvent;
  readonly timestamp: Date;
  readonly metadata?: Record<string, unknown>;
}
```

**Verification:**
- [ ] All states are accounted for
- [ ] All valid transitions are defined
- [ ] Terminal states have no outgoing transitions
- [ ] TypeScript compilation succeeds

---

### Subtask 2.2: Implement StateMachine Class

Create the state machine with transition validation and event emission.

**Files Created:**
- `packages/server/src/queue/state-machine.ts`

```typescript
import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import {
  WorkOrderState,
  StateEvent,
  StateTransition,
  STATE_TRANSITIONS,
  TERMINAL_STATES,
} from './types.js';

/**
 * Configuration for state machine behavior.
 */
export interface StateMachineConfig {
  maxRetries: number;
  workOrderId: string;
  initialState?: WorkOrderState;
}

/**
 * Error thrown when an invalid state transition is attempted.
 */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly workOrderId: string,
    public readonly fromState: WorkOrderState,
    public readonly event: StateEvent,
    public readonly validEvents: StateEvent[]
  ) {
    super(
      `Invalid transition: Cannot apply '${event}' to work order ${workOrderId} ` +
      `in state '${fromState}'. Valid events: [${validEvents.join(', ')}]`
    );
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Events emitted by the state machine.
 */
export interface StateMachineEvents {
  'state-changed': (transition: StateTransition) => void;
  'terminal-reached': (state: WorkOrderState, workOrderId: string) => void;
}

/**
 * Work order state machine with explicit transitions and audit trail.
 */
export class WorkOrderStateMachine extends EventEmitter {
  private readonly logger: Logger;
  private _currentState: WorkOrderState;
  private _retryCount: number = 0;
  private readonly _history: StateTransition[] = [];

  constructor(private readonly config: StateMachineConfig) {
    super();
    this.logger = createLogger(`state-machine:${config.workOrderId}`);
    this._currentState = config.initialState ?? 'PENDING';

    // Log initial state
    this.logger.info(
      { state: this._currentState },
      'State machine initialized'
    );
  }

  /**
   * Current state of the work order.
   */
  get currentState(): WorkOrderState {
    return this._currentState;
  }

  /**
   * Number of retry attempts so far.
   */
  get retryCount(): number {
    return this._retryCount;
  }

  /**
   * Complete transition history for audit.
   */
  get history(): readonly StateTransition[] {
    return this._history;
  }

  /**
   * Whether the state machine has reached a terminal state.
   */
  get isTerminal(): boolean {
    return TERMINAL_STATES.includes(this._currentState);
  }

  /**
   * Attempt to transition to a new state via an event.
   * Throws InvalidTransitionError if the transition is not valid.
   */
  transition(event: StateEvent, metadata?: Record<string, unknown>): WorkOrderState {
    const validTransitions = STATE_TRANSITIONS[this._currentState];
    const nextState = validTransitions[event];

    if (!nextState) {
      const validEvents = Object.keys(validTransitions) as StateEvent[];
      throw new InvalidTransitionError(
        this.config.workOrderId,
        this._currentState,
        event,
        validEvents
      );
    }

    const transition: StateTransition = {
      id: nanoid(),
      workOrderId: this.config.workOrderId,
      fromState: this._currentState,
      toState: nextState,
      event,
      timestamp: new Date(),
      metadata,
    };

    // Update state
    const previousState = this._currentState;
    this._currentState = nextState;
    this._history.push(transition);

    // Log transition
    this.logger.info(
      { from: previousState, to: nextState, event, metadata },
      'State transition'
    );

    // Emit event
    this.emit('state-changed', transition);

    // Check for terminal state
    if (this.isTerminal) {
      this.emit('terminal-reached', nextState, this.config.workOrderId);
    }

    return nextState;
  }

  /**
   * Convenience method: PENDING → PREPARING
   */
  claim(metadata?: Record<string, unknown>): void {
    this.transition('CLAIM', metadata);
  }

  /**
   * Convenience method: PREPARING → RUNNING
   */
  ready(metadata?: Record<string, unknown>): void {
    this.transition('READY', metadata);
  }

  /**
   * Convenience method: RUNNING → COMPLETED
   */
  complete(result: { exitCode: number; output?: string }): void {
    this.transition('COMPLETE', result);
  }

  /**
   * Handle failure - transitions to WAITING_RETRY or FAILED based on retry count.
   */
  fail(error: { message: string; retryable: boolean }): WorkOrderState {
    if (!error.retryable || this._retryCount >= this.config.maxRetries) {
      // Force transition to FAILED (override WAITING_RETRY)
      const transition: StateTransition = {
        id: nanoid(),
        workOrderId: this.config.workOrderId,
        fromState: this._currentState,
        toState: 'FAILED',
        event: 'FAIL',
        timestamp: new Date(),
        metadata: { error, retryCount: this._retryCount, maxRetries: this.config.maxRetries },
      };

      this._currentState = 'FAILED';
      this._history.push(transition);

      this.logger.error(
        { error, retryCount: this._retryCount, maxRetries: this.config.maxRetries },
        'Work order failed permanently'
      );

      this.emit('state-changed', transition);
      this.emit('terminal-reached', 'FAILED', this.config.workOrderId);

      return 'FAILED';
    }

    // Retryable failure
    this.transition('FAIL', { error, retryCount: this._retryCount });
    return this._currentState;
  }

  /**
   * Convenience method: WAITING_RETRY → PENDING
   */
  retry(): void {
    this._retryCount++;
    this.transition('RETRY', { retryCount: this._retryCount });
  }

  /**
   * Convenience method: PENDING | WAITING_RETRY → CANCELLED
   */
  cancel(reason?: string): void {
    this.transition('CANCEL', { reason });
  }

  /**
   * Check if a transition is valid without performing it.
   */
  canTransition(event: StateEvent): boolean {
    const validTransitions = STATE_TRANSITIONS[this._currentState];
    return event in validTransitions;
  }

  /**
   * Get list of valid events for current state.
   */
  getValidEvents(): StateEvent[] {
    return Object.keys(STATE_TRANSITIONS[this._currentState]) as StateEvent[];
  }

  /**
   * Get time spent in current state.
   */
  getTimeInCurrentState(): number {
    const lastTransition = this._history[this._history.length - 1];
    if (!lastTransition) {
      return 0;
    }
    return Date.now() - lastTransition.timestamp.getTime();
  }
}
```

**Verification:**
- [ ] All transition methods work correctly
- [ ] Invalid transitions throw InvalidTransitionError
- [ ] Events are emitted on transitions
- [ ] History is correctly maintained
- [ ] Terminal states are correctly identified

---

### Subtask 2.3: Write Unit Tests

Comprehensive tests for state machine behavior.

**Files Created:**
- `packages/server/test/unit/queue/state-machine.test.ts`

```typescript
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
```

**Verification:**
- [ ] All tests pass
- [ ] Coverage > 90% for state-machine.ts
- [ ] Edge cases covered (retries, cancellation, terminal states)

---

## Files Created/Modified Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/queue/types.ts` | Create | State types and transition map |
| `packages/server/src/queue/state-machine.ts` | Create | StateMachine implementation |
| `packages/server/test/unit/queue/state-machine.test.ts` | Create | Unit tests |

## Verification Steps

1. **Type Safety**
   ```bash
   npm run typecheck
   # Should pass with no errors
   ```

2. **Unit Tests**
   ```bash
   npm run test -- --filter state-machine
   # All tests should pass
   ```

3. **Manual Verification**
   ```typescript
   // In REPL or test file
   const sm = new WorkOrderStateMachine({ workOrderId: 'test', maxRetries: 3 });

   // Valid path
   sm.claim();        // PENDING → PREPARING
   sm.ready();        // PREPARING → RUNNING
   sm.complete({});   // RUNNING → COMPLETED
   console.log(sm.history);  // Should show 3 transitions

   // Invalid path (should throw)
   const sm2 = new WorkOrderStateMachine({ workOrderId: 'test2', maxRetries: 3 });
   sm2.ready();       // Should throw InvalidTransitionError
   ```

## Dependencies

- None (this is a foundation component)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| State machine becomes inconsistent | High | Immutable state, event sourcing |
| Events not handled | Medium | TypeScript strict event typing |
| Performance with large history | Low | Limit history size, archive old transitions |
