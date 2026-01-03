# 01 - Architecture Overview

## Current State Analysis

### What AgentGate Is Today

AgentGate currently implements a **harness-based execution model** with these key components:

```
┌──────────────────────────────────────────────────────────────────┐
│                     CURRENT ARCHITECTURE                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   WorkOrder ──────> Orchestrator ──────> Run Executor            │
│       │                  │                    │                   │
│       ▼                  ▼                    ▼                   │
│   HarnessConfig     State Machine      Iteration Loop            │
│   ├─ loopStrategy   ├─ QUEUED          ├─ Build                  │
│   ├─ verification   ├─ BUILDING        ├─ Snapshot               │
│   ├─ gitOps         ├─ VERIFYING       ├─ Verify (L0-L3)         │
│   └─ limits         ├─ FEEDBACK        ├─ Feedback               │
│                     └─ SUCCEEDED       └─ Repeat                  │
│                                                                   │
│   Loop Strategy ────────────────────────────────────────────────│
│   ├─ FixedStrategy (run N times)                                │
│   ├─ HybridStrategy (base + bonus if progress)                  │
│   ├─ RalphStrategy (until agent signals done)                   │
│   └─ CustomStrategy (user-defined)                              │
│                                                                   │
│   Verification ────────────────────────────────────────────────│
│   ├─ L0: Contract checks (files, schemas, naming)               │
│   ├─ L1: Test commands (build, test, lint)                      │
│   ├─ L2: Blackbox tests (fixtures, assertions)                  │
│   └─ L3: Sanity checks (warnings, coverage)                     │
│                                                                   │
│   CI Integration ──────────────────────────────────────────────│
│   ├─ GitHub Actions polling                                      │
│   ├─ CI feedback parsing                                         │
│   └─ CI retry logic (separate from local retry)                  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Pain Points in Current Architecture

#### 1. Conceptual Fragmentation
- **HarnessConfig** defines behavior but mixes concerns
- **WorkOrder** duplicates some harness fields (`maxIterations`, `loopStrategyMode`)
- **GatePlan** exists but isn't clearly related to harness/verification
- Three "retry" concepts: local retry, CI retry, loop strategy

#### 2. Loop Strategy Complexity
The current `LoopStrategy` interface has 9 methods:
```typescript
interface LoopStrategy {
  initialize(config): Promise<void>;
  onLoopStart(context): Promise<void>;
  onIterationStart(context): Promise<void>;
  shouldContinue(context): Promise<LoopDecision>;  // Core decision
  onIterationEnd(context, decision): Promise<void>;
  onLoopEnd(context, finalDecision): Promise<void>;
  getProgress(context): LoopProgress;
  detectLoop(context): LoopDetectionData;
  reset(): void;
}
```
But the core question is simple: **"Should we continue?"**

#### 3. Verification Level Rigidity
- L0-L3 are hardcoded concepts
- CI is treated separately from verification
- No way to add custom verification without modifying core
- Verification and "should retry" logic intertwined

#### 4. Configuration Sprawl
Current configuration surface:
```typescript
// In HarnessConfig
loopStrategy: LoopStrategyConfig
verification: VerificationConfig
gitOps: GitOpsConfig
executionLimits: ExecutionLimits
agentDriver: AgentDriverConfig

// In WorkOrder (duplicates/overrides)
maxIterations: number
maxWallClockSeconds: number
loopStrategyMode: LoopStrategyMode
harnessProfile: string
skipVerification: VerificationLevel[]
waitForCI: boolean

// In GatePlan (separate concern)
contracts: ContractChecks
tests: TestCommand[]
blackbox: BlackboxTest[]
```

---

## Proposed Architecture

### The Reframe: Reconciliation Controller

AgentGate becomes a **reconciliation controller** that drives agents toward a desired state:

```
┌──────────────────────────────────────────────────────────────────┐
│                     NEW ARCHITECTURE                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   TaskSpec ───────> Reconciler ──────> Gate Pipeline             │
│       │                  │                    │                   │
│       ▼                  ▼                    ▼                   │
│   Declarative       Desired vs           Gate Checks             │
│   Goal + Gates      Actual State         + Feedback              │
│                          │                                        │
│                          ▼                                        │
│                     Convergence                                   │
│                     Strategy                                      │
│                          │                                        │
│                          ▼                                        │
│   ┌────────────────────────────────────────────────────────────┐│
│   │  Gate 1: local-verify    Gate 2: ci-checks    Gate 3: ...  ││
│   │  ├─ check: L0-L3         ├─ check: workflows  ├─ custom    ││
│   │  ├─ onFailure: iterate   ├─ onFailure: stop   └─ ...       ││
│   │  └─ feedback: auto       └─ feedback: auto                 ││
│   └────────────────────────────────────────────────────────────┘│
│                                                                   │
│   Execution ───────────────────────────────────────────────────│
│   ├─ workspace: github (owner/repo)                              │
│   ├─ sandbox: docker (node:20)                                   │
│   └─ agent: claude-code-subscription                             │
│                                                                   │
│   Delivery ────────────────────────────────────────────────────│
│   ├─ git.mode: github-pr                                         │
│   ├─ pr.create: true                                             │
│   └─ pr.reviewers: [lead-dev]                                    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Core Concept: TaskSpec

A **TaskSpec** is a Kubernetes-style resource that declaratively specifies:

```yaml
apiVersion: agentgate.io/v1
kind: TaskSpec
metadata:
  name: implement-feature

spec:
  # WHAT: The goal
  goal:
    prompt: "Implement user authentication with JWT tokens..."
    desiredState:
      allGatesPassed: true

  # HOW: Convergence behavior
  convergence:
    strategy: ralph
    config:
      convergenceThreshold: 0.05
      windowSize: 3
    gates:
      - name: local-verification
        check:
          type: verification-levels
          levels: [L0, L1, L2, L3]
        onFailure:
          action: iterate
          maxAttempts: 10
          feedback: auto
      - name: ci-checks
        check:
          type: github-actions
        onFailure:
          action: iterate
          maxAttempts: 2
          feedback: auto
    limits:
      maxIterations: 100
      maxWallClock: 2h
      maxCost: $100

  # WHERE: Execution environment
  execution:
    workspace:
      source: github
      owner: myorg
      repo: myrepo
    sandbox:
      provider: docker
      image: node:20-slim
    agent:
      driver: claude-code-subscription

  # WHEN: Delivery behavior
  delivery:
    git:
      mode: github-pr
      branchPrefix: agentgate/
    pr:
      create: true
      draft: false
      reviewers: [lead-dev]
```

---

## Component Mapping: Old → New

### Configuration Types

| Old Component | New Component | Notes |
|---------------|---------------|-------|
| `HarnessConfig` | `TaskSpec` | Top-level resource |
| `HarnessConfig.loopStrategy` | `TaskSpec.spec.convergence` | Strategy + gates |
| `HarnessConfig.verification` | Gate with `type: verification-levels` | Now just a gate |
| `HarnessConfig.gitOps` | `TaskSpec.spec.delivery` | Cleaner separation |
| `HarnessConfig.executionLimits` | `TaskSpec.spec.convergence.limits` | Grouped with convergence |
| `HarnessConfig.agentDriver` | `TaskSpec.spec.execution.agent` | Under execution |
| `WorkOrder` | `TaskSpec` reference + runtime state | Cleaner separation |
| `GatePlan` | Inline gate definitions | Part of TaskSpec |

### Loop Strategies → Convergence Strategies

| Old Strategy | New Strategy | Behavior |
|--------------|--------------|----------|
| `FixedStrategy` | `convergence.strategy: fixed` | Run exactly N iterations |
| `HybridStrategy` | `convergence.strategy: hybrid` | Base + bonus if progress |
| `RalphStrategy` | `convergence.strategy: ralph` | Until done or loop detected |
| `CustomStrategy` | `convergence.strategy: custom` | User-provided implementation |
| (new) | `convergence.strategy: adaptive` | ML-based (future) |
| (new) | `convergence.strategy: manual` | Human decides each iteration |

### Verification → Gates

| Old Level | New Gate Type | Purpose |
|-----------|---------------|---------|
| L0 (Contracts) | `check.type: verification-levels` with `levels: [L0]` | Structural validation |
| L1 (Tests) | `check.type: verification-levels` with `levels: [L1]` | Functional tests |
| L2 (Blackbox) | `check.type: verification-levels` with `levels: [L2]` | Behavioral tests |
| L3 (Sanity) | `check.type: verification-levels` with `levels: [L3]` | Code quality |
| CI Polling | `check.type: github-actions` | External CI integration |
| (new) | `check.type: custom` | User-defined commands |
| (new) | `check.type: approval` | Human approval gate |
| (new) | `check.type: convergence` | Similarity/fingerprint check |

---

## Design Principles

### 1. Declarative Over Imperative
**Old**: "Run the agent 5 times, checking verification after each"
**New**: "Reach a state where all gates pass, using this convergence strategy"

### 2. Gates as First-Class Citizens
Everything that can pass/fail is a gate:
- Verification levels are gates
- CI checks are gates
- Custom commands are gates
- Human approvals are gates

### 3. Unified Retry Model
**Old**: `localRetryEnabled`, `ciRetryEnabled`, `maxIterations`, `baseIterations`, `maxBonusIterations`
**New**: Each gate has its own `onFailure.maxAttempts`

### 4. Clear Separation of Concerns
```
TaskSpec
├── goal          # WHAT we're trying to achieve
├── convergence   # HOW we reach it (strategy + gates + limits)
├── execution     # WHERE we run (workspace + sandbox + agent)
└── delivery      # HOW we ship (git + PR)
```

### 5. Backwards Compatibility by Design
- Old `HarnessConfig` auto-converts to `TaskSpec` internally
- Old API endpoints continue working
- New fields are optional with sensible defaults

---

## Type System Overview

### Core Types

```typescript
// Top-level resource
interface TaskSpec {
  apiVersion: 'agentgate.io/v1';
  kind: 'TaskSpec';
  metadata: TaskMetadata;
  spec: TaskSpecBody;
}

// The specification body
interface TaskSpecBody {
  goal: GoalSpec;
  convergence: ConvergenceSpec;
  execution: ExecutionSpec;
  delivery: DeliverySpec;
}

// What we're trying to achieve
interface GoalSpec {
  prompt: string;
  desiredState?: DesiredState;
}

// How we reach the goal
interface ConvergenceSpec {
  strategy: ConvergenceStrategy;
  config?: ConvergenceConfig;
  gates: Gate[];
  limits: ConvergenceLimits;
}

// A single gate (checkpoint)
interface Gate {
  name: string;
  check: GateCheck;
  onFailure: FailurePolicy;
  onSuccess?: SuccessPolicy;
}

// What to check
type GateCheck =
  | VerificationLevelsCheck
  | GitHubActionsCheck
  | CustomCommandCheck
  | ApprovalCheck
  | ConvergenceCheck;

// What to do on failure
interface FailurePolicy {
  action: 'iterate' | 'stop' | 'escalate';
  maxAttempts?: number;
  feedback?: 'auto' | 'manual' | FeedbackGenerator;
}
```

### Convergence Strategies

```typescript
type ConvergenceStrategy = 'fixed' | 'hybrid' | 'ralph' | 'adaptive' | 'manual';

interface ConvergenceConfig {
  // Fixed strategy
  iterations?: number;

  // Hybrid strategy
  baseIterations?: number;
  bonusIterations?: number;
  progressThreshold?: number;

  // Ralph strategy
  convergenceThreshold?: number;
  windowSize?: number;
  promptHotReload?: boolean;
  tuningSignsPath?: string;
}

interface ConvergenceLimits {
  maxIterations?: number;
  maxWallClock?: string;  // e.g., "2h", "30m"
  maxCost?: string;       // e.g., "$50"
  maxTokens?: number;
}
```

### Execution Environment

```typescript
interface ExecutionSpec {
  workspace: WorkspaceSpec;
  sandbox?: SandboxSpec;
  agent: AgentSpec;
}

interface WorkspaceSpec {
  source: 'local' | 'git' | 'github' | 'fresh';
  // Source-specific fields
  path?: string;           // local
  url?: string;            // git
  owner?: string;          // github
  repo?: string;           // github
  ref?: string;            // git, github
  template?: string;       // fresh
}

interface SandboxSpec {
  provider: 'docker' | 'subprocess' | 'none';
  image?: string;
  resources?: ResourceSpec;
  network?: 'none' | 'bridge' | 'host';
}

interface AgentSpec {
  driver: 'claude-code-subscription' | 'claude-agent-sdk' | 'opencode';
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}
```

### Delivery System

```typescript
interface DeliverySpec {
  git: GitSpec;
  pr?: PRSpec;
}

interface GitSpec {
  mode: 'local' | 'push' | 'github-pr';
  branchPrefix?: string;
  commitPrefix?: string;
  autoCommit?: boolean;
}

interface PRSpec {
  create: boolean;
  draft?: boolean;
  title?: string;
  labels?: string[];
  reviewers?: string[];
  autoMerge?: boolean;
}
```

---

## Data Flow: TaskSpec → Execution

```
1. TaskSpec Submitted
   ├─ Validate against Zod schema
   ├─ Apply defaults for missing fields
   └─ Store as canonical representation

2. WorkOrder Created
   ├─ Reference to TaskSpec
   ├─ Runtime state (status, iteration, timestamps)
   └─ Results accumulator

3. Reconciliation Loop Started
   ├─ Load TaskSpec
   ├─ Initialize convergence strategy
   ├─ Initialize gate runners
   └─ Begin iteration

4. Each Iteration
   ├─ Agent builds (writes code)
   ├─ Snapshot captured
   ├─ Gates evaluated in order
   │   ├─ Gate 1: local-verification
   │   │   ├─ Run L0-L3 checks
   │   │   ├─ If pass: continue to next gate
   │   │   └─ If fail: apply onFailure policy
   │   ├─ Gate 2: ci-checks
   │   │   ├─ Poll GitHub Actions
   │   │   └─ Apply failure/success policy
   │   └─ Gate N: ...
   ├─ Convergence strategy consulted
   │   └─ Should we continue? (based on progress, loop detection)
   └─ If not converged: generate feedback, iterate

5. Convergence Achieved
   ├─ All gates passed
   ├─ Apply delivery spec
   │   ├─ Commit changes
   │   ├─ Push to remote
   │   └─ Create PR if configured
   └─ Mark work order SUCCEEDED
```

---

## Files Affected

### New Type Files

| File | Purpose |
|------|---------|
| `packages/server/src/types/task-spec.ts` | TaskSpec, GoalSpec, metadata types |
| `packages/server/src/types/convergence.ts` | ConvergenceSpec, strategy types |
| `packages/server/src/types/gate.ts` | Gate, GateCheck, policy types |
| `packages/server/src/types/execution.ts` | ExecutionSpec, workspace, sandbox, agent |
| `packages/server/src/types/delivery.ts` | DeliverySpec, git, PR types |
| `packages/shared/src/schemas/task-spec.schema.ts` | Zod schema for validation |

### Refactored Files

| File | Changes |
|------|---------|
| `packages/server/src/types/harness-config.ts` | Deprecate, add converter to TaskSpec |
| `packages/server/src/types/loop-strategy.ts` | Rename to convergence-strategy.ts |
| `packages/server/src/harness/strategies/` | Move to `convergence/strategies/` |
| `packages/server/src/harness/config-resolver.ts` | Add TaskSpec resolution |
| `packages/server/src/orchestrator/orchestrator.ts` | Use TaskSpec instead of HarnessConfig |
| `packages/server/src/orchestrator/run-executor.ts` | Gate-based execution flow |
| `packages/server/src/verifier/verifier.ts` | Integrate as gate runner |

### New Implementation Files

| File | Purpose |
|------|---------|
| `packages/server/src/task-spec/loader.ts` | Load TaskSpec from various sources |
| `packages/server/src/task-spec/resolver.ts` | Resolve inheritance, apply defaults |
| `packages/server/src/task-spec/converter.ts` | Convert HarnessConfig → TaskSpec |
| `packages/server/src/convergence/controller.ts` | Main convergence loop controller |
| `packages/server/src/gate/runner.ts` | Execute individual gates |
| `packages/server/src/gate/runners/verification.ts` | L0-L3 gate runner |
| `packages/server/src/gate/runners/github-actions.ts` | CI gate runner |
| `packages/server/src/gate/runners/custom.ts` | Custom command gate runner |

---

## Relationship to Existing Components

### State Machine (packages/server/src/orchestrator/state-machine.ts)
- States remain the same (QUEUED, BUILDING, VERIFYING, etc.)
- Transitions driven by gate pass/fail instead of verification pass/fail
- New state: GATE_CHECKING (optional, can reuse VERIFYING)

### Feedback System (packages/server/src/feedback/)
- Unchanged internally
- Gates provide `feedback: 'auto'` to use existing system
- New `FeedbackGenerator` interface for custom feedback

### Verification System (packages/server/src/verifier/)
- Becomes the `verification-levels` gate runner
- No changes to L0-L3 implementations
- Just wrapped in gate interface

### Git Operations (packages/server/src/git/)
- Unchanged internally
- Called by delivery system based on `DeliverySpec`

---

## Summary

This architecture reframe provides:

1. **Clearer Mental Model**: TaskSpec with convergence toward desired state
2. **Unified Gate System**: All checks (verification, CI, custom) are gates
3. **Flexible Convergence**: Multiple strategies with clear semantics
4. **Clean Separation**: Goal, convergence, execution, delivery
5. **Backwards Compatible**: Old configs work, migration gradual
6. **Extensible**: Add new gate types without core changes

The implementation follows in Thrusts 1-5, each building on the TaskSpec foundation.
