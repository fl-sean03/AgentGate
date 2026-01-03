# 01: Integration Plan

## Overview

This document details the step-by-step plan to integrate ExecutionEngine as the default execution path, replacing the legacy `executeRun()` function.

---

## Current Architecture (v0.2.25)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Orchestrator.execute(workOrder)                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Acquire workspace (create, createFromGit, etc.)                      │
│  2. Acquire lease                                                        │
│  3. Set up GitHub branch (if GitHub workspace)                           │
│  4. Resolve gate plan                                                    │
│  5. Resolve harness config → loop strategy                               │
│  6. Create agent driver (ClaudeCodeDriver or Subscription)               │
│  7. Set up RunExecutorOptions with 12+ callbacks:                        │
│     - onCaptureBeforeState                                               │
│     - onBuild                                                            │
│     - onSnapshot                                                         │
│     - onVerify                                                           │
│     - onFeedback                                                         │
│     - onRunStarted                                                       │
│     - onStateChange                                                      │
│     - onIterationComplete                                                │
│     - onPushIteration (GitHub only)                                      │
│     - onCreatePullRequest (GitHub only)                                  │
│     - onPollCI (GitHub only, if waitForCI)                               │
│  8. Call executeRun(options)                                             │
│  9. Release workspace                                                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ executeRun(options) - run-executor.ts (675 lines)                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Create run record                                                    │
│  2. Capture before state                                                 │
│  3. Main iteration loop:                                                 │
│     a. Transition to BUILDING                                            │
│     b. Call onBuild()                                                    │
│     c. Transition to SNAPSHOTTING                                        │
│     d. Call onSnapshot()                                                 │
│     e. Transition to VERIFYING                                           │
│     f. Call onVerify()                                                   │
│     g. If passed: transition to SUCCEEDED or create PR                   │
│     h. If failed: call onFeedback(), transition to FEEDBACK              │
│     i. Check loop strategy for continuation                              │
│  4. Handle GitHub flow (push, PR, CI polling)                            │
│  5. Return completed run                                                 │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Target Architecture (v0.2.26)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Orchestrator.execute(workOrder)                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Acquire workspace                                                    │
│  2. Acquire lease                                                        │
│  3. Set up GitHub branch (if GitHub workspace)                           │
│  4. Resolve gate plan                                                    │
│  5. Resolve harness config → loop strategy                               │
│  6. Create agent driver                                                  │
│  7. ──────── NEW: Create TaskSpec and services ────────                  │
│     a. resolveTaskSpec(workOrder, harnessConfig, gatePlan)               │
│     b. createServiceAdapters({                                           │
│          agentDriver: driver,                                            │
│          captureSnapshot: captureAfterState,                             │
│          verifyFn: verify,                                               │
│          generateFeedback, formatFeedback                                │
│        })                                                                │
│  8. ──────── NEW: Call ExecutionEngine ────────                          │
│     const engine = createExecutionEngine();                              │
│     const result = await engine.execute({                                │
│       workOrder,                                                         │
│       taskSpec,                                                          │
│       workspace,                                                         │
│       gatePlan,                                                          │
│       services,                                                          │
│     });                                                                  │
│  9. ──────── NEW: Handle delivery (GitHub) ────────                      │
│     if (isGitHub && result.run.state === 'SUCCEEDED') {                  │
│       await deliveryManager.deliver(result, workspace);                  │
│     }                                                                    │
│  10. Release workspace                                                   │
│  11. Return result.run                                                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ ExecutionEngine.execute(input) - engine.ts (~300 lines)                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Create run record                                                    │
│  2. Main iteration loop:                                                 │
│     a. PhaseOrchestrator.executeIteration()                              │
│        - BuildPhase → SnapshotPhase → VerifyPhase → FeedbackPhase        │
│     b. Apply state transition from iteration result                      │
│     c. Emit progress events                                              │
│     d. Check for continuation (max iterations, success, etc.)            │
│  3. Collect metrics                                                      │
│  4. Return ExecutionResult                                               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Integration Steps

### Step 1: Enhance Service Adapters

The current service adapters use lazy imports and may not have full context. We need to enhance them to accept the full callback context from the Orchestrator.

**File**: `packages/server/src/execution/service-adapters.ts`

Changes needed:
1. Accept workspace path in Snapshotter adapter
2. Pass skip levels to Verifier adapter
3. Include workspace context in FeedbackGenerator

### Step 2: Create OrchestratorEngine Bridge

Create a new module that bridges Orchestrator's callback-based setup with ExecutionEngine's service-based execution.

**New File**: `packages/server/src/orchestrator/engine-bridge.ts`

```typescript
/**
 * Creates an ExecutionEngine configured with real services from Orchestrator callbacks.
 */
export function createOrchestratorEngine(
  options: RunExecutorOptions
): { engine: ExecutionEngine; input: ExecutionInput } {
  // 1. Create TaskSpec from work order
  const taskSpec = resolveTaskSpec({
    workOrder: options.workOrder,
    harnessConfig: options.harnessConfig,
    gatePlan: options.gatePlan,
  });

  // 2. Create service adapters from callbacks
  const services = createServiceAdapters({
    agentDriver: /* extract from onBuild */,
    captureSnapshot: options.onSnapshot,
    verifyFn: options.onVerify,
    generateFeedback: /* extract from onFeedback */,
    formatFeedback: /* extract from onFeedback */,
  });

  // 3. Create engine
  const engine = createExecutionEngine({
    maxConcurrentRuns: 10,
    emitProgressEvents: true,
    collectMetrics: true,
  });

  // 4. Build input
  const input: ExecutionInput = {
    workOrder: options.workOrder,
    taskSpec,
    workspace: options.workspace,
    gatePlan: options.gatePlan,
    services,
  };

  return { engine, input };
}
```

### Step 3: Refactor Orchestrator.execute()

Replace the `executeRun()` call with ExecutionEngine execution.

**File**: `packages/server/src/orchestrator/orchestrator.ts`

Key changes:
1. Import `createOrchestratorEngine` from engine-bridge
2. Replace `executeRun(executorOptions)` with:
   ```typescript
   const { engine, input } = createOrchestratorEngine(executorOptions);
   const result = await engine.execute(input);
   run = result.run;
   ```
3. Handle GitHub delivery separately after engine execution

### Step 4: Move GitHub Logic to DeliveryManager

The current Orchestrator has GitHub logic embedded. Move it to the delivery layer.

**File**: `packages/server/src/delivery/github-manager.ts`

```typescript
export class GitHubDeliveryManager implements DeliveryManager {
  async deliver(input: DeliveryInput): Promise<DeliveryResult> {
    // 1. Push iteration commits
    // 2. Create PR (draft)
    // 3. Poll CI if waitForCI enabled
    // 4. Convert draft to ready if CI passes
    // 5. Return result with PR URL
  }
}
```

### Step 5: Update Tests

All tests that use `executeRun()` directly need to be updated to use the new engine.

**Files to update**:
- `test/orchestrator/*.test.ts`
- `test/execution/*.test.ts`
- `test/integration/*.test.ts`

---

## Callback to Service Mapping

| Orchestrator Callback | Service Interface | Notes |
|----------------------|-------------------|-------|
| `onBuild` | `AgentDriver.execute()` | Extract agent request construction |
| `onCaptureBeforeState` | (internal) | Handled by SnapshotPhaseHandler |
| `onSnapshot` | `Snapshotter.capture()` | Maps to captureAfterState |
| `onVerify` | `Verifier.verify()` | Maps to verify function |
| `onFeedback` | `FeedbackGenerator.generate()` | Split into generate + format |
| `onRunStarted` | `ProgressEmitter.emitRunStarted()` | Observability |
| `onStateChange` | `ProgressEmitter` events | Automatic via engine |
| `onIterationComplete` | `ProgressEmitter.emitIterationCompleted()` | Observability |
| `onPushIteration` | `GitHubDeliveryManager` | Moved to delivery layer |
| `onCreatePullRequest` | `GitHubDeliveryManager` | Moved to delivery layer |
| `onPollCI` | `GitHubDeliveryManager` | Moved to delivery layer |

---

## Rollback Plan

If integration fails:
1. Keep `executeRun()` as fallback
2. Add environment variable `USE_LEGACY_EXECUTOR=true`
3. Orchestrator checks flag and routes accordingly

This allows gradual rollout and easy rollback if issues are discovered.
