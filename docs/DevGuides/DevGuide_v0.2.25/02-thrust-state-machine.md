# Thrust 1: State Machine Completion

## 1.1 Objective

Audit and complete the run state machine to eliminate Bug #65 class of errors. Every valid execution path must have corresponding state transitions. The state machine becomes the single source of truth for valid run behavior.

---

## 1.2 Background

### Current State Machine Location

File: `packages/server/src/orchestrator/state-machine.ts`

The state machine manages run lifecycle through defined states and events. However, it has gaps that cause incorrect error classification.

### Bug #65 Root Cause Analysis

**Scenario**: CI fails after PR creation, retry disabled

**Expected Flow**:
1. Verification passes → PR created → State: PR_CREATED
2. CI polling starts → State: CI_POLLING
3. CI fails → State: FEEDBACK
4. Retry disabled, attempt terminal failure
5. Expected: VERIFY_FAILED_TERMINAL → FAILED with FAILED_VERIFICATION result

**Actual Flow**:
1-4. Same as expected
5. VERIFY_FAILED_TERMINAL not valid from FEEDBACK
6. Throws "Invalid transition"
7. Caught by outer catch, SYSTEM_ERROR applied
8. Actual: SYSTEM_ERROR → FAILED with FAILED_ERROR result

**Why This Is Wrong**:
- Error classified as system error instead of verification failure
- Misleading status for users and monitoring
- Hidden bug in state machine

---

## 1.3 Subtasks

### 1.3.1 Audit All State Transitions

**Action**: Trace every code path in `run-executor.ts` and map to state machine transitions

**Current Transition Table Analysis**:

```
State: QUEUED
├── WORKSPACE_ACQUIRED → LEASED     ✓ Used at line 291
├── USER_CANCELED → CANCELED        ✓ Via cancelRun()
└── SYSTEM_ERROR → FAILED           ✓ Used in catch blocks

State: LEASED
├── BUILD_STARTED → BUILDING        ✓ Used at line 409
├── USER_CANCELED → CANCELED        ✓ Via cancelRun()
└── SYSTEM_ERROR → FAILED           ✓ Used in catch blocks

State: BUILDING
├── BUILD_COMPLETED → SNAPSHOTTING  ✓ Used at line 492
├── BUILD_FAILED → FAILED           ✓ Used at line 484
├── USER_CANCELED → CANCELED        ✓ Via cancelRun()
└── SYSTEM_ERROR → FAILED           ✓ Used in catch blocks

State: SNAPSHOTTING
├── SNAPSHOT_COMPLETED → VERIFYING  ✓ Used at line 537
├── SNAPSHOT_FAILED → FAILED        ⚠️ DEFINED BUT NEVER USED
├── USER_CANCELED → CANCELED        ✓ Via cancelRun()
└── SYSTEM_ERROR → FAILED           ✓ Fallback in catch blocks

State: VERIFYING
├── VERIFY_PASSED → SUCCEEDED       ✓ Multiple locations
├── VERIFY_FAILED_RETRYABLE → FEEDBACK  ✓ Line 785
├── VERIFY_FAILED_TERMINAL → FAILED     ✓ Line 772
├── PR_CREATED → PR_CREATED         ✓ Line 580
├── USER_CANCELED → CANCELED        ✓ Via cancelRun()
└── SYSTEM_ERROR → FAILED           ✓ Used in catch blocks

State: FEEDBACK
├── FEEDBACK_GENERATED → BUILDING   ✓ Used at line 795
├── USER_CANCELED → CANCELED        ✓ Via cancelRun()
├── SYSTEM_ERROR → FAILED           ✓ Used in catch blocks
└── ❌ MISSING: VERIFY_FAILED_TERMINAL → FAILED

State: PR_CREATED
├── CI_POLLING_STARTED → CI_POLLING ✓ Line 589
├── VERIFY_PASSED → SUCCEEDED       ✓ Line 642 (added v0.2.22)
├── USER_CANCELED → CANCELED        ✓ Via cancelRun()
└── SYSTEM_ERROR → FAILED           ✓ Used in catch blocks

State: CI_POLLING
├── CI_PASSED → SUCCEEDED           ✓ Line 598
├── CI_FAILED → FEEDBACK            ✓ Line 604
├── CI_TIMEOUT → FAILED             ✓ Line 633
├── USER_CANCELED → CANCELED        ✓ Via cancelRun()
└── SYSTEM_ERROR → FAILED           ✓ Used in catch blocks
```

**Findings**:
1. FEEDBACK state missing VERIFY_FAILED_TERMINAL transition
2. SNAPSHOT_FAILED event defined but never emitted
3. No validation that all defined transitions are used

---

### 1.3.2 Add Missing FEEDBACK → VERIFY_FAILED_TERMINAL Transition

**File Modified**: `packages/server/src/orchestrator/state-machine.ts`

**Change Description**:

Add VERIFY_FAILED_TERMINAL as valid transition from FEEDBACK state.

**Current Code** (lines 46-50):
```typescript
[RunState.FEEDBACK]: {
  [RunEvent.FEEDBACK_GENERATED]: RunState.BUILDING,
  [RunEvent.USER_CANCELED]: RunState.CANCELED,
  [RunEvent.SYSTEM_ERROR]: RunState.FAILED,
},
```

**New Code**:
```typescript
[RunState.FEEDBACK]: {
  [RunEvent.FEEDBACK_GENERATED]: RunState.BUILDING,
  [RunEvent.VERIFY_FAILED_TERMINAL]: RunState.FAILED,  // Added: CI retry exhausted
  [RunEvent.USER_CANCELED]: RunState.CANCELED,
  [RunEvent.SYSTEM_ERROR]: RunState.FAILED,
},
```

**Rationale**:

When in FEEDBACK state (after CI failure), if retry is disabled or max iterations reached, the run should transition to FAILED with FAILED_VERIFICATION result, not FAILED_ERROR.

**Verification**:
- [ ] Transition added to state machine
- [ ] Test covers this specific path
- [ ] Bug #65 scenario no longer produces SYSTEM_ERROR

---

### 1.3.3 Emit SNAPSHOT_FAILED Event Appropriately

**File Modified**: `packages/server/src/orchestrator/run-executor.ts`

**Change Description**:

Currently snapshot failures are caught by the generic outer try-catch and result in SYSTEM_ERROR. Instead, catch snapshot-specific errors and emit SNAPSHOT_FAILED.

**Current Code** (lines 517-540 conceptually):
```typescript
// SNAPSHOT PHASE
onPhaseStart?.('snapshot', iteration);
const snapshot = await onSnapshot(
  workspace,
  beforeState,
  runId,
  iteration,
  workOrder.taskPrompt
);
// If this throws, caught by outer catch → SYSTEM_ERROR
```

**New Approach**:

Wrap snapshot phase in dedicated try-catch:

```typescript
// SNAPSHOT PHASE
onPhaseStart?.('snapshot', iteration);
let snapshot: Snapshot;
try {
  snapshot = await onSnapshot(
    workspace,
    beforeState,
    runId,
    iteration,
    workOrder.taskPrompt
  );
} catch (snapshotError) {
  log.error({ runId, iteration, error: snapshotError }, 'Snapshot failed');

  const error = ErrorBuilder.fromSystemError(snapshotError, {
    runId,
    iteration,
    phase: 'snapshot',
  });

  run = applyTransition(run, RunEvent.SNAPSHOT_FAILED);
  run.result = RunResult.FAILED_ERROR;
  run.error = error.message;
  await saveRun(run);
  onStateChange?.(run);
  break;
}
onPhaseEnd?.('snapshot', iteration);
```

**Verification**:
- [ ] SNAPSHOT_FAILED now used when snapshot fails
- [ ] Error classification is SNAPSHOT_ERROR, not generic SYSTEM_ERROR
- [ ] Test covers snapshot failure scenario

---

### 1.3.4 Add Compile-Time Transition Validation

**File Created**: `packages/server/src/orchestrator/state-machine-validator.ts`

**Purpose**:

Validate at test time that:
1. All transitions defined in state machine are reachable in code
2. All transition attempts in code are valid in state machine
3. No orphan states or events

**Specification**:

Create a validation utility that analyzes the transition table:

```typescript
interface TransitionValidation {
  // Check that every state has at least one entry and one exit
  validateStateCompleteness(): ValidationResult;

  // Check that all events lead somewhere
  validateEventCoverage(): ValidationResult;

  // List all possible paths from QUEUED to terminal states
  enumeratePaths(): StatePath[];

  // Check for unreachable states
  findUnreachableStates(): RunState[];

  // Check for dead-end states (non-terminal with no exits)
  findDeadEndStates(): RunState[];
}

interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

interface ValidationIssue {
  type: 'missing_entry' | 'missing_exit' | 'orphan_event' | 'unreachable';
  state?: RunState;
  event?: RunEvent;
  message: string;
}
```

**Test Integration**:

Add validation test that runs on every test suite execution:

```typescript
describe('State Machine Validation', () => {
  it('has no missing transitions', () => {
    const validator = new StateMachineValidator(transitions);
    const result = validator.validateStateCompleteness();
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('has no unreachable states', () => {
    const validator = new StateMachineValidator(transitions);
    const unreachable = validator.findUnreachableStates();
    expect(unreachable).toEqual([]);
  });

  it('all non-terminal states have exits', () => {
    const validator = new StateMachineValidator(transitions);
    const deadEnds = validator.findDeadEndStates();
    expect(deadEnds).toEqual([]);
  });
});
```

**Verification**:
- [ ] Validator catches the FEEDBACK missing transition (before fix)
- [ ] Validator passes (after fix)
- [ ] Validator runs in CI

---

### 1.3.5 Create Complete State Transition Test Suite

**File Created**: `packages/server/test/unit/orchestrator/state-machine-complete.test.ts`

**Purpose**:

Test every single state transition to ensure:
1. Valid transitions succeed
2. Invalid transitions throw
3. Terminal states have correct results
4. Transition logging is correct

**Test Structure**:

```typescript
describe('State Machine Complete Coverage', () => {
  describe('QUEUED state', () => {
    it('transitions to LEASED on WORKSPACE_ACQUIRED', () => {
      const run = createRun('run-1', 'wo-1', 'ws-1', 3);
      expect(run.state).toBe(RunState.QUEUED);

      const newRun = applyTransition(run, RunEvent.WORKSPACE_ACQUIRED);
      expect(newRun.state).toBe(RunState.LEASED);
    });

    it('transitions to CANCELED on USER_CANCELED', () => {
      const run = createRun('run-1', 'wo-1', 'ws-1', 3);
      const newRun = applyTransition(run, RunEvent.USER_CANCELED);
      expect(newRun.state).toBe(RunState.CANCELED);
      expect(newRun.result).toBe(RunResult.CANCELED);
    });

    it('transitions to FAILED on SYSTEM_ERROR', () => {
      const run = createRun('run-1', 'wo-1', 'ws-1', 3);
      const newRun = applyTransition(run, RunEvent.SYSTEM_ERROR);
      expect(newRun.state).toBe(RunState.FAILED);
    });

    it('throws on invalid BUILD_COMPLETED event', () => {
      const run = createRun('run-1', 'wo-1', 'ws-1', 3);
      expect(() => applyTransition(run, RunEvent.BUILD_COMPLETED))
        .toThrow('Invalid transition: QUEUED + BUILD_COMPLETED');
    });
  });

  describe('FEEDBACK state', () => {
    it('transitions to BUILDING on FEEDBACK_GENERATED', () => {
      let run = createRun('run-1', 'wo-1', 'ws-1', 3);
      // Get to FEEDBACK state
      run = applyTransition(run, RunEvent.WORKSPACE_ACQUIRED);
      run = applyTransition(run, RunEvent.BUILD_STARTED);
      run = applyTransition(run, RunEvent.BUILD_COMPLETED);
      run = applyTransition(run, RunEvent.SNAPSHOT_COMPLETED);
      run = applyTransition(run, RunEvent.VERIFY_FAILED_RETRYABLE);
      expect(run.state).toBe(RunState.FEEDBACK);

      const newRun = applyTransition(run, RunEvent.FEEDBACK_GENERATED);
      expect(newRun.state).toBe(RunState.BUILDING);
    });

    it('transitions to FAILED on VERIFY_FAILED_TERMINAL', () => {
      // This is the Bug #65 fix test
      let run = createRunInFeedbackState();

      const newRun = applyTransition(run, RunEvent.VERIFY_FAILED_TERMINAL);
      expect(newRun.state).toBe(RunState.FAILED);
    });
  });

  describe('PR_CREATED state', () => {
    it('transitions to SUCCEEDED on VERIFY_PASSED (no CI)', () => {
      // This is the v0.2.22 fix test
      let run = createRunInPRCreatedState();

      const newRun = applyTransition(run, RunEvent.VERIFY_PASSED);
      expect(newRun.state).toBe(RunState.SUCCEEDED);
      expect(newRun.result).toBe(RunResult.PASSED);
    });
  });

  // ... tests for every other state and transition
});

describe('Bug #65 Scenario', () => {
  it('correctly fails with FAILED_VERIFICATION when CI retry exhausted', async () => {
    // Full scenario test
    const mockContext = createMockExecutionContext({
      ciEnabled: true,
      ciRetryEnabled: false,
    });

    // Simulate: build → snapshot → verify passes → PR created → CI fails
    // With ciRetryEnabled=false, should get FAILED_VERIFICATION not FAILED_ERROR

    const result = await executeWithScenario(mockContext, {
      buildSuccess: true,
      verifySuccess: true,
      prCreated: true,
      ciPasses: false,
    });

    expect(result.run.state).toBe(RunState.FAILED);
    expect(result.run.result).toBe(RunResult.FAILED_VERIFICATION);
    expect(result.run.error).toContain('CI');
  });
});
```

**Coverage Requirements**:
- Every (state, event) pair tested
- All valid transitions verified
- All invalid transitions throw
- Terminal state result assignment tested
- Edge case scenarios covered

**Verification**:
- [ ] 100% transition coverage
- [ ] Bug #65 scenario has dedicated test
- [ ] Tests pass with new transitions added

---

### 1.3.6 Add Type-Safe Transition Guards

**File Modified**: `packages/server/src/orchestrator/state-machine.ts`

**Purpose**:

Add compile-time checks that catch invalid transition attempts.

**Current Approach**:
```typescript
// Runtime check only
export function applyTransition(run: Run, event: RunEvent): Run {
  const nextState = getNextState(run.state, event);
  if (nextState === null) {
    throw new Error(`Invalid transition: ${run.state} + ${event}`);
  }
  // ...
}
```

**Enhanced Approach**:

Add type-level transition mapping:

```typescript
// Type-level transition table
type TransitionMap = {
  [RunState.QUEUED]:
    | typeof RunEvent.WORKSPACE_ACQUIRED
    | typeof RunEvent.USER_CANCELED
    | typeof RunEvent.SYSTEM_ERROR;
  [RunState.LEASED]:
    | typeof RunEvent.BUILD_STARTED
    | typeof RunEvent.USER_CANCELED
    | typeof RunEvent.SYSTEM_ERROR;
  [RunState.BUILDING]:
    | typeof RunEvent.BUILD_COMPLETED
    | typeof RunEvent.BUILD_FAILED
    | typeof RunEvent.USER_CANCELED
    | typeof RunEvent.SYSTEM_ERROR;
  // ... etc for all states
  [RunState.FEEDBACK]:
    | typeof RunEvent.FEEDBACK_GENERATED
    | typeof RunEvent.VERIFY_FAILED_TERMINAL  // Added!
    | typeof RunEvent.USER_CANCELED
    | typeof RunEvent.SYSTEM_ERROR;
};

// Type-safe transition function
export function transition<S extends RunState>(
  run: Run & { state: S },
  event: TransitionMap[S]
): Run {
  return applyTransition(run, event);
}
```

**Benefits**:
- IDE autocomplete shows only valid events for current state
- Compile errors for invalid transitions
- Documentation in types

**Verification**:
- [ ] Type definitions compile
- [ ] IDE shows correct autocomplete
- [ ] Invalid transitions caught at compile time

---

## 1.4 Verification Steps

### Unit Tests

```bash
# Run state machine tests specifically
pnpm --filter @agentgate/server test -- --grep "State Machine"

# Run complete coverage test
pnpm --filter @agentgate/server test -- state-machine-complete.test.ts

# Run validator tests
pnpm --filter @agentgate/server test -- state-machine-validator.test.ts
```

### Integration Tests

```bash
# Bug #65 scenario test
pnpm --filter @agentgate/server test:integration -- --grep "Bug 65"

# Full execution path tests
pnpm --filter @agentgate/server test:integration -- --grep "execution path"
```

### Manual Verification

1. **Bug #65 Reproduction**:
   - Submit work order with CI enabled, ciRetryEnabled=false
   - Ensure verification passes, PR created
   - Mock CI to fail
   - Verify run ends in FAILED with FAILED_VERIFICATION (not FAILED_ERROR)

2. **Snapshot Failure**:
   - Submit work order
   - Mock snapshot to throw
   - Verify run ends in FAILED with error referencing snapshot

---

## 1.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/orchestrator/state-machine.ts` | Modified | Add FEEDBACK → VERIFY_FAILED_TERMINAL |
| `packages/server/src/orchestrator/state-machine-validator.ts` | Created | Transition validation utility |
| `packages/server/src/orchestrator/run-executor.ts` | Modified | Add SNAPSHOT_FAILED emission |
| `packages/server/test/unit/orchestrator/state-machine-complete.test.ts` | Created | Complete transition coverage |
| `packages/server/test/unit/orchestrator/state-machine-validator.test.ts` | Created | Validator tests |
| `packages/server/test/integration/bug-65-scenario.test.ts` | Created | Bug reproduction test |

---

## 1.6 Dependencies

- **Depends on**: Nothing (foundation thrust)
- **Enables**: All other thrusts depend on correct state machine

---

## 1.7 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing transitions | Low | High | Complete test coverage before changes |
| Missing edge case | Medium | Medium | Validator catches structural issues |
| Type definition complexity | Low | Low | Gradual adoption, fallback to runtime |

---

## 1.8 Rollback Plan

If issues found after deployment:

1. The new transition (FEEDBACK → VERIFY_FAILED_TERMINAL) is additive
2. Can be removed without breaking existing flows
3. SNAPSHOT_FAILED is refinement, can revert to SYSTEM_ERROR fallback

No breaking changes to rollback.
