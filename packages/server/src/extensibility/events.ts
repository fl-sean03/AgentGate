/**
 * Event System - Type-safe event emitter for system-wide events.
 * Provides pub/sub pattern for loose coupling between components.
 *
 * (v0.2.27 - Phase 3: Extensibility Framework)
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('events');

/**
 * Event handler type
 */
export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

/**
 * Event subscription
 */
export interface EventSubscription {
  /** Subscription ID */
  id: string;
  /** Event type */
  eventType: string;
  /** Unsubscribe function */
  unsubscribe: () => void;
}

/**
 * Event metadata
 */
export interface EventMeta {
  /** Timestamp when event was emitted */
  timestamp: number;
  /** Source component */
  source?: string;
  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Base event interface
 */
export interface BaseEvent {
  /** Event type identifier */
  type: string;
  /** Event metadata */
  meta: EventMeta;
}

/**
 * Type-safe event emitter
 */
export class EventEmitter<TEvents extends Record<string, unknown> = Record<string, unknown>> {
  private handlers: Map<string, Set<EventHandler<unknown>>> = new Map();
  private wildcardHandlers: Set<EventHandler<BaseEvent & { data: unknown }>> = new Set();
  private subscriptionCounter = 0;

  /**
   * Subscribe to an event
   */
  on<K extends keyof TEvents>(
    eventType: K,
    handler: EventHandler<TEvents[K]>
  ): EventSubscription {
    const type = eventType as string;
    let handlers = this.handlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(type, handlers);
    }
    handlers.add(handler as EventHandler<unknown>);

    const id = `sub-${++this.subscriptionCounter}`;

    log.debug({ eventType: type, subscriptionId: id }, 'Event subscription added');

    return {
      id,
      eventType: type,
      unsubscribe: () => {
        handlers?.delete(handler as EventHandler<unknown>);
        log.debug({ eventType: type, subscriptionId: id }, 'Event subscription removed');
      },
    };
  }

  /**
   * Subscribe to an event (once only)
   */
  once<K extends keyof TEvents>(
    eventType: K,
    handler: EventHandler<TEvents[K]>
  ): EventSubscription {
    const subscription = this.on(eventType, async (event) => {
      subscription.unsubscribe();
      await handler(event);
    });
    return subscription;
  }

  /**
   * Subscribe to all events (wildcard)
   */
  onAny(handler: EventHandler<BaseEvent & { data: unknown }>): EventSubscription {
    this.wildcardHandlers.add(handler);

    const id = `sub-${++this.subscriptionCounter}`;

    return {
      id,
      eventType: '*',
      unsubscribe: () => {
        this.wildcardHandlers.delete(handler);
      },
    };
  }

  /**
   * Emit an event
   */
  async emit<K extends keyof TEvents>(
    eventType: K,
    data: TEvents[K],
    meta?: Partial<EventMeta>
  ): Promise<void> {
    const type = eventType as string;
    const fullMeta: EventMeta = {
      timestamp: Date.now(),
      ...meta,
    };

    const handlers = this.handlers.get(type);
    const errors: Error[] = [];

    // Execute specific handlers
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(data);
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error(String(error)));
          log.error({ eventType: type, error }, 'Event handler error');
        }
      }
    }

    // Execute wildcard handlers
    const wildcardEvent = { type, data, meta: fullMeta };
    for (const handler of this.wildcardHandlers) {
      try {
        await handler(wildcardEvent);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
        log.error({ eventType: type, error }, 'Wildcard handler error');
      }
    }

    log.debug(
      { eventType: type, handlerCount: (handlers?.size || 0) + this.wildcardHandlers.size },
      'Event emitted'
    );

    if (errors.length > 0) {
      log.warn({ eventType: type, errorCount: errors.length }, 'Some event handlers failed');
    }
  }

  /**
   * Emit synchronously (fire and forget)
   */
  emitSync<K extends keyof TEvents>(
    eventType: K,
    data: TEvents[K],
    meta?: Partial<EventMeta>
  ): void {
    this.emit(eventType, data, meta).catch(error => {
      log.error({ eventType: eventType as string, error }, 'Async emit error');
    });
  }

  /**
   * Remove all handlers for an event type
   */
  off<K extends keyof TEvents>(eventType: K): void {
    this.handlers.delete(eventType as string);
  }

  /**
   * Remove all handlers
   */
  removeAllListeners(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
  }

  /**
   * Get handler count for an event type
   */
  listenerCount<K extends keyof TEvents>(eventType: K): number {
    const handlers = this.handlers.get(eventType as string);
    return (handlers?.size || 0) + this.wildcardHandlers.size;
  }

  /**
   * Get all event types with handlers
   */
  eventNames(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// ============================================================
// Predefined Events
// ============================================================

/**
 * Work order events
 */
export interface WorkOrderEvents {
  'workOrder:submitted': { workOrderId: string; prompt: string };
  'workOrder:started': { workOrderId: string; sandboxId: string };
  'workOrder:completed': { workOrderId: string; exitCode: number };
  'workOrder:failed': { workOrderId: string; error: string };
  'workOrder:cancelled': { workOrderId: string; reason?: string };
  'workOrder:stateChanged': { workOrderId: string; from: string; to: string };
}

/**
 * Sandbox events
 */
export interface SandboxEvents {
  'sandbox:created': { sandboxId: string; type: string };
  'sandbox:started': { sandboxId: string };
  'sandbox:stopped': { sandboxId: string; exitCode?: number };
  'sandbox:destroyed': { sandboxId: string };
  'sandbox:error': { sandboxId: string; error: string };
}

/**
 * Agent events
 */
export interface AgentEvents {
  'agent:started': { runId: string; workOrderId: string };
  'agent:output': { runId: string; output: string };
  'agent:completed': { runId: string; exitCode: number };
  'agent:error': { runId: string; error: string };
  'agent:timeout': { runId: string; timeoutMs: number };
}

/**
 * System events
 */
export interface SystemEvents {
  'system:startup': { version: string };
  'system:shutdown': { reason: string };
  'system:error': { error: string; fatal: boolean };
}

/**
 * All events combined
 */
export type AllEvents = WorkOrderEvents & SandboxEvents & AgentEvents & SystemEvents;

/**
 * Global event bus singleton
 */
let globalEventBus: EventEmitter<AllEvents> | null = null;

/**
 * Get the global event bus
 */
export function getEventBus(): EventEmitter<AllEvents> {
  if (!globalEventBus) {
    globalEventBus = new EventEmitter<AllEvents>();
  }
  return globalEventBus;
}

/**
 * Reset the global event bus (for testing)
 */
export function resetEventBus(): void {
  if (globalEventBus) {
    globalEventBus.removeAllListeners();
  }
  globalEventBus = null;
}
