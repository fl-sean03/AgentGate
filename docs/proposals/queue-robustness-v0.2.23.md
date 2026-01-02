# Queue Robustness Implementation Plan (v0.2.23)

Implementation plan to address queue management bugs and improve system robustness.

---

## Problem Summary

Discovered issues during operational testing:
1. Cannot cancel running work orders - only queued can be canceled
2. No auto-queue processing - server doesn't start queued work orders automatically
3. Stuck work orders block the queue indefinitely
4. No purge endpoint - cannot delete work order history permanently
5. Corrupted JSON files in storage
6. Run store orphans - missing run.json files
7. Missing status validation in contract tests
8. No visibility into queue health
9. Workspace source API bug - owner field ignored, repo format inconsistent

---

## Execution Strategy

Using the **wave pattern** from MultiAgentParallelism.md:
- Tasks within a wave are **parallel** (independent)
- Waves are **sequential** (Wave N depends on Wave N-1)

```
Wave 1: 8 parallel foundation tasks     ~20-30 min each
    ↓ Wait for completion, merge all
Wave 2: 2 sequential automation tasks   ~15-20 min each
    ↓ Wait for completion, merge all
Wave 3: 1 CLI utility task              ~15-20 min
```

---

## Wave 1: Foundation (8 Parallel Work Orders)

All tasks in Wave 1 are **independent** and can run in parallel.

### 1.1 Cancel Running Work Orders

**Priority:** CRITICAL
**Complexity:** Medium
**Files to modify:**
- `packages/server/src/control-plane/work-order-service.ts`
- `packages/server/src/control-plane/queue-manager.ts`
- `packages/server/src/server/routes/work-orders.ts`

**Changes:**
1. Extend `cancel()` to support running work orders
2. Add signal handling to terminate agent processes gracefully (SIGTERM first)
3. Track PIDs of running agent processes for termination
4. Update API response to indicate if process was killed

**Validation:** Cancel a running work order via API, verify it stops

---

### 1.2 Work Order Purge API

**Priority:** HIGH
**Complexity:** Low
**Files to modify:**
- `packages/server/src/control-plane/work-order-service.ts`
- `packages/server/src/control-plane/work-order-store.ts`
- `packages/server/src/server/routes/work-orders.ts`

**Changes:**
1. Add `purge(id: string)` method to work-order-store.ts
2. Add `DELETE /api/v1/work-orders/:id?purge=true` endpoint
3. Purge must first cancel if running, then delete from storage
4. Add batch purge: `DELETE /api/v1/work-orders?status=failed&purge=true`

**Validation:** Purge a work order, verify file deleted from ~/.agentgate/work-orders/

---

### 1.3 Force Kill Capability

**Priority:** CRITICAL
**Complexity:** Medium
**Files to modify:**
- `packages/server/src/control-plane/agent-process-manager.ts` (new file)
- `packages/server/src/control-plane/work-order-service.ts`
- `packages/server/src/control-plane/queue-manager.ts`

**Changes:**
1. Create AgentProcessManager to track running agent processes
2. Implement kill escalation: SIGTERM → wait 5s → SIGKILL
3. Store PID in work order metadata when starting
4. Add `POST /api/v1/work-orders/:id/kill` endpoint for force kill

**Validation:** Force kill a stuck work order, verify process terminated

---

### 1.4 Work Order Timeout Enforcement

**Priority:** HIGH
**Complexity:** Medium
**Files to modify:**
- `packages/server/src/control-plane/queue-manager.ts`
- `packages/server/src/orchestrator/run-executor.ts`

**Changes:**
1. Enforce `maxTime` configuration in queue-manager
2. Start timer when work order begins running
3. Auto-fail and kill process if timeout exceeded
4. Add `timeoutAt` field to work order for visibility

**Validation:** Submit work order with maxTime: 60, verify auto-killed after 60s

---

### 1.5 Storage Validation on Startup

**Priority:** MEDIUM
**Complexity:** Low
**Files to modify:**
- `packages/server/src/control-plane/work-order-store.ts`
- `packages/server/src/server/app.ts`

**Changes:**
1. Add `validateStorage()` method to work-order-store
2. On startup, scan all JSON files for validity
3. Move corrupted files to `~/.agentgate/work-orders/.quarantine/`
4. Log warning for each quarantined file

**Validation:** Place malformed JSON in work-orders/, verify quarantined on startup

---

### 1.6 Run Store Orphan Cleanup

**Priority:** MEDIUM
**Complexity:** Low
**Files to modify:**
- `packages/server/src/control-plane/run-store.ts`
- `packages/server/src/control-plane/work-order-store.ts`

**Changes:**
1. Add `cleanupOrphans()` method
2. Find runs referenced by work orders but missing from run store
3. Either recreate empty run record or remove reference
4. Run on startup after storage validation

**Validation:** Create work order referencing missing run, verify cleanup on startup

---

### 1.7 Queue Health Dashboard Endpoint

**Priority:** MEDIUM
**Complexity:** Low
**Files to create:**
- `packages/server/src/server/routes/queue.ts`

**Changes:**
1. Add `GET /api/v1/queue/health` endpoint returning:
   - `runningCount`: number of currently running work orders
   - `maxConcurrent`: configured limit
   - `queuedCount`: number waiting in queue
   - `oldestRunningAge`: ms since oldest running work order started
   - `stuckThreshold`: configured threshold for "stuck" detection
   - `alerts`: array of issues (stuck work orders, high queue depth, etc.)
2. Register route in app.ts

**Validation:** Call endpoint, verify correct counts returned

---

### 1.8 Fix Workspace Source API

**Priority:** HIGH
**Complexity:** Low
**Files to modify:**
- `packages/shared/src/types/api.ts`
- `packages/server/src/server/routes/work-orders.ts`

**Problem:**
The API schema accepts separate `owner` and `repo` fields, but `mapWorkspaceSource()` ignores `owner` and parses from `repo` in "owner/repo" format. This causes silent failures.

**Robust Solution:**
Accept multiple input formats with priority:
1. GitHub URL: `url: "https://github.com/owner/repo"` (most robust)
2. Separate fields: `owner: "foo", repo: "bar"` (current schema)
3. Combined repo: `repo: "owner/repo"` (current behavior)

**Implementation:**
1. Update schema to accept either URL or owner+repo
2. Update `mapWorkspaceSource()` to:
   - If `url` provided, parse owner/repo from URL
   - Else if `owner` provided, use explicit owner
   - Else if `repo` contains `/`, split into owner/repo
   - Else use `AGENTGATE_GITHUB_OWNER` env var
3. Add tests for all input formats
4. Update work-order-submission-guide.md with correct format

**Validation:** Submit work orders with all 3 formats, verify all work

---

## Wave 2: Queue Automation (Sequential)

Depends on Wave 1 completion (specifically 1.1, 1.3, 1.4).

### 2.1 Auto-Queue Processing

**Priority:** CRITICAL
**Complexity:** High
**Depends on:** 1.1 (Cancel), 1.3 (Force Kill), 1.4 (Timeout)
**Files to modify:**
- `packages/server/src/control-plane/queue-manager.ts`
- `packages/server/src/server/app.ts`
- `packages/server/src/server/commands/serve.ts`

**Changes:**
1. Add `startProcessing()` method to queue-manager
2. Create poll loop that checks queue every N seconds
3. If running < maxConcurrent and queued > 0, start next work order
4. Handle recovery: if work order stuck > timeout, kill and retry/fail
5. Start processing automatically when server starts with `--auto-process` flag
6. Add graceful shutdown to stop processing and wait for running work orders

**Validation:** Submit 3 work orders, verify they run automatically without manual trigger

---

### 2.2 Stale Work Order Detection

**Priority:** HIGH
**Complexity:** Medium
**Depends on:** 2.1 (Auto-Queue), 1.3 (Force Kill)
**Files to modify:**
- `packages/server/src/control-plane/queue-manager.ts`
- `packages/server/src/control-plane/stale-detector.ts` (new file)

**Changes:**
1. Create StaleDetector service
2. Detect work orders in "running" state for > N minutes without heartbeat
3. If no agent process found (PID dead), mark as failed
4. If agent process exists but no progress, kill and mark failed
5. Add `lastActivityAt` field to track progress
6. Emit events/alerts for stale detection

**Validation:** Create work order, kill agent process externally, verify detected as stale

---

## Wave 3: CLI Utilities (Parallel with Wave 2)

Independent of Wave 2, can run concurrently.

### 3.1 Queue Management CLI

**Priority:** LOW
**Complexity:** Medium
**Files to create:**
- `packages/server/src/cli/commands/queue.ts`

**Changes:**
1. Add `agentgate queue list` - show queue status
2. Add `agentgate queue cancel <id>` - cancel work order
3. Add `agentgate queue purge <id>` - purge work order
4. Add `agentgate queue purge --status=<status>` - batch purge
5. Add `agentgate queue kill <id>` - force kill
6. Add `agentgate queue health` - show health dashboard

**Validation:** Use CLI commands to manage queue

---

## Work Order Submission Plan

### Wave 1 Submission (All 7 in Parallel)

```bash
# 1.1 Cancel Running Work Orders
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement cancel for running work orders (v0.2.23 Wave 1.1)\n\nFollow docs/proposals/queue-robustness-v0.2.23.md section 1.1\n\nModify:\n- packages/server/src/control-plane/work-order-service.ts - extend cancel() to support running orders\n- packages/server/src/control-plane/queue-manager.ts - track running processes\n- packages/server/src/server/routes/work-orders.ts - update API\n\nValidation: pnpm typecheck && pnpm test",
    "workspaceSource": {
      "type": "github",
      "owner": "fl-sean03",
      "repo": "AgentGate"
    },
    "agentType": "claude-code-subscription",
    "maxIterations": 10,
    "harness": {
      "verification": { "waitForCI": true, "skipLevels": [] }
    }
  }'

# 1.2 Work Order Purge API
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement work order purge API (v0.2.23 Wave 1.2)\n\nFollow docs/proposals/queue-robustness-v0.2.23.md section 1.2\n\nModify:\n- packages/server/src/control-plane/work-order-store.ts - add purge(id)\n- packages/server/src/control-plane/work-order-service.ts - add purge logic\n- packages/server/src/server/routes/work-orders.ts - add purge endpoint\n\nValidation: pnpm typecheck && pnpm test",
    "workspaceSource": {
      "type": "github",
      "owner": "fl-sean03",
      "repo": "AgentGate"
    },
    "agentType": "claude-code-subscription",
    "maxIterations": 10,
    "harness": {
      "verification": { "waitForCI": true, "skipLevels": [] }
    }
  }'

# 1.3 Force Kill Capability
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement force kill capability (v0.2.23 Wave 1.3)\n\nFollow docs/proposals/queue-robustness-v0.2.23.md section 1.3\n\nCreate:\n- packages/server/src/control-plane/agent-process-manager.ts\n\nModify:\n- packages/server/src/control-plane/work-order-service.ts\n- packages/server/src/control-plane/queue-manager.ts\n- packages/server/src/server/routes/work-orders.ts - add kill endpoint\n\nValidation: pnpm typecheck && pnpm test",
    "workspaceSource": {
      "type": "github",
      "owner": "fl-sean03",
      "repo": "AgentGate"
    },
    "agentType": "claude-code-subscription",
    "maxIterations": 10,
    "harness": {
      "verification": { "waitForCI": true, "skipLevels": [] }
    }
  }'

# 1.4 Work Order Timeout
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement work order timeout enforcement (v0.2.23 Wave 1.4)\n\nFollow docs/proposals/queue-robustness-v0.2.23.md section 1.4\n\nModify:\n- packages/server/src/control-plane/queue-manager.ts - add timeout enforcement\n- packages/server/src/orchestrator/run-executor.ts - add timeout tracking\n\nValidation: pnpm typecheck && pnpm test",
    "workspaceSource": {
      "type": "github",
      "owner": "fl-sean03",
      "repo": "AgentGate"
    },
    "agentType": "claude-code-subscription",
    "maxIterations": 10,
    "harness": {
      "verification": { "waitForCI": true, "skipLevels": [] }
    }
  }'

# 1.5 Storage Validation
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement storage validation on startup (v0.2.23 Wave 1.5)\n\nFollow docs/proposals/queue-robustness-v0.2.23.md section 1.5\n\nModify:\n- packages/server/src/control-plane/work-order-store.ts - add validateStorage()\n- packages/server/src/server/app.ts - call on startup\n\nValidation: pnpm typecheck && pnpm test",
    "workspaceSource": {
      "type": "github",
      "owner": "fl-sean03",
      "repo": "AgentGate"
    },
    "agentType": "claude-code-subscription",
    "maxIterations": 10,
    "harness": {
      "verification": { "waitForCI": true, "skipLevels": [] }
    }
  }'

# 1.6 Run Store Orphan Cleanup
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement run store orphan cleanup (v0.2.23 Wave 1.6)\n\nFollow docs/proposals/queue-robustness-v0.2.23.md section 1.6\n\nModify:\n- packages/server/src/control-plane/run-store.ts - add cleanupOrphans()\n- packages/server/src/control-plane/work-order-store.ts - integrate cleanup\n\nValidation: pnpm typecheck && pnpm test",
    "workspaceSource": {
      "type": "github",
      "owner": "fl-sean03",
      "repo": "AgentGate"
    },
    "agentType": "claude-code-subscription",
    "maxIterations": 10,
    "harness": {
      "verification": { "waitForCI": true, "skipLevels": [] }
    }
  }'

# 1.7 Queue Health Dashboard
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement queue health dashboard endpoint (v0.2.23 Wave 1.7)\n\nFollow docs/proposals/queue-robustness-v0.2.23.md section 1.7\n\nCreate:\n- packages/server/src/server/routes/queue.ts\n\nModify:\n- packages/server/src/server/app.ts - register route\n\nValidation: pnpm typecheck && pnpm test",
    "workspaceSource": {
      "type": "github",
      "owner": "fl-sean03",
      "repo": "AgentGate"
    },
    "agentType": "claude-code-subscription",
    "maxIterations": 10,
    "harness": {
      "verification": { "waitForCI": true, "skipLevels": [] }
    }
  }'
```

### Wave 2 Submission (After Wave 1 PRs Merged)

```bash
# 2.1 Auto-Queue Processing
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement auto-queue processing (v0.2.23 Wave 2.1)\n\nFollow docs/proposals/queue-robustness-v0.2.23.md section 2.1\n\nModify:\n- packages/server/src/control-plane/queue-manager.ts - add startProcessing()\n- packages/server/src/server/app.ts - integrate processing\n- packages/server/src/server/commands/serve.ts - add --auto-process flag\n\nValidation: pnpm typecheck && pnpm test",
    "workspaceSource": {
      "type": "github",
      "owner": "fl-sean03",
      "repo": "AgentGate"
    },
    "agentType": "claude-code-subscription",
    "maxIterations": 10,
    "harness": {
      "verification": { "waitForCI": true, "skipLevels": [] }
    }
  }'

# 2.2 Stale Work Order Detection
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement stale work order detection (v0.2.23 Wave 2.2)\n\nFollow docs/proposals/queue-robustness-v0.2.23.md section 2.2\n\nCreate:\n- packages/server/src/control-plane/stale-detector.ts\n\nModify:\n- packages/server/src/control-plane/queue-manager.ts - integrate stale detection\n\nValidation: pnpm typecheck && pnpm test",
    "workspaceSource": {
      "type": "github",
      "owner": "fl-sean03",
      "repo": "AgentGate"
    },
    "agentType": "claude-code-subscription",
    "maxIterations": 10,
    "harness": {
      "verification": { "waitForCI": true, "skipLevels": [] }
    }
  }'
```

### Wave 3 Submission (Can Run Parallel with Wave 2)

```bash
# 3.1 Queue Management CLI
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement queue management CLI commands (v0.2.23 Wave 3.1)\n\nFollow docs/proposals/queue-robustness-v0.2.23.md section 3.1\n\nCreate:\n- packages/server/src/cli/commands/queue.ts\n\nCommands: list, cancel, purge, kill, health\n\nValidation: pnpm typecheck && pnpm test",
    "workspaceSource": {
      "type": "github",
      "owner": "fl-sean03",
      "repo": "AgentGate"
    },
    "agentType": "claude-code-subscription",
    "maxIterations": 10,
    "harness": {
      "verification": { "waitForCI": true, "skipLevels": [] }
    }
  }'
```

---

## Timeline Visualization

```
Time ──────────────────────────────────────────────────────────────►

Wave 1 (Parallel):
  ├─ 1.1 Cancel Running ──────────┤
  ├─ 1.2 Purge API ───────────────┤
  ├─ 1.3 Force Kill ──────────────┤
  ├─ 1.4 Timeout ─────────────────┤  → Merge All
  ├─ 1.5 Storage Validation ──────┤     │
  ├─ 1.6 Orphan Cleanup ──────────┤     │
  └─ 1.7 Queue Health ────────────┘     │
                                        ▼
Wave 2 (Sequential):
  ├─ 2.1 Auto-Queue ──────────────┤
  └─ 2.2 Stale Detection ─────────┤ → Merge All
                                        │
Wave 3 (Parallel with Wave 2):          ▼
  └─ 3.1 CLI Commands ────────────┤ → Merge

Total: 10 work orders across 3 waves
```

---

## Bootstrap Instructions

Since auto-queue processing doesn't exist yet, manually run each work order:

1. Start server: `node dist/index.js serve --api-key $API_KEY`
2. Submit Wave 1 work orders (all 7)
3. For each work order, manually trigger: `POST /api/v1/work-orders/:id/runs`
4. Monitor status: `GET /api/v1/work-orders/:id`
5. When all Wave 1 complete, merge PRs
6. Submit Wave 2, repeat manual trigger
7. Submit Wave 3, repeat

After Wave 2 is complete, auto-queue processing will be available for future work orders.

---

## Success Criteria

- [ ] Can cancel running work orders via API
- [ ] Can purge work order history via API
- [ ] Can force kill stuck processes
- [ ] Work orders auto-timeout after configured duration
- [ ] Corrupted JSON files quarantined on startup
- [ ] Orphaned runs cleaned up on startup
- [ ] Queue health visible via API
- [ ] Work orders auto-start without manual trigger
- [ ] Stale work orders detected and recovered
- [ ] CLI available for queue management

---

## Known Issues & Mitigations

### Issue 1: Sandbox Cleanup Race Condition (FIXED)

**Problem:** Periodic cleanup (every 5 minutes) was destroying active sandboxes mid-execution, causing all running Claude Code processes to terminate with `exitCode: -1`.

**Root Cause:** The `cleanup()` method in `provider.ts` destroyed ALL sandboxes regardless of whether they were actively executing commands.

**Fix Applied:** Added `isExecuting` flag to track active sandboxes. Cleanup now skips sandboxes that are executing.

**Files Modified:**
- `packages/server/src/sandbox/types.ts` - Added `isExecuting?: boolean` to Sandbox interface
- `packages/server/src/sandbox/subprocess-provider.ts` - Track `_isExecuting` state during execute()
- `packages/server/src/sandbox/provider.ts` - Skip executing sandboxes in cleanup()

### Issue 2: OOM Crash from Concurrent Work Orders (CRITICAL)

**Problem:** Submitting and triggering 8 work orders simultaneously caused WSL to crash due to Out of Memory (OOM).

**Root Cause:** Each Claude Code instance uses ~1GB RAM. With 8 instances + git clone operations + server overhead, the system exceeded 15GB RAM + 4GB swap.

**Evidence from dmesg:**
```
Free swap = 0kB
Total swap = 4194304kB
```

**Mitigation (Required):**

1. **Reduce `maxConcurrentRuns`** from 5 to 2-3 for systems with ≤16GB RAM:
   ```bash
   # In .env or environment
   AGENTGATE_MAX_CONCURRENT_RUNS=2
   ```

2. **Stagger work order triggers** - Wait 60 seconds between triggering each work order:
   ```bash
   for id in $WORK_ORDER_IDS; do
     curl -X POST ".../work-orders/$id/runs" ...
     sleep 60  # Wait 1 minute between triggers
   done
   ```

3. **Memory requirements per concurrent run:**
   | Concurrent Runs | Minimum RAM |
   |-----------------|-------------|
   | 1 | 4GB |
   | 2 | 8GB |
   | 3 | 12GB |
   | 5 | 20GB |
   | 8 | 32GB |

**Permanent Fix (Wave 2.1):** Auto-queue processing should include:
- Memory-aware scheduling
- Configurable delay between work order starts
- Health check before starting new work orders
