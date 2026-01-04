/**
 * Tests for GitHub Rate Limiter.
 * (v0.2.27 - Thrust 7: GitHub Rate Limit Handling)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GitHubRateLimiter,
  getGitHubRateLimiter,
  withRateLimit,
} from '../../src/github/rate-limiter.js';
import { ErrorCode } from '../../src/errors/types.js';

describe('GitHubRateLimiter', () => {
  beforeEach(() => {
    GitHubRateLimiter.resetInstance();
  });

  afterEach(() => {
    GitHubRateLimiter.resetInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = GitHubRateLimiter.getInstance();
      const instance2 = GitHubRateLimiter.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should accept options', () => {
      const instance = GitHubRateLimiter.getInstance({ throttleThreshold: 20 });
      expect(instance).toBeDefined();
    });
  });

  describe('parseHeaders', () => {
    it('should parse rate limit headers', () => {
      const limiter = GitHubRateLimiter.getInstance();
      const now = Math.floor(Date.now() / 1000);

      const info = limiter.parseHeaders({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4999',
        'x-ratelimit-reset': String(now + 3600),
        'x-ratelimit-resource': 'core',
      });

      expect(info).not.toBeNull();
      expect(info?.limit).toBe(5000);
      expect(info?.remaining).toBe(4999);
      expect(info?.resource).toBe('core');
      expect(info?.resetInMs).toBeGreaterThan(0);
    });

    it('should return null for missing headers', () => {
      const limiter = GitHubRateLimiter.getInstance();

      const info = limiter.parseHeaders({});

      expect(info).toBeNull();
    });

    it('should return null for invalid values', () => {
      const limiter = GitHubRateLimiter.getInstance();

      const info = limiter.parseHeaders({
        'x-ratelimit-limit': 'not-a-number',
      });

      expect(info).toBeNull();
    });
  });

  describe('updateFromHeaders', () => {
    it('should update state from headers', () => {
      const limiter = GitHubRateLimiter.getInstance();
      const now = Math.floor(Date.now() / 1000);

      limiter.updateFromHeaders({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4500',
        'x-ratelimit-reset': String(now + 3600),
        'x-ratelimit-resource': 'core',
      });

      const state = limiter.getState('core');
      expect(state).toBeDefined();
      expect(state?.info.remaining).toBe(4500);
      expect(state?.requestCount).toBe(1);
    });

    it('should track request count', () => {
      const limiter = GitHubRateLimiter.getInstance();
      const now = Math.floor(Date.now() / 1000);

      const headers = {
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4999',
        'x-ratelimit-reset': String(now + 3600),
        'x-ratelimit-resource': 'core',
      };

      limiter.updateFromHeaders(headers);
      limiter.updateFromHeaders(headers);
      limiter.updateFromHeaders(headers);

      const state = limiter.getState('core');
      expect(state?.requestCount).toBe(3);
    });

    it('should throttle when threshold reached', () => {
      const limiter = GitHubRateLimiter.getInstance({ throttleThreshold: 100 });
      const now = Math.floor(Date.now() / 1000);

      limiter.updateFromHeaders({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '50',
        'x-ratelimit-reset': String(now + 3600),
        'x-ratelimit-resource': 'core',
      });

      const state = limiter.getState('core');
      expect(state?.isThrottled).toBe(true);
    });
  });

  describe('shouldThrottle', () => {
    it('should return false when no state', () => {
      const limiter = GitHubRateLimiter.getInstance();

      expect(limiter.shouldThrottle('core')).toBe(false);
    });

    it('should return true when throttled', () => {
      const limiter = GitHubRateLimiter.getInstance({ throttleThreshold: 100 });
      const now = Math.floor(Date.now() / 1000);

      limiter.updateFromHeaders({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '50',
        'x-ratelimit-reset': String(now + 3600),
        'x-ratelimit-resource': 'core',
      });

      expect(limiter.shouldThrottle('core')).toBe(true);
    });

    it('should return false when above threshold', () => {
      const limiter = GitHubRateLimiter.getInstance({ throttleThreshold: 10 });
      const now = Math.floor(Date.now() / 1000);

      limiter.updateFromHeaders({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4000',
        'x-ratelimit-reset': String(now + 3600),
        'x-ratelimit-resource': 'core',
      });

      expect(limiter.shouldThrottle('core')).toBe(false);
    });
  });

  describe('isRateLimited', () => {
    it('should detect 403 with zero remaining', () => {
      const limiter = GitHubRateLimiter.getInstance();

      const isLimited = limiter.isRateLimited(403, {
        'x-ratelimit-remaining': '0',
      });

      expect(isLimited).toBe(true);
    });

    it('should detect 429 status', () => {
      const limiter = GitHubRateLimiter.getInstance();

      const isLimited = limiter.isRateLimited(429, {});

      expect(isLimited).toBe(true);
    });

    it('should not flag 403 with remaining quota', () => {
      const limiter = GitHubRateLimiter.getInstance();

      const isLimited = limiter.isRateLimited(403, {
        'x-ratelimit-remaining': '100',
      });

      expect(isLimited).toBe(false);
    });

    it('should not flag 200 status', () => {
      const limiter = GitHubRateLimiter.getInstance();

      const isLimited = limiter.isRateLimited(200, {});

      expect(isLimited).toBe(false);
    });
  });

  describe('getRetryAfter', () => {
    it('should use Retry-After header', () => {
      const limiter = GitHubRateLimiter.getInstance();

      const delay = limiter.getRetryAfter({
        'retry-after': '60',
      });

      expect(delay).toBe(60000);
    });

    it('should fall back to reset time', () => {
      const limiter = GitHubRateLimiter.getInstance();
      const now = Math.floor(Date.now() / 1000);

      const delay = limiter.getRetryAfter({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(now + 60),
      });

      // Should be approximately 60 seconds + buffer
      expect(delay).toBeGreaterThan(59000);
      expect(delay).toBeLessThan(70000);
    });

    it('should default to 60 seconds', () => {
      const limiter = GitHubRateLimiter.getInstance();

      const delay = limiter.getRetryAfter({});

      expect(delay).toBe(60000);
    });
  });

  describe('calculateRetryDelay', () => {
    it('should use reset time as base', () => {
      const limiter = GitHubRateLimiter.getInstance({
        useJitter: false,
        resetBufferMs: 1000,
      });

      const info = {
        limit: 5000,
        remaining: 0,
        reset: Math.floor(Date.now() / 1000) + 60,
        resetInMs: 60000,
        resource: 'core',
      };

      const delay = limiter.calculateRetryDelay(info, 0);

      expect(delay).toBe(61000); // 60s + 1s buffer
    });

    it('should apply exponential backoff', () => {
      const limiter = GitHubRateLimiter.getInstance({
        useJitter: false,
        resetBufferMs: 0,
      });

      const info = {
        limit: 5000,
        remaining: 0,
        reset: 0,
        resetInMs: 10000,
        resource: 'core',
      };

      const delay0 = limiter.calculateRetryDelay(info, 0);
      const delay1 = limiter.calculateRetryDelay(info, 1);
      const delay2 = limiter.calculateRetryDelay(info, 2);

      expect(delay0).toBe(10000);
      expect(delay1).toBe(20000);
      expect(delay2).toBe(40000);
    });
  });

  describe('createRateLimitError', () => {
    it('should create error with retry info', () => {
      const limiter = GitHubRateLimiter.getInstance();

      const error = limiter.createRateLimitError({
        'retry-after': '120',
      });

      expect(error.code).toBe(ErrorCode.GITHUB_RATE_LIMITED);
      expect(error.retryPolicy.retryable).toBe(true);
      expect(error.retryPolicy.retryAfterMs).toBe(120000);
    });
  });

  describe('execute', () => {
    it('should execute successful request', async () => {
      const limiter = GitHubRateLimiter.getInstance();
      const now = Math.floor(Date.now() / 1000);

      const result = await limiter.execute(async () => ({
        data: { success: true },
        headers: {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': String(now + 3600),
        },
        status: 200,
      }));

      expect(result).toEqual({ success: true });
    });

    it('should retry on rate limit', async () => {
      const limiter = GitHubRateLimiter.getInstance({
        maxRetries: 3,
        useJitter: false,
        resetBufferMs: 10,
      });

      let attempts = 0;
      const now = Math.floor(Date.now() / 1000);

      const result = await limiter.execute(async () => {
        attempts++;
        if (attempts < 2) {
          return {
            data: null,
            headers: {
              'x-ratelimit-limit': '5000',
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(now), // Reset now
            },
            status: 429,
          };
        }
        return {
          data: { success: true },
          headers: {
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '4999',
            'x-ratelimit-reset': String(now + 3600),
          },
          status: 200,
        };
      });

      expect(attempts).toBe(2);
      expect(result).toEqual({ success: true });
    });

    it('should respect abort signal', async () => {
      const limiter = GitHubRateLimiter.getInstance({
        throttleThreshold: 100,
      });

      const controller = new AbortController();
      const now = Math.floor(Date.now() / 1000);

      // Set up throttling
      limiter.updateFromHeaders({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(now + 60),
        'x-ratelimit-resource': 'core',
      });

      controller.abort();

      await expect(
        limiter.execute(
          async () => ({ data: 'test', headers: {}, status: 200 }),
          { signal: controller.signal }
        )
      ).rejects.toThrow('Aborted');
    });
  });

  describe('quota methods', () => {
    it('should get remaining quota', () => {
      const limiter = GitHubRateLimiter.getInstance();
      const now = Math.floor(Date.now() / 1000);

      limiter.updateFromHeaders({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '2500',
        'x-ratelimit-reset': String(now + 3600),
        'x-ratelimit-resource': 'core',
      });

      expect(limiter.getRemainingQuota('core')).toBe(2500);
    });

    it('should return -1 for unknown resource', () => {
      const limiter = GitHubRateLimiter.getInstance();

      expect(limiter.getRemainingQuota('unknown')).toBe(-1);
    });

    it('should get quota percentage', () => {
      const limiter = GitHubRateLimiter.getInstance();
      const now = Math.floor(Date.now() / 1000);

      limiter.updateFromHeaders({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '2500',
        'x-ratelimit-reset': String(now + 3600),
        'x-ratelimit-resource': 'core',
      });

      expect(limiter.getQuotaPercentage('core')).toBe(50);
    });

    it('should check if quota is low', () => {
      const limiter = GitHubRateLimiter.getInstance();
      const now = Math.floor(Date.now() / 1000);

      limiter.updateFromHeaders({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '500',
        'x-ratelimit-reset': String(now + 3600),
        'x-ratelimit-resource': 'core',
      });

      expect(limiter.isQuotaLow('core', 20)).toBe(true);
      expect(limiter.isQuotaLow('core', 5)).toBe(false);
    });

    it('should get time until reset', () => {
      const limiter = GitHubRateLimiter.getInstance();
      const now = Math.floor(Date.now() / 1000);

      limiter.updateFromHeaders({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '2500',
        'x-ratelimit-reset': String(now + 60),
        'x-ratelimit-resource': 'core',
      });

      const timeUntilReset = limiter.getTimeUntilReset('core');
      expect(timeUntilReset).toBeGreaterThan(50000);
      expect(timeUntilReset).toBeLessThanOrEqual(60000);
    });
  });

  describe('getStats', () => {
    it('should return empty stats initially', () => {
      const limiter = GitHubRateLimiter.getInstance();

      const stats = limiter.getStats();

      expect(stats.resources).toHaveLength(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.throttledResources).toHaveLength(0);
      expect(stats.lowestQuotaResource).toBeNull();
    });

    it('should return aggregated stats', () => {
      const limiter = GitHubRateLimiter.getInstance({ throttleThreshold: 100 });
      const now = Math.floor(Date.now() / 1000);

      limiter.updateFromHeaders({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4000',
        'x-ratelimit-reset': String(now + 3600),
        'x-ratelimit-resource': 'core',
      });

      limiter.updateFromHeaders({
        'x-ratelimit-limit': '30',
        'x-ratelimit-remaining': '10',
        'x-ratelimit-reset': String(now + 60),
        'x-ratelimit-resource': 'search',
      });

      const stats = limiter.getStats();

      expect(stats.resources).toContain('core');
      expect(stats.resources).toContain('search');
      expect(stats.totalRequests).toBe(2);
      expect(stats.throttledResources).toContain('search');
      expect(stats.lowestQuotaResource).toBe('search');
    });
  });

  describe('clear', () => {
    it('should clear all state', () => {
      const limiter = GitHubRateLimiter.getInstance();
      const now = Math.floor(Date.now() / 1000);

      limiter.updateFromHeaders({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4000',
        'x-ratelimit-reset': String(now + 3600),
        'x-ratelimit-resource': 'core',
      });

      limiter.clear();

      expect(limiter.getState('core')).toBeUndefined();
    });
  });
});

describe('getGitHubRateLimiter', () => {
  beforeEach(() => {
    GitHubRateLimiter.resetInstance();
  });

  it('should return singleton', () => {
    const limiter1 = getGitHubRateLimiter();
    const limiter2 = getGitHubRateLimiter();

    expect(limiter1).toBe(limiter2);
  });
});

describe('withRateLimit', () => {
  beforeEach(() => {
    GitHubRateLimiter.resetInstance();
  });

  it('should wrap function with rate limiting', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const wrapped = withRateLimit(fn, 'core');

    const result = await wrapped();

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalled();
  });
});
