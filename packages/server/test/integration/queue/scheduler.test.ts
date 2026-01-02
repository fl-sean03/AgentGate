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
