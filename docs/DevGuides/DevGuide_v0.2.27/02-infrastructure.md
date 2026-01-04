# 02: Critical Infrastructure Thrusts

These five thrusts form the foundation for all other improvements. They must be completed sequentially as each builds on the previous.

---

## Thrust 1: Write-Ahead State Persistence

### 1.1 Objective

Implement a write-ahead log (WAL) system that ensures run state is never lost, even during crashes.

### 1.2 Background

Currently, state transitions happen in memory and are persisted to JSON files after the fact. If a crash occurs between transition and persistence, the state is lost. This is unacceptable for dog fooding because:

- A run modifying AgentGate code could crash mid-iteration
- On restart, the run appears stuck in an old state
- Manual intervention required to recover

The solution is to write intent to a WAL before executing, then execute, then mark the WAL entry as complete. On startup, replay any incomplete WAL entries.

### 1.3 Subtasks

#### 1.3.1 Create WAL Types and Schema

Create a new file `src/orchestrator/wal.ts` with:

- `WALEntry` interface containing: id, timestamp, runId, previousState, targetState, event, metadata
- `WALStatus` enum: PENDING, APPLIED, ROLLED_BACK
- Schema for WAL entry serialization

The WAL should be append-only with entries marked complete rather than deleted.

#### 1.3.2 Implement WAL Writer

In `src/orchestrator/wal.ts`, implement:

- `createWALEntry(runId, previousState, targetState, event)` - Creates and persists WAL entry, returns entry ID
- `markWALComplete(entryId)` - Marks entry as successfully applied
- `markWALRolledBack(entryId)` - Marks entry as rolled back
- WAL file location: `~/.agentgate/wal/<runId>.wal.jsonl`

Use JSONL format (one JSON object per line) for append efficiency.

#### 1.3.3 Implement WAL Recovery

Create recovery mechanism:

- `getPendingWALEntries()` - Returns all entries with PENDING status
- `recoverFromWAL()` - Called on startup, processes pending entries
- Recovery logic: For each pending entry, either complete the transition or roll back

Recovery should be idempotent - running it twice produces the same result.

#### 1.3.4 Integrate WAL with State Machine

Modify `src/orchestrator/state-machine.ts`:

- Before `applyTransition`, write WAL entry
- After successful state file write, mark WAL complete
- Export new function `applyTransitionWithWAL(run, event)` that handles the full sequence

The existing `applyTransition` remains for unit testing but production code uses the WAL version.

#### 1.3.5 Integrate WAL with Orchestrator

Modify `src/orchestrator/orchestrator.ts`:

- Import and use `applyTransitionWithWAL` for all state transitions
- Add recovery call during orchestrator initialization
- Add WAL cleanup for old completed entries (configurable retention, default 7 days)

#### 1.3.6 Add WAL Configuration

Add to `src/config/index.ts`:

- `wal.enabled` - Boolean to enable/disable WAL (default: true)
- `wal.directory` - WAL storage location
- `wal.retentionDays` - How long to keep completed entries
- `wal.maxEntries` - Maximum entries per run before compaction

### 1.4 Verification Steps

1. Start the server, submit a work order, wait for BUILDING state
2. Kill the server process with SIGKILL (simulating crash)
3. Restart the server
4. Verify the run continues from BUILDING state (not stuck in LEASED)
5. Run `pnpm test` - all tests pass
6. Check WAL files exist in configured directory

### 1.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/orchestrator/wal.ts` | Created | WAL implementation |
| `src/orchestrator/wal.test.ts` | Created | WAL unit tests |
| `src/orchestrator/state-machine.ts` | Modified | Add WAL integration |
| `src/orchestrator/orchestrator.ts` | Modified | Use WAL transitions, add recovery |
| `src/config/index.ts` | Modified | Add WAL configuration |
| `src/types/config.ts` | Modified | Add WAL config types |

---

## Thrust 2: AbortSignal-Based Timeout System

### 2.1 Objective

Replace setTimeout-based timeouts with cooperative AbortSignal cancellation to eliminate race conditions and enable clean resource cleanup.

### 2.2 Background

The current timeout implementation uses `setTimeout` with Promise.race, which has race conditions:

- Timeout and completion can fire simultaneously
- `clearTimeout` is called after promise resolution
- No way to cancel in-progress operations

AbortSignal provides cooperative cancellation that propagates through the entire call chain.

### 2.3 Subtasks

#### 2.3.1 Create Timeout Utilities

Create `src/utils/timeout.ts` with:

- `createTimeout(ms)` - Returns `{ signal: AbortSignal, cancel: () => void }`
- `withTimeout<T>(promise, ms, message?)` - Wraps promise with timeout
- `checkAborted(signal)` - Throws if signal is aborted
- `sleep(ms, signal?)` - Abortable sleep

These utilities should be the standard way to handle timeouts throughout the codebase.

#### 2.3.2 Update Sandbox Execution

Modify `src/sandbox/docker-provider.ts` and `src/sandbox/subprocess-provider.ts`:

- All `execute` methods accept optional `signal: AbortSignal`
- On signal abort, terminate the running process/container
- Return partial output collected before abort
- Clean up resources in abort path

#### 2.3.3 Update Execution Manager

Modify `src/queue/execution-manager.ts`:

- Replace `runWithTimeout` with AbortSignal-based version
- Create AbortController for each execution
- Pass signal to sandbox execute
- On timeout, abort the controller
- Wait for cleanup to complete before resolving

#### 2.3.4 Update Agent Drivers

Modify all agent drivers (`src/agent/*.ts`):

- Accept `signal: AbortSignal` in execute method
- Pass signal to sandbox execution
- Check signal periodically during long operations
- Clean exit when aborted

#### 2.3.5 Update Verification Runner

Modify `src/verifier/runner.ts`:

- Accept signal for verification execution
- Pass signal to each verification level
- Abort remaining levels if signal fires
- Report partial results on abort

#### 2.3.6 Add Timeout Configuration

Extend timeout configuration:

- Per-phase timeouts (build, snapshot, verify)
- Overall run timeout
- Graceful vs hard timeout (warn, then kill)

### 2.4 Verification Steps

1. Submit a work order with a 30-second timeout
2. Ensure the agent task takes longer than 30 seconds
3. Verify execution is aborted after 30 seconds
4. Verify sandbox container/process is terminated
5. Verify run transitions to FAILED with timeout error
6. Run `pnpm test` - all tests pass

### 2.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/utils/timeout.ts` | Created | Timeout utilities |
| `src/utils/timeout.test.ts` | Created | Timeout unit tests |
| `src/sandbox/docker-provider.ts` | Modified | Add signal support |
| `src/sandbox/subprocess-provider.ts` | Modified | Add signal support |
| `src/queue/execution-manager.ts` | Modified | Use AbortSignal |
| `src/agent/claude-code-driver.ts` | Modified | Add signal support |
| `src/agent/claude-code-subscription-driver.ts` | Modified | Add signal support |
| `src/verifier/runner.ts` | Modified | Add signal support |

---

## Thrust 3: Atomic Graceful Shutdown

### 3.1 Objective

Implement a graceful shutdown sequence that ensures all in-flight work is completed or safely terminated before the process exits.

### 3.2 Background

Current shutdown calls `process.exit(0)` even if cleanup fails. This leaves:

- Agent processes still running
- Work orders stuck in RUNNING state
- Containers not cleaned up
- File handles not closed

### 3.3 Subtasks

#### 3.3.1 Create Shutdown Manager

Create `src/control-plane/shutdown-manager.ts`:

- Singleton that manages shutdown sequence
- `register(name, handler, priority)` - Register cleanup handler
- `initiateShutdown(signal)` - Start shutdown sequence
- `forceShutdown()` - Kill everything immediately
- Handlers called in priority order (higher first)

Shutdown phases:
1. Stop accepting new work (immediate)
2. Complete in-flight requests (30s timeout)
3. Interrupt running agents gracefully (30s timeout)
4. Force kill remaining processes (immediate)
5. Persist final state (5s timeout)
6. Close file handles and connections (5s timeout)

#### 3.3.2 Register Orchestrator Shutdown

Modify `src/orchestrator/orchestrator.ts`:

- Register shutdown handler with priority 100
- On shutdown: stop accepting work orders
- Mark running work orders as INTERRUPTED (new state)
- Wait for verification to complete or abort it
- Persist final state via WAL

#### 3.3.3 Register Sandbox Cleanup

Modify `src/sandbox/manager.ts`:

- Register shutdown handler with priority 90
- Force terminate all active sandboxes
- Log any cleanup failures
- Don't block shutdown on cleanup failures

#### 3.3.4 Register Process Manager Cleanup

Modify `src/control-plane/agent-process-manager.ts`:

- Register shutdown handler with priority 95
- Send SIGTERM to all managed processes
- Wait up to 10 seconds for graceful exit
- Send SIGKILL to remaining processes

#### 3.3.5 Update Server Shutdown

Modify `src/control-plane/commands/serve.ts`:

- Replace direct `process.exit` with shutdown manager
- Register server close handler
- Add shutdown timeout (configurable, default 60s)
- Exit with code 1 if shutdown times out

#### 3.3.6 Add INTERRUPTED State

Modify `src/orchestrator/state-machine.ts`:

- Add INTERRUPTED state (non-terminal, can resume)
- Add transitions: RUNNING → INTERRUPTED, VERIFYING → INTERRUPTED
- Add transition: INTERRUPTED → QUEUED (for resume)

### 3.4 Verification Steps

1. Submit a work order that runs for 2+ minutes
2. Wait for BUILDING state
3. Send SIGTERM to the server
4. Verify agent process receives SIGTERM
5. Verify run state is INTERRUPTED (not RUNNING)
6. Verify server exits cleanly (not crash)
7. Restart server, verify run can be resumed
8. Run `pnpm test` - all tests pass

### 3.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/control-plane/shutdown-manager.ts` | Created | Shutdown orchestration |
| `src/control-plane/shutdown-manager.test.ts` | Created | Shutdown tests |
| `src/orchestrator/orchestrator.ts` | Modified | Register shutdown |
| `src/orchestrator/state-machine.ts` | Modified | Add INTERRUPTED state |
| `src/sandbox/manager.ts` | Modified | Register shutdown |
| `src/control-plane/agent-process-manager.ts` | Modified | Register shutdown |
| `src/control-plane/commands/serve.ts` | Modified | Use shutdown manager |
| `src/types/run.ts` | Modified | Add INTERRUPTED state |

---

## Thrust 4: Guaranteed Sandbox Cleanup

### 4.1 Objective

Ensure sandbox resources (containers, processes) are always cleaned up, even after crashes, with automatic orphan detection and recovery.

### 4.2 Background

Current cleanup has issues:

- Cleanup errors are swallowed
- No retry mechanism
- Orphans from previous crashes remain
- Resource tracking is in-memory only

### 4.3 Subtasks

#### 4.3.1 Create Sandbox Registry

Create `src/sandbox/registry.ts`:

- Persistent tracking of active sandboxes
- Schema: sandboxId, type, containerId/pid, runId, createdAt, status
- Storage: `~/.agentgate/sandbox-registry.json`
- `register(sandbox)` - Add new sandbox
- `markTerminated(sandboxId)` - Mark as terminated
- `getOrphans()` - Return sandboxes with stale heartbeats
- `heartbeat(sandboxId)` - Update last-seen time

#### 4.3.2 Implement Cleanup with Retries

Modify `src/sandbox/manager.ts`:

- Cleanup with exponential backoff (3 attempts: 0s, 5s, 15s)
- On final failure, log error with sandbox details for manual cleanup
- Track cleanup failures in registry for observability

#### 4.3.3 Implement Orphan Detection

Create `src/sandbox/orphan-detector.ts`:

- On startup, scan registry for orphans
- Orphan criteria: no heartbeat for 5 minutes AND process/container still exists
- Attempt cleanup of each orphan
- Log results (success/failure counts)

#### 4.3.4 Integrate Registry with Providers

Modify `src/sandbox/docker-provider.ts` and `src/sandbox/subprocess-provider.ts`:

- Register sandbox on creation
- Send heartbeat during execution
- Mark terminated on cleanup
- Provide orphan cleanup method

#### 4.3.5 Add Startup Recovery

Modify `src/sandbox/manager.ts`:

- Call orphan detector on initialization
- Make startup non-blocking (cleanup runs in background)
- Report orphan count in health check

#### 4.3.6 Add Force Cleanup Command

Add CLI command `agentgate cleanup`:

- `--dry-run` - Show what would be cleaned
- `--force` - Clean even if processes appear active
- `--type docker|subprocess|all` - Filter by sandbox type
- Output cleanup results

### 4.4 Verification Steps

1. Start a work order with Docker sandbox
2. Kill the server with SIGKILL (simulating crash)
3. Verify container is still running: `docker ps`
4. Restart the server
5. Wait 30 seconds for startup cleanup
6. Verify container was cleaned up: `docker ps` shows no orphan
7. Verify registry shows sandbox as terminated
8. Run `agentgate cleanup --dry-run` - no orphans shown
9. Run `pnpm test` - all tests pass

### 4.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/sandbox/registry.ts` | Created | Persistent sandbox tracking |
| `src/sandbox/registry.test.ts` | Created | Registry unit tests |
| `src/sandbox/orphan-detector.ts` | Created | Orphan detection and cleanup |
| `src/sandbox/orphan-detector.test.ts` | Created | Orphan detector tests |
| `src/sandbox/manager.ts` | Modified | Integrate registry, add retries |
| `src/sandbox/docker-provider.ts` | Modified | Register/heartbeat/cleanup |
| `src/sandbox/subprocess-provider.ts` | Modified | Register/heartbeat/cleanup |
| `src/control-plane/commands/cleanup.ts` | Created | Cleanup CLI command |

---

## Thrust 5: Merge Conflict Detection

### 5.1 Objective

Detect and handle Git merge conflicts before push, providing actionable feedback when conflicts occur.

### 5.2 Background

Current push operations assume the remote hasn't changed. When another commit exists on the branch (from concurrent work or manual commits), the push fails without helpful feedback.

### 5.3 Subtasks

#### 5.3.1 Create Conflict Detection

Create `src/delivery/conflict-detector.ts`:

- `checkForConflicts(repoPath, remoteBranch)` - Returns conflict info
- Performs `git fetch` then compares heads
- Detects: behind, ahead, diverged
- If diverged, attempts merge --no-commit to detect conflicts
- Returns: status, conflicting files, suggested resolution

#### 5.3.2 Implement Conflict Resolution Strategies

Add resolution strategies:

- `REBASE` - Attempt automatic rebase
- `MERGE` - Attempt automatic merge
- `REPORT` - Don't resolve, just report
- `FAIL` - Immediately fail on conflict

Default strategy should be configurable per harness profile.

#### 5.3.3 Integrate with Git Handler

Modify `src/delivery/git-handler.ts`:

- Before push, check for conflicts
- Apply configured resolution strategy
- If automatic resolution fails, generate conflict feedback
- Include conflict details in push result

#### 5.3.4 Create Conflict Feedback

Add structured feedback for conflicts:

- Which files conflict
- Our changes vs their changes (abbreviated)
- Suggested resolution steps
- Whether automatic rebase could help

This feedback should be suitable for the agent to understand and potentially resolve.

#### 5.3.5 Add Conflict Tests

Create tests for:

- Push to clean branch (success)
- Push when behind (auto-merge possible)
- Push when diverged (conflict)
- Rebase resolution success
- Conflict with binary files (special case)

#### 5.3.6 Update Harness Configuration

Add to harness profile schema:

- `gitOps.conflictStrategy` - REBASE | MERGE | REPORT | FAIL
- `gitOps.autoRebase` - Boolean shorthand for REBASE
- `gitOps.maxRebaseAttempts` - Limit rebase retries

### 5.4 Verification Steps

1. Create a test repository with main branch
2. Clone twice to different directories
3. Make conflicting changes in both clones
4. Push from first clone (success)
5. Attempt push from second clone via AgentGate
6. Verify conflict is detected before push
7. Verify conflict feedback contains file names and diff snippets
8. If strategy is REBASE, verify automatic resolution attempted
9. Run `pnpm test` - all tests pass

### 5.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/delivery/conflict-detector.ts` | Created | Conflict detection logic |
| `src/delivery/conflict-detector.test.ts` | Created | Conflict detection tests |
| `src/delivery/git-handler.ts` | Modified | Integrate conflict detection |
| `src/types/harness-config.ts` | Modified | Add conflict config |
| `src/feedback/conflict-formatter.ts` | Created | Format conflict feedback |
| `test/delivery/conflict-scenarios.test.ts` | Created | Integration tests |

---

## Phase 1 Completion Checklist

- [ ] Thrust 1: WAL implementation complete, tests passing
- [ ] Thrust 2: AbortSignal integration complete, timeouts work correctly
- [ ] Thrust 3: Graceful shutdown tested with SIGTERM
- [ ] Thrust 4: Orphan cleanup verified after crash
- [ ] Thrust 5: Conflict detection tested with diverged branches
- [ ] All existing tests still pass
- [ ] No new lint warnings
- [ ] Manual verification of crash recovery

---

**Next**: [03-robustness.md](./03-robustness.md) - Error Handling & Recovery Thrusts
