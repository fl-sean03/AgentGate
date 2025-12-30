# System Integration

## Purpose

Wire all modules together into a cohesive daemon and run executor. This document covers the orchestration layer that coordinates the Build → Snapshot → Verify loop.

---

## Thrust 32: State Machine Implementation

### 32.1 Objective

Implement the formal state machine that governs run lifecycle.

### 32.2 Background

The state machine ensures:
- Valid state transitions only
- Clear audit trail
- Recovery from failures
- Proper resource cleanup

### 32.3 Subtasks

#### 32.3.1 Define State Machine

Create `src/orchestrator/state-machine.ts`:

States (enum `RunState`):
- `QUEUED` - Initial state, waiting for workspace
- `LEASED` - Workspace lock acquired
- `BUILDING` - Agent executing
- `SNAPSHOTTING` - Capturing changes
- `VERIFYING` - Running gate checks
- `FEEDBACK` - Generating failure feedback
- `SUCCEEDED` - Gate passed
- `FAILED` - Budget exhausted or unrecoverable
- `CANCELED` - User/system terminated

Transitions (define valid transitions):
```
QUEUED → LEASED (workspace acquired)
QUEUED → CANCELED (user cancel)

LEASED → BUILDING (start agent)
LEASED → FAILED (lease error)
LEASED → CANCELED (user cancel)

BUILDING → SNAPSHOTTING (agent complete)
BUILDING → FAILED (agent crash, timeout)
BUILDING → CANCELED (user cancel)

SNAPSHOTTING → VERIFYING (snapshot captured)
SNAPSHOTTING → FAILED (snapshot error)

VERIFYING → SUCCEEDED (gate passed)
VERIFYING → FEEDBACK (gate failed, budget remains)
VERIFYING → FAILED (gate failed, no budget)

FEEDBACK → BUILDING (retry with feedback)
FEEDBACK → FAILED (feedback generation error)

SUCCEEDED → (terminal)
FAILED → (terminal)
CANCELED → (terminal)
```

#### 32.3.2 Implement State Transition Logic

Create state machine class:
- `transition(run: Run, event: RunEvent): Run` - Apply transition
- `canTransition(run: Run, event: RunEvent): boolean` - Check validity
- `getValidEvents(run: Run): RunEvent[]` - List valid events

Events (enum `RunEvent`):
- `WORKSPACE_ACQUIRED`
- `BUILD_STARTED`
- `BUILD_COMPLETED`
- `BUILD_FAILED`
- `SNAPSHOT_COMPLETED`
- `SNAPSHOT_FAILED`
- `VERIFY_PASSED`
- `VERIFY_FAILED_RETRYABLE`
- `VERIFY_FAILED_TERMINAL`
- `FEEDBACK_GENERATED`
- `USER_CANCELED`
- `SYSTEM_ERROR`

#### 32.3.3 Implement State Persistence

On every transition:
1. Validate transition is allowed
2. Update run state
3. Record timestamp
4. Persist to artifact store
5. Emit event (for logging)

#### 32.3.4 Implement Recovery Logic

Handle process restart:
- Load all non-terminal runs
- For BUILDING state: mark as FAILED (agent lost)
- For VERIFYING state: retry verification
- For other states: resume from current state

### 32.4 Verification Steps

1. Valid transitions succeed
2. Invalid transitions throw error
3. State persists across transitions
4. Recovery handles interrupted runs

### 32.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/orchestrator/state-machine.ts` | Created |
| `agentgate/src/types/state.ts` | Created |

---

## Thrust 33: Run Executor

### 33.1 Objective

Implement the core execution loop that drives a run from start to completion.

### 33.2 Subtasks

#### 33.2.1 Create Run Executor

Create `src/orchestrator/run-executor.ts`:

Main class `RunExecutor`:
- `execute(workOrder: WorkOrder): Promise<Run>` - Run to completion
- `cancel(runId: string): Promise<void>` - Cancel running execution
- `getStatus(runId: string): RunStatus` - Get current status

Internal methods:
- `acquireWorkspace(workOrder: WorkOrder): Promise<Workspace>`
- `resolveGatePlan(workspace: Workspace, workOrder: WorkOrder): Promise<GatePlan>`
- `executeIteration(run: Run, iteration: number): Promise<IterationResult>`
- `handleSuccess(run: Run, iteration: number): Promise<Run>`
- `handleFailure(run: Run, iteration: number, feedback: StructuredFeedback): Promise<Run>`

#### 33.2.2 Implement Main Execution Loop

The `execute` method:
```
1. Create run record (QUEUED)
2. Acquire workspace lease (→ LEASED)
3. Resolve gate plan
4. Record before state (snapshot)
5. For iteration = 1 to maxIterations:
   a. Execute agent (→ BUILDING)
   b. Capture snapshot (→ SNAPSHOTTING)
   c. Run verification (→ VERIFYING)
   d. If PASS: → SUCCEEDED, break
   e. If FAIL and iterations remain:
      - Generate feedback (→ FEEDBACK)
      - Continue to next iteration
   f. If FAIL and no iterations: → FAILED
6. Generate run summary
7. Release workspace lease
8. Return completed run
```

#### 33.2.3 Implement Iteration Execution

The `executeIteration` method:
1. Prepare agent request with context
2. If retry, include previous feedback
3. Call agent driver.execute()
4. Capture agent logs
5. Create snapshot
6. Call verifier.verify()
7. Save verification report
8. Return iteration result

#### 33.2.4 Implement Cancellation

Support graceful cancellation:
- Set cancel flag
- Check flag before each phase
- Kill running processes
- Transition to CANCELED state
- Release resources

#### 33.2.5 Implement Error Handling

Robust error handling:
- Wrap all operations in try/catch
- On error: transition to FAILED
- Save error details to artifacts
- Release resources in finally block
- Log all errors with context

### 33.3 Verification Steps

1. Happy path runs to SUCCEEDED
2. Failing verification triggers retry
3. Max iterations reached → FAILED
4. Cancellation stops execution
5. Errors transition to FAILED cleanly

### 33.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/orchestrator/run-executor.ts` | Created |

---

## Thrust 34: Work Order Queue

### 34.1 Objective

Implement the queue that manages pending work orders.

### 34.2 Background

For MVP, we use a simple in-memory queue with file backup. Work orders are processed sequentially per workspace.

### 34.3 Subtasks

#### 34.3.1 Create Queue Manager

Create `src/orchestrator/queue.ts`:

Class `WorkOrderQueue`:
- `enqueue(workOrder: WorkOrder): void` - Add to queue
- `dequeue(): WorkOrder | null` - Get next work order
- `peek(): WorkOrder | null` - View next without removing
- `remove(id: string): boolean` - Remove from queue
- `list(): WorkOrder[]` - List queued work orders
- `size(): number` - Queue size

#### 34.3.2 Implement Per-Workspace Queuing

Work orders for the same workspace queue behind each other:
- Track which workspaces have active runs
- Only dequeue if workspace is free
- Respect FIFO order within workspace

#### 34.3.3 Implement Queue Persistence

Persist queue state to `~/.agentgate/queue.json`:
- Save on every enqueue/dequeue
- Load on startup
- Handle corruption gracefully

#### 34.3.4 Implement Queue Events

Emit events for monitoring:
- `work-order-queued`
- `work-order-started`
- `work-order-completed`
- `queue-empty`

### 34.4 Verification Steps

1. Enqueue/dequeue works correctly
2. Per-workspace ordering maintained
3. Queue persists across restart
4. Events emitted correctly

### 34.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/orchestrator/queue.ts` | Created |

---

## Thrust 35: Daemon Process

### 35.1 Objective

Create the long-running daemon that processes work orders.

### 35.2 Subtasks

#### 35.2.1 Create Daemon Entry Point

Create `src/orchestrator/daemon.ts`:

Class `AgentGateDaemon`:
- `start(): Promise<void>` - Start processing
- `stop(): Promise<void>` - Stop gracefully
- `getStatus(): DaemonStatus` - Current status

Daemon behavior:
- Poll queue for work orders
- Execute one work order at a time (MVP)
- Handle shutdown signals
- Log all activity

#### 35.2.2 Implement Process Loop

Main loop:
```
while (running) {
  workOrder = queue.dequeue()
  if (workOrder) {
    try {
      run = await executor.execute(workOrder)
      emit('run-completed', run)
    } catch (error) {
      emit('run-error', error)
    }
  } else {
    await sleep(pollInterval)
  }
}
```

#### 35.2.3 Implement Signal Handling

Handle OS signals:
- `SIGTERM`: Graceful shutdown (finish current run)
- `SIGINT`: Graceful shutdown
- `SIGHUP`: Reload configuration

#### 35.2.4 Implement Health Check

Simple health endpoint (for monitoring):
- Write status to `~/.agentgate/status.json`
- Include: running, current run, queue size, uptime
- Update every 30 seconds

#### 35.2.5 Integrate with CLI

Update CLI to interact with daemon:
- `agentgate daemon start` - Start daemon (foreground)
- `agentgate daemon status` - Show daemon status
- `agentgate daemon stop` - Stop daemon

### 35.3 Verification Steps

1. Daemon starts and processes queue
2. Graceful shutdown on SIGTERM
3. Status file updated regularly
4. CLI commands work correctly

### 35.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/orchestrator/daemon.ts` | Created |
| `agentgate/src/orchestrator/index.ts` | Created |
| `agentgate/src/control-plane/commands/daemon.ts` | Created |

---

## Thrust 36: Full Pipeline Integration

### 36.1 Objective

Wire everything together for end-to-end operation.

### 36.2 Subtasks

#### 36.2.1 Create Module Wiring

Create `src/app.ts`:

Initialize all modules:
- Create logger instance
- Initialize artifact store paths
- Create workspace manager
- Create agent driver registry
- Create verifier
- Create feedback generator
- Create run executor
- Create queue manager
- Create daemon

Dependency injection (simple):
- Pass dependencies to constructors
- No IoC framework needed for MVP

#### 36.2.2 Update CLI Entry Point

Update `src/index.ts`:
- Import app initialization
- Initialize before command execution
- Ensure cleanup on exit

#### 36.2.3 Create Configuration System

Create `src/config.ts`:

Configuration from `~/.agentgate/config.yaml`:
- `agentGateRoot`: Override root directory
- `defaultAgent`: Default agent driver
- `defaultMaxIterations`: Default retry count
- `defaultTimeout`: Default time budget
- `logLevel`: Logging verbosity
- `pollInterval`: Queue poll interval

Load order:
1. Built-in defaults
2. Config file
3. Environment variables
4. CLI flags

#### 36.2.4 Integration Test

Create manual integration test:
1. Start daemon
2. Submit work order via CLI
3. Watch execution progress
4. Verify artifacts created
5. Check run summary

### 36.3 Verification Steps

1. Full pipeline executes without errors
2. All modules communicate correctly
3. Configuration loading works
4. Artifacts produced at correct paths

### 36.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/app.ts` | Created |
| `agentgate/src/config.ts` | Created |
| `agentgate/src/index.ts` | Modified |

---

## Module Integration Complete Checklist

- [ ] State machine implemented
- [ ] Valid transitions enforced
- [ ] State persistence working
- [ ] Run executor complete
- [ ] Iteration loop working
- [ ] Cancellation support
- [ ] Error handling robust
- [ ] Queue manager implemented
- [ ] Per-workspace queuing
- [ ] Queue persistence
- [ ] Daemon process created
- [ ] Signal handling working
- [ ] Health check available
- [ ] Full pipeline wired
- [ ] Configuration system
- [ ] Integration test passing

---

## Next Steps

Proceed to [11-testing-validation.md](./11-testing-validation.md) for comprehensive testing scenarios.
