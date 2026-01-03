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
