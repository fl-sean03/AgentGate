/**
 * Queue Module - Public API
 *
 * This module provides a robust work order queue system with:
 * - Explicit state machine for work order lifecycle
 * - Resource-aware scheduling with pull-based execution
 * - Retry logic with exponential backoff
 * - Comprehensive observability (metrics, audit, health)
 *
 * @module queue
 */

// =============================================================================
// Types
// =============================================================================

// Core types
export {
  type WorkOrderState,
  type StateEvent,
  type StateTransition,
  type RetryPolicy,
  type RetryState,
  STATE_TRANSITIONS,
  TERMINAL_STATES,
  DEFAULT_RETRY_POLICY,
} from './types.js';

// Execution types
export {
  type ExecutionStatus,
  type Execution,
  type ExecutionResult,
  type ExecutionError,
  ErrorCodes,
  classifyError,
} from './execution-types.js';

// Observability types
export {
  type QueueMetrics,
  type AuditEvent,
  type AuditQueryOptions,
  type SystemHealth,
  type ComponentHealth,
  type HealthIssue,
} from './observability-types.js';

// =============================================================================
// State Machine
// =============================================================================

export {
  WorkOrderStateMachine,
  InvalidTransitionError,
  type StateMachineConfig,
  type StateMachineEvents,
} from './state-machine.js';

// =============================================================================
// Resource Management
// =============================================================================

export {
  ResourceMonitor,
  type SlotHandle,
  type MemoryPressure,
  type ResourceHealthReport,
  type ResourceMonitorConfig,
  type ResourceMonitorEvents,
} from './resource-monitor.js';

// =============================================================================
// Scheduler
// =============================================================================

export {
  Scheduler,
  type QueuedWorkOrder,
  type SchedulerConfig,
  type SchedulerEvents,
  type ExecutionHandler,
} from './scheduler.js';

// =============================================================================
// Execution
// =============================================================================

export {
  ExecutionManager,
  type ExecutionManagerConfig,
  type ExecutionManagerEvents,
  type WorkOrderData,
} from './execution-manager.js';

// =============================================================================
// Retry
// =============================================================================

export {
  RetryManager,
  type RetryManagerEvents,
  type RetryCallback,
} from './retry-manager.js';

// =============================================================================
// Observability
// =============================================================================

export {
  QueueObservability,
  type ObservabilityConfig,
} from './observability.js';

export {
  MetricsCollector,
} from './metrics-collector.js';

export {
  AuditLog,
  type AuditLogConfig,
} from './audit-log.js';

export {
  HealthChecker,
  type HealthThresholds,
} from './health-checker.js';

// =============================================================================
// Facade (Phase 2: Feature Flag Integration)
// =============================================================================

export {
  QueueFacade,
  type QueueFacadeConfig,
  type QueueFacadeEvents,
  type QueueFacadeStats,
} from './queue-facade.js';
