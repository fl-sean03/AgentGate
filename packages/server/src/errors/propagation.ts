/**
 * Error Propagation Utilities.
 * Provides helpers for error handling, logging, and propagation.
 *
 * (v0.2.27 - Thrust 6: Error Propagation Framework)
 */

import { createLogger } from '../utils/logger.js';
import {
  AgentGateError,
  InfrastructureError,
  AgentError,
  ValidationError,
  ResourceError,
  TimeoutError,
  ConflictError,
  ExternalServiceError,
  GitHubError,
  InternalError,
} from './base.js';
import {
  ErrorCode,
  ErrorCategory,
  SerializedError,
} from './types.js';

const log = createLogger('error-propagation');

/**
 * Error handler function type
 */
export type ErrorHandler<T = void> = (error: AgentGateError) => T | Promise<T>;

/**
 * Result type for error recovery
 */
export interface RecoveryResult<T> {
  success: boolean;
  value?: T;
  error?: AgentGateError;
  attempts: number;
}

/**
 * Options for error handling
 */
export interface ErrorHandlingOptions {
  /** Log the error */
  log?: boolean;
  /** Rethrow after handling */
  rethrow?: boolean;
  /** Transform error before handling */
  transform?: (error: Error) => AgentGateError;
  /** Default error code if unknown */
  defaultCode?: ErrorCode;
  /** Component name for context */
  component?: string;
}

/**
 * Log an error with appropriate level based on severity
 */
export function logError(error: AgentGateError): void {
  const logData = {
    code: error.code,
    category: error.category,
    ...error.context,
  };

  switch (error.severity) {
    case 'fatal':
      log.fatal(logData, error.message);
      break;
    case 'error':
      log.error(logData, error.message);
      break;
    case 'warning':
      log.warn(logData, error.message);
      break;
    case 'info':
      log.info(logData, error.message);
      break;
  }
}

/**
 * Normalize any error to AgentGateError
 */
export function normalizeError(
  error: unknown,
  defaultCode: ErrorCode = ErrorCode.INTERNAL_ERROR
): AgentGateError {
  if (error instanceof AgentGateError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for known error patterns
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return new TimeoutError(error.message, 0, ErrorCode.OPERATION_TIMEOUT, { cause: error });
    }

    if (message.includes('docker')) {
      return new InfrastructureError(error.message, ErrorCode.DOCKER_NOT_AVAILABLE, { cause: error });
    }

    if (message.includes('github') || message.includes('rate limit')) {
      return new GitHubError(error.message, ErrorCode.GITHUB_API_ERROR, { cause: error });
    }

    if (message.includes('conflict')) {
      return new ConflictError(error.message, ErrorCode.RESOURCE_CONFLICT, { cause: error });
    }

    return AgentGateError.from(error, defaultCode);
  }

  return new AgentGateError(String(error), defaultCode);
}

/**
 * Safe execution wrapper that catches and normalizes errors
 */
export async function safeExecute<T>(
  fn: () => T | Promise<T>,
  options: ErrorHandlingOptions = {}
): Promise<{ success: true; value: T } | { success: false; error: AgentGateError }> {
  try {
    const value = await fn();
    return { success: true, value };
  } catch (err) {
    let error = normalizeError(err, options.defaultCode);

    if (options.transform) {
      const original = err instanceof Error ? err : new Error(String(err));
      error = options.transform(original);
    }

    if (options.component) {
      error.withComponent(options.component);
    }

    if (options.log !== false) {
      logError(error);
    }

    if (options.rethrow) {
      throw error;
    }

    return { success: false, error };
  }
}

/**
 * Execute with automatic retry based on error's retry policy
 */
export async function executeWithRetry<T>(
  fn: () => T | Promise<T>,
  options: {
    maxRetries?: number;
    onRetry?: (error: AgentGateError, attempt: number) => void | Promise<void>;
    signal?: AbortSignal;
  } = {}
): Promise<RecoveryResult<T>> {
  const maxRetries = options.maxRetries ?? 3;
  let lastError: AgentGateError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check for abort
    if (options.signal?.aborted) {
      return {
        success: false,
        error: new AgentGateError('Operation aborted', ErrorCode.AGENT_CANCELLED),
        attempts: attempt,
      };
    }

    try {
      const value = await fn();
      return { success: true, value, attempts: attempt + 1 };
    } catch (err) {
      lastError = normalizeError(err);

      // Check if retryable
      if (!lastError.canRetry(attempt)) {
        return { success: false, error: lastError, attempts: attempt + 1 };
      }

      // Notify retry callback
      if (options.onRetry) {
        await options.onRetry(lastError, attempt);
      }

      // Wait before retry
      const delay = lastError.getRetryDelay(attempt);
      if (delay > 0) {
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(resolve, delay);
          options.signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new Error('Aborted during retry delay'));
          });
        });
      }
    }
  }

  return {
    success: false,
    error: lastError ?? new InternalError('Retry loop exited unexpectedly'),
    attempts: maxRetries + 1,
  };
}

/**
 * Create an error boundary for a component
 */
export function createErrorBoundary(
  component: string,
  options: ErrorHandlingOptions = {}
): <T>(fn: () => T | Promise<T>) => Promise<T> {
  return async <T>(fn: () => T | Promise<T>): Promise<T> => {
    const result = await safeExecute(fn, { ...options, component, rethrow: true });
    if (!result.success) {
      throw result.error;
    }
    return result.value;
  };
}

/**
 * Aggregate multiple errors into one
 */
export function aggregateErrors(
  errors: Error[],
  message: string = 'Multiple errors occurred'
): AgentGateError {
  const normalizedErrors = errors.map(e => normalizeError(e));

  // Determine the most severe category
  const categoryPriority: ErrorCategory[] = [
    'internal', 'infrastructure', 'agent', 'external',
    'resource', 'timeout', 'conflict', 'validation', 'configuration',
  ];

  let mostSevereCategory: ErrorCategory = 'internal';
  let mostSevereCode: ErrorCode = ErrorCode.INTERNAL_ERROR;

  for (const error of normalizedErrors) {
    const currentPriority = categoryPriority.indexOf(error.category);
    const severePriority = categoryPriority.indexOf(mostSevereCategory);

    if (currentPriority < severePriority) {
      mostSevereCategory = error.category;
      mostSevereCode = error.code;
    }
  }

  const aggregated = new AgentGateError(message, mostSevereCode, {
    category: mostSevereCategory,
    context: {
      metadata: {
        errorCount: errors.length,
        errors: normalizedErrors.map(e => e.serialize()),
      },
    },
  });

  return aggregated;
}

/**
 * Chain of error handlers
 */
export class ErrorHandlerChain {
  private handlers: Array<{
    predicate: (error: AgentGateError) => boolean;
    handler: ErrorHandler;
  }> = [];

  /**
   * Add a handler for errors matching predicate
   */
  when(
    predicate: (error: AgentGateError) => boolean,
    handler: ErrorHandler
  ): this {
    this.handlers.push({ predicate, handler });
    return this;
  }

  /**
   * Add a handler for errors of a specific category
   */
  forCategory(category: ErrorCategory, handler: ErrorHandler): this {
    return this.when(e => e.category === category, handler);
  }

  /**
   * Add a handler for errors with a specific code
   */
  forCode(code: ErrorCode, handler: ErrorHandler): this {
    return this.when(e => e.code === code, handler);
  }

  /**
   * Add a handler for retryable errors
   */
  forRetryable(handler: ErrorHandler): this {
    return this.when(e => e.isRetryable(), handler);
  }

  /**
   * Add a catch-all handler
   */
  otherwise(handler: ErrorHandler): this {
    return this.when(() => true, handler);
  }

  /**
   * Handle an error through the chain
   */
  async handle(error: AgentGateError): Promise<void> {
    for (const { predicate, handler } of this.handlers) {
      if (predicate(error)) {
        await handler(error);
        return;
      }
    }
  }
}

/**
 * Parse error from serialized form
 */
export function parseSerializedError(data: SerializedError): AgentGateError {
  return AgentGateError.deserialize(data);
}

/**
 * Check if an error is of a specific type
 */
export function isErrorCategory(error: unknown, category: ErrorCategory): boolean {
  if (error instanceof AgentGateError) {
    return error.category === category;
  }
  return false;
}

/**
 * Check if an error has a specific code
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  if (error instanceof AgentGateError) {
    return error.code === code;
  }
  return false;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AgentGateError) {
    return error.isRetryable();
  }
  return false;
}

/**
 * Extract a user-friendly message from an error
 */
export function getUserMessage(error: unknown): string {
  if (error instanceof AgentGateError) {
    // For validation errors, include field-level messages
    if (error instanceof ValidationError && error.validationErrors.length > 0) {
      return `${error.message}: ${error.validationErrors.map(e => e.message).join(', ')}`;
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
