/**
 * Queue Facade - Direct delegation to new queue system
 *
 * After v0.2.22 migration complete, this provides a clean interface
 * to the new queue system components.
 *
 * @module queue/queue-facade
 */

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';
import { Scheduler, QueuedWorkOrder } from './scheduler.js';
import { ResourceMonitor, type MemoryPressure } from './resource-monitor.js';
import { RetryManager } from './retry-manager.js';
import { WorkOrderStateMachine } from './state-machine.js';

const log = createLogger('queue-facade');

/**
 * Enqueue options for work orders.
 */
export interface EnqueueOptions {
  /** Priority (higher = more important) */
  priority?: number;
}

/**
 * Result of an enqueue operation.
 */
export interface EnqueueResult {
  /** Whether the enqueue succeeded */
  success: boolean;
  /** Position info if successful */
  position: QueuePosition | null;
  /** Error message if failed */
  error?: string;
}

/**
 * Position of a work order in the queue.
 */
export interface QueuePosition {
  /** Position in queue (1-indexed) */
  position: number;
  /** Estimated wait time in milliseconds */
  estimatedWaitMs: number | null;
  /** Number of work orders ahead */
  ahead: number;
  /** Current state */
  state: 'waiting' | 'running';
  /** When the work order was enqueued */
  enqueuedAt: Date;
}

/**
 * Events emitted by QueueFacade.
 */
export interface QueueFacadeEvents {
  /** Emitted when a work order is enqueued */
  'enqueued': (workOrderId: string) => void;

  /** Emitted when a work order starts execution */
  'started': (workOrderId: string) => void;

  /** Emitted when a work order completes */
  'completed': (workOrderId: string) => void;
}

/**
 * Statistics from QueueFacade.
 */
export interface QueueFacadeStats {
  /** Queue depth (waiting items) */
  queueDepth: number;
  /** Whether scheduler is running */
  isRunning: boolean;
  /** Available execution slots */
  availableSlots: number;
  /** Active execution slots */
  activeSlots: number;
  /** Memory pressure level */
  memoryPressure: MemoryPressure;
  /** Counters */
  counters: {
    totalEnqueued: number;
    totalStarted: number;
    totalCompleted: number;
  };
}

/**
 * Configuration for QueueFacade.
 */
export interface QueueFacadeConfig {
  /** Maximum concurrent slots */
  maxConcurrentSlots?: number;
  /** Memory per slot in MB */
  memoryPerSlotMB?: number;
  /** Poll interval in ms */
  pollIntervalMs?: number;
  /** Stagger delay in ms */
  staggerDelayMs?: number;
  /** Enable priority ordering */
  priorityEnabled?: boolean;
}

/**
 * QueueFacade provides a unified interface to the new queue system.
 *
 * Key features:
 * - Direct delegation to Scheduler, ResourceMonitor, RetryManager
 * - Event emission for monitoring
 * - Simple statistics reporting
 */
export class QueueFacade extends EventEmitter {
  private readonly scheduler: Scheduler;
  private readonly resourceMonitor: ResourceMonitor;
  private readonly retryManager: RetryManager;

  // Counters for monitoring
  private counters = {
    totalEnqueued: 0,
    totalStarted: 0,
    totalCompleted: 0,
  };

  constructor(
    scheduler: Scheduler,
    resourceMonitor: ResourceMonitor,
    retryManager: RetryManager
  ) {
    super();
    this.scheduler = scheduler;
    this.resourceMonitor = resourceMonitor;
    this.retryManager = retryManager;

    log.info('QueueFacade initialized with new queue system');
  }

  /**
   * Create a QueueFacade with default configuration.
   */
  static create(config: QueueFacadeConfig = {}): QueueFacade {
    const resourceMonitor = new ResourceMonitor({
      maxConcurrentSlots: config.maxConcurrentSlots ?? 5,
      memoryPerSlotMB: config.memoryPerSlotMB ?? 2048,
      pollIntervalMs: config.pollIntervalMs ?? 5000,
    });

    const scheduler = new Scheduler(resourceMonitor, {
      pollIntervalMs: config.pollIntervalMs ?? 5000,
      staggerDelayMs: config.staggerDelayMs ?? 30000,
      priorityEnabled: config.priorityEnabled ?? false,
      maxQueueDepth: 0, // Unlimited
    });

    const retryManager = new RetryManager({
      maxRetries: 3,
      baseDelayMs: 5000,
      maxDelayMs: 300000,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
    });

    return new QueueFacade(scheduler, resourceMonitor, retryManager);
  }

  /**
   * Enqueue a work order.
   */
  enqueue(workOrderId: string, options: EnqueueOptions = {}): EnqueueResult {
    log.debug({ workOrderId, priority: options.priority }, 'Enqueueing work order');

    // Create a state machine for this work order
    const stateMachine = new WorkOrderStateMachine({
      workOrderId,
      maxRetries: 3,
    });

    // Create queued work order
    const queuedWorkOrder: QueuedWorkOrder = {
      id: workOrderId,
      stateMachine,
      priority: options.priority ?? 0,
      submittedAt: new Date(),
      data: { options },
    };

    // Enqueue to scheduler
    const success = this.scheduler.enqueue(queuedWorkOrder);

    if (!success) {
      log.warn({ workOrderId }, 'Failed to enqueue work order - queue full');
      return {
        success: false,
        position: null,
        error: 'Queue is full',
      };
    }

    this.counters.totalEnqueued++;
    this.emit('enqueued', workOrderId);

    // Return position info
    const queueDepth = this.scheduler.getQueueDepth();
    const position: QueuePosition = {
      position: queueDepth,
      estimatedWaitMs: null,
      ahead: queueDepth - 1,
      state: 'waiting',
      enqueuedAt: queuedWorkOrder.submittedAt,
    };

    log.debug({ workOrderId, position: queueDepth }, 'Work order enqueued successfully');
    return { success: true, position };
  }

  /**
   * Get position of a work order in the queue.
   */
  getPosition(workOrderId: string): QueuePosition | null {
    const queued = this.scheduler.getQueuedWorkOrders();
    const index = queued.findIndex(w => w.id === workOrderId);

    if (index === -1) {
      return null;
    }

    const wo = queued[index]!;
    return {
      position: index + 1,
      estimatedWaitMs: null,
      ahead: index,
      state: 'waiting',
      enqueuedAt: wo.submittedAt,
    };
  }

  /**
   * Cancel a work order from the queue.
   */
  cancel(workOrderId: string): boolean {
    const dequeued = this.scheduler.dequeue(workOrderId);
    if (dequeued) {
      log.debug({ workOrderId }, 'Work order cancelled');
      return true;
    }
    return false;
  }

  /**
   * Mark a work order as started.
   */
  markStarted(workOrderId: string): void {
    this.counters.totalStarted++;
    this.emit('started', workOrderId);
    log.debug({ workOrderId }, 'Work order marked as started');
  }

  /**
   * Mark a work order as completed.
   */
  markCompleted(workOrderId: string): void {
    this.counters.totalCompleted++;
    this.emit('completed', workOrderId);
    log.debug({ workOrderId }, 'Work order marked as completed');
  }

  /**
   * Check if a work order can start immediately.
   */
  canStartImmediately(): boolean {
    const health = this.resourceMonitor.getHealthReport();
    return health.availableSlots > 0 && health.memoryPressure !== 'critical';
  }

  /**
   * Check if a work order is in the queue.
   */
  isEnqueued(workOrderId: string): boolean {
    const queued = this.scheduler.getQueuedWorkOrders();
    return queued.some(w => w.id === workOrderId);
  }

  /**
   * Get queue statistics.
   */
  getStats(): QueueFacadeStats {
    const health = this.resourceMonitor.getHealthReport();
    const schedulerStats = this.scheduler.getStats();

    return {
      queueDepth: this.scheduler.getQueueDepth(),
      isRunning: schedulerStats.isRunning,
      availableSlots: health.availableSlots,
      activeSlots: health.activeSlots,
      memoryPressure: health.memoryPressure,
      counters: { ...this.counters },
    };
  }

  /**
   * Get the scheduler.
   */
  getScheduler(): Scheduler {
    return this.scheduler;
  }

  /**
   * Get the resource monitor.
   */
  getResourceMonitor(): ResourceMonitor {
    return this.resourceMonitor;
  }

  /**
   * Get the retry manager.
   */
  getRetryManager(): RetryManager {
    return this.retryManager;
  }

  /**
   * Start the queue system.
   */
  start(): void {
    this.resourceMonitor.start();
    log.info('Queue system started');
  }

  /**
   * Stop the queue system.
   */
  stop(): void {
    this.scheduler.stop();
    this.resourceMonitor.stop();
    this.retryManager.cancelAll();
    log.info('Queue system stopped');
  }

  /**
   * Reset counters (useful for testing).
   */
  resetCounters(): void {
    this.counters = {
      totalEnqueued: 0,
      totalStarted: 0,
      totalCompleted: 0,
    };
  }
}
