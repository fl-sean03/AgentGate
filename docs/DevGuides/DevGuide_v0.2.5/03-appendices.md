# DevGuide v0.2.5: Appendices

## A. Complete File Reference

### New Files

| File | Purpose | Thrust |
|------|---------|--------|
| `src/types/metrics.ts` | Metrics type definitions and Zod schemas | 1 |
| `src/metrics/index.ts` | Metrics module exports | 2 |
| `src/metrics/collector.ts` | In-memory metrics collection | 2 |
| `src/metrics/storage.ts` | Metrics persistence | 4 |
| `src/metrics/aggregator.ts` | Run summary computation | 5 |
| `src/control-plane/commands/metrics.ts` | CLI metrics command | 6 |
| `src/control-plane/formatters/metrics-formatter.ts` | Metrics display formatting | 6 |
| `test/metrics-collector.test.ts` | Collector tests | 7 |
| `test/metrics-storage.test.ts` | Storage tests | 7 |
| `test/metrics-aggregator.test.ts` | Aggregator tests | 7 |
| `test/metrics-formatter.test.ts` | Formatter tests | 7 |

### Modified Files

| File | Changes | Thrust |
|------|---------|--------|
| `src/types/index.ts` | Export metrics types | 1 |
| `src/orchestrator/run-executor.ts` | Add phase/result callbacks | 2, 3, 5 |
| `src/orchestrator/orchestrator.ts` | Wire metrics collection | 3, 5 |
| `src/artifacts/paths.ts` | Add metrics path functions | 4 |
| `src/control-plane/cli.ts` | Register metrics command | 6 |
| `package.json` | Version 0.2.5 | 7 |

---

## B. Type Reference

### Phase (Union Type)
```typescript
type Phase = 'build' | 'snapshot' | 'verify' | 'feedback';
```

### PhaseMetrics
```typescript
interface PhaseMetrics {
  phase: Phase;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}
```

### LevelMetrics
```typescript
interface LevelMetrics {
  level: 'L0' | 'L1' | 'L2' | 'L3';
  passed: boolean;
  durationMs: number;
  checksRun: number;
  checksPassed: number;
}
```

### IterationMetrics
```typescript
interface IterationMetrics {
  iteration: number;
  runId: string;

  // Phase timings
  phases: PhaseMetrics[];
  totalDurationMs: number;

  // Agent execution
  agentTokensInput: number | null;
  agentTokensOutput: number | null;
  agentExitCode: number | null;
  agentDurationMs: number | null;

  // Code changes
  filesChanged: number;
  insertions: number;
  deletions: number;

  // Verification
  verificationPassed: boolean;
  verificationDurationMs: number;
  verificationLevels: LevelMetrics[];

  // Timestamps
  startedAt: Date;
  completedAt: Date;
}
```

### RunMetrics
```typescript
interface RunMetrics {
  runId: string;
  workOrderId: string;

  // Summary
  totalDurationMs: number;
  iterationCount: number;
  successfulIterations: number;
  failedIterations: number;
  result: 'passed' | 'failed' | 'canceled' | 'error';

  // Phase totals
  totalBuildDurationMs: number;
  totalSnapshotDurationMs: number;
  totalVerifyDurationMs: number;
  totalFeedbackDurationMs: number;

  // Token usage
  totalTokensInput: number;
  totalTokensOutput: number;

  // Code changes
  totalFilesChanged: number;
  totalInsertions: number;
  totalDeletions: number;

  // Verification
  finalVerificationPassed: boolean;
  finalVerificationLevels: LevelMetrics[];

  // Timestamps
  startedAt: Date;
  completedAt: Date;
  collectedAt: Date;
}
```

---

## C. Function Reference

### Metrics Collector (src/metrics/collector.ts)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `constructor` | `runId: string` | - | Initialize collector |
| `startPhase` | `phase: Phase` | `void` | Record phase start |
| `endPhase` | `phase: Phase` | `void` | Record phase end |
| `recordAgentResult` | `result: AgentResult` | `void` | Capture token usage |
| `recordSnapshot` | `snapshot: Snapshot` | `void` | Capture code changes |
| `recordVerification` | `report: VerificationReport` | `void` | Capture verification |
| `startIteration` | `iteration: number` | `void` | Begin iteration tracking |
| `endIteration` | `iteration: number` | `void` | Finalize iteration |
| `getIterationMetrics` | `iteration: number` | `IterationMetrics \| null` | Get iteration data |
| `getAllIterationMetrics` | - | `IterationMetrics[]` | Get all iterations |

### Metrics Storage (src/metrics/storage.ts)

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `saveIterationMetrics` | `metrics: IterationMetrics` | `Promise<void>` | Save iteration |
| `loadIterationMetrics` | `runId, iteration` | `Promise<IterationMetrics \| null>` | Load iteration |
| `saveRunMetrics` | `metrics: RunMetrics` | `Promise<void>` | Save run summary |
| `loadRunMetrics` | `runId: string` | `Promise<RunMetrics \| null>` | Load run summary |
| `getAllIterationMetrics` | `runId: string` | `Promise<IterationMetrics[]>` | Load all iterations |
| `metricsExist` | `runId: string` | `Promise<boolean>` | Check if metrics exist |

### Metrics Aggregator (src/metrics/aggregator.ts)

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `aggregateRunMetrics` | `iterations, run` | `RunMetrics` | Compute summary |

### Artifacts Paths (src/artifacts/paths.ts) - New Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `getMetricsDir` | `runId: string` | `string` | Metrics directory path |
| `getIterationMetricsPath` | `runId, iteration` | `string` | Iteration file path |
| `getRunMetricsPath` | `runId: string` | `string` | Run metrics path |

---

## D. CLI Command Reference

### Metrics Command

```bash
# View metrics summary
agentgate metrics <run-id>

# View detailed per-iteration breakdown
agentgate metrics <run-id> --detailed
agentgate metrics <run-id> -d

# Output as JSON
agentgate metrics <run-id> --json
agentgate metrics <run-id> -j

# View specific iteration
agentgate metrics <run-id> --iteration 2
agentgate metrics <run-id> -i 2

# Combine options
agentgate metrics <run-id> -d -j  # Detailed JSON
```

---

## E. Artifact Directory Structure

After v0.2.5, the run artifact structure includes:

```
~/.agentgate/runs/{runId}/
├── run.json                    # Run state
├── work-order.json             # Work order
├── gate-plan.json              # Gate plan
├── summary.json                # Run summary
├── metrics/                    # NEW: Metrics directory
│   ├── run-metrics.json        # Aggregated run metrics
│   └── iterations/
│       ├── 1.json              # Iteration 1 metrics
│       ├── 2.json              # Iteration 2 metrics
│       └── ...
└── iterations/                 # Existing iteration data
    └── {iteration}/
        ├── iteration.json
        ├── snapshot.json
        ├── agent-logs.txt
        ├── feedback.json
        └── verification/
            └── report.json
```

---

## F. Metrics Data Examples

### Iteration Metrics (metrics/iterations/1.json)
```json
{
  "iteration": 1,
  "runId": "run-abc123",
  "phases": [
    {
      "phase": "build",
      "startedAt": "2025-12-30T10:00:00.000Z",
      "completedAt": "2025-12-30T10:00:52.000Z",
      "durationMs": 52000
    },
    {
      "phase": "snapshot",
      "startedAt": "2025-12-30T10:00:52.000Z",
      "completedAt": "2025-12-30T10:00:56.000Z",
      "durationMs": 4000
    },
    {
      "phase": "verify",
      "startedAt": "2025-12-30T10:00:56.000Z",
      "completedAt": "2025-12-30T10:01:38.000Z",
      "durationMs": 42000
    },
    {
      "phase": "feedback",
      "startedAt": "2025-12-30T10:01:38.000Z",
      "completedAt": "2025-12-30T10:01:45.000Z",
      "durationMs": 7000
    }
  ],
  "totalDurationMs": 105000,
  "agentTokensInput": 18421,
  "agentTokensOutput": 4832,
  "agentExitCode": 0,
  "agentDurationMs": 48000,
  "filesChanged": 5,
  "insertions": 210,
  "deletions": 45,
  "verificationPassed": false,
  "verificationDurationMs": 42000,
  "verificationLevels": [
    {"level": "L0", "passed": true, "durationMs": 2000, "checksRun": 4, "checksPassed": 4},
    {"level": "L1", "passed": false, "durationMs": 38000, "checksRun": 12, "checksPassed": 8},
    {"level": "L2", "passed": false, "durationMs": 0, "checksRun": 0, "checksPassed": 0},
    {"level": "L3", "passed": false, "durationMs": 0, "checksRun": 0, "checksPassed": 0}
  ],
  "startedAt": "2025-12-30T10:00:00.000Z",
  "completedAt": "2025-12-30T10:01:45.000Z"
}
```

### Run Metrics (metrics/run-metrics.json)
```json
{
  "runId": "run-abc123",
  "workOrderId": "wo-xyz789",
  "totalDurationMs": 272000,
  "iterationCount": 3,
  "successfulIterations": 1,
  "failedIterations": 2,
  "result": "passed",
  "totalBuildDurationMs": 135000,
  "totalSnapshotDurationMs": 12000,
  "totalVerifyDurationMs": 112000,
  "totalFeedbackDurationMs": 15000,
  "totalTokensInput": 45231,
  "totalTokensOutput": 12847,
  "totalFilesChanged": 8,
  "totalInsertions": 342,
  "totalDeletions": 127,
  "finalVerificationPassed": true,
  "finalVerificationLevels": [
    {"level": "L0", "passed": true, "durationMs": 1500, "checksRun": 4, "checksPassed": 4},
    {"level": "L1", "passed": true, "durationMs": 35000, "checksRun": 12, "checksPassed": 12},
    {"level": "L2", "passed": true, "durationMs": 4000, "checksRun": 3, "checksPassed": 3},
    {"level": "L3", "passed": true, "durationMs": 1500, "checksRun": 2, "checksPassed": 2}
  ],
  "startedAt": "2025-12-30T10:00:00.000Z",
  "completedAt": "2025-12-30T10:04:32.000Z",
  "collectedAt": "2025-12-30T10:04:33.000Z"
}
```

---

## G. Thrust Completion Checklist

### Thrust 1: Metrics Types Foundation
- [ ] PhaseMetrics schema created
- [ ] LevelMetrics schema created
- [ ] IterationMetrics schema created
- [ ] RunMetrics schema created
- [ ] Types exported from index
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes

### Thrust 2: Phase Timing Collection
- [ ] MetricsCollector class created
- [ ] startPhase/endPhase implemented
- [ ] startIteration/endIteration implemented
- [ ] getIterationMetrics implemented
- [ ] RunExecutor phase callbacks added
- [ ] `pnpm typecheck` passes
- [ ] Existing tests pass

### Thrust 3: Token Usage Persistence
- [ ] recordAgentResult implemented
- [ ] onAgentResult callback added
- [ ] Callback wired in orchestrator
- [ ] Null handling works
- [ ] `pnpm typecheck` passes

### Thrust 4: Metrics Storage & Retrieval
- [ ] Path functions added
- [ ] saveIterationMetrics implemented
- [ ] loadIterationMetrics implemented
- [ ] saveRunMetrics implemented
- [ ] loadRunMetrics implemented
- [ ] getAllIterationMetrics implemented
- [ ] Storage functions exported
- [ ] `pnpm typecheck` passes

### Thrust 5: Run Summary Generation
- [ ] recordSnapshot implemented
- [ ] recordVerification implemented
- [ ] aggregateRunMetrics implemented
- [ ] Callbacks wired in orchestrator
- [ ] Metrics saved after each iteration
- [ ] Run metrics saved on completion
- [ ] `pnpm typecheck` passes

### Thrust 6: CLI Integration
- [ ] metrics command created
- [ ] --detailed option works
- [ ] --json option works
- [ ] --iteration option works
- [ ] Error handling works
- [ ] Formatting is readable
- [ ] Command registered in CLI
- [ ] `pnpm typecheck` passes

### Thrust 7: Testing & Validation
- [ ] Collector tests pass
- [ ] Storage tests pass
- [ ] Aggregator tests pass
- [ ] Formatter tests pass
- [ ] `pnpm typecheck` - 0 errors
- [ ] `pnpm lint` - 0 errors
- [ ] `pnpm test` - All pass
- [ ] `pnpm build` - Successful
- [ ] Package version is 0.2.5

---

## H. Verification Commands

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint

# Run all tests
pnpm test

# Run specific test file
pnpm test test/metrics-collector.test.ts

# Build project
pnpm build

# Test CLI
node dist/index.js --help
node dist/index.js metrics --help

# Full validation
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

---

## I. Troubleshooting Guide

### Metrics Not Found

**Problem**: "No metrics available for run: {runId}"

**Solutions**:
1. Check if run completed - metrics are only saved after run ends
2. Check if run was started with v0.2.5+ - older runs won't have metrics
3. Verify run directory exists: `ls ~/.agentgate/runs/{runId}/metrics/`

### Invalid Metrics Data

**Problem**: "Failed to parse metrics: validation error"

**Solutions**:
1. Check if metrics files were manually edited
2. Delete corrupted files and re-run if possible
3. Check Zod validation error for specific field issues

### Missing Token Usage

**Problem**: Metrics show `null` for token counts

**Cause**: Some agent drivers don't report token usage

**Solutions**:
1. This is expected for drivers without token tracking
2. Use a driver that supports token reporting (Claude Code, Claude Agent SDK)

### Inaccurate Timings

**Problem**: Phase durations don't add up to total

**Cause**: Small gaps between phases or rounding

**Solutions**:
1. This is expected - phases may not be perfectly sequential
2. Gap time is overhead between phases
3. Check if there were long pauses in execution

---

## J. Migration Notes

### From v0.2.4 to v0.2.5

**No breaking changes** - v0.2.5 adds new functionality without changing existing behavior.

**New dependencies**: None

**New environment variables**: None

**Backward compatibility**:
- Runs from v0.2.4 will not have metrics
- `agentgate metrics` will show "No metrics available" for old runs
- All existing CLI commands work unchanged

### Metrics Backfill

Metrics cannot be retroactively generated for old runs because the timing data was not captured during execution. Only runs started with v0.2.5+ will have full metrics.

---

## K. Related Documentation

- [Run Types](../../src/types/run.ts) - Run and IterationData definitions
- [Verification Types](../../src/types/verification.ts) - VerificationReport definition
- [Agent Types](../../src/types/agent.ts) - AgentResult and TokenUsage
- [Snapshot Types](../../src/types/snapshot.ts) - Snapshot definition
- [DevGuide System](../README.md) - Overall DevGuide documentation
