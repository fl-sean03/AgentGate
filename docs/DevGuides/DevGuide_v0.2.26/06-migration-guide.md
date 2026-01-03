# 06: Migration Guide

## Overview

This guide helps developers migrate from the legacy `executeRun()` API to the new `ExecutionEngine` API introduced in v0.2.25 and made default in v0.2.26.

---

## Quick Migration

### Before (v0.2.25 and earlier)

```typescript
import { executeRun, type RunExecutorOptions } from '@agentgate/server';

const options: RunExecutorOptions = {
  workOrder,
  workspace,
  gatePlan,
  harnessConfig,
  loopStrategy,
  leaseId: lease.id,
  maxWallClockMs: 3600000,

  onCaptureBeforeState: async (ws) => captureBeforeState(ws),
  onBuild: async (ws, taskPrompt, feedback, iteration, sessionId) => {
    const driver = new ClaudeCodeDriver();
    return driver.execute({ workspacePath: ws.rootPath, taskPrompt, ... });
  },
  onSnapshot: async (ws, beforeState, runId, iteration) => {
    return captureAfterState(ws, beforeState, runId, iteration);
  },
  onVerify: async (snapshot, plan, runId, iteration) => {
    return verify({ snapshotPath: workspace.rootPath, gatePlan: plan, ... });
  },
  onFeedback: async (snapshot, report, plan) => {
    const feedback = generateFeedback(report);
    return formatForAgent(feedback);
  },
  onRunStarted: async (run) => { ... },
  onStateChange: (run) => { ... },
  onIterationComplete: (run, iteration) => { ... },
};

const run = await executeRun(options);
```

### After (v0.2.26+)

```typescript
import {
  createExecutionEngine,
  resolveTaskSpec,
  createServiceAdapters,
  type ExecutionInput,
} from '@agentgate/server';

// 1. Create TaskSpec from work order
const taskSpec = resolveTaskSpec({
  workOrder,
  harnessConfig,
  gatePlan,
});

// 2. Create services
const driver = new ClaudeCodeDriver();
const services = createServiceAdapters({
  agentDriver: driver,
  captureSnapshot: (path, before, runId, iter, prompt) =>
    captureAfterState({ rootPath: path }, before, runId, iter, prompt),
  verifyFn: (opts) => verify(opts),
  generateFeedback,
  formatFeedback: formatForAgent,
});

// 3. Create and run engine
const engine = createExecutionEngine();
const result = await engine.execute({
  workOrder,
  taskSpec,
  workspace,
  gatePlan,
  services,
});

const run = result.run;
```

---

## API Changes

### Removed APIs

| Old API | Replacement |
|---------|-------------|
| `executeRun()` | `ExecutionEngine.execute()` |
| `ExecutionCoordinator` | `ExecutionEngine` |
| `RunExecutorOptions` | `ExecutionInput` |
| `ExecutionCallbacks` | `PhaseServices` |

### New APIs

| New API | Purpose |
|---------|---------|
| `ExecutionEngine` | Unified execution engine |
| `PhaseOrchestrator` | Coordinates phase handlers |
| `PhaseServices` | Service interfaces for phases |
| `resolveTaskSpec()` | Creates TaskSpec from WorkOrder |
| `createServiceAdapters()` | Creates services from callbacks |
| `ProgressEmitter` | Real-time execution events |
| `MetricsCollector` | Prometheus-compatible metrics |

---

## Callback to Service Migration

### onBuild → AgentDriver

**Before**:
```typescript
onBuild: async (ws, taskPrompt, feedback, iteration, sessionId, runId) => {
  const request = {
    workspacePath: ws.rootPath,
    taskPrompt,
    priorFeedback: feedback,
    sessionId,
    // ... more fields
  };
  return driver.execute(request);
}
```

**After**:
```typescript
// AgentDriver is created from your driver:
const services = createServiceAdapters({
  agentDriver: new ClaudeCodeDriver(),
  // ...
});

// The adapter handles request construction internally
```

### onSnapshot → Snapshotter

**Before**:
```typescript
onSnapshot: async (ws, beforeState, runId, iteration, taskPrompt) => {
  return captureAfterState(ws, beforeState, runId, iteration, taskPrompt);
}
```

**After**:
```typescript
const services = createServiceAdapters({
  captureSnapshot: async (path, before, runId, iter, prompt) => {
    return captureAfterState({ rootPath: path }, before, runId, iter, prompt);
  },
  // ...
});
```

### onVerify → Verifier

**Before**:
```typescript
onVerify: async (snapshot, plan, runId, iteration) => {
  return verify({
    snapshotPath: workspace.rootPath,
    gatePlan: plan,
    snapshotId: snapshot.id,
    runId,
    iteration,
    cleanRoom: false,
    timeoutMs: 300000,
    skip: [],
  });
}
```

**After**:
```typescript
const services = createServiceAdapters({
  verifyFn: (opts) => verify(opts),
  // ...
});
```

### onFeedback → FeedbackGenerator

**Before**:
```typescript
onFeedback: async (_snapshot, report, _plan) => {
  const structured = generateFeedback(report, report.iteration);
  return formatForAgent(structured);
}
```

**After**:
```typescript
const services = createServiceAdapters({
  generateFeedback: (report, iter) => generateFeedback(report, iter),
  formatFeedback: formatForAgent,
  // ...
});
```

### Observability Callbacks → ProgressEmitter

**Before**:
```typescript
onRunStarted: async (run) => {
  console.log('Run started:', run.id);
},
onStateChange: (run) => {
  console.log('State:', run.state);
},
onIterationComplete: (run, iteration) => {
  console.log('Iteration:', iteration.iteration, 'passed:', iteration.verificationPassed);
},
```

**After**:
```typescript
import { getProgressEmitter } from '@agentgate/server';

const emitter = getProgressEmitter();
emitter.subscribe((event) => {
  switch (event.type) {
    case 'run_started':
      console.log('Run started:', event.runId);
      break;
    case 'phase_completed':
      console.log('Phase:', event.phase, 'success:', event.success);
      break;
    case 'iteration_completed':
      console.log('Iteration:', event.iteration, 'success:', event.success);
      break;
    case 'run_completed':
      console.log('Result:', event.result);
      break;
  }
});
```

---

## GitHub Integration Changes

### Before

GitHub callbacks were part of `RunExecutorOptions`:

```typescript
if (isGitHub) {
  options.onPushIteration = async (ws, run, iteration, commitMessage) => { ... };
  options.onCreatePullRequest = async (ws, run, verificationReport) => { ... };
  options.onPollCI = async (ws, run, prUrl, branchRef) => { ... };
}
```

### After

GitHub delivery is handled separately after execution:

```typescript
const result = await engine.execute(input);

if (isGitHub && result.run.state === RunState.SUCCEEDED) {
  const deliveryManager = new GitHubDeliveryManager(client, owner, repo);
  const deliveryResult = await deliveryManager.deliver({
    run: result.run,
    workspace,
    branch: gitHubBranch,
    waitForCI: workOrder.waitForCI,
  });

  if (deliveryResult.prUrl) {
    result.run.gitHubPrUrl = deliveryResult.prUrl;
  }
}
```

---

## Common Migration Issues

### Issue 1: Missing Required Fields

**Error**: `Property 'workspace' is missing in ExecutionInput`

**Solution**: ExecutionInput requires workspace to be passed explicitly:
```typescript
const input: ExecutionInput = {
  workOrder,
  taskSpec,
  workspace,  // Required!
  gatePlan,
  services,
};
```

### Issue 2: Service Type Mismatch

**Error**: `Type 'ClaudeCodeDriver' is not assignable to type 'AgentDriver'`

**Solution**: Use `createServiceAdapters()` to wrap your driver:
```typescript
const services = createServiceAdapters({
  agentDriver: new ClaudeCodeDriver(),  // Adapter handles conversion
});
```

### Issue 3: Missing TaskSpec

**Error**: `Property 'taskSpec' is required`

**Solution**: Use `resolveTaskSpec()` to create from WorkOrder:
```typescript
const taskSpec = resolveTaskSpec({
  workOrder,
  harnessConfig,
  gatePlan,
});
```

---

## Gradual Migration

If you need to migrate gradually:

### Step 1: Keep Both Paths

```typescript
const USE_NEW_ENGINE = process.env.USE_NEW_ENGINE === 'true';

if (USE_NEW_ENGINE) {
  // New path
  const engine = createExecutionEngine();
  const result = await engine.execute(input);
  run = result.run;
} else {
  // Legacy path
  run = await executeRun(options);
}
```

### Step 2: Enable New Engine in Test

```bash
USE_NEW_ENGINE=true pnpm test
```

### Step 3: Enable New Engine in Staging

```bash
USE_NEW_ENGINE=true pnpm start:staging
```

### Step 4: Enable New Engine in Production

```bash
USE_NEW_ENGINE=true pnpm start:production
```

### Step 5: Remove Legacy Code

Once confident, remove the legacy path and the `USE_NEW_ENGINE` check.

---

## Need Help?

- **Issue Tracker**: https://github.com/fl-sean03/AgentGate/issues
- **Documentation**: https://github.com/fl-sean03/AgentGate/docs
- **DevGuide v0.2.25**: Execution pipeline architecture
- **DevGuide v0.2.26**: This integration guide
