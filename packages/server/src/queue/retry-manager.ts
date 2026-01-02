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
  shouldRetry(workOrderId: string, stateMachine: WorkOrderStateMachine, retryable: boolean): boolean {
    if (!retryable) {
      this.logger.debug(
        { workOrderId },
        'Error is not retryable'
      );
      return false;
    }

    const attempts = stateMachine.retryCount;
    if (attempts >= this.policy.maxRetries) {
      this.logger.info(
        { workOrderId, attempts, maxRetries: this.policy.maxRetries },
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
