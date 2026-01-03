import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueObservability } from '../../../src/queue/observability.js';
import type { Scheduler } from '../../../src/queue/scheduler.js';
import type { ResourceMonitor, ResourceHealthReport } from '../../../src/queue/resource-monitor.js';
import type { ExecutionManager } from '../../../src/queue/execution-manager.js';
import type { RetryManager } from '../../../src/queue/retry-manager.js';
import type { ExecutionStatus } from '../../../src/queue/execution-types.js';

describe('QueueObservability', () => {
  let observability: QueueObservability;
  let mockScheduler: Scheduler;
  let mockResourceMonitor: ResourceMonitor;
  let mockExecutionManager: ExecutionManager;
  let mockRetryManager: RetryManager;

  function createMocks() {
    const resourceHealthReport: ResourceHealthReport = {
      memoryTotalMB: 16384,
      memoryUsedMB: 4096,
      memoryAvailableMB: 12288,
      memoryPressure: 'none',
      activeSlots: 1,
      maxSlots: 2,
      availableSlots: 1,
      cpuUsagePercent: 50,
      healthy: true,
    };

    const statuses: Record<ExecutionStatus, number> = {
      preparing: 0,
      running: 1,
      cleanup: 0,
      completed: 0,
    };

    mockScheduler = {
      getStats: vi.fn().mockReturnValue({
        queueDepth: 5,
        isRunning: true,
        lastClaimTime: Date.now(),
        resourceHealth: resourceHealthReport,
      }),
      getQueueDepth: vi.fn().mockReturnValue(5),
    } as unknown as Scheduler;

    mockResourceMonitor = {
      getHealthReport: vi.fn().mockReturnValue(resourceHealthReport),
    } as unknown as ResourceMonitor;

    mockExecutionManager = {
      getStats: vi.fn().mockReturnValue({
        activeCount: 1,
        statuses,
      }),
      getActiveExecutions: vi.fn().mockReturnValue([]),
    } as unknown as ExecutionManager;

    mockRetryManager = {
      getStats: vi.fn().mockReturnValue({
        pendingCount: 2,
        policy: {},
      }),
    } as unknown as RetryManager;
  }

  beforeEach(() => {
    createMocks();
    observability = new QueueObservability(
      mockScheduler,
      mockResourceMonitor,
      mockExecutionManager,
      mockRetryManager,
      { auditLog: { logToConsole: false } }
    );
  });

  describe('getMetrics', () => {
    it('should return complete metrics snapshot', () => {
      const metrics = observability.getMetrics();

      expect(metrics.queueDepth).toBe(5);
      expect(metrics.activeExecutions).toBe(1);
      expect(metrics.pendingRetries).toBe(2);
      expect(metrics.memoryUsedMB).toBe(4096);
      expect(metrics.memoryAvailableMB).toBe(12288);
      expect(metrics.timestamp).toBeInstanceOf(Date);
    });

    it('should include counters from metrics collector', () => {
      observability.recordSuccess('wo-1', 1000);
      observability.recordFailure('wo-2', 'error', 2000);
      observability.recordRetry('wo-3', 1);

      const metrics = observability.getMetrics();

      expect(metrics.totalProcessed).toBe(2);
      expect(metrics.totalCompleted).toBe(1);
      expect(metrics.totalFailed).toBe(1);
      expect(metrics.totalRetries).toBe(1);
    });

    it('should calculate durations', () => {
      observability.recordSuccess('wo-1', 1000);
      observability.recordSuccess('wo-2', 2000);
      observability.recordSuccess('wo-3', 3000);

      const metrics = observability.getMetrics();

      expect(metrics.avgExecutionDurationMs).toBe(2000);
    });
  });

  describe('recordSuccess', () => {
    it('should update metrics and audit log', () => {
      observability.recordSuccess('wo-123', 5000);

      const metrics = observability.getMetrics();
      expect(metrics.totalCompleted).toBe(1);

      const events = observability.queryAudit({ workOrderId: 'wo-123' });
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('completed');
      expect(events[0]?.details['durationMs']).toBe(5000);
    });
  });

  describe('recordFailure', () => {
    it('should update metrics and audit log with string error', () => {
      observability.recordFailure('wo-123', 'Connection timeout', 3000);

      const metrics = observability.getMetrics();
      expect(metrics.totalFailed).toBe(1);

      const events = observability.queryAudit({ workOrderId: 'wo-123' });
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('failed');
      expect(events[0]?.details['error']).toBe('Connection timeout');
      expect(events[0]?.details['durationMs']).toBe(3000);
    });

    it('should capture full Error object details (issue #67 fix)', () => {
      const error = new Error('Something went wrong');
      error.name = 'CustomError';
      error.stack = 'CustomError: Something went wrong\n    at test.js:42';

      observability.recordFailure('wo-123', error, 2000);

      const events = observability.queryAudit({ workOrderId: 'wo-123' });
      expect(events[0]?.details['error']).toBe('Something went wrong');
      expect(events[0]?.details['errorName']).toBe('CustomError');
      expect(events[0]?.details['errorStack']).toContain('at test.js:42');
    });

    it('should include additional details', () => {
      observability.recordFailure('wo-123', 'Error', 1000, {
        exitCode: -1,
        retryable: true,
      });

      const events = observability.queryAudit({ workOrderId: 'wo-123' });
      expect(events[0]?.details['exitCode']).toBe(-1);
      expect(events[0]?.details['retryable']).toBe(true);
    });
  });

  describe('recordRetry', () => {
    it('should update metrics and audit log', () => {
      observability.recordRetry('wo-123', 2, 'Transient failure');

      const metrics = observability.getMetrics();
      expect(metrics.totalRetries).toBe(1);

      const events = observability.queryAudit({ workOrderId: 'wo-123' });
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('retry');
      expect(events[0]?.details['attemptNumber']).toBe(2);
      expect(events[0]?.details['reason']).toBe('Transient failure');
    });
  });

  describe('recordAudit', () => {
    it('should add event to audit log', () => {
      observability.recordAudit('wo-123', 'custom-event', { key: 'value' });

      const events = observability.queryAudit({ workOrderId: 'wo-123' });
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('custom-event');
      expect(events[0]?.details['key']).toBe('value');
    });
  });

  describe('queryAudit', () => {
    beforeEach(() => {
      observability.recordAudit('wo-1', 'started');
      observability.recordSuccess('wo-1', 1000);
      observability.recordAudit('wo-2', 'started');
      observability.recordFailure('wo-2', 'Error', 500);
    });

    it('should return all events when no options', () => {
      const events = observability.queryAudit();
      expect(events).toHaveLength(4);
    });

    it('should filter by workOrderId', () => {
      const events = observability.queryAudit({ workOrderId: 'wo-1' });
      expect(events).toHaveLength(2);
    });

    it('should filter by eventType', () => {
      const events = observability.queryAudit({ eventType: 'started' });
      expect(events).toHaveLength(2);
    });
  });

  describe('getWorkOrderTimeline', () => {
    it('should return events in order for work order', () => {
      observability.recordAudit('wo-1', 'submitted');
      observability.recordAudit('wo-1', 'claimed');
      observability.recordAudit('wo-1', 'running');
      observability.recordSuccess('wo-1', 1000);

      const timeline = observability.getWorkOrderTimeline('wo-1');

      expect(timeline).toHaveLength(4);
      expect(timeline.map(e => e.eventType)).toEqual([
        'submitted',
        'claimed',
        'running',
        'completed',
      ]);
    });
  });

  describe('getHealth', () => {
    it('should return system health from health checker', () => {
      const health = observability.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.components).toBeDefined();
      expect(health.components.scheduler).toBeDefined();
      expect(health.components.resourceMonitor).toBeDefined();
      expect(health.components.executionManager).toBeDefined();
      expect(health.components.retryManager).toBeDefined();
    });
  });

  describe('getSummary', () => {
    it('should return formatted summary string', () => {
      const summary = observability.getSummary();

      expect(summary).toContain('Status: healthy');
      expect(summary).toContain('Queue: 5');
      expect(summary).toContain('Active: 1');
      expect(summary).toContain('Retries pending: 2');
      expect(summary).toContain('Memory:');
    });

    it('should include counters in summary', () => {
      observability.recordSuccess('wo-1', 1000);
      observability.recordFailure('wo-2', 'Error', 1000);

      const summary = observability.getSummary();

      expect(summary).toContain('Total: 2 (1 ok, 1 failed)');
    });
  });

  describe('component access', () => {
    it('should expose metrics collector', () => {
      expect(observability.metrics).toBeDefined();
      expect(observability.metrics.recordCompletion).toBeDefined();
    });

    it('should expose audit log', () => {
      expect(observability.auditLog).toBeDefined();
      expect(observability.auditLog.record).toBeDefined();
    });

    it('should expose health checker', () => {
      expect(observability.healthChecker).toBeDefined();
      expect(observability.healthChecker.check).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should pass config to audit log', () => {
      const configured = new QueueObservability(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager,
        {
          auditLog: { maxEvents: 10, logToConsole: false },
        }
      );

      // Record more than maxEvents
      for (let i = 0; i < 15; i++) {
        configured.recordAudit(`wo-${i}`, 'event');
      }

      expect(configured.auditLog.getEventCount()).toBe(10);
    });

    it('should pass config to health checker', () => {
      vi.mocked(mockScheduler.getStats).mockReturnValue({
        queueDepth: 5,
        isRunning: true,
        lastClaimTime: Date.now(),
        resourceHealth: {} as never,
      });

      const configured = new QueueObservability(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager,
        {
          healthThresholds: { queueDepthWarning: 3 },
          auditLog: { logToConsole: false },
        }
      );

      const health = configured.getHealth();
      expect(health.components.scheduler.status).toBe('degraded');
    });
  });
});
