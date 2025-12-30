# Module H: Artifact Store

## Purpose

Persist all run artifacts in a predictable, auditable layout. The artifact store enables reproducibility and debugging.

---

## Thrust 28: Directory Layout

### 28.1 Objective

Define and implement the artifact storage structure.

### 28.2 Background

All AgentGate data lives under `~/.agentgate/`:
- Deterministic paths for all artifacts
- Easy to inspect manually
- Easy to back up
- No database required

### 28.3 Subtasks

#### 28.3.1 Define Directory Structure

```
~/.agentgate/
├── config.yaml                    # Global configuration
├── workspaces/                    # Workspace metadata
│   └── {workspace-id}.json
├── work-orders/                   # Work order records
│   └── {work-order-id}.json
├── runs/                          # Run artifacts
│   └── {run-id}/
│       ├── run.json              # Run metadata
│       ├── work-order.json       # Snapshot of work order
│       ├── gate-plan.json        # Resolved gate plan
│       ├── iterations/
│       │   └── {n}/
│       │       ├── iteration.json    # Iteration metadata
│       │       ├── agent-logs.txt    # Claude Code output
│       │       ├── snapshot.json     # Snapshot metadata
│       │       ├── patch.diff        # Changes diff
│       │       ├── verification/
│       │       │   ├── report.json   # Verification report
│       │       │   ├── l0-logs.txt   # Contract check logs
│       │       │   ├── l1-logs.txt   # Test logs
│       │       │   ├── l2-logs.txt   # Black-box logs
│       │       │   └── l3-logs.txt   # Sanity logs
│       │       └── feedback.json     # Structured feedback (if failed)
│       └── summary.json          # Final run summary
├── leases/                        # Active leases
│   └── {lease-id}.json
├── snapshots/                     # Snapshot index (optional)
│   └── {sha}.json
└── tmp/                           # Temporary files
    └── clean-room-{id}/
```

#### 28.3.2 Create Path Generator

Create `src/artifacts/paths.ts`:

Functions:
- `getAgentGateRoot(): string` - Get ~/.agentgate
- `getWorkspacePath(id: string): string` - Workspace metadata path
- `getWorkOrderPath(id: string): string` - Work order path
- `getRunDir(runId: string): string` - Run directory
- `getIterationDir(runId: string, n: number): string` - Iteration directory
- `getAgentLogsPath(runId: string, n: number): string` - Agent logs path
- `getPatchPath(runId: string, n: number): string` - Patch file path
- `getVerificationDir(runId: string, n: number): string` - Verification logs dir
- `getReportPath(runId: string, n: number): string` - Verification report path
- `getFeedbackPath(runId: string, n: number): string` - Feedback path

#### 28.3.3 Ensure Directory Existence

Create utility to ensure directories exist:
- `ensureDir(path: string): Promise<void>` - Create if not exists
- `ensureRunStructure(runId: string): Promise<void>` - Create full run structure
- `ensureIterationStructure(runId: string, n: number): Promise<void>` - Create iteration structure

### 28.4 Verification Steps

1. Path generator returns correct paths
2. Directories created on first access
3. Structure matches specification
4. Paths are absolute and valid

### 28.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/artifacts/paths.ts` | Created |

---

## Thrust 29: Artifact Store Implementation

### 29.1 Objective

Implement the artifact storage service.

### 29.2 Subtasks

#### 29.2.1 Create Artifact Store

Create `src/artifacts/store.ts`:

The store provides:
- `saveRunMetadata(run: Run): Promise<void>` - Save run record
- `saveIterationMetadata(runId: string, n: number, data: IterationData): Promise<void>`
- `saveAgentLogs(runId: string, n: number, logs: string): Promise<void>`
- `savePatch(runId: string, n: number, patch: string): Promise<void>`
- `saveVerificationReport(runId: string, n: number, report: VerificationReport): Promise<void>`
- `saveVerificationLogs(runId: string, n: number, level: string, logs: string): Promise<void>`
- `saveFeedback(runId: string, n: number, feedback: StructuredFeedback): Promise<void>`
- `saveGatePlan(runId: string, plan: GatePlan): Promise<void>`
- `saveRunSummary(runId: string, summary: RunSummary): Promise<void>`

#### 29.2.2 Implement Load Functions

Read functions:
- `loadRunMetadata(runId: string): Promise<Run | null>`
- `loadIterationMetadata(runId: string, n: number): Promise<IterationData | null>`
- `loadAgentLogs(runId: string, n: number): Promise<string | null>`
- `loadPatch(runId: string, n: number): Promise<string | null>`
- `loadVerificationReport(runId: string, n: number): Promise<VerificationReport | null>`
- `loadFeedback(runId: string, n: number): Promise<StructuredFeedback | null>`
- `loadGatePlan(runId: string): Promise<GatePlan | null>`
- `loadRunSummary(runId: string): Promise<RunSummary | null>`

#### 29.2.3 Implement List Functions

Query functions:
- `listRuns(): Promise<RunSummary[]>` - List all runs
- `listRunsByWorkOrder(workOrderId: string): Promise<RunSummary[]>` - Filter by work order
- `listIterations(runId: string): Promise<number[]>` - List iteration numbers
- `getLatestIteration(runId: string): Promise<number>` - Get highest iteration

#### 29.2.4 Implement JSON Serialization

Consistent JSON handling:
- Use 2-space indentation for readability
- Include timestamps in ISO format
- Handle BigInt if needed
- Pretty-print for human inspection

Create `src/artifacts/json.ts`:
- `writeJson(path: string, data: unknown): Promise<void>`
- `readJson<T>(path: string): Promise<T | null>`
- `appendLog(path: string, entry: string): Promise<void>`

### 29.3 Verification Steps

1. Save run metadata - file created with correct content
2. Load run metadata - returns saved data
3. List runs - returns all run summaries
4. JSON files are pretty-printed
5. Missing file returns null

### 29.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/artifacts/store.ts` | Created |
| `agentgate/src/artifacts/json.ts` | Created |
| `agentgate/src/artifacts/index.ts` | Created |

---

## Thrust 30: Run Summary Generation

### 30.1 Objective

Generate comprehensive run summaries for reporting.

### 30.2 Subtasks

#### 30.2.1 Define Run Summary Structure

`RunSummary` structure:
- `runId`: string
- `workOrderId`: string
- `taskPrompt`: string (first 200 chars)
- `workspacePath`: string
- `status`: 'succeeded' | 'failed' | 'canceled'
- `iterations`: number
- `duration`: number (total ms)
- `finalSnapshotSha`: string | null
- `verificationPassed`: boolean
- `startedAt`: Date
- `completedAt`: Date
- `artifactsPath`: string

#### 30.2.2 Implement Summary Generator

Create `src/artifacts/summary.ts`:

Function `generateRunSummary(run: Run): RunSummary`:
1. Aggregate data from all iterations
2. Calculate total duration
3. Determine final status
4. Include artifact location

#### 30.2.3 Generate Human-Readable Report

Function `formatRunReport(summary: RunSummary): string`:

Template:
```
AgentGate Run Report
====================

Run ID: {runId}
Work Order: {workOrderId}
Status: {status}

Task:
{taskPrompt}

Workspace: {workspacePath}
Duration: {duration}
Iterations: {iterations}

Final Snapshot: {finalSnapshotSha}
Verification: {verificationPassed ? 'PASSED' : 'FAILED'}

Started: {startedAt}
Completed: {completedAt}

Artifacts: {artifactsPath}
```

### 30.3 Verification Steps

1. Summary captures all relevant data
2. Human report is readable
3. Duration calculated correctly
4. Status reflects actual outcome

### 30.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/artifacts/summary.ts` | Created |
| `agentgate/src/types/summary.ts` | Created |

---

## Thrust 31: Artifact Cleanup

### 31.1 Objective

Implement cleanup for old artifacts and temporary files.

### 31.2 Subtasks

#### 31.2.1 Create Cleanup Service

Create `src/artifacts/cleanup.ts`:

Functions:
- `cleanupOldRuns(maxAge: number): Promise<CleanupResult>` - Remove old runs
- `cleanupTempFiles(): Promise<CleanupResult>` - Remove stale temps
- `cleanupOrphanedLeases(): Promise<CleanupResult>` - Remove stale leases
- `getStorageUsage(): Promise<StorageUsage>` - Report disk usage

#### 31.2.2 Implement Retention Policy

Configurable retention:
- `maxRunAge`: number (days, default 30)
- `maxRunCount`: number (default 100)
- `keepFailedRuns`: boolean (default true)
- `keepSucceededRuns`: boolean (default true)

Cleanup logic:
1. List all runs
2. Filter by age and count
3. Respect keep settings
4. Delete eligible runs
5. Report what was deleted

#### 31.2.3 Implement Safe Deletion

Before deleting:
- Verify path is within ~/.agentgate
- Never delete workspaces directory
- Log all deletions
- Support dry-run mode

### 31.3 Verification Steps

1. Old runs cleaned up based on policy
2. Temp files removed
3. Safe deletion prevents accidents
4. Storage usage accurate
5. Dry-run mode works

### 31.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/artifacts/cleanup.ts` | Created |

---

## Module H Complete Checklist

- [ ] Directory structure defined
- [ ] Path generator implemented
- [ ] Directory creation working
- [ ] Artifact store save functions
- [ ] Artifact store load functions
- [ ] Artifact store list functions
- [ ] JSON serialization consistent
- [ ] Run summary generation
- [ ] Human-readable reports
- [ ] Cleanup service implemented
- [ ] Retention policy configurable
- [ ] Safe deletion verified
- [ ] Unit tests passing

---

## Next Steps

Proceed to [10-integration.md](./10-integration.md) for full system integration.
