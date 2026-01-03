# v0.2.25 Overview: Execution Pipeline Analysis

## 1.1 Purpose

This document provides a comprehensive analysis of the current execution pipeline architecture, identifies all problems to be addressed, and establishes the design philosophy for the refactor.

---

## 1.2 Current Architecture Analysis

### Data Flow: Work Order to Completion

The current system processes work orders through the following path:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. SUBMISSION                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  Client → POST /api/v1/work-orders                                     │
│       → WorkOrderService.submit(request)                               │
│       → WorkOrderStore.save(workOrder)                                 │
│       → QueueManager.enqueue(workOrder)                                │
│       → Status: QUEUED                                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  2. ORCHESTRATION SETUP (orchestrator.execute - 595 lines)             │
├─────────────────────────────────────────────────────────────────────────┤
│  • 15 dynamic imports loaded                                           │
│  • Workspace created based on source type                              │
│  • Lease acquired for workspace                                        │
│  • Gate plan resolved                                                  │
│  • Harness config resolved                                             │
│  • Loop strategy created                                               │
│  • Agent driver selected                                               │
│  • 16 callback functions defined inline                                │
│  • GitHub integration callbacks if applicable                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  3. RUN EXECUTION (run-executor.executeRun - 675 lines)                │
├─────────────────────────────────────────────────────────────────────────┤
│  SETUP:                                                                │
│    • Create run record                                                 │
│    • Start lease renewal interval                                      │
│    • Capture before state                                              │
│    • Initialize loop strategy                                          │
│                                                                         │
│  MAIN LOOP (while !terminal):                                          │
│    ┌────────────────────────────────────────────────────────────────┐  │
│    │ BUILD PHASE                                                    │  │
│    │   • Call onBuild(workspace, taskPrompt, feedback, iteration)   │  │
│    │   • Handle streaming if broadcaster available                   │  │
│    │   • Record agent result                                        │  │
│    │   • Persist agent result to disk                               │  │
│    │   • On failure: classify error, transition to FAILED           │  │
│    └────────────────────────────────────────────────────────────────┘  │
│                          │                                             │
│                          ▼                                             │
│    ┌────────────────────────────────────────────────────────────────┐  │
│    │ PUSH ITERATION (if GitHub)                                     │  │
│    │   • Create commit message                                      │  │
│    │   • Push to branch                                             │  │
│    │   • Log warning if fails (non-fatal)                           │  │
│    └────────────────────────────────────────────────────────────────┘  │
│                          │                                             │
│                          ▼                                             │
│    ┌────────────────────────────────────────────────────────────────┐  │
│    │ SNAPSHOT PHASE                                                 │  │
│    │   • Capture after state                                        │  │
│    │   • Track snapshot for strategy                                │  │
│    │   • Transition to VERIFYING                                    │  │
│    └────────────────────────────────────────────────────────────────┘  │
│                          │                                             │
│                          ▼                                             │
│    ┌────────────────────────────────────────────────────────────────┐  │
│    │ VERIFY PHASE                                                   │  │
│    │   • Run verification                                           │  │
│    │   • Persist verification report                                │  │
│    │   • Track for strategy                                         │  │
│    │   • If passed: handle PR/CI flow (100+ lines of nesting)       │  │
│    └────────────────────────────────────────────────────────────────┘  │
│                          │                                             │
│                          ▼                                             │
│    ┌────────────────────────────────────────────────────────────────┐  │
│    │ DECISION PHASE                                                 │  │
│    │   • Consult loop strategy                                      │  │
│    │   • Check limits (iterations, timeout)                         │  │
│    │   • Determine continue/stop                                    │  │
│    └────────────────────────────────────────────────────────────────┘  │
│                          │                                             │
│                          ▼                                             │
│    ┌────────────────────────────────────────────────────────────────┐  │
│    │ FEEDBACK PHASE (if continuing)                                 │  │
│    │   • Generate feedback from verification report                 │  │
│    │   • Transition to BUILDING                                     │  │
│    │   • Increment iteration                                        │  │
│    │   • Notify strategy of iteration end                           │  │
│    └────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  CLEANUP:                                                              │
│    • Clear lease renewal interval                                      │
│    • Return final run state                                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  4. COMPLETION                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  • Release workspace lease                                             │
│  • Update work order status                                            │
│  • Remove from active runs tracking                                    │
│  • Return result to caller                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### State Machine Definition

Current state machine in `state-machine.ts`:

```
States: QUEUED, LEASED, BUILDING, SNAPSHOTTING, VERIFYING, FEEDBACK,
        PR_CREATED, CI_POLLING, SUCCEEDED, FAILED, CANCELED

Transitions:
  QUEUED:
    WORKSPACE_ACQUIRED → LEASED
    USER_CANCELED → CANCELED
    SYSTEM_ERROR → FAILED

  LEASED:
    BUILD_STARTED → BUILDING
    USER_CANCELED → CANCELED
    SYSTEM_ERROR → FAILED

  BUILDING:
    BUILD_COMPLETED → SNAPSHOTTING
    BUILD_FAILED → FAILED
    USER_CANCELED → CANCELED
    SYSTEM_ERROR → FAILED

  SNAPSHOTTING:
    SNAPSHOT_COMPLETED → VERIFYING
    SNAPSHOT_FAILED → FAILED          ⚠️ DEFINED BUT NEVER EMITTED
    USER_CANCELED → CANCELED
    SYSTEM_ERROR → FAILED

  VERIFYING:
    VERIFY_PASSED → SUCCEEDED
    VERIFY_FAILED_RETRYABLE → FEEDBACK
    VERIFY_FAILED_TERMINAL → FAILED
    PR_CREATED → PR_CREATED
    USER_CANCELED → CANCELED
    SYSTEM_ERROR → FAILED

  FEEDBACK:
    FEEDBACK_GENERATED → BUILDING
    USER_CANCELED → CANCELED
    SYSTEM_ERROR → FAILED
    ⚠️ MISSING: VERIFY_FAILED_TERMINAL → FAILED

  PR_CREATED:
    CI_POLLING_STARTED → CI_POLLING
    VERIFY_PASSED → SUCCEEDED         ✓ Added in v0.2.22
    USER_CANCELED → CANCELED
    SYSTEM_ERROR → FAILED

  CI_POLLING:
    CI_PASSED → SUCCEEDED
    CI_FAILED → FEEDBACK
    CI_TIMEOUT → FAILED
    USER_CANCELED → CANCELED
    SYSTEM_ERROR → FAILED
```

---

## 1.3 Problems Catalog

### Category A: State Machine Bugs

#### A1: Missing FEEDBACK → VERIFY_FAILED_TERMINAL

**Location**: `state-machine.ts` line 46-50

**Problem**: When CI fails and retry is exhausted, code tries to transition from FEEDBACK to FAILED via VERIFY_FAILED_TERMINAL, but this transition doesn't exist.

**Code Path**:
```
1. CI_FAILED event transitions to FEEDBACK (line 604 in run-executor.ts)
2. Check if retry disabled or max iterations (line 613)
3. Attempt VERIFY_FAILED_TERMINAL from FEEDBACK (line 618)
4. ❌ Throws "Invalid transition: FEEDBACK + VERIFY_FAILED_TERMINAL"
5. Caught by outer try-catch
6. Marked as SYSTEM_ERROR instead of FAILED_VERIFICATION
```

**Impact**: Wrong error classification, misleading run status

#### A2: SNAPSHOT_FAILED Never Emitted

**Location**: `run-executor.ts` lines 517-540

**Problem**: State machine defines SNAPSHOT_FAILED transition but it's never used. Snapshot failures fall through to generic SYSTEM_ERROR.

**Impact**: Less specific error classification

#### A3: No Guard Before SNAPSHOTTING

**Location**: `run-executor.ts` line 492

**Problem**: Unlike BUILDING (which has guard at line 408), SNAPSHOTTING has no state guard. If state is somehow already SNAPSHOTTING, could execute snapshot twice.

**Impact**: Potential double execution, inconsistent state

### Category B: Monolithic Functions

#### B1: executeRun() Is 675 Lines

**Location**: `run-executor.ts` lines 214-889

**Responsibilities** (8+ concerns):
1. Run creation and initialization
2. Lease renewal setup
3. Loop strategy initialization
4. Timeout enforcement
5. Build phase execution
6. Snapshot phase execution
7. Verification phase execution
8. Feedback generation
9. GitHub push integration
10. PR creation
11. CI polling
12. Streaming callback creation
13. Iteration data persistence
14. Error classification

**Impact**: Impossible to test individual phases, high cognitive load

#### B2: orchestrator.execute() Is 595 Lines

**Location**: `orchestrator.ts` lines 109-701

**Responsibilities**:
1. Dynamic module imports (15 modules)
2. Workspace creation logic (4 source types)
3. Lease acquisition
4. Gate plan resolution
5. Harness config resolution
6. Agent driver selection
7. 16 callback definitions
8. GitHub integration setup
9. Run execution delegation
10. Cleanup

**Impact**: Changes require understanding entire function

### Category C: Callback Chaos

#### C1: 16 Callback Parameters

**Location**: `run-executor.ts` lines 144-207

```typescript
interface RunExecutorOptions {
  // Core callbacks
  onBuild: (...) => Promise<BuildResult>
  onSnapshot: (...) => Promise<Snapshot>
  onVerify: (...) => Promise<VerificationReport>
  onFeedback: (...) => Promise<string>
  onCaptureBeforeState: (...) => Promise<BeforeState>

  // Lifecycle callbacks
  onRunStarted?: (...) => Promise<void>
  onStateChange?: (...) => void
  onIterationComplete?: (...) => void

  // Metrics callbacks
  onPhaseStart?: (...) => void
  onPhaseEnd?: (...) => void
  onAgentResult?: (...) => void
  onSnapshotCaptured?: (...) => void
  onVerificationComplete?: (...) => void

  // GitHub callbacks
  onPushIteration?: (...) => Promise<void>
  onCreatePullRequest?: (...) => Promise<...>
  onPollCI?: (...) => Promise<...>
}
```

**Impact**:
- Testing requires mocking 16 functions
- Unclear which are required vs optional
- No type safety on callback ordering

### Category D: Silent Failures

#### D1: Strategy Errors Swallowed

**Location**: `run-executor.ts` lines 397, 720, 768, 826

```typescript
} catch (error) {
  log.warn({ error, runId, iteration }, 'Strategy onIterationStart failed');
  // Continue execution - strategy errors should not fail the run
}
```

**Impact**: Bugs in strategy code are hidden, behavior becomes unpredictable

#### D2: GitHub Push Failures Non-Fatal

**Location**: `run-executor.ts` lines 496-515

**Impact**: Run can succeed even if commits weren't pushed

#### D3: Persistence Failures Non-Fatal

**Location**: `run-executor.ts` lines 558-564

**Impact**: Data loss without notification

### Category E: Dual-Stack Architecture

#### E1: Two Execution Paths

**Legacy Path** (used in production):
```
WorkOrder → Orchestrator.execute() → executeRun()
```

**New Path** (exists but unused):
```
TaskSpec → ExecutionCoordinator.execute() → ConvergenceController.run()
```

**Impact**: Duplicate code, confusion about which to use, features only in one path

### Category F: Hardcoded Integrations

#### F1: GitHub Logic in Orchestrator

**Location**: `orchestrator.ts` lines 514-672

**Problem**: 160+ lines of GitHub-specific code embedded in orchestrator

**Impact**: Can't support GitLab/Gitea without major changes

### Category G: Configuration Complexity

#### G1: Config Values Scattered

Config values accessed from multiple locations:
- `config.verification.ciRetryEnabled` (run-executor.ts line 613)
- `config.verification.localRetryEnabled` (line 681)
- `config.ci.waitByDefault` (line 245)
- `config.ci.maxIterations` (line 246)
- `config.maxConcurrentRuns` (orchestrator.ts line 83)

**Impact**: Hard to understand what config affects behavior

---

## 1.4 What Works Well (Preserve These)

### State Machine Pattern

The fundamental idea of a state machine with explicit transitions is excellent. It provides:
- Clear audit trail
- Prevents invalid states
- Deterministic behavior

**Keep**: The state machine pattern. **Fix**: The missing transitions.

### Immutable State Updates

```typescript
run = applyTransition(run, event)  // Returns new Run
await saveRun(run)
```

**Keep**: Immutable updates prevent mutation bugs.

### Error Classification

ErrorBuilder provides structured error categorization:
- Agent errors (CRASH, TIMEOUT, TASK_FAILURE)
- Verification errors (TYPECHECK, LINT, TEST)
- System errors (WORKSPACE, SNAPSHOT, GITHUB)

**Keep**: ErrorBuilder pattern. **Extend**: Add new error types.

### Strategy Pattern for Convergence

Pluggable strategies (fixed, hybrid, ralph) allow different convergence behaviors.

**Keep**: Strategy pattern. **Fix**: Error handling within strategies.

### Iteration Data Tracking

Rich telemetry per iteration enables analysis:
- Agent metrics (tokens, cost, duration)
- Verification results
- Error details

**Keep**: IterationData structure. **Extend**: Add more metrics.

### Lease-Based Concurrency

Workspace leasing prevents concurrent corruption:
- Clear ownership
- Natural expiry if process dies

**Keep**: Lease pattern entirely.

---

## 1.5 Design Philosophy

### Principle 1: Single Responsibility

Every module, class, and function should have one reason to change.

**Application**:
- Phase handlers: one phase per handler
- State machine: only state transitions
- DeliveryManager: only delivery logic

### Principle 2: Explicit Over Implicit

Make behavior visible and predictable.

**Application**:
- Strategy errors fail the run (not swallowed)
- All state transitions explicit and tested
- No hidden side effects

### Principle 3: Composition Over Configuration

Build complex behavior from simple pieces.

**Application**:
- PhaseOrchestrator composes phase handlers
- ExecutionEngine composes convergence + phases + delivery
- No 16-callback parameter lists

### Principle 4: Type Safety

Leverage TypeScript to prevent bugs at compile time.

**Application**:
- Typed context objects
- Exhaustive switch statements on enums
- No `any` types in core execution path

### Principle 5: Testability

Design for testing from the start.

**Application**:
- Phase handlers testable in isolation
- State machine transitions 100% covered
- Mocking minimized through composition

### Principle 6: Observability

Make system behavior visible.

**Application**:
- Progress events for every iteration
- Structured logging with context
- Metrics for monitoring

---

## 1.6 Component Mapping: Old to New

| Old Component | New Component | Change Type |
|---------------|---------------|-------------|
| `executeRun()` | `ExecutionEngine.run()` | Replace |
| `orchestrator.execute()` | `ExecutionEngine` + handlers | Replace |
| Inline callbacks | `PhaseHandler` classes | Replace |
| GitHub code in orchestrator | `GitHubDeliveryManager` | Extract |
| Strategy error swallowing | Fail-fast with classification | Fix |
| Manual state transitions | Type-validated transitions | Improve |
| Missing transitions | Complete transition table | Fix |

---

## 1.7 New Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ExecutionEngine                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ExecutionContext                                                      │
│   ├── taskSpec: ResolvedTaskSpec                                       │
│   ├── workOrder: WorkOrder                                             │
│   ├── workspace: Workspace                                             │
│   ├── run: Run (mutable state)                                         │
│   └── services: ExecutionServices                                      │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    StateMachine                                  │  │
│   │  • Complete transition table                                    │  │
│   │  • Type-safe guards                                             │  │
│   │  • Transition validation                                        │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                               │                                         │
│                               ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                 PhaseOrchestrator                                │  │
│   │                                                                  │  │
│   │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐       │  │
│   │  │  Build    │ │  Snapshot │ │  Verify   │ │  Feedback │       │  │
│   │  │  Phase    │→│  Phase    │→│  Phase    │→│  Phase    │       │  │
│   │  │  Handler  │ │  Handler  │ │  Handler  │ │  Handler  │       │  │
│   │  └───────────┘ └───────────┘ └───────────┘ └───────────┘       │  │
│   │                                                                  │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                               │                                         │
│                               ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                 ConvergenceController                            │  │
│   │  • Strategy consultation                                        │  │
│   │  • Gate evaluation                                              │  │
│   │  • Limit enforcement                                            │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                               │                                         │
│                               ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                   DeliveryManager                                │  │
│   │  • GitHubDeliveryManager                                        │  │
│   │  • LocalDeliveryManager                                         │  │
│   │  • (Future: GitLabDeliveryManager)                              │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                               │                                         │
│                               ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                   ProgressEmitter                                │  │
│   │  • Iteration events                                             │  │
│   │  • Phase events                                                 │  │
│   │  • Metrics                                                      │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1.8 Success Metrics

### Quantitative

| Metric | Current | Target |
|--------|---------|--------|
| executeRun() lines | 675 | 0 (deprecated) |
| orchestrator.execute() lines | 595 | <100 |
| Callback parameters | 16 | 0 |
| Phase handler lines (each) | N/A | <150 |
| State machine test coverage | ~30% | 100% |
| Missing transitions | 2+ | 0 |

### Qualitative

- Developer can understand execution flow in <15 minutes
- Adding new phase requires changing one file
- Adding new VCS requires implementing one interface
- All edge cases have tests
- No silent failures
