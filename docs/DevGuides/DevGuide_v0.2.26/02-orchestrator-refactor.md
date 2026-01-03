# 02: Orchestrator Refactor

## Overview

The Orchestrator is the main entry point for work order execution. Currently at 749 lines, it handles workspace setup, callback configuration, and delegates to `executeRun()`. This document details the refactoring to use ExecutionEngine instead.

---

## Current Structure

```
orchestrator.ts (749 lines)
├── OrchestratorConfig interface
├── InternalOrchestratorConfig interface
├── Orchestrator class
│   ├── constructor() - Config initialization
│   ├── execute(workOrder) - Main execution (580+ lines)
│   │   ├── Workspace acquisition (lines 161-253)
│   │   ├── GitHub branch setup (lines 256-290)
│   │   ├── Gate plan resolution (lines 293-301)
│   │   ├── Harness config resolution (lines 304-366)
│   │   ├── Agent driver creation (lines 369-393)
│   │   ├── Callback setup (lines 396-672)
│   │   └── executeRun() call (line 678)
│   ├── getStatus(runId)
│   ├── getRun(runId)
│   ├── getActiveRunCount()
│   ├── getConfiguration()
│   └── getStats()
└── createOrchestrator()
```

---

## Target Structure

```
orchestrator.ts (~400 lines, reduced by ~50%)
├── OrchestratorConfig interface
├── InternalOrchestratorConfig interface
├── Orchestrator class
│   ├── constructor() - Config initialization
│   ├── execute(workOrder) - Main execution (~250 lines)
│   │   ├── Workspace acquisition (unchanged)
│   │   ├── GitHub branch setup (unchanged)
│   │   ├── Gate plan resolution (unchanged)
│   │   ├── Harness config resolution (unchanged)
│   │   ├── Agent driver creation (unchanged)
│   │   ├── NEW: TaskSpec resolution
│   │   ├── NEW: Service adapter creation
│   │   ├── NEW: ExecutionEngine execution
│   │   └── NEW: Delivery handling (if GitHub)
│   ├── getStatus(runId)
│   ├── getRun(runId)
│   ├── getActiveRunCount()
│   ├── getConfiguration()
│   └── getStats()
└── createOrchestrator()

engine-bridge.ts (~150 lines, new)
├── createServicesFromCallbacks()
├── createDeliveryCallbacks()
└── bridgeOrchestratorToEngine()
```

---

## Refactoring Steps

### Step 1: Extract Callback Construction

Currently, callbacks are defined inline in `execute()`. Extract them to a separate function.

**Before** (inline, ~276 lines):
```typescript
const executorOptions: RunExecutorOptions = {
  workOrder,
  workspace,
  gatePlan,
  harnessConfig,
  loopStrategy,
  leaseId: lease.id,
  maxWallClockMs: workOrder.maxWallClockSeconds * 1000,

  onCaptureBeforeState: async (ws) => { ... },
  onBuild: async (ws, taskPrompt, feedback, iteration, sessionId, runId) => { ... },
  onSnapshot: async (ws, beforeState, runId, iteration, taskPrompt) => { ... },
  onVerify: async (snapshot, plan, runId, iteration) => { ... },
  onFeedback: async (_snapshot, report, _plan) => { ... },
  onRunStarted: async (run) => { ... },
  onStateChange: (run) => { ... },
  onIterationComplete: (run, iteration) => { ... },
  // GitHub callbacks...
};
```

**After** (extracted):
```typescript
// In engine-bridge.ts
export function createServicesFromCallbacks(
  driver: AgentDriver,
  workspace: Workspace,
  gatePlan: GatePlan,
  workOrder: WorkOrder
): PhaseServices {
  return {
    agentDriver: createAgentDriverFromClaudeCode(driver, workOrder),
    snapshotter: createSnapshotterFromCallbacks(workspace),
    verifier: createVerifierFromCallbacks(workspace, workOrder),
    feedbackGenerator: createFeedbackGeneratorFromCallbacks(),
    resultPersister: createResultPersisterAdapter(),
  };
}
```

### Step 2: Replace executeRun() Call

**Before**:
```typescript
// Line 678
run = await executeRun(executorOptions);
```

**After**:
```typescript
// Create TaskSpec from work order
const taskSpec = resolveTaskSpec({
  workOrder,
  harnessConfig,
  gatePlan,
});

// Create services from callbacks
const services = createServicesFromCallbacks(driver, workspace, gatePlan, workOrder);

// Create and run engine
const engine = createExecutionEngine({
  maxConcurrentRuns: this.config.maxConcurrentRuns,
  emitProgressEvents: true,
  collectMetrics: true,
});

const result = await engine.execute({
  workOrder,
  taskSpec,
  workspace,
  gatePlan,
  services,
  leaseId: lease.id,
});

run = result.run;
```

### Step 3: Handle GitHub Delivery Separately

Move GitHub-specific callbacks out of the execution flow and into a delivery phase.

**Before** (embedded in callbacks):
```typescript
if (isGitHub) {
  executorOptions.onPushIteration = async (ws, run, iteration, commitMessage) => { ... };
  executorOptions.onCreatePullRequest = async (_ws, run, verificationReport) => { ... };
  executorOptions.onPollCI = async (_ws, run, _prUrl, branchRef) => { ... };
}
```

**After** (separate delivery phase):
```typescript
// Execute the core build-verify loop
const result = await engine.execute({ ... });

// Handle delivery for GitHub workspaces
if (isGitHub && result.run.state === RunState.SUCCEEDED) {
  const deliveryManager = new GitHubDeliveryManager(gitHubClient);
  const deliveryResult = await deliveryManager.deliver({
    run: result.run,
    workspace,
    workOrder,
    verificationReport: result.lastVerificationReport,
    gitHubBranch,
    waitForCI: workOrder.waitForCI,
  });

  // Update run with PR info
  if (deliveryResult.prUrl) {
    result.run.gitHubPrUrl = deliveryResult.prUrl;
    result.run.gitHubPrNumber = deliveryResult.prNumber;
  }
}
```

---

## Detailed Code Changes

### orchestrator.ts Changes

```typescript
// Add imports
import { createExecutionEngine, type ExecutionInput } from '../execution/index.js';
import { resolveTaskSpec } from '../execution/task-spec-resolver.js';
import { createServicesFromCallbacks } from './engine-bridge.js';
import { GitHubDeliveryManager } from '../delivery/github-manager.js';

// In execute() method, replace lines 396-693 with:

// Create TaskSpec
const taskSpec = resolveTaskSpec({
  workOrder,
  harnessConfig,
  gatePlan,
});

log.info(
  { taskSpecHash: taskSpec._hash, workOrderId: workOrder.id },
  'TaskSpec resolved'
);

// Create services from existing implementations
const services = createServicesFromCallbacks({
  driver,
  workspace,
  gatePlan,
  workOrder,
  spawnLimits: this.config.enableSpawning ? this.config.spawnLimits : null,
});

// Create execution engine
const engine = createExecutionEngine({
  maxConcurrentRuns: this.config.maxConcurrentRuns,
  defaultTimeoutMs: workOrder.maxWallClockSeconds * 1000,
  emitProgressEvents: true,
  collectMetrics: true,
});

// Execute
const executionInput: ExecutionInput = {
  workOrder,
  taskSpec,
  workspace,
  gatePlan,
  services,
  leaseId: lease.id,
};

// Add to active runs tracking
const runId = randomUUID();
this.activeRuns.set(runId, { /* tracking info */ });

try {
  const result = await engine.execute(executionInput);
  run = result.run;

  // Handle GitHub delivery
  if (isGitHub && run.state === RunState.SUCCEEDED) {
    await this.handleGitHubDelivery(run, workspace, workOrder, gitHubBranch);
  }

  log.info(
    {
      runId: run.id,
      result: run.result,
      iterations: run.iteration,
    },
    'Work order execution complete'
  );

  return run;
} finally {
  this.activeRuns.delete(runId);
  await release(workspace.id);
}
```

### New Method: handleGitHubDelivery()

```typescript
private async handleGitHubDelivery(
  run: Run,
  workspace: Workspace,
  workOrder: WorkOrder,
  gitHubBranch: string
): Promise<void> {
  const { createGitHubClient, getGitHubConfigFromEnv } = await import('../workspace/github.js');
  const { stageAll, commit, push } = await import('../workspace/git-ops.js');

  const config = getGitHubConfigFromEnv();
  const client = createGitHubClient(config);

  // Get owner/repo
  let owner: string, repo: string;
  if (workOrder.workspaceSource.type === 'github') {
    owner = workOrder.workspaceSource.owner;
    repo = workOrder.workspaceSource.repo;
  } else if (workOrder.workspaceSource.type === 'github-new') {
    owner = workOrder.workspaceSource.owner;
    repo = workOrder.workspaceSource.repoName;
  } else {
    return;
  }

  // Create delivery manager and deliver
  const deliveryManager = new GitHubDeliveryManager(client, owner, repo);
  const deliveryResult = await deliveryManager.deliver({
    run,
    workspace,
    branch: gitHubBranch,
    waitForCI: workOrder.waitForCI ?? false,
    taskPrompt: workOrder.taskPrompt,
  });

  // Update run with delivery info
  if (deliveryResult.prUrl) {
    run.gitHubPrUrl = deliveryResult.prUrl;
    run.gitHubPrNumber = deliveryResult.prNumber;
    await saveRun(run);
  }
}
```

---

## Lines of Code Impact

| File | Before | After | Change |
|------|--------|-------|--------|
| orchestrator.ts | 749 | ~450 | -40% |
| run-executor.ts | 675 | 0 (removed) | -100% |
| engine-bridge.ts | 0 | ~150 | new |
| github-manager.ts | 0 | ~200 | new |
| **Total** | 1424 | ~800 | -44% |

---

## Backwards Compatibility

For v0.2.26, we maintain backwards compatibility by:

1. **Keeping executeRun() available** but deprecated
2. **Environment variable** `AGENTGATE_USE_LEGACY_EXECUTOR=true` falls back to old path
3. **Deprecation warnings** logged when legacy path is used

This allows gradual migration and easy rollback if issues occur.
