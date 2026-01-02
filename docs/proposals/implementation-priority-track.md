# Implementation Priority Track

**Last Updated:** 2026-01-02
**Current Focus:** v0.2.23 Queue Robustness Tactical Fixes

---

## Priority Order

```
v0.2.23 → v0.2.22 → v0.2.20 → v0.2.21
   ↑
   └── CURRENT FOCUS
```

| Priority | Version | Focus | Status |
|----------|---------|-------|--------|
| 1 | **v0.2.23** | Queue Tactical Fixes | **✅ COMPLETE** |
| 2 | v0.2.22 | Queue Architecture Refactor | **NEXT** |
| 3 | v0.2.20 | Dashboard Enhancement | Planning |
| 4 | v0.2.21 | Terminal UI (TUI) | Planning |

---

## v0.2.23 Progress Tracker

### Wave 1: Foundation (8 Parallel) - ✅ COMPLETE

| Task | PR | Status | Description |
|------|-----|--------|-------------|
| 1.1 | #76 | ✅ MERGED | Cancel Running Work Orders |
| 1.2 | #73 | ✅ MERGED | Work Order Purge API |
| 1.3 | #80 | ✅ MERGED | Force Kill Capability |
| 1.4 | #79 | ✅ MERGED | Work Order Timeout Enforcement |
| 1.5 | #74 | ✅ MERGED | Storage Validation on Startup |
| 1.6 | #78 | ✅ MERGED | Run Store Orphan Cleanup |
| 1.7 | #75 | ✅ MERGED | Queue Health Dashboard Endpoint |
| 1.8 | #77 | ✅ MERGED | Fix Workspace Source API |

**Validated:** All tests pass, typecheck pass (2026-01-02)

### Wave 2: Automation (Sequential) - ✅ COMPLETE

| Task | PR | Status | Description |
|------|-----|--------|-------------|
| 2.1 | - | ✅ DIRECT COMMIT | Auto-Queue Processing |
| 2.2 | #81 | ✅ MERGED | Stale Work Order Detection |

**Dependencies:** Requires Wave 1 merged (specifically 1.1, 1.3, 1.4) - ✅ MET

### Wave 3: CLI (Parallel with Wave 2) - ✅ COMPLETE

| Task | PR | Status | Description |
|------|-----|--------|-------------|
| 3.1 | #82 | ✅ MERGED | Queue Management CLI |

**Validated:** All 1517 tests pass, typecheck pass, lint pass (2026-01-02)

---

## Open Issues Mapping

| Issue | Title | Resolution |
|-------|-------|------------|
| #68 | Accept repoUrl in workspaceSource | **PR #77** (Wave 1.8) |
| #66 | Sandbox not enabled by default | **FIXED MANUALLY** |
| #67 | Empty error objects | v0.2.22 Observability (Thrust 6) |
| #65 | Runs marked failed despite passing | v0.2.22 State Machine (Thrust 2) |
| #71 | waitForCI parameter ignored | **v0.2.22 State Machine (Thrust 2)** |

### Issue #71 Investigation Notes

**Symptom:** Work orders submitted with `waitForCI: true` are marked as "succeeded" even when GitHub CI fails.

**Observed in:** v0.2.23 Wave 2.2 (PR #81) and Wave 3.1 (PR #82) - both had lint failures in CI but work orders succeeded.

**Root Cause Analysis:**
1. The `harness.verification.waitForCI` param may not propagate to `workOrder.waitForCI`
2. CI polling may not be triggered for GitHub source work orders
3. Run result determination may not properly handle CI_FAILED state

**Fix Location:** v0.2.22 Thrust 2 (State Machine) - Add explicit CI verification state handling:
- PENDING → PREPARING → RUNNING → **CI_PENDING** → COMPLETED/FAILED
- State machine should block on CI_PENDING until CI passes or fails
- CI failure should transition to FAILED with proper error message

---

## Configuration Requirements

Before running work orders:

```bash
# .env settings for stability
AGENTGATE_SANDBOX_PROVIDER=subprocess
AGENTGATE_MAX_CONCURRENT_RUNS=2
```

**Memory Requirements:**
| Concurrent | Min RAM |
|------------|---------|
| 1 | 4GB |
| 2 | 8GB |
| 3 | 12GB |

---

## Context Recovery Notes

If context resets, resume from:

1. **Check current state:**
   ```bash
   gh pr list --state open --limit 20
   gh issue list --state open --limit 10
   ```

2. **Resume v0.2.23 implementation:**
   - Read `docs/DevGuides/DevGuide_v0.2.23/00-index.md`
   - Check which Wave 1 PRs are merged
   - Continue with next pending task

3. **Key files:**
   - DevGuide: `docs/DevGuides/DevGuide_v0.2.23/`
   - Proposal: `docs/proposals/queue-robustness-v0.2.23.md`
   - This file: `docs/proposals/implementation-priority-track.md`

---

## Commands Reference

```bash
# Merge a PR
gh pr merge <number> --squash --delete-branch

# Check PR status
gh pr view <number> --json state,mergeable,title

# Submit work order
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{ ... }'

# Trigger work order
curl -X POST http://localhost:3001/api/v1/work-orders/<id>/runs \
  -H "Authorization: Bearer $API_KEY"

# Check work order status
curl http://localhost:3001/api/v1/work-orders/<id> \
  -H "Authorization: Bearer $API_KEY"
```
