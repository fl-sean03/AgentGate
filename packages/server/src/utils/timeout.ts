/**
 * Timeout utilities with AbortSignal-based cancellation.
 * Provides cooperative cancellation that propagates through the entire call chain.
 *
 * (v0.2.27 - Thrust 2: AbortSignal-Based Timeout System)
 */

import { createLogger } from './logger.js';

const log = createLogger('timeout');

/**
 * Custom error class for timeout errors.
 * Includes the original AbortSignal for context.
 */
export class TimeoutError extends Error {
  readonly code = 'ETIMEDOUT';
  readonly isTimeout = true;

  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly signal?: AbortSignal
  ) {
    super(message);
    this.name = 'TimeoutError';
    Error.captureStackTrace?.(this, TimeoutError);
  }
}

/**
 * Custom error class for abort errors.
 */
export class AbortError extends Error {
  readonly code = 'EABORTED';
  readonly isAborted = true;

  constructor(
    message: string = 'Operation was aborted',
    public readonly reason?: unknown
  ) {
    super(message);
    this.name = 'AbortError';
    Error.captureStackTrace?.(this, AbortError);
  }
}

/**
 * Result of createTimeout function.
 */
export interface TimeoutHandle {
  /** The AbortSignal that will be triggered on timeout */
  signal: AbortSignal;
  /** Cancel the timeout (prevents the signal from firing) */
  cancel: () => void;
  /** The AbortController (for advanced use) */
  controller: AbortController;
}

/**
 * Create a timeout with an AbortSignal.
 * The signal will be aborted after the specified time.
 *
 * @param ms - Timeout duration in milliseconds
 * @param reason - Optional reason for the abort
 * @returns TimeoutHandle with signal and cancel function
 *
 * @example
 * const { signal, cancel } = createTimeout(5000);
 * try {
 *   await fetchWithSignal(url, { signal });
 * } finally {
 *   cancel(); // Clean up the timeout
 * }
 */
export function createTimeout(ms: number, reason?: string): TimeoutHandle {
  const controller = new AbortController();
  const { signal } = controller;

  const timeoutId = setTimeout(() => {
    const message = reason || `Operation timed out after ${ms}ms`;
    controller.abort(new TimeoutError(message, ms, signal));
    log.debug({ timeoutMs: ms, reason }, 'Timeout triggered');
  }, ms);

  const cancel = (): void => {
    clearTimeout(timeoutId);
  };

  // Clean up timeout when signal is externally aborted
  signal.addEventListener('abort', () => {
    clearTimeout(timeoutId);
  }, { once: true });

  return { signal, cancel, controller };
}

/**
 * Wrap a promise with a timeout.
 * If the promise doesn't resolve within the specified time, it will be rejected
 * with a TimeoutError.
 *
 * @param promise - The promise to wrap
 * @param ms - Timeout duration in milliseconds
 * @param message - Optional custom error message
 * @returns The promise result or throws TimeoutError
 *
 * @example
 * const result = await withTimeout(
 *   longRunningOperation(),
 *   5000,
 *   'Operation took too long'
 * );
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string
): Promise<T> {
  const { signal, cancel } = createTimeout(ms, message);

  try {
    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => {
          const error = signal.reason instanceof TimeoutError
            ? signal.reason
            : new TimeoutError(message || `Operation timed out after ${ms}ms`, ms, signal);
          reject(error);
        }, { once: true });
      }),
    ]);

    return result;
  } finally {
    cancel();
  }
}

/**
 * Check if an AbortSignal has been aborted and throw if so.
 * Use this at safe points in long-running operations to enable cancellation.
 *
 * @param signal - The AbortSignal to check
 * @throws AbortError if the signal has been aborted
 *
 * @example
 * async function processItems(items: Item[], signal?: AbortSignal) {
 *   for (const item of items) {
 *     checkAborted(signal);
 *     await processItem(item);
 *   }
 * }
 */
export function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const reason = signal.reason;
    if (reason instanceof Error) {
      throw reason;
    }
    throw new AbortError(
      typeof reason === 'string' ? reason : 'Operation was aborted',
      reason
    );
  }
}

/**
 * Check if an error is a TimeoutError.
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError || (
    error instanceof Error &&
    'isTimeout' in error &&
    (error as TimeoutError).isTimeout === true
  );
}

/**
 * Check if an error is an AbortError.
 */
export function isAbortError(error: unknown): error is AbortError {
  return error instanceof AbortError || (
    error instanceof Error &&
    'isAborted' in error &&
    (error as AbortError).isAborted === true
  );
}

/**
 * Abortable sleep function.
 * Resolves after the specified time, or rejects if the signal is aborted.
 *
 * @param ms - Duration to sleep in milliseconds
 * @param signal - Optional AbortSignal for cancellation
 * @throws AbortError if the signal is aborted before the sleep completes
 *
 * @example
 * // Simple sleep
 * await sleep(1000);
 *
 * // Abortable sleep
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 500);
 * try {
 *   await sleep(1000, controller.signal);
 * } catch (err) {
 *   console.log('Sleep was aborted');
 * }
 */
export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already aborted
    if (signal?.aborted) {
      const reason = signal.reason;
      if (reason instanceof Error) {
        reject(reason);
      } else {
        reject(new AbortError(
          typeof reason === 'string' ? reason : 'Sleep was aborted',
          reason
        ));
      }
      return;
    }

    const timeoutId = setTimeout(() => {
      resolve();
    }, ms);

    if (signal) {
      const abortHandler = (): void => {
        clearTimeout(timeoutId);
        const reason = signal.reason;
        if (reason instanceof Error) {
          reject(reason);
        } else {
          reject(new AbortError(
            typeof reason === 'string' ? reason : 'Sleep was aborted',
            reason
          ));
        }
      };

      signal.addEventListener('abort', abortHandler, { once: true });

      // Clean up listener when sleep completes normally
      const originalResolve = resolve;
      resolve = () => {
        signal.removeEventListener('abort', abortHandler);
        originalResolve();
      };
    }
  });
}

/**
 * Link multiple AbortSignals together.
 * Returns a new AbortController that will be aborted if any of the input signals are aborted.
 *
 * @param signals - Array of AbortSignals to link
 * @returns A new AbortController linked to all input signals
 *
 * @example
 * const userCancel = new AbortController();
 * const timeout = createTimeout(5000);
 * const linked = linkSignals([userCancel.signal, timeout.signal]);
 *
 * try {
 *   await operation({ signal: linked.signal });
 * } finally {
 *   timeout.cancel();
 * }
 */
export function linkSignals(signals: AbortSignal[]): AbortController {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller;
    }

    signal.addEventListener('abort', () => {
      controller.abort(signal.reason);
    }, { once: true });
  }

  return controller;
}

/**
 * Create a combined signal from multiple sources.
 * Convenience function that combines an optional external signal with a timeout.
 *
 * @param timeoutMs - Timeout in milliseconds
 * @param externalSignal - Optional external AbortSignal
 * @returns TimeoutHandle with combined signal
 *
 * @example
 * function myOperation(externalSignal?: AbortSignal) {
 *   const { signal, cancel } = createCombinedSignal(5000, externalSignal);
 *   try {
 *     return await doWork(signal);
 *   } finally {
 *     cancel();
 *   }
 * }
 */
export function createCombinedSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal
): TimeoutHandle {
  const timeout = createTimeout(timeoutMs);

  if (!externalSignal) {
    return timeout;
  }

  // Link the external signal to our controller
  if (externalSignal.aborted) {
    timeout.controller.abort(externalSignal.reason);
    timeout.cancel();
    return timeout;
  }

  externalSignal.addEventListener('abort', () => {
    timeout.controller.abort(externalSignal.reason);
    timeout.cancel();
  }, { once: true });

  return timeout;
}

/**
 * Race a promise against an AbortSignal.
 * Similar to withTimeout but uses an existing signal instead of creating one.
 *
 * @param promise - The promise to race
 * @param signal - The AbortSignal to race against
 * @returns The promise result or throws if signal is aborted
 *
 * @example
 * const result = await raceWithSignal(
 *   fetchData(),
 *   controller.signal
 * );
 */
export async function raceWithSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    const reason = signal.reason;
    if (reason instanceof Error) {
      throw reason;
    }
    throw new AbortError(
      typeof reason === 'string' ? reason : 'Operation was aborted',
      reason
    );
  }

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => {
        const reason = signal.reason;
        if (reason instanceof Error) {
          reject(reason);
        } else {
          reject(new AbortError(
            typeof reason === 'string' ? reason : 'Operation was aborted',
            reason
          ));
        }
      }, { once: true });
    }),
  ]);
}

/**
 * Execute a function with a timeout, providing the signal to the function.
 * This is useful for operations that can accept an AbortSignal.
 *
 * @param fn - Function that accepts an AbortSignal and returns a promise
 * @param timeoutMs - Timeout in milliseconds
 * @param message - Optional custom error message
 * @returns The function result or throws TimeoutError
 *
 * @example
 * const data = await executeWithTimeout(
 *   (signal) => fetch(url, { signal }),
 *   5000,
 *   'Request timed out'
 * );
 */
export async function executeWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  const { signal, cancel } = createTimeout(timeoutMs, message);

  try {
    return await fn(signal);
  } finally {
    cancel();
  }
}

/**
 * Retry configuration for retryWithTimeout.
 */
export interface RetryConfig {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay between retries in ms (default: 1000) */
  baseDelayMs?: number;
  /** Use exponential backoff (default: true) */
  exponentialBackoff?: boolean;
  /** Maximum delay between retries in ms (default: 30000) */
  maxDelayMs?: number;
  /** Function to determine if error is retryable (default: all errors) */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Execute a function with retries and timeout.
 * Combines retry logic with abort signal support.
 *
 * @param fn - Function that accepts an AbortSignal
 * @param timeoutMs - Timeout per attempt in milliseconds
 * @param config - Retry configuration
 * @param signal - Optional external AbortSignal
 * @returns The function result or throws after all retries exhausted
 */
export async function retryWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  config: RetryConfig = {},
  signal?: AbortSignal
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    exponentialBackoff = true,
    maxDelayMs = 30000,
    isRetryable = () => true,
  } = config;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    checkAborted(signal);

    try {
      const { signal: attemptSignal, cancel } = createCombinedSignal(
        timeoutMs,
        signal
      );

      try {
        return await fn(attemptSignal);
      } finally {
        cancel();
      }
    } catch (error) {
      lastError = error;

      // Don't retry if externally aborted
      if (signal?.aborted) {
        throw error;
      }

      // Check if error is retryable
      if (!isRetryable(error)) {
        throw error;
      }

      // Check if we have more attempts
      if (attempt >= maxAttempts) {
        throw error;
      }

      // Calculate delay
      const delay = exponentialBackoff
        ? Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs)
        : baseDelayMs;

      log.debug(
        { attempt, maxAttempts, delayMs: delay, error: String(error) },
        'Retrying after error'
      );

      await sleep(delay, signal);
    }
  }

  throw lastError;
}
