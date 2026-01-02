# 13: Appendices

## Appendix A: File Map Summary

### New Files by Phase

#### Phase 1: Observability (8 files)

| File | Purpose |
|------|---------|
| `src/types/persisted-results.ts` | PersistedAgentResult, PersistedVerificationReport |
| `src/types/build-error.ts` | BuildErrorType, BuildError |
| `src/orchestrator/result-persister.ts` | ResultPersister class |
| `src/orchestrator/error-builder.ts` | ErrorBuilder class |
| `test/unit/result-persister.test.ts` | Unit tests |
| `test/unit/iteration-data.test.ts` | Unit tests |
| `test/unit/error-builder.test.ts` | Unit tests |
| `test/integration/observability-flow.test.ts` | Integration tests |

#### Phase 2: Reliability (9 files)

| File | Purpose |
|------|---------|
| `src/types/retry-policy.ts` | RetryPolicy, RetryResult |
| `src/types/github-mode.ts` | GitHubMode, GitHubOperationResult |
| `src/types/work-order-queue.ts` | QueuePosition, QueueStats |
| `src/orchestrator/retry-executor.ts` | RetryExecutor class |
| `src/orchestrator/github-handler.ts` | GitHubOperationHandler class |
| `src/control-plane/work-order-queue.ts` | WorkOrderQueue class |
| `test/unit/retry-executor.test.ts` | Unit tests |
| `test/unit/github-handler.test.ts` | Unit tests |
| `test/unit/work-order-queue.test.ts` | Unit tests |

#### Phase 3: Architecture (10 files)

| File | Purpose |
|------|---------|
| `src/workspace/types.ts` | Workspace types |
| `src/workspace/manager.ts` | WorkspaceManager class |
| `src/workspace/index.ts` | Public exports |
| `src/harness/strategies/fixed.ts` | FixedStrategy |
| `src/harness/strategies/hybrid.ts` | HybridStrategy |
| `src/harness/strategies/ralph.ts` | RalphStrategy |
| `src/harness/strategy-factory.ts` | createLoopStrategy |
| `src/orchestrator/events.ts` | Event definitions |
| `src/orchestrator/typed-emitter.ts` | TypedEventEmitter |
| `src/orchestrator/subscribers/*.ts` | Event subscribers |

### Modified Files

| File | Changes |
|------|---------|
| `src/types/run.ts` | Enhanced IterationData |
| `src/types/harness-config.ts` | Add retry, githubMode |
| `src/orchestrator/orchestrator.ts` | Major refactor for events |
| `src/orchestrator/run-executor.ts` | Result persistence, retry |
| `src/orchestrator/run-store.ts` | New save/load functions |
| `src/control-plane/work-order-service.ts` | Queue integration |

---

## Appendix B: Type Reference

### Core Types

```typescript
// Persisted Results
interface PersistedAgentResult {
  runId: string;
  iteration: number;
  capturedAt: string;
  sessionId: string;
  model: string | null;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  structuredOutput: any | null;
  toolCalls: ToolCallRecord[];
  durationMs: number;
  tokensUsed: TokenUsage | null;
  totalCostUsd: number | null;
}

// Build Errors
enum BuildErrorType {
  AGENT_CRASH = 'agent_crash',
  AGENT_TIMEOUT = 'agent_timeout',
  AGENT_TASK_FAILURE = 'agent_task_failure',
  TYPECHECK_FAILED = 'typecheck_failed',
  LINT_FAILED = 'lint_failed',
  TEST_FAILED = 'test_failed',
  BLACKBOX_FAILED = 'blackbox_failed',
  CI_FAILED = 'ci_failed',
  WORKSPACE_ERROR = 'workspace_error',
  SNAPSHOT_ERROR = 'snapshot_error',
  GITHUB_ERROR = 'github_error',
  SYSTEM_ERROR = 'system_error',
  UNKNOWN = 'unknown',
}

interface BuildError {
  type: BuildErrorType;
  message: string;
  exitCode: number | null;
  stdoutTail: string;
  stderrTail: string;
  agentResultFile: string | null;
  verificationFile: string | null;
  context: Record<string, unknown>;
  failedAt: string;
}

// Retry Policy
interface RetryPolicy {
  maxAttempts: number;
  initialBackoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  retryableErrors: BuildErrorType[];
  retryOnTimeout: boolean;
  jitter: boolean;
}

// GitHub Mode
enum GitHubMode {
  FAIL_FAST = 'fail_fast',
  BEST_EFFORT = 'best_effort',
  DISABLED = 'disabled',
}

// Loop Strategy
interface LoopStrategy {
  readonly name: string;
  onIterationComplete(event: IterationCompleteEvent): Promise<LoopDecision>;
  onLoopEnd?(event: LoopEndEvent): Promise<void>;
}

interface LoopDecision {
  continue: boolean;
  reason: string;
  feedback?: string;
  metadata?: Record<string, unknown>;
}
```

---

## Appendix C: Configuration Examples

### Full HarnessConfig with v0.2.19 Options

```typescript
const harnessConfig: HarnessConfig = {
  // Loop Strategy
  loopStrategy: {
    mode: 'hybrid',
    baseIterations: 3,
    maxBonusIterations: 2,
    progressThreshold: 0.1,
  },

  // Verification
  verification: {
    gatePlanSource: 'auto',
    waitForCI: true,
    skipLevels: ['L3'],
  },

  // Git Operations
  gitOps: {
    mode: 'pr',
    branchPattern: 'agentgate/{runId}',
    draftPR: false,
    autoMerge: false,
    githubMode: 'fail_fast',  // NEW in v0.2.19
  },

  // Execution Limits
  limits: {
    maxWallClockSeconds: 3600,
    networkAllowed: true,
  },

  // Retry Policy (NEW in v0.2.19)
  retry: {
    maxAttempts: 2,
    initialBackoffMs: 5000,
    backoffMultiplier: 2,
    maxBackoffMs: 30000,
    retryableErrors: ['agent_timeout', 'system_error'],
    retryOnTimeout: true,
    jitter: true,
  },
};
```

### Profile with Retry Configuration

```yaml
# ~/.agentgate/profiles/reliable.yaml
name: reliable
description: High-reliability profile with retries
extends: default

loopStrategy:
  mode: hybrid
  baseIterations: 3
  maxBonusIterations: 3

verification:
  waitForCI: true

gitOps:
  mode: pr
  githubMode: fail_fast

retry:
  maxAttempts: 3
  initialBackoffMs: 10000
  retryableErrors:
    - agent_timeout
    - system_error
    - github_error
```

---

## Appendix D: Event Reference

### All Orchestrator Events

| Event | Payload | When Emitted |
|-------|---------|--------------|
| `run:queued` | `{runId, workOrderId}` | Work order enters queue |
| `run:started` | `{runId, maxIterations, harnessConfig}` | Run execution begins |
| `run:complete` | `{runId, result, totalIterations, prUrl}` | Run finishes |
| `run:failed` | `{runId, error}` | Run fails terminally |
| `iteration:started` | `{runId, iteration, feedback}` | Iteration begins |
| `iteration:complete` | `{runId, iteration, decision}` | Iteration ends |
| `agent:started` | `{runId, iteration}` | Agent execution begins |
| `agent:complete` | `{runId, iteration, result, resultFile}` | Agent execution ends |
| `agent:failed` | `{runId, iteration, error, resultFile}` | Agent fails |
| `verification:started` | `{runId, iteration}` | Verification begins |
| `verification:complete` | `{runId, iteration, report, reportFile}` | Verification ends |
| `workspace:acquired` | `{workspaceId, source}` | Workspace created |
| `workspace:released` | `{workspaceId}` | Workspace cleaned up |
| `snapshot:created` | `{workspaceId, snapshotId}` | Snapshot taken |
| `snapshot:restored` | `{workspaceId, snapshotId}` | Snapshot restored |
| `pr:created` | `{runId, prUrl, branchName}` | Pull request created |
| `strategy:decision` | `{runId, iteration, decision}` | Strategy decides |

---

## Appendix E: Error Code Reference

### Error Codes and HTTP Status

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `AGENT_CRASH` | 500 | Agent process crashed |
| `AGENT_TIMEOUT` | 504 | Agent exceeded time limit |
| `AGENT_TASK_FAILURE` | 422 | Agent couldn't complete task |
| `TYPECHECK_FAILED` | 422 | TypeScript compilation failed |
| `LINT_FAILED` | 422 | Linting failed |
| `TEST_FAILED` | 422 | Tests failed |
| `WORKSPACE_ERROR` | 500 | Workspace operation failed |
| `GITHUB_ERROR` | 502 | GitHub API error |
| `QUEUE_FULL` | 503 | Work order queue at capacity |
| `QUEUE_TIMEOUT` | 504 | Waited too long in queue |

---

## Appendix F: Troubleshooting Guide

### Problem: Run failed with no diagnostic info

**Before v0.2.19:**
```
Error: Build failed
```

**After v0.2.19:**
```
Error: TypeScript compilation failed (3 errors in 2 files)
Details: agent-1.json, verification-1.json
```

**Investigation steps:**
1. Read `~/.agentgate/runs/{runId}/agent-1.json` for full agent output
2. Read `~/.agentgate/runs/{runId}/verification-1.json` for verification details
3. Check `iteration-1.json` for timing and cost data

### Problem: Run keeps failing on GitHub operations

**Check:**
1. GitHubMode setting in harness config
2. GitHub token permissions
3. Rate limit status

**Resolution:**
- Use `githubMode: 'best_effort'` to continue without PR
- Use `githubMode: 'disabled'` for local-only development

### Problem: Runs timing out

**Check:**
1. `maxWallClockSeconds` in limits
2. Agent complexity vs task
3. Network issues

**Resolution:**
- Increase timeout in limits
- Enable retry with `retryOnTimeout: true`
- Check agent logs in `agent-*.json`

### Problem: Queue not processing

**Check:**
1. `maxConcurrent` setting
2. Currently running work orders
3. Queue stats via API

**Resolution:**
- Increase `maxConcurrent` if server can handle it
- Cancel stuck work orders
- Check orchestrator logs for errors

---

## Appendix G: Migration Checklist

### Pre-Migration

- [ ] Backup existing run data
- [ ] Note current harness profiles
- [ ] Document any custom configurations

### During Migration

- [ ] Update dependencies
- [ ] Run database migrations (if any)
- [ ] Verify new endpoints work
- [ ] Test retry behavior

### Post-Migration

- [ ] Verify old runs still readable
- [ ] Check new diagnostic files being created
- [ ] Validate SSE streaming works
- [ ] Test queue behavior under load

### Rollback Plan

If issues arise:
1. Revert to previous version
2. Existing run data remains compatible
3. No data migration required for rollback

---

## Appendix H: Glossary

| Term | Definition |
|------|------------|
| **AgentResult** | Full output from agent execution including stdout, stderr, tool calls |
| **BuildError** | Structured error with classification and context |
| **Iteration** | Single cycle of agent execution + verification |
| **LoopDecision** | Strategy output indicating whether to continue |
| **PersistedAgentResult** | AgentResult saved to disk with metadata |
| **RetryPolicy** | Configuration for retry behavior |
| **Snapshot** | Git state captured for rollback |
| **VerificationReport** | Results from L0-L3 verification checks |
| **WorkOrderQueue** | Priority queue for pending work orders |
| **WorkspaceManager** | Facade for all workspace operations |

---

## Appendix I: Dependencies

### New Dependencies

```json
{
  "dependencies": {
    // No new runtime dependencies required
  },
  "devDependencies": {
    // Test utilities (already present)
    "vitest": "^1.0.0"
  }
}
```

### Peer Dependencies

- Node.js 18+ (EventEmitter, fs/promises)
- TypeScript 5+ (template literal types)
