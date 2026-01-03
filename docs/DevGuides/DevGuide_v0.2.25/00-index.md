# DevGuide v0.2.25: Execution Pipeline Robustness Overhaul

**Version**: 0.2.25
**Status**: Planning
**Author**: AgentGate Team
**Created**: 2026-01-03
**Prerequisites**: v0.2.24 complete

---

## Executive Summary

This DevGuide implements a comprehensive overhaul of the AgentGate execution pipeline, focusing on **robustness**, **extensibility**, and **developer friendliness**. The v0.2.24 release introduced the TaskSpec architecture reframe, but the execution layer still suffers from:

1. **State machine bugs** - Missing transitions causing incorrect failure classifications
2. **Dual-stack confusion** - Legacy `executeRun()` and new `ExecutionCoordinator` coexist unintegrated
3. **Monolithic functions** - 675-line `executeRun()` and 595-line `orchestrator.execute()`
4. **16 callback parameters** - Testing nightmare and unclear contracts
5. **Silent failures** - Strategy errors swallowed, no visibility into execution

### The Fix

This version unifies the execution pipeline into a single, well-tested, modular system:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    BEFORE (v0.2.24 and earlier)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   WorkOrder → Orchestrator → executeRun() ─┐                           │
│                      ↓                      │  DUAL STACK              │
│   TaskSpec → ExecutionCoordinator ─────────┘  (unintegrated)           │
│                                                                         │
│   Problems:                                                             │
│   • State machine has missing transitions                              │
│   • 675-line monolithic function                                       │
│   • 16 callbacks passed as parameters                                  │
│   • GitHub logic hardcoded in orchestrator                             │
│   • Silent failures in strategy callbacks                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

                              ↓ REFACTOR ↓

┌─────────────────────────────────────────────────────────────────────────┐
│                    AFTER (v0.2.25)                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   TaskSpec → ExecutionEngine ──────────────────────────────────────────│
│                   │                                                     │
│                   ├── PhaseOrchestrator                                │
│                   │      ├── BuildPhase                                │
│                   │      ├── SnapshotPhase                             │
│                   │      ├── VerifyPhase                               │
│                   │      └── FeedbackPhase                             │
│                   │                                                     │
│                   ├── StateMachine (type-safe, complete)               │
│                   │                                                     │
│                   ├── DeliveryManager (pluggable VCS)                  │
│                   │                                                     │
│                   └── ProgressEmitter (real-time observability)        │
│                                                                         │
│   Benefits:                                                             │
│   • Single execution path                                              │
│   • Complete state machine with all transitions                        │
│   • Modular phase handlers (~100 lines each)                          │
│   • Typed context objects instead of callbacks                         │
│   • Pluggable delivery (GitHub, GitLab, local)                        │
│   • Real-time progress events                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Problems Addressed

### Bug #65: Runs Incorrectly Marked as Failed

The immediate trigger for this refactor. Runs were marked as `FAILED` with `system_error` when:
- Verification passed
- PR was created successfully
- CI was not configured

**Root Causes Identified**:
1. Missing `VERIFY_PASSED` transition from `PR_CREATED` state (fixed in v0.2.22)
2. Missing `VERIFY_FAILED_TERMINAL` transition from `FEEDBACK` state (still broken)
3. No test coverage for edge case state transitions

### Dual-Stack Architecture

v0.2.24 introduced `ExecutionCoordinator` alongside the legacy `executeRun()` but they were never integrated. This creates:
- Two code paths to maintain
- Inconsistent behavior between paths
- Confusion about which to use

### Monolithic Functions

| Function | Lines | Responsibilities |
|----------|-------|------------------|
| `executeRun()` | 675 | Build, snapshot, verify, feedback, GitHub, CI, timeouts, streaming, lease renewal |
| `orchestrator.execute()` | 595 | Workspace, gate plan, harness config, agent driver, callbacks, GitHub setup, cleanup |

These are unmaintainable. Each should be <100 lines with single responsibility.

### Callback Chaos

```typescript
// Current: 16 callbacks passed as parameters
interface RunExecutorOptions {
  onBuild, onSnapshot, onVerify, onFeedback,
  onCaptureBeforeState, onRunStarted, onStateChange,
  onIterationComplete, onPhaseStart, onPhaseEnd,
  onAgentResult, onSnapshotCaptured, onVerificationComplete,
  onPushIteration, onCreatePullRequest, onPollCI
}
```

This is impossible to test, understand, or extend.

### Silent Strategy Failures

```typescript
// Current: errors are logged and swallowed
} catch (error) {
  log.warn({ error }, 'Strategy onIterationStart failed');
  // Continue execution - strategy errors should not fail the run
}
```

This hides bugs and creates unpredictable behavior.

---

## Document Structure

| Document | Description |
|----------|-------------|
| [01-overview.md](./01-overview.md) | Architecture overview: current state analysis, design philosophy, component mapping |
| [02-thrust-state-machine.md](./02-thrust-state-machine.md) | **Thrust 1**: Complete state machine with all transitions, type-safe guards |
| [03-thrust-phase-handlers.md](./03-thrust-phase-handlers.md) | **Thrust 2**: Extract modular phase handlers from monolithic functions |
| [04-thrust-execution-engine.md](./04-thrust-execution-engine.md) | **Thrust 3**: Unified ExecutionEngine replacing executeRun + ExecutionCoordinator |
| [05-thrust-delivery-manager.md](./05-thrust-delivery-manager.md) | **Thrust 4**: Pluggable delivery abstraction (GitHub, GitLab, local) |
| [06-thrust-observability.md](./06-thrust-observability.md) | **Thrust 5**: Real-time progress events and monitoring |
| [07-appendix-testing.md](./07-appendix-testing.md) | Comprehensive testing strategy with state machine coverage |
| [08-appendix-migration.md](./08-appendix-migration.md) | Migration path and backwards compatibility |
| [09-execution-strategy.md](./09-execution-strategy.md) | **Dogfooding strategy**: Using AgentGate to implement its own improvements |

---

## Key Architectural Decisions

### Decision 1: Single ExecutionEngine

- **Choice**: Merge `executeRun()` and `ExecutionCoordinator` into single `ExecutionEngine`
- **Rationale**: One code path, one place to fix bugs, one thing to test
- **Alternative**: Keep both with adapter (rejected: complexity, maintenance burden)

### Decision 2: Phase Handler Pattern

- **Choice**: Extract each phase (build, snapshot, verify, feedback) into dedicated handler class
- **Rationale**: Single responsibility, testable units, ~100 lines each
- **Alternative**: Keep monolithic function (rejected: unmaintainable)

### Decision 3: Context Objects Over Callbacks

- **Choice**: Replace 16 callbacks with typed `ExecutionContext` and `PhaseContext` objects
- **Rationale**: Type safety, easier testing, clear contracts
- **Alternative**: Keep callbacks (rejected: testing nightmare)

### Decision 4: Complete State Machine

- **Choice**: Audit and complete all state transitions, add compile-time validation
- **Rationale**: Eliminate bug #65 class of errors entirely
- **Alternative**: Add transitions as bugs found (rejected: reactive, not proactive)

### Decision 5: Pluggable Delivery

- **Choice**: Extract GitHub logic into `DeliveryManager` interface with implementations
- **Rationale**: Support GitLab, Gitea, local; reduce orchestrator complexity
- **Alternative**: Keep hardcoded GitHub (rejected: limits extensibility)

### Decision 6: Fail-Fast Strategy Errors

- **Choice**: Strategy errors fail the run with clear error classification
- **Rationale**: No silent failures, predictable behavior
- **Alternative**: Continue swallowing errors (rejected: hides bugs)

---

## Success Criteria

### Must Have
- [ ] All state transitions audited and complete
- [ ] Bug #65 impossible to reproduce (test proves it)
- [ ] Single execution path (no dual-stack)
- [ ] Phase handlers < 150 lines each
- [ ] No callback parameters (context objects only)
- [ ] All existing tests pass

### Should Have
- [ ] DeliveryManager interface with GitHub implementation
- [ ] Progress events emitted per iteration
- [ ] Strategy errors fail-fast with classification
- [ ] Test coverage > 85% for new code

### Nice to Have
- [ ] GitLab delivery implementation
- [ ] WebSocket streaming of progress
- [ ] Metrics exposure for monitoring

---

## Thrust Overview

### Thrust 1: State Machine Completion (02-thrust-state-machine.md)

Audit every state transition and ensure completeness:
- Add missing `VERIFY_FAILED_TERMINAL` from `FEEDBACK` state
- Add missing `SNAPSHOT_FAILED` event emission
- Create transition validation tests for all paths
- Add compile-time transition table validation

### Thrust 2: Phase Handlers (03-thrust-phase-handlers.md)

Extract modular phase handlers:
- `BuildPhaseHandler` - Agent execution
- `SnapshotPhaseHandler` - Git state capture
- `VerifyPhaseHandler` - Gate execution
- `FeedbackPhaseHandler` - Failure feedback generation
- `DeliveryPhaseHandler` - Git/PR operations

### Thrust 3: ExecutionEngine (04-thrust-execution-engine.md)

Create unified execution engine:
- Orchestrates phase handlers
- Manages iteration loop via ConvergenceController
- Handles timeouts and cancellation
- Integrates with state machine

### Thrust 4: Delivery Manager (05-thrust-delivery-manager.md)

Abstract delivery into pluggable system:
- `DeliveryManager` interface
- `GitHubDeliveryManager` implementation
- `LocalDeliveryManager` for non-VCS
- Future: `GitLabDeliveryManager`

### Thrust 5: Observability (06-thrust-observability.md)

Add real-time progress visibility:
- `ProgressEmitter` for iteration events
- WebSocket integration for dashboard
- Metrics for monitoring
- Structured logging improvements

---

## File Map

### New Files

| Path | Purpose |
|------|---------|
| `packages/server/src/execution/engine.ts` | Unified ExecutionEngine |
| `packages/server/src/execution/phase-orchestrator.ts` | Phase sequencing |
| `packages/server/src/execution/phases/build.ts` | BuildPhaseHandler |
| `packages/server/src/execution/phases/snapshot.ts` | SnapshotPhaseHandler |
| `packages/server/src/execution/phases/verify.ts` | VerifyPhaseHandler |
| `packages/server/src/execution/phases/feedback.ts` | FeedbackPhaseHandler |
| `packages/server/src/execution/context.ts` | Typed context objects |
| `packages/server/src/delivery/manager.ts` | DeliveryManager interface |
| `packages/server/src/delivery/github.ts` | GitHubDeliveryManager |
| `packages/server/src/delivery/local.ts` | LocalDeliveryManager |
| `packages/server/src/observability/progress-emitter.ts` | Progress events |

### Modified Files

| Path | Changes |
|------|---------|
| `packages/server/src/orchestrator/state-machine.ts` | Add missing transitions, validation |
| `packages/server/src/orchestrator/orchestrator.ts` | Use ExecutionEngine, reduce to ~100 lines |
| `packages/server/src/orchestrator/run-executor.ts` | Deprecate, delegate to ExecutionEngine |
| `packages/server/src/convergence/controller.ts` | Integrate with PhaseOrchestrator |

### Deprecated Files (to remove in v0.3.0)

| Path | Reason |
|------|--------|
| `packages/server/src/orchestrator/run-executor.ts` | Replaced by ExecutionEngine |

---

## Dependencies

- **v0.2.24**: TaskSpec architecture complete
- **v0.2.23**: Tactical fixes complete
- No external dependencies added

---

## Key Constraints

1. **Backwards Compatibility**: Existing WorkOrder API must continue working
2. **Incremental Refactor**: Can ship in phases, each phase leaves system working
3. **No Breaking Changes**: Public API shape preserved
4. **Test Coverage**: All new code requires tests before merge
5. **Performance**: No regression in execution time

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing flows | Medium | High | Extensive integration tests |
| State machine regression | Low | High | Complete transition tests |
| Performance degradation | Low | Medium | Benchmark before/after |
| Migration complexity | Medium | Medium | Gradual rollout with feature flags |

---

## Verification Plan

### Per-Thrust Verification

Each thrust has dedicated verification steps. See individual thrust documents.

### Overall Verification

```bash
# Full test suite
pnpm test

# Build verification
pnpm build && pnpm typecheck

# Integration tests
pnpm --filter @agentgate/server test:integration

# State machine specific tests
pnpm --filter @agentgate/server test -- --grep "StateMachine"

# Phase handler tests
pnpm --filter @agentgate/server test -- --grep "PhaseHandler"
```

### Manual Verification Scenarios

1. **Happy Path**: Submit work order, verify succeeded with PR created
2. **Verification Failure**: Submit, verify failed after max iterations
3. **CI Failure**: Submit with CI, verify CI failure feedback generated
4. **Cancellation**: Submit, cancel mid-execution, verify clean state
5. **Timeout**: Submit with short timeout, verify timeout error

---

## Implementation Order

```
                    ┌──────────────────────┐
                    │  Thrust 1            │
                    │  State Machine       │
                    │  (Foundation)        │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │  Thrust 2       │ │  Thrust 4       │ │  Thrust 5       │
    │  Phase Handlers │ │  Delivery       │ │  Observability  │
    │                 │ │  Manager        │ │                 │
    └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
             │                   │                   │
             └───────────────────┼───────────────────┘
                                 │
                                 ▼
                    ┌──────────────────────┐
                    │  Thrust 3            │
                    │  ExecutionEngine     │
                    │  (Unification)       │
                    └──────────────────────┘
```

Thrust 1 must be completed first as it's the foundation. Thrusts 2, 4, 5 can proceed in parallel. Thrust 3 depends on all others.
