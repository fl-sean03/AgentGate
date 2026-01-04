# DevGuide v0.2.30: Dogfooding & Self-Improvement

**Version**: 0.2.30
**Title**: Dogfooding & Self-Improvement
**Status**: In Progress
**Prerequisites**: v0.2.29 (Core functionality stable)
**Depends On**: AgentGate server, CLI, API

---

## Executive Summary

This DevGuide documents the **comprehensive dogfooding session** where AgentGate is used to improve itself. By submitting work orders via the API to fix bugs in AgentGate, we validate the entire system end-to-end while simultaneously improving it.

**Key Principle**: Use AgentGate to improve AgentGate. Every bug found becomes a work order. Every fix is verified through the verification gates.

---

## Problem Statement

AgentGate has reached functional completeness but needs:
1. **Real-world testing** beyond unit tests
2. **Edge case discovery** through actual usage
3. **Integration validation** across API, CLI, and execution
4. **Self-improvement loop** demonstrating the platform's value

Manual testing is insufficient. The best way to find bugs is to use the system for its intended purpose.

---

## Success Criteria

After v0.2.30 completion:

1. **Zero known bugs** in API, CLI, and execution paths
2. **All sandbox modes working** - subprocess AND Docker
3. **Harness profiles fully functional** - memory, CPU, timeouts respected
4. **Verification gates accurate** - no false positives or negatives
5. **Documentation complete** - all bugs and fixes documented
6. **Confidence high** - system ready for external users

---

## Bugs Found & Fixed

### Critical (Blocking Execution)

| ID | Bug | Status | Fix Location |
|----|-----|--------|--------------|
| #1 | Date field mismatch in iteration data | Fixed | `run-store.ts:109-121` |
| #2 | harnessProfile not persisted via API | Fixed | `work-order-service.ts`, `work-order-store.ts` |
| #7 | executionLimits.maxMemoryMb not passed to Docker | Fixed | `orchestrator.ts:377-395` |

### High (Causes Failures)

| ID | Bug | Status | Fix Location |
|----|-----|--------|--------------|
| #3 | L3 large-files false positive on .pnpm-store | Fixed | `l3-sanity.ts:148-158` |

### Medium (Quality Issues)

| ID | Bug | Status | Notes |
|----|-----|--------|-------|
| #4 | Run stuck in "building" state on crash | Identified | Needs recovery mechanism |
| #5 | CLI `serve` command exits immediately | Identified | Process lifecycle issue |
| #6 | No workspace path validation at submit | Identified | API accepts nonexistent paths |

---

## Thrust Overview

| Phase | Thrust | Name | Description |
|-------|--------|------|-------------|
| 1 | 1 | Date Field Compatibility | Fix iteration data field naming |
| 1 | 2 | Harness Profile Persistence | Ensure harness config flows through API |
| 1 | 3 | L3 Verification Accuracy | Exclude package manager caches |
| 2 | 4 | Docker Memory Limits | Pass executionLimits to sandbox |
| 2 | 5 | Workspace Validation | Validate paths at submission time |
| 3 | 6 | CLI Process Lifecycle | Fix serve command staying alive |
| 3 | 7 | Orphan Run Recovery | Handle crashed runs gracefully |
| 4 | 8 | GitHub Source Testing | Validate GitHub repository workflows |
| 4 | 9 | Comprehensive API Testing | Edge cases, error handling |

---

## Testing Matrix

### Sandbox Providers

| Provider | Memory | Status | Notes |
|----------|--------|--------|-------|
| Subprocess | 8GB (host) | Working | Default for agentgate-subprocess.yaml |
| Docker | 2GB (default) | Failed OOM | Before fix |
| Docker | 4GB (harness) | Working | After executionLimits fix |

### Verification Levels

| Level | Check | Status | Notes |
|-------|-------|--------|-------|
| L0 | Required files | Working | |
| L0 | Forbidden patterns | Working | |
| L1 | Tests | Working | |
| L2 | Blackbox | Working | |
| L3 | Debug artifacts | Working | |
| L3 | Large files | Fixed | Was flagging .pnpm-store |
| L3 | Common mistakes | Working | |
| L3 | Clean state | Working | |
| L3 | Test coverage | Working | |

### API Endpoints

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/v1/work-orders` | POST | Working | harnessProfile now saved |
| `/api/v1/work-orders/:id` | GET | Working | |
| `/api/v1/work-orders/:id/runs` | POST | Working | |
| `/api/v1/runs` | GET | Working | |
| `/api/v1/runs/:id` | GET | Working | |
| `/health` | GET | Working | |

---

## Document Navigation

| File | Contents |
|------|----------|
| [01-overview.md](./01-overview.md) | Architecture, dogfooding methodology |
| [02-bugs-fixed.md](./02-bugs-fixed.md) | Detailed bug descriptions and fixes |
| [03-testing.md](./03-testing.md) | Test scenarios and results |
| [04-appendices.md](./04-appendices.md) | File map, checklists, reference |

---

## Dogfooding Methodology

### Continuous Iterative Process

This dogfooding session is designed as a **continuous, iterative improvement loop**. The process never truly "ends" - instead, we keep pushing, testing edge cases, and discovering new issues until the system reaches production-grade robustness.

**Key Principles:**
- **Always be testing** - Submit work orders, monitor results, find edge cases
- **Document as you go** - Every bug found gets documented immediately
- **Fix through AgentGate** - Use the platform to improve itself when possible
- **Test comprehensively** - Cover API, CLI, TUI, all sandbox modes, all source types
- **Stress test** - Push limits, try unusual inputs, test concurrent operations

### Session Structure

1. **Start server** via direct import (CLI has lifecycle bug)
2. **Submit work order** via POST to API
3. **Monitor execution** through API and log files
4. **Analyze failures** to identify root causes
5. **Fix bugs** in source code
6. **Rebuild and restart** server
7. **Verify fix** with new work order
8. **Document** in this DevGuide
9. **Repeat** - Continue testing new scenarios

### Work Order Template

```json
{
  "taskPrompt": "<specific task>",
  "workspaceSource": {
    "type": "local",
    "path": "/path/to/agentgate"
  },
  "harness": {
    "profile": "agentgate-subprocess"
  },
  "maxIterations": 2
}
```

### Verification Checklist

After each fix:
- [ ] Source code updated
- [ ] Dist rebuilt
- [ ] Server restarted
- [ ] New work order submitted
- [ ] Run completes successfully
- [ ] DevGuide updated

---

## Files Modified This Session

| File | Changes |
|------|---------|
| `src/orchestrator/run-store.ts` | Date field backward compatibility |
| `src/control-plane/work-order-service.ts` | harnessProfile in submit() |
| `src/control-plane/work-order-store.ts` | Serialize/deserialize harnessProfile |
| `src/verifier/l3-sanity.ts` | Package manager cache exclusions |
| `src/orchestrator/orchestrator.ts` | executionLimits.maxMemoryMb passthrough |

---

## Next Steps

1. **Complete remaining thrusts** (5-9)
2. **Test GitHub repository source**
3. **Fix CLI process lifecycle**
4. **Add workspace path validation**
5. **Implement orphan run recovery**
6. **Create automated dogfooding test suite**

---

## Lessons Learned

1. **Field naming matters** - Inconsistent naming (startTime vs startedAt) causes silent failures
2. **Config inheritance is complex** - Multiple config layers (harness, execution, sandbox) need careful mapping
3. **Package managers create large files** - .pnpm-store can contain 100MB+ files
4. **Process lifecycle is tricky** - Node.js doesn't keep CLI alive without explicit handling
5. **Dogfooding finds real bugs** - Unit tests missed several integration issues

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.2.30-alpha | 2026-01-04 | Initial dogfooding session, 4 bugs fixed |
