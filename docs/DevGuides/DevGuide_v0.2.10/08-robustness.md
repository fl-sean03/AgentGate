# DevGuide v0.2.10: Robustness Fixes

## Thrust 11: Concurrency Control Fix

### 11.1 Objective

Fix the broken concurrency limiting mechanism in the orchestrator.

### 11.2 Background

**Critical Bug Found**: The `activeRuns` Map is never populated, causing `maxConcurrentRuns` to be ineffective.

```typescript
// orchestrator.ts - Current broken implementation
const runId = randomUUID();  // Line 458 - generated but never used

try {
  const run = await executeRun(executorOptions);
  this.activeRuns.delete(run.id);  // Line 463 - deletes run.id (never added!)
  return run;
} finally {
  this.activeRuns.delete(runId);  // Line 478 - deletes runId (never added!)
}
```

### 11.3 Subtasks

#### 11.3.1 Fix activeRuns Tracking

Modify `packages/server/src/orchestrator/orchestrator.ts`:

1. Add run to `activeRuns` BEFORE calling `executeRun`
2. Use consistent ID (run.id from executeRun result)
3. Delete from `activeRuns` in finally block with correct ID

```typescript
// Fixed implementation
try {
  const run = await executeRun(executorOptions);
  this.activeRuns.set(run.id, run);  // Add to tracking

  const result = await this.waitForCompletion(run);
  return result;
} finally {
  // Use the correct ID
  if (run) {
    this.activeRuns.delete(run.id);
  }
  await release(workspace.id);
}
```

#### 11.3.2 Add Concurrency Tests

Create tests to verify:
- `maxConcurrentRuns` limit is respected
- Excess submissions are rejected
- Tracking is cleaned up after completion

### 11.4 Verification Steps

1. Run `pnpm --filter @agentgate/server typecheck` - should pass
2. Run `pnpm --filter @agentgate/server test` - should pass
3. Submit work orders up to limit, verify rejection at limit+1

### 11.5 Files Modified

| File | Action |
|------|--------|
| `packages/server/src/orchestrator/orchestrator.ts` | Modified |

---

## Thrust 12: Lease Duration Extension

### 12.1 Objective

Fix lease expiration during long-running operations.

### 12.2 Background

**High Severity Bug**: Default lease duration is 30 minutes but max operation time is 24 hours. Long-running operations will have expired leases.

```typescript
// lease.ts - Current issue
const DEFAULT_LEASE_DURATION_MS = 30 * 60 * 1000;  // 30 minutes only!
```

### 12.3 Subtasks

#### 12.3.1 Add Lease Renewal Mechanism

Modify `packages/server/src/workspace/lease.ts`:

1. Add `renewLease(leaseId: string, extensionMs?: number): Promise<void>`
2. Set default renewal to match work order's `maxWallClockSeconds`

#### 12.3.2 Add Periodic Lease Refresh

Modify `packages/server/src/orchestrator/run-executor.ts`:

1. Start a renewal interval on run start
2. Renew lease every 10 minutes during execution
3. Clear interval on run completion

```typescript
const renewalInterval = setInterval(async () => {
  await leaseManager.renewLease(leaseId);
}, 10 * 60 * 1000);  // Every 10 minutes

try {
  await executeRun(...);
} finally {
  clearInterval(renewalInterval);
}
```

#### 12.3.3 Match Lease to Work Order Duration

Set initial lease duration based on `maxWallClockSeconds`:

```typescript
const leaseDuration = Math.min(
  workOrder.maxWallClockSeconds * 1000,
  24 * 60 * 60 * 1000  // Cap at 24 hours
);
```

### 12.4 Verification Steps

1. Run `pnpm --filter @agentgate/server typecheck` - should pass
2. Start a work order, verify lease is renewed during execution
3. Verify lease expiry matches work order duration

### 12.5 Files Modified

| File | Action |
|------|--------|
| `packages/server/src/workspace/lease.ts` | Modified |
| `packages/server/src/orchestrator/run-executor.ts` | Modified |

---

## Thrust 13: Error Handling Improvements

### 13.1 Objective

Improve error visibility for silent failures.

### 13.2 Background

**Issues Found**:
1. GitHub push errors are swallowed silently (run-executor.ts:239-242)
2. Corrupted work order files are skipped without error (work-order-store.ts:177-179)
3. Stack traces are lost in error conversion (orchestrator.ts:304-312)

### 13.3 Subtasks

#### 13.3.1 Add Error Events for GitHub Operations

Modify `packages/server/src/orchestrator/run-executor.ts`:

1. Emit events for GitHub push failures
2. Store failure info in run record
3. Surface in work order status

```typescript
} catch (pushError) {
  log.warn({ runId, iteration, error: pushError }, 'Failed to push to GitHub');
  // NEW: Store failure for visibility
  run.warnings.push({
    type: 'github_push_failed',
    message: pushError.message,
    iteration
  });
  emitter.emit('warning', { runId, type: 'github_push_failed', error: pushError });
}
```

#### 13.3.2 Add Work Order File Validation

Modify `packages/server/src/control-plane/work-order-store.ts`:

1. Track corrupted files separately
2. Add method to list corrupted files
3. Add repair/cleanup command

```typescript
const corruptedFiles: string[] = [];

try {
  const workOrder = workOrderSchema.parse(JSON.parse(content));
  return workOrder;
} catch (error) {
  corruptedFiles.push(file);
  log.warn({ file, error }, 'Corrupted work order file');
  return null;
}

export function getCorruptedFiles(): string[] {
  return [...corruptedFiles];
}
```

#### 13.3.3 Preserve Error Stack Traces

Modify error handling to preserve original error:

```typescript
} catch (error) {
  const wrappedError = new BuildError(
    'Build failed',
    error instanceof Error ? error : new Error(String(error))
  );
  log.error({ error: wrappedError, iteration }, 'Build error');
  throw wrappedError;
}
```

### 13.4 Verification Steps

1. Run `pnpm --filter @agentgate/server typecheck` - should pass
2. Corrupt a work order file, verify warning logged
3. Force GitHub push failure, verify warning in run record

### 13.5 Files Modified

| File | Action |
|------|--------|
| `packages/server/src/orchestrator/run-executor.ts` | Modified |
| `packages/server/src/control-plane/work-order-store.ts` | Modified |
| `packages/server/src/orchestrator/orchestrator.ts` | Modified |

---

## Thrust 14: API Schema Consistency

### 14.1 Objective

Fix API schema mismatches between CLI and server.

### 14.2 Background

**Issues Found**:
1. Agent type silently mapped to default (work-orders.ts:420-431)
2. Workspace source missing default case (work-orders.ts:396-415)
3. Run status can return undefined (runs.ts:22-35)

### 14.3 Subtasks

#### 14.3.1 Reject Unknown Agent Types

Modify `packages/server/src/server/routes/work-orders.ts`:

```typescript
function mapAgentType(apiType: CreateWorkOrderBody['agentType']): WorkOrder['agentType'] {
  const validTypes: Record<string, WorkOrder['agentType']> = {
    'claude-code-subscription': 'claude-code-subscription',
  };

  const mapped = validTypes[apiType];
  if (!mapped) {
    throw new BadRequestError(`Unknown agent type: ${apiType}`);
  }
  return mapped;
}
```

#### 14.3.2 Add Exhaustive Switch for Workspace Source

```typescript
function mapWorkspaceSource(source: CreateWorkOrderBody['workspaceSource']): WorkOrder['workspaceSource'] {
  switch (source.type) {
    case 'local':
      return { type: 'local', path: source.path };
    case 'github':
      return { type: 'github', owner: parseOwner(source.repo), repo: parseRepo(source.repo) };
    case 'github-new':
      return { type: 'github', owner: parseOwner(source.repo), repo: parseRepo(source.repo) };
    default:
      // Exhaustive check
      const _exhaustive: never = source;
      throw new BadRequestError(`Unknown workspace source type`);
  }
}
```

#### 14.3.3 Add Default for Unknown Run States

```typescript
function mapRunStatus(state: RunState): RunSummary['status'] {
  const statusMap: Record<RunState, RunSummary['status']> = { /* ... */ };
  return statusMap[state] ?? 'running';  // Safe default
}
```

### 14.4 Verification Steps

1. Run `pnpm --filter @agentgate/server typecheck` - should pass
2. Test API with unknown agent type - should return 400
3. TypeScript should catch missing switch cases at compile time

### 14.5 Files Modified

| File | Action |
|------|--------|
| `packages/server/src/server/routes/work-orders.ts` | Modified |
| `packages/server/src/server/routes/runs.ts` | Modified |

---

---

## Thrust 15: CLI Unification

### 15.1 Objective

Simplify CLI by unifying `submit`, `run`, and `exec` commands into a single `run` command.

### 15.2 Background

Current CLI has three overlapping commands:
- `submit`: Creates work order only (queued for later)
- `run`: Executes a queued work order by ID
- `exec`: Submit + execute combined

This is confusing. Users just want to run tasks.

### 15.3 Proposed Design

**Smart Detection Mode:**
```bash
# Mode 1: Execute existing work order (keeps backward compat)
agentgate run <work-order-id>

# Mode 2: Submit + execute (most common use)
agentgate run --prompt "Fix the bug" --github owner/repo

# Mode 3: Submit only (advanced use)
agentgate run --prompt "Fix the bug" --github owner/repo --no-execute
```

### 15.4 Subtasks

#### 15.4.1 Refactor run.ts

Merge logic from submit.ts and exec.ts:
1. Add optional `work-order-id` argument
2. Add all workspace options from submit
3. Add `--no-execute` flag for submit-only mode
4. Implement mode detection in `executeRun()`

#### 15.4.2 Update CLI Registration

Modify `packages/server/src/control-plane/cli.ts`:
```typescript
// Remove these:
program.addCommand(createSubmitCommand());
program.addCommand(createExecCommand());

// Keep this (with new unified logic):
program.addCommand(createRunCommand());
```

#### 15.4.3 Remove Deprecated Commands

Delete after functionality merged:
- `packages/server/src/control-plane/commands/submit.ts`
- `packages/server/src/control-plane/commands/exec.ts`

Update `commands/index.ts` exports.

#### 15.4.4 Update Tests

Consolidate tests into unified `run` command tests:
- Mode 1: Execute by ID
- Mode 2: Submit + execute
- Mode 3: Submit only with --no-execute
- Edge cases: both ID and prompt, neither provided

### 15.5 Verification Steps

1. `agentgate run <id>` works (backward compat)
2. `agentgate run --prompt "task" --path .` submits and executes
3. `agentgate run --prompt "task" --no-execute` submits only
4. Old commands removed from help
5. All tests pass

### 15.6 Files Modified

| File | Action |
|------|--------|
| `packages/server/src/control-plane/commands/run.ts` | Major refactor |
| `packages/server/src/control-plane/commands/submit.ts` | Delete |
| `packages/server/src/control-plane/commands/exec.ts` | Delete |
| `packages/server/src/control-plane/commands/index.ts` | Update exports |
| `packages/server/src/control-plane/cli.ts` | Remove command registrations |
| `packages/server/test/cli-exec.test.ts` | Update for unified run |

---

## Thrust 16: CI-Aware PR Review

### 16.1 Objective

Enable agents to iterate on PRs based on GitHub CI feedback until CI passes.

### 16.2 Background

Current flow:
1. Agent pushes PR to GitHub
2. PR is created, run ends
3. CI may fail, requiring manual intervention

Desired flow:
1. Agent pushes PR
2. AgentGate polls GitHub for CI status
3. If CI fails, agent receives failure message and remediates
4. Agent pushes fix, repeats until CI passes

### 16.3 Architecture

```
BUILD → SNAPSHOT → VERIFY → VERIFY_PASSED
                                   ↓
                             CREATE_PR
                                   ↓
                           CI_POLLING (NEW)
                                   ↓
                    ┌──────────────┴──────────────┐
                    ↓                             ↓
              CI_PASSED                    CI_FAILED
                    ↓                             ↓
              SUCCEEDED                    FEEDBACK
                                              ↓
                                           BUILDING
                                           (Retry)
```

### 16.4 Subtasks

#### 16.4.1 Add CI Types

Create/modify `packages/server/src/types/`:
- `CIStatus`: pending, running, completed
- `CIConclusion`: success, failure, cancelled, skipped
- `CheckRunResult`: Individual check details
- `CIStatusResult`: Aggregated CI result

#### 16.4.2 Add GitHub CI Functions

Modify `packages/server/src/workspace/github.ts`:

```typescript
// Poll GitHub for CI status
async function getCIStatus(
  client: Octokit,
  owner: string,
  repo: string,
  ref: string
): Promise<CIStatusResult>

// Poll until CI completes (30 min timeout)
async function pollCIStatus(
  client: Octokit,
  owner: string,
  repo: string,
  ref: string,
  options?: { pollIntervalMs?: number; timeoutMs?: number }
): Promise<CIStatusResult>

// Parse CI failures into agent feedback
function parseCIFailures(status: CIStatusResult): string
```

Uses GitHub APIs:
- `client.rest.checks.listForRef()` - Check runs per commit
- `client.rest.actions.listWorkflowRuns()` - Workflow status

#### 16.4.3 Update State Machine

Modify `packages/server/src/orchestrator/state-machine.ts`:

Add states:
- `CI_POLLING`: Waiting for CI to complete
- `CI_PASSED`: CI succeeded
- `CI_FAILED`: CI failed

Add transitions:
- `PR_CREATED → CI_POLLING` (start polling)
- `CI_POLLING → CI_PASSED` (all checks pass)
- `CI_POLLING → CI_FAILED` (any check fails)
- `CI_FAILED → BUILDING` (retry with feedback)

#### 16.4.4 Add CI Polling Phase

Modify `packages/server/src/orchestrator/run-executor.ts`:

Add `onPollCI` callback after PR creation:
```typescript
interface RunExecutorCallbacks {
  // ... existing callbacks
  onPollCI?: (prUrl: string, branchRef: string) => Promise<CIStatusResult>;
}
```

When CI fails:
1. Parse failure messages
2. Format as agent feedback
3. Return to BUILD phase with feedback
4. Continue iteration loop

#### 16.4.5 Update Orchestrator

Modify `packages/server/src/orchestrator/orchestrator.ts`:

Implement `onPollCI` callback:
1. Get Octokit client
2. Call `pollCIStatus()` with PR branch ref
3. If failed, format feedback via `parseCIFailures()`
4. Return result for state machine

#### 16.4.6 Optional Flag

Add `--wait-for-ci` flag to CLI:
- Default: false (current behavior - create PR and end)
- If true: Poll CI and iterate until pass

### 16.5 Verification Steps

1. `pnpm --filter @agentgate/server typecheck` passes
2. `pnpm --filter @agentgate/server test` passes
3. E2E test: PR with failing CI → agent fixes → CI passes
4. Timeout handling works (30 min default)

### 16.6 Files Modified

| File | Action |
|------|--------|
| `packages/server/src/types/github.ts` | Create (CI types) |
| `packages/server/src/types/run.ts` | Add CI states/fields |
| `packages/server/src/workspace/github.ts` | Add getCIStatus, pollCIStatus |
| `packages/server/src/orchestrator/state-machine.ts` | Add CI transitions |
| `packages/server/src/orchestrator/run-executor.ts` | Add onPollCI callback |
| `packages/server/src/orchestrator/orchestrator.ts` | Implement CI polling |
| `packages/server/src/feedback/generator.ts` | Parse CI failures |

---

## Summary

| Thrust | Issue | Severity | Priority |
|--------|-------|----------|----------|
| 11 | Concurrency control broken | Critical | P0 |
| 12 | Lease expires mid-execution | High | P0 |
| 13 | Silent error swallowing | High | P1 |
| 14 | API schema mismatches | Medium | P1 |
| 15 | CLI command confusion | Medium | P1 |
| 16 | No CI feedback loop | Medium | P2 |
