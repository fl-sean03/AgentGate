# Appendix C: Implementation Execution Strategy

## Overview

This document analyzes the best approach to implement DevGuide v0.2.24, comparing **local implementation** (Claude Code with sub-agents) versus **AgentGate dogfooding** (using AgentGate work orders to implement its own improvements).

---

## Implementation Approaches

### Approach A: Local Implementation (Claude Code)

**Description**: Implement directly in the current Claude Code session, potentially spawning sub-agents for parallel tasks.

**Workflow**:
```
Human → Claude Code → [Sub-agents for parallel tasks] → Code changes → PR
```

### Approach B: AgentGate Dogfooding

**Description**: Submit work orders to AgentGate to implement the DevGuide thrusts.

**Workflow**:
```
Human → Claude Code → AgentGate Work Orders → Agent execution → Verification → PR
```

### Approach C: Hybrid (Recommended)

**Description**: Use local implementation for foundational/sequential work, AgentGate for parallel independent tasks.

---

## Trade-off Analysis

### Dimension 1: Speed

| Approach | Speed | Reasoning |
|----------|-------|-----------|
| Local (sequential) | **Slow** | One task at a time |
| Local (sub-agents) | **Medium-Fast** | Parallel within session |
| AgentGate (parallel) | **Fast** | True parallelism across work orders |
| Hybrid | **Fast** | Best of both worlds |

**AgentGate Advantage**: Can run 5+ work orders in parallel, each with full context window.

**Local Advantage**: No overhead of work order creation, snapshot, verification cycles.

### Dimension 2: Quality/Correctness

| Approach | Quality | Reasoning |
|----------|---------|-----------|
| Local | **Higher** | Full conversation context, iterative refinement |
| AgentGate | **Medium** | Verification gates catch issues, but limited context |
| Hybrid | **High** | Critical paths done locally with full context |

**Local Advantage**: I can see all changes, understand dependencies, course-correct immediately.

**AgentGate Risk**: Each work order operates independently - may miss cross-cutting concerns.

### Dimension 3: Verification

| Approach | Verification | Reasoning |
|----------|--------------|-----------|
| Local | **Manual** | Requires explicit test runs |
| AgentGate | **Automatic** | Built-in L0-L3 gates |
| Hybrid | **Best** | AgentGate verifies, I review |

**AgentGate Advantage**: Every iteration runs through verification pipeline.

### Dimension 4: Architectural Coherence

| Approach | Coherence | Reasoning |
|----------|-----------|-----------|
| Local | **High** | Single agent maintains mental model |
| AgentGate | **Lower** | Multiple agents may diverge |
| Hybrid | **High** | Foundation established locally |

**Critical Insight**: The new architecture has interdependencies (Thrust 1 → Thrusts 2-5). These must be coordinated.

### Dimension 5: Risk of Self-Modification

| Approach | Risk | Reasoning |
|----------|------|-----------|
| Local | **Low** | Changes don't affect the tool being used |
| AgentGate | **Higher** | Modifying AgentGate while using AgentGate |
| Hybrid | **Medium** | Can sequence carefully |

**Concern**: Using AgentGate to modify its own core (orchestrator, state machine) could cause instability mid-implementation.

---

## Thrust-by-Thrust Analysis

### Thrust 1: TaskSpec Types (Foundation)

| Factor | Local | AgentGate |
|--------|-------|-----------|
| Dependencies | None | None |
| Risk | Low | Low |
| Parallelizable | No (foundational) | N/A |
| **Recommendation** | **Local** | - |

**Reasoning**: Thrust 1 defines the types that all other thrusts depend on. Must be done first, locally, with full attention to getting interfaces right.

### Thrust 2: Convergence Policies

| Factor | Local | AgentGate |
|--------|-------|-----------|
| Dependencies | Thrust 1 complete | Thrust 1 complete |
| Risk | Medium | Medium |
| Parallelizable | With Thrusts 3-5 | Yes |
| **Recommendation** | **Hybrid** | **Good candidate** |

**Reasoning**: After Thrust 1, this can run in parallel with 3-5. AgentGate work order would work well.

### Thrust 3: Unified Gates

| Factor | Local | AgentGate |
|--------|-------|-----------|
| Dependencies | Thrust 1 complete | Thrust 1 complete |
| Risk | Medium | Higher (modifies gate system) |
| Parallelizable | With Thrusts 2,4,5 | Yes |
| **Recommendation** | **Local preferred** | Use carefully |

**Reasoning**: This modifies the gate system that AgentGate uses for verification. Risk of breaking verification mid-implementation.

### Thrust 4: Execution Environment

| Factor | Local | AgentGate |
|--------|-------|-----------|
| Dependencies | Thrust 1 complete | Thrust 1 complete |
| Risk | Low | Low |
| Parallelizable | With Thrusts 2,3,5 | Yes |
| **Recommendation** | **AgentGate** | **Best candidate** |

**Reasoning**: Independent of core AgentGate operation. Safe to implement via work order.

### Thrust 5: Delivery System

| Factor | Local | AgentGate |
|--------|-------|-----------|
| Dependencies | Thrust 1, 4 | Thrust 1, 4 |
| Risk | Low | Low |
| Parallelizable | After Thrust 4 | Yes |
| **Recommendation** | **AgentGate** | **Good candidate** |

**Reasoning**: Independent of core AgentGate operation. Safe to implement via work order.

---

## Recommended Execution Plan

### Phase 1: Foundation (Local, Sequential)

```
Claude Code (local):
├── Thrust 1: TaskSpec Types
│   ├── 1.3.1: Define TaskSpec Core Types
│   ├── 1.3.2: Define Spec Sub-Types
│   ├── 1.3.3: Create Zod Schemas
│   └── 1.3.4-6: Loaders, Resolvers, Converters
└── Thrust 3: Unified Gates (partial - types only)
    └── Gate interface definitions
```

**Duration**: 2-3 focused sessions
**Why Local**: Foundation must be solid. Types affect everything.

### Phase 2: Parallel Implementation (AgentGate + Local)

```
Parallel Work Orders (AgentGate):
├── WO-1: Thrust 2 - Convergence Policies
│   ├── convergence/controller.ts
│   ├── convergence/strategies/*.ts
│   └── Tests
├── WO-2: Thrust 4 - Execution Environment
│   ├── execution/workspace-manager.ts
│   ├── execution/sandbox-manager.ts
│   └── Tests
└── WO-3: Thrust 5 - Delivery System
    ├── delivery/git-manager.ts
    ├── delivery/pr-manager.ts
    └── Tests

Claude Code (local, parallel):
└── Thrust 3: Unified Gates (implementation)
    ├── gate/runners/*.ts
    ├── gate/pipeline.ts
    └── Integration with existing verifier
```

**Duration**: 1-2 sessions (parallel execution)
**Why Split**:
- Gates modify verification = do locally
- Execution/Delivery are independent = safe for AgentGate

### Phase 3: Integration (Local)

```
Claude Code (local):
├── Integration work
│   ├── Wire up all components
│   ├── Update orchestrator to use TaskSpec
│   ├── Update run-executor for gates
│   └── API route updates
├── Migration code
│   ├── Converter testing
│   └── Backwards compatibility
└── Final testing
    ├── Integration tests
    └── Acceptance tests
```

**Duration**: 1-2 sessions
**Why Local**: Integration requires understanding all pieces together.

---

## AgentGate Work Order Templates

### Template for Thrust 2

```yaml
# work-order-thrust-2.yaml
apiVersion: agentgate.io/v1
kind: TaskSpec
metadata:
  name: implement-convergence-policies

spec:
  goal:
    prompt: |
      Implement Thrust 2 of DevGuide v0.2.24: Convergence Policies.

      Read the full specification at:
      docs/DevGuides/DevGuide_v0.2.24/03-thrust-convergence.md

      Create the following files:
      - packages/server/src/convergence/controller.ts
      - packages/server/src/convergence/strategy.ts
      - packages/server/src/convergence/strategies/fixed.ts
      - packages/server/src/convergence/strategies/hybrid.ts
      - packages/server/src/convergence/strategies/ralph.ts
      - packages/server/src/convergence/progress.ts
      - packages/server/src/convergence/registry.ts
      - packages/server/src/convergence/index.ts

      Write tests for all implementations.
      Ensure pnpm typecheck and pnpm test pass.

  convergence:
    strategy: ralph
    config:
      convergenceThreshold: 0.05
    gates:
      - name: verification
        check:
          type: verification-levels
          levels: [L0, L1]
        onFailure:
          action: iterate
          maxAttempts: 15
          feedback: auto
    limits:
      maxIterations: 50
      maxWallClock: 2h

  execution:
    workspace:
      source: github
      owner: agentgate
      repo: agentgate
      ref: main
    agent:
      driver: claude-code-subscription

  delivery:
    git:
      mode: github-pr
      branchPrefix: feature/thrust-2-
    pr:
      create: true
      draft: true
      labels: [v0.2.24, thrust-2]
```

### Template for Thrust 4

```yaml
# work-order-thrust-4.yaml
apiVersion: agentgate.io/v1
kind: TaskSpec
metadata:
  name: implement-execution-environment

spec:
  goal:
    prompt: |
      Implement Thrust 4 of DevGuide v0.2.24: Execution Environment.

      Read the full specification at:
      docs/DevGuides/DevGuide_v0.2.24/05-thrust-execution.md

      Create the following files:
      - packages/server/src/execution/workspace-manager.ts
      - packages/server/src/execution/sandbox-manager.ts
      - packages/server/src/execution/agent-manager.ts
      - packages/server/src/execution/coordinator.ts
      - packages/server/src/execution/index.ts

      Write tests for all implementations.

  convergence:
    strategy: hybrid
    config:
      baseIterations: 5
      bonusIterations: 3
    gates:
      - name: verification
        check:
          type: verification-levels
          levels: [L0, L1]
        onFailure:
          action: iterate
          feedback: auto
    limits:
      maxIterations: 30

  execution:
    workspace:
      source: github
      owner: agentgate
      repo: agentgate
    agent:
      driver: claude-code-subscription

  delivery:
    git:
      mode: github-pr
      branchPrefix: feature/thrust-4-
    pr:
      create: true
      draft: true
      labels: [v0.2.24, thrust-4]
```

---

## Risk Mitigation

### Risk: Cross-Thrust Dependencies

**Mitigation**: Thrust 1 types must be committed and pushed before parallel work orders start. Work orders should pull from branch with Thrust 1 complete.

### Risk: Merge Conflicts

**Mitigation**: Each thrust works in different directories:
- Thrust 2: `packages/server/src/convergence/`
- Thrust 3: `packages/server/src/gate/`
- Thrust 4: `packages/server/src/execution/`
- Thrust 5: `packages/server/src/delivery/`

Minimal overlap = minimal conflicts.

### Risk: Breaking Changes During Implementation

**Mitigation**:
1. Work on feature branches
2. Keep main stable
3. Only merge once thrust is complete and tested
4. Use draft PRs until ready

### Risk: AgentGate Modifying Itself Breaks Mid-Implementation

**Mitigation**:
1. Do Thrust 3 (gates) locally - don't let AgentGate modify verification system
2. New code goes in new directories (won't affect running AgentGate)
3. Integration phase done locally with full control

---

## Decision Matrix

| Thrust | Complexity | Dependencies | AgentGate Safe? | Recommendation |
|--------|------------|--------------|-----------------|----------------|
| 1 | High | None | N/A (do first) | **Local** |
| 2 | Medium | Thrust 1 | Yes | **AgentGate** |
| 3 | High | Thrust 1 | **No** (modifies gates) | **Local** |
| 4 | Medium | Thrust 1 | Yes | **AgentGate** |
| 5 | Medium | Thrust 1, 4 | Yes | **AgentGate** |

---

## Final Recommendation

### Optimal Strategy: Hybrid

```
┌─────────────────────────────────────────────────────────────────┐
│                        EXECUTION PLAN                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PHASE 1 (Local - Sequential)                                  │
│  ─────────────────────────────                                  │
│  ├─ Thrust 1: TaskSpec Types ────────────────────────────►     │
│  └─ Thrust 3: Gate Types ────────────────────────────────►     │
│                                                                 │
│  PHASE 2 (Parallel)                                             │
│  ──────────────────                                             │
│  ├─ [AgentGate WO] Thrust 2: Convergence ────►                 │
│  ├─ [AgentGate WO] Thrust 4: Execution ──────►                 │
│  ├─ [AgentGate WO] Thrust 5: Delivery ───────►                 │
│  └─ [Local] Thrust 3: Gate Implementation ───►                 │
│                                                                 │
│  PHASE 3 (Local - Integration)                                  │
│  ─────────────────────────────                                  │
│  ├─ Merge all PRs                                               │
│  ├─ Wire up components                                          │
│  ├─ Update orchestrator                                         │
│  └─ Final testing                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Works

1. **Foundation is solid**: Types done locally with full attention
2. **Speed from parallelism**: 3 thrusts run simultaneously via AgentGate
3. **Safety preserved**: Gate system (critical path) done locally
4. **Dogfooding achieved**: We use AgentGate for ~60% of implementation
5. **Integration controlled**: Final wiring done with full context

### Execution Commands

```bash
# Phase 1: Local implementation
# (Done in Claude Code session)

# Phase 2: Submit parallel work orders
agentgate submit work-order-thrust-2.yaml
agentgate submit work-order-thrust-4.yaml
agentgate submit work-order-thrust-5.yaml

# Monitor progress
agentgate status --watch

# Phase 3: Merge and integrate
git checkout main
git merge feature/thrust-1
git merge feature/thrust-2
git merge feature/thrust-3
git merge feature/thrust-4
git merge feature/thrust-5

# Final verification
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm test:integration
```

---

## Summary

| Approach | Speed | Quality | Risk | Recommended For |
|----------|-------|---------|------|-----------------|
| Pure Local | Slow | High | Low | Foundation, Integration |
| Pure AgentGate | Fast | Medium | Higher | Not recommended alone |
| **Hybrid** | **Fast** | **High** | **Low** | **Overall strategy** |

The hybrid approach maximizes the benefits of both:
- **Local**: Quality, context, control for critical paths
- **AgentGate**: Speed, parallelism, verification for independent tasks

This approach also validates the v0.2.24 architecture by using it during its own implementation - true dogfooding.
