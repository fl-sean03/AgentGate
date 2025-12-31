# DevGuide v0.2.5: Implementation

This document contains detailed thrust specifications for implementing run analytics and metrics collection.

---

## Thrust 1: Metrics Types Foundation

### 1.1 Objective

Define the core metrics types and Zod schemas that will be used throughout the metrics system.

### 1.2 Background

AgentGate uses Zod for runtime validation of all persisted data. The metrics types need to cover phase timing, token usage, code changes, and verification results at both iteration and run levels.

### 1.3 Subtasks

#### 1.3.1 Create Metrics Type Definitions

Create `src/types/metrics.ts` with Zod schemas for:

**Phase Metrics:**
- `Phase` - Union type: 'build' | 'snapshot' | 'verify' | 'feedback'
- `PhaseMetricsSchema` - Schema for individual phase timing (phase, startedAt, completedAt, durationMs)

**Level Metrics:**
- `LevelMetricsSchema` - Schema for verification level results (level, passed, durationMs, checksRun, checksPassed)

**Iteration Metrics:**
- `IterationMetricsSchema` - Full iteration metrics including:
  - iteration number and runId
  - Array of phase metrics
  - Agent token usage (input/output, nullable)
  - Agent exit code and duration
  - Code change stats (filesChanged, insertions, deletions)
  - Verification results (passed, duration, level metrics)
  - Timestamps (startedAt, completedAt)

**Run Metrics:**
- `RunMetricsSchema` - Aggregated run metrics including:
  - runId and workOrderId
  - Summary (totalDurationMs, iterationCount, successful/failed counts, result)
  - Phase totals (sum of all phases across iterations)
  - Token totals
  - Code change totals (cumulative across iterations)
  - Final verification state
  - Timestamps (startedAt, completedAt, collectedAt)

#### 1.3.2 Export Types from Index

Update `src/types/index.ts` to export all new metrics types and schemas.

### 1.4 Verification Steps

1. `pnpm typecheck` passes with new types
2. `pnpm lint` shows no errors in new files
3. Can import metrics types from `src/types`
4. Zod schemas validate sample data correctly

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/types/metrics.ts` | Created |
| `src/types/index.ts` | Modified - Export metrics types |

---

## Thrust 2: Phase Timing Collection

### 2.1 Objective

Add infrastructure to collect timing for each phase (build, snapshot, verify, feedback) within the run executor.

### 2.2 Background

The RunExecutor orchestrates the phases but doesn't currently track how long each takes. We need to add start/end timing without changing the existing execution logic.

### 2.3 Subtasks

#### 2.3.1 Create Metrics Collector

Create `src/metrics/collector.ts` with a `MetricsCollector` class:

**Constructor:**
- Takes runId
- Initializes empty iteration tracking map

**Phase Tracking Methods:**
- `startPhase(phase: Phase): void` - Records start timestamp
- `endPhase(phase: Phase): void` - Records end timestamp, computes duration
- `getCurrentPhaseDuration(phase: Phase): number | null` - Get duration for active phase

**Iteration Lifecycle:**
- `startIteration(iteration: number): void` - Initialize tracking for new iteration
- `endIteration(iteration: number): void` - Finalize iteration metrics
- `getIterationMetrics(iteration: number): IterationMetrics | null`

**State Accessors:**
- `getCurrentIteration(): number`
- `getPhaseMetrics(iteration: number): PhaseMetrics[]`

#### 2.3.2 Extend RunExecutorOptions

In `src/orchestrator/run-executor.ts`, add optional callbacks:

- `onPhaseStart?: (phase: Phase, iteration: number) => void`
- `onPhaseEnd?: (phase: Phase, iteration: number) => void`

These should be called at the appropriate points in the execution flow:
- Before calling `onBuild()`: emit 'build' start
- After `onBuild()` returns: emit 'build' end
- Same pattern for snapshot, verify, feedback phases

#### 2.3.3 Create Metrics Module Index

Create `src/metrics/index.ts` that exports:
- `MetricsCollector` class
- All types from metrics types

### 2.4 Verification Steps

1. `pnpm typecheck` passes
2. Can create MetricsCollector instance
3. Phase timing records correctly (manual test with setTimeout)
4. Callbacks fire at correct points in execution
5. All existing tests pass (no regression)

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/metrics/collector.ts` | Created |
| `src/metrics/index.ts` | Created |
| `src/orchestrator/run-executor.ts` | Modified - Add phase callbacks |

---

## Thrust 3: Token Usage Persistence

### 3.1 Objective

Capture agent token usage from AgentResult and persist it as part of iteration metrics.

### 3.2 Background

The AgentResult already contains `tokensUsed: TokenUsage | null` with input/output counts. However, this is not currently persisted - it's available during execution but lost afterward. We need to capture and store it.

### 3.3 Subtasks

#### 3.3.1 Add Agent Result Recording

Extend `MetricsCollector` with:

- `recordAgentResult(result: AgentResult): void`
  - Extracts token usage (input, output)
  - Stores exit code
  - Stores agent duration (durationMs from result)

Ensure this is called after the build phase completes, using the AgentResult.

#### 3.3.2 Wire Agent Result to Collector

In `src/orchestrator/orchestrator.ts`, after the build phase:

1. Get the AgentResult from the onBuild callback return
2. Pass it to the metrics collector via a new callback: `onAgentResult`

Add to RunExecutorOptions:
- `onAgentResult?: (result: AgentResult, iteration: number) => void`

Update orchestrator to wire this callback to the collector.

### 3.4 Verification Steps

1. `pnpm typecheck` passes
2. Token usage recorded correctly in collector
3. Exit code and duration captured
4. Null handled gracefully (agents may not report tokens)
5. All existing tests pass

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/metrics/collector.ts` | Modified - Add agent result recording |
| `src/orchestrator/run-executor.ts` | Modified - Add onAgentResult callback |
| `src/orchestrator/orchestrator.ts` | Modified - Wire agent result callback |

---

## Thrust 4: Metrics Storage & Retrieval

### 4.1 Objective

Create the storage layer to persist and load metrics from the artifact directory structure.

### 4.2 Background

Metrics should be stored alongside other run artifacts. We'll create a `metrics/` subdirectory within each run's artifact folder, with iteration metrics in numbered files and run metrics in a summary file.

### 4.3 Subtasks

#### 4.3.1 Add Metrics Paths

In `src/artifacts/paths.ts`, add functions:

- `getMetricsDir(runId: string): string` - Returns path to metrics directory
- `getIterationMetricsPath(runId: string, iteration: number): string` - Path to specific iteration
- `getRunMetricsPath(runId: string): string` - Path to aggregated run metrics

Directory structure:
```
~/.agentgate/runs/{runId}/
├── metrics/
│   ├── run-metrics.json
│   └── iterations/
│       ├── 1.json
│       ├── 2.json
│       └── ...
```

#### 4.3.2 Create Storage Module

Create `src/metrics/storage.ts` with:

**Save Functions:**
- `saveIterationMetrics(metrics: IterationMetrics): Promise<void>`
  - Creates metrics directory if needed
  - Writes to iteration file with Zod validation
- `saveRunMetrics(metrics: RunMetrics): Promise<void>`
  - Writes aggregated metrics to run-metrics.json

**Load Functions:**
- `loadIterationMetrics(runId: string, iteration: number): Promise<IterationMetrics | null>`
  - Returns null if file doesn't exist
  - Validates with Zod schema
- `loadRunMetrics(runId: string): Promise<RunMetrics | null>`
  - Returns null if file doesn't exist
- `getAllIterationMetrics(runId: string): Promise<IterationMetrics[]>`
  - Reads all iteration files, returns sorted array

**Helper Functions:**
- `metricsExist(runId: string): Promise<boolean>`
  - Check if run-metrics.json exists

#### 4.3.3 Update Metrics Exports

Export storage functions from `src/metrics/index.ts`.

### 4.4 Verification Steps

1. `pnpm typecheck` passes
2. Can save and load iteration metrics
3. Can save and load run metrics
4. Directory structure created correctly
5. Invalid data rejected by Zod validation
6. Missing files return null (not throw)

### 4.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/artifacts/paths.ts` | Modified - Add metrics paths |
| `src/metrics/storage.ts` | Created |
| `src/metrics/index.ts` | Modified - Export storage functions |

---

## Thrust 5: Run Summary Generation

### 5.1 Objective

Implement aggregation logic to combine iteration metrics into a run summary, including code change and verification tracking.

### 5.2 Background

After all iterations complete, we need to aggregate the data into a single RunMetrics object. This includes:
- Summing phase durations
- Totaling token usage
- Computing success/fail counts
- Capturing final verification state

### 5.3 Subtasks

#### 5.3.1 Add Snapshot and Verification Recording

Extend `MetricsCollector` with:

- `recordSnapshot(snapshot: Snapshot): void`
  - Stores filesChanged, insertions, deletions for current iteration
- `recordVerification(report: VerificationReport): void`
  - Stores passed status and level results for current iteration

#### 5.3.2 Create Aggregator Module

Create `src/metrics/aggregator.ts` with:

- `aggregateRunMetrics(iterations: IterationMetrics[], run: Run): RunMetrics`
  - Takes all iteration metrics and run state
  - Computes phase totals by summing across iterations
  - Computes token totals
  - Computes code change totals
  - Determines result based on run state
  - Sets final verification info from last iteration

#### 5.3.3 Wire Collector to Orchestrator

In `src/orchestrator/orchestrator.ts`:

1. Add callbacks for snapshot and verification:
   - `onSnapshotCaptured?: (snapshot: Snapshot, iteration: number) => void`
   - `onVerificationComplete?: (report: VerificationReport, iteration: number) => void`

2. After run completes:
   - Get all iteration metrics from collector
   - Aggregate into run metrics
   - Save to storage

#### 5.3.4 Save Iteration Metrics After Each Iteration

In the iteration callback in orchestrator:
- After each iteration ends, save iteration metrics via storage module
- This ensures data is persisted even if run fails partway through

### 5.4 Verification Steps

1. `pnpm typecheck` passes
2. Aggregation correctly sums durations
3. Token totals match sum of iterations
4. Code change totals are cumulative
5. Final verification captured correctly
6. Metrics persisted after each iteration

### 5.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/metrics/collector.ts` | Modified - Add snapshot/verification recording |
| `src/metrics/aggregator.ts` | Created |
| `src/orchestrator/orchestrator.ts` | Modified - Wire all callbacks, save metrics |
| `src/orchestrator/run-executor.ts` | Modified - Add snapshot/verification callbacks |
| `src/metrics/index.ts` | Modified - Export aggregator |

---

## Thrust 6: CLI Integration

### 6.1 Objective

Add the `metrics` command to the CLI for viewing run analytics.

### 6.2 Background

Users need an easy way to view metrics for completed runs. The CLI should support multiple output formats (human-readable, detailed, JSON).

### 6.3 Subtasks

#### 6.3.1 Create Metrics Command

Create `src/control-plane/commands/metrics.ts`:

**Command:** `agentgate metrics <run-id>`

**Options:**
- `--detailed` / `-d` - Show per-iteration breakdown
- `--json` / `-j` - Output as JSON
- `--iteration <n>` / `-i <n>` - Show specific iteration only

**Implementation:**
1. Load run metrics from storage
2. If `--json`, output JSON and exit
3. If `--iteration`, load specific iteration metrics
4. Format and display based on options

**Error Handling:**
- Run not found: "Run not found: {runId}"
- Metrics not found: "No metrics available for run: {runId}. Run may still be in progress."

#### 6.3.2 Create Metrics Formatter

Create `src/control-plane/formatters/metrics-formatter.ts`:

**Functions:**
- `formatRunMetricsSummary(metrics: RunMetrics): string`
  - Status, duration, iterations
  - Phase breakdown with bar chart
  - Token usage
  - Code changes

- `formatRunMetricsDetailed(metrics: RunMetrics, iterations: IterationMetrics[]): string`
  - Summary plus per-iteration breakdown
  - Each iteration shows: duration, phases, tokens, changes, verification

- `formatIterationMetrics(metrics: IterationMetrics): string`
  - Detailed view of single iteration

**Helpers:**
- `formatDuration(ms: number): string` - "4m 32s" format
- `formatTokenCount(n: number): string` - "45,231" format
- `formatPercentBar(percent: number, width: number): string` - Unicode bar chart

#### 6.3.3 Register Command in CLI

In `src/control-plane/cli.ts`:

1. Import metrics command
2. Add to program commands
3. Add help text

### 6.4 Verification Steps

1. `agentgate metrics --help` shows options
2. `agentgate metrics <valid-run-id>` shows summary
3. `agentgate metrics <valid-run-id> --detailed` shows iterations
4. `agentgate metrics <valid-run-id> --json` outputs valid JSON
5. `agentgate metrics <invalid-run-id>` shows error
6. Duration formatting is human-readable
7. Token counts are comma-formatted

### 6.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/control-plane/commands/metrics.ts` | Created |
| `src/control-plane/formatters/metrics-formatter.ts` | Created |
| `src/control-plane/cli.ts` | Modified - Register metrics command |

---

## Thrust 7: Testing & Validation

### 7.1 Objective

Add comprehensive tests for the metrics system and ensure all validation passes.

### 7.2 Background

The metrics system touches multiple modules (collector, storage, aggregator, CLI). Each needs unit tests, and we need integration tests for the full flow.

### 7.3 Subtasks

#### 7.3.1 Create Metrics Collector Tests

Create `test/metrics-collector.test.ts`:

- Test phase timing accuracy
- Test iteration lifecycle
- Test agent result recording
- Test snapshot recording
- Test verification recording
- Test getIterationMetrics returns correct data
- Test concurrent phase tracking (edge cases)

#### 7.3.2 Create Metrics Storage Tests

Create `test/metrics-storage.test.ts`:

- Test saveIterationMetrics creates directory and file
- Test loadIterationMetrics reads correctly
- Test loadIterationMetrics returns null for missing
- Test saveRunMetrics writes correctly
- Test loadRunMetrics reads and validates
- Test getAllIterationMetrics returns sorted array
- Test validation rejects invalid data

#### 7.3.3 Create Metrics Aggregator Tests

Create `test/metrics-aggregator.test.ts`:

- Test aggregation with single iteration
- Test aggregation with multiple iterations
- Test phase duration summing
- Test token usage summing
- Test code change accumulation
- Test final verification capture
- Test handling of null token usage

#### 7.3.4 Create Metrics Formatter Tests

Create `test/metrics-formatter.test.ts`:

- Test formatDuration with various ms values
- Test formatTokenCount with large numbers
- Test formatPercentBar renders correctly
- Test summary output contains expected sections
- Test detailed output includes all iterations
- Test JSON output is valid

#### 7.3.5 Update Package Version

Update `package.json` version to `0.2.5`.

#### 7.3.6 Run Full Validation

Execute:
```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All must pass with 0 errors.

### 7.4 Verification Steps

1. All new tests pass
2. `pnpm typecheck` - 0 errors
3. `pnpm lint` - 0 errors
4. `pnpm test` - All pass
5. `pnpm build` - Successful
6. Coverage increased
7. CLI works with built version

### 7.5 Files Created/Modified

| File | Action |
|------|--------|
| `test/metrics-collector.test.ts` | Created |
| `test/metrics-storage.test.ts` | Created |
| `test/metrics-aggregator.test.ts` | Created |
| `test/metrics-formatter.test.ts` | Created |
| `package.json` | Modified - Update version to 0.2.5 |

---

## Thrust Execution Order

```
Thrust 1 ─────► Thrust 2 ─────► Thrust 3 ─────► Thrust 4 ─────► Thrust 5 ─────► Thrust 6 ─────► Thrust 7
(Types)        (Collector)     (Token)         (Storage)       (Aggregator)    (CLI)          (Testing)
```

Each thrust builds on the previous. Do not skip ahead.

---

## Final Validation Checklist

After all thrusts complete:

- [ ] `pnpm typecheck` - 0 errors
- [ ] `pnpm lint` - 0 errors
- [ ] `pnpm test` - All pass
- [ ] `pnpm build` - Successful
- [ ] CLI metrics command works
- [ ] Metrics persist correctly
- [ ] Can view metrics for past runs
- [ ] JSON export works
- [ ] Detailed view works
- [ ] Package version is 0.2.5
