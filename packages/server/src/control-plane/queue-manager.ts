/**
 * Work Order Queue Manager (v0.2.19 - Thrust 7)
 *
 * Provides priority-based work order queuing with position tracking,
 * concurrency limits, and queue persistence for graceful load handling.
 */

import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '../utils/logger.js';

const log = createLogger('queue-manager');

/**
 * Position information for a queued work order.
 */
export interface QueuePosition {
  /** Position in queue (1 = next to start) */
  position: number;

  /** Estimated time until start (null if unknown) */
  estimatedWaitMs: number | null;

  /** Number of work orders ahead */
  ahead: number;

  /** Whether actively running or waiting */
  state: 'waiting' | 'running';

  /** When the work order was enqueued */
  enqueuedAt: Date;
}

/**
 * Queue statistics.
 */
export interface QueueStats {
  /** Number of work orders waiting */
  waiting: number;

  /** Number of work orders running */
  running: number;

  /** Maximum concurrent runs allowed */
  maxConcurrent: number;

  /** Average wait time in recent history (ms) */
  averageWaitMs: number;

  /** Queue capacity (max waiting allowed) */
  maxQueueSize: number;

  /** Whether queue is accepting new work orders */
  accepting: boolean;
}

/**
 * Options for enqueueing a work order.
 */
export interface EnqueueOptions {
  /** Priority (higher = sooner, default = 0) */
  priority?: number;

  /** Maximum time to wait in queue before failing (ms) */
  maxWaitMs?: number;

  /** Callback when position changes */
  onPositionChange?: (position: QueuePosition) => void;
}

/**
 * Result of an enqueue operation.
 */
export interface EnqueueResult {
  /** Whether enqueue succeeded */
  success: boolean;

  /** Queue position if successful, null otherwise */
  position: QueuePosition | null;

  /** Error message if failed */
  error?: string;
}

/**
 * Internal representation of a queued work order.
 */
interface QueuedWorkOrder {
  workOrderId: string;
  priority: number;
  enqueuedAt: Date;
  maxWaitMs: number | null;
  onPositionChange: ((position: QueuePosition) => void) | undefined;
}

/**
 * Internal representation of a running work order with timeout tracking.
 * (v0.2.23 - Wave 1.4: Work Order Timeout Enforcement)
 */
interface RunningWorkOrder {
  workOrderId: string;
  startedAt: Date;
  maxWallClockMs: number | null;
}

/**
 * Persisted queue state for recovery.
 */
interface PersistedQueueState {
  version: '1.0';
  queue: Array<{
    workOrderId: string;
    priority: number;
    enqueuedAt: string;
    maxWaitMs: number | null;
  }>;
  running: string[];
  waitTimes: number[];
  savedAt: string;
}

/**
 * Events emitted by QueueManager.
 */
export interface QueueManagerEvents {
  /** Emitted when a work order is ready to start */
  ready: (workOrderId: string) => void;

  /** Emitted when a work order times out in queue */
  timeout: (workOrderId: string) => void;

  /** Emitted when a running work order exceeds its maxWallClockSeconds (v0.2.23 - Wave 1.4) */
  runTimeout: (workOrderId: string, elapsedMs: number, maxWallClockMs: number) => void;

  /** Emitted when queue state changes */
  stateChange: (stats: QueueStats) => void;
}

/**
 * Configuration for QueueManager.
 */
export interface QueueManagerConfig {
  /** Maximum concurrent work orders */
  maxConcurrent: number;

  /** Maximum queue size (waiting work orders) */
  maxQueueSize: number;

  /** Directory for persisting queue state (null = no persistence) */
  persistDir: string | null;

  /** How often to persist queue state (ms) */
  persistIntervalMs: number;

  /** How often to check running work orders for timeout (ms). Default: 30000 (30s) (v0.2.23 - Wave 1.4) */
  runTimeoutCheckIntervalMs: number;
}

/**
 * Default queue manager configuration.
 */
export const DEFAULT_QUEUE_CONFIG: QueueManagerConfig = {
  maxConcurrent: 2,
  maxQueueSize: 100,
  persistDir: null,
  persistIntervalMs: 30000,
  runTimeoutCheckIntervalMs: 30000, // Check every 30 seconds (v0.2.23 - Wave 1.4)
};

/**
 * Priority queue for work orders.
 *
 * Features:
 * - Priority-based ordering (higher priority first, then FIFO)
 * - Concurrency limits
 * - Position tracking with estimated wait times
 * - Queue timeout handling
 * - Optional persistence for recovery
 */
export class QueueManager extends EventEmitter {
  private queue: QueuedWorkOrder[] = [];
  private running: Set<string> = new Set();
  /** Running work orders with timeout tracking (v0.2.23 - Wave 1.4) */
  private runningWithTimeout: Map<string, RunningWorkOrder> = new Map();
  private config: QueueManagerConfig;
  private waitTimes: number[] = []; // Recent wait times for estimation
  private persistTimer: NodeJS.Timeout | null = null;
  /** Timer for checking running work order timeouts (v0.2.23 - Wave 1.4) */
  private runTimeoutTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<QueueManagerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };

    // Start persistence timer if configured
    if (this.config.persistDir && this.config.persistIntervalMs > 0) {
      this.persistTimer = setInterval(() => {
        void this.persist();
      }, this.config.persistIntervalMs);
    }

    // Start run timeout check timer (v0.2.23 - Wave 1.4)
    if (this.config.runTimeoutCheckIntervalMs > 0) {
      this.runTimeoutTimer = setInterval(() => {
        this.checkRunTimeouts();
      }, this.config.runTimeoutCheckIntervalMs);
    }

    log.info(
      {
        maxConcurrent: this.config.maxConcurrent,
        maxQueueSize: this.config.maxQueueSize,
        hasPersistence: !!this.config.persistDir,
        runTimeoutCheckIntervalMs: this.config.runTimeoutCheckIntervalMs,
      },
      'QueueManager initialized'
    );
  }

  /**
   * Enqueue a work order.
   * Returns immediately with queue position.
   *
   * @param workOrderId - ID of the work order to enqueue
   * @param options - Enqueue options
   * @returns Result with success status and position
   */
  enqueue(workOrderId: string, options: EnqueueOptions = {}): EnqueueResult {
    // Check if already in queue or running
    if (this.isEnqueued(workOrderId) || this.running.has(workOrderId)) {
      return {
        success: false,
        position: null,
        error: `Work order ${workOrderId} is already queued or running`,
      };
    }

    // Check if queue is full
    if (this.queue.length >= this.config.maxQueueSize) {
      log.warn({ workOrderId, queueSize: this.queue.length }, 'Queue full, rejecting');
      return {
        success: false,
        position: null,
        error: `Queue is full (${this.config.maxQueueSize} work orders waiting)`,
      };
    }

    const entry: QueuedWorkOrder = {
      workOrderId,
      priority: options.priority ?? 0,
      enqueuedAt: new Date(),
      maxWaitMs: options.maxWaitMs ?? null,
      onPositionChange: options.onPositionChange,
    };

    // Insert in priority order (higher priority first, then FIFO)
    const insertIndex = this.queue.findIndex((e) => e.priority < entry.priority);
    if (insertIndex === -1) {
      this.queue.push(entry);
    } else {
      this.queue.splice(insertIndex, 0, entry);
    }

    const position = this.getPosition(workOrderId)!;

    log.info(
      { workOrderId, position: position.position, ahead: position.ahead, priority: entry.priority },
      'Work order enqueued'
    );

    // Notify position to new entry
    options.onPositionChange?.(position);

    // Notify all entries of position changes
    this.notifyPositionChanges();

    // Emit state change
    this.emit('stateChange', this.getStats());

    // Try to process queue
    this.processQueue();

    return { success: true, position };
  }

  /**
   * Dequeue the next work order to process.
   * Returns null if no work orders are ready or at capacity.
   */
  dequeue(): string | null {
    if (!this.canStartImmediately() || this.queue.length === 0) {
      return null;
    }

    const next = this.queue.shift();
    if (!next) {
      return null;
    }

    // Record wait time
    const waitTime = Date.now() - next.enqueuedAt.getTime();
    this.recordWaitTime(waitTime);

    // Move to running
    this.running.add(next.workOrderId);

    log.info({ workOrderId: next.workOrderId, waitTime }, 'Work order dequeued');

    // Notify position changes
    this.notifyPositionChanges();

    // Emit state change
    this.emit('stateChange', this.getStats());

    return next.workOrderId;
  }

  /**
   * Peek at the next work order without removing it.
   */
  peek(): string | null {
    if (this.queue.length === 0) {
      return null;
    }
    return this.queue[0]!.workOrderId;
  }

  /**
   * Get position of a work order in queue.
   *
   * @param workOrderId - ID to look up
   * @returns Position info or null if not found
   */
  getPosition(workOrderId: string): QueuePosition | null {
    // Check if running
    if (this.running.has(workOrderId)) {
      // Find the enqueue time if we have it stored
      return {
        position: 0,
        estimatedWaitMs: 0,
        ahead: 0,
        state: 'running',
        enqueuedAt: new Date(), // Not accurate but indicates running
      };
    }

    // Find in queue
    const index = this.queue.findIndex((e) => e.workOrderId === workOrderId);
    if (index === -1) {
      return null;
    }

    const entry = this.queue[index]!;
    const ahead = index;
    const estimatedWaitMs = this.estimateWaitTime(ahead);

    return {
      position: ahead + 1,
      estimatedWaitMs,
      ahead,
      state: 'waiting',
      enqueuedAt: entry.enqueuedAt,
    };
  }

  /**
   * Mark a work order as started (remove from queue, add to running).
   *
   * @param workOrderId - ID to mark as started
   * @param maxWallClockMs - Maximum wall clock time in milliseconds (null = no timeout) (v0.2.23 - Wave 1.4)
   */
  markStarted(workOrderId: string, maxWallClockMs?: number | null): void {
    const index = this.queue.findIndex((e) => e.workOrderId === workOrderId);
    if (index !== -1) {
      const entry = this.queue[index]!;
      const waitTime = Date.now() - entry.enqueuedAt.getTime();
      this.queue.splice(index, 1);
      this.recordWaitTime(waitTime);
    }

    this.running.add(workOrderId);

    // Track running work order with timeout (v0.2.23 - Wave 1.4)
    this.runningWithTimeout.set(workOrderId, {
      workOrderId,
      startedAt: new Date(),
      maxWallClockMs: maxWallClockMs ?? null,
    });

    log.debug({ workOrderId, running: this.running.size, maxWallClockMs }, 'Work order started');

    this.notifyPositionChanges();
    this.emit('stateChange', this.getStats());
  }

  /**
   * Mark a work order as completed (remove from running).
   *
   * @param workOrderId - ID to mark as completed
   */
  markCompleted(workOrderId: string): void {
    this.running.delete(workOrderId);
    // Clean up timeout tracking (v0.2.23 - Wave 1.4)
    this.runningWithTimeout.delete(workOrderId);
    log.debug({ workOrderId, running: this.running.size }, 'Work order completed');

    // Process queue to start next work orders
    this.processQueue();

    this.emit('stateChange', this.getStats());
  }

  /**
   * Cancel a queued work order.
   *
   * @param workOrderId - ID to cancel
   * @returns true if found and removed, false otherwise
   */
  cancel(workOrderId: string): boolean {
    const index = this.queue.findIndex((e) => e.workOrderId === workOrderId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      log.info({ workOrderId }, 'Work order canceled from queue');
      this.notifyPositionChanges();
      this.emit('stateChange', this.getStats());
      return true;
    }
    return false;
  }

  /**
   * Get queue statistics.
   */
  getStats(): QueueStats {
    return {
      waiting: this.queue.length,
      running: this.running.size,
      maxConcurrent: this.config.maxConcurrent,
      averageWaitMs: this.calculateAverageWaitTime(),
      maxQueueSize: this.config.maxQueueSize,
      accepting: this.queue.length < this.config.maxQueueSize,
    };
  }

  /**
   * Check if a work order can start immediately (capacity available).
   */
  canStartImmediately(): boolean {
    return this.running.size < this.config.maxConcurrent;
  }

  /**
   * Get next work order to start (if capacity available).
   */
  getNextToStart(): string | null {
    if (!this.canStartImmediately() || this.queue.length === 0) {
      return null;
    }
    return this.queue[0]!.workOrderId;
  }

  /**
   * Check if a work order is enqueued.
   */
  isEnqueued(workOrderId: string): boolean {
    return this.queue.some((e) => e.workOrderId === workOrderId);
  }

  /**
   * Check if a work order is running.
   */
  isRunning(workOrderId: string): boolean {
    return this.running.has(workOrderId);
  }

  /**
   * Persist queue state to disk.
   */
  async persist(): Promise<void> {
    if (!this.config.persistDir) return;

    const state: PersistedQueueState = {
      version: '1.0',
      queue: this.queue.map((e) => ({
        workOrderId: e.workOrderId,
        priority: e.priority,
        enqueuedAt: e.enqueuedAt.toISOString(),
        maxWaitMs: e.maxWaitMs,
      })),
      running: Array.from(this.running),
      waitTimes: this.waitTimes,
      savedAt: new Date().toISOString(),
    };

    try {
      await fs.mkdir(this.config.persistDir, { recursive: true });
      const path = join(this.config.persistDir, 'queue-state.json');
      await fs.writeFile(path, JSON.stringify(state, null, 2));
      log.debug({ path, queueSize: this.queue.length }, 'Queue state persisted');
    } catch (error) {
      log.warn({ error }, 'Failed to persist queue state');
    }
  }

  /**
   * Restore queue state from disk.
   */
  async restore(): Promise<boolean> {
    if (!this.config.persistDir) return false;

    const path = join(this.config.persistDir, 'queue-state.json');

    try {
      const content = await fs.readFile(path, 'utf-8');
      const state = JSON.parse(content) as PersistedQueueState;

      if (state.version !== '1.0') {
        log.warn({ version: state.version }, 'Unknown queue state version, skipping restore');
        return false;
      }

      // Restore queue entries (without callbacks)
      this.queue = state.queue.map((e) => ({
        workOrderId: e.workOrderId,
        priority: e.priority,
        enqueuedAt: new Date(e.enqueuedAt),
        maxWaitMs: e.maxWaitMs,
        onPositionChange: undefined,
      }));

      // Note: running set is NOT restored - those work orders need to be
      // resubmitted by the orchestrator on restart
      this.running = new Set();

      // Restore wait time history
      this.waitTimes = state.waitTimes;

      log.info(
        { queueSize: this.queue.length, savedAt: state.savedAt },
        'Queue state restored'
      );

      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn({ error }, 'Failed to restore queue state');
      }
      return false;
    }
  }

  /**
   * Stop the queue manager and clean up resources.
   */
  async shutdown(): Promise<void> {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }

    // Clean up run timeout timer (v0.2.23 - Wave 1.4)
    if (this.runTimeoutTimer) {
      clearInterval(this.runTimeoutTimer);
      this.runTimeoutTimer = null;
    }

    // Final persist
    await this.persist();

    log.info('QueueManager shutdown complete');
  }

  /**
   * Process the queue - check for timed out entries and emit ready events.
   */
  private processQueue(): void {
    while (this.canStartImmediately() && this.queue.length > 0) {
      const next = this.queue[0]!;

      // Check if exceeded max wait time
      if (next.maxWaitMs !== null) {
        const waited = Date.now() - next.enqueuedAt.getTime();
        if (waited > next.maxWaitMs) {
          this.queue.shift();
          this.emit('timeout', next.workOrderId);
          log.warn({ workOrderId: next.workOrderId, waited }, 'Work order timed out in queue');
          continue;
        }
      }

      // Emit ready event for orchestrator to start
      this.emit('ready', next.workOrderId);
      break; // Only emit one at a time
    }
  }

  /**
   * Notify all queued entries of position changes.
   */
  private notifyPositionChanges(): void {
    this.queue.forEach((entry, index) => {
      const position: QueuePosition = {
        position: index + 1,
        estimatedWaitMs: this.estimateWaitTime(index),
        ahead: index,
        state: 'waiting',
        enqueuedAt: entry.enqueuedAt,
      };
      entry.onPositionChange?.(position);
    });
  }

  /**
   * Estimate wait time for a given position.
   */
  private estimateWaitTime(ahead: number): number | null {
    if (ahead === 0 && this.canStartImmediately()) {
      return 0;
    }

    const avgWait = this.calculateAverageWaitTime();
    if (avgWait === 0) {
      return null; // Not enough data
    }

    // Estimate: (position / maxConcurrent) * averageWaitTime
    const batches = Math.ceil((ahead + 1) / this.config.maxConcurrent);
    return Math.round(batches * avgWait);
  }

  /**
   * Record a wait time for statistics.
   */
  private recordWaitTime(ms: number): void {
    this.waitTimes.push(ms);
    // Keep last 50 wait times
    if (this.waitTimes.length > 50) {
      this.waitTimes.shift();
    }
  }

  /**
   * Calculate average wait time from history.
   */
  private calculateAverageWaitTime(): number {
    if (this.waitTimes.length === 0) {
      return 0;
    }
    const sum = this.waitTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.waitTimes.length);
  }

  /**
   * Check running work orders for timeout violations.
   * Emits 'runTimeout' event for any work orders that have exceeded their maxWallClockMs.
   * (v0.2.23 - Wave 1.4: Work Order Timeout Enforcement)
   */
  private checkRunTimeouts(): void {
    const now = Date.now();
    const timedOut: Array<{ workOrderId: string; elapsedMs: number; maxWallClockMs: number }> = [];

    for (const [workOrderId, runningWo] of this.runningWithTimeout) {
      if (runningWo.maxWallClockMs === null) {
        continue; // No timeout configured
      }

      const elapsedMs = now - runningWo.startedAt.getTime();
      if (elapsedMs > runningWo.maxWallClockMs) {
        timedOut.push({
          workOrderId,
          elapsedMs,
          maxWallClockMs: runningWo.maxWallClockMs,
        });
      }
    }

    // Emit timeout events for all timed out work orders
    for (const { workOrderId, elapsedMs, maxWallClockMs } of timedOut) {
      log.warn(
        { workOrderId, elapsedMs, maxWallClockMs },
        'Running work order exceeded maxWallClockSeconds timeout'
      );
      this.emit('runTimeout', workOrderId, elapsedMs, maxWallClockMs);
    }
  }

  /**
   * Get the elapsed time in milliseconds for a running work order.
   * Returns null if the work order is not running or not tracked.
   * (v0.2.23 - Wave 1.4: Work Order Timeout Enforcement)
   */
  getRunElapsedMs(workOrderId: string): number | null {
    const runningWo = this.runningWithTimeout.get(workOrderId);
    if (!runningWo) {
      return null;
    }
    return Date.now() - runningWo.startedAt.getTime();
  }

  /**
   * Get the running work order info with timeout tracking.
   * Returns null if the work order is not running or not tracked.
   * (v0.2.23 - Wave 1.4: Work Order Timeout Enforcement)
   */
  getRunningWorkOrderInfo(workOrderId: string): { startedAt: Date; maxWallClockMs: number | null; elapsedMs: number } | null {
    const runningWo = this.runningWithTimeout.get(workOrderId);
    if (!runningWo) {
      return null;
    }
    return {
      startedAt: runningWo.startedAt,
      maxWallClockMs: runningWo.maxWallClockMs,
      elapsedMs: Date.now() - runningWo.startedAt.getTime(),
    };
  }

  /**
   * Check if a specific running work order has exceeded its timeout.
   * Returns false if the work order is not running, not tracked, or has no timeout.
   * (v0.2.23 - Wave 1.4: Work Order Timeout Enforcement)
   */
  hasRunTimedOut(workOrderId: string): boolean {
    const runningWo = this.runningWithTimeout.get(workOrderId);
    if (!runningWo?.maxWallClockMs) {
      return false;
    }
    const elapsedMs = Date.now() - runningWo.startedAt.getTime();
    return elapsedMs > runningWo.maxWallClockMs;
  }
}

// Singleton instance (lazy initialization)
let queueInstance: QueueManager | null = null;

/**
 * Get or create the global QueueManager instance.
 *
 * @param config - Configuration (only used on first call)
 * @returns QueueManager instance
 */
export function getQueueManager(config?: Partial<QueueManagerConfig>): QueueManager {
  if (!queueInstance) {
    queueInstance = new QueueManager(config);
  }
  return queueInstance;
}

/**
 * Create a new QueueManager instance (not the singleton).
 *
 * @param config - Configuration
 * @returns New QueueManager instance
 */
export function createQueueManager(config?: Partial<QueueManagerConfig>): QueueManager {
  return new QueueManager(config);
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetQueueManager(): void {
  if (queueInstance) {
    void queueInstance.shutdown();
    queueInstance = null;
  }
}
