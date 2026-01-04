/**
 * Tests for AbortSignal-based timeout utilities.
 * (v0.2.27 - Thrust 2: AbortSignal-Based Timeout System)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TimeoutError,
  AbortError,
  createTimeout,
  withTimeout,
  checkAborted,
  isTimeoutError,
  isAbortError,
  sleep,
  linkSignals,
  createCombinedSignal,
  raceWithSignal,
  executeWithTimeout,
  retryWithTimeout,
} from '../../src/utils/timeout.js';

describe('Timeout Utilities', () => {
  describe('TimeoutError', () => {
    it('should create a timeout error with message and duration', () => {
      const error = new TimeoutError('Test timeout', 5000);

      expect(error.message).toBe('Test timeout');
      expect(error.timeoutMs).toBe(5000);
      expect(error.name).toBe('TimeoutError');
      expect(error.code).toBe('ETIMEDOUT');
      expect(error.isTimeout).toBe(true);
    });

    it('should include signal if provided', () => {
      const controller = new AbortController();
      const error = new TimeoutError('Test', 1000, controller.signal);

      expect(error.signal).toBe(controller.signal);
    });
  });

  describe('AbortError', () => {
    it('should create an abort error with default message', () => {
      const error = new AbortError();

      expect(error.message).toBe('Operation was aborted');
      expect(error.name).toBe('AbortError');
      expect(error.code).toBe('EABORTED');
      expect(error.isAborted).toBe(true);
    });

    it('should create an abort error with custom message and reason', () => {
      const reason = { code: 'USER_CANCEL' };
      const error = new AbortError('User canceled', reason);

      expect(error.message).toBe('User canceled');
      expect(error.reason).toEqual(reason);
    });
  });

  describe('createTimeout', () => {
    it('should return signal, cancel, and controller', () => {
      const result = createTimeout(1000);

      expect(result.signal).toBeInstanceOf(AbortSignal);
      expect(typeof result.cancel).toBe('function');
      expect(result.controller).toBeInstanceOf(AbortController);

      // Clean up
      result.cancel();
    });

    it('should abort signal after timeout', async () => {
      const { signal, cancel } = createTimeout(50);

      expect(signal.aborted).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBeInstanceOf(TimeoutError);

      cancel();
    });

    it('should not abort signal if canceled before timeout', async () => {
      const { signal, cancel } = createTimeout(100);

      expect(signal.aborted).toBe(false);

      cancel();

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(signal.aborted).toBe(false);
    });

    it('should include custom reason in TimeoutError', async () => {
      const { signal, cancel } = createTimeout(50, 'Custom timeout reason');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(signal.aborted).toBe(true);
      const error = signal.reason as TimeoutError;
      expect(error.message).toBe('Custom timeout reason');

      cancel();
    });
  });

  describe('withTimeout', () => {
    it('should resolve if promise completes before timeout', async () => {
      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 50);
      });

      const result = await withTimeout(promise, 200);

      expect(result).toBe('success');
    });

    it('should reject with TimeoutError if timeout expires', async () => {
      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 200);
      });

      await expect(withTimeout(promise, 50)).rejects.toThrow(TimeoutError);
    });

    it('should use custom message in TimeoutError', async () => {
      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 200);
      });

      await expect(withTimeout(promise, 50, 'Custom message')).rejects.toThrow('Custom message');
    });

    it('should propagate original error if promise rejects', async () => {
      const promise = Promise.reject(new Error('Original error'));

      await expect(withTimeout(promise, 1000)).rejects.toThrow('Original error');
    });
  });

  describe('checkAborted', () => {
    it('should not throw if signal is not aborted', () => {
      const controller = new AbortController();

      expect(() => checkAborted(controller.signal)).not.toThrow();
    });

    it('should not throw if signal is undefined', () => {
      expect(() => checkAborted(undefined)).not.toThrow();
    });

    it('should throw the signal reason if it is an Error', () => {
      const controller = new AbortController();
      const customError = new Error('Custom abort reason');
      controller.abort(customError);

      expect(() => checkAborted(controller.signal)).toThrow(customError);
    });

    it('should throw AbortError with string reason', () => {
      const controller = new AbortController();
      controller.abort('String reason');

      expect(() => checkAborted(controller.signal)).toThrow(AbortError);
    });
  });

  describe('isTimeoutError', () => {
    it('should return true for TimeoutError instances', () => {
      const error = new TimeoutError('Test', 1000);
      expect(isTimeoutError(error)).toBe(true);
    });

    it('should return true for objects with isTimeout property', () => {
      // Create an actual Error with the isTimeout property
      const error = Object.assign(new Error('test'), { isTimeout: true });
      expect(isTimeoutError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isTimeoutError(new Error('test'))).toBe(false);
    });

    it('should return false for non-errors', () => {
      expect(isTimeoutError(null)).toBe(false);
      expect(isTimeoutError('string')).toBe(false);
    });
  });

  describe('isAbortError', () => {
    it('should return true for AbortError instances', () => {
      const error = new AbortError();
      expect(isAbortError(error)).toBe(true);
    });

    it('should return true for objects with isAborted property', () => {
      // Create an actual Error with the isAborted property
      const error = Object.assign(new Error('test'), { isAborted: true });
      expect(isAbortError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isAbortError(new Error('test'))).toBe(false);
    });
  });

  describe('sleep', () => {
    it('should resolve after specified duration', async () => {
      const start = Date.now();

      await sleep(50);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow small timing variance
    });

    it('should reject immediately if signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort(new AbortError('Pre-aborted'));

      await expect(sleep(1000, controller.signal)).rejects.toThrow(AbortError);
    });

    it('should reject when signal is aborted during sleep', async () => {
      const controller = new AbortController();

      const sleepPromise = sleep(200, controller.signal);

      setTimeout(() => controller.abort(new AbortError('Aborted mid-sleep')), 50);

      await expect(sleepPromise).rejects.toThrow(AbortError);
    });

    it('should not reject if signal is aborted after sleep completes', async () => {
      const controller = new AbortController();

      await sleep(50, controller.signal);

      controller.abort();
      // Should not throw
    });
  });

  describe('linkSignals', () => {
    it('should abort when any linked signal aborts', async () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const linked = linkSignals([controller1.signal, controller2.signal]);

      expect(linked.signal.aborted).toBe(false);

      controller1.abort(new AbortError('Controller 1 aborted'));

      expect(linked.signal.aborted).toBe(true);
    });

    it('should be aborted immediately if any input signal is already aborted', () => {
      const controller1 = new AbortController();
      controller1.abort();

      const controller2 = new AbortController();

      const linked = linkSignals([controller1.signal, controller2.signal]);

      expect(linked.signal.aborted).toBe(true);
    });

    it('should preserve abort reason', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const linked = linkSignals([controller1.signal, controller2.signal]);

      const customError = new Error('Custom reason');
      controller2.abort(customError);

      expect(linked.signal.reason).toBe(customError);
    });
  });

  describe('createCombinedSignal', () => {
    it('should create a signal with timeout', async () => {
      const { signal, cancel } = createCombinedSignal(50);

      expect(signal.aborted).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(signal.aborted).toBe(true);

      cancel();
    });

    it('should abort when external signal aborts', async () => {
      const external = new AbortController();
      const { signal, cancel } = createCombinedSignal(1000, external.signal);

      expect(signal.aborted).toBe(false);

      external.abort();

      expect(signal.aborted).toBe(true);

      cancel();
    });

    it('should be immediately aborted if external signal is already aborted', () => {
      const external = new AbortController();
      external.abort();

      const { signal, cancel } = createCombinedSignal(1000, external.signal);

      expect(signal.aborted).toBe(true);

      cancel();
    });
  });

  describe('raceWithSignal', () => {
    it('should return promise result if completes before abort', async () => {
      const controller = new AbortController();
      const promise = Promise.resolve('success');

      const result = await raceWithSignal(promise, controller.signal);

      expect(result).toBe('success');
    });

    it('should reject if signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort(new AbortError('Already aborted'));

      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 100);
      });

      await expect(raceWithSignal(promise, controller.signal)).rejects.toThrow(AbortError);
    });

    it('should reject when signal aborts before promise resolves', async () => {
      const controller = new AbortController();
      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 200);
      });

      const racePromise = raceWithSignal(promise, controller.signal);

      setTimeout(() => controller.abort(new AbortError('Aborted')), 50);

      await expect(racePromise).rejects.toThrow(AbortError);
    });
  });

  describe('executeWithTimeout', () => {
    it('should pass signal to function', async () => {
      let receivedSignal: AbortSignal | undefined;

      await executeWithTimeout(
        (signal) => {
          receivedSignal = signal;
          return Promise.resolve('success');
        },
        1000
      );

      expect(receivedSignal).toBeDefined();
      expect(receivedSignal?.aborted).toBe(false);
    });

    it('should timeout if function takes too long', async () => {
      const fn = async (signal: AbortSignal) => {
        await sleep(200, signal);
        return 'success';
      };

      await expect(executeWithTimeout(fn, 50)).rejects.toThrow(TimeoutError);
    });

    it('should return result if function completes in time', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'success';
      };

      const result = await executeWithTimeout(fn, 1000);

      expect(result).toBe('success');
    });
  });

  describe('retryWithTimeout', () => {
    it('should retry on failure', async () => {
      let attempts = 0;

      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await retryWithTimeout(fn, 1000, {
        maxAttempts: 5,
        baseDelayMs: 10,
      });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw after max attempts exhausted', async () => {
      let attempts = 0;

      const fn = async () => {
        attempts++;
        throw new Error('Always fails');
      };

      await expect(
        retryWithTimeout(fn, 1000, {
          maxAttempts: 3,
          baseDelayMs: 10,
        })
      ).rejects.toThrow('Always fails');

      expect(attempts).toBe(3);
    });

    it('should not retry non-retryable errors', async () => {
      let attempts = 0;

      const fn = async () => {
        attempts++;
        throw new Error('Non-retryable');
      };

      await expect(
        retryWithTimeout(fn, 1000, {
          maxAttempts: 5,
          baseDelayMs: 10,
          isRetryable: (err) => !(err instanceof Error && err.message === 'Non-retryable'),
        })
      ).rejects.toThrow('Non-retryable');

      expect(attempts).toBe(1);
    });

    it('should stop retrying when signal is aborted', async () => {
      const controller = new AbortController();
      let attempts = 0;

      const fn = async () => {
        attempts++;
        throw new Error('Temporary failure');
      };

      const promise = retryWithTimeout(
        fn,
        1000,
        {
          maxAttempts: 10,
          baseDelayMs: 100,
        },
        controller.signal
      );

      // Abort after first attempt (during delay between retries)
      setTimeout(() => controller.abort(), 50);

      // The abort could happen during sleep, throwing AbortError, or throw the last error
      await expect(promise).rejects.toThrow();
      expect(attempts).toBeLessThan(10);
    });

    it('should use exponential backoff by default', async () => {
      const delays: number[] = [];
      let lastCallTime = Date.now();
      let attempts = 0;

      const fn = async () => {
        const now = Date.now();
        if (attempts > 0) {
          delays.push(now - lastCallTime);
        }
        lastCallTime = now;
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      await retryWithTimeout(fn, 1000, {
        maxAttempts: 5,
        baseDelayMs: 50,
        exponentialBackoff: true,
      });

      // Second delay should be longer than first (exponential backoff)
      if (delays.length >= 2) {
        expect(delays[1]!).toBeGreaterThan(delays[0]!);
      }
    });
  });
});
