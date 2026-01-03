import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import { MetricsCollector } from './metrics-collector.js';
import { AuditLog, type AuditLogConfig } from './audit-log.js';
import { HealthChecker, type HealthThresholds } from './health-checker.js';
import type { Scheduler } from './scheduler.js';
import type { ResourceMonitor } from './resource-monitor.js';
import type { ExecutionManager } from './execution-manager.js';
import type { RetryManager } from './retry-manager.js';
import type {
  QueueMetrics,
  AuditEvent,
  AuditQueryOptions,
  SystemHealth,
} from './observability-types.js';

/**
 * Configuration for observability.
 */
export interface ObservabilityConfig {
  auditLog?: Partial<AuditLogConfig>;
  healthThresholds?: Partial<HealthThresholds>;
}

/**
 * Unified observability facade for the queue system.
 *
 * This class provides a single entry point for all observability features:
 * - Metrics collection (counters, durations, percentiles)
 * - Audit logging (event trail with full error details - fixes issue #67)
 * - Health checks (component status and system health)
 *
 * Example usage:
 * ```typescript
 * const observability = new QueueObservability(
 *   scheduler, resourceMonitor, executionManager, retryManager
 * );
 *
 * // Get current metrics
 * const metrics = observability.getMetrics();
 *
 * // Query audit trail
 * const events = observability.queryAudit({ workOrderId: 'wo-123' });
 *
 * // Check system health
 * const health = observability.getHealth();
 * ```
 */
export class QueueObservability {
  private readonly logger: Logger;
  readonly metrics: MetricsCollector;
  readonly auditLog: AuditLog;
  readonly healthChecker: HealthChecker;

  constructor(
    private readonly scheduler: Scheduler,
    private readonly resourceMonitor: ResourceMonitor,
    private readonly executionManager: ExecutionManager,
    private readonly retryManager: RetryManager,
    config: ObservabilityConfig = {}
  ) {
    this.logger = createLogger('queue-observability');
    this.metrics = new MetricsCollector();
    this.auditLog = new AuditLog(config.auditLog);
    this.healthChecker = new HealthChecker(
      scheduler,
      resourceMonitor,
      executionManager,
      retryManager,
      config.healthThresholds
    );
  }

  /**
   * Get current metrics snapshot.
   */
  getMetrics(): QueueMetrics {
    const resourceHealth = this.resourceMonitor.getHealthReport();

    return this.metrics.getMetrics(
      this.scheduler.getQueueDepth(),
      this.executionManager.getStats().activeCount,
      this.retryManager.getStats().pendingCount,
      resourceHealth.memoryUsedMB,
      resourceHealth.memoryAvailableMB
    );
  }

  /**
   * Query audit events.
   */
  queryAudit(options?: AuditQueryOptions): AuditEvent[] {
    return this.auditLog.query(options);
  }

  /**
   * Get work order timeline.
   */
  getWorkOrderTimeline(workOrderId: string): AuditEvent[] {
    return this.auditLog.getWorkOrderTimeline(workOrderId);
  }

  /**
   * Record an audit event.
   */
  recordAudit(
    workOrderId: string,
    eventType: string,
    details?: Record<string, unknown>
  ): void {
    this.auditLog.record(workOrderId, eventType, details);
  }

  /**
   * Get system health.
   */
  getHealth(): SystemHealth {
    return this.healthChecker.check();
  }

  /**
   * Record a successful execution.
   */
  recordSuccess(workOrderId: string, durationMs: number): void {
    this.metrics.recordCompletion(durationMs);
    this.auditLog.record(workOrderId, 'completed', { durationMs });
  }

  /**
   * Record a failed execution.
   *
   * Captures full error details to address issue #67 (Empty error objects).
   * The error parameter can be a string message or an Error object.
   */
  recordFailure(
    workOrderId: string,
    error: string | Error,
    durationMs: number,
    additionalDetails?: Record<string, unknown>
  ): void {
    this.metrics.recordFailure(durationMs);

    // Ensure full error details are captured (fixes issue #67)
    const errorDetails: Record<string, unknown> = {
      durationMs,
      ...additionalDetails,
    };

    if (error instanceof Error) {
      errorDetails['error'] = error.message;
      errorDetails['errorName'] = error.name;
      errorDetails['errorStack'] = error.stack;
    } else {
      errorDetails['error'] = error;
    }

    this.auditLog.record(workOrderId, 'failed', errorDetails);
  }

  /**
   * Record a retry.
   */
  recordRetry(workOrderId: string, attemptNumber: number, reason?: string): void {
    this.metrics.recordRetry();
    this.auditLog.record(workOrderId, 'retry', { attemptNumber, reason });
  }

  /**
   * Get summary for logging/display.
   */
  getSummary(): string {
    const metrics = this.getMetrics();
    const health = this.getHealth();

    return [
      `Status: ${health.status}`,
      `Queue: ${metrics.queueDepth}`,
      `Active: ${metrics.activeExecutions}`,
      `Retries pending: ${metrics.pendingRetries}`,
      `Total: ${metrics.totalProcessed} (${metrics.totalCompleted} ok, ${metrics.totalFailed} failed)`,
      `Memory: ${metrics.memoryUsedMB}MB / ${metrics.memoryUsedMB + metrics.memoryAvailableMB}MB`,
    ].join(' | ');
  }
}
