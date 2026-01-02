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
