/**
 * Rate Limiter Module
 *
 * Implements rate limiting for WebSocket events using a token bucket algorithm
 * with priority queuing to prevent overwhelming clients during high activity.
 */

import { createLogger } from '../../utils/logger.js';
import type { ServerMessage } from './types.js';

const logger = createLogger('websocket:rate-limiter');

/**
 * Priority levels for event types
 */
export type EventPriority = 'critical' | 'high' | 'normal' | 'low';

/**
 * Default priority mappings for event types
 */
const DEFAULT_PRIORITY_MAP: Record<string, EventPriority> = {
  // Critical - always send immediately
  error: 'critical',
  run_failed: 'critical',
  run_completed: 'critical',
  work_order_created: 'critical',
  work_order_updated: 'critical',

  // High - prefer over lower priority
  agent_tool_call: 'high',
  file_changed: 'high',
  progress_update: 'high',
  run_started: 'high',
  run_iteration: 'high',

  // Normal
  agent_tool_result: 'normal',
  subscription_confirmed: 'normal',
  unsubscription_confirmed: 'normal',
  pong: 'normal',

  // Low - batch aggressively
  agent_output: 'low',
};

/**
 * Options for the RateLimiter
 */
export interface RateLimiterOptions {
  /** Maximum events per second (default: 50) */
  maxEventsPerSecond?: number;
  /** Batch window in milliseconds (default: 100) */
  batchWindowMs?: number;
  /** Enable priority queuing (default: true) */
  priorityEnabled?: boolean;
  /** Custom priority map (merged with defaults) */
  priorityMap?: Record<string, EventPriority>;
}

/**
 * Internal queue entry
 */
interface QueueEntry {
  event: ServerMessage;
  priority: EventPriority;
  enqueuedAt: number;
}

/**
 * Priority order for sorting (lower number = higher priority)
 */
const PRIORITY_ORDER: Record<EventPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/**
 * RateLimiter controls the rate of WebSocket event delivery using a token bucket.
 *
 * Features:
 * - Token bucket algorithm for smooth rate limiting
 * - Priority-based queuing (critical events bypass limit)
 * - Smart batching of consecutive events
 * - Automatic queue draining
 */
export class RateLimiter {
  private readonly maxEventsPerSecond: number;
  private readonly batchWindowMs: number;
  private readonly priorityEnabled: boolean;
  private readonly priorityMap: Record<string, EventPriority>;

  private tokens: number;
  private lastRefillTime: number;
  private queue: QueueEntry[] = [];
  private pendingBatch: ServerMessage[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private drainTimer: NodeJS.Timeout | null = null;
  private callbacks: Array<(events: ServerMessage[]) => void> = [];
  private stopped = false;

  constructor(options?: RateLimiterOptions) {
    this.maxEventsPerSecond = options?.maxEventsPerSecond ?? 50;
    this.batchWindowMs = options?.batchWindowMs ?? 100;
    this.priorityEnabled = options?.priorityEnabled ?? true;
    this.priorityMap = { ...DEFAULT_PRIORITY_MAP, ...options?.priorityMap };

    this.tokens = this.maxEventsPerSecond;
    this.lastRefillTime = Date.now();

    // Start periodic queue draining
    this.startDraining();

    logger.debug(
      {
        maxEventsPerSecond: this.maxEventsPerSecond,
        batchWindowMs: this.batchWindowMs,
        priorityEnabled: this.priorityEnabled,
      },
      'RateLimiter initialized'
    );
  }

  /**
   * Register a callback for batched events
   */
  onBatch(callback: (events: ServerMessage[]) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Submit an event for rate-limited delivery
   */
  submit(event: ServerMessage): void {
    if (this.stopped) {
      return;
    }

    const priority = this.getEventPriority(event);

    // Critical events bypass rate limiting
    if (priority === 'critical') {
      this.emitBatch([event]);
      return;
    }

    // Refill tokens
    this.refillTokens();

    // If we have tokens, send immediately (unless batching is active)
    if (this.tokens >= 1 && this.queue.length === 0) {
      this.tokens -= 1;
      this.scheduleBatch(event);
      return;
    }

    // Otherwise, add to queue
    this.enqueue(event, priority);
  }

  /**
   * Flush all pending events immediately
   */
  flush(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Flush pending batch first
    if (this.pendingBatch.length > 0) {
      this.emitBatch(this.pendingBatch);
      this.pendingBatch = [];
    }

    // Drain the queue with priority sorting
    const events = this.drainQueue(Infinity);
    if (events.length > 0) {
      this.emitBatch(events);
    }
  }

  /**
   * Stop the rate limiter and cleanup
   */
  stop(): void {
    this.stopped = true;

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }

    // Flush remaining events
    this.flush();

    logger.debug('RateLimiter stopped');
  }

  /**
   * Get the current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get available tokens
   */
  getAvailableTokens(): number {
    this.refillTokens();
    return this.tokens;
  }

  /**
   * Get the priority for an event type
   */
  private getEventPriority(event: ServerMessage): EventPriority {
    if (!this.priorityEnabled) {
      return 'normal';
    }
    return this.priorityMap[event.type] ?? 'normal';
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = elapsedSeconds * this.maxEventsPerSecond;

    this.tokens = Math.min(this.maxEventsPerSecond, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  /**
   * Add event to priority queue
   */
  private enqueue(event: ServerMessage, priority: EventPriority): void {
    const entry: QueueEntry = {
      event,
      priority,
      enqueuedAt: Date.now(),
    };

    this.queue.push(entry);

    // Sort by priority, then by enqueue time
    if (this.priorityEnabled) {
      this.queue.sort((a, b) => {
        const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return a.enqueuedAt - b.enqueuedAt;
      });
    }

    // Limit queue size to prevent memory issues
    const maxQueueSize = this.maxEventsPerSecond * 10;
    if (this.queue.length > maxQueueSize) {
      // Drop lowest priority events from the end
      this.queue = this.queue.slice(0, maxQueueSize);
    }
  }

  /**
   * Drain events from the queue up to the specified count
   */
  private drainQueue(count: number): ServerMessage[] {
    const events: ServerMessage[] = [];
    const toRemove = Math.min(count, this.queue.length);

    for (let i = 0; i < toRemove; i++) {
      const entry = this.queue.shift();
      if (entry) {
        events.push(entry.event);
      }
    }

    return events;
  }

  /**
   * Schedule a batch emission
   */
  private scheduleBatch(event: ServerMessage): void {
    // Add to pending batch
    this.pendingBatch.push(event);

    // If no timer running, start one
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null;
        if (this.pendingBatch.length > 0) {
          this.emitBatch(this.pendingBatch);
          this.pendingBatch = [];
        }
      }, this.batchWindowMs);
    }
  }

  /**
   * Start periodic queue draining
   */
  private startDraining(): void {
    // Drain queue every 100ms
    this.drainTimer = setInterval(() => {
      if (this.stopped || this.queue.length === 0) {
        return;
      }

      this.refillTokens();

      // Calculate how many events we can send
      const eventsToSend = Math.min(
        Math.floor(this.tokens),
        this.queue.length,
        Math.ceil(this.maxEventsPerSecond / 10) // Max 10% of rate per drain
      );

      if (eventsToSend > 0) {
        this.tokens -= eventsToSend;
        const events = this.drainQueue(eventsToSend);
        if (events.length > 0) {
          this.emitBatch(events);
        }
      }
    }, 100);
  }

  /**
   * Emit a batch of events to callbacks
   */
  private emitBatch(events: ServerMessage[]): void {
    if (events.length === 0) {
      return;
    }

    // Combine consecutive output events
    const combinedEvents = this.combineOutputEvents(events);

    for (const callback of this.callbacks) {
      try {
        callback(combinedEvents);
      } catch (error) {
        logger.error({ err: error }, 'Error in rate limiter batch callback');
      }
    }
  }

  /**
   * Combine consecutive agent_output events into a single event
   */
  private combineOutputEvents(events: ServerMessage[]): ServerMessage[] {
    const result: ServerMessage[] = [];
    let pendingOutput: { event: ServerMessage; content: string } | null = null;

    for (const event of events) {
      if (event.type === 'agent_output') {
        if (pendingOutput) {
          // Same work order/run, combine
          const typedEvent = event as { content: string; workOrderId: string; runId: string };
          const pendingTyped = pendingOutput.event as { workOrderId: string; runId: string };

          if (typedEvent.workOrderId === pendingTyped.workOrderId &&
              typedEvent.runId === pendingTyped.runId) {
            pendingOutput.content += typedEvent.content;
            continue;
          }

          // Different context, emit pending and start new
          result.push({
            ...pendingOutput.event,
            content: pendingOutput.content,
          } as ServerMessage);
        }

        pendingOutput = {
          event,
          content: (event as { content: string }).content,
        };
      } else {
        // Flush pending output before non-output event
        if (pendingOutput) {
          result.push({
            ...pendingOutput.event,
            content: pendingOutput.content,
          } as ServerMessage);
          pendingOutput = null;
        }
        result.push(event);
      }
    }

    // Flush any remaining pending output
    if (pendingOutput) {
      result.push({
        ...pendingOutput.event,
        content: pendingOutput.content,
      } as ServerMessage);
    }

    return result;
  }
}

/**
 * Create a rate limiter instance
 */
export function createRateLimiter(options?: RateLimiterOptions): RateLimiter {
  return new RateLimiter(options);
}
