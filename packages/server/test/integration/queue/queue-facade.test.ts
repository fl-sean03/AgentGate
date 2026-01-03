import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueueFacade } from '../../../src/queue/queue-facade.js';
import { Scheduler } from '../../../src/queue/scheduler.js';
import { ResourceMonitor } from '../../../src/queue/resource-monitor.js';
import { RetryManager } from '../../../src/queue/retry-manager.js';

describe('QueueFacade Integration', () => {
  let resourceMonitor: ResourceMonitor;
  let scheduler: Scheduler;
  let retryManager: RetryManager;
  let facade: QueueFacade;

  beforeEach(() => {
    resourceMonitor = new ResourceMonitor({
      maxConcurrentSlots: 2,
      memoryPerSlotMB: 100,
      pollIntervalMs: 100,
      criticalThreshold: 1, // Disable memory pressure checks for CI
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

    facade = new QueueFacade(scheduler, resourceMonitor, retryManager);
    resourceMonitor.start();
  });

  afterEach(() => {
    facade.stop();
  });

  describe('Enqueue and Position', () => {
    it('should enqueue work orders and return position', () => {
      const result = facade.enqueue('wo-1');

      expect(result.success).toBe(true);
      expect(result.position).not.toBeNull();
      expect(result.position?.position).toBe(1);
      expect(result.position?.ahead).toBe(0);
      expect(result.position?.state).toBe('waiting');
    });

    it('should track multiple enqueued work orders', () => {
      facade.enqueue('wo-1');
      facade.enqueue('wo-2');
      const result = facade.enqueue('wo-3');

      expect(result.success).toBe(true);
      expect(result.position?.position).toBe(3);
      expect(result.position?.ahead).toBe(2);
    });

    it('should get position of enqueued work order', () => {
      facade.enqueue('wo-1');
      facade.enqueue('wo-2');

      const position = facade.getPosition('wo-2');
      expect(position).not.toBeNull();
      expect(position?.position).toBe(2);
      expect(position?.ahead).toBe(1);
    });

    it('should return null for non-existent work order', () => {
      const position = facade.getPosition('non-existent');
      expect(position).toBeNull();
    });
  });

  describe('Cancel', () => {
    it('should cancel enqueued work order', () => {
      facade.enqueue('wo-1');
      expect(facade.isEnqueued('wo-1')).toBe(true);

      const cancelled = facade.cancel('wo-1');
      expect(cancelled).toBe(true);
      expect(facade.isEnqueued('wo-1')).toBe(false);
    });

    it('should return false when cancelling non-existent work order', () => {
      const cancelled = facade.cancel('non-existent');
      expect(cancelled).toBe(false);
    });
  });

  describe('Counters', () => {
    it('should track enqueue counter', () => {
      facade.enqueue('wo-1');
      facade.enqueue('wo-2');

      const stats = facade.getStats();
      expect(stats.counters.totalEnqueued).toBe(2);
    });

    it('should track started counter', () => {
      facade.markStarted('wo-1');
      facade.markStarted('wo-2');

      const stats = facade.getStats();
      expect(stats.counters.totalStarted).toBe(2);
    });

    it('should track completed counter', () => {
      facade.markCompleted('wo-1');

      const stats = facade.getStats();
      expect(stats.counters.totalCompleted).toBe(1);
    });

    it('should reset counters', () => {
      facade.enqueue('wo-1');
      facade.markStarted('wo-1');
      facade.markCompleted('wo-1');

      facade.resetCounters();
      const stats = facade.getStats();

      expect(stats.counters.totalEnqueued).toBe(0);
      expect(stats.counters.totalStarted).toBe(0);
      expect(stats.counters.totalCompleted).toBe(0);
    });
  });

  describe('canStartImmediately', () => {
    it('should return true when slots are available', () => {
      expect(facade.canStartImmediately()).toBe(true);
    });

    it('should return false when all slots are used', () => {
      // Acquire all slots
      resourceMonitor.acquireSlot('test-1');
      resourceMonitor.acquireSlot('test-2');

      expect(facade.canStartImmediately()).toBe(false);
    });
  });

  describe('Stats', () => {
    it('should report queue stats', () => {
      facade.enqueue('wo-1');
      facade.enqueue('wo-2');

      const stats = facade.getStats();

      expect(stats.queueDepth).toBe(2);
      expect(stats.availableSlots).toBe(2);
      expect(stats.activeSlots).toBe(0);
    });

    it('should report active slots correctly', () => {
      resourceMonitor.acquireSlot('test-1');

      const stats = facade.getStats();
      expect(stats.activeSlots).toBe(1);
      expect(stats.availableSlots).toBe(1);
    });
  });

  describe('Events', () => {
    it('should emit enqueued event', () => {
      const events: string[] = [];
      facade.on('enqueued', (id: string) => events.push(id));

      facade.enqueue('wo-1');

      expect(events).toEqual(['wo-1']);
    });

    it('should emit started event', () => {
      const events: string[] = [];
      facade.on('started', (id: string) => events.push(id));

      facade.markStarted('wo-1');

      expect(events).toEqual(['wo-1']);
    });

    it('should emit completed event', () => {
      const events: string[] = [];
      facade.on('completed', (id: string) => events.push(id));

      facade.markCompleted('wo-1');

      expect(events).toEqual(['wo-1']);
    });
  });

  describe('Component Access', () => {
    it('should provide access to scheduler', () => {
      expect(facade.getScheduler()).toBe(scheduler);
    });

    it('should provide access to resource monitor', () => {
      expect(facade.getResourceMonitor()).toBe(resourceMonitor);
    });

    it('should provide access to retry manager', () => {
      expect(facade.getRetryManager()).toBe(retryManager);
    });
  });

  describe('Create Factory', () => {
    it('should create facade with default config', () => {
      const newFacade = QueueFacade.create();

      expect(newFacade.getScheduler()).toBeDefined();
      expect(newFacade.getResourceMonitor()).toBeDefined();
      expect(newFacade.getRetryManager()).toBeDefined();

      newFacade.stop();
    });

    it('should create facade with custom config', () => {
      const newFacade = QueueFacade.create({
        maxConcurrentSlots: 10,
        memoryPerSlotMB: 4096,
        pollIntervalMs: 10000,
        staggerDelayMs: 60000,
        priorityEnabled: true,
      });

      expect(newFacade.getScheduler()).toBeDefined();
      expect(newFacade.getResourceMonitor()).toBeDefined();

      newFacade.stop();
    });
  });

  describe('Priority Handling', () => {
    it('should pass priority to scheduler when enabled', () => {
      const priorityScheduler = new Scheduler(resourceMonitor, {
        pollIntervalMs: 100,
        staggerDelayMs: 0,
        priorityEnabled: true,
      });

      const priorityFacade = new QueueFacade(
        priorityScheduler,
        resourceMonitor,
        retryManager
      );

      priorityFacade.enqueue('low-priority', { priority: 1 });
      priorityFacade.enqueue('high-priority', { priority: 10 });
      priorityFacade.enqueue('medium-priority', { priority: 5 });

      const queued = priorityFacade.getScheduler().getQueuedWorkOrders();
      expect(queued[0]?.id).toBe('high-priority');
      expect(queued[1]?.id).toBe('medium-priority');
      expect(queued[2]?.id).toBe('low-priority');

      priorityFacade.stop();
    });
  });
});
