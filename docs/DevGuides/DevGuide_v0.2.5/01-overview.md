# DevGuide v0.2.5: Overview

## Current State Analysis

### Existing Observability

The current AgentGate system tracks basic run information:

1. **Run State** (`src/types/run.ts`):
   - State machine transitions (queued → building → verifying → succeeded/failed)
   - Iteration count (current/max)
   - Start/completion timestamps
   - Git SHA before/after
   - Error messages

2. **Per-Iteration** (`src/types/run.ts` - IterationData):
   - Duration (ms) - but only total, not per-phase
   - State at start
   - Snapshot ID
   - Verification pass/fail
   - Feedback generation flag

3. **Verification Reports** (`src/types/verification.ts`):
   - Per-level durations
   - Check/test results
   - Detailed logs

4. **Agent Results** (`src/types/agent.ts`):
   - Token usage (input/output) - **but NOT persisted**
   - Exit code and stdout/stderr
   - Execution duration

5. **Snapshots** (`src/types/snapshot.ts`):
   - File change counts
   - Insertions/deletions

### Problems with Current Approach

| Problem | Impact |
|---------|--------|
| Token usage not persisted | Can't analyze cost after run completes |
| No per-phase timing | Can't identify phase bottlenecks |
| No aggregated metrics | Must manually compute from scattered data |
| No CLI for metrics | No easy way to view run performance |
| Data scattered | Metrics spread across multiple JSON files |

---

## Target Architecture

### Metrics-First Design

**Core Principle**: Every measurable event during a run should be captured and persisted.

```
                    ┌───────────────────────┐
                    │   Metrics Collector   │
                    │   (In-Memory)         │
                    └───────────┬───────────┘
                                │ records events
            ┌───────────────────┼───────────────────┐
            │                   │                   │
            ▼                   ▼                   ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
    │ Phase Timing  │   │ Token Usage   │   │ Code Changes  │
    │   Events      │   │   Events      │   │   Events      │
    └───────────────┘   └───────────────┘   └───────────────┘
            │                   │                   │
            └───────────────────┼───────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │  Metrics Aggregator   │
                    │  (Computes summaries) │
                    └───────────┬───────────┘
                                │
                    ┌───────────┴───────────┐
                    │   Metrics Storage     │
                    │   (JSON artifacts)    │
                    └───────────────────────┘
```

### Metrics Layers

**Layer 1: Event Collection** (during execution)
- Phase start/end timestamps
- Agent token counts
- Code change stats
- Verification results

**Layer 2: Iteration Aggregation** (after each iteration)
- Compute iteration totals
- Persist to iteration metrics file

**Layer 3: Run Aggregation** (after run completes)
- Sum across all iterations
- Compute percentages and averages
- Persist to run metrics file

---

## Design Decisions

### 1. Where to Collect Metrics?

| Approach | Pros | Cons |
|----------|------|------|
| Inside each module | Direct access to data | Scattered, hard to test |
| **RunExecutor callbacks** | Centralized, clean | Requires callback wiring |
| Separate observer | Decoupled | Complex event system needed |

**Decision**: Use RunExecutor's existing callback pattern. Add new optional callbacks for metrics collection. This keeps the core execution logic unchanged while enabling metrics.

### 2. How to Store Metrics?

| Approach | Pros | Cons |
|----------|------|------|
| Embedded in Run JSON | Single file | Bloats run data |
| **Separate metrics files** | Clean separation | More files |
| SQLite database | Query capability | New dependency |

**Decision**: Store in separate `metrics/` directory within run artifacts. Clean separation, no new dependencies, consistent with existing patterns.

### 3. When to Compute Aggregates?

| Approach | Pros | Cons |
|----------|------|------|
| During execution | Always up-to-date | Adds overhead |
| **On completion** | No overhead during run | Must wait for completion |
| On-demand | Lazy computation | Slower reads |

**Decision**: Compute and persist aggregates when run completes. For in-progress runs, compute on-demand from iteration data.

### 4. What Level of Detail?

| Approach | Pros | Cons |
|----------|------|------|
| Summary only | Compact | Limited insight |
| **Full detail** | Complete picture | More storage |
| Configurable | Flexible | Complex |

**Decision**: Capture full detail. Storage is cheap, insight is valuable. Can always add summarization later.

---

## Module Design

### New Files

```
src/
├── metrics/
│   ├── index.ts              # Public exports
│   ├── types.ts              # Metrics type definitions
│   ├── collector.ts          # In-memory metrics collection
│   ├── storage.ts            # Persistence to artifacts
│   └── aggregator.ts         # Compute summaries
├── types/
│   └── metrics.ts            # Zod schemas for metrics
└── control-plane/
    └── commands/
        └── metrics.ts        # CLI command
```

### Modified Files

```
src/
├── orchestrator/
│   ├── orchestrator.ts       # Wire up metrics collection
│   └── run-executor.ts       # Add phase timing hooks
├── control-plane/
│   └── cli.ts                # Register metrics command
└── artifacts/
    └── paths.ts              # Add metrics path functions
```

### Type Definitions

```typescript
// src/types/metrics.ts

export interface PhaseMetrics {
  phase: 'build' | 'snapshot' | 'verify' | 'feedback';
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}

export interface IterationMetrics {
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

export interface LevelMetrics {
  level: 'L0' | 'L1' | 'L2' | 'L3';
  passed: boolean;
  durationMs: number;
  checksRun: number;
  checksPassed: number;
}

export interface RunMetrics {
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

  // Code changes (cumulative)
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

### Collector API

```typescript
// src/metrics/collector.ts

export class MetricsCollector {
  constructor(runId: string)

  // Phase tracking
  startPhase(phase: Phase): void
  endPhase(phase: Phase): void

  // Data recording
  recordAgentResult(result: AgentResult): void
  recordSnapshot(snapshot: Snapshot): void
  recordVerification(report: VerificationReport): void

  // Iteration lifecycle
  startIteration(iteration: number): void
  endIteration(iteration: number): void

  // Export
  getIterationMetrics(iteration: number): IterationMetrics
  getRunMetrics(): RunMetrics
}
```

### Storage API

```typescript
// src/metrics/storage.ts

// Paths
export function getMetricsDir(runId: string): string
export function getIterationMetricsPath(runId: string, iteration: number): string
export function getRunMetricsPath(runId: string): string

// Save/load
export async function saveIterationMetrics(metrics: IterationMetrics): Promise<void>
export async function loadIterationMetrics(runId: string, iteration: number): Promise<IterationMetrics | null>
export async function saveRunMetrics(metrics: RunMetrics): Promise<void>
export async function loadRunMetrics(runId: string): Promise<RunMetrics | null>

// Query
export async function getAllIterationMetrics(runId: string): Promise<IterationMetrics[]>
```

---

## CLI Design

### Command: `agentgate metrics <run-id>`

**Default Output** (summary):
```
Run Metrics: run-abc123
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Status:     PASSED
Duration:   4m 32s
Iterations: 3 (2 failed → 1 passed)

Phase Breakdown:
  Build:      2m 15s  ████████████████░░░░  49.6%
  Snapshot:   12s     ██░░░░░░░░░░░░░░░░░░   4.4%
  Verify:     1m 52s  ███████████████░░░░░  41.2%
  Feedback:   23s     ████░░░░░░░░░░░░░░░░   8.4%

Token Usage:
  Input:   45,231 tokens
  Output:  12,847 tokens
  Total:   58,078 tokens

Code Changes:
  Files:   8 changed
  Lines:   +342, -127
```

**Detailed Output** (`--detailed`):
```
Run Metrics: run-abc123 (Detailed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[... summary above ...]

Iteration 1 of 3 (FAILED)
─────────────────────────
  Duration:   1m 45s
  Build:      52s
  Snapshot:   4s
  Verify:     42s
  Feedback:   7s
  Tokens:     18,421 in / 4,832 out
  Changes:    5 files, +210 / -45
  Failed at:  L1 (Tests)

Iteration 2 of 3 (FAILED)
─────────────────────────
  Duration:   1m 12s
  Build:      38s
  Snapshot:   3s
  Verify:     28s
  Feedback:   8s
  Tokens:     12,103 in / 3,891 out
  Changes:    2 files, +52 / -18
  Failed at:  L2 (Blackbox)

Iteration 3 of 3 (PASSED)
─────────────────────────
  Duration:   1m 35s
  Build:      45s
  Snapshot:   5s
  Verify:     42s
  Feedback:   N/A
  Tokens:     14,707 in / 4,124 out
  Changes:    1 file, +80 / -64
  Passed:     L0 ✓  L1 ✓  L2 ✓  L3 ✓
```

**JSON Output** (`--json`):
```json
{
  "runId": "run-abc123",
  "totalDurationMs": 272000,
  "iterationCount": 3,
  ...
}
```

---

## Integration Points

### RunExecutor Integration

The RunExecutor already has callback patterns. We'll add optional metrics hooks:

```typescript
// Extended RunExecutorOptions
export interface RunExecutorOptions {
  // ... existing options ...

  // New metrics callbacks
  onPhaseStart?: (phase: Phase, iteration: number) => void;
  onPhaseEnd?: (phase: Phase, iteration: number) => void;
  onMetricsReady?: (metrics: IterationMetrics) => void;
}
```

### Orchestrator Integration

The Orchestrator will create a MetricsCollector and wire it to the RunExecutor:

```typescript
// In Orchestrator.execute()
const collector = new MetricsCollector(run.id);

const result = await executeRun({
  ...options,
  onPhaseStart: (phase, iter) => collector.startPhase(phase),
  onPhaseEnd: (phase, iter) => collector.endPhase(phase),
  // ... more hooks
});

// Save metrics after run
await saveRunMetrics(collector.getRunMetrics());
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| TypeScript errors | 0 |
| ESLint errors | 0 |
| Test pass rate | 100% |
| New tests added | 15+ |
| Phase timing accuracy | ±10ms |
| Token count accuracy | Exact match |
