# 05 - Thrust: Retry Manager

## Objective

Implement a retry manager that:
- Handles transient failures with exponential backoff
- Respects per-work-order retry limits
- Distinguishes retryable from fatal errors
- Provides visibility into retry state
- Integrates with scheduler for re-queuing

## Current State Analysis

### Existing Implementation
```typescript
// Current: No retry logic
// Failed work orders stay in 'failed' state forever
// Manual intervention required to re-submit
```

### Target Implementation
```typescript
// New: Automatic retry with backoff
retryManager.scheduleRetry(workOrder);
// → Calculates delay based on retry count
// → Schedules timer
// → Re-enqueues to scheduler when timer fires
```

## Subtasks

### Subtask 5.1: Define Retry Policy Types

**Files Modified:**
- `packages/server/src/queue/types.ts` (add to existing)

```typescript
/**
 * Retry policy configuration.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxRetries: number;

  /** Base delay in milliseconds before first retry */
  baseDelayMs: number;

  /** Maximum delay cap in milliseconds */
  maxDelayMs: number;

  /** Multiplier for exponential backoff (e.g., 2 = double each retry) */
  backoffMultiplier: number;

  /** Optional jitter factor (0-1) to add randomness */
  jitterFactor: number;
}

/**
 * Default retry policy.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 5000,      // 5 seconds
  maxDelayMs: 300000,     // 5 minutes
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Retry state for a work order.
 */
export interface RetryState {
  workOrderId: string;
  attemptNumber: number;
  nextRetryAt: Date | null;
  lastError: string;
  scheduledTimerId: NodeJS.Timeout | null;
}
```

**Verification:**
- [ ] Types are complete
- [ ] Default policy is reasonable

---

### Subtask 5.2: Implement RetryManager

**Files Created:**
- `packages/server/src/queue/retry-manager.ts`

```typescript
import { EventEmitter } from 'events';
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import type { RetryPolicy, RetryState } from './types.js';
import { DEFAULT_RETRY_POLICY } from './types.js';
import type { WorkOrderStateMachine } from './state-machine.js';

/**
 * Events emitted by RetryManager.
 */
export interface RetryManagerEvents {
  'retry-scheduled': (workOrderId: string, delay: number, attemptNumber: number) => void;
  'retry-triggered': (workOrderId: string, attemptNumber: number) => void;
  'retry-exhausted': (workOrderId: string, attempts: number) => void;
  'retry-cancelled': (workOrderId: string) => void;
}

/**
 * Callback when a retry should be executed.
 */
export type RetryCallback = (workOrderId: string) => void;

/**
 * Manages retry logic with exponential backoff.
 */
export class RetryManager extends EventEmitter {
  private readonly logger: Logger;
  private readonly policy: RetryPolicy;
  private readonly retryStates: Map<string, RetryState> = new Map();
  private retryCallback: RetryCallback | null = null;

  constructor(policy: Partial<RetryPolicy> = {}) {
    super();
    this.policy = { ...DEFAULT_RETRY_POLICY, ...policy };
    this.logger = createLogger('retry-manager');

    this.logger.info(
      { policy: this.policy },
      'RetryManager initialized'
    );
  }

  /**
   * Set the callback to invoke when a retry should happen.
   */
  setRetryCallback(callback: RetryCallback): void {
    this.retryCallback = callback;
  }

  /**
   * Check if a work order should be retried.
   */
  shouldRetry(stateMachine: WorkOrderStateMachine, retryable: boolean): boolean {
    if (!retryable) {
      this.logger.debug(
        { workOrderId: stateMachine.config.workOrderId },
        'Error is not retryable'
      );
      return false;
    }

    const attempts = stateMachine.retryCount;
    if (attempts >= this.policy.maxRetries) {
      this.logger.info(
        { workOrderId: stateMachine.config.workOrderId, attempts, maxRetries: this.policy.maxRetries },
        'Max retries exceeded'
      );
      return false;
    }

    return true;
  }

  /**
   * Calculate delay for next retry using exponential backoff with jitter.
   */
  calculateDelay(attemptNumber: number): number {
    // Exponential backoff: baseDelay * (multiplier ^ attempt)
    const exponentialDelay = this.policy.baseDelayMs *
      Math.pow(this.policy.backoffMultiplier, attemptNumber);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.policy.maxDelayMs);

    // Add jitter
    const jitter = cappedDelay * this.policy.jitterFactor * Math.random();
    const finalDelay = Math.floor(cappedDelay + jitter);

    this.logger.debug(
      { attemptNumber, baseDelay: this.policy.baseDelayMs, exponentialDelay, cappedDelay, jitter, finalDelay },
      'Calculated retry delay'
    );

    return finalDelay;
  }

  /**
   * Schedule a retry for a work order.
   */
  scheduleRetry(
    workOrderId: string,
    stateMachine: WorkOrderStateMachine,
    errorMessage: string
  ): void {
    const attemptNumber = stateMachine.retryCount;
    const delay = this.calculateDelay(attemptNumber);
    const nextRetryAt = new Date(Date.now() + delay);

    // Cancel any existing scheduled retry
    this.cancelRetry(workOrderId);

    // Schedule the retry
    const timerId = setTimeout(() => {
      this.executeRetry(workOrderId, stateMachine);
    }, delay);

    // Store retry state
    const state: RetryState = {
      workOrderId,
      attemptNumber: attemptNumber + 1,
      nextRetryAt,
      lastError: errorMessage,
      scheduledTimerId: timerId,
    };

    this.retryStates.set(workOrderId, state);

    this.logger.info(
      { workOrderId, attemptNumber: state.attemptNumber, delay, nextRetryAt },
      'Retry scheduled'
    );

    this.emit('retry-scheduled', workOrderId, delay, state.attemptNumber);
  }

  /**
   * Execute a scheduled retry.
   */
  private executeRetry(workOrderId: string, stateMachine: WorkOrderStateMachine): void {
    const state = this.retryStates.get(workOrderId);
    if (!state) {
      this.logger.warn(
        { workOrderId },
        'Retry state not found, may have been cancelled'
      );
      return;
    }

    this.logger.info(
      { workOrderId, attemptNumber: state.attemptNumber },
      'Executing retry'
    );

    // Clear scheduled state
    state.scheduledTimerId = null;
    this.retryStates.delete(workOrderId);

    // Transition state machine
    try {
      stateMachine.retry();
    } catch (err) {
      this.logger.error(
        { workOrderId, err },
        'Failed to transition to retry state'
      );
      return;
    }

    // Emit event
    this.emit('retry-triggered', workOrderId, state.attemptNumber);

    // Invoke callback to re-enqueue
    if (this.retryCallback) {
      this.retryCallback(workOrderId);
    } else {
      this.logger.warn(
        { workOrderId },
        'No retry callback set'
      );
    }
  }

  /**
   * Cancel a scheduled retry.
   */
  cancelRetry(workOrderId: string): boolean {
    const state = this.retryStates.get(workOrderId);
    if (!state) {
      return false;
    }

    if (state.scheduledTimerId) {
      clearTimeout(state.scheduledTimerId);
    }

    this.retryStates.delete(workOrderId);

    this.logger.info(
      { workOrderId },
      'Retry cancelled'
    );

    this.emit('retry-cancelled', workOrderId);
    return true;
  }

  /**
   * Cancel all scheduled retries.
   */
  cancelAll(): void {
    for (const [workOrderId, state] of this.retryStates) {
      if (state.scheduledTimerId) {
        clearTimeout(state.scheduledTimerId);
      }
      this.emit('retry-cancelled', workOrderId);
    }

    this.retryStates.clear();

    this.logger.info('All retries cancelled');
  }

  /**
   * Get retry state for a work order.
   */
  getRetryState(workOrderId: string): RetryState | undefined {
    return this.retryStates.get(workOrderId);
  }

  /**
   * Get all pending retries.
   */
  getPendingRetries(): RetryState[] {
    return Array.from(this.retryStates.values());
  }

  /**
   * Get retry statistics.
   */
  getStats(): {
    pendingCount: number;
    policy: RetryPolicy;
  } {
    return {
      pendingCount: this.retryStates.size,
      policy: this.policy,
    };
  }
}
```

**Verification:**
- [ ] Exponential backoff calculates correctly
- [ ] Jitter adds randomness
- [ ] Max delay is respected
- [ ] Timer is properly cancelled on cancel

---

### Subtask 5.3: Write Unit Tests

**Files Created:**
- `packages/server/test/unit/queue/retry-manager.test.ts`

```typescript
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
      expect(retryManager.shouldRetry(sm, true)).toBe(true);
    });

    it('should return false for non-retryable error', () => {
      const sm = new WorkOrderStateMachine({
        workOrderId: 'test',
        maxRetries: 3,
      });
      expect(retryManager.shouldRetry(sm, false)).toBe(false);
    });

    it('should return false when max retries exceeded', () => {
      const sm = new WorkOrderStateMachine({
        workOrderId: 'test',
        maxRetries: 1,
      });
      // Simulate one retry
      sm.claim();
      sm.ready();
      sm.fail({ message: 'Error', retryable: true });
      sm.retry();
      sm.claim();
      sm.ready();
      sm.fail({ message: 'Error', retryable: true });

      expect(retryManager.shouldRetry(sm, true)).toBe(false);
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
});
```

**Verification:**
- [ ] All tests pass
- [ ] Backoff calculation is correct
- [ ] Timers are properly managed
- [ ] State transitions work correctly

---

## Files Created/Modified Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/queue/types.ts` | Modify | Add retry policy types |
| `packages/server/src/queue/retry-manager.ts` | Create | RetryManager implementation |
| `packages/server/test/unit/queue/retry-manager.test.ts` | Create | Unit tests |

## Verification Steps

1. **Unit Tests**
   ```bash
   npm run test -- --filter retry-manager
   ```

2. **Manual Verification**
   ```typescript
   const retryManager = new RetryManager({
     baseDelayMs: 1000,
     backoffMultiplier: 2,
   });

   // Verify backoff delays
   console.log(retryManager.calculateDelay(0)); // ~1000ms
   console.log(retryManager.calculateDelay(1)); // ~2000ms
   console.log(retryManager.calculateDelay(2)); // ~4000ms
   ```

## Dependencies

- Thrust 02 (State Machine)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Timer accumulation | Medium | cancelAll on shutdown |
| Retry storms | Medium | Max delay cap, jitter |
| Lost retry state on crash | Low | Log scheduled retries for recovery |
