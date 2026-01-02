# 01 - Architecture Overview

## Problem Analysis

### Current Architecture Issues

The existing queue management system has fundamental design flaws:

#### Issue 1: Implicit State Management
```
Current: workOrder.status is a string that can be set arbitrarily
Problem: No enforcement of valid transitions, easy to create invalid states
```

#### Issue 2: Cleanup Race Condition
```
Current: Periodic cleanup destroys all sandboxes every 5 minutes
Problem: Active sandboxes get killed mid-execution
Symptom: Work orders fail with exitCode: -1 (SIGKILL)
```

#### Issue 3: Push-Based Execution
```
Current: trigger() immediately starts execution regardless of resources
Problem: 8 simultaneous triggers = 8GB RAM = OOM crash
Symptom: WSL kernel kill, complete system freeze
```

#### Issue 4: No Ownership Model
```
Current: Sandboxes exist independently of work orders
Problem: Unclear who is responsible for cleanup, when cleanup is safe
Symptom: Memory leaks, orphaned processes, zombie containers
```

#### Issue 5: Manual Trigger Requirement
```
Current: Work orders sit in "queued" until manually triggered
Problem: Doesn't scale, easy to forget, no auto-recovery
Symptom: Work orders stuck forever without human intervention
```

### Root Cause Analysis

```
                    Root Cause Tree
                    ===============

                System Instability
                       │
        ┌──────────────┼──────────────┐
        │              │              │
    Race           OOM            Stuck
  Conditions      Crash          Orders
        │              │              │
        │              │              │
   No execution    No resource    Manual
   tracking        tracking       trigger
        │              │              │
        └──────────────┴──────────────┘
                       │
              Implicit State Management
              No Centralized Coordination
```

## Proposed Architecture

### Core Design: Event-Driven State Machine with Resource Gating

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         NEW ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                      QUEUE MANAGER                              │    │
│  │  ┌──────────────────────────────────────────────────────────┐  │    │
│  │  │                   Event Bus                               │  │    │
│  │  │  submit → claim → prepare → ready → complete/fail        │  │    │
│  │  └──────────────────────────────────────────────────────────┘  │    │
│  │           │              │           │            │            │    │
│  │           ↓              ↓           ↓            ↓            │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────┐  ┌────────────┐   │    │
│  │  │   State    │  │ Scheduler  │  │Executor│  │   Retry    │   │    │
│  │  │  Machine   │  │            │  │        │  │  Manager   │   │    │
│  │  └────────────┘  └────────────┘  └────────┘  └────────────┘   │    │
│  │           │              │           │            │            │    │
│  │           └──────────────┴───────────┴────────────┘            │    │
│  │                          │                                     │    │
│  │                          ↓                                     │    │
│  │              ┌──────────────────────┐                          │    │
│  │              │    Resource Monitor  │                          │    │
│  │              │  - Memory tracking   │                          │    │
│  │              │  - Slot management   │                          │    │
│  │              │  - Backpressure      │                          │    │
│  │              └──────────────────────┘                          │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Design Decision Matrix

| Decision | Options Considered | Choice | Rationale |
|----------|-------------------|--------|-----------|
| State Management | Implicit string / Enum / State Machine | **State Machine** | Enforces valid transitions, audit trail |
| Scheduling | Push (eager) / Pull (lazy) / Hybrid | **Pull-based** | Never exceeds resource limits |
| Concurrency Control | Semaphore / Token bucket / Slot-based | **Slot-based** | Maps directly to memory budget |
| Cleanup Strategy | Timer-based / Reference counting / Ownership | **Ownership** | Clear responsibility, no races |
| Retry Logic | None / Simple / Exponential backoff | **Exponential** | Handles transient failures gracefully |
| Persistence | In-memory / SQLite / PostgreSQL | **In-memory + Interface** | Fast now, scalable later |

## Component Specifications

### 1. WorkOrderStateMachine

**Purpose**: Enforce valid state transitions, emit events, maintain audit log

```typescript
interface WorkOrderStateMachine {
  readonly id: string;
  readonly currentState: WorkOrderState;
  readonly history: StateTransition[];

  // Transition methods (throw if invalid)
  claim(): void;           // PENDING → PREPARING
  ready(): void;           // PREPARING → RUNNING
  complete(result: ExecutionResult): void;  // RUNNING → COMPLETED
  fail(error: ExecutionError): void;        // RUNNING → WAITING_RETRY | FAILED
  retry(): void;           // WAITING_RETRY → PENDING
  cancel(): void;          // PENDING → CANCELLED

  // Query methods
  canTransition(to: WorkOrderState): boolean;
  getRetryCount(): number;
  getTimeInState(): number;
}

type WorkOrderState =
  | 'PENDING'       // Submitted, waiting for scheduler
  | 'PREPARING'     // Claimed by scheduler, setting up sandbox
  | 'RUNNING'       // Executing in sandbox
  | 'COMPLETED'     // Finished successfully
  | 'FAILED'        // Exhausted retries or fatal error
  | 'WAITING_RETRY' // Failed, waiting for retry
  | 'CANCELLED';    // Cancelled by user

interface StateTransition {
  from: WorkOrderState;
  to: WorkOrderState;
  timestamp: Date;
  trigger: string;        // What caused the transition
  metadata?: Record<string, unknown>;
}
```

### 2. ResourceMonitor

**Purpose**: Track system resources, provide availability signals

```typescript
interface ResourceMonitor {
  // Resource queries
  getAvailableMemoryMB(): number;
  getAvailableCPUPercent(): number;
  getActiveSlots(): number;
  getMaxSlots(): number;

  // Slot management
  acquireSlot(): SlotHandle | null;  // Returns null if no slots available
  releaseSlot(handle: SlotHandle): void;

  // Health signals
  isHealthy(): boolean;
  getHealthReport(): ResourceHealthReport;

  // Events
  on(event: 'slot-available', handler: () => void): void;
  on(event: 'memory-pressure', handler: (level: 'warning' | 'critical') => void): void;
}

interface SlotHandle {
  readonly id: string;
  readonly acquiredAt: Date;
  readonly estimatedMemoryMB: number;
}

interface ResourceHealthReport {
  memoryUsedMB: number;
  memoryAvailableMB: number;
  memoryPressure: 'none' | 'warning' | 'critical';
  activeSlots: number;
  maxSlots: number;
  queueDepth: number;
}
```

### 3. Scheduler

**Purpose**: Pull work from queue when resources available, coordinate execution

```typescript
interface Scheduler {
  // Lifecycle
  start(): void;
  stop(): void;

  // Queue management
  enqueue(workOrder: WorkOrder): void;
  getQueueDepth(): number;
  getQueuedWorkOrders(): WorkOrder[];

  // Configuration
  configure(options: SchedulerOptions): void;

  // Events
  on(event: 'work-claimed', handler: (workOrder: WorkOrder) => void): void;
  on(event: 'queue-empty', handler: () => void): void;
  on(event: 'backpressure', handler: (depth: number) => void): void;
}

interface SchedulerOptions {
  maxConcurrent: number;           // Max simultaneous executions
  pollIntervalMs: number;          // How often to check for work
  memoryPerSlotMB: number;         // Memory budget per slot
  priorityEnabled: boolean;        // Enable priority queue
  staggerDelayMs: number;          // Delay between starting work orders
}
```

### 4. ExecutionManager

**Purpose**: Own sandbox lifecycle, track active executions

```typescript
interface ExecutionManager {
  // Execute a work order (acquires slot, creates sandbox, runs, cleans up)
  execute(workOrder: WorkOrder): Promise<ExecutionResult>;

  // Query active executions
  getActiveExecutions(): Execution[];
  getExecution(workOrderId: string): Execution | undefined;

  // Forceful operations
  cancel(workOrderId: string): Promise<void>;
  cancelAll(): Promise<void>;
}

interface Execution {
  readonly workOrderId: string;
  readonly slotHandle: SlotHandle;
  readonly sandbox: Sandbox;
  readonly startedAt: Date;
  readonly status: 'preparing' | 'running' | 'cleanup';
}

interface ExecutionResult {
  success: boolean;
  exitCode: number;
  output?: string;
  error?: string;
  durationMs: number;
  retryable: boolean;
}
```

### 5. RetryManager

**Purpose**: Handle failure recovery with configurable policies

```typescript
interface RetryManager {
  // Check if retry is allowed
  shouldRetry(workOrder: WorkOrder, error: ExecutionError): boolean;

  // Calculate next retry time
  getNextRetryTime(workOrder: WorkOrder): Date;

  // Schedule retry
  scheduleRetry(workOrder: WorkOrder): void;

  // Configuration
  configure(policy: RetryPolicy): void;
}

interface RetryPolicy {
  maxRetries: number;              // Maximum retry attempts
  baseDelayMs: number;             // Initial delay
  maxDelayMs: number;              // Maximum delay cap
  backoffMultiplier: number;       // Exponential factor
  retryableErrors: string[];       // Error types that allow retry
  fatalErrors: string[];           // Error types that should not retry
}
```

## Data Flow

### Happy Path: Work Order Submission to Completion

```
1. HTTP POST /work-orders
   │
   ↓
2. QueueManager.submit(workOrder)
   │  - Validate work order
   │  - Create StateMachine(PENDING)
   │  - Emit 'submitted' event
   │
   ↓
3. Scheduler.enqueue(workOrder)
   │  - Add to priority queue
   │  - Check if slots available
   │
   ↓
4. [Poll Loop] Scheduler checks ResourceMonitor
   │  - If slot available: acquireSlot()
   │  - If no slot: wait for 'slot-available' event
   │
   ↓
5. Scheduler.claim(workOrder)
   │  - StateMachine.claim() → PREPARING
   │  - Emit 'claimed' event
   │
   ↓
6. ExecutionManager.execute(workOrder)
   │  - Create sandbox
   │  - Run agent
   │  - StateMachine.ready() → RUNNING
   │
   ↓
7. [Execution completes]
   │  - StateMachine.complete() → COMPLETED
   │  - Destroy sandbox
   │  - ResourceMonitor.releaseSlot()
   │
   ↓
8. Emit 'completed' event
```

### Failure Path: Transient Error with Retry

```
1. [Execution fails with retryable error]
   │
   ↓
2. ExecutionManager catches error
   │  - Destroy sandbox (cleanup)
   │  - ResourceMonitor.releaseSlot()
   │
   ↓
3. RetryManager.shouldRetry(workOrder, error)
   │  - Check retry count < maxRetries
   │  - Check error is retryable
   │
   ↓
4. [If retryable]
   │  - StateMachine.fail() → WAITING_RETRY
   │  - Calculate backoff delay
   │  - Schedule retry timer
   │
   ↓
5. [After delay]
   │  - StateMachine.retry() → PENDING
   │  - Scheduler.enqueue(workOrder)
   │  - Flow continues from step 4 of happy path
```

### Memory Pressure Response

```
1. ResourceMonitor detects high memory usage
   │
   ↓
2. Emit 'memory-pressure' event (warning | critical)
   │
   ↓
3. Scheduler receives event
   │  - WARNING: Reduce concurrency, slower poll
   │  - CRITICAL: Pause claiming new work
   │
   ↓
4. [Memory recovers]
   │  - Resume normal operation
   │  - Process backlog
```

## File Structure

```
packages/server/src/
├── queue/                          # NEW: Queue management module
│   ├── index.ts                    # Public exports
│   ├── types.ts                    # Shared types and interfaces
│   ├── queue-manager.ts            # Main coordinator
│   ├── state-machine.ts            # WorkOrderStateMachine
│   ├── scheduler.ts                # Pull-based scheduler
│   ├── execution-manager.ts        # Execution lifecycle
│   ├── retry-manager.ts            # Retry policies
│   ├── resource-monitor.ts         # Resource tracking
│   └── event-store.ts              # Audit log (in-memory)
├── sandbox/
│   ├── ...existing files...
│   └── sandbox-pool.ts             # NEW: Sandbox pooling (optional)
└── control-plane/
    └── commands/
        └── serve.ts                # Modified: Use new queue system
```

## Configuration

```typescript
// New configuration schema
interface QueueConfig {
  scheduler: {
    maxConcurrent: number;         // Default: 2
    pollIntervalMs: number;        // Default: 1000
    staggerDelayMs: number;        // Default: 5000
    priorityEnabled: boolean;      // Default: false
  };
  resources: {
    memoryPerSlotMB: number;       // Default: 4096
    memoryWarningThreshold: number; // Default: 0.8 (80%)
    memoryCriticalThreshold: number; // Default: 0.9 (90%)
  };
  retry: {
    maxRetries: number;            // Default: 3
    baseDelayMs: number;           // Default: 5000
    maxDelayMs: number;            // Default: 300000 (5 min)
    backoffMultiplier: number;     // Default: 2
  };
  execution: {
    timeoutMs: number;             // Default: 3600000 (1 hour)
    gracefulShutdownMs: number;    // Default: 30000
  };
}
```

## Migration Strategy

### Phase 1: Parallel Implementation
- Build new queue system alongside existing
- Feature flag to switch between implementations
- No breaking changes to API

### Phase 2: Gradual Rollout
- Enable new system for new work orders
- Existing work orders complete on old system
- Monitor for issues

### Phase 3: Cleanup
- Remove old queue implementation
- Remove feature flag
- Update documentation

## Testing Strategy

### Unit Tests
- State machine transition tests (valid and invalid)
- Scheduler priority ordering
- RetryManager backoff calculations
- ResourceMonitor slot management

### Integration Tests
- Full work order lifecycle
- Concurrent execution limits
- Memory pressure handling
- Retry recovery

### Load Tests
- 100 work orders with 2 slots
- Measure queue latency
- Memory stability over time

### Chaos Tests
- Random sandbox failures
- Memory pressure injection
- Scheduler restart recovery
