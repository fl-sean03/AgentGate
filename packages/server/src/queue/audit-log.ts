import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import type { AuditEvent, AuditQueryOptions } from './observability-types.js';

/**
 * Configuration for audit log.
 */
export interface AuditLogConfig {
  /** Maximum events to keep in memory */
  maxEvents: number;

  /** Whether to also log to pino logger */
  logToConsole: boolean;
}

const DEFAULT_CONFIG: AuditLogConfig = {
  maxEvents: 10000,
  logToConsole: true,
};

/**
 * In-memory audit log for work order events.
 *
 * This class provides comprehensive audit trail capabilities:
 * - Records all work order lifecycle events
 * - Captures full error details (fixes issue #67)
 * - Supports querying by work order, event type, and time range
 * - Maintains per-work-order index for efficient timeline queries
 */
export class AuditLog {
  private readonly logger: Logger;
  private readonly config: AuditLogConfig;
  private readonly events: AuditEvent[] = [];
  private readonly eventsByWorkOrder: Map<string, AuditEvent[]> = new Map();

  constructor(config: Partial<AuditLogConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger('audit-log');
  }

  /**
   * Record an audit event.
   *
   * Error details are fully captured in the details object to address
   * issue #67 (Empty error objects).
   */
  record(
    workOrderId: string,
    eventType: string,
    details: Record<string, unknown> = {}
  ): AuditEvent {
    const event: AuditEvent = {
      id: nanoid(),
      workOrderId,
      eventType,
      timestamp: new Date(),
      details,
    };

    // Add to main list
    this.events.push(event);

    // Add to per-work-order index
    let workOrderEvents = this.eventsByWorkOrder.get(workOrderId);
    if (!workOrderEvents) {
      workOrderEvents = [];
      this.eventsByWorkOrder.set(workOrderId, workOrderEvents);
    }
    workOrderEvents.push(event);

    // Enforce max events
    if (this.events.length > this.config.maxEvents) {
      const removed = this.events.shift();
      if (removed) {
        // Also remove from per-work-order index
        const woEvents = this.eventsByWorkOrder.get(removed.workOrderId);
        if (woEvents) {
          const idx = woEvents.findIndex(e => e.id === removed.id);
          if (idx !== -1) woEvents.splice(idx, 1);
        }
      }
    }

    // Log to console if enabled
    if (this.config.logToConsole) {
      this.logger.info(
        { workOrderId, eventType, details },
        `Audit: ${eventType}`
      );
    }

    return event;
  }

  /**
   * Query audit events.
   */
  query(options: AuditQueryOptions = {}): AuditEvent[] {
    let results: AuditEvent[];

    // Start with work-order-specific events if ID provided
    if (options.workOrderId) {
      results = [...(this.eventsByWorkOrder.get(options.workOrderId) ?? [])];
    } else {
      results = [...this.events];
    }

    // Filter by event type
    if (options.eventType) {
      results = results.filter(e => e.eventType === options.eventType);
    }

    // Filter by time range
    if (options.since) {
      const since = options.since;
      results = results.filter(e => e.timestamp >= since);
    }
    if (options.until) {
      const until = options.until;
      results = results.filter(e => e.timestamp <= until);
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
      results = results.slice(-options.limit);
    }

    return results;
  }

  /**
   * Get work order timeline.
   */
  getWorkOrderTimeline(workOrderId: string): AuditEvent[] {
    return [...(this.eventsByWorkOrder.get(workOrderId) ?? [])];
  }

  /**
   * Get recent events.
   */
  getRecentEvents(count: number = 100): AuditEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Get event count.
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Clear all events (for testing).
   */
  clear(): void {
    this.events.length = 0;
    this.eventsByWorkOrder.clear();
  }
}
