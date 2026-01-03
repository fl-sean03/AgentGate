import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import type { Scheduler } from './scheduler.js';
import type { ResourceMonitor } from './resource-monitor.js';
import type { ExecutionManager } from './execution-manager.js';
import type { RetryManager } from './retry-manager.js';
import type {
  SystemHealth,
  ComponentHealth,
  HealthIssue,
} from './observability-types.js';

/**
 * Thresholds for health checks.
 */
export interface HealthThresholds {
  /** Queue depth warning threshold */
  queueDepthWarning: number;

  /** Queue depth critical threshold */
  queueDepthCritical: number;

  /** Memory usage warning threshold (0-1) */
  memoryWarning: number;

  /** Memory usage critical threshold (0-1) */
  memoryCritical: number;

  /** Max pending retries before warning */
  pendingRetriesWarning: number;
}

const DEFAULT_THRESHOLDS: HealthThresholds = {
  queueDepthWarning: 50,
  queueDepthCritical: 100,
  memoryWarning: 0.8,
  memoryCritical: 0.9,
  pendingRetriesWarning: 10,
};

/**
 * Performs health checks on queue system components.
 */
export class HealthChecker {
  private readonly logger: Logger;
  private readonly thresholds: HealthThresholds;

  constructor(
    private readonly scheduler: Scheduler,
    private readonly resourceMonitor: ResourceMonitor,
    private readonly executionManager: ExecutionManager,
    private readonly retryManager: RetryManager,
    thresholds: Partial<HealthThresholds> = {}
  ) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.logger = createLogger('health-checker');
  }

  /**
   * Perform comprehensive health check.
   */
  check(): SystemHealth {
    const issues: HealthIssue[] = [];

    const schedulerHealth = this.checkScheduler(issues);
    const resourceHealth = this.checkResourceMonitor(issues);
    const executionHealth = this.checkExecutionManager(issues);
    const retryHealth = this.checkRetryManager(issues);

    // Determine overall status
    const components = [schedulerHealth, resourceHealth, executionHealth, retryHealth];
    let status: SystemHealth['status'] = 'healthy';

    if (components.some(c => c.status === 'unhealthy')) {
      status = 'unhealthy';
    } else if (components.some(c => c.status === 'degraded')) {
      status = 'degraded';
    }

    return {
      status,
      components: {
        scheduler: schedulerHealth,
        resourceMonitor: resourceHealth,
        executionManager: executionHealth,
        retryManager: retryHealth,
      },
      issues,
      timestamp: new Date(),
    };
  }

  /**
   * Check scheduler health.
   */
  private checkScheduler(issues: HealthIssue[]): ComponentHealth {
    const stats = this.scheduler.getStats();

    if (!stats.isRunning) {
      issues.push({
        severity: 'critical',
        component: 'scheduler',
        message: 'Scheduler is not running',
        recommendation: 'Restart the scheduler',
      });
      return { status: 'unhealthy', message: 'Not running' };
    }

    if (stats.queueDepth >= this.thresholds.queueDepthCritical) {
      issues.push({
        severity: 'critical',
        component: 'scheduler',
        message: `Queue depth (${stats.queueDepth}) exceeds critical threshold`,
        recommendation: 'Scale up workers or reduce incoming work orders',
      });
      return { status: 'unhealthy', message: `Queue depth: ${stats.queueDepth}` };
    }

    if (stats.queueDepth >= this.thresholds.queueDepthWarning) {
      issues.push({
        severity: 'warning',
        component: 'scheduler',
        message: `Queue depth (${stats.queueDepth}) exceeds warning threshold`,
        recommendation: 'Monitor queue growth',
      });
      return { status: 'degraded', message: `Queue depth: ${stats.queueDepth}` };
    }

    return { status: 'healthy' };
  }

  /**
   * Check resource monitor health.
   */
  private checkResourceMonitor(issues: HealthIssue[]): ComponentHealth {
    const report = this.resourceMonitor.getHealthReport();

    if (report.memoryPressure === 'critical') {
      issues.push({
        severity: 'critical',
        component: 'resourceMonitor',
        message: `Critical memory pressure (${report.memoryUsedMB}MB used)`,
        recommendation: 'Free up memory or reduce concurrent executions',
      });
      return { status: 'unhealthy', message: 'Critical memory pressure' };
    }

    if (report.memoryPressure === 'warning') {
      issues.push({
        severity: 'warning',
        component: 'resourceMonitor',
        message: `Memory warning (${report.memoryUsedMB}MB used)`,
        recommendation: 'Monitor memory usage',
      });
      return { status: 'degraded', message: 'Memory pressure warning' };
    }

    return { status: 'healthy' };
  }

  /**
   * Check execution manager health.
   */
  private checkExecutionManager(issues: HealthIssue[]): ComponentHealth {
    const stats = this.executionManager.getStats();
    const executions = this.executionManager.getActiveExecutions();

    // Check for stuck executions (preparing for too long)
    const stuckThreshold = 5 * 60 * 1000; // 5 minutes
    const stuckExecutions = executions.filter(
      e => e.status === 'preparing' &&
           Date.now() - e.startedAt.getTime() > stuckThreshold
    );

    if (stuckExecutions.length > 0) {
      issues.push({
        severity: 'warning',
        component: 'executionManager',
        message: `${stuckExecutions.length} execution(s) stuck in preparing state`,
        recommendation: 'Check sandbox provider health',
      });
      return { status: 'degraded', message: `${stuckExecutions.length} stuck executions` };
    }

    return { status: 'healthy', message: `${stats.activeCount} active` };
  }

  /**
   * Check retry manager health.
   */
  private checkRetryManager(issues: HealthIssue[]): ComponentHealth {
    const stats = this.retryManager.getStats();

    if (stats.pendingCount >= this.thresholds.pendingRetriesWarning) {
      issues.push({
        severity: 'warning',
        component: 'retryManager',
        message: `${stats.pendingCount} work orders pending retry`,
        recommendation: 'Investigate failure causes',
      });
      return { status: 'degraded', message: `${stats.pendingCount} pending retries` };
    }

    return { status: 'healthy' };
  }
}
