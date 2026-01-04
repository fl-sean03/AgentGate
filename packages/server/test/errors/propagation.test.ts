/**
 * Tests for Error Propagation Utilities.
 * (v0.2.27 - Thrust 6: Error Propagation Framework)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  logError,
  normalizeError,
  safeExecute,
  executeWithRetry,
  createErrorBoundary,
  aggregateErrors,
  ErrorHandlerChain,
  isErrorCategory,
  isErrorCode,
  isRetryableError,
  getUserMessage,
} from '../../src/errors/propagation.js';
import {
  AgentGateError,
  ValidationError,
  TimeoutError,
  GitHubError,
  InternalError,
} from '../../src/errors/base.js';
import { ErrorCode } from '../../src/errors/types.js';

describe('normalizeError', () => {
  it('should pass through AgentGateError', () => {
    const original = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR);
    const normalized = normalizeError(original);

    expect(normalized).toBe(original);
  });

  it('should convert Error to AgentGateError', () => {
    const original = new Error('Plain error');
    const normalized = normalizeError(original);

    expect(normalized).toBeInstanceOf(AgentGateError);
    expect(normalized.message).toBe('Plain error');
  });

  it('should detect timeout errors', () => {
    const original = new Error('Operation timed out');
    const normalized = normalizeError(original);

    expect(normalized).toBeInstanceOf(TimeoutError);
  });

  it('should detect docker errors', () => {
    const original = new Error('Docker daemon not running');
    const normalized = normalizeError(original);

    expect(normalized.category).toBe('infrastructure');
  });

  it('should detect github errors', () => {
    const original = new Error('GitHub API rate limit exceeded');
    const normalized = normalizeError(original);

    expect(normalized).toBeInstanceOf(GitHubError);
  });

  it('should convert string to error', () => {
    const normalized = normalizeError('String error');

    expect(normalized.message).toBe('String error');
  });
});

describe('safeExecute', () => {
  it('should return success for successful execution', async () => {
    const result = await safeExecute(() => 42);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(42);
    }
  });

  it('should return error for failed execution', async () => {
    const result = await safeExecute(() => {
      throw new Error('Failed');
    }, { log: false });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Failed');
    }
  });

  it('should handle async functions', async () => {
    const result = await safeExecute(async () => {
      await new Promise(r => setTimeout(r, 10));
      return 'async result';
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('async result');
    }
  });

  it('should rethrow when option is set', async () => {
    await expect(
      safeExecute(() => {
        throw new Error('Rethrow me');
      }, { rethrow: true, log: false })
    ).rejects.toThrow('Rethrow me');
  });

  it('should apply transform function', async () => {
    const result = await safeExecute(
      () => { throw new Error('Original'); },
      {
        log: false,
        transform: () => new ValidationError('Transformed', []),
      }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.message).toBe('Transformed');
    }
  });

  it('should add component to context', async () => {
    const result = await safeExecute(
      () => { throw new Error('Test'); },
      { log: false, component: 'TestComponent' }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.context.component).toBe('TestComponent');
    }
  });
});

describe('executeWithRetry', () => {
  it('should succeed on first try', async () => {
    const result = await executeWithRetry(() => 'success');

    expect(result.success).toBe(true);
    expect(result.value).toBe('success');
    expect(result.attempts).toBe(1);
  });

  it('should retry on retryable error', async () => {
    let attempts = 0;
    const result = await executeWithRetry(() => {
      attempts++;
      if (attempts < 3) {
        throw new AgentGateError('Temp failure', ErrorCode.DOCKER_NOT_AVAILABLE, {
          retryPolicy: { retryable: true, maxRetries: 3, baseDelayMs: 10 },
        });
      }
      return 'success';
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
  });

  it('should stop on non-retryable error', async () => {
    let attempts = 0;
    const result = await executeWithRetry(() => {
      attempts++;
      throw new AgentGateError('Fatal', ErrorCode.INTERNAL_ERROR);
    });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    let attempts = 0;

    await executeWithRetry(
      () => {
        attempts++;
        if (attempts < 2) {
          throw new AgentGateError('Temp', ErrorCode.DOCKER_NOT_AVAILABLE, {
            retryPolicy: { retryable: true, maxRetries: 3, baseDelayMs: 10 },
          });
        }
        return 'done';
      },
      { onRetry }
    );

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('should respect abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await executeWithRetry(
      () => 'should not reach',
      { signal: controller.signal }
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.AGENT_CANCELLED);
  });

  it('should respect maxRetries option', async () => {
    let attempts = 0;

    const result = await executeWithRetry(
      () => {
        attempts++;
        throw new AgentGateError('Fail', ErrorCode.DOCKER_NOT_AVAILABLE, {
          retryPolicy: { retryable: true, maxRetries: 10, baseDelayMs: 10 },
        });
      },
      { maxRetries: 2 }
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3); // Initial + 2 retries
  });
});

describe('createErrorBoundary', () => {
  it('should wrap function with error handling', async () => {
    const boundary = createErrorBoundary('TestComponent', { log: false });

    const result = await boundary(() => 42);
    expect(result).toBe(42);
  });

  it('should add component context on error', async () => {
    const boundary = createErrorBoundary('TestComponent', { log: false });

    await expect(
      boundary(() => { throw new Error('Test'); })
    ).rejects.toMatchObject({
      context: { component: 'TestComponent' },
    });
  });
});

describe('aggregateErrors', () => {
  it('should aggregate multiple errors', () => {
    const errors = [
      new Error('Error 1'),
      new Error('Error 2'),
    ];

    const aggregated = aggregateErrors(errors, 'Multiple failures');

    expect(aggregated.message).toBe('Multiple failures');
    expect(aggregated.context.metadata?.errorCount).toBe(2);
  });

  it('should use most severe category', () => {
    const errors = [
      new ValidationError('Validation', []),
      new InternalError('Internal'),
    ];

    const aggregated = aggregateErrors(errors);

    expect(aggregated.category).toBe('internal');
  });

  it('should include serialized errors in metadata', () => {
    const errors = [new Error('Test')];
    const aggregated = aggregateErrors(errors);

    expect(aggregated.context.metadata?.errors).toBeDefined();
    expect(Array.isArray(aggregated.context.metadata?.errors)).toBe(true);
  });
});

describe('ErrorHandlerChain', () => {
  it('should handle errors matching predicate', async () => {
    const handler = vi.fn();
    const chain = new ErrorHandlerChain()
      .when(e => e.code === ErrorCode.INTERNAL_ERROR, handler);

    const error = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR);
    await chain.handle(error);

    expect(handler).toHaveBeenCalledWith(error);
  });

  it('should handle by category', async () => {
    const handler = vi.fn();
    const chain = new ErrorHandlerChain()
      .forCategory('validation', handler);

    const error = new ValidationError('Test', []);
    await chain.handle(error);

    expect(handler).toHaveBeenCalled();
  });

  it('should handle by code', async () => {
    const handler = vi.fn();
    const chain = new ErrorHandlerChain()
      .forCode(ErrorCode.GITHUB_RATE_LIMITED, handler);

    const error = GitHubError.rateLimited(1000);
    await chain.handle(error);

    expect(handler).toHaveBeenCalled();
  });

  it('should handle retryable errors', async () => {
    const handler = vi.fn();
    const chain = new ErrorHandlerChain()
      .forRetryable(handler);

    const error = new AgentGateError('Test', ErrorCode.DOCKER_NOT_AVAILABLE);
    await chain.handle(error);

    expect(handler).toHaveBeenCalled();
  });

  it('should stop at first matching handler', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const chain = new ErrorHandlerChain()
      .when(() => true, first)
      .when(() => true, second);

    const error = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR);
    await chain.handle(error);

    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('should use otherwise as catch-all', async () => {
    const handler = vi.fn();
    const chain = new ErrorHandlerChain()
      .forCode(ErrorCode.DOCKER_NOT_AVAILABLE, vi.fn())
      .otherwise(handler);

    const error = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR);
    await chain.handle(error);

    expect(handler).toHaveBeenCalled();
  });
});

describe('Error predicates', () => {
  describe('isErrorCategory', () => {
    it('should return true for matching category', () => {
      const error = new ValidationError('Test', []);
      expect(isErrorCategory(error, 'validation')).toBe(true);
    });

    it('should return false for non-matching category', () => {
      const error = new ValidationError('Test', []);
      expect(isErrorCategory(error, 'internal')).toBe(false);
    });

    it('should return false for non-AgentGateError', () => {
      const error = new Error('Plain');
      expect(isErrorCategory(error, 'internal')).toBe(false);
    });
  });

  describe('isErrorCode', () => {
    it('should return true for matching code', () => {
      const error = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR);
      expect(isErrorCode(error, ErrorCode.INTERNAL_ERROR)).toBe(true);
    });

    it('should return false for non-matching code', () => {
      const error = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR);
      expect(isErrorCode(error, ErrorCode.DOCKER_NOT_AVAILABLE)).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for retryable error', () => {
      const error = new AgentGateError('Test', ErrorCode.DOCKER_NOT_AVAILABLE);
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for non-retryable error', () => {
      const error = new InternalError('Test');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for non-AgentGateError', () => {
      expect(isRetryableError(new Error())).toBe(false);
    });
  });
});

describe('getUserMessage', () => {
  it('should return message from AgentGateError', () => {
    const error = new AgentGateError('User-friendly message', ErrorCode.INTERNAL_ERROR);
    expect(getUserMessage(error)).toBe('User-friendly message');
  });

  it('should include validation errors', () => {
    const error = new ValidationError('Invalid input', [
      { path: 'name', message: 'Name is required' },
    ]);

    const message = getUserMessage(error);
    expect(message).toContain('Invalid input');
    expect(message).toContain('Name is required');
  });

  it('should return message from plain Error', () => {
    const error = new Error('Plain message');
    expect(getUserMessage(error)).toBe('Plain message');
  });

  it('should convert non-error to string', () => {
    expect(getUserMessage('string error')).toBe('string error');
    expect(getUserMessage(42)).toBe('42');
  });
});
