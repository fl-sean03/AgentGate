/**
 * Error Types and Categories.
 * Provides a structured error hierarchy for the system.
 *
 * (v0.2.27 - Thrust 6: Error Propagation Framework)
 */

/**
 * Error category for classification
 */
export type ErrorCategory =
  | 'infrastructure' // System infrastructure (Docker, network, disk)
  | 'agent' // Agent execution errors
  | 'validation' // Input validation errors
  | 'configuration' // Configuration errors
  | 'resource' // Resource limit/allocation errors
  | 'timeout' // Timeout errors
  | 'conflict' // Merge/resource conflicts
  | 'external' // External service errors (GitHub, APIs)
  | 'internal'; // Internal/unexpected errors

/**
 * Error severity level
 */
export type ErrorSeverity =
  | 'fatal' // Unrecoverable, requires intervention
  | 'error' // Error that failed the operation
  | 'warning' // Degraded operation, but continued
  | 'info'; // Informational (not really an error)

/**
 * Error codes for specific error types
 */
export enum ErrorCode {
  // Infrastructure errors (1xxx)
  DOCKER_NOT_AVAILABLE = 1001,
  DOCKER_CONTAINER_FAILED = 1002,
  DOCKER_IMAGE_NOT_FOUND = 1003,
  DOCKER_NETWORK_ERROR = 1004,
  FILESYSTEM_ERROR = 1005,
  PROCESS_SPAWN_FAILED = 1006,
  NETWORK_UNREACHABLE = 1007,

  // Agent errors (2xxx)
  AGENT_EXECUTION_FAILED = 2001,
  AGENT_TIMEOUT = 2002,
  AGENT_CRASHED = 2003,
  AGENT_CANCELLED = 2004,
  AGENT_INVALID_OUTPUT = 2005,
  AGENT_QUOTA_EXCEEDED = 2006,

  // Validation errors (3xxx)
  INVALID_WORK_ORDER = 3001,
  INVALID_PROMPT = 3002,
  INVALID_WORKSPACE = 3003,
  INVALID_BRANCH = 3004,
  INVALID_CONFIGURATION = 3005,
  SCHEMA_VALIDATION_FAILED = 3006,

  // Configuration errors (4xxx)
  CONFIG_NOT_FOUND = 4001,
  CONFIG_PARSE_ERROR = 4002,
  CONFIG_INVALID_VALUE = 4003,
  MISSING_REQUIRED_CONFIG = 4004,

  // Resource errors (5xxx)
  RESOURCE_EXHAUSTED = 5001,
  MEMORY_LIMIT_EXCEEDED = 5002,
  DISK_LIMIT_EXCEEDED = 5003,
  CPU_LIMIT_EXCEEDED = 5004,
  SLOT_NOT_AVAILABLE = 5005,
  QUEUE_FULL = 5006,

  // Timeout errors (6xxx)
  EXECUTION_TIMEOUT = 6001,
  OPERATION_TIMEOUT = 6002,
  IDLE_TIMEOUT = 6003,
  SHUTDOWN_TIMEOUT = 6004,

  // Conflict errors (7xxx)
  MERGE_CONFLICT = 7001,
  RESOURCE_CONFLICT = 7002,
  STATE_CONFLICT = 7003,
  CONCURRENT_MODIFICATION = 7004,

  // External service errors (8xxx)
  GITHUB_API_ERROR = 8001,
  GITHUB_RATE_LIMITED = 8002,
  GITHUB_AUTH_FAILED = 8003,
  GITHUB_REPO_NOT_FOUND = 8004,
  EXTERNAL_SERVICE_ERROR = 8005,

  // Internal errors (9xxx)
  INTERNAL_ERROR = 9001,
  STATE_MACHINE_ERROR = 9002,
  SERIALIZATION_ERROR = 9003,
  UNEXPECTED_STATE = 9004,
  ASSERTION_FAILED = 9005,
}

/**
 * Retry policy for errors
 */
export interface RetryPolicy {
  /** Whether this error is retryable */
  retryable: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Base delay in milliseconds */
  baseDelayMs?: number;
  /** Use exponential backoff */
  exponentialBackoff?: boolean;
  /** Retry-After header value (for rate limiting) */
  retryAfterMs?: number;
}

/**
 * Context information for an error
 */
export interface ErrorContext {
  /** Work order ID if applicable */
  workOrderId?: string;
  /** Run ID if applicable */
  runId?: string;
  /** Sandbox ID if applicable */
  sandboxId?: string;
  /** Operation that failed */
  operation?: string;
  /** Component/module that generated the error */
  component?: string;
  /** Timestamp when error occurred */
  timestamp: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Serialized error for persistence and transmission
 */
export interface SerializedError {
  /** Error name/type */
  name: string;
  /** Error message */
  message: string;
  /** Error code */
  code: ErrorCode;
  /** Error category */
  category: ErrorCategory;
  /** Error severity */
  severity: ErrorSeverity;
  /** Context information */
  context?: ErrorContext;
  /** Retry policy */
  retryPolicy?: RetryPolicy;
  /** Stack trace (optional, for debugging) */
  stack?: string;
  /** Cause chain (nested errors) */
  cause?: SerializedError;
}

/**
 * Default retry policies by category
 */
export const DEFAULT_RETRY_POLICIES: Record<ErrorCategory, RetryPolicy> = {
  infrastructure: { retryable: true, maxRetries: 3, baseDelayMs: 1000, exponentialBackoff: true },
  agent: { retryable: false },
  validation: { retryable: false },
  configuration: { retryable: false },
  resource: { retryable: true, maxRetries: 5, baseDelayMs: 5000, exponentialBackoff: true },
  timeout: { retryable: true, maxRetries: 2, baseDelayMs: 1000, exponentialBackoff: false },
  conflict: { retryable: true, maxRetries: 3, baseDelayMs: 2000, exponentialBackoff: true },
  external: { retryable: true, maxRetries: 3, baseDelayMs: 1000, exponentialBackoff: true },
  internal: { retryable: false },
};

/**
 * Get category for an error code
 */
export function getCategoryForCode(code: ErrorCode): ErrorCategory {
  const codeNum = code as number;
  if (codeNum >= 1000 && codeNum < 2000) return 'infrastructure';
  if (codeNum >= 2000 && codeNum < 3000) return 'agent';
  if (codeNum >= 3000 && codeNum < 4000) return 'validation';
  if (codeNum >= 4000 && codeNum < 5000) return 'configuration';
  if (codeNum >= 5000 && codeNum < 6000) return 'resource';
  if (codeNum >= 6000 && codeNum < 7000) return 'timeout';
  if (codeNum >= 7000 && codeNum < 8000) return 'conflict';
  if (codeNum >= 8000 && codeNum < 9000) return 'external';
  return 'internal';
}

/**
 * Get default severity for a category
 */
export function getSeverityForCategory(category: ErrorCategory): ErrorSeverity {
  switch (category) {
    case 'internal':
      return 'fatal';
    case 'infrastructure':
    case 'agent':
    case 'external':
      return 'error';
    case 'validation':
    case 'configuration':
    case 'resource':
    case 'timeout':
    case 'conflict':
      return 'error';
    default:
      return 'error';
  }
}
