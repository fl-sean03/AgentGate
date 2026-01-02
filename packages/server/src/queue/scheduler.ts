import { EventEmitter } from 'events';
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import { ResourceMonitor, SlotHandle } from './resource-monitor.js';
import { WorkOrderStateMachine } from './state-machine.js';

/**
 * Queued work order with state machine.
 */
export interface QueuedWorkOrder {
  id: string;
  stateMachine: WorkOrderStateMachine;
  priority: number;  // Higher = more urgent
  submittedAt: Date;
  data: unknown;     // Work order payload
}

/**
 * Scheduler configuration.
 */
export interface SchedulerConfig {
  pollIntervalMs: number;      // How often to check for work
  staggerDelayMs: number;      // Delay between starting work orders
  priorityEnabled: boolean;    // Enable priority queue
  maxQueueDepth: number;       // Maximum queue size (0 = unlimited)
}

const DEFAULT_CONFIG: SchedulerConfig = {
  pollIntervalMs: 1000,
  staggerDelayMs: 5000,
  priorityEnabled: false,
  maxQueueDepth: 0,
};

/**
 * Events emitted by Scheduler.
 */
export interface SchedulerEvents {
  'work-claimed': (workOrder: QueuedWorkOrder, slot: SlotHandle) => void;
  'queue-empty': () => void;
  'backpressure': (depth: number) => void;
  'stagger-wait': (workOrderId: string, delayMs: number) => void;
}

/**
 * Execution handler type.
 */
export type ExecutionHandler = (
  workOrder: QueuedWorkOrder,
  slot: SlotHandle
) => Promise<void>;

/**
 * Pull-based scheduler with resource awareness.
 */
export class Scheduler extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: SchedulerConfig;
  private readonly resourceMonitor: ResourceMonitor;
  private readonly queue: QueuedWorkOrder[] = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private lastClaimTime: number = 0;
  private running: boolean = false;
  private executionHandler: ExecutionHandler | null = null;

  constructor(
    resourceMonitor: ResourceMonitor,
    config: Partial<SchedulerConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.resourceMonitor = resourceMonitor;
    this.logger = createLogger('scheduler');

    // Listen for slot availability
    this.resourceMonitor.on('slot-available', () => {
      this.logger.debug('Slot available, checking queue');
      this.tryClaimWork();
    });

    // React to memory pressure
    this.resourceMonitor.on('memory-pressure', (level) => {
      if (level === 'critical') {
        this.logger.warn('Critical memory pressure, pausing claims');
      }
    });
  }

  /**
   * Set the handler that will execute claimed work orders.
   */
  setExecutionHandler(handler: ExecutionHandler): void {
    this.executionHandler = handler;
  }

  /**
   * Start the scheduler loop.
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.logger.info(
      { config: this.config },
      'Scheduler started'
    );

    this.pollTimer = setInterval(() => {
      this.tryClaimWork();
    }, this.config.pollIntervalMs);

    // Initial check
    this.tryClaimWork();
  }

  /**
   * Stop the scheduler loop.
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.logger.info('Scheduler stopped');
  }

  /**
   * Add a work order to the queue.
   */
  enqueue(workOrder: QueuedWorkOrder): boolean {
    // Check queue depth limit
    if (this.config.maxQueueDepth > 0 && this.queue.length >= this.config.maxQueueDepth) {
      this.logger.warn(
        { workOrderId: workOrder.id, queueDepth: this.queue.length, maxDepth: this.config.maxQueueDepth },
        'Queue full, rejecting work order'
      );
      this.emit('backpressure', this.queue.length);
      return false;
    }

    this.queue.push(workOrder);

    // Sort by priority if enabled
    if (this.config.priorityEnabled) {
      this.queue.sort((a, b) => b.priority - a.priority);
    }

    this.logger.info(
      { workOrderId: workOrder.id, priority: workOrder.priority, queueDepth: this.queue.length },
      'Work order enqueued'
    );

    // Immediate check for available slot
    setImmediate(() => this.tryClaimWork());

    return true;
  }

  /**
   * Remove a work order from the queue.
   */
  dequeue(workOrderId: string): QueuedWorkOrder | undefined {
    const index = this.queue.findIndex(w => w.id === workOrderId);
    if (index === -1) return undefined;

    const [removed] = this.queue.splice(index, 1);
    this.logger.info(
      { workOrderId, queueDepth: this.queue.length },
      'Work order dequeued'
    );
    return removed;
  }

  /**
   * Get current queue depth.
   */
  getQueueDepth(): number {
    return this.queue.length;
  }

  /**
   * Get all queued work orders.
   */
  getQueuedWorkOrders(): readonly QueuedWorkOrder[] {
    return this.queue;
  }

  /**
   * Try to claim work from the queue.
   */
  private tryClaimWork(): void {
    if (!this.running) return;
    if (this.queue.length === 0) {
      this.emit('queue-empty');
      return;
    }
    if (!this.executionHandler) {
      this.logger.warn('No execution handler set');
      return;
    }

    // Check stagger delay
    const timeSinceLastClaim = Date.now() - this.lastClaimTime;
    if (timeSinceLastClaim < this.config.staggerDelayMs && this.lastClaimTime > 0) {
      const remainingDelay = this.config.staggerDelayMs - timeSinceLastClaim;
      const nextWorkOrder = this.queue[0];
      this.logger.debug(
        { workOrderId: nextWorkOrder?.id, remainingDelay },
        'Stagger delay not met, waiting'
      );
      this.emit('stagger-wait', nextWorkOrder?.id ?? 'unknown', remainingDelay);
      return;
    }

    // Check resource availability
    const health = this.resourceMonitor.getHealthReport();
    if (health.memoryPressure === 'critical') {
      this.logger.warn('Critical memory pressure, skipping claim');
      return;
    }

    // Get next work order
    const workOrder = this.queue[0];
    if (!workOrder) return;

    // Try to acquire a slot
    const slot = this.resourceMonitor.acquireSlot(workOrder.id);
    if (!slot) {
      this.logger.debug(
        { workOrderId: workOrder.id },
        'Could not acquire slot'
      );
      return;
    }

    // Remove from queue and claim
    this.queue.shift();
    this.lastClaimTime = Date.now();

    this.logger.info(
      { workOrderId: workOrder.id, slotId: slot.id, queueDepth: this.queue.length },
      'Work order claimed'
    );

    // Transition state
    try {
      workOrder.stateMachine.claim({ slotId: slot.id });
    } catch (err) {
      // State transition failed, release slot and re-queue
      this.logger.error(
        { workOrderId: workOrder.id, err },
        'Failed to transition to PREPARING'
      );
      this.resourceMonitor.releaseSlot(slot);
      this.queue.unshift(workOrder);
      return;
    }

    // Emit event
    this.emit('work-claimed', workOrder, slot);

    // Execute (async, don't await)
    this.executeWorkOrder(workOrder, slot).catch(err => {
      this.logger.error(
        { workOrderId: workOrder.id, err },
        'Execution handler error'
      );
    });
  }

  /**
   * Execute a work order.
   */
  private async executeWorkOrder(workOrder: QueuedWorkOrder, slot: SlotHandle): Promise<void> {
    try {
      await this.executionHandler!(workOrder, slot);
    } finally {
      // Slot release is handled by execution manager
      // This is just a safety net
    }
  }

  /**
   * Get scheduler statistics.
   */
  getStats(): {
    queueDepth: number;
    isRunning: boolean;
    lastClaimTime: number;
    resourceHealth: ReturnType<ResourceMonitor['getHealthReport']>;
  } {
    return {
      queueDepth: this.queue.length,
      isRunning: this.running,
      lastClaimTime: this.lastClaimTime,
      resourceHealth: this.resourceMonitor.getHealthReport(),
    };
  }
}
