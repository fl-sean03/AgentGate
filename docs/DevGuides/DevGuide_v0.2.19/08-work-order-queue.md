# 08: Thrust 7 - Work Order Queue

## Overview

Replace the current "reject when at capacity" behavior with a proper work order queue, providing better UX and graceful handling of load spikes.

---

## Current State

### Rejection at Capacity

**Location:** `packages/server/src/orchestrator/orchestrator.ts:120-124`

```typescript
if (this.activeRuns.size >= this.maxConcurrentRuns) {
  throw new Error(`Maximum concurrent runs (${this.maxConcurrentRuns}) reached`);
}
```

### Problems

1. **Bad UX** - Users get error instead of being queued
2. **Lost work** - Rejected work orders must be resubmitted manually
3. **No visibility** - Can't see queue position or wait time
4. **Race conditions** - Two clients might both check and both get rejected
5. **No prioritization** - Can't prioritize certain work orders

---

## Target State

### WorkOrderQueue Interface

**Location:** `packages/server/src/types/work-order-queue.ts`

```typescript
/**
 * Extended work order status with queue states.
 */
export enum WorkOrderStatus {
  PENDING = 'pending',       // In queue, waiting to start
  QUEUED = 'queued',         // Ready to start (legacy compat)
  RUNNING = 'running',
  WAITING_FOR_CHILDREN = 'waiting_for_children',
  INTEGRATING = 'integrating',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

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
```

### Example Queue Flow

```
Time 0:   WO-1 running, WO-2 running, WO-3 submitted
          → WO-3 enters queue at position 1
          → WO-3 status: PENDING

Time 30s: WO-1 completes, WO-3 starts
          → WO-3 status: RUNNING

Time 45s: WO-4 submitted
          → WO-4 enters queue at position 1
          → WO-4 status: PENDING, position: { ahead: 1, estimatedWaitMs: 60000 }

Time 60s: WO-2 completes, WO-4 starts
          → WO-4 status: RUNNING
```

---

## Implementation

### Step 1: Create Type Definitions

**File:** `packages/server/src/types/work-order-queue.ts`

```typescript
export enum WorkOrderStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  WAITING_FOR_CHILDREN = 'waiting_for_children',
  INTEGRATING = 'integrating',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

export interface QueuePosition {
  position: number;
  estimatedWaitMs: number | null;
  ahead: number;
  state: 'waiting' | 'running';
  enqueuedAt: Date;
}

export interface QueueStats {
  waiting: number;
  running: number;
  maxConcurrent: number;
  averageWaitMs: number;
  maxQueueSize: number;
  accepting: boolean;
}

export interface EnqueueOptions {
  priority?: number;
  maxWaitMs?: number;
  onPositionChange?: (position: QueuePosition) => void;
}

export interface QueuedWorkOrder {
  workOrderId: string;
  priority: number;
  enqueuedAt: Date;
  maxWaitMs: number | null;
  onPositionChange?: (position: QueuePosition) => void;
}
```

### Step 2: Create WorkOrderQueue

**File:** `packages/server/src/control-plane/work-order-queue.ts`

```typescript
import { EventEmitter } from 'node:events';
import {
  QueuePosition,
  QueueStats,
  EnqueueOptions,
  QueuedWorkOrder,
  WorkOrderStatus,
} from '../types/work-order-queue.js';
import { createLogger } from '../logging/index.js';

const log = createLogger('work-order-queue');

/**
 * Priority queue for work orders.
 */
export class WorkOrderQueue extends EventEmitter {
  private queue: QueuedWorkOrder[] = [];
  private running: Set<string> = new Set();
  private maxConcurrent: number;
  private maxQueueSize: number;
  private waitTimes: number[] = [];  // Recent wait times for estimation

  constructor(options: {
    maxConcurrent?: number;
    maxQueueSize?: number;
  } = {}) {
    super();
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.maxQueueSize = options.maxQueueSize ?? 100;
  }

  /**
   * Enqueue a work order.
   * Returns immediately with queue position.
   */
  enqueue(
    workOrderId: string,
    options: EnqueueOptions = {}
  ): { success: boolean; position: QueuePosition | null; error?: string } {
    // Check if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      log.warn({ workOrderId, queueSize: this.queue.length }, 'Queue full, rejecting');
      return {
        success: false,
        position: null,
        error: `Queue is full (${this.maxQueueSize} work orders waiting)`,
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
    const insertIndex = this.queue.findIndex(e => e.priority < entry.priority);
    if (insertIndex === -1) {
      this.queue.push(entry);
    } else {
      this.queue.splice(insertIndex, 0, entry);
    }

    const position = this.getPosition(workOrderId)!;

    log.info(
      { workOrderId, position: position.position, ahead: position.ahead },
      'Work order enqueued'
    );

    // Notify position to new entry
    options.onPositionChange?.(position);

    // Notify all entries of position changes
    this.notifyPositionChanges();

    // Try to process queue
    this.processQueue();

    return { success: true, position };
  }

  /**
   * Get position of a work order in queue.
   */
  getPosition(workOrderId: string): QueuePosition | null {
    // Check if running
    if (this.running.has(workOrderId)) {
      return {
        position: 0,
        estimatedWaitMs: 0,
        ahead: 0,
        state: 'running',
        enqueuedAt: new Date(),  // Not accurate but indicates running
      };
    }

    // Find in queue
    const index = this.queue.findIndex(e => e.workOrderId === workOrderId);
    if (index === -1) {
      return null;
    }

    const entry = this.queue[index];
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
   */
  markStarted(workOrderId: string): void {
    const index = this.queue.findIndex(e => e.workOrderId === workOrderId);
    if (index !== -1) {
      const entry = this.queue[index];
      const waitTime = Date.now() - entry.enqueuedAt.getTime();
      this.queue.splice(index, 1);
      this.recordWaitTime(waitTime);
    }

    this.running.add(workOrderId);
    log.debug({ workOrderId, running: this.running.size }, 'Work order started');

    this.notifyPositionChanges();
  }

  /**
   * Mark a work order as completed (remove from running).
   */
  markCompleted(workOrderId: string): void {
    this.running.delete(workOrderId);
    log.debug({ workOrderId, running: this.running.size }, 'Work order completed');

    // Process queue to start next work orders
    this.processQueue();
  }

  /**
   * Cancel a queued work order.
   */
  cancel(workOrderId: string): boolean {
    const index = this.queue.findIndex(e => e.workOrderId === workOrderId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      log.info({ workOrderId }, 'Work order canceled from queue');
      this.notifyPositionChanges();
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
      maxConcurrent: this.maxConcurrent,
      averageWaitMs: this.calculateAverageWaitTime(),
      maxQueueSize: this.maxQueueSize,
      accepting: this.queue.length < this.maxQueueSize,
    };
  }

  /**
   * Check if a work order can start immediately.
   */
  canStartImmediately(): boolean {
    return this.running.size < this.maxConcurrent;
  }

  /**
   * Get next work order to start (if capacity available).
   */
  getNextToStart(): string | null {
    if (!this.canStartImmediately() || this.queue.length === 0) {
      return null;
    }
    return this.queue[0].workOrderId;
  }

  private processQueue(): void {
    while (this.canStartImmediately() && this.queue.length > 0) {
      const next = this.queue[0];

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
      break;  // Only emit one at a time
    }
  }

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

  private estimateWaitTime(ahead: number): number | null {
    if (ahead === 0 && this.canStartImmediately()) {
      return 0;
    }

    const avgWait = this.calculateAverageWaitTime();
    if (avgWait === 0) {
      return null;  // Not enough data
    }

    // Estimate: (position / maxConcurrent) * averageWaitTime
    const batches = Math.ceil((ahead + 1) / this.maxConcurrent);
    return Math.round(batches * avgWait);
  }

  private recordWaitTime(ms: number): void {
    this.waitTimes.push(ms);
    // Keep last 50 wait times
    if (this.waitTimes.length > 50) {
      this.waitTimes.shift();
    }
  }

  private calculateAverageWaitTime(): number {
    if (this.waitTimes.length === 0) {
      return 0;
    }
    const sum = this.waitTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.waitTimes.length);
  }
}

// Singleton instance
let queueInstance: WorkOrderQueue | null = null;

export function getWorkOrderQueue(options?: {
  maxConcurrent?: number;
  maxQueueSize?: number;
}): WorkOrderQueue {
  if (!queueInstance) {
    queueInstance = new WorkOrderQueue(options);
  }
  return queueInstance;
}
```

### Step 3: Integrate with Orchestrator

**File:** `packages/server/src/orchestrator/orchestrator.ts`

```typescript
import { getWorkOrderQueue } from '../control-plane/work-order-queue.js';
import { WorkOrderStatus } from '../types/work-order-queue.js';

export class Orchestrator {
  private queue = getWorkOrderQueue({
    maxConcurrent: this.maxConcurrentRuns,
    maxQueueSize: 100,
  });

  constructor() {
    // Listen for ready events
    this.queue.on('ready', (workOrderId) => {
      this.startWorkOrder(workOrderId);
    });

    this.queue.on('timeout', (workOrderId) => {
      this.failWorkOrder(workOrderId, 'Timed out waiting in queue');
    });
  }

  /**
   * Submit a work order (enqueues if at capacity).
   */
  async submitWorkOrder(workOrder: WorkOrder): Promise<{
    workOrderId: string;
    status: WorkOrderStatus;
    position?: QueuePosition;
  }> {
    // Enqueue the work order
    const result = this.queue.enqueue(workOrder.id, {
      priority: workOrder.priority ?? 0,
      maxWaitMs: workOrder.maxQueueWaitMs,
      onPositionChange: (position) => {
        // Notify SSE clients
        this.broadcaster.broadcast({
          type: 'queue-position',
          workOrderId: workOrder.id,
          position,
        });
      },
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    // Determine initial status
    const canStart = this.queue.canStartImmediately();
    const status = canStart ? WorkOrderStatus.QUEUED : WorkOrderStatus.PENDING;

    // If can start immediately, it will be started via 'ready' event
    return {
      workOrderId: workOrder.id,
      status,
      position: result.position ?? undefined,
    };
  }

  private async startWorkOrder(workOrderId: string): Promise<void> {
    this.queue.markStarted(workOrderId);
    // ... existing start logic
  }

  private async completeWorkOrder(workOrderId: string): Promise<void> {
    this.queue.markCompleted(workOrderId);
    // ... existing complete logic
  }
}
```

### Step 4: Update API Response

**File:** `packages/server/src/server/routes/work-orders.ts`

```typescript
// POST /api/v1/work-orders response now includes queue info
{
  success: true,
  data: {
    id: workOrder.id,
    status: result.status,  // 'pending' or 'queued'
    position: result.position,  // { position: 3, estimatedWaitMs: 60000, ... }
    ...
  }
}

// New endpoint: GET /api/v1/work-orders/:id/position
app.get('/api/v1/work-orders/:id/position', async (req, reply) => {
  const { id } = req.params;
  const queue = getWorkOrderQueue();
  const position = queue.getPosition(id);

  if (!position) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Work order not in queue' },
    });
  }

  return { success: true, data: position };
});

// New endpoint: GET /api/v1/queue/stats
app.get('/api/v1/queue/stats', async (req, reply) => {
  const queue = getWorkOrderQueue();
  return { success: true, data: queue.getStats() };
});
```

---

## Testing

### Unit Tests

**File:** `packages/server/test/work-order-queue.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkOrderQueue } from '../src/control-plane/work-order-queue.js';

describe('WorkOrderQueue', () => {
  let queue: WorkOrderQueue;

  beforeEach(() => {
    queue = new WorkOrderQueue({ maxConcurrent: 2, maxQueueSize: 10 });
  });

  describe('enqueue', () => {
    it('should enqueue work order and return position', () => {
      const result = queue.enqueue('wo-1');

      expect(result.success).toBe(true);
      expect(result.position).not.toBeNull();
      expect(result.position!.position).toBe(1);
      expect(result.position!.state).toBe('waiting');
    });

    it('should respect priority ordering', () => {
      queue.enqueue('wo-low', { priority: 0 });
      queue.enqueue('wo-high', { priority: 10 });
      queue.enqueue('wo-medium', { priority: 5 });

      const pos1 = queue.getPosition('wo-high');
      const pos2 = queue.getPosition('wo-medium');
      const pos3 = queue.getPosition('wo-low');

      expect(pos1!.position).toBe(1);
      expect(pos2!.position).toBe(2);
      expect(pos3!.position).toBe(3);
    });

    it('should reject when queue is full', () => {
      const smallQueue = new WorkOrderQueue({ maxConcurrent: 1, maxQueueSize: 2 });

      smallQueue.enqueue('wo-1');
      smallQueue.enqueue('wo-2');
      const result = smallQueue.enqueue('wo-3');

      expect(result.success).toBe(false);
      expect(result.error).toContain('full');
    });

    it('should call onPositionChange when position changes', () => {
      const callback = vi.fn();
      queue.enqueue('wo-1', { onPositionChange: callback });
      queue.enqueue('wo-2');

      // wo-1 should have been notified
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('markStarted', () => {
    it('should move work order from queue to running', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');

      const position = queue.getPosition('wo-1');
      expect(position!.state).toBe('running');
    });

    it('should update positions of remaining work orders', () => {
      queue.enqueue('wo-1');
      queue.enqueue('wo-2');

      queue.markStarted('wo-1');

      const pos2 = queue.getPosition('wo-2');
      expect(pos2!.position).toBe(1);
    });
  });

  describe('markCompleted', () => {
    it('should emit ready event for next work order', () => {
      const readyHandler = vi.fn();
      queue.on('ready', readyHandler);

      queue.enqueue('wo-1');
      queue.enqueue('wo-2');
      queue.enqueue('wo-3');

      // Start first two (max concurrent)
      queue.markStarted('wo-1');
      queue.markStarted('wo-2');

      // Complete one
      queue.markCompleted('wo-1');

      expect(readyHandler).toHaveBeenCalledWith('wo-3');
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      queue.enqueue('wo-1');
      queue.enqueue('wo-2');
      queue.markStarted('wo-1');

      const stats = queue.getStats();

      expect(stats.waiting).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.maxConcurrent).toBe(2);
      expect(stats.accepting).toBe(true);
    });
  });

  describe('cancel', () => {
    it('should remove work order from queue', () => {
      queue.enqueue('wo-1');
      queue.enqueue('wo-2');

      const result = queue.cancel('wo-1');

      expect(result).toBe(true);
      expect(queue.getPosition('wo-1')).toBeNull();
      expect(queue.getPosition('wo-2')!.position).toBe(1);
    });
  });
});
```

---

## Verification Checklist

- [ ] `WorkOrderStatus` enum includes PENDING state
- [ ] `QueuePosition` interface provides wait time estimates
- [ ] `WorkOrderQueue` class implements priority queue
- [ ] Enqueue returns position immediately
- [ ] Priority ordering works correctly
- [ ] Queue size limits are enforced
- [ ] Position change callbacks are called
- [ ] `ready` event emitted when capacity available
- [ ] `timeout` event emitted when max wait exceeded
- [ ] Orchestrator uses queue for submission
- [ ] API returns queue position in response
- [ ] New endpoints for position and stats
- [ ] SSE broadcasts position changes
- [ ] Unit tests pass

---

## Benefits

1. **No rejected work orders** - Everything queues (within limits)
2. **Visibility** - Users know their position and estimated wait
3. **Prioritization** - Critical work orders can jump the queue
4. **Graceful degradation** - System handles load spikes smoothly
5. **Real-time updates** - Position changes broadcast via SSE
