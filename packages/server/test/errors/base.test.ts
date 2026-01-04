/**
 * Tests for Base Error Classes.
 * (v0.2.27 - Thrust 6: Error Propagation Framework)
 */

import { describe, it, expect } from 'vitest';
import {
  AgentGateError,
  InfrastructureError,
  AgentError,
  ValidationError,
  ConfigurationError,
  ResourceError,
  TimeoutError,
  ConflictError,
  ExternalServiceError,
  GitHubError,
  InternalError,
  assertCondition,
  assertDefined,
} from '../../src/errors/base.js';
import { ErrorCode } from '../../src/errors/types.js';

describe('AgentGateError', () => {
  describe('constructor', () => {
    it('should create error with message and code', () => {
      const error = new AgentGateError('Test error', ErrorCode.INTERNAL_ERROR);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.category).toBe('internal');
    });

    it('should infer category from code', () => {
      const infraError = new AgentGateError('Infra', ErrorCode.DOCKER_NOT_AVAILABLE);
      expect(infraError.category).toBe('infrastructure');

      const agentError = new AgentGateError('Agent', ErrorCode.AGENT_EXECUTION_FAILED);
      expect(agentError.category).toBe('agent');

      const validationError = new AgentGateError('Validation', ErrorCode.INVALID_WORK_ORDER);
      expect(validationError.category).toBe('validation');
    });

    it('should allow overriding category', () => {
      const error = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR, {
        category: 'validation',
      });

      expect(error.category).toBe('validation');
    });

    it('should include timestamp in context', () => {
      const error = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR);

      expect(error.context.timestamp).toBeDefined();
      expect(new Date(error.context.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should include cause if provided', () => {
      const cause = new Error('Original error');
      const error = new AgentGateError('Wrapped', ErrorCode.INTERNAL_ERROR, { cause });

      expect(error.originalError).toBe(cause);
    });
  });

  describe('retry policy', () => {
    it('should use default retry policy for category', () => {
      const error = new AgentGateError('Test', ErrorCode.DOCKER_NOT_AVAILABLE);

      expect(error.retryPolicy.retryable).toBe(true);
      expect(error.retryPolicy.maxRetries).toBe(3);
    });

    it('should allow overriding retry policy', () => {
      const error = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR, {
        retryPolicy: { retryable: true, maxRetries: 5 },
      });

      expect(error.retryPolicy.retryable).toBe(true);
      expect(error.retryPolicy.maxRetries).toBe(5);
    });

    it('should check if retryable', () => {
      const retryable = new AgentGateError('Test', ErrorCode.DOCKER_NOT_AVAILABLE);
      const notRetryable = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR);

      expect(retryable.isRetryable()).toBe(true);
      expect(notRetryable.isRetryable()).toBe(false);
    });

    it('should calculate retry delay with exponential backoff', () => {
      const error = new AgentGateError('Test', ErrorCode.DOCKER_NOT_AVAILABLE, {
        retryPolicy: { retryable: true, baseDelayMs: 1000, exponentialBackoff: true },
      });

      expect(error.getRetryDelay(0)).toBe(1000);
      expect(error.getRetryDelay(1)).toBe(2000);
      expect(error.getRetryDelay(2)).toBe(4000);
    });

    it('should use fixed delay when exponential backoff is off', () => {
      const error = new AgentGateError('Test', ErrorCode.DOCKER_NOT_AVAILABLE, {
        retryPolicy: { retryable: true, baseDelayMs: 1000, exponentialBackoff: false },
      });

      expect(error.getRetryDelay(0)).toBe(1000);
      expect(error.getRetryDelay(1)).toBe(1000);
      expect(error.getRetryDelay(2)).toBe(1000);
    });

    it('should use retryAfterMs when provided', () => {
      const error = new AgentGateError('Test', ErrorCode.GITHUB_RATE_LIMITED, {
        retryPolicy: { retryable: true, retryAfterMs: 60000 },
      });

      expect(error.getRetryDelay(0)).toBe(60000);
      expect(error.getRetryDelay(1)).toBe(60000);
    });

    it('should check if can retry', () => {
      const error = new AgentGateError('Test', ErrorCode.DOCKER_NOT_AVAILABLE, {
        retryPolicy: { retryable: true, maxRetries: 3 },
      });

      expect(error.canRetry(0)).toBe(true);
      expect(error.canRetry(1)).toBe(true);
      expect(error.canRetry(2)).toBe(true);
      expect(error.canRetry(3)).toBe(false);
    });
  });

  describe('serialization', () => {
    it('should serialize error', () => {
      const error = new AgentGateError('Test error', ErrorCode.INTERNAL_ERROR);
      const serialized = error.serialize();

      expect(serialized.name).toBe('AgentGateError');
      expect(serialized.message).toBe('Test error');
      expect(serialized.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(serialized.category).toBe('internal');
      expect(serialized.context).toBeDefined();
    });

    it('should serialize cause chain', () => {
      const cause = new AgentGateError('Cause', ErrorCode.DOCKER_NOT_AVAILABLE);
      const error = new AgentGateError('Wrapper', ErrorCode.INTERNAL_ERROR, { cause });
      const serialized = error.serialize();

      expect(serialized.cause).toBeDefined();
      expect(serialized.cause?.message).toBe('Cause');
      expect(serialized.cause?.code).toBe(ErrorCode.DOCKER_NOT_AVAILABLE);
    });

    it('should deserialize error', () => {
      const original = new AgentGateError('Test', ErrorCode.AGENT_EXECUTION_FAILED);
      const serialized = original.serialize();
      const restored = AgentGateError.deserialize(serialized);

      expect(restored.message).toBe('Test');
      expect(restored.code).toBe(ErrorCode.AGENT_EXECUTION_FAILED);
      expect(restored.category).toBe('agent');
    });
  });

  describe('context methods', () => {
    it('should add work order context', () => {
      const error = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR);
      error.withWorkOrder('wo-123');

      expect(error.context.workOrderId).toBe('wo-123');
    });

    it('should add run context', () => {
      const error = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR);
      error.withRun('run-456');

      expect(error.context.runId).toBe('run-456');
    });

    it('should add sandbox context', () => {
      const error = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR);
      error.withSandbox('sandbox-789');

      expect(error.context.sandboxId).toBe('sandbox-789');
    });

    it('should chain context methods', () => {
      const error = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR)
        .withWorkOrder('wo-123')
        .withRun('run-456')
        .withOperation('execute')
        .withComponent('executor');

      expect(error.context.workOrderId).toBe('wo-123');
      expect(error.context.runId).toBe('run-456');
      expect(error.context.operation).toBe('execute');
      expect(error.context.component).toBe('executor');
    });

    it('should add metadata', () => {
      const error = new AgentGateError('Test', ErrorCode.INTERNAL_ERROR);
      error.withMetadata({ key: 'value', count: 42 });

      expect(error.context.metadata?.key).toBe('value');
      expect(error.context.metadata?.count).toBe(42);
    });
  });

  describe('static helpers', () => {
    it('should create from Error', () => {
      const original = new Error('Original');
      const error = AgentGateError.from(original);

      expect(error.message).toBe('Original');
      expect(error.originalError).toBe(original);
    });

    it('should pass through AgentGateError', () => {
      const original = new AgentGateError('Test', ErrorCode.AGENT_CANCELLED);
      const error = AgentGateError.from(original);

      expect(error).toBe(original);
    });

    it('should create from string', () => {
      const error = AgentGateError.from('String error');

      expect(error.message).toBe('String error');
    });

    it('should wrap error with message', () => {
      const cause = new Error('Cause');
      const wrapped = AgentGateError.wrap(cause, 'Wrapped message');

      expect(wrapped.message).toBe('Wrapped message');
      expect(wrapped.originalError).toBe(cause);
    });
  });
});

describe('Specialized Error Classes', () => {
  describe('InfrastructureError', () => {
    it('should have infrastructure category', () => {
      const error = new InfrastructureError('Docker failed');

      expect(error.category).toBe('infrastructure');
      expect(error.isRetryable()).toBe(true);
    });
  });

  describe('AgentError', () => {
    it('should have agent category', () => {
      const error = new AgentError('Agent crashed');

      expect(error.category).toBe('agent');
      expect(error.isRetryable()).toBe(false);
    });
  });

  describe('ValidationError', () => {
    it('should include validation errors', () => {
      const error = new ValidationError('Invalid input', [
        { path: 'name', message: 'Name is required' },
        { path: 'email', message: 'Invalid email format' },
      ]);

      expect(error.validationErrors).toHaveLength(2);
      expect(error.validationErrors[0]?.path).toBe('name');
    });

    it('should serialize validation errors', () => {
      const error = new ValidationError('Invalid', [
        { path: 'field', message: 'Error' },
      ]);
      const serialized = error.serialize();

      expect(serialized.context?.metadata?.validationErrors).toBeDefined();
    });
  });

  describe('TimeoutError', () => {
    it('should include timeout value', () => {
      const error = new TimeoutError('Operation timed out', 5000);

      expect(error.timeoutMs).toBe(5000);
    });

    it('should serialize timeout value', () => {
      const error = new TimeoutError('Timeout', 10000);
      const serialized = error.serialize();

      expect(serialized.context?.metadata?.timeoutMs).toBe(10000);
    });
  });

  describe('GitHubError', () => {
    it('should create rate limit error', () => {
      const error = GitHubError.rateLimited(60000);

      expect(error.code).toBe(ErrorCode.GITHUB_RATE_LIMITED);
      expect(error.retryPolicy.retryAfterMs).toBe(60000);
    });
  });

  describe('ExternalServiceError', () => {
    it('should include service name', () => {
      const error = new ExternalServiceError('API failed', 'github');

      expect(error.service).toBe('github');
    });

    it('should include status code', () => {
      const error = new ExternalServiceError('API failed', 'github', ErrorCode.EXTERNAL_SERVICE_ERROR, {
        statusCode: 503,
      });

      expect(error.statusCode).toBe(503);
    });
  });
});

describe('Assertions', () => {
  describe('assertCondition', () => {
    it('should pass for truthy condition', () => {
      expect(() => assertCondition(true, 'Should pass')).not.toThrow();
      expect(() => assertCondition(1, 'Should pass')).not.toThrow();
      expect(() => assertCondition('string', 'Should pass')).not.toThrow();
    });

    it('should throw for falsy condition', () => {
      expect(() => assertCondition(false, 'Condition failed')).toThrow(InternalError);
      expect(() => assertCondition(0, 'Zero failed')).toThrow(InternalError);
      expect(() => assertCondition('', 'Empty failed')).toThrow(InternalError);
    });

    it('should throw with assertion failed code', () => {
      try {
        assertCondition(false, 'Test');
      } catch (error) {
        expect(error).toBeInstanceOf(InternalError);
        expect((error as InternalError).code).toBe(ErrorCode.ASSERTION_FAILED);
      }
    });
  });

  describe('assertDefined', () => {
    it('should pass for defined values', () => {
      expect(() => assertDefined('value', 'Should pass')).not.toThrow();
      expect(() => assertDefined(0, 'Should pass')).not.toThrow();
      expect(() => assertDefined(false, 'Should pass')).not.toThrow();
    });

    it('should throw for null', () => {
      expect(() => assertDefined(null, 'Null failed')).toThrow(InternalError);
    });

    it('should throw for undefined', () => {
      expect(() => assertDefined(undefined, 'Undefined failed')).toThrow(InternalError);
    });
  });
});
