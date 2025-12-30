# Module E: Snapshotter

## Purpose

Capture immutable build outputs with before/after identity and diffs. The snapshotter provides the foundation for reproducible verification.

---

## Thrust 15: Snapshot Capture

### 15.1 Objective

Implement git-based snapshot capture with full identity tracking.

### 15.2 Background

Snapshots are the immutable output of the BUILD phase. For MVP, we use git SHAs as snapshot identity:
- Simple and well-understood
- Built-in diffing
- No additional storage needed
- Replayable by anyone with the repo

### 15.3 Subtasks

#### 15.3.1 Create Snapshotter Service

Create `src/snapshot/snapshotter.ts`:

The service provides:
- `captureBeforeState(workspace: Workspace): Promise<BeforeState>` - Record baseline
- `captureAfterState(workspace: Workspace, before: BeforeState): Promise<Snapshot>` - Freeze after BUILD
- `getSnapshot(id: string): Promise<Snapshot | null>` - Retrieve snapshot
- `generatePatch(snapshot: Snapshot): Promise<string>` - Generate unified diff

`BeforeState` structure:
- `sha`: string - Git SHA before changes
- `branch`: string - Current branch name
- `isDirty`: boolean - Had uncommitted changes
- `capturedAt`: Date

`Snapshot` structure:
- `id`: string (afterSha)
- `runId`: string
- `iteration`: number
- `beforeSha`: string
- `afterSha`: string
- `branch`: string
- `commitMessage`: string
- `patchPath`: string | null
- `filesChanged`: number
- `insertions`: number
- `deletions`: number
- `createdAt`: Date

#### 15.3.2 Implement Before State Capture

Function `captureBeforeState`:
1. Get current branch name
2. Check for uncommitted changes
3. If dirty, create a stash or WIP commit
4. Record current SHA
5. Return BeforeState

Handling dirty state:
- Option 1: Stash changes (can restore later)
- Option 2: Create WIP commit (cleaner for diff)
- MVP: Create WIP commit with message "[agentgate] WIP before run"

#### 15.3.3 Implement After State Capture

Function `captureAfterState`:
1. Stage all changes (`git add -A`)
2. Check if there are changes to commit
3. If changes exist, create commit with structured message
4. Record after SHA
5. Generate diff stats
6. Create Snapshot record

Commit message format:
```
[agentgate] Run {runId} iteration {n}

Task: {taskPrompt (first 100 chars)}
Gate: {gatePlanSource}
```

#### 15.3.4 Implement Patch Generation

Function `generatePatch`:
1. Use `git diff before..after` to generate unified diff
2. Store patch in artifacts directory
3. Return path to patch file

Patch file naming: `{runId}/iteration-{n}/patch.diff`

### 15.4 Verification Steps

1. Capture before state - returns SHA and branch
2. Make changes and capture after - creates commit
3. Generate patch - produces valid unified diff
4. No changes after BUILD - after SHA equals before SHA
5. Dirty workspace handled - WIP commit created

### 15.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/snapshot/snapshotter.ts` | Created |
| `agentgate/src/snapshot/index.ts` | Created |
| `agentgate/src/types/snapshot.ts` | Modified |

---

## Thrust 16: Git Snapshot Operations

### 16.1 Objective

Implement low-level git operations for snapshot management.

### 16.2 Subtasks

#### 16.2.1 Create Git Snapshot Module

Create `src/snapshot/git-snapshot.ts`:

Functions:
- `createSnapshotCommit(path: string, message: string): Promise<string>` - Create commit
- `getCommitInfo(path: string, sha: string): Promise<CommitInfo>` - Get commit details
- `getDiffStats(path: string, from: string, to: string): Promise<DiffStats>` - Get change stats
- `generateUnifiedDiff(path: string, from: string, to: string): Promise<string>` - Full diff
- `cherryPick(path: string, sha: string): Promise<void>` - Apply snapshot to branch

`CommitInfo` structure:
- `sha`: string
- `message`: string
- `author`: string
- `date`: Date
- `parents`: string[]

`DiffStats` structure:
- `filesChanged`: number
- `insertions`: number
- `deletions`: number
- `files`: FileChange[]

`FileChange` structure:
- `path`: string
- `status`: 'added' | 'modified' | 'deleted' | 'renamed'
- `insertions`: number
- `deletions`: number

#### 16.2.2 Implement Diff Stat Extraction

Parse `git diff --stat` output to extract:
- Number of files changed
- Lines added/removed
- Per-file changes

Handle edge cases:
- Binary files (show as "binary")
- Renamed files (show old → new path)
- Large diffs (truncate display, keep full data)

#### 16.2.3 Handle Git Edge Cases

Implement robust error handling:
- Uninitialized repo → initialize automatically
- Detached HEAD → create temporary branch
- Merge conflicts → abort and report error
- Empty commits → skip commit, log warning

### 16.3 Verification Steps

1. Create snapshot commit - returns valid SHA
2. Get commit info - returns all fields correctly
3. Get diff stats - accurate counts
4. Unified diff - valid patch format
5. Edge cases handled gracefully

### 16.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/snapshot/git-snapshot.ts` | Created |

---

## Thrust 17: Snapshot Storage and Retrieval

### 17.1 Objective

Implement snapshot metadata storage and retrieval.

### 17.2 Subtasks

#### 17.2.1 Create Snapshot Store

Create `src/snapshot/snapshot-store.ts`:

Storage at `~/.agentgate/snapshots/`:
- `{snapshot-id}.json` - Snapshot metadata
- Patches stored in run artifacts (cross-referenced)

Functions:
- `save(snapshot: Snapshot): Promise<void>`
- `load(id: string): Promise<Snapshot | null>`
- `loadByRun(runId: string): Promise<Snapshot[]>`
- `delete(id: string): Promise<void>`

#### 17.2.2 Implement Snapshot Validation

Before saving, validate snapshot:
- SHA exists in repo
- Before SHA is ancestor of after SHA
- Patch file exists (if referenced)
- Run ID references valid run

#### 17.2.3 Link Snapshots to Runs

Update run records to reference snapshots:
- Run stores `snapshotIds: string[]` (one per iteration)
- Query snapshots by run for audit trail

### 17.3 Verification Steps

1. Save snapshot - persists to filesystem
2. Load snapshot - returns correct data
3. Load by run - returns all iterations
4. Invalid snapshot - validation error
5. Persistence survives restart

### 17.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/snapshot/snapshot-store.ts` | Created |
| `agentgate/src/types/run.ts` | Modified |

---

## Module E Complete Checklist

- [ ] Snapshotter service created
- [ ] Before state capture working
- [ ] After state capture with commit
- [ ] Patch generation working
- [ ] Git snapshot operations complete
- [ ] Diff stats extraction accurate
- [ ] Edge cases handled
- [ ] Snapshot store implemented
- [ ] Snapshot validation working
- [ ] Run-snapshot linking complete
- [ ] Unit tests passing

---

## Next Steps

Proceed to [07-verifier.md](./07-verifier.md) for Module F implementation.
