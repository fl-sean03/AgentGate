/**
 * GitHub Rate Limiter - Handles GitHub API rate limiting.
 * Provides retry logic, quota tracking, and preemptive throttling.
 *
 * (v0.2.27 - Thrust 7: GitHub Rate Limit Handling)
 */

import { createLogger } from '../utils/logger.js';
import { GitHubError } from '../errors/base.js';
import { ErrorCode } from '../errors/types.js';

const log = createLogger('github-rate-limiter');

/**
 * Rate limit information from GitHub API
 */
export interface RateLimitInfo {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Remaining requests in the window */
  remaining: number;
  /** When the rate limit resets (Unix timestamp in seconds) */
  reset: number;
  /** Time until reset in milliseconds */
  resetInMs: number;
  /** Type of rate limit (core, search, graphql, etc.) */
  resource: string;
}

/**
 * Rate limit state for tracking across requests
 */
export interface RateLimitState {
  /** Current rate limit info */
  info: RateLimitInfo;
  /** Timestamp of last update */
  updatedAt: number;
  /** Whether we're currently throttled */
  isThrottled: boolean;
  /** Number of requests made in current window */
  requestCount: number;
}

/**
 * Options for rate limit handling
 */
export interface RateLimiterOptions {
  /** Minimum remaining requests before preemptive throttling (default: 10) */
  throttleThreshold: number;
  /** Maximum retry attempts for rate-limited requests (default: 3) */
  maxRetries: number;
  /** Add jitter to retry delays to prevent thundering herd (default: true) */
  useJitter: boolean;
  /** Maximum jitter in milliseconds (default: 5000) */
  maxJitterMs: number;
  /** Buffer time before reset to avoid edge cases (default: 1000ms) */
  resetBufferMs: number;
}

const DEFAULT_OPTIONS: RateLimiterOptions = {
  throttleThreshold: 10,
  maxRetries: 3,
  useJitter: true,
  maxJitterMs: 5000,
  resetBufferMs: 1000,
};

/**
 * GitHub Rate Limiter singleton
 */
export class GitHubRateLimiter {
  private static instance: GitHubRateLimiter | null = null;

  private readonly options: RateLimiterOptions;
  private readonly states: Map<string, RateLimitState> = new Map();
  private readonly retryQueue: Map<string, Promise<void>> = new Map();

  private constructor(options: Partial<RateLimiterOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get the singleton instance
   */
  static getInstance(options?: Partial<RateLimiterOptions>): GitHubRateLimiter {
    if (!GitHubRateLimiter.instance) {
      GitHubRateLimiter.instance = new GitHubRateLimiter(options);
    }
    return GitHubRateLimiter.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    GitHubRateLimiter.instance = null;
  }

  /**
   * Parse rate limit info from response headers
   */
  parseHeaders(headers: Record<string, string | undefined>): RateLimitInfo | null {
    const limit = parseInt(headers['x-ratelimit-limit'] || '', 10);
    const remaining = parseInt(headers['x-ratelimit-remaining'] || '', 10);
    const reset = parseInt(headers['x-ratelimit-reset'] || '', 10);
    const resource = headers['x-ratelimit-resource'] || 'core';

    if (isNaN(limit) || isNaN(remaining) || isNaN(reset)) {
      return null;
    }

    const now = Date.now();
    const resetTime = reset * 1000; // Convert to milliseconds
    const resetInMs = Math.max(0, resetTime - now);

    return {
      limit,
      remaining,
      reset,
      resetInMs,
      resource,
    };
  }

  /**
   * Update rate limit state from response headers
   */
  updateFromHeaders(headers: Record<string, string | undefined>): RateLimitInfo | null {
    const info = this.parseHeaders(headers);
    if (!info) return null;

    const state = this.states.get(info.resource) || {
      info,
      updatedAt: Date.now(),
      isThrottled: false,
      requestCount: 0,
    };

    state.info = info;
    state.updatedAt = Date.now();
    state.requestCount++;

    // Check if we need to throttle
    if (info.remaining <= this.options.throttleThreshold) {
      state.isThrottled = true;
      log.warn(
        { resource: info.resource, remaining: info.remaining, resetInMs: info.resetInMs },
        'Rate limit threshold reached, throttling'
      );
    } else if (info.remaining > this.options.throttleThreshold * 2) {
      state.isThrottled = false;
    }

    this.states.set(info.resource, state);

    log.debug(
      { resource: info.resource, remaining: info.remaining, limit: info.limit },
      'Rate limit updated'
    );

    return info;
  }

  /**
   * Check if a request should be throttled
   */
  shouldThrottle(resource: string = 'core'): boolean {
    const state = this.states.get(resource);
    if (!state) return false;

    return state.isThrottled && state.info.remaining < this.options.throttleThreshold;
  }

  /**
   * Get current rate limit state
   */
  getState(resource: string = 'core'): RateLimitState | undefined {
    return this.states.get(resource);
  }

  /**
   * Get all rate limit states
   */
  getAllStates(): Map<string, RateLimitState> {
    return new Map(this.states);
  }

  /**
   * Calculate retry delay for a rate-limited request
   */
  calculateRetryDelay(info: RateLimitInfo, attempt: number): number {
    // Use reset time as base
    let delay = info.resetInMs + this.options.resetBufferMs;

    // Add exponential backoff for multiple retries
    if (attempt > 0) {
      delay = Math.min(delay * Math.pow(2, attempt), 300000); // Max 5 minutes
    }

    // Add jitter to prevent thundering herd
    if (this.options.useJitter) {
      delay += Math.random() * this.options.maxJitterMs;
    }

    return Math.ceil(delay);
  }

  /**
   * Wait for rate limit reset
   */
  async waitForReset(resource: string = 'core', signal?: AbortSignal): Promise<void> {
    const state = this.states.get(resource);
    if (!state || state.info.remaining > 0) {
      return;
    }

    const delay = state.info.resetInMs + this.options.resetBufferMs;

    log.info(
      { resource, delayMs: delay },
      'Waiting for rate limit reset'
    );

    await this.delay(delay, signal);

    // Reset state after wait
    state.isThrottled = false;
    state.info.remaining = state.info.limit;
    this.states.set(resource, state);
  }

  /**
   * Check if a response indicates rate limiting
   */
  isRateLimited(statusCode: number, headers: Record<string, string | undefined>): boolean {
    // Primary rate limit (403 with specific header)
    if (statusCode === 403) {
      const remaining = parseInt(headers['x-ratelimit-remaining'] || '', 10);
      return remaining === 0;
    }

    // Secondary rate limit (429)
    if (statusCode === 429) {
      return true;
    }

    return false;
  }

  /**
   * Get retry-after delay from response
   */
  getRetryAfter(headers: Record<string, string | undefined>): number {
    // Check Retry-After header (in seconds)
    const retryAfter = parseInt(headers['retry-after'] || '', 10);
    if (!isNaN(retryAfter)) {
      return retryAfter * 1000;
    }

    // Fall back to x-ratelimit-reset
    const info = this.parseHeaders(headers);
    if (info) {
      return info.resetInMs + this.options.resetBufferMs;
    }

    // Default to 60 seconds
    return 60000;
  }

  /**
   * Create a rate-limited error with retry information
   */
  createRateLimitError(
    headers: Record<string, string | undefined>,
    message: string = 'GitHub API rate limit exceeded'
  ): GitHubError {
    const retryAfterMs = this.getRetryAfter(headers);

    return new GitHubError(message, ErrorCode.GITHUB_RATE_LIMITED, {
      retryPolicy: {
        retryable: true,
        retryAfterMs,
        maxRetries: this.options.maxRetries,
      },
    });
  }

  /**
   * Execute a request with rate limit handling
   */
  async execute<T>(
    fn: () => Promise<{ data: T; headers: Record<string, string | undefined>; status: number }>,
    options: {
      resource?: string;
      signal?: AbortSignal;
    } = {}
  ): Promise<T> {
    const resource = options.resource || 'core';

    // Check preemptive throttling
    if (this.shouldThrottle(resource)) {
      await this.waitForReset(resource, options.signal);
    }

    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        const { data, headers, status } = await fn();

        // Update rate limit state
        this.updateFromHeaders(headers);

        // Check for rate limiting
        if (this.isRateLimited(status, headers)) {
          const delay = this.calculateRetryDelay(
            this.parseHeaders(headers)!,
            attempt
          );

          log.warn(
            { resource, attempt, delayMs: delay },
            'Rate limited, retrying'
          );

          await this.delay(delay, options.signal);
          continue;
        }

        return data;
      } catch (error) {
        // Check if it's a rate limit error
        if (error instanceof GitHubError && error.code === ErrorCode.GITHUB_RATE_LIMITED) {
          if (attempt < this.options.maxRetries - 1) {
            const delay = error.retryPolicy.retryAfterMs || 60000;
            await this.delay(delay, options.signal);
            continue;
          }
        }
        throw error;
      }
    }

    throw new GitHubError(
      'Rate limit retries exhausted',
      ErrorCode.GITHUB_RATE_LIMITED
    );
  }

  /**
   * Get remaining quota for a resource
   */
  getRemainingQuota(resource: string = 'core'): number {
    const state = this.states.get(resource);
    return state?.info.remaining ?? -1;
  }

  /**
   * Get quota percentage remaining
   */
  getQuotaPercentage(resource: string = 'core'): number {
    const state = this.states.get(resource);
    if (!state) return 100;

    return (state.info.remaining / state.info.limit) * 100;
  }

  /**
   * Check if quota is low
   */
  isQuotaLow(resource: string = 'core', threshold: number = 20): boolean {
    return this.getQuotaPercentage(resource) < threshold;
  }

  /**
   * Get time until reset
   */
  getTimeUntilReset(resource: string = 'core'): number {
    const state = this.states.get(resource);
    if (!state) return 0;

    const now = Date.now();
    const resetTime = state.info.reset * 1000;
    return Math.max(0, resetTime - now);
  }

  /**
   * Get statistics about rate limiting
   */
  getStats(): {
    resources: string[];
    totalRequests: number;
    throttledResources: string[];
    lowestQuotaResource: string | null;
    lowestQuotaPercentage: number;
  } {
    const resources = Array.from(this.states.keys());
    let totalRequests = 0;
    const throttledResources: string[] = [];
    let lowestQuotaResource: string | null = null;
    let lowestQuotaPercentage = 100;

    for (const [resource, state] of this.states) {
      totalRequests += state.requestCount;

      if (state.isThrottled) {
        throttledResources.push(resource);
      }

      const percentage = (state.info.remaining / state.info.limit) * 100;
      if (percentage < lowestQuotaPercentage) {
        lowestQuotaPercentage = percentage;
        lowestQuotaResource = resource;
      }
    }

    return {
      resources,
      totalRequests,
      throttledResources,
      lowestQuotaResource,
      lowestQuotaPercentage,
    };
  }

  /**
   * Clear all rate limit state
   */
  clear(): void {
    this.states.clear();
    this.retryQueue.clear();
    log.debug('Rate limit state cleared');
  }

  /**
   * Delay helper with abort signal support
   */
  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Aborted'));
        return;
      }

      const timeoutId = setTimeout(resolve, ms);

      signal?.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        reject(new Error('Aborted'));
      });
    });
  }
}

/**
 * Get the GitHub rate limiter singleton
 */
export function getGitHubRateLimiter(
  options?: Partial<RateLimiterOptions>
): GitHubRateLimiter {
  return GitHubRateLimiter.getInstance(options);
}

/**
 * Decorator for rate-limited API calls
 */
export function withRateLimit<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  resource: string = 'core'
): T {
  return (async (...args: unknown[]) => {
    const limiter = getGitHubRateLimiter();

    if (limiter.shouldThrottle(resource)) {
      await limiter.waitForReset(resource);
    }

    return fn(...args);
  }) as T;
}
