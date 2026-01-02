# 06 - Thrust: Observability Layer

## Objective

Implement comprehensive observability that:
- Provides real-time visibility into queue state
- Exposes metrics for monitoring and alerting
- Enables easy debugging of issues
- Supports audit trail queries
- Integrates with existing logging infrastructure

## Current State Analysis

### Existing Implementation
```typescript
// Current: Basic logging, no structured metrics
logger.info('Work order started');
// No metrics
// No structured query for history
// No health endpoints beyond basic status
```

### Target Implementation
```typescript
// New: Rich observability
const metrics = observability.getMetrics();
// → Queue depth, active executions, retry counts, latencies

const history = observability.queryHistory({
  workOrderId: 'wo-123',
  since: '1h ago'
});
// → Complete audit trail

const health = observability.getHealth();
// → Detailed system health
```

## Subtasks

### Subtask 6.1: Define Metrics Types

**Files Created:**
- `packages/server/src/queue/observability-types.ts`

```typescript
/**
 * Queue metrics snapshot.
 */
export interface QueueMetrics {
  /** Current queue depth */
  queueDepth: number;

  /** Number of active executions */
  activeExecutions: number;

  /** Number of work orders waiting for retry */
  pendingRetries: number;

  /** Total work orders processed */
  totalProcessed: number;

  /** Total successful completions */
  totalCompleted: number;

  /** Total failures (after all retries) */
  totalFailed: number;

  /** Total retries attempted */
  totalRetries: number;

  /** Average execution duration (ms) */
  avgExecutionDurationMs: number;

  /** 95th percentile execution duration (ms) */
  p95ExecutionDurationMs: number;

  /** Current memory usage */
  memoryUsedMB: number;

  /** Available memory */
  memoryAvailableMB: number;

  /** Timestamp of metrics snapshot */
  timestamp: Date;
}

/**
 * Work order event for audit trail.
 */
export interface AuditEvent {
  id: string;
  workOrderId: string;
  eventType: string;
  timestamp: Date;
  details: Record<string, unknown>;
}

/**
 * Query options for audit trail.
 */
export interface AuditQueryOptions {
  workOrderId?: string;
  eventType?: string;
  since?: Date;
  until?: Date;
  limit?: number;
}

/**
 * System health report.
 */
export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    scheduler: ComponentHealth;
    resourceMonitor: ComponentHealth;
    executionManager: ComponentHealth;
    retryManager: ComponentHealth;
  };
  issues: HealthIssue[];
  timestamp: Date;
}

/**
 * Component health status.
 */
export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  lastActivity?: Date;
}

/**
 * Health issue description.
 */
export interface HealthIssue {
  severity: 'warning' | 'critical';
  component: string;
  message: string;
  recommendation: string;
}
```

**Verification:**
- [ ] All metric types are defined
- [ ] Audit event structure is complete
- [ ] Health types cover all components

---

### Subtask 6.2: Implement MetricsCollector

**Files Created:**
- `packages/server/src/queue/metrics-collector.ts`

```typescript
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import type { QueueMetrics } from './observability-types.js';

/**
 * Collects and computes queue metrics.
 */
export class MetricsCollector {
  private readonly logger: Logger;

  // Counters
  private totalProcessed = 0;
  private totalCompleted = 0;
  private totalFailed = 0;
  private totalRetries = 0;

  // Duration tracking for percentiles
  private readonly executionDurations: number[] = [];
  private readonly maxDurationHistory = 1000;

  constructor() {
    this.logger = createLogger('metrics-collector');
  }

  /**
   * Record a work order completion.
   */
  recordCompletion(durationMs: number): void {
    this.totalProcessed++;
    this.totalCompleted++;
    this.recordDuration(durationMs);
  }

  /**
   * Record a work order failure.
   */
  recordFailure(durationMs: number): void {
    this.totalProcessed++;
    this.totalFailed++;
    this.recordDuration(durationMs);
  }

  /**
   * Record a retry attempt.
   */
  recordRetry(): void {
    this.totalRetries++;
  }

  /**
   * Record execution duration.
   */
  private recordDuration(durationMs: number): void {
    this.executionDurations.push(durationMs);

    // Keep only recent history
    if (this.executionDurations.length > this.maxDurationHistory) {
      this.executionDurations.shift();
    }
  }

  /**
   * Calculate average duration.
   */
  getAvgDuration(): number {
    if (this.executionDurations.length === 0) return 0;

    const sum = this.executionDurations.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.executionDurations.length);
  }

  /**
   * Calculate p95 duration.
   */
  getP95Duration(): number {
    if (this.executionDurations.length === 0) return 0;

    const sorted = [...this.executionDurations].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index] ?? sorted[sorted.length - 1] ?? 0;
  }

  /**
   * Get current metrics snapshot.
   */
  getMetrics(
    queueDepth: number,
    activeExecutions: number,
    pendingRetries: number,
    memoryUsedMB: number,
    memoryAvailableMB: number
  ): QueueMetrics {
    return {
      queueDepth,
      activeExecutions,
      pendingRetries,
      totalProcessed: this.totalProcessed,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      totalRetries: this.totalRetries,
      avgExecutionDurationMs: this.getAvgDuration(),
      p95ExecutionDurationMs: this.getP95Duration(),
      memoryUsedMB,
      memoryAvailableMB,
      timestamp: new Date(),
    };
  }

  /**
   * Reset all counters (for testing).
   */
  reset(): void {
    this.totalProcessed = 0;
    this.totalCompleted = 0;
    this.totalFailed = 0;
    this.totalRetries = 0;
    this.executionDurations.length = 0;
  }
}
```

**Verification:**
- [ ] Counters increment correctly
- [ ] Percentiles calculate correctly
- [ ] Duration history is bounded

---

### Subtask 6.3: Implement AuditLog

**Files Created:**
- `packages/server/src/queue/audit-log.ts`

```typescript
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import type { AuditEvent, AuditQueryOptions } from './observability-types.js';

/**
 * Configuration for audit log.
 */
export interface AuditLogConfig {
  /** Maximum events to keep in memory */
  maxEvents: number;

  /** Whether to also log to pino logger */
  logToConsole: boolean;
}

const DEFAULT_CONFIG: AuditLogConfig = {
  maxEvents: 10000,
  logToConsole: true,
};

/**
 * In-memory audit log for work order events.
 */
export class AuditLog {
  private readonly logger: Logger;
  private readonly config: AuditLogConfig;
  private readonly events: AuditEvent[] = [];
  private readonly eventsByWorkOrder: Map<string, AuditEvent[]> = new Map();

  constructor(config: Partial<AuditLogConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger('audit-log');
  }

  /**
   * Record an audit event.
   */
  record(
    workOrderId: string,
    eventType: string,
    details: Record<string, unknown> = {}
  ): AuditEvent {
    const event: AuditEvent = {
      id: nanoid(),
      workOrderId,
      eventType,
      timestamp: new Date(),
      details,
    };

    // Add to main list
    this.events.push(event);

    // Add to per-work-order index
    let workOrderEvents = this.eventsByWorkOrder.get(workOrderId);
    if (!workOrderEvents) {
      workOrderEvents = [];
      this.eventsByWorkOrder.set(workOrderId, workOrderEvents);
    }
    workOrderEvents.push(event);

    // Enforce max events
    if (this.events.length > this.config.maxEvents) {
      const removed = this.events.shift();
      if (removed) {
        // Also remove from per-work-order index
        const woEvents = this.eventsByWorkOrder.get(removed.workOrderId);
        if (woEvents) {
          const idx = woEvents.findIndex(e => e.id === removed.id);
          if (idx !== -1) woEvents.splice(idx, 1);
        }
      }
    }

    // Log to console if enabled
    if (this.config.logToConsole) {
      this.logger.info(
        { workOrderId, eventType, details },
        `Audit: ${eventType}`
      );
    }

    return event;
  }

  /**
   * Query audit events.
   */
  query(options: AuditQueryOptions = {}): AuditEvent[] {
    let results: AuditEvent[];

    // Start with work-order-specific events if ID provided
    if (options.workOrderId) {
      results = this.eventsByWorkOrder.get(options.workOrderId) ?? [];
    } else {
      results = this.events;
    }

    // Filter by event type
    if (options.eventType) {
      results = results.filter(e => e.eventType === options.eventType);
    }

    // Filter by time range
    if (options.since) {
      results = results.filter(e => e.timestamp >= options.since!);
    }
    if (options.until) {
      results = results.filter(e => e.timestamp <= options.until!);
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
      results = results.slice(-options.limit);
    }

    return results;
  }

  /**
   * Get work order timeline.
   */
  getWorkOrderTimeline(workOrderId: string): AuditEvent[] {
    return this.eventsByWorkOrder.get(workOrderId) ?? [];
  }

  /**
   * Get recent events.
   */
  getRecentEvents(count: number = 100): AuditEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Get event count.
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Clear all events (for testing).
   */
  clear(): void {
    this.events.length = 0;
    this.eventsByWorkOrder.clear();
  }
}
```

**Verification:**
- [ ] Events are recorded correctly
- [ ] Query filtering works
- [ ] Max events limit is enforced
- [ ] Per-work-order index is maintained

---

### Subtask 6.4: Implement HealthChecker

**Files Created:**
- `packages/server/src/queue/health-checker.ts`

```typescript
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
```

**Verification:**
- [ ] Health checks identify issues
- [ ] Thresholds are configurable
- [ ] Overall status is correctly computed

---

### Subtask 6.5: Create Observability Facade

**Files Created:**
- `packages/server/src/queue/observability.ts`

```typescript
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import { MetricsCollector } from './metrics-collector.js';
import { AuditLog, AuditLogConfig } from './audit-log.js';
import { HealthChecker, HealthThresholds } from './health-checker.js';
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
   */
  recordFailure(workOrderId: string, error: string, durationMs: number): void {
    this.metrics.recordFailure(durationMs);
    this.auditLog.record(workOrderId, 'failed', { error, durationMs });
  }

  /**
   * Record a retry.
   */
  recordRetry(workOrderId: string, attemptNumber: number): void {
    this.metrics.recordRetry();
    this.auditLog.record(workOrderId, 'retry', { attemptNumber });
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
```

**Verification:**
- [ ] Facade provides unified access
- [ ] All components are properly wired
- [ ] Summary output is useful

---

## Files Created/Modified Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/queue/observability-types.ts` | Create | Type definitions |
| `packages/server/src/queue/metrics-collector.ts` | Create | Metrics collection |
| `packages/server/src/queue/audit-log.ts` | Create | Audit trail |
| `packages/server/src/queue/health-checker.ts` | Create | Health checks |
| `packages/server/src/queue/observability.ts` | Create | Unified facade |

## Verification Steps

1. **Unit Tests**
   ```bash
   npm run test -- --filter observability
   ```

2. **Manual Verification**
   - Start server
   - Submit work orders
   - Check `/health` endpoint returns detailed health
   - Query audit log for work order timeline
   - Verify metrics are accurate

## API Endpoints

```typescript
// Add to control plane routes:

// GET /queue/metrics
// Returns: QueueMetrics

// GET /queue/health
// Returns: SystemHealth

// GET /queue/audit?workOrderId=xxx&since=xxx
// Returns: AuditEvent[]

// GET /queue/work-orders/:id/timeline
// Returns: AuditEvent[]
```

## Dependencies

- Thrust 02 (State Machine)
- Thrust 03 (Scheduler, ResourceMonitor)
- Thrust 04 (ExecutionManager)
- Thrust 05 (RetryManager)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Audit log memory growth | Medium | Max events limit, archiving |
| Percentile calculation cost | Low | Bounded history, periodic computation |
| Health check frequency | Low | On-demand checks, caching |
