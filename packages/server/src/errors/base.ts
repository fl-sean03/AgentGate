/**
 * Base Error Classes.
 * Provides structured error types with proper serialization.
 *
 * (v0.2.27 - Thrust 6: Error Propagation Framework)
 */

import {
  ErrorCategory,
  ErrorCode,
  ErrorSeverity,
  ErrorContext,
  RetryPolicy,
  SerializedError,
  DEFAULT_RETRY_POLICIES,
  getCategoryForCode,
  getSeverityForCategory,
} from './types.js';

/**
 * Base error class for all AgentGate errors
 */
export class AgentGateError extends Error {
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly context: ErrorContext;
  readonly retryPolicy: RetryPolicy;
  readonly originalError?: Error;

  constructor(
    message: string,
    code: ErrorCode,
    options: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      context?: Partial<ErrorContext>;
      retryPolicy?: Partial<RetryPolicy>;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype);

    this.code = code;
    this.category = options.category ?? getCategoryForCode(code);
    this.severity = options.severity ?? getSeverityForCategory(this.category);
    this.originalError = options.cause;

    // Build context
    this.context = {
      timestamp: new Date().toISOString(),
      ...options.context,
    };

    // Merge retry policy with defaults
    const defaultPolicy = DEFAULT_RETRY_POLICIES[this.category];
    this.retryPolicy = {
      ...defaultPolicy,
      ...options.retryPolicy,
    };

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Check if this error is retryable
   */
  isRetryable(): boolean {
    return this.retryPolicy.retryable;
  }

  /**
   * Get the delay for a retry attempt
   */
  getRetryDelay(attempt: number): number {
    if (!this.retryPolicy.retryable) {
      return 0;
    }

    if (this.retryPolicy.retryAfterMs) {
      return this.retryPolicy.retryAfterMs;
    }

    const baseDelay = this.retryPolicy.baseDelayMs ?? 1000;

    if (this.retryPolicy.exponentialBackoff) {
      return baseDelay * Math.pow(2, attempt);
    }

    return baseDelay;
  }

  /**
   * Check if more retries are allowed
   */
  canRetry(attempt: number): boolean {
    if (!this.retryPolicy.retryable) {
      return false;
    }

    const maxRetries = this.retryPolicy.maxRetries ?? 3;
    return attempt < maxRetries;
  }

  /**
   * Serialize error for persistence/transmission
   */
  serialize(): SerializedError {
    const serialized: SerializedError = {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      severity: this.severity,
      context: this.context,
      retryPolicy: this.retryPolicy,
    };

    // Include stack in development
    if (process.env.NODE_ENV !== 'production') {
      serialized.stack = this.stack;
    }

    // Serialize cause chain
    if (this.originalError) {
      if (this.originalError instanceof AgentGateError) {
        serialized.cause = this.originalError.serialize();
      } else {
        serialized.cause = {
          name: this.originalError.name,
          message: this.originalError.message,
          code: ErrorCode.INTERNAL_ERROR,
          category: 'internal',
          severity: 'error',
        };
      }
    }

    return serialized;
  }

  /**
   * Create an error from serialized form
   */
  static deserialize(data: SerializedError): AgentGateError {
    const error = new AgentGateError(data.message, data.code, {
      category: data.category,
      severity: data.severity,
      context: data.context,
      retryPolicy: data.retryPolicy,
    });

    if (data.stack) {
      error.stack = data.stack;
    }

    return error;
  }

  /**
   * Create error with context for a work order
   */
  withWorkOrder(workOrderId: string): this {
    this.context.workOrderId = workOrderId;
    return this;
  }

  /**
   * Create error with context for a run
   */
  withRun(runId: string): this {
    this.context.runId = runId;
    return this;
  }

  /**
   * Create error with context for a sandbox
   */
  withSandbox(sandboxId: string): this {
    this.context.sandboxId = sandboxId;
    return this;
  }

  /**
   * Create error with operation context
   */
  withOperation(operation: string): this {
    this.context.operation = operation;
    return this;
  }

  /**
   * Create error with component context
   */
  withComponent(component: string): this {
    this.context.component = component;
    return this;
  }

  /**
   * Add metadata to context
   */
  withMetadata(metadata: Record<string, unknown>): this {
    this.context.metadata = {
      ...this.context.metadata,
      ...metadata,
    };
    return this;
  }

  /**
   * Convert any error to an AgentGateError
   */
  static from(error: unknown, defaultCode: ErrorCode = ErrorCode.INTERNAL_ERROR): AgentGateError {
    if (error instanceof AgentGateError) {
      return error;
    }

    if (error instanceof Error) {
      return new AgentGateError(error.message, defaultCode, {
        cause: error,
      });
    }

    return new AgentGateError(String(error), defaultCode);
  }

  /**
   * Wrap an error with additional context
   */
  static wrap(
    error: unknown,
    message: string,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR
  ): AgentGateError {
    const cause = error instanceof Error ? error : new Error(String(error));
    return new AgentGateError(message, code, { cause });
  }
}

// ============================================================
// Specialized Error Classes
// ============================================================

/**
 * Infrastructure errors (Docker, network, disk)
 */
export class InfrastructureError extends AgentGateError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.DOCKER_NOT_AVAILABLE,
    options: Parameters<typeof AgentGateError>[2] = {}
  ) {
    super(message, code, { ...options, category: 'infrastructure' });
  }
}

/**
 * Agent execution errors
 */
export class AgentError extends AgentGateError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.AGENT_EXECUTION_FAILED,
    options: Parameters<typeof AgentGateError>[2] = {}
  ) {
    super(message, code, { ...options, category: 'agent' });
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AgentGateError {
  readonly validationErrors: Array<{ path: string; message: string }>;

  constructor(
    message: string,
    validationErrors: Array<{ path: string; message: string }> = [],
    code: ErrorCode = ErrorCode.SCHEMA_VALIDATION_FAILED,
    options: Parameters<typeof AgentGateError>[2] = {}
  ) {
    super(message, code, { ...options, category: 'validation' });
    this.validationErrors = validationErrors;
  }

  serialize(): SerializedError {
    const base = super.serialize();
    return {
      ...base,
      context: {
        ...base.context,
        metadata: {
          ...base.context?.metadata,
          validationErrors: this.validationErrors,
        },
      },
    };
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends AgentGateError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.CONFIG_INVALID_VALUE,
    options: Parameters<typeof AgentGateError>[2] = {}
  ) {
    super(message, code, { ...options, category: 'configuration' });
  }
}

/**
 * Resource limit errors
 */
export class ResourceError extends AgentGateError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.RESOURCE_EXHAUSTED,
    options: Parameters<typeof AgentGateError>[2] = {}
  ) {
    super(message, code, { ...options, category: 'resource' });
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends AgentGateError {
  readonly timeoutMs: number;

  constructor(
    message: string,
    timeoutMs: number,
    code: ErrorCode = ErrorCode.OPERATION_TIMEOUT,
    options: Parameters<typeof AgentGateError>[2] = {}
  ) {
    super(message, code, { ...options, category: 'timeout' });
    this.timeoutMs = timeoutMs;
  }

  serialize(): SerializedError {
    const base = super.serialize();
    return {
      ...base,
      context: {
        ...base.context,
        metadata: {
          ...base.context?.metadata,
          timeoutMs: this.timeoutMs,
        },
      },
    };
  }
}

/**
 * Conflict errors
 */
export class ConflictError extends AgentGateError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.RESOURCE_CONFLICT,
    options: Parameters<typeof AgentGateError>[2] = {}
  ) {
    super(message, code, { ...options, category: 'conflict' });
  }
}

/**
 * External service errors
 */
export class ExternalServiceError extends AgentGateError {
  readonly service: string;
  readonly statusCode?: number;

  constructor(
    message: string,
    service: string,
    code: ErrorCode = ErrorCode.EXTERNAL_SERVICE_ERROR,
    options: Parameters<typeof AgentGateError>[2] & { statusCode?: number } = {}
  ) {
    super(message, code, { ...options, category: 'external' });
    this.service = service;
    this.statusCode = options.statusCode;
  }

  serialize(): SerializedError {
    const base = super.serialize();
    return {
      ...base,
      context: {
        ...base.context,
        metadata: {
          ...base.context?.metadata,
          service: this.service,
          statusCode: this.statusCode,
        },
      },
    };
  }
}

/**
 * GitHub-specific errors
 */
export class GitHubError extends ExternalServiceError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.GITHUB_API_ERROR,
    options: Parameters<typeof ExternalServiceError>[3] = {}
  ) {
    super(message, 'github', code, options);
  }

  /**
   * Create rate limit error with retry-after
   */
  static rateLimited(retryAfterMs: number): GitHubError {
    return new GitHubError('GitHub API rate limit exceeded', ErrorCode.GITHUB_RATE_LIMITED, {
      retryPolicy: { retryable: true, retryAfterMs },
    });
  }
}

/**
 * Internal/assertion errors
 */
export class InternalError extends AgentGateError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    options: Parameters<typeof AgentGateError>[2] = {}
  ) {
    super(message, code, { ...options, category: 'internal', severity: 'fatal' });
  }
}

/**
 * Assert a condition, throwing InternalError if false
 */
export function assertCondition(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new InternalError(message, ErrorCode.ASSERTION_FAILED);
  }
}

/**
 * Assert a value is not null/undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new InternalError(message, ErrorCode.ASSERTION_FAILED);
  }
}
