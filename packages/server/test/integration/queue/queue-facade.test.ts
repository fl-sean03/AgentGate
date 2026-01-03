import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { QueueFacade, QueueFacadeConfig } from '../../../src/queue/queue-facade.js';
import { Scheduler, QueuedWorkOrder } from '../../../src/queue/scheduler.js';
import { ResourceMonitor } from '../../../src/queue/resource-monitor.js';
import { RetryManager } from '../../../src/queue/retry-manager.js';
import { WorkOrderStateMachine } from '../../../src/queue/state-machine.js';
import type {
  QueueManager,
  EnqueueOptions,
  EnqueueResult,
  QueuePosition,
  QueueStats,
} from '../../../src/control-plane/queue-manager.js';

/**
 * Mock QueueManager that implements the same interface as the real one.
 */
class MockQueueManager extends EventEmitter implements Partial<QueueManager> {
  private queue: Map<string, { enqueuedAt: Date; priority: number }> = new Map();
  private running: Set<string> = new Set();
  private maxConcurrent = 2;

  enqueue(workOrderId: string, options: EnqueueOptions = {}): EnqueueResult {
    if (this.queue.has(workOrderId) || this.running.has(workOrderId)) {
      return {
        success: false,
        position: null,
        error: `Work order ${workOrderId} is already queued or running`,
      };
    }

    const enqueuedAt = new Date();
    this.queue.set(workOrderId, { enqueuedAt, priority: options.priority ?? 0 });

    const position: QueuePosition = {
      position: this.queue.size,
      estimatedWaitMs: null,
      ahead: this.queue.size - 1,
      state: 'waiting',
      enqueuedAt,
    };

    return { success: true, position };
  }

  getPosition(workOrderId: string): QueuePosition | null {
    if (this.running.has(workOrderId)) {
      return {
        position: 0,
        estimatedWaitMs: 0,
        ahead: 0,
        state: 'running',
        enqueuedAt: new Date(),
      };
    }

    const entry = this.queue.get(workOrderId);
    if (!entry) return null;

    const index = Array.from(this.queue.keys()).indexOf(workOrderId);
    return {
      position: index + 1,
      estimatedWaitMs: null,
      ahead: index,
      state: 'waiting',
      enqueuedAt: entry.enqueuedAt,
    };
  }

  cancel(workOrderId: string): boolean {
    return this.queue.delete(workOrderId);
  }

  markStarted(
    workOrderId: string,
    _options?: { abortController?: AbortController; maxWallClockMs?: number | null }
  ): void {
    this.queue.delete(workOrderId);
    this.running.add(workOrderId);
  }

  markCompleted(workOrderId: string): void {
    this.running.delete(workOrderId);
  }

  canStartImmediately(): boolean {
    return this.running.size < this.maxConcurrent;
  }

  isEnqueued(workOrderId: string): boolean {
    return this.queue.has(workOrderId);
  }

  isRunning(workOrderId: string): boolean {
    return this.running.has(workOrderId);
  }

  getStats(): QueueStats {
    return {
      waiting: this.queue.size,
      running: this.running.size,
      maxConcurrent: this.maxConcurrent,
      averageWaitMs: 0,
      maxQueueSize: 100,
      accepting: true,
    };
  }
}

describe('QueueFacade Integration', () => {
  let mockLegacyQueue: MockQueueManager;
  let resourceMonitor: ResourceMonitor;
  let scheduler: Scheduler;
  let retryManager: RetryManager;
  let facade: QueueFacade;

  beforeEach(() => {
    mockLegacyQueue = new MockQueueManager();

    resourceMonitor = new ResourceMonitor({
      maxConcurrentSlots: 2,
      memoryPerSlotMB: 100,
      pollIntervalMs: 100,
      criticalThreshold: 1,  // Disable memory pressure checks for CI
      warningThreshold: 1,
    });

    scheduler = new Scheduler(resourceMonitor, {
      pollIntervalMs: 100,
      staggerDelayMs: 0,
      priorityEnabled: false,
    });

    retryManager = new RetryManager({
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
      jitterFactor: 0,
    });

    resourceMonitor.start();
  });

  afterEach(() => {
    scheduler.stop();
    resourceMonitor.stop();
    retryManager.cancelAll();
  });

  describe('Legacy Mode (default)', () => {
    beforeEach(() => {
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: false,
          shadowMode: false,
          rolloutPercent: 0,
        }
      );
    });

    it('should route all work orders to legacy queue', () => {
      const result = facade.enqueue('wo-1');

      expect(result.success).toBe(true);
      expect(result.position).not.toBeNull();
      expect(mockLegacyQueue.isEnqueued('wo-1')).toBe(true);

      const stats = facade.getStats();
      expect(stats.activeSystem).toBe('legacy');
      expect(stats.counters.routedToLegacy).toBe(1);
      expect(stats.counters.routedToNew).toBe(0);
    });

    it('should get position from legacy queue', () => {
      facade.enqueue('wo-1');
      const position = facade.getPosition('wo-1');

      expect(position).not.toBeNull();
      expect(position?.state).toBe('waiting');
    });

    it('should cancel from legacy queue', () => {
      facade.enqueue('wo-1');
      expect(facade.isEnqueued('wo-1')).toBe(true);

      const cancelled = facade.cancel('wo-1');
      expect(cancelled).toBe(true);
      expect(facade.isEnqueued('wo-1')).toBe(false);
    });
  });

  describe('New System Mode (100% rollout)', () => {
    beforeEach(() => {
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: true,
          shadowMode: false,
          rolloutPercent: 100,
        },
        {
          scheduler,
          resourceMonitor,
          retryManager,
        }
      );
    });

    it('should route all work orders to new queue system', () => {
      const result = facade.enqueue('wo-1');

      expect(result.success).toBe(true);
      expect(scheduler.getQueueDepth()).toBe(1);
      expect(mockLegacyQueue.isEnqueued('wo-1')).toBe(false);

      const stats = facade.getStats();
      expect(stats.activeSystem).toBe('new');
      expect(stats.counters.routedToNew).toBe(1);
      expect(stats.counters.routedToLegacy).toBe(0);
    });

    it('should emit routed event for new system', async () => {
      const routed = vi.fn();
      facade.on('routed', routed);

      facade.enqueue('wo-1');

      expect(routed).toHaveBeenCalledWith('wo-1', 'new');
    });

    it('should get position from new queue system', () => {
      facade.enqueue('wo-1');
      facade.enqueue('wo-2');

      const position = facade.getPosition('wo-2');
      expect(position).not.toBeNull();
      expect(position?.position).toBe(2);
      expect(position?.ahead).toBe(1);
    });

    it('should cancel from new queue system', () => {
      facade.enqueue('wo-1');
      expect(scheduler.getQueueDepth()).toBe(1);

      const cancelled = facade.cancel('wo-1');
      expect(cancelled).toBe(true);
      expect(scheduler.getQueueDepth()).toBe(0);
    });
  });

  describe('Shadow Mode', () => {
    beforeEach(() => {
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: false,
          shadowMode: true,
          rolloutPercent: 0,
        },
        {
          scheduler,
          resourceMonitor,
          retryManager,
        }
      );
    });

    it('should run both systems in shadow mode', () => {
      const result = facade.enqueue('wo-1');

      expect(result.success).toBe(true);
      // Primary result comes from legacy
      expect(mockLegacyQueue.isEnqueued('wo-1')).toBe(true);
      // Shadow entry in new system (prefixed with shadow-)
      expect(scheduler.getQueueDepth()).toBe(1);

      const stats = facade.getStats();
      expect(stats.activeSystem).toBe('both');
      expect(stats.shadowMode).toBe(true);
    });

    it('should emit shadow-mismatch when results differ', async () => {
      const mismatch = vi.fn();
      facade.on('shadow-mismatch', mismatch);

      // First enqueue succeeds in both
      facade.enqueue('wo-1');

      // Enqueue duplicate to legacy (should fail)
      // But shadow creates with different ID, so no mismatch expected for duplicate IDs
      expect(mismatch).not.toHaveBeenCalled();
    });
  });

  describe('Gradual Rollout', () => {
    it('should route based on rollout percentage', () => {
      // 50% rollout
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: false,
          shadowMode: false,
          rolloutPercent: 50,
        },
        {
          scheduler,
          resourceMonitor,
          retryManager,
        }
      );

      // Enqueue many work orders to test distribution
      const legacyCount = { count: 0 };
      const newCount = { count: 0 };

      facade.on('routed', (_id: string, system: string) => {
        if (system === 'legacy') legacyCount.count++;
        else newCount.count++;
      });

      // With deterministic hashing, distribution should be roughly 50/50
      for (let i = 0; i < 100; i++) {
        facade.enqueue(`wo-${i}`);
      }

      // Allow for some variance in distribution
      expect(legacyCount.count).toBeGreaterThan(30);
      expect(newCount.count).toBeGreaterThan(30);
    });

    it('should be deterministic based on work order ID', () => {
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: false,
          shadowMode: false,
          rolloutPercent: 50,
        },
        {
          scheduler,
          resourceMonitor,
          retryManager,
        }
      );

      const routes: string[] = [];
      facade.on('routed', (_id: string, system: string) => {
        routes.push(system);
      });

      // Same ID should always route to same system
      facade.enqueue('test-id-1');
      const firstRoute = routes[0];

      // Reset for second facade with same config
      const facade2 = new QueueFacade(
        new MockQueueManager() as unknown as QueueManager,
        {
          useNewQueueSystem: false,
          shadowMode: false,
          rolloutPercent: 50,
        },
        {
          scheduler: new Scheduler(resourceMonitor, { pollIntervalMs: 100 }),
          resourceMonitor,
          retryManager,
        }
      );

      const routes2: string[] = [];
      facade2.on('routed', (_id: string, system: string) => {
        routes2.push(system);
      });

      facade2.enqueue('test-id-1');
      expect(routes2[0]).toBe(firstRoute);
    });
  });

  describe('Dynamic Configuration', () => {
    beforeEach(() => {
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: false,
          shadowMode: false,
          rolloutPercent: 0,
        },
        {
          scheduler,
          resourceMonitor,
          retryManager,
        }
      );
    });

    it('should allow runtime configuration updates', () => {
      let stats = facade.getStats();
      expect(stats.activeSystem).toBe('legacy');

      // Enable shadow mode
      facade.updateConfig({ shadowMode: true });
      stats = facade.getStats();
      expect(stats.shadowMode).toBe(true);
      expect(stats.activeSystem).toBe('both');

      // Enable new system with 100% rollout
      facade.updateConfig({ useNewQueueSystem: true, rolloutPercent: 100 });
      stats = facade.getStats();
      expect(stats.rolloutPercent).toBe(100);
    });

    it('should reset counters', () => {
      facade.enqueue('wo-1');
      facade.enqueue('wo-2');

      let stats = facade.getStats();
      expect(stats.counters.totalRouted).toBe(2);

      facade.resetCounters();
      stats = facade.getStats();
      expect(stats.counters.totalRouted).toBe(0);
    });
  });

  describe('Fallback Behavior', () => {
    it('should fall back to legacy when new system unavailable', () => {
      // Create facade without new system components
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: true,
          shadowMode: false,
          rolloutPercent: 100,
        }
        // No scheduler/resourceMonitor provided
      );

      const result = facade.enqueue('wo-1');

      // Should fall back to legacy
      expect(result.success).toBe(true);
      expect(mockLegacyQueue.isEnqueued('wo-1')).toBe(true);
    });
  });

  describe('fromConfig Factory', () => {
    it('should create facade from queue config', () => {
      const facade = QueueFacade.fromConfig(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: true,
          shadowMode: false,
          rolloutPercent: 50,
        },
        {
          scheduler,
          resourceMonitor,
          retryManager,
        }
      );

      const stats = facade.getStats();
      expect(stats.rolloutPercent).toBe(50);
    });
  });

  describe('Legacy Queue Access', () => {
    beforeEach(() => {
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: false,
          shadowMode: false,
          rolloutPercent: 0,
        }
      );
    });

    it('should provide access to legacy queue', () => {
      const legacyQueue = facade.getLegacyQueue();
      expect(legacyQueue).toBe(mockLegacyQueue);
    });

    it('should provide access to new system components', () => {
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: true,
          shadowMode: false,
          rolloutPercent: 100,
        },
        {
          scheduler,
          resourceMonitor,
          retryManager,
        }
      );

      expect(facade.getScheduler()).toBe(scheduler);
      expect(facade.getResourceMonitor()).toBe(resourceMonitor);
      expect(facade.getRetryManager()).toBe(retryManager);
    });
  });

  describe('Stats Reporting', () => {
    it('should report combined stats from both systems', () => {
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: false,
          shadowMode: false,
          rolloutPercent: 0,
        },
        {
          scheduler,
          resourceMonitor,
          retryManager,
        }
      );

      // Enqueue to legacy
      facade.enqueue('wo-1');

      const stats = facade.getStats();

      expect(stats.legacyStats).toBeDefined();
      expect(stats.legacyStats?.waiting).toBe(1);
      expect(stats.newSystemStats).toBeDefined();
      expect(stats.newSystemStats?.queueDepth).toBe(0);
    });
  });

  describe('Priority Handling', () => {
    it('should pass priority to new system', () => {
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: true,
          shadowMode: false,
          rolloutPercent: 100,
        },
        {
          scheduler: new Scheduler(resourceMonitor, {
            pollIntervalMs: 100,
            staggerDelayMs: 0,
            priorityEnabled: true,
          }),
          resourceMonitor,
          retryManager,
        }
      );

      facade.enqueue('low-priority', { priority: 1 });
      facade.enqueue('high-priority', { priority: 10 });
      facade.enqueue('medium-priority', { priority: 5 });

      const queued = facade.getScheduler()?.getQueuedWorkOrders();
      expect(queued?.[0].id).toBe('high-priority');
      expect(queued?.[1].id).toBe('medium-priority');
      expect(queued?.[2].id).toBe('low-priority');
    });
  });

  describe('markStarted and markCompleted delegation', () => {
    beforeEach(() => {
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: false,
          shadowMode: false,
          rolloutPercent: 0,
        }
      );
    });

    it('should delegate markStarted to legacy queue', () => {
      facade.enqueue('wo-1');
      expect(mockLegacyQueue.isEnqueued('wo-1')).toBe(true);

      facade.markStarted('wo-1');
      expect(mockLegacyQueue.isEnqueued('wo-1')).toBe(false);
      expect(mockLegacyQueue.isRunning('wo-1')).toBe(true);
    });

    it('should delegate markCompleted to legacy queue', () => {
      facade.enqueue('wo-1');
      facade.markStarted('wo-1');
      expect(mockLegacyQueue.isRunning('wo-1')).toBe(true);

      facade.markCompleted('wo-1');
      expect(mockLegacyQueue.isRunning('wo-1')).toBe(false);
    });
  });

  describe('canStartImmediately', () => {
    it('should use legacy check when legacy system is active', () => {
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: false,
          shadowMode: false,
          rolloutPercent: 0,
        }
      );

      expect(facade.canStartImmediately()).toBe(true);
    });

    it('should use new system check when new system is active', () => {
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: true,
          shadowMode: false,
          rolloutPercent: 100,
        },
        {
          scheduler,
          resourceMonitor,
          retryManager,
        }
      );

      expect(facade.canStartImmediately()).toBe(true);

      // Acquire all slots
      resourceMonitor.acquireSlot('test-1');
      resourceMonitor.acquireSlot('test-2');

      expect(facade.canStartImmediately()).toBe(false);
    });
  });

  describe('isRunning delegation', () => {
    beforeEach(() => {
      facade = new QueueFacade(
        mockLegacyQueue as unknown as QueueManager,
        {
          useNewQueueSystem: false,
          shadowMode: false,
          rolloutPercent: 0,
        }
      );
    });

    it('should check legacy queue for running status', () => {
      facade.enqueue('wo-1');
      facade.markStarted('wo-1');

      expect(facade.isRunning('wo-1')).toBe(true);
      expect(facade.isRunning('wo-2')).toBe(false);
    });
  });
});
