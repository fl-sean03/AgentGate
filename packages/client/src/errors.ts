/**
 * AgentGate Client SDK Error Classes
 */

/**
 * Base error class for all AgentGate client errors
 */
export class AgentGateError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AgentGateError';
  }
}

/**
 * Error for network-level failures (connection, timeout, etc.)
 */
export class NetworkError extends AgentGateError {
  constructor(message: string, cause?: Error) {
    super(message, 'NETWORK_ERROR', 0);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/**
 * Error when a resource is not found (404)
 */
export class NotFoundError extends AgentGateError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Error for validation failures (400)
 */
export class ValidationError extends AgentGateError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Error for authentication failures (401)
 */
export class AuthenticationError extends AgentGateError {
  constructor(message = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error for resource conflicts (409)
 */
export class ConflictError extends AgentGateError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

/**
 * Error for rate limiting (429)
 */
export class RateLimitError extends AgentGateError {
  constructor(message: string, public retryAfter?: number) {
    super(message, 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Error for server-side failures (5xx)
 */
export class ServerError extends AgentGateError {
  constructor(message: string, status = 500) {
    super(message, 'SERVER_ERROR', status);
    this.name = 'ServerError';
  }
}
