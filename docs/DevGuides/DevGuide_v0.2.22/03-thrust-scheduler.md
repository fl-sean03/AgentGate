# 03 - Thrust: Resource-Aware Scheduler

## Objective

Implement a pull-based scheduler that:
- Automatically processes work orders without manual triggers
- Respects resource limits (memory, concurrent slots)
- Provides backpressure when system is overloaded
- Supports priority ordering (optional, default FIFO)
- Staggers work order starts to prevent thundering herd

## Current State Analysis

### Existing Implementation Problems
```typescript
// Current: Push-based, no resource awareness
async trigger(workOrderId: string): Promise<void> {
  // Immediately starts execution regardless of available resources
  // No queue management
  // No backpressure
  // No staggering
}
```

### Target Implementation
```typescript
// New: Pull-based with resource gating
scheduler.enqueue(workOrder);  // Add to queue

// Scheduler loop (automatic):
// 1. Check if slot available
// 2. Check memory pressure
// 3. Claim next work order
// 4. Start execution with stagger delay
```

## Subtasks

### Subtask 3.1: Implement ResourceMonitor

**Files Created:**
- `packages/server/src/queue/resource-monitor.ts`

```typescript
import { EventEmitter } from 'events';
import * as os from 'os';
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';

/**
 * A slot handle represents a claimed execution slot.
 */
export interface SlotHandle {
  readonly id: string;
  readonly acquiredAt: Date;
  readonly workOrderId: string;
}

/**
 * Memory pressure levels.
 */
export type MemoryPressure = 'none' | 'warning' | 'critical';

/**
 * Resource health report.
 */
export interface ResourceHealthReport {
  memoryTotalMB: number;
  memoryUsedMB: number;
  memoryAvailableMB: number;
  memoryPressure: MemoryPressure;
  activeSlots: number;
  maxSlots: number;
  availableSlots: number;
  cpuUsagePercent: number;
  healthy: boolean;
}

/**
 * Configuration for resource monitoring.
 */
export interface ResourceMonitorConfig {
  maxConcurrentSlots: number;
  memoryPerSlotMB: number;
  warningThreshold: number;   // 0-1, default 0.8
  criticalThreshold: number;  // 0-1, default 0.9
  pollIntervalMs: number;     // How often to check resources
}

const DEFAULT_CONFIG: ResourceMonitorConfig = {
  maxConcurrentSlots: 2,
  memoryPerSlotMB: 4096,
  warningThreshold: 0.8,
  criticalThreshold: 0.9,
  pollIntervalMs: 5000,
};

/**
 * Events emitted by ResourceMonitor.
 */
export interface ResourceMonitorEvents {
  'slot-available': () => void;
  'memory-pressure': (level: MemoryPressure, report: ResourceHealthReport) => void;
  'health-changed': (report: ResourceHealthReport) => void;
}

/**
 * Monitors system resources and manages execution slots.
 */
export class ResourceMonitor extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: ResourceMonitorConfig;
  private readonly activeSlots: Map<string, SlotHandle> = new Map();
  private pollTimer: NodeJS.Timeout | null = null;
  private lastPressure: MemoryPressure = 'none';

  constructor(config: Partial<ResourceMonitorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger('resource-monitor');
  }

  /**
   * Start monitoring resources.
   */
  start(): void {
    if (this.pollTimer) return;

    this.logger.info(
      { config: this.config },
      'Starting resource monitor'
    );

    this.pollTimer = setInterval(() => {
      this.checkResources();
    }, this.config.pollIntervalMs);

    // Initial check
    this.checkResources();
  }

  /**
   * Stop monitoring resources.
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.logger.info('Resource monitor stopped');
    }
  }

  /**
   * Check current resource status and emit events if needed.
   */
  private checkResources(): void {
    const report = this.getHealthReport();

    // Check for memory pressure changes
    if (report.memoryPressure !== this.lastPressure) {
      this.logger.warn(
        { previous: this.lastPressure, current: report.memoryPressure, report },
        'Memory pressure changed'
      );
      this.lastPressure = report.memoryPressure;
      this.emit('memory-pressure', report.memoryPressure, report);
    }

    // Emit health changes
    this.emit('health-changed', report);
  }

  /**
   * Attempt to acquire an execution slot.
   * Returns null if no slots available or under memory pressure.
   */
  acquireSlot(workOrderId: string): SlotHandle | null {
    const report = this.getHealthReport();

    // Don't allocate under critical memory pressure
    if (report.memoryPressure === 'critical') {
      this.logger.warn(
        { workOrderId, pressure: report.memoryPressure },
        'Cannot acquire slot: critical memory pressure'
      );
      return null;
    }

    // Check slot availability
    if (this.activeSlots.size >= this.config.maxConcurrentSlots) {
      this.logger.debug(
        { workOrderId, activeSlots: this.activeSlots.size, maxSlots: this.config.maxConcurrentSlots },
        'Cannot acquire slot: all slots in use'
      );
      return null;
    }

    // Check if enough memory for another slot
    const requiredMemory = this.config.memoryPerSlotMB;
    if (report.memoryAvailableMB < requiredMemory) {
      this.logger.warn(
        { workOrderId, available: report.memoryAvailableMB, required: requiredMemory },
        'Cannot acquire slot: insufficient memory'
      );
      return null;
    }

    // Acquire slot
    const handle: SlotHandle = {
      id: `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      acquiredAt: new Date(),
      workOrderId,
    };

    this.activeSlots.set(handle.id, handle);

    this.logger.info(
      { slotId: handle.id, workOrderId, activeSlots: this.activeSlots.size },
      'Slot acquired'
    );

    return handle;
  }

  /**
   * Release an execution slot.
   */
  releaseSlot(handle: SlotHandle): void {
    if (!this.activeSlots.has(handle.id)) {
      this.logger.warn(
        { slotId: handle.id },
        'Attempted to release unknown slot'
      );
      return;
    }

    this.activeSlots.delete(handle.id);

    this.logger.info(
      { slotId: handle.id, workOrderId: handle.workOrderId, activeSlots: this.activeSlots.size },
      'Slot released'
    );

    // Notify that a slot is available
    this.emit('slot-available');
  }

  /**
   * Get current resource health report.
   */
  getHealthReport(): ResourceHealthReport {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usageRatio = usedMemory / totalMemory;

    let memoryPressure: MemoryPressure = 'none';
    if (usageRatio >= this.config.criticalThreshold) {
      memoryPressure = 'critical';
    } else if (usageRatio >= this.config.warningThreshold) {
      memoryPressure = 'warning';
    }

    // CPU usage (load average / number of cores)
    const loadAvg = os.loadavg()[0]; // 1-minute load average
    const cpuCount = os.cpus().length;
    const cpuUsagePercent = Math.min(100, (loadAvg / cpuCount) * 100);

    const activeSlots = this.activeSlots.size;
    const maxSlots = this.config.maxConcurrentSlots;

    return {
      memoryTotalMB: Math.floor(totalMemory / 1024 / 1024),
      memoryUsedMB: Math.floor(usedMemory / 1024 / 1024),
      memoryAvailableMB: Math.floor(freeMemory / 1024 / 1024),
      memoryPressure,
      activeSlots,
      maxSlots,
      availableSlots: maxSlots - activeSlots,
      cpuUsagePercent: Math.round(cpuUsagePercent),
      healthy: memoryPressure !== 'critical' && activeSlots < maxSlots,
    };
  }

  /**
   * Get number of available slots.
   */
  getAvailableSlots(): number {
    return this.config.maxConcurrentSlots - this.activeSlots.size;
  }

  /**
   * Check if resources are healthy for new work.
   */
  isHealthy(): boolean {
    return this.getHealthReport().healthy;
  }
}
```

**Verification:**
- [ ] Slot acquisition respects limits
- [ ] Memory pressure is correctly detected
- [ ] Events are emitted on state changes

---

### Subtask 3.2: Implement Scheduler

**Files Created:**
- `packages/server/src/queue/scheduler.ts`

```typescript
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
```

**Verification:**
- [ ] Work orders are claimed when slots available
- [ ] Stagger delay is respected
- [ ] Memory pressure pauses claims
- [ ] Priority ordering works when enabled

---

### Subtask 3.3: Write Integration Tests

**Files Created:**
- `packages/server/test/integration/queue/scheduler.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler, QueuedWorkOrder } from '../../../src/queue/scheduler.js';
import { ResourceMonitor } from '../../../src/queue/resource-monitor.js';
import { WorkOrderStateMachine } from '../../../src/queue/state-machine.js';

describe('Scheduler Integration', () => {
  let resourceMonitor: ResourceMonitor;
  let scheduler: Scheduler;

  beforeEach(() => {
    resourceMonitor = new ResourceMonitor({
      maxConcurrentSlots: 2,
      memoryPerSlotMB: 100,  // Low for testing
      pollIntervalMs: 100,
    });

    scheduler = new Scheduler(resourceMonitor, {
      pollIntervalMs: 100,
      staggerDelayMs: 0,  // No stagger for faster tests
      priorityEnabled: false,
    });

    resourceMonitor.start();
  });

  afterEach(() => {
    scheduler.stop();
    resourceMonitor.stop();
  });

  function createWorkOrder(id: string, priority = 0): QueuedWorkOrder {
    return {
      id,
      stateMachine: new WorkOrderStateMachine({
        workOrderId: id,
        maxRetries: 3,
      }),
      priority,
      submittedAt: new Date(),
      data: { test: true },
    };
  }

  it('should claim work when slot is available', async () => {
    const claimed = vi.fn();
    scheduler.on('work-claimed', claimed);

    scheduler.setExecutionHandler(async () => {
      // Simulate work
      await new Promise(r => setTimeout(r, 50));
    });

    scheduler.start();
    scheduler.enqueue(createWorkOrder('wo-1'));

    // Wait for claim
    await new Promise(r => setTimeout(r, 200));

    expect(claimed).toHaveBeenCalledTimes(1);
    expect(claimed.mock.calls[0][0].id).toBe('wo-1');
  });

  it('should respect slot limits', async () => {
    const claimed: string[] = [];
    const completed = vi.fn();

    scheduler.setExecutionHandler(async (wo, slot) => {
      claimed.push(wo.id);
      // Hold slot for a while
      await new Promise(r => setTimeout(r, 300));
      resourceMonitor.releaseSlot(slot);
      completed();
    });

    scheduler.start();

    // Enqueue 4 work orders
    scheduler.enqueue(createWorkOrder('wo-1'));
    scheduler.enqueue(createWorkOrder('wo-2'));
    scheduler.enqueue(createWorkOrder('wo-3'));
    scheduler.enqueue(createWorkOrder('wo-4'));

    // After short delay, should have claimed 2 (max slots)
    await new Promise(r => setTimeout(r, 150));
    expect(claimed.length).toBe(2);

    // After first batch completes, should claim more
    await new Promise(r => setTimeout(r, 400));
    expect(claimed.length).toBe(4);
  });

  it('should process in priority order when enabled', async () => {
    const claimed: string[] = [];

    const priorityScheduler = new Scheduler(resourceMonitor, {
      pollIntervalMs: 100,
      staggerDelayMs: 0,
      priorityEnabled: true,
    });

    priorityScheduler.setExecutionHandler(async (wo, slot) => {
      claimed.push(wo.id);
      resourceMonitor.releaseSlot(slot);
    });

    // Enqueue in reverse priority order
    priorityScheduler.enqueue(createWorkOrder('low', 1));
    priorityScheduler.enqueue(createWorkOrder('high', 10));
    priorityScheduler.enqueue(createWorkOrder('medium', 5));

    priorityScheduler.start();

    await new Promise(r => setTimeout(r, 500));

    // Should be claimed in priority order
    expect(claimed).toEqual(['high', 'medium', 'low']);

    priorityScheduler.stop();
  });

  it('should emit backpressure when queue is full', () => {
    const backpressure = vi.fn();
    const limitedScheduler = new Scheduler(resourceMonitor, {
      maxQueueDepth: 2,
    });

    limitedScheduler.on('backpressure', backpressure);

    expect(limitedScheduler.enqueue(createWorkOrder('wo-1'))).toBe(true);
    expect(limitedScheduler.enqueue(createWorkOrder('wo-2'))).toBe(true);
    expect(limitedScheduler.enqueue(createWorkOrder('wo-3'))).toBe(false);
    expect(backpressure).toHaveBeenCalledWith(2);
  });
});
```

**Verification:**
- [ ] All integration tests pass
- [ ] Scheduler respects resource limits
- [ ] Priority ordering works correctly
- [ ] Backpressure is correctly emitted

---

## Files Created/Modified Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/queue/resource-monitor.ts` | Create | Resource tracking and slot management |
| `packages/server/src/queue/scheduler.ts` | Create | Pull-based scheduler |
| `packages/server/test/integration/queue/scheduler.test.ts` | Create | Integration tests |

## Verification Steps

1. **Unit Tests**
   ```bash
   npm run test -- --filter resource-monitor
   npm run test -- --filter scheduler
   ```

2. **Manual Verification**
   ```typescript
   const monitor = new ResourceMonitor({ maxConcurrentSlots: 2 });
   const scheduler = new Scheduler(monitor);

   scheduler.setExecutionHandler(async (wo, slot) => {
     console.log(`Executing ${wo.id}`);
     await sleep(1000);
     monitor.releaseSlot(slot);
   });

   monitor.start();
   scheduler.start();

   // Enqueue 5 work orders
   for (let i = 0; i < 5; i++) {
     scheduler.enqueue(createWorkOrder(`wo-${i}`));
   }

   // Should see 2 claimed immediately, then 2 more after they complete, then 1 more
   ```

## Dependencies

- Thrust 02 (State Machine) - uses WorkOrderStateMachine

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Poll loop CPU usage | Low | Configurable interval, sleep when queue empty |
| Stale resource readings | Medium | Frequent polling, conservative thresholds |
| Lost slot releases | High | Safety timeout, resource leak detection |
