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
| 1 | **v0.2.23** | Queue Tactical Fixes | **IN PROGRESS** |
| 2 | v0.2.22 | Queue Architecture Refactor | Planning |
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

### Wave 2: Automation (Sequential) - IN PROGRESS

| Task | PR | Status | Description |
|------|-----|--------|-------------|
| 2.1 | - | ✅ DIRECT COMMIT | Auto-Queue Processing |
| 2.2 | ydsR1nuVGqGG | 🏃 RUNNING | Stale Work Order Detection |

**Dependencies:** Requires Wave 1 merged (specifically 1.1, 1.3, 1.4) - ✅ MET

### Wave 3: CLI (Parallel with Wave 2) - IN PROGRESS

| Task | PR | Status | Description |
|------|-----|--------|-------------|
| 3.1 | zCBtDxBdOMUU | 🏃 RUNNING | Queue Management CLI |

---

## Open Issues Mapping

| Issue | Title | Resolution |
|-------|-------|------------|
| #68 | Accept repoUrl in workspaceSource | **PR #77** (Wave 1.8) |
| #66 | Sandbox not enabled by default | **FIXED MANUALLY** |
| #67 | Empty error objects | v0.2.22 Observability |
| #65 | Runs marked failed despite passing | v0.2.22 State Machine |
| #71 | waitForCI parameter ignored | Needs new work order |

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
