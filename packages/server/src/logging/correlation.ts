/**
 * Correlation ID Management
 * Uses AsyncLocalStorage for request tracing across async operations.
 *
 * (v0.2.27 - Thrust 18: Structured Logging Overhaul)
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Correlation context stored in AsyncLocalStorage
 */
export interface CorrelationContext {
  /** Request/operation correlation ID */
  correlationId: string;
  /** Work order ID if applicable */
  workOrderId?: string;
  /** Run ID if applicable */
  runId?: string;
  /** Iteration number if applicable */
  iteration?: number;
  /** Additional context data */
  metadata?: Record<string, unknown>;
}

/**
 * AsyncLocalStorage instance for correlation context
 */
const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Get the current correlation context
 */
export function getCorrelationContext(): CorrelationContext | undefined {
  return correlationStorage.getStore();
}

/**
 * Get the current correlation ID, or generate a new one
 */
export function getCorrelationId(): string {
  const context = getCorrelationContext();
  return context?.correlationId ?? generateCorrelationId();
}

/**
 * Run a function with a correlation context
 */
export function withCorrelation<T>(
  context: Partial<CorrelationContext> & { correlationId?: string },
  fn: () => T
): T {
  const fullContext: CorrelationContext = {
    correlationId: context.correlationId ?? generateCorrelationId(),
    ...context,
  };
  return correlationStorage.run(fullContext, fn);
}

/**
 * Run an async function with a correlation context
 */
export async function withCorrelationAsync<T>(
  context: Partial<CorrelationContext> & { correlationId?: string },
  fn: () => Promise<T>
): Promise<T> {
  const fullContext: CorrelationContext = {
    correlationId: context.correlationId ?? generateCorrelationId(),
    ...context,
  };
  return correlationStorage.run(fullContext, fn);
}

/**
 * Update the current correlation context
 */
export function updateCorrelationContext(
  updates: Partial<Omit<CorrelationContext, 'correlationId'>>
): void {
  const current = getCorrelationContext();
  if (current) {
    Object.assign(current, updates);
  }
}

/**
 * Create a child context for nested operations
 */
export function createChildContext(
  overrides?: Partial<CorrelationContext>
): CorrelationContext {
  const parent = getCorrelationContext();
  return {
    correlationId: parent?.correlationId ?? generateCorrelationId(),
    workOrderId: parent?.workOrderId,
    runId: parent?.runId,
    iteration: parent?.iteration,
    metadata: { ...parent?.metadata },
    ...overrides,
  };
}

/**
 * Middleware-style wrapper for Fastify requests
 */
export function correlationMiddleware() {
  return async function (request: { headers: Record<string, string | string[] | undefined> }, _reply: unknown, done: () => void) {
    const correlationId =
      (request.headers['x-correlation-id'] as string) ??
      (request.headers['x-request-id'] as string) ??
      generateCorrelationId();

    withCorrelation({ correlationId }, () => {
      done();
    });
  };
}

/**
 * Get correlation fields for logging
 */
export function getCorrelationFields(): Record<string, unknown> {
  const context = getCorrelationContext();
  if (!context) {
    return {};
  }

  const fields: Record<string, unknown> = {
    correlationId: context.correlationId,
  };

  if (context.workOrderId) fields.workOrderId = context.workOrderId;
  if (context.runId) fields.runId = context.runId;
  if (context.iteration !== undefined) fields.iteration = context.iteration;

  return fields;
}

/**
 * Reset correlation storage for testing
 */
export function resetCorrelationStorage(): void {
  // AsyncLocalStorage doesn't have a reset method,
  // but calling getStore() outside of run() returns undefined
  // This function exists for API consistency with other singletons
}
