/**
 * Retry Policy Engine (v0.2.19 - Thrust 5)
 *
 * Provides configurable retry logic for transient failures, preventing
 * network blips and temporary issues from causing terminal run failures.
 */

import { BuildErrorType } from '../types/build-error.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('retry-policy');

/**
 * Configuration for retry behavior.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts (0 = no retries) */
  maxRetries: number;

  /** Initial backoff delay in milliseconds */
  backoffMs: number;

  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;

  /** Maximum backoff delay in milliseconds */
  maxBackoffMs: number;

  /** Error types that are retryable */
  retryableErrors: BuildErrorType[];

  /** Whether to retry on timeout */
  retryOnTimeout: boolean;

  /** Whether to add jitter to backoff (0-25% of backoff value) */
  jitter: boolean;
}

/**
 * Result of evaluating whether to retry.
 */
export interface RetryEvaluation {
  /** Whether the operation should be retried */
  shouldRetry: boolean;

  /** Delay in milliseconds before retry (0 if shouldRetry is false) */
  delayMs: number;

  /** Human-readable reason for the decision */
  reason: string;
}

/**
 * Record of a single retry attempt.
 */
export interface RetryAttempt<T> {
  /** Attempt number (0 = first attempt, 1 = first retry, etc.) */
  attempt: number;

  /** Whether this attempt succeeded */
  success: boolean;

  /** Result if successful, null otherwise */
  result: T | null;

  /** Error if failed, null otherwise */
  error: Error | null;

  /** Duration of this attempt in milliseconds */
  durationMs: number;

  /** Whether another retry will be attempted */
  willRetry: boolean;

  /** Delay until next retry in milliseconds (null if no retry) */
  nextRetryMs: number | null;
}

/**
 * Summary of all retry attempts for an operation.
 */
export interface RetryResult<T> {
  /** Whether the operation eventually succeeded */
  success: boolean;

  /** Final result if successful, null otherwise */
  result: T | null;

  /** Final error if all retries exhausted, null otherwise */
  finalError: Error | null;

  /** All attempt records */
  attempts: RetryAttempt<T>[];

  /** Total duration including all retries and delays */
  totalDurationMs: number;

  /** Number of retries performed (0 if succeeded on first try) */
  retriedCount: number;
}

/**
 * Default retry policy - conservative settings for production.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  backoffMs: 5000,
  backoffMultiplier: 2,
  maxBackoffMs: 30000,
  retryableErrors: [
    BuildErrorType.AGENT_TIMEOUT,
    BuildErrorType.SYSTEM_ERROR,
    BuildErrorType.GITHUB_ERROR,
  ],
  retryOnTimeout: true,
  jitter: true,
};

/**
 * Aggressive retry policy - for critical operations that must succeed.
 */
export const AGGRESSIVE_RETRY_POLICY: RetryPolicy = {
  maxRetries: 5,
  backoffMs: 1000,
  backoffMultiplier: 1.5,
  maxBackoffMs: 60000,
  retryableErrors: [
    BuildErrorType.AGENT_TIMEOUT,
    BuildErrorType.AGENT_CRASH,
    BuildErrorType.SYSTEM_ERROR,
    BuildErrorType.GITHUB_ERROR,
    BuildErrorType.WORKSPACE_ERROR,
  ],
  retryOnTimeout: true,
  jitter: true,
};

/**
 * No retry policy - for deterministic testing or when retries are undesirable.
 */
export const NO_RETRY_POLICY: RetryPolicy = {
  maxRetries: 0,
  backoffMs: 0,
  backoffMultiplier: 0,
  maxBackoffMs: 0,
  retryableErrors: [],
  retryOnTimeout: false,
  jitter: false,
};

/**
 * RetryPolicyEngine - Executes operations with configurable retry logic.
 *
 * Features:
 * - Exponential backoff with optional jitter
 * - Configurable error type filtering
 * - Detailed attempt tracking
 * - Customizable evaluation hooks
 */
export class RetryPolicyEngine {
  private policy: RetryPolicy;

  constructor(policy: RetryPolicy = DEFAULT_RETRY_POLICY) {
    this.policy = policy;
  }

  /**
   * Get the current policy configuration.
   */
  getPolicy(): RetryPolicy {
    return { ...this.policy };
  }

  /**
   * Evaluate whether an error should trigger a retry.
   *
   * @param error - The error that occurred
   * @param attemptCount - Number of attempts already made (0 = first attempt failed)
   * @param options - Optional customization hooks
   * @returns Evaluation result with shouldRetry, delayMs, and reason
   */
  evaluateRetry(
    error: Error,
    attemptCount: number,
    options?: {
      /** Extract BuildErrorType from the error */
      extractErrorType?: (error: Error) => BuildErrorType;
      /** Custom check for retryability */
      isRetryable?: (error: Error) => boolean;
    }
  ): RetryEvaluation {
    // Check if we've exhausted retries
    if (attemptCount >= this.policy.maxRetries) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: `Max retries (${this.policy.maxRetries}) exhausted`,
      };
    }

    // Extract error type
    const errorType = options?.extractErrorType?.(error) ?? BuildErrorType.UNKNOWN;

    // Check if error is retryable
    const isRetryable = this.isRetryable(errorType, options?.isRetryable);
    if (!isRetryable) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: `Error type '${errorType}' is not retryable`,
      };
    }

    // Calculate backoff delay
    const delayMs = this.calculateBackoff(attemptCount);

    return {
      shouldRetry: true,
      delayMs,
      reason: `Retrying after ${delayMs}ms (attempt ${attemptCount + 1}/${this.policy.maxRetries})`,
    };
  }

  /**
   * Execute an operation with retry logic.
   *
   * @param operation - Async function to execute
   * @param options - Optional callbacks and customization
   * @returns RetryResult with success status, result/error, and attempt history
   */
  async execute<T>(
    operation: () => Promise<T>,
    options?: {
      /** Called after each attempt (success or failure) */
      onAttempt?: (attempt: RetryAttempt<T>) => void;
      /** Custom check for retryability */
      isRetryable?: (error: Error) => boolean;
      /** Extract BuildErrorType from the error */
      extractErrorType?: (error: Error) => BuildErrorType;
    }
  ): Promise<RetryResult<T>> {
    const attempts: RetryAttempt<T>[] = [];
    const startTime = Date.now();
    let lastError: Error | null = null;

    // maxRetries + 1 because first attempt is not a retry
    const maxAttempts = this.policy.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const attemptStart = Date.now();

      try {
        const result = await operation();

        const attemptRecord: RetryAttempt<T> = {
          attempt,
          success: true,
          result,
          error: null,
          durationMs: Date.now() - attemptStart,
          willRetry: false,
          nextRetryMs: null,
        };
        attempts.push(attemptRecord);
        options?.onAttempt?.(attemptRecord);

        return {
          success: true,
          result,
          finalError: null,
          attempts,
          totalDurationMs: Date.now() - startTime,
          retriedCount: attempt,
        };
      } catch (error) {
        lastError = error as Error;

        const evaluationOpts: {
          extractErrorType?: (error: Error) => BuildErrorType;
          isRetryable?: (error: Error) => boolean;
        } = {};
        if (options?.extractErrorType) {
          evaluationOpts.extractErrorType = options.extractErrorType;
        }
        if (options?.isRetryable) {
          evaluationOpts.isRetryable = options.isRetryable;
        }
        const evaluation = this.evaluateRetry(lastError, attempt, evaluationOpts);

        const attemptRecord: RetryAttempt<T> = {
          attempt,
          success: false,
          result: null,
          error: lastError,
          durationMs: Date.now() - attemptStart,
          willRetry: evaluation.shouldRetry,
          nextRetryMs: evaluation.shouldRetry ? evaluation.delayMs : null,
        };
        attempts.push(attemptRecord);
        options?.onAttempt?.(attemptRecord);

        if (evaluation.shouldRetry) {
          log.info(
            { attempt, nextRetryMs: evaluation.delayMs, reason: evaluation.reason },
            'Retrying operation'
          );
          await this.sleep(evaluation.delayMs);
        } else {
          log.warn({ attempt, reason: evaluation.reason }, 'No more retries, failing');
          break; // Exit loop when retry is not allowed
        }
      }
    }

    return {
      success: false,
      result: null,
      finalError: lastError,
      attempts,
      totalDurationMs: Date.now() - startTime,
      retriedCount: attempts.length - 1,
    };
  }

  /**
   * Check if an error type is retryable according to the policy.
   */
  isRetryable(
    errorType: BuildErrorType,
    customCheck?: (error: Error) => boolean
  ): boolean {
    // Check explicit retryable errors list
    if (this.policy.retryableErrors.includes(errorType)) {
      return true;
    }

    // Special handling for timeout
    if (errorType === BuildErrorType.AGENT_TIMEOUT && this.policy.retryOnTimeout) {
      return true;
    }

    return false;
  }

  /**
   * Calculate backoff delay for a given attempt number.
   *
   * Uses exponential backoff with optional jitter.
   *
   * @param attemptNumber - The attempt number (0 = first retry)
   * @returns Delay in milliseconds
   */
  calculateBackoff(attemptNumber: number): number {
    // Base exponential backoff: initialDelay * multiplier^attempt
    const base = this.policy.backoffMs * Math.pow(this.policy.backoffMultiplier, attemptNumber);

    // Cap at maximum
    const capped = Math.min(base, this.policy.maxBackoffMs);

    // Add jitter if enabled (0-25% of capped value)
    if (this.policy.jitter) {
      const jitter = capped * 0.25 * Math.random();
      return Math.round(capped + jitter);
    }

    return Math.round(capped);
  }

  /**
   * Sleep for a specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a RetryPolicyEngine with custom policy.
 *
 * @param policy - Partial policy to merge with defaults
 * @returns Configured RetryPolicyEngine
 */
export function createRetryPolicyEngine(policy?: Partial<RetryPolicy>): RetryPolicyEngine {
  return new RetryPolicyEngine({
    ...DEFAULT_RETRY_POLICY,
    ...policy,
  });
}

/**
 * Default singleton instance for convenience.
 */
export const retryPolicyEngine = new RetryPolicyEngine();
