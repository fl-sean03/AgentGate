# 08 - Appendix: API Reference

## Overview

This document provides complete API documentation for the new queue management system.

---

## Core Types

### WorkOrderState

```typescript
type WorkOrderState =
  | 'PENDING'       // Submitted, waiting in queue
  | 'PREPARING'     // Scheduler claimed it, setting up execution
  | 'RUNNING'       // Actively executing in sandbox
  | 'COMPLETED'     // Finished successfully
  | 'FAILED'        // Failed after max retries or fatal error
  | 'WAITING_RETRY' // Failed, waiting for retry delay
  | 'CANCELLED';    // Cancelled by user
```

### StateEvent

```typescript
type StateEvent =
  | 'SUBMIT'    // → PENDING
  | 'CLAIM'     // PENDING → PREPARING
  | 'READY'     // PREPARING → RUNNING
  | 'COMPLETE'  // RUNNING → COMPLETED
  | 'FAIL'      // RUNNING → WAITING_RETRY | FAILED
  | 'RETRY'     // WAITING_RETRY → PENDING
  | 'CANCEL';   // PENDING → CANCELLED
```

### StateTransition

```typescript
interface StateTransition {
  readonly id: string;
  readonly workOrderId: string;
  readonly fromState: WorkOrderState;
  readonly toState: WorkOrderState;
  readonly event: StateEvent;
  readonly timestamp: Date;
  readonly metadata?: Record<string, unknown>;
}
```

---

## WorkOrderStateMachine

### Constructor

```typescript
constructor(config: StateMachineConfig)

interface StateMachineConfig {
  workOrderId: string;
  maxRetries: number;
  initialState?: WorkOrderState;  // Default: 'PENDING'
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `currentState` | `WorkOrderState` | Current state of the work order |
| `retryCount` | `number` | Number of retry attempts so far |
| `history` | `readonly StateTransition[]` | Complete transition history |
| `isTerminal` | `boolean` | Whether in a terminal state |

### Methods

#### `transition(event: StateEvent, metadata?: Record<string, unknown>): WorkOrderState`

Attempt a state transition. Throws `InvalidTransitionError` if invalid.

```typescript
const sm = new WorkOrderStateMachine({ workOrderId: 'wo-1', maxRetries: 3 });
sm.transition('CLAIM');  // PENDING → PREPARING
```

#### `claim(metadata?: Record<string, unknown>): void`

Convenience method for PENDING → PREPARING transition.

#### `ready(metadata?: Record<string, unknown>): void`

Convenience method for PREPARING → RUNNING transition.

#### `complete(result: { exitCode: number; output?: string }): void`

Convenience method for RUNNING → COMPLETED transition.

#### `fail(error: { message: string; retryable: boolean }): WorkOrderState`

Handle failure. Returns WAITING_RETRY or FAILED based on retry count.

#### `retry(): void`

Convenience method for WAITING_RETRY → PENDING transition. Increments retry count.

#### `cancel(reason?: string): void`

Convenience method for PENDING | WAITING_RETRY → CANCELLED transition.

#### `canTransition(event: StateEvent): boolean`

Check if a transition is valid without performing it.

#### `getValidEvents(): StateEvent[]`

Get list of valid events for current state.

#### `getTimeInCurrentState(): number`

Get milliseconds spent in current state.

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `state-changed` | `StateTransition` | Emitted on every state transition |
| `terminal-reached` | `(state: WorkOrderState, workOrderId: string)` | Emitted when terminal state reached |

---

## ResourceMonitor

### Constructor

```typescript
constructor(config?: Partial<ResourceMonitorConfig>)

interface ResourceMonitorConfig {
  maxConcurrentSlots: number;  // Default: 2
  memoryPerSlotMB: number;     // Default: 4096
  warningThreshold: number;    // Default: 0.8
  criticalThreshold: number;   // Default: 0.9
  pollIntervalMs: number;      // Default: 5000
}
```

### Methods

#### `start(): void`

Start monitoring resources.

#### `stop(): void`

Stop monitoring resources.

#### `acquireSlot(workOrderId: string): SlotHandle | null`

Attempt to acquire an execution slot. Returns null if unavailable.

```typescript
interface SlotHandle {
  readonly id: string;
  readonly acquiredAt: Date;
  readonly workOrderId: string;
}
```

#### `releaseSlot(handle: SlotHandle): void`

Release an execution slot.

#### `getHealthReport(): ResourceHealthReport`

Get current resource health.

```typescript
interface ResourceHealthReport {
  memoryTotalMB: number;
  memoryUsedMB: number;
  memoryAvailableMB: number;
  memoryPressure: 'none' | 'warning' | 'critical';
  activeSlots: number;
  maxSlots: number;
  availableSlots: number;
  cpuUsagePercent: number;
  healthy: boolean;
}
```

#### `getAvailableSlots(): number`

Get number of available slots.

#### `isHealthy(): boolean`

Check if resources are healthy for new work.

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `slot-available` | `()` | Emitted when a slot becomes available |
| `memory-pressure` | `(level: MemoryPressure, report: ResourceHealthReport)` | Emitted on pressure changes |
| `health-changed` | `(report: ResourceHealthReport)` | Emitted on each poll |

---

## Scheduler

### Constructor

```typescript
constructor(
  resourceMonitor: ResourceMonitor,
  config?: Partial<SchedulerConfig>
)

interface SchedulerConfig {
  pollIntervalMs: number;      // Default: 1000
  staggerDelayMs: number;      // Default: 5000
  priorityEnabled: boolean;    // Default: false
  maxQueueDepth: number;       // Default: 0 (unlimited)
}
```

### Methods

#### `setExecutionHandler(handler: ExecutionHandler): void`

Set the handler that executes claimed work orders.

```typescript
type ExecutionHandler = (
  workOrder: QueuedWorkOrder,
  slot: SlotHandle
) => Promise<void>;
```

#### `start(): void`

Start the scheduler loop.

#### `stop(): void`

Stop the scheduler loop.

#### `enqueue(workOrder: QueuedWorkOrder): boolean`

Add a work order to the queue. Returns false if queue is full.

```typescript
interface QueuedWorkOrder {
  id: string;
  stateMachine: WorkOrderStateMachine;
  priority: number;
  submittedAt: Date;
  data: unknown;
}
```

#### `dequeue(workOrderId: string): QueuedWorkOrder | undefined`

Remove a work order from the queue.

#### `getQueueDepth(): number`

Get current queue depth.

#### `getQueuedWorkOrders(): readonly QueuedWorkOrder[]`

Get all queued work orders.

#### `getStats(): SchedulerStats`

Get scheduler statistics.

```typescript
interface SchedulerStats {
  queueDepth: number;
  isRunning: boolean;
  lastClaimTime: number;
  resourceHealth: ResourceHealthReport;
}
```

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `work-claimed` | `(workOrder: QueuedWorkOrder, slot: SlotHandle)` | Work order claimed |
| `queue-empty` | `()` | Queue is empty |
| `backpressure` | `(depth: number)` | Queue is full |
| `stagger-wait` | `(workOrderId: string, delayMs: number)` | Waiting for stagger delay |

---

## ExecutionManager

### Constructor

```typescript
constructor(
  sandboxProvider: SandboxProvider,
  resourceMonitor: ResourceMonitor,
  config?: Partial<ExecutionManagerConfig>
)

interface ExecutionManagerConfig {
  executionTimeoutMs: number;   // Default: 3600000 (1 hour)
  gracefulShutdownMs: number;   // Default: 30000
  cleanupDelayMs: number;       // Default: 1000
}
```

### Methods

#### `execute(workOrder: WorkOrderData, stateMachine: WorkOrderStateMachine, slot: SlotHandle): Promise<ExecutionResult>`

Execute a work order. Manages full lifecycle.

```typescript
interface WorkOrderData {
  id: string;
  repoUrl: string;
  branch?: string;
  command: string;
  environment?: Record<string, string>;
}

interface ExecutionResult {
  success: boolean;
  exitCode: number;
  output: string;
  error?: string;
  durationMs: number;
  retryable: boolean;
}
```

#### `getExecution(workOrderId: string): Execution | undefined`

Get an active execution.

```typescript
interface Execution {
  readonly workOrderId: string;
  readonly slotHandle: SlotHandle;
  readonly stateMachine: WorkOrderStateMachine;
  readonly startedAt: Date;
  status: 'preparing' | 'running' | 'cleanup' | 'completed';
  sandbox?: Sandbox;
}
```

#### `getActiveExecutions(): Execution[]`

Get all active executions.

#### `cancel(workOrderId: string): Promise<boolean>`

Cancel an active execution.

#### `cancelAll(): Promise<void>`

Cancel all active executions.

#### `getStats(): ExecutionStats`

Get execution statistics.

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `execution-started` | `(execution: Execution)` | Execution started |
| `execution-completed` | `(workOrderId: string, result: ExecutionResult)` | Execution completed |
| `execution-failed` | `(workOrderId: string, error: Error)` | Execution failed |

---

## RetryManager

### Constructor

```typescript
constructor(policy?: Partial<RetryPolicy>)

interface RetryPolicy {
  maxRetries: number;          // Default: 3
  baseDelayMs: number;         // Default: 5000
  maxDelayMs: number;          // Default: 300000
  backoffMultiplier: number;   // Default: 2
  jitterFactor: number;        // Default: 0.1
}
```

### Methods

#### `setRetryCallback(callback: RetryCallback): void`

Set callback for retry execution.

```typescript
type RetryCallback = (workOrderId: string) => void;
```

#### `shouldRetry(stateMachine: WorkOrderStateMachine, retryable: boolean): boolean`

Check if a work order should be retried.

#### `calculateDelay(attemptNumber: number): number`

Calculate delay for next retry.

#### `scheduleRetry(workOrderId: string, stateMachine: WorkOrderStateMachine, errorMessage: string): void`

Schedule a retry.

#### `cancelRetry(workOrderId: string): boolean`

Cancel a scheduled retry.

#### `cancelAll(): void`

Cancel all scheduled retries.

#### `getRetryState(workOrderId: string): RetryState | undefined`

Get retry state for a work order.

```typescript
interface RetryState {
  workOrderId: string;
  attemptNumber: number;
  nextRetryAt: Date | null;
  lastError: string;
  scheduledTimerId: NodeJS.Timeout | null;
}
```

#### `getPendingRetries(): RetryState[]`

Get all pending retries.

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `retry-scheduled` | `(workOrderId: string, delay: number, attemptNumber: number)` | Retry scheduled |
| `retry-triggered` | `(workOrderId: string, attemptNumber: number)` | Retry executed |
| `retry-exhausted` | `(workOrderId: string, attempts: number)` | Max retries reached |
| `retry-cancelled` | `(workOrderId: string)` | Retry cancelled |

---

## QueueObservability

### Constructor

```typescript
constructor(
  scheduler: Scheduler,
  resourceMonitor: ResourceMonitor,
  executionManager: ExecutionManager,
  retryManager: RetryManager,
  config?: ObservabilityConfig
)
```

### Methods

#### `getMetrics(): QueueMetrics`

Get current metrics snapshot.

```typescript
interface QueueMetrics {
  queueDepth: number;
  activeExecutions: number;
  pendingRetries: number;
  totalProcessed: number;
  totalCompleted: number;
  totalFailed: number;
  totalRetries: number;
  avgExecutionDurationMs: number;
  p95ExecutionDurationMs: number;
  memoryUsedMB: number;
  memoryAvailableMB: number;
  timestamp: Date;
}
```

#### `queryAudit(options?: AuditQueryOptions): AuditEvent[]`

Query audit events.

```typescript
interface AuditQueryOptions {
  workOrderId?: string;
  eventType?: string;
  since?: Date;
  until?: Date;
  limit?: number;
}
```

#### `getWorkOrderTimeline(workOrderId: string): AuditEvent[]`

Get work order timeline.

#### `recordAudit(workOrderId: string, eventType: string, details?: Record<string, unknown>): void`

Record an audit event.

#### `getHealth(): SystemHealth`

Get system health.

```typescript
interface SystemHealth {
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
```

#### `recordSuccess(workOrderId: string, durationMs: number): void`

Record successful execution.

#### `recordFailure(workOrderId: string, error: string, durationMs: number): void`

Record failed execution.

#### `recordRetry(workOrderId: string, attemptNumber: number): void`

Record retry attempt.

#### `getSummary(): string`

Get summary string for logging.

---

## HTTP API Endpoints

### Queue Metrics

```
GET /api/queue/metrics

Response: QueueMetrics
```

### Queue Health

```
GET /api/queue/health

Response: SystemHealth
```

### Audit Query

```
GET /api/queue/audit?workOrderId=xxx&eventType=xxx&since=xxx&limit=xxx

Response: AuditEvent[]
```

### Work Order Timeline

```
GET /api/queue/work-orders/:id/timeline

Response: AuditEvent[]
```

### Work Order Status

```
GET /api/queue/work-orders/:id/status

Response: {
  id: string;
  state: WorkOrderState;
  retryCount: number;
  history: StateTransition[];
}
```

---

## Error Codes

| Code | Retryable | Description |
|------|-----------|-------------|
| `SANDBOX_CREATION_FAILED` | Yes | Failed to create sandbox |
| `TIMEOUT` | Yes | Execution timed out |
| `OOM_KILLED` | Yes | Killed due to memory |
| `NETWORK_ERROR` | Yes | Network-related failure |
| `INVALID_WORK_ORDER` | No | Work order is malformed |
| `AGENT_FATAL_ERROR` | No | Agent reported fatal error |
| `CANCELLED` | No | Work order was cancelled |

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTGATE_MAX_CONCURRENT_RUNS` | `2` | Maximum concurrent executions |
| `AGENTGATE_MEMORY_PER_SLOT_MB` | `4096` | Memory budget per slot |
| `AGENTGATE_EXECUTION_TIMEOUT_MS` | `3600000` | Max execution time |
| `AGENTGATE_RETRY_MAX_RETRIES` | `3` | Maximum retry attempts |
| `AGENTGATE_RETRY_BASE_DELAY_MS` | `5000` | Base retry delay |
| `AGENTGATE_SCHEDULER_POLL_MS` | `1000` | Scheduler poll interval |
| `AGENTGATE_STAGGER_DELAY_MS` | `5000` | Delay between starts |

### Full Configuration Object

```typescript
interface QueueSystemConfig {
  scheduler: {
    maxConcurrent: number;
    pollIntervalMs: number;
    staggerDelayMs: number;
    priorityEnabled: boolean;
    maxQueueDepth: number;
  };
  resources: {
    memoryPerSlotMB: number;
    memoryWarningThreshold: number;
    memoryCriticalThreshold: number;
  };
  retry: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    jitterFactor: number;
  };
  execution: {
    timeoutMs: number;
    gracefulShutdownMs: number;
    cleanupDelayMs: number;
  };
  observability: {
    auditLogMaxEvents: number;
    auditLogToConsole: boolean;
    healthQueueDepthWarning: number;
    healthQueueDepthCritical: number;
  };
}
```
