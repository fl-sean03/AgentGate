/**
 * Tests for Retry Policy Engine (v0.2.19 - Thrust 5)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RetryPolicyEngine,
  createRetryPolicyEngine,
  DEFAULT_RETRY_POLICY,
  AGGRESSIVE_RETRY_POLICY,
  NO_RETRY_POLICY,
  type RetryPolicy,
  type RetryAttempt,
} from '../src/orchestrator/retry-policy.js';
import { BuildErrorType } from '../src/types/build-error.js';

describe('RetryPolicyEngine', () => {
  describe('constructor and getPolicy', () => {
    it('should use default policy when none provided', () => {
      const engine = new RetryPolicyEngine();
      const policy = engine.getPolicy();

      expect(policy.maxRetries).toBe(2);
      expect(policy.backoffMs).toBe(5000);
      expect(policy.jitter).toBe(true);
    });

    it('should use custom policy when provided', () => {
      const customPolicy: RetryPolicy = {
        maxRetries: 5,
        backoffMs: 1000,
        backoffMultiplier: 3,
        maxBackoffMs: 60000,
        retryableErrors: [BuildErrorType.GITHUB_ERROR],
        retryOnTimeout: false,
        jitter: false,
      };

      const engine = new RetryPolicyEngine(customPolicy);
      const policy = engine.getPolicy();

      expect(policy.maxRetries).toBe(5);
      expect(policy.backoffMs).toBe(1000);
      expect(policy.backoffMultiplier).toBe(3);
      expect(policy.retryableErrors).toEqual([BuildErrorType.GITHUB_ERROR]);
    });

    it('should return a copy of policy to prevent mutation', () => {
      const engine = new RetryPolicyEngine();
      const policy1 = engine.getPolicy();
      const policy2 = engine.getPolicy();

      policy1.maxRetries = 999;
      expect(policy2.maxRetries).toBe(2);
    });
  });

  describe('evaluateRetry', () => {
    it('should return shouldRetry=false when max retries exhausted', () => {
      const engine = createRetryPolicyEngine({ maxRetries: 2 });
      const error = new Error('Test error');

      const result = engine.evaluateRetry(error, 2, {
        extractErrorType: () => BuildErrorType.SYSTEM_ERROR,
      });

      expect(result.shouldRetry).toBe(false);
      expect(result.delayMs).toBe(0);
      expect(result.reason).toContain('exhausted');
    });

    it('should return shouldRetry=false for non-retryable error types', () => {
      const engine = createRetryPolicyEngine({
        maxRetries: 3,
        retryableErrors: [BuildErrorType.SYSTEM_ERROR],
      });
      const error = new Error('Test error');

      const result = engine.evaluateRetry(error, 0, {
        extractErrorType: () => BuildErrorType.TYPECHECK_FAILED,
      });

      expect(result.shouldRetry).toBe(false);
      expect(result.reason).toContain('not retryable');
    });

    it('should return shouldRetry=true for retryable error types', () => {
      const engine = createRetryPolicyEngine({
        maxRetries: 3,
        retryableErrors: [BuildErrorType.SYSTEM_ERROR],
        backoffMs: 1000,
      });
      const error = new Error('Test error');

      const result = engine.evaluateRetry(error, 0, {
        extractErrorType: () => BuildErrorType.SYSTEM_ERROR,
      });

      expect(result.shouldRetry).toBe(true);
      expect(result.delayMs).toBeGreaterThan(0);
    });

    it('should handle timeout errors when retryOnTimeout is true', () => {
      const engine = createRetryPolicyEngine({
        maxRetries: 3,
        retryableErrors: [], // Timeout not in list
        retryOnTimeout: true,
      });
      const error = new Error('Timeout');

      const result = engine.evaluateRetry(error, 0, {
        extractErrorType: () => BuildErrorType.AGENT_TIMEOUT,
      });

      expect(result.shouldRetry).toBe(true);
    });

    it('should not retry timeout when retryOnTimeout is false', () => {
      const engine = createRetryPolicyEngine({
        maxRetries: 3,
        retryableErrors: [],
        retryOnTimeout: false,
      });
      const error = new Error('Timeout');

      const result = engine.evaluateRetry(error, 0, {
        extractErrorType: () => BuildErrorType.AGENT_TIMEOUT,
      });

      expect(result.shouldRetry).toBe(false);
    });
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff without jitter', () => {
      const engine = createRetryPolicyEngine({
        backoffMs: 1000,
        backoffMultiplier: 2,
        maxBackoffMs: 30000,
        jitter: false,
      });

      expect(engine.calculateBackoff(0)).toBe(1000);
      expect(engine.calculateBackoff(1)).toBe(2000);
      expect(engine.calculateBackoff(2)).toBe(4000);
      expect(engine.calculateBackoff(3)).toBe(8000);
    });

    it('should cap at maxBackoffMs', () => {
      const engine = createRetryPolicyEngine({
        backoffMs: 10000,
        backoffMultiplier: 2,
        maxBackoffMs: 15000,
        jitter: false,
      });

      expect(engine.calculateBackoff(0)).toBe(10000);
      expect(engine.calculateBackoff(1)).toBe(15000); // Capped
      expect(engine.calculateBackoff(2)).toBe(15000); // Still capped
      expect(engine.calculateBackoff(10)).toBe(15000); // Still capped
    });

    it('should add jitter when enabled', () => {
      const engine = createRetryPolicyEngine({
        backoffMs: 1000,
        backoffMultiplier: 2,
        maxBackoffMs: 30000,
        jitter: true,
      });

      // With jitter, value should be between base and base + 25%
      const results = Array.from({ length: 100 }, () => engine.calculateBackoff(0));

      const min = Math.min(...results);
      const max = Math.max(...results);

      expect(min).toBeGreaterThanOrEqual(1000);
      expect(max).toBeLessThanOrEqual(1250); // 1000 + 25%
      // Verify there's actual variance
      expect(max).toBeGreaterThan(min);
    });
  });

  describe('isRetryable', () => {
    it('should return true for configured retryable errors', () => {
      const engine = createRetryPolicyEngine({
        retryableErrors: [BuildErrorType.SYSTEM_ERROR, BuildErrorType.GITHUB_ERROR],
      });

      expect(engine.isRetryable(BuildErrorType.SYSTEM_ERROR)).toBe(true);
      expect(engine.isRetryable(BuildErrorType.GITHUB_ERROR)).toBe(true);
      expect(engine.isRetryable(BuildErrorType.TYPECHECK_FAILED)).toBe(false);
    });

    it('should return true for timeout when retryOnTimeout is true', () => {
      const engine = createRetryPolicyEngine({
        retryableErrors: [],
        retryOnTimeout: true,
      });

      expect(engine.isRetryable(BuildErrorType.AGENT_TIMEOUT)).toBe(true);
    });

    it('should return false for timeout when retryOnTimeout is false', () => {
      const engine = createRetryPolicyEngine({
        retryableErrors: [],
        retryOnTimeout: false,
      });

      expect(engine.isRetryable(BuildErrorType.AGENT_TIMEOUT)).toBe(false);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should succeed on first attempt when operation succeeds', async () => {
      const engine = createRetryPolicyEngine({ maxRetries: 3 });
      const operation = vi.fn().mockResolvedValue('success');

      const resultPromise = engine.execute(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.retriedCount).toBe(0);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0]!.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors and succeed', async () => {
      const engine = createRetryPolicyEngine({
        maxRetries: 3,
        backoffMs: 10,
        retryableErrors: [BuildErrorType.SYSTEM_ERROR],
        jitter: false,
      });

      let attempts = 0;
      const operation = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const resultPromise = engine.execute(operation, {
        extractErrorType: () => BuildErrorType.SYSTEM_ERROR,
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.retriedCount).toBe(2);
      expect(result.attempts).toHaveLength(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const engine = createRetryPolicyEngine({
        maxRetries: 3,
        backoffMs: 10,
        retryableErrors: [BuildErrorType.SYSTEM_ERROR],
        retryOnTimeout: false,
        jitter: false,
      });

      const operation = vi.fn().mockRejectedValue(new Error('Code error'));

      const resultPromise = engine.execute(operation, {
        extractErrorType: () => BuildErrorType.TYPECHECK_FAILED,
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.retriedCount).toBe(0);
      expect(result.attempts).toHaveLength(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should respect max retries limit', async () => {
      const engine = createRetryPolicyEngine({
        maxRetries: 2,
        backoffMs: 10,
        retryableErrors: [BuildErrorType.SYSTEM_ERROR],
        jitter: false,
      });

      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      const resultPromise = engine.execute(operation, {
        extractErrorType: () => BuildErrorType.SYSTEM_ERROR,
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.attempts).toHaveLength(3); // 1 initial + 2 retries
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should call onAttempt callback for each attempt', async () => {
      const engine = createRetryPolicyEngine({
        maxRetries: 2,
        backoffMs: 10,
        retryableErrors: [BuildErrorType.SYSTEM_ERROR],
        jitter: false,
      });

      const attempts: RetryAttempt<string>[] = [];
      let callCount = 0;

      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) throw new Error('Fail');
        return 'success';
      });

      const resultPromise = engine.execute(operation, {
        onAttempt: (attempt) => attempts.push(attempt),
        extractErrorType: () => BuildErrorType.SYSTEM_ERROR,
      });
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(attempts).toHaveLength(2);
      expect(attempts[0]!.success).toBe(false);
      expect(attempts[0]!.willRetry).toBe(true);
      expect(attempts[1]!.success).toBe(true);
      expect(attempts[1]!.willRetry).toBe(false);
    });

    it('should track total duration including delays', async () => {
      const engine = createRetryPolicyEngine({
        maxRetries: 1,
        backoffMs: 100,
        retryableErrors: [BuildErrorType.SYSTEM_ERROR],
        jitter: false,
      });

      let callCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) throw new Error('Fail');
        return 'success';
      });

      const resultPromise = engine.execute(operation, {
        extractErrorType: () => BuildErrorType.SYSTEM_ERROR,
      });

      // Advance time to complete retries
      await vi.advanceTimersByTimeAsync(200);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(100);
    });

    it('should return finalError when all retries fail', async () => {
      const engine = createRetryPolicyEngine({
        maxRetries: 1,
        backoffMs: 10,
        retryableErrors: [BuildErrorType.SYSTEM_ERROR],
        jitter: false,
      });

      const error = new Error('Persistent failure');
      const operation = vi.fn().mockRejectedValue(error);

      const resultPromise = engine.execute(operation, {
        extractErrorType: () => BuildErrorType.SYSTEM_ERROR,
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.finalError).toBe(error);
      expect(result.result).toBeNull();
    });

    afterEach(() => {
      vi.useRealTimers();
    });
  });

  describe('predefined policies', () => {
    describe('DEFAULT_RETRY_POLICY', () => {
      it('should have conservative settings', () => {
        expect(DEFAULT_RETRY_POLICY.maxRetries).toBe(2);
        expect(DEFAULT_RETRY_POLICY.backoffMs).toBe(5000);
        expect(DEFAULT_RETRY_POLICY.jitter).toBe(true);
        expect(DEFAULT_RETRY_POLICY.retryableErrors).toContain(BuildErrorType.SYSTEM_ERROR);
        expect(DEFAULT_RETRY_POLICY.retryableErrors).toContain(BuildErrorType.GITHUB_ERROR);
        expect(DEFAULT_RETRY_POLICY.retryableErrors).toContain(BuildErrorType.AGENT_TIMEOUT);
      });
    });

    describe('AGGRESSIVE_RETRY_POLICY', () => {
      it('should have more aggressive settings', () => {
        expect(AGGRESSIVE_RETRY_POLICY.maxRetries).toBe(5);
        expect(AGGRESSIVE_RETRY_POLICY.backoffMs).toBe(1000);
        expect(AGGRESSIVE_RETRY_POLICY.retryableErrors).toContain(BuildErrorType.AGENT_CRASH);
        expect(AGGRESSIVE_RETRY_POLICY.retryableErrors).toContain(BuildErrorType.WORKSPACE_ERROR);
      });
    });

    describe('NO_RETRY_POLICY', () => {
      it('should disable all retries', () => {
        expect(NO_RETRY_POLICY.maxRetries).toBe(0);
        expect(NO_RETRY_POLICY.retryableErrors).toHaveLength(0);
        expect(NO_RETRY_POLICY.retryOnTimeout).toBe(false);
        expect(NO_RETRY_POLICY.jitter).toBe(false);
      });
    });
  });

  describe('createRetryPolicyEngine', () => {
    it('should merge partial policy with defaults', () => {
      const engine = createRetryPolicyEngine({ maxRetries: 5 });
      const policy = engine.getPolicy();

      expect(policy.maxRetries).toBe(5);
      expect(policy.backoffMs).toBe(DEFAULT_RETRY_POLICY.backoffMs);
      expect(policy.jitter).toBe(DEFAULT_RETRY_POLICY.jitter);
    });

    it('should use all defaults when no policy provided', () => {
      const engine = createRetryPolicyEngine();
      const policy = engine.getPolicy();

      expect(policy).toEqual(DEFAULT_RETRY_POLICY);
    });
  });
});
