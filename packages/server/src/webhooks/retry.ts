/**
 * Webhook Retry Logic
 *
 * Exponential backoff retry strategy for webhook delivery.
 */

import type { DeliveryOptions } from './types.js';

/**
 * Default delivery options
 */
export const DEFAULT_DELIVERY_OPTIONS: Required<DeliveryOptions> = {
  maxRetries: 3,
  initialRetryDelayMs: 1000,
  maxRetryDelayMs: 60000,
  timeoutMs: 30000,
};

/**
 * Calculate delay for next retry using exponential backoff with jitter
 */
export function calculateRetryDelay(
  attemptNumber: number,
  options: DeliveryOptions = {}
): number {
  const initialDelay = options.initialRetryDelayMs ?? DEFAULT_DELIVERY_OPTIONS.initialRetryDelayMs;
  const maxDelay = options.maxRetryDelayMs ?? DEFAULT_DELIVERY_OPTIONS.maxRetryDelayMs;

  // Exponential backoff: initialDelay * 2^attempt
  const exponentialDelay = initialDelay * Math.pow(2, attemptNumber - 1);

  // Add jitter (±25%)
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  const delayWithJitter = exponentialDelay + jitter;

  // Cap at max delay
  return Math.min(delayWithJitter, maxDelay);
}

/**
 * Determine if a request should be retried based on status code
 */
export function shouldRetry(statusCode: number): boolean {
  // Retry on server errors (5xx) and some client errors
  if (statusCode >= 500) {
    return true;
  }

  // Retry on rate limiting
  if (statusCode === 429) {
    return true;
  }

  // Retry on request timeout
  if (statusCode === 408) {
    return true;
  }

  // Don't retry on other client errors (4xx)
  return false;
}

/**
 * Determine if an error should trigger a retry
 */
export function shouldRetryError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network errors
  if (
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('socket hang up') ||
    message.includes('network')
  ) {
    return true;
  }

  // Timeout errors
  if (message.includes('timeout')) {
    return true;
  }

  return false;
}

/**
 * Create a retry scheduler
 */
export class RetryScheduler {
  private pending: Map<string, NodeJS.Timeout> = new Map();
  private readonly options: Required<DeliveryOptions>;

  constructor(options: DeliveryOptions = {}) {
    this.options = { ...DEFAULT_DELIVERY_OPTIONS, ...options };
  }

  /**
   * Schedule a retry
   */
  schedule(
    id: string,
    attemptNumber: number,
    callback: () => void
  ): { scheduledAt: Date; delayMs: number } {
    // Clear any existing retry for this ID
    this.cancel(id);

    const delayMs = calculateRetryDelay(attemptNumber, this.options);
    const scheduledAt = new Date(Date.now() + delayMs);

    const timeout = setTimeout(() => {
      this.pending.delete(id);
      callback();
    }, delayMs);

    this.pending.set(id, timeout);

    return { scheduledAt, delayMs };
  }

  /**
   * Cancel a scheduled retry
   */
  cancel(id: string): boolean {
    const timeout = this.pending.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.pending.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Cancel all pending retries
   */
  cancelAll(): void {
    for (const [id, timeout] of this.pending) {
      clearTimeout(timeout);
      this.pending.delete(id);
    }
  }

  /**
   * Get count of pending retries
   */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Check if there's a pending retry for an ID
   */
  hasPending(id: string): boolean {
    return this.pending.has(id);
  }
}
