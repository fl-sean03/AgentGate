# 05: Orchestrator Integration

## Thrust 6: Agent Remediation Loop

### 6.1 Objective

Integrate CI monitoring into the run executor to enable automatic remediation.

### 6.2 Background

The run executor currently ends after creating a PR. We need to:
1. Continue monitoring after PR creation
2. React to CI failures
3. Resume agent with remediation context
4. Push fixes and re-monitor
5. Limit attempts to prevent infinite loops

### 6.3 Subtasks

#### 6.3.1 Update Run Executor

Modify `packages/server/src/orchestrator/run-executor.ts`:

**New flow after PR creation:**

```typescript
// After PR is created successfully...
if (gateConfig.verify?.useGitHubCI) {
  const ciResult = await this.runCILoop({
    owner,
    repo,
    prNumber,
    headSha,
    sessionId: result.sessionId,
    originalPrompt: request.taskPrompt,
    changedFiles: result.changedFiles,
  });

  if (!ciResult.success) {
    // Mark run as CI_FAILED
    // Include CI failure details in run result
  }
}
```

**CI Loop implementation:**

```typescript
private async runCILoop(options: CILoopOptions): Promise<CILoopResult> {
  const maxAttempts = this.config.maxCIRetries;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 1. Wait for CI to complete
    const ciResult = await this.workflowMonitor.waitForCompletion(
      options.owner,
      options.repo,
      options.headSha
    );

    // 2. If success, we're done
    if (ciResult.status === 'success') {
      return { success: true, attempts: attempt };
    }

    // 3. If failure and not last attempt, remediate
    if (attempt < maxAttempts) {
      const remediationPrompt = this.failureSummarizer.summarize({
        failures: ciResult.failures,
        originalPrompt: options.originalPrompt,
        changedFiles: options.changedFiles,
      });

      // 4. Resume agent with remediation context
      const fixResult = await this.agentDriver.execute({
        taskPrompt: remediationPrompt,
        sessionId: options.sessionId,
        workspacePath: options.workspacePath,
      });

      // 5. Push changes
      await this.gitOps.push(options.workspacePath, true); // force push

      // 6. Get new head SHA for next iteration
      options.headSha = await this.gitOps.getHeadSha(options.workspacePath);
    }
  }

  return { success: false, attempts: maxAttempts };
}
```

#### 6.3.2 Add CI Status Tracking

Add CI fields to run result and work order:

**Run result additions:**
- `ciStatus`: 'pending' | 'success' | 'failure' | 'skipped'
- `ciAttempts`: number
- `ciFailures`: CIFailure[] (from last attempt)
- `ciDuration`: number

**Work order status:**
- Add 'CI_RUNNING' status
- Add 'CI_FAILED' terminal status

#### 6.3.3 Emit CI Events

Emit WebSocket events for CI progress:

**New event types:**

```typescript
interface CIWorkflowStartedEvent extends BaseEvent {
  type: 'ci_workflow_started';
  workOrderId: string;
  runId: string;
  prNumber: number;
  prUrl: string;
}

interface CIWorkflowCompletedEvent extends BaseEvent {
  type: 'ci_workflow_completed';
  workOrderId: string;
  runId: string;
  status: 'success' | 'failure';
  duration: number;
}

interface CIRemediationStartedEvent extends BaseEvent {
  type: 'ci_remediation_started';
  workOrderId: string;
  runId: string;
  attempt: number;
  maxAttempts: number;
  failureCount: number;
}
```

#### 6.3.4 Update Module Exports

Update `packages/server/src/github/index.ts`:

Export all CI components:
- ActionsClient
- WorkflowMonitor
- LogDownloader
- LogParser
- FailureSummarizer
- Types

#### 6.3.5 Configuration

Add configuration for CI behavior:

**Environment variables:**
- `AGENTGATE_CI_ENABLED`: Enable/disable CI loop
- `AGENTGATE_MAX_CI_RETRIES`: Max remediation attempts
- `AGENTGATE_CI_POLL_INTERVAL_MS`: Poll frequency
- `AGENTGATE_CI_TIMEOUT_MS`: Max wait time
- `AGENTGATE_CI_USE_LLM_SUMMARY`: Use LLM for error summary

**Config schema updates:**

Add to config/index.ts:
```typescript
ciEnabled: z.boolean().default(true),
maxCIRetries: z.coerce.number().min(0).max(10).default(3),
ciPollIntervalMs: z.coerce.number().min(5000).default(30000),
ciTimeoutMs: z.coerce.number().min(60000).default(1800000),
ciUseLLMSummary: z.boolean().default(false),
```

### 6.4 Verification Steps

1. CI monitoring starts after PR creation
2. Successful CI completes the run
3. Failed CI triggers remediation
4. Agent receives proper remediation prompt
5. Fixes are pushed to the branch
6. Loop continues until success or max attempts
7. WebSocket events are emitted
8. Configuration options work
9. Existing non-CI runs still work

### 6.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/orchestrator/run-executor.ts` | Modified |
| `packages/server/src/orchestrator/orchestrator.ts` | Modified |
| `packages/server/src/github/index.ts` | Modified |
| `packages/shared/src/types/websocket.ts` | Modified |
| `packages/shared/src/types/run.ts` | Modified |
| `packages/server/src/config/index.ts` | Modified |

---

## Sequence Diagram

```
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────┐     ┌────────┐
│Run       │     │Workflow   │     │Log         │     │Failure   │     │Agent   │
│Executor  │     │Monitor    │     │Downloader  │     │Summarizer│     │Driver  │
└────┬─────┘     └─────┬─────┘     └──────┬─────┘     └────┬─────┘     └────┬───┘
     │                 │                   │                │               │
     │ PR Created      │                   │                │               │
     │─────────────────►                   │                │               │
     │                 │                   │                │               │
     │ waitForCompletion()                 │                │               │
     │─────────────────►                   │                │               │
     │                 │                   │                │               │
     │                 │ poll...           │                │               │
     │                 │────┐              │                │               │
     │                 │◄───┘              │                │               │
     │                 │                   │                │               │
     │ CIResult(failure)                   │                │               │
     │◄────────────────│                   │                │               │
     │                 │                   │                │               │
     │ downloadLogs()  │                   │                │               │
     │─────────────────────────────────────►                │               │
     │                 │                   │                │               │
     │ RawLogs         │                   │                │               │
     │◄────────────────────────────────────│                │               │
     │                 │                   │                │               │
     │ summarize()     │                   │                │               │
     │─────────────────────────────────────────────────────►│               │
     │                 │                   │                │               │
     │ RemediationPrompt                   │                │               │
     │◄────────────────────────────────────────────────────│               │
     │                 │                   │                │               │
     │ execute({prompt, sessionId})        │                │               │
     │─────────────────────────────────────────────────────────────────────►│
     │                 │                   │                │               │
     │ Result          │                   │                │               │
     │◄────────────────────────────────────────────────────────────────────│
     │                 │                   │                │               │
     │ Push changes    │                   │                │               │
     │─────────────────►                   │                │               │
     │                 │                   │                │               │
     │ (loop if needed)│                   │                │               │
     │                 │                   │                │               │
```
