# DevGuide v0.2.24: TaskSpec Architecture Reframe

**Version**: 0.2.24
**Status**: Planning
**Author**: AgentGate Team
**Created**: 2026-01-03
**Prerequisites**: v0.2.23 complete

---

## Executive Summary

This DevGuide implements a fundamental architectural reframe of AgentGate, shifting from a "harness with loops" mental model to a **"TaskSpec with convergence strategy"** model. The key insight: AgentGate is NOT a CI/CD system. It is a:

> **"Durable, feedback-driven iteration controller for AI agent task completion"**

Think of it like Temporal for agent loops - where the agent is the work unit and verification drives convergence toward a desired state.

### Core Conceptual Changes

| Old Thinking | New Thinking |
|--------------|--------------|
| "Harness" with "loops" | TaskSpec with convergence strategy |
| Separate verify/CI/iteration configs | Unified gates with pluggable checks |
| "Loop strategy" decides iterations | Convergence strategy decides when done |
| Verification "definition" vs "loop" | Just gates - check + retry policy |
| CI is special | CI is just another gate |

---

## Problems Addressed

1. **Conceptual Confusion**: "Harness", "loops", "strategies" don't clearly communicate what AgentGate does
2. **Fragmented Verification**: L0-L3 verification and CI are treated as separate concerns
3. **Configuration Complexity**: Multiple overlapping config schemas (harness, loop, verification, gitOps)
4. **Iteration vs Goal**: Current model focuses on "run N times" not "reach verified state"
5. **Limited Extensibility**: Adding new gate types requires touching multiple systems

---

## The New Architecture Pattern

AgentGate implements a **Kubernetes-style reconciliation loop**:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   DESIRED STATE              ACTUAL STATE                       │
│   ────────────               ────────────                       │
│   • All gates: passed        • Gate 1: failed                   │
│   • CI: green                • Gate 2: passed                   │
│   • Delivered: PR ready      • Gate 3: not run                  │
│                                                                 │
│                    ↓                                            │
│              RECONCILE                                          │
│         (Agent iterates to                                      │
│          close the gap)                                         │
│                    ↓                                            │
│                                                                 │
│   Eventually: ACTUAL STATE == DESIRED STATE → DONE              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Document Structure

| Document | Description |
|----------|-------------|
| [01-overview.md](./01-overview.md) | Architecture overview: current state, proposed design, component mapping |
| [02-thrust-taskspec.md](./02-thrust-taskspec.md) | **Thrust 1**: TaskSpec type system redesign |
| [03-thrust-convergence.md](./03-thrust-convergence.md) | **Thrust 2**: Convergence policies replacing loops |
| [04-thrust-gates.md](./04-thrust-gates.md) | **Thrust 3**: Unified gates framework |
| [05-thrust-execution.md](./05-thrust-execution.md) | **Thrust 4**: Execution environment (workspace, sandbox, agent) |
| [06-thrust-delivery.md](./06-thrust-delivery.md) | **Thrust 5**: Delivery system (git, PR, deploy) |
| [07-appendix-migration.md](./07-appendix-migration.md) | Migration path from current to new architecture |
| [08-appendix-testing.md](./08-appendix-testing.md) | Testing and validation strategy |
| [09-execution-strategy.md](./09-execution-strategy.md) | Implementation execution strategy (local vs AgentGate dogfooding) |

---

## Key Architectural Decisions

### Decision 1: TaskSpec as Primary Configuration Unit
- **Choice**: Single `TaskSpec` type replaces `HarnessConfig`, `WorkOrder`, and partial API schemas
- **Rationale**: One schema to learn, one validation path, clear purpose
- **Alternative**: Keep separate schemas with mapping layer (rejected: too complex)

### Decision 2: Gates as Unified Verification
- **Choice**: All verification becomes "Gates" - L0-L3, CI, custom checks all use same interface
- **Rationale**: CI is just another gate. Verification levels are gates. Everything is a gate.
- **Alternative**: Keep verification levels as special (rejected: limits extensibility)

### Decision 3: Convergence Strategies Replace Loop Strategies
- **Choice**: Rename "loop strategies" to "convergence strategies" with clearer semantics
- **Rationale**: We're not "looping" - we're "converging" toward desired state
- **Alternative**: Keep "loop" terminology (rejected: misleading mental model)

### Decision 4: Kubernetes-style Desired State Model
- **Choice**: Configuration specifies desired end state, system reconciles toward it
- **Rationale**: Declarative > imperative; goal-oriented > step-oriented
- **Alternative**: Keep iteration-count model (rejected: doesn't scale conceptually)

---

## Success Criteria

- [ ] TaskSpec schema defined and validated
- [ ] All existing tests pass with new architecture
- [ ] Migration path documented with backwards compatibility
- [ ] Gate interface supports L0-L3, CI, and custom checks
- [ ] Convergence strategies (fixed, hybrid, ralph) reimplemented
- [ ] API endpoints updated with new request/response shapes
- [ ] CLI commands support new TaskSpec format
- [ ] Documentation updated throughout

---

## Thrust Overview

### Thrust 1: TaskSpec Type System (02-thrust-taskspec.md)
Replace `HarnessConfig` with `TaskSpec` - a Kubernetes-style resource definition:
- `spec.goal`: What we're trying to achieve
- `spec.convergence`: How to reach the goal (strategy + gates + limits)
- `spec.execution`: Where to run (workspace + sandbox + agent)
- `spec.delivery`: How to ship (git + PR)

### Thrust 2: Convergence Policies (03-thrust-convergence.md)
Replace "loop strategies" with "convergence policies":
- Strategy types: `fixed`, `hybrid`, `ralph`, `adaptive`, `manual`
- Progress tracking: git history, verification levels, feature lists
- Loop detection: similarity-based, fingerprinting, oscillation detection
- Resource limits: iterations, wall clock, cost, tokens

### Thrust 3: Unified Gates (04-thrust-gates.md)
Unify L0-L3 verification, CI checks, and custom gates:
- Gate interface: `check`, `onFailure`, `onSuccess`
- Gate types: `verification-levels`, `github-actions`, `custom`, `approval`, `convergence`
- Feedback generation: auto, manual, or custom generator
- Gate ordering and dependencies

### Thrust 4: Execution Environment (05-thrust-execution.md)
Consolidate workspace, sandbox, and agent configuration:
- Workspace sources: local, git, github, fresh
- Sandbox providers: docker, subprocess, none
- Agent drivers: claude-code-subscription, claude-agent-sdk, opencode

### Thrust 5: Delivery System (06-thrust-delivery.md)
Unify git operations and delivery configuration:
- Git modes: local, push, github-pr
- PR configuration: draft, reviewers, labels, auto-merge
- Branch naming and commit message patterns

---

## File Map

### New Files
| Path | Purpose |
|------|---------|
| `packages/server/src/types/task-spec.ts` | TaskSpec type definitions |
| `packages/server/src/types/gate.ts` | Unified gate interface |
| `packages/server/src/types/convergence.ts` | Convergence policy types |
| `packages/server/src/convergence/` | Convergence strategy implementations |
| `packages/server/src/gate/runners/` | Gate runner implementations |
| `packages/shared/src/schemas/task-spec.schema.ts` | Zod schema for TaskSpec |

### Modified Files
| Path | Changes |
|------|---------|
| `packages/server/src/types/harness-config.ts` | Add deprecation notices, map to TaskSpec |
| `packages/server/src/types/loop-strategy.ts` | Rename to convergence-strategy.ts |
| `packages/server/src/types/work-order.ts` | Add TaskSpec reference field |
| `packages/server/src/harness/` | Rename to `packages/server/src/task-spec/` |
| `packages/server/src/orchestrator/orchestrator.ts` | Use TaskSpec, gates, convergence |
| `packages/server/src/orchestrator/run-executor.ts` | Gate-based execution flow |
| `packages/server/src/server/routes/work-orders.ts` | New TaskSpec-based API |
| `packages/server/src/verifier/` | Integrate with gate system |

### Deprecated Files (to remove in v0.3.0)
| Path | Reason |
|------|--------|
| `packages/server/src/harness/strategies/` | Moved to convergence/ |
| `packages/server/src/harness/config-loader.ts` | Replaced by task-spec loader |

---

## Dependencies

- **v0.2.23**: All tactical fixes complete
- **v0.2.22**: State machine and queue architecture stable
- No external dependencies added

---

## Key Constraints

1. **Backwards Compatibility**: Existing `HarnessConfig` and work order APIs must continue working
2. **Incremental Migration**: Old configs auto-convert to TaskSpec internally
3. **No Breaking Changes**: Public API shape preserved, new fields optional
4. **Type Safety**: All new types use Zod for runtime validation
5. **Test Coverage**: New code requires >80% coverage

---

## Verification Plan

1. **Unit Tests**: Each thrust has dedicated test files
2. **Integration Tests**: End-to-end TaskSpec → execution → delivery
3. **Migration Tests**: Old configs correctly convert to TaskSpec
4. **API Tests**: New endpoints respond correctly
5. **Manual Verification**: Execute sample task using new format

```bash
# Per-thrust verification
pnpm --filter @agentgate/server test:unit

# Full integration
pnpm test:integration

# Build verification
pnpm build && pnpm typecheck
```

---

## Timeline Thrusts

| Thrust | Scope | Dependencies |
|--------|-------|--------------|
| Thrust 1 | TaskSpec types | None |
| Thrust 2 | Convergence policies | Thrust 1 |
| Thrust 3 | Unified gates | Thrust 1 |
| Thrust 4 | Execution environment | Thrust 1 |
| Thrust 5 | Delivery system | Thrust 1 |
| Migration | Backwards compatibility | All thrusts |
| Testing | Validation | All thrusts |

Thrusts 2-5 can proceed in parallel after Thrust 1 completes.
