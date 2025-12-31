# DevGuide v0.2.5: Run Analytics & Metrics

**Status**: IN PROGRESS
**Created**: 2025-12-30
**Target**: Comprehensive observability for AgentGate runs

---

## Executive Summary

This DevGuide implements run analytics and metrics collection for AgentGate. Users will be able to retrieve detailed performance data for any completed run, enabling:

- **Performance Analysis** - Understand how long each phase takes
- **Cost Tracking** - Token usage per run and iteration
- **Success Patterns** - Identify what makes runs succeed or fail
- **Debugging** - Detailed timing to pinpoint bottlenecks
- **Reporting** - Generate run summaries for stakeholders

**No external dependencies required** - Metrics stored alongside run artifacts.

---

## Success Criteria

1. Can retrieve comprehensive metrics for any completed run via CLI
2. Per-phase timing captured (build, snapshot, verify, feedback)
3. Agent token usage persisted per iteration
4. Workspace statistics tracked (files changed, insertions/deletions)
5. Aggregated run summary with key metrics
6. New `agentgate metrics <run-id>` command works
7. All existing tests continue to pass
8. New metrics tests pass
9. `pnpm typecheck && pnpm lint && pnpm test` all green

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage Format | JSON | Consistent with existing artifact storage |
| Metrics Location | Per-run artifact directory | Co-located with related data |
| Collection Point | RunExecutor callbacks | Minimal code changes, clean separation |
| API Style | Functions not classes | Match existing codebase patterns |
| Aggregation | On-demand | No background processing, compute when requested |

---

## Thrust Summary

| # | Thrust | Description | Files | Status |
|---|--------|-------------|-------|--------|
| 1 | Metrics Types Foundation | Define metrics types and schemas | 2 | Pending |
| 2 | Phase Timing Collection | Add per-phase timing to run executor | 3 | Pending |
| 3 | Token Usage Persistence | Capture and store agent token usage | 2 | Pending |
| 4 | Metrics Storage & Retrieval | Save and load metrics from artifacts | 2 | Pending |
| 5 | Run Summary Generation | Aggregate metrics into summary | 2 | Pending |
| 6 | CLI Integration | Add metrics command and display | 3 | Pending |
| 7 | Testing & Validation | Comprehensive tests for all metrics | 2 | Pending |

---

## Metrics Overview

### Run-Level Metrics

```
RunMetrics {
  runId
  workOrderId
  totalDurationMs           // Total wall clock time
  iterationCount            // How many iterations ran
  successfulIterations      // Iterations that passed verification
  failedIterations          // Iterations that failed verification

  // Aggregated phase timings (across all iterations)
  totalBuildDurationMs
  totalSnapshotDurationMs
  totalVerifyDurationMs
  totalFeedbackDurationMs

  // Token usage totals
  totalTokensInput
  totalTokensOutput

  // Code change statistics
  totalFilesChanged
  totalInsertions
  totalDeletions

  // Verification summary
  finalVerificationPassed
  levelsPassedOnFinal       // e.g., ['L0', 'L1', 'L2', 'L3']

  // Timestamps
  collectedAt
}
```

### Per-Iteration Metrics

```
IterationMetrics {
  iteration

  // Phase timings (ms)
  buildDurationMs
  snapshotDurationMs
  verifyDurationMs
  feedbackDurationMs
  totalDurationMs

  // Agent execution
  agentTokensInput
  agentTokensOutput
  agentExitCode

  // Code changes
  filesChanged
  insertions
  deletions

  // Verification
  verificationPassed
  verificationLevelResults  // Per-level pass/fail

  // Timestamps
  startedAt
  completedAt
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      RunExecutor                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  onBuild() ──────────► buildDurationMs              │    │
│  │  onSnapshot() ───────► snapshotDurationMs           │    │
│  │  onVerify() ─────────► verifyDurationMs             │    │
│  │  onFeedback() ───────► feedbackDurationMs           │    │
│  │  AgentResult ────────► tokenUsage                   │    │
│  │  Snapshot ───────────► filesChanged, insertions     │    │
│  │  VerificationReport ─► levelResults, passed         │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                  │
│                            ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │            MetricsCollector                          │    │
│  │  - recordPhaseStart(phase)                          │    │
│  │  - recordPhaseEnd(phase)                            │    │
│  │  - recordAgentResult(result)                        │    │
│  │  - recordSnapshot(snapshot)                         │    │
│  │  - recordVerification(report)                       │    │
│  │  - getIterationMetrics()                            │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Metrics Storage                           │
│  ~/.agentgate/runs/{runId}/                                  │
│  ├── metrics/                                                │
│  │   ├── run-metrics.json        # Aggregated metrics       │
│  │   └── iterations/                                         │
│  │       ├── 1.json              # Per-iteration metrics    │
│  │       ├── 2.json                                          │
│  │       └── ...                                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    CLI Display                               │
│  $ agentgate metrics <run-id>                               │
│                                                              │
│  Run Metrics: run-abc123                                     │
│  ────────────────────────────────────────────────────────   │
│  Duration: 4m 32s                                            │
│  Iterations: 3 (2 failed, 1 passed)                          │
│  Result: PASSED                                              │
│                                                              │
│  Phase Breakdown:                                            │
│    Build:     2m 15s (49.6%)                                 │
│    Snapshot:  12s    (4.4%)                                  │
│    Verify:    1m 52s (41.2%)                                 │
│    Feedback:  23s    (8.4%)                                  │
│                                                              │
│  Token Usage:                                                │
│    Input:  45,231 tokens                                     │
│    Output: 12,847 tokens                                     │
│    Total:  58,078 tokens                                     │
│                                                              │
│  Code Changes:                                               │
│    Files: 8 changed                                          │
│    Lines: +342, -127                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Navigation

- [01-overview.md](./01-overview.md) - Architecture and design decisions
- [02-implementation.md](./02-implementation.md) - Thrust specifications
- [03-appendices.md](./03-appendices.md) - Checklists and file references

---

## Quick Reference

### CLI Usage
```bash
# View metrics for a run
agentgate metrics <run-id>

# View with iteration details
agentgate metrics <run-id> --detailed

# Export as JSON
agentgate metrics <run-id> --json
```

### Programmatic Access
```typescript
import { getRunMetrics, getIterationMetrics } from './src/metrics';

const metrics = await getRunMetrics('run-abc123');
console.log(`Total duration: ${metrics.totalDurationMs}ms`);
console.log(`Tokens used: ${metrics.totalTokensInput + metrics.totalTokensOutput}`);
```

---

## Version Information

- **Previous**: v0.2.4 (GitHub-Backed Workspaces)
- **Current**: v0.2.5 (Run Analytics & Metrics)
- **Package Version**: 0.2.5
