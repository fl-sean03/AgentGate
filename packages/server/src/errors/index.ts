/**
 * Errors Module
 *
 * Provides a structured error hierarchy and propagation utilities.
 * (v0.2.27 - Thrust 6: Error Propagation Framework)
 */

// Types
export {
  ErrorCategory,
  ErrorSeverity,
  ErrorCode,
  RetryPolicy,
  ErrorContext,
  SerializedError,
  DEFAULT_RETRY_POLICIES,
  getCategoryForCode,
  getSeverityForCategory,
} from './types.js';

// Base error classes
export {
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
} from './base.js';

// Error propagation utilities
export {
  logError,
  normalizeError,
  safeExecute,
  executeWithRetry,
  createErrorBoundary,
  aggregateErrors,
  ErrorHandlerChain,
  parseSerializedError,
  isErrorCategory,
  isErrorCode,
  isRetryableError,
  getUserMessage,
  type ErrorHandler,
  type RecoveryResult,
  type ErrorHandlingOptions,
} from './propagation.js';
