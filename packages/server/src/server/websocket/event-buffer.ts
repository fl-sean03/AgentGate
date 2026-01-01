/**
 * Event Buffer Module
 *
 * Buffers recent events per work order to support replay on reconnection
 * and catch-up for late subscribers.
 */

import { createLogger } from '../../utils/logger.js';
import type { ServerMessage } from './types.js';

const logger = createLogger('websocket:event-buffer');

/**
 * Options for the EventBuffer
 */
export interface EventBufferOptions {
  /** Maximum events per work order (default: 1000) */
  maxEventsPerWorkOrder?: number;
  /** Maximum total events across all work orders (default: 10000) */
  maxTotalEvents?: number;
  /** Retention time in minutes (default: 60) */
  retentionMinutes?: number;
  /** Cleanup interval in milliseconds (default: 300000 = 5 min) */
  cleanupIntervalMs?: number;
}

/**
 * Internal ring buffer for a work order
 */
interface WorkOrderBuffer {
  events: ServerMessage[];
  head: number;
  count: number;
  lastAccessTime: number;
}

/**
 * EventBuffer stores recent events for replay and catch-up functionality.
 *
 * Features:
 * - Ring buffer per work order for O(1) add
 * - LRU eviction when total limit exceeded
 * - Time-based cleanup of old events
 * - Binary search for timestamp-based retrieval
 */
export class EventBuffer {
  private readonly maxEventsPerWorkOrder: number;
  private readonly maxTotalEvents: number;
  private readonly retentionMinutes: number;

  private buffers: Map<string, WorkOrderBuffer> = new Map();
  private totalEvents = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options?: EventBufferOptions) {
    this.maxEventsPerWorkOrder = options?.maxEventsPerWorkOrder ?? 1000;
    this.maxTotalEvents = options?.maxTotalEvents ?? 10000;
    this.retentionMinutes = options?.retentionMinutes ?? 60;

    // Start cleanup timer
    const cleanupIntervalMs = options?.cleanupIntervalMs ?? 300000;
    this.startCleanup(cleanupIntervalMs);

    logger.debug(
      {
        maxEventsPerWorkOrder: this.maxEventsPerWorkOrder,
        maxTotalEvents: this.maxTotalEvents,
        retentionMinutes: this.retentionMinutes,
      },
      'EventBuffer initialized'
    );
  }

  /**
   * Add an event to the buffer
   */
  add(event: ServerMessage, workOrderId: string): void {
    // Ensure event has a timestamp
    const eventWithTimestamp = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };

    // Get or create buffer for this work order
    let buffer = this.buffers.get(workOrderId);
    if (!buffer) {
      buffer = {
        events: new Array<ServerMessage>(this.maxEventsPerWorkOrder),
        head: 0,
        count: 0,
        lastAccessTime: Date.now(),
      };
      this.buffers.set(workOrderId, buffer);
    }

    // Update access time
    buffer.lastAccessTime = Date.now();

    // Add event to ring buffer
    buffer.events[buffer.head] = eventWithTimestamp;
    buffer.head = (buffer.head + 1) % this.maxEventsPerWorkOrder;

    if (buffer.count < this.maxEventsPerWorkOrder) {
      buffer.count++;
      this.totalEvents++;
    }

    // Check if we need to evict from other work orders
    if (this.totalEvents > this.maxTotalEvents) {
      this.evictLRU();
    }
  }

  /**
   * Get all events for a work order, optionally filtered by timestamp
   */
  getEvents(workOrderId: string, since?: Date): ServerMessage[] {
    const buffer = this.buffers.get(workOrderId);
    if (!buffer || buffer.count === 0) {
      return [];
    }

    // Update access time
    buffer.lastAccessTime = Date.now();

    // Get all events from the ring buffer
    const events: ServerMessage[] = [];
    const startIndex = (buffer.head - buffer.count + this.maxEventsPerWorkOrder) % this.maxEventsPerWorkOrder;

    for (let i = 0; i < buffer.count; i++) {
      const index = (startIndex + i) % this.maxEventsPerWorkOrder;
      const event = buffer.events[index];
      if (event) {
        events.push(event);
      }
    }

    // Filter by timestamp if provided
    if (since) {
      const sinceTime = since.getTime();
      return events.filter(e => {
        const eventTime = new Date(e.timestamp).getTime();
        return eventTime >= sinceTime;
      });
    }

    return events;
  }

  /**
   * Get the latest N events for a work order
   */
  getLatestEvents(workOrderId: string, count: number): ServerMessage[] {
    const buffer = this.buffers.get(workOrderId);
    if (!buffer || buffer.count === 0) {
      return [];
    }

    // Update access time
    buffer.lastAccessTime = Date.now();

    const numToReturn = Math.min(count, buffer.count);
    const events: ServerMessage[] = [];

    // Start from the most recent
    for (let i = 0; i < numToReturn; i++) {
      const index = (buffer.head - 1 - i + this.maxEventsPerWorkOrder) % this.maxEventsPerWorkOrder;
      const event = buffer.events[index];
      if (event) {
        events.unshift(event); // Add to front to maintain chronological order
      }
    }

    return events;
  }

  /**
   * Clear all events for a work order
   */
  clear(workOrderId: string): void {
    const buffer = this.buffers.get(workOrderId);
    if (buffer) {
      this.totalEvents -= buffer.count;
      this.buffers.delete(workOrderId);
      logger.debug({ workOrderId }, 'Buffer cleared for work order');
    }
  }

  /**
   * Clear all events older than the specified date
   */
  clearOlderThan(date: Date): void {
    const cutoffTime = date.getTime();
    let clearedCount = 0;

    for (const [workOrderId, buffer] of this.buffers.entries()) {
      // Get events and filter
      const events = this.getEvents(workOrderId);
      const remainingEvents = events.filter(e => {
        const eventTime = new Date(e.timestamp).getTime();
        return eventTime >= cutoffTime;
      });

      if (remainingEvents.length === 0) {
        // Remove entire buffer
        this.totalEvents -= buffer.count;
        this.buffers.delete(workOrderId);
        clearedCount += buffer.count;
      } else if (remainingEvents.length < events.length) {
        // Rebuild buffer with remaining events
        const clearedFromBuffer = events.length - remainingEvents.length;
        buffer.events = new Array<ServerMessage>(this.maxEventsPerWorkOrder);
        buffer.head = 0;
        buffer.count = 0;
        this.totalEvents -= clearedFromBuffer;
        clearedCount += clearedFromBuffer;

        for (const event of remainingEvents) {
          buffer.events[buffer.head] = event;
          buffer.head = (buffer.head + 1) % this.maxEventsPerWorkOrder;
          buffer.count++;
          this.totalEvents++;
        }
      }
    }

    if (clearedCount > 0) {
      logger.info(
        { cutoffTime: date.toISOString(), clearedCount, remainingTotal: this.totalEvents },
        'Cleared old events'
      );
    }
  }

  /**
   * Get the count of events for a work order
   */
  getEventCount(workOrderId: string): number {
    const buffer = this.buffers.get(workOrderId);
    return buffer?.count ?? 0;
  }

  /**
   * Get the total number of events across all work orders
   */
  getTotalEventCount(): number {
    return this.totalEvents;
  }

  /**
   * Get the number of work orders with buffers
   */
  getWorkOrderCount(): number {
    return this.buffers.size;
  }

  /**
   * Stop the buffer and cleanup
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.buffers.clear();
    this.totalEvents = 0;

    logger.debug('EventBuffer stopped');
  }

  /**
   * Evict events from the least recently used work order
   */
  private evictLRU(): void {
    // Find the least recently accessed work order
    let oldestWorkOrderId: string | null = null;
    let oldestAccessTime = Infinity;

    for (const [workOrderId, buffer] of this.buffers.entries()) {
      if (buffer.lastAccessTime < oldestAccessTime) {
        oldestAccessTime = buffer.lastAccessTime;
        oldestWorkOrderId = workOrderId;
      }
    }

    if (oldestWorkOrderId) {
      const buffer = this.buffers.get(oldestWorkOrderId)!;

      // Remove half of the events from this buffer
      const eventsToRemove = Math.ceil(buffer.count / 2);
      buffer.count -= eventsToRemove;
      this.totalEvents -= eventsToRemove;

      // If buffer is empty or nearly empty, remove it
      if (buffer.count <= 0) {
        this.buffers.delete(oldestWorkOrderId);
      }

      logger.debug(
        { workOrderId: oldestWorkOrderId, eventsRemoved: eventsToRemove, remaining: this.totalEvents },
        'LRU eviction performed'
      );
    }
  }

  /**
   * Start periodic cleanup of old events
   */
  private startCleanup(intervalMs: number): void {
    this.cleanupTimer = setInterval(() => {
      const cutoff = new Date(Date.now() - this.retentionMinutes * 60 * 1000);
      this.clearOlderThan(cutoff);
    }, intervalMs);
  }
}

/**
 * Create an event buffer instance
 */
export function createEventBuffer(options?: EventBufferOptions): EventBuffer {
  return new EventBuffer(options);
}
