# 00: Index - Observability & Reliability Refactor

## DevGuide v0.2.19

**Title:** Observability & Reliability Refactor
**Status:** Planning
**Author:** Claude (via dogfooding analysis)
**Date:** 2026-01-02
**Prerequisites:** v0.2.18 (Security Policy Engine)
**Triggered By:** v0.2.17 work order failure with no diagnostic info

---

## Executive Summary

AgentGate can dogfood itself, but when things fail, we don't know why. The v0.2.17 test generation work order created all files correctly but failed with just "Build failed" - no stdout, no stderr, no tool calls, no way to debug.

This DevGuide outlines a comprehensive refactor to make AgentGate **observable, reliable, and truly production-ready** for dogfooding and external use.

---

## Problem Statement

### Immediate Issue: v0.2.17 WO Failure

```
Run: ac31daa7-620a-451e-86e0-4269fe15b824
Result: failed_build
Error: "Build failed"
```

The agent created 1,824 lines of test code across 3 files. Git shows the changes were made. But we have:
- No stdout from agent
- No stderr from agent
- No tool call history
- No iteration data file
- No verification report
- No way to know what failed

### Root Cause: Information Loss

```typescript
// AgentResult contains rich data:
interface AgentResult {
  stdout: string;           // DISCARDED
  stderr: string;           // Only partial use
  toolCalls: ToolCallRecord[]; // DISCARDED
  tokensUsed: TokenUsage;   // DISCARDED
  durationMs: number;       // DISCARDED
  structuredOutput: any;    // DISCARDED
}

// But we only save:
{ sessionId: string; success: boolean; error?: string }
```

---

## Architectural Issues Identified

### Critical (Must Fix)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | **AgentResult not persisted** | `orchestrator.ts:435-442` | No way to debug agent failures |
| 2 | **VerificationReport not persisted** | `orchestrator.ts:459-471` | No way to see what verification found |
| 3 | **IterationData incomplete** | `run-store.ts:96-106` | Missing sessionId, agent metrics, verification ID |
| 4 | **Generic error messages** | Multiple | "Build failed" tells us nothing |

### High (Should Fix)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 5 | **No retry logic** | Throughout | Transient failures = terminal |
| 6 | **GitHub failures silent** | `run-executor.ts:421-438` | Run succeeds without PR |
| 7 | **Concurrent limit = error** | `orchestrator.ts:120-124` | Bad UX, no queueing |
| 8 | **Harness config silent failures** | `config-resolver.ts` | Wrong profile used silently |

### Medium (Nice to Have)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 9 | **Loop strategy callback explosion** | `run-executor.ts` | 5 callbacks, hard to understand |
| 10 | **Orchestrator imports 15+ modules** | `orchestrator.ts` | Hard to test, tight coupling |
| 11 | **EventBroadcaster leak risk** | `broadcaster.ts` | No auto-cleanup |

---

## Success Criteria

After v0.2.19, we should be able to:

1. **Debug any failure** - Full agent output available for every run
2. **Retry transient failures** - Network blips don't kill runs
3. **Queue work orders** - System degrades gracefully under load
4. **Dogfood reliably** - AgentGate can build itself without mysterious failures
5. **Onboard new developers** - Cleaner architecture, fewer hidden dependencies

---

## Thrust Overview

### Phase 1: Observability Foundation (Thrusts 1-4)

| # | Name | Description | Files |
|---|------|-------------|-------|
| 1 | Persist AgentResult | Save full agent output to disk | 3 |
| 2 | Persist VerificationReport | Save verification results | 2 |
| 3 | Enhanced IterationData | Add sessionId, metrics, verification refs | 2 |
| 4 | Structured Error Types | Replace generic errors with typed errors | 3 |

### Phase 2: Reliability Improvements (Thrusts 5-7)

| # | Name | Description | Files |
|---|------|-------------|-------|
| 5 | Retry Policy | Configurable retry for transient failures | 3 |
| 6 | GitHub Operation Modes | Fail-fast vs best-effort vs disabled | 2 |
| 7 | Work Order Queue | Queue instead of reject at capacity | 3 |

### Phase 3: Architectural Cleanup (Thrusts 8-10)

| # | Name | Description | Files |
|---|------|-------------|-------|
| 8 | WorkspaceManager Facade | Single interface for workspace ops | 4 |
| 9 | Simplified Loop Strategy | Replace 5 callbacks with 1 | 3 |
| 10 | Event-Driven Architecture | Emit events, decouple persistence | 4 |

---

## File Map

### New Files (Phase 1)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/types/persisted-results.ts` | 1,2 | PersistedAgentResult, PersistedVerification |
| `packages/server/src/types/build-error.ts` | 4 | BuildErrorType enum, BuildError interface |
| `packages/server/src/orchestrator/result-persister.ts` | 1,2 | Save agent/verification results |

### New Files (Phase 2)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/types/retry-policy.ts` | 5 | RetryPolicy interface |
| `packages/server/src/orchestrator/retry-executor.ts` | 5 | Retry logic implementation |
| `packages/server/src/types/github-mode.ts` | 6 | GitHubMode enum |

### New Files (Phase 3)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/workspace/manager.ts` | 8 | WorkspaceManager class |
| `packages/server/src/workspace/index.ts` | 8 | Public exports |
| `packages/server/src/orchestrator/events.ts` | 10 | Event definitions |

### Modified Files

| File | Thrusts | Changes |
|------|---------|---------|
| `packages/server/src/orchestrator/orchestrator.ts` | 1-4, 8-10 | Major refactor |
| `packages/server/src/orchestrator/run-executor.ts` | 1-7 | Result persistence, retry logic |
| `packages/server/src/orchestrator/run-store.ts` | 1-3 | Enhanced save functions |
| `packages/server/src/types/run.ts` | 3,4 | Enhanced IterationData |
| `packages/server/src/verifier/verifier.ts` | 2 | Persistence hook |
| `packages/server/src/control-plane/work-order-service.ts` | 7 | Queue implementation |
| `packages/server/src/harness/strategy-registry.ts` | 9 | Simplified interface |
| `packages/server/src/types/loop-strategy.ts` | 9 | Single callback |

---

## Dependencies

- v0.2.18 Security Policy Engine (prerequisite)
- Existing AgentGate server infrastructure
- Node.js EventEmitter (built-in)
- `p-retry` for retry logic (new dependency)

---

## Navigation

| Document | Contents |
|----------|----------|
| [01-overview.md](./01-overview.md) | Current state, gap analysis, architecture design |
| [02-persisted-agent-result.md](./02-persisted-agent-result.md) | Thrust 1: Persist full AgentResult |
| [03-verification-report.md](./03-verification-report.md) | Thrust 2: Persist VerificationReport |
| [04-enhanced-iteration-data.md](./04-enhanced-iteration-data.md) | Thrust 3: Enhanced IterationData |
| [05-structured-errors.md](./05-structured-errors.md) | Thrust 4: Structured error types |
| [06-retry-policy.md](./06-retry-policy.md) | Thrust 5: Retry logic |
| [07-github-modes.md](./07-github-modes.md) | Thrust 6: GitHub operation modes |
| [08-work-order-queue.md](./08-work-order-queue.md) | Thrust 7: Work order queue |
| [09-workspace-manager.md](./09-workspace-manager.md) | Thrust 8: WorkspaceManager facade |
| [10-simplified-loop-strategy.md](./10-simplified-loop-strategy.md) | Thrust 9: Simplified loop strategy |
| [11-event-driven.md](./11-event-driven.md) | Thrust 10: Event-driven architecture |
| [12-testing.md](./12-testing.md) | Testing strategy |
| [13-appendices.md](./13-appendices.md) | Checklists, troubleshooting, references |
| [14-execution-plan.md](./14-execution-plan.md) | Implementation sequence |

---

## Open Questions

1. **Storage limits?** - Agent stdout can be large. Truncate after N KB?
2. **Retention policy?** - How long to keep agent output files?
3. **Event sourcing?** - Should we go full event-sourced for runs?
4. **Backwards compatibility?** - How to handle existing run data?

---

## Quick Reference

### Phase 1 Priority (Observability)

```bash
# Files to create/modify in order:
1. packages/server/src/types/persisted-results.ts
2. packages/server/src/types/build-error.ts
3. packages/server/src/orchestrator/result-persister.ts
4. packages/server/src/orchestrator/run-store.ts  # Modify
5. packages/server/src/types/run.ts               # Modify
6. packages/server/src/orchestrator/orchestrator.ts  # Modify
7. packages/server/src/orchestrator/run-executor.ts  # Modify
```

### Key Interfaces

```typescript
// What we want to capture:
interface PersistedAgentResult {
  iteration: number;
  sessionId: string;
  success: boolean;
  exitCode: number;
  stdout: string;       // Full output
  stderr: string;       // Full errors
  durationMs: number;
  tokensUsed: TokenUsage | null;
  toolCalls: ToolCallRecord[];
  model: string;
  capturedAt: string;
}

// What errors should look like:
interface BuildError {
  type: BuildErrorType;
  message: string;
  exitCode: number | null;
  stdout: string;       // Last N lines
  stderr: string;       // Last N lines
  agentResultFile: string;
}
```
