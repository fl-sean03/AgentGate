import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthChecker } from '../../../src/queue/health-checker.js';
import type { Scheduler } from '../../../src/queue/scheduler.js';
import type { ResourceMonitor, ResourceHealthReport } from '../../../src/queue/resource-monitor.js';
import type { ExecutionManager } from '../../../src/queue/execution-manager.js';
import type { RetryManager } from '../../../src/queue/retry-manager.js';
import type { Execution, ExecutionStatus } from '../../../src/queue/execution-types.js';

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;
  let mockScheduler: Scheduler;
  let mockResourceMonitor: ResourceMonitor;
  let mockExecutionManager: ExecutionManager;
  let mockRetryManager: RetryManager;

  function createMockScheduler(overrides: {
    queueDepth?: number;
    isRunning?: boolean;
  } = {}): Scheduler {
    return {
      getStats: vi.fn().mockReturnValue({
        queueDepth: overrides.queueDepth ?? 0,
        isRunning: overrides.isRunning ?? true,
        lastClaimTime: Date.now(),
        resourceHealth: {},
      }),
      getQueueDepth: vi.fn().mockReturnValue(overrides.queueDepth ?? 0),
    } as unknown as Scheduler;
  }

  function createMockResourceMonitor(overrides: {
    memoryPressure?: 'none' | 'warning' | 'critical';
    memoryUsedMB?: number;
  } = {}): ResourceMonitor {
    const report: ResourceHealthReport = {
      memoryTotalMB: 16384,
      memoryUsedMB: overrides.memoryUsedMB ?? 4096,
      memoryAvailableMB: 12288,
      memoryPressure: overrides.memoryPressure ?? 'none',
      activeSlots: 0,
      maxSlots: 2,
      availableSlots: 2,
      cpuUsagePercent: 50,
      healthy: true,
    };

    return {
      getHealthReport: vi.fn().mockReturnValue(report),
    } as unknown as ResourceMonitor;
  }

  function createMockExecutionManager(overrides: {
    activeCount?: number;
    executions?: Partial<Execution>[];
  } = {}): ExecutionManager {
    const statuses: Record<ExecutionStatus, number> = {
      preparing: 0,
      running: 0,
      cleanup: 0,
      completed: 0,
    };

    const executions: Execution[] = (overrides.executions ?? []).map(e => ({
      workOrderId: e.workOrderId ?? 'wo-1',
      slotHandle: e.slotHandle ?? { id: 'slot-1', acquiredAt: new Date(), workOrderId: 'wo-1' },
      stateMachine: e.stateMachine ?? ({} as never),
      startedAt: e.startedAt ?? new Date(),
      status: e.status ?? 'running',
    }));

    return {
      getStats: vi.fn().mockReturnValue({
        activeCount: overrides.activeCount ?? 0,
        statuses,
      }),
      getActiveExecutions: vi.fn().mockReturnValue(executions),
    } as unknown as ExecutionManager;
  }

  function createMockRetryManager(overrides: {
    pendingCount?: number;
  } = {}): RetryManager {
    return {
      getStats: vi.fn().mockReturnValue({
        pendingCount: overrides.pendingCount ?? 0,
        policy: {},
      }),
    } as unknown as RetryManager;
  }

  beforeEach(() => {
    mockScheduler = createMockScheduler();
    mockResourceMonitor = createMockResourceMonitor();
    mockExecutionManager = createMockExecutionManager();
    mockRetryManager = createMockRetryManager();

    healthChecker = new HealthChecker(
      mockScheduler,
      mockResourceMonitor,
      mockExecutionManager,
      mockRetryManager
    );
  });

  describe('check', () => {
    it('should return healthy status when all components are healthy', () => {
      const health = healthChecker.check();

      expect(health.status).toBe('healthy');
      expect(health.issues).toHaveLength(0);
      expect(health.components.scheduler.status).toBe('healthy');
      expect(health.components.resourceMonitor.status).toBe('healthy');
      expect(health.components.executionManager.status).toBe('healthy');
      expect(health.components.retryManager.status).toBe('healthy');
      expect(health.timestamp).toBeInstanceOf(Date);
    });

    it('should return degraded status when any component is degraded', () => {
      mockScheduler = createMockScheduler({ queueDepth: 50 });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager
      );

      const health = healthChecker.check();

      expect(health.status).toBe('degraded');
      expect(health.components.scheduler.status).toBe('degraded');
    });

    it('should return unhealthy status when any component is unhealthy', () => {
      mockScheduler = createMockScheduler({ isRunning: false });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager
      );

      const health = healthChecker.check();

      expect(health.status).toBe('unhealthy');
      expect(health.components.scheduler.status).toBe('unhealthy');
    });

    it('should prioritize unhealthy over degraded', () => {
      mockScheduler = createMockScheduler({ isRunning: false }); // unhealthy
      mockResourceMonitor = createMockResourceMonitor({ memoryPressure: 'warning' }); // degraded

      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager
      );

      const health = healthChecker.check();

      expect(health.status).toBe('unhealthy');
    });
  });

  describe('scheduler health', () => {
    it('should detect scheduler not running', () => {
      mockScheduler = createMockScheduler({ isRunning: false });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager
      );

      const health = healthChecker.check();

      expect(health.components.scheduler.status).toBe('unhealthy');
      expect(health.components.scheduler.message).toBe('Not running');
      expect(health.issues).toContainEqual({
        severity: 'critical',
        component: 'scheduler',
        message: 'Scheduler is not running',
        recommendation: 'Restart the scheduler',
      });
    });

    it('should detect critical queue depth', () => {
      mockScheduler = createMockScheduler({ queueDepth: 100 });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager
      );

      const health = healthChecker.check();

      expect(health.components.scheduler.status).toBe('unhealthy');
      expect(health.issues[0]?.severity).toBe('critical');
      expect(health.issues[0]?.message).toContain('exceeds critical threshold');
    });

    it('should detect warning queue depth', () => {
      mockScheduler = createMockScheduler({ queueDepth: 50 });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager
      );

      const health = healthChecker.check();

      expect(health.components.scheduler.status).toBe('degraded');
      expect(health.issues[0]?.severity).toBe('warning');
    });
  });

  describe('resource monitor health', () => {
    it('should detect critical memory pressure', () => {
      mockResourceMonitor = createMockResourceMonitor({
        memoryPressure: 'critical',
        memoryUsedMB: 15000,
      });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager
      );

      const health = healthChecker.check();

      expect(health.components.resourceMonitor.status).toBe('unhealthy');
      expect(health.components.resourceMonitor.message).toBe('Critical memory pressure');
      expect(health.issues).toContainEqual({
        severity: 'critical',
        component: 'resourceMonitor',
        message: 'Critical memory pressure (15000MB used)',
        recommendation: 'Free up memory or reduce concurrent executions',
      });
    });

    it('should detect warning memory pressure', () => {
      mockResourceMonitor = createMockResourceMonitor({
        memoryPressure: 'warning',
        memoryUsedMB: 13000,
      });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager
      );

      const health = healthChecker.check();

      expect(health.components.resourceMonitor.status).toBe('degraded');
      expect(health.issues[0]?.severity).toBe('warning');
    });
  });

  describe('execution manager health', () => {
    it('should detect stuck executions', () => {
      const stuckTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      mockExecutionManager = createMockExecutionManager({
        executions: [
          { status: 'preparing', startedAt: stuckTime },
        ],
      });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager
      );

      const health = healthChecker.check();

      expect(health.components.executionManager.status).toBe('degraded');
      expect(health.issues[0]?.message).toContain('stuck in preparing state');
    });

    it('should not flag recent preparing executions', () => {
      const recentTime = new Date(); // Just started
      mockExecutionManager = createMockExecutionManager({
        executions: [
          { status: 'preparing', startedAt: recentTime },
        ],
      });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager
      );

      const health = healthChecker.check();

      expect(health.components.executionManager.status).toBe('healthy');
    });

    it('should report active count in message', () => {
      mockExecutionManager = createMockExecutionManager({ activeCount: 5 });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager
      );

      const health = healthChecker.check();

      expect(health.components.executionManager.message).toBe('5 active');
    });
  });

  describe('retry manager health', () => {
    it('should detect high pending retries', () => {
      mockRetryManager = createMockRetryManager({ pendingCount: 15 });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager
      );

      const health = healthChecker.check();

      expect(health.components.retryManager.status).toBe('degraded');
      expect(health.issues[0]?.message).toContain('pending retry');
      expect(health.issues[0]?.recommendation).toContain('Investigate');
    });

    it('should be healthy with low pending retries', () => {
      mockRetryManager = createMockRetryManager({ pendingCount: 5 });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager
      );

      const health = healthChecker.check();

      expect(health.components.retryManager.status).toBe('healthy');
    });
  });

  describe('custom thresholds', () => {
    it('should use custom thresholds', () => {
      mockScheduler = createMockScheduler({ queueDepth: 10 });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager,
        { queueDepthWarning: 5, queueDepthCritical: 15 }
      );

      const health = healthChecker.check();

      expect(health.components.scheduler.status).toBe('degraded');
    });

    it('should use custom pending retries threshold', () => {
      mockRetryManager = createMockRetryManager({ pendingCount: 3 });
      healthChecker = new HealthChecker(
        mockScheduler,
        mockResourceMonitor,
        mockExecutionManager,
        mockRetryManager,
        { pendingRetriesWarning: 2 }
      );

      const health = healthChecker.check();

      expect(health.components.retryManager.status).toBe('degraded');
    });
  });
});
