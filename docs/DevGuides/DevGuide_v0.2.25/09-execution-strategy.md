# Appendix C: Execution Strategy (Dogfooding)

## Overview

This appendix describes how to use AgentGate itself to implement the v0.2.25 refactor. By "dogfooding" our own tool, we:

1. **Validate the tool** - Find bugs in AgentGate while using it
2. **Generate issues** - Create issues for any problems encountered
3. **Build confidence** - Prove the system works on real refactoring tasks
4. **Accelerate development** - Let the agent handle repetitive code changes

---

## Dogfooding Suitability Analysis

### Tasks Suitable for AgentGate

| Task | Suitability | Reasoning |
|------|-------------|-----------|
| State machine transition additions | HIGH | Well-defined, small scope, easily verified |
| Phase handler extraction | MEDIUM | Clear pattern, but multiple files |
| Test file creation | HIGH | Repetitive, template-based |
| Deprecation warnings | HIGH | Simple string additions |
| Interface definitions | MEDIUM | Type-only changes, no runtime risk |
| Documentation updates | HIGH | No runtime impact |

### Tasks Requiring Manual Implementation

| Task | Reasoning |
|------|-----------|
| ExecutionEngine core | Architectural decisions, complex integration |
| Orchestrator rewiring | High risk, needs human judgment |
| DeliveryManager abstraction | New patterns, design decisions |
| Feature flag infrastructure | Cross-cutting, affects configuration |
| Migration testing | Requires human verification of behavior |

---

## Execution Plan

### Phase 1: Foundation (Manual + AgentGate)

**Week 1: State Machine Completion**

#### Task 1.1: Add Missing Transitions (AgentGate)

**Work Order**:
```yaml
goal: |
  Add the missing VERIFY_FAILED_TERMINAL transition to the FEEDBACK state
  in the state machine.

  In packages/server/src/orchestrator/state-machine.ts, find the FEEDBACK
  state transitions (around line 46) and add:
  [RunEvent.VERIFY_FAILED_TERMINAL]: RunState.FAILED

  This fixes Bug #65 where CI failures with retry disabled incorrectly
  become SYSTEM_ERROR instead of FAILED_VERIFICATION.

verification:
  - type: build
    command: pnpm build
  - type: test
    command: pnpm test
  - type: custom
    command: |
      grep -q "VERIFY_FAILED_TERMINAL.*FAILED" packages/server/src/orchestrator/state-machine.ts
```

**Expected Outcome**: Single-line addition, all tests pass.

**Issue Template if Fails**:
```markdown
## Bug Report: AgentGate Failed to Add State Transition

**Work Order Goal**: Add VERIFY_FAILED_TERMINAL to FEEDBACK state
**Failure Mode**: [describe what went wrong]
**Agent Output**: [attach relevant logs]

### Expected Behavior
Agent should add one line to state-machine.ts

### Actual Behavior
[describe what happened]

### Environment
- AgentGate version: 0.2.24
- Work order ID: [id]
```

---

#### Task 1.2: Add SNAPSHOT_FAILED Emission (AgentGate)

**Work Order**:
```yaml
goal: |
  Add SNAPSHOT_FAILED event emission to run-executor.ts when the snapshot
  phase fails.

  Find the snapshot phase in executeRun() (around line 430-450) and wrap
  it in a try-catch that emits SNAPSHOT_FAILED on failure:

  try {
    // existing snapshot code
  } catch (snapshotError) {
    run = stateMachine.transition(run, RunEvent.SNAPSHOT_FAILED);
    throw snapshotError;
  }

  The SNAPSHOT_FAILED event is already defined in state-machine.ts but
  never emitted.

verification:
  - type: build
  - type: test
  - type: custom
    command: |
      grep -q "SNAPSHOT_FAILED" packages/server/src/orchestrator/run-executor.ts
```

---

#### Task 1.3: State Machine Validation Tests (AgentGate)

**Work Order**:
```yaml
goal: |
  Create comprehensive state machine validation tests that verify:
  1. Every state has at least one outgoing transition
  2. Every event is handled by at least one state
  3. All terminal states have no outgoing transitions
  4. The happy path (PENDING → SUCCEEDED) works
  5. All failure paths reach terminal states

  Create file: packages/server/test/unit/orchestrator/state-machine-complete.test.ts

  Use the existing test patterns from state-machine.test.ts as reference.
  Import the state machine and test each transition systematically.

verification:
  - type: build
  - type: test
    command: pnpm --filter @agentgate/server test -- state-machine-complete
```

---

### Phase 2: New Components (AgentGate Heavy)

**Week 1-2: Phase Handlers**

#### Task 2.1: Create Phase Types (AgentGate)

**Work Order**:
```yaml
goal: |
  Create the phase handler type definitions in a new file:
  packages/server/src/execution/phases/types.ts

  Define these interfaces based on the DevGuide specification:
  - Phase enum (BUILD, SNAPSHOT, VERIFY, FEEDBACK)
  - PhaseContext interface
  - PhaseResult interface
  - PhaseHandler interface
  - PhaseServices interface

  Export all types. Do not implement any logic, just types.

  Reference: docs/DevGuides/DevGuide_v0.2.25/03-thrust-phase-handlers.md

verification:
  - type: build
  - type: custom
    command: |
      test -f packages/server/src/execution/phases/types.ts
```

---

#### Task 2.2: Create BuildPhaseHandler (AgentGate)

**Work Order**:
```yaml
goal: |
  Create the BuildPhaseHandler implementation:
  packages/server/src/execution/phases/build-handler.ts

  This handler executes the agent to make code changes. It should:
  1. Import types from ./types.ts
  2. Implement PhaseHandler interface
  3. Call agentDriver.execute() with prompt and feedback
  4. Return PhaseResult with success/failure and output
  5. Handle agent timeout gracefully
  6. Log progress via context.logger

  Keep it under 100 lines. Extract logic from run-executor.ts lines 380-450.

  Reference: docs/DevGuides/DevGuide_v0.2.25/03-thrust-phase-handlers.md section 2.3.2

verification:
  - type: build
  - type: test
```

---

#### Task 2.3: Create SnapshotPhaseHandler (AgentGate)

**Work Order**:
```yaml
goal: |
  Create the SnapshotPhaseHandler implementation:
  packages/server/src/execution/phases/snapshot-handler.ts

  This handler captures workspace state after agent changes. It should:
  1. Capture git diff
  2. Capture file changes list
  3. Create commit with changes
  4. Return snapshot data in PhaseResult

  Extract logic from run-executor.ts snapshot section (around lines 450-500).
  Keep under 80 lines.

  Reference: docs/DevGuides/DevGuide_v0.2.25/03-thrust-phase-handlers.md section 2.3.3

verification:
  - type: build
  - type: test
```

---

#### Task 2.4: Create VerifyPhaseHandler (AgentGate)

**Work Order**:
```yaml
goal: |
  Create the VerifyPhaseHandler implementation:
  packages/server/src/execution/phases/verify-handler.ts

  This handler runs verification gates. It should:
  1. Accept gate plan from context
  2. Run each gate in sequence
  3. Collect results with pass/fail status
  4. Return early on first failure (or continue based on config)
  5. Return PhaseResult with all gate results

  Extract logic from run-executor.ts verify section (around lines 500-580).
  Keep under 100 lines.

  Reference: docs/DevGuides/DevGuide_v0.2.25/03-thrust-phase-handlers.md section 2.3.4

verification:
  - type: build
  - type: test
```

---

#### Task 2.5: Create FeedbackPhaseHandler (AgentGate)

**Work Order**:
```yaml
goal: |
  Create the FeedbackPhaseHandler implementation:
  packages/server/src/execution/phases/feedback-handler.ts

  This handler generates feedback for retry. It should:
  1. Accept failed gate results
  2. Format failure information for agent
  3. Generate actionable feedback string
  4. Return PhaseResult with feedback text

  Extract logic from run-executor.ts feedback section (around lines 600-650).
  Keep under 60 lines.

  Reference: docs/DevGuides/DevGuide_v0.2.25/03-thrust-phase-handlers.md section 2.3.5

verification:
  - type: build
  - type: test
```

---

#### Task 2.6: Create PhaseOrchestrator (Manual)

**Why Manual**: This is the integration point that coordinates all phase handlers. Requires architectural decisions about error handling, timing, and phase sequencing.

**Developer Tasks**:
1. Create `packages/server/src/execution/phases/orchestrator.ts`
2. Implement executeIteration() method
3. Wire up all phase handlers
4. Add timing instrumentation
5. Handle phase failures gracefully
6. Write integration tests

---

### Phase 3: ExecutionEngine (Manual)

**Week 2: Core Engine**

**Why Manual**: The ExecutionEngine is the architectural centerpiece. It requires:
- Design decisions about concurrency
- Error recovery strategies
- Component wiring decisions
- Careful state management

**Developer Tasks**:

1. **Create engine.ts**
   - File: `packages/server/src/execution/engine.ts`
   - Implement ExecutionEngine interface
   - Create context management
   - Implement main execution loop

2. **Create context.ts**
   - File: `packages/server/src/execution/context.ts`
   - Define ExecutionContext types
   - Define ExecutionState types
   - Define ExecutionMetrics types

3. **Integration Testing**
   - Create integration tests
   - Test with mock components
   - Test error scenarios

---

### Phase 4: Delivery Manager (AgentGate + Manual)

**Week 2-3: Pluggable Delivery**

#### Task 4.1: Create Delivery Types (AgentGate)

**Work Order**:
```yaml
goal: |
  Create delivery manager type definitions:
  packages/server/src/delivery/types.ts

  Define these interfaces:
  - DeliveryConfig interface
  - DeliveryResult interface
  - PRResult interface
  - CIResult interface
  - DeliveryManager interface

  Reference: docs/DevGuides/DevGuide_v0.2.25/05-thrust-delivery-manager.md

verification:
  - type: build
```

---

#### Task 4.2: Create GitHubDeliveryManager (Manual)

**Why Manual**: GitHub API integration requires careful handling of:
- Authentication
- Rate limiting
- Error scenarios
- PR creation edge cases

**Developer Tasks**:
1. Extract GitHub logic from current codebase
2. Implement DeliveryManager interface
3. Handle all GitHub API errors
4. Add retry logic

---

#### Task 4.3: Create LocalDeliveryManager (AgentGate)

**Work Order**:
```yaml
goal: |
  Create local delivery manager for testing:
  packages/server/src/delivery/local-manager.ts

  This manager skips PR creation and CI for local testing. It should:
  1. Implement DeliveryManager interface
  2. Return success without creating PR
  3. Log what would have been done
  4. Support dry-run mode

  Keep under 50 lines.

  Reference: docs/DevGuides/DevGuide_v0.2.25/05-thrust-delivery-manager.md section 4.3.4

verification:
  - type: build
  - type: test
```

---

### Phase 5: Observability (AgentGate Heavy)

**Week 3: Progress Events**

#### Task 5.1: Create ProgressEmitter (AgentGate)

**Work Order**:
```yaml
goal: |
  Create progress emitter implementation:
  packages/server/src/observability/progress-emitter.ts

  Implement DefaultProgressEmitter class with methods:
  - emitRunStarted()
  - emitRunCompleted()
  - emitIterationStarted()
  - emitIterationCompleted()
  - emitPhaseStarted()
  - emitPhaseCompleted()
  - subscribe() for listeners

  Use event emitter pattern. Log all events.

  Reference: docs/DevGuides/DevGuide_v0.2.25/06-thrust-observability.md

verification:
  - type: build
  - type: test
```

---

#### Task 5.2: Create MetricsCollector (AgentGate)

**Work Order**:
```yaml
goal: |
  Create metrics collector for monitoring:
  packages/server/src/observability/metrics.ts

  Implement DefaultMetricsCollector with:
  - Counter methods (incrementRunsStarted, etc.)
  - Histogram methods (recordRunDuration, etc.)
  - Gauge methods (setActiveRuns)
  - getMetrics() returning Prometheus format

  Reference: docs/DevGuides/DevGuide_v0.2.25/06-thrust-observability.md section 5.3.4

verification:
  - type: build
  - type: test
```

---

#### Task 5.3: Add /metrics Endpoint (AgentGate)

**Work Order**:
```yaml
goal: |
  Add Prometheus metrics endpoint to the server.

  In packages/server/src/server/routes/health.ts, add:

  router.get('/metrics', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(metricsCollector.getMetrics());
  });

  Import metricsCollector from observability module.

verification:
  - type: build
  - type: test
  - type: custom
    command: |
      grep -q "'/metrics'" packages/server/src/server/routes/health.ts
```

---

### Phase 6: Integration (Manual)

**Week 3: Wire Everything Together**

**Why Manual**: Integration requires:
- Careful orchestration of all components
- Feature flag setup
- Shadow mode implementation
- Comparison testing

**Developer Tasks**:

1. **Add Feature Flags**
   - Add USE_NEW_ENGINE environment variable
   - Add SHADOW_NEW_ENGINE for comparison mode
   - Update config.ts

2. **Wire Orchestrator**
   - Modify orchestrator.ts to use ExecutionEngine
   - Add conditional path based on feature flag
   - Implement shadow mode

3. **Deprecate Legacy**
   - Add deprecation warnings to executeRun()
   - Update JSDoc comments
   - Log usage of deprecated paths

4. **Comparison Testing**
   - Create tests that run both paths
   - Compare results for equivalence
   - Document any differences

---

## Issue Creation Protocol

When AgentGate fails on a work order, create an issue using this template:

### Bug Report Template

```markdown
## Dogfooding Bug Report

**Context**: v0.2.25 Implementation
**Phase**: [1-6]
**Task**: [task number and name]

### Work Order Details
- **Goal**: [brief goal description]
- **Work Order ID**: [if available]
- **Run ID**: [if available]

### Failure Mode
- [ ] Agent couldn't understand the task
- [ ] Agent made incorrect changes
- [ ] Verification failed incorrectly
- [ ] Build/test failed
- [ ] Timeout
- [ ] Other: [describe]

### Expected Behavior
[What should have happened]

### Actual Behavior
[What actually happened]

### Logs/Output
\`\`\`
[Relevant agent output or error logs]
\`\`\`

### Reproduction Steps
1. Submit work order with goal: [goal]
2. [additional steps]

### Severity
- [ ] Blocker - Cannot continue dogfooding
- [ ] Major - Workaround required
- [ ] Minor - Inconvenient but workable

### Suggested Fix
[If you have ideas on what might be wrong]
```

---

## Progress Tracking

### Execution Checklist

**Phase 1: Foundation**
- [ ] 1.1 Add VERIFY_FAILED_TERMINAL to FEEDBACK (AgentGate)
- [ ] 1.2 Add SNAPSHOT_FAILED emission (AgentGate)
- [ ] 1.3 State machine validation tests (AgentGate)
- [ ] 1.4 Bug #65 regression test (AgentGate)

**Phase 2: Phase Handlers**
- [ ] 2.1 Phase types (AgentGate)
- [ ] 2.2 BuildPhaseHandler (AgentGate)
- [ ] 2.3 SnapshotPhaseHandler (AgentGate)
- [ ] 2.4 VerifyPhaseHandler (AgentGate)
- [ ] 2.5 FeedbackPhaseHandler (AgentGate)
- [ ] 2.6 PhaseOrchestrator (Manual)

**Phase 3: ExecutionEngine**
- [ ] 3.1 Engine interface and implementation (Manual)
- [ ] 3.2 Context types (Manual)
- [ ] 3.3 Integration tests (Manual)

**Phase 4: Delivery Manager**
- [ ] 4.1 Delivery types (AgentGate)
- [ ] 4.2 GitHubDeliveryManager (Manual)
- [ ] 4.3 LocalDeliveryManager (AgentGate)
- [ ] 4.4 Delivery registry (AgentGate)

**Phase 5: Observability**
- [ ] 5.1 ProgressEmitter (AgentGate)
- [ ] 5.2 MetricsCollector (AgentGate)
- [ ] 5.3 /metrics endpoint (AgentGate)
- [ ] 5.4 WebSocket integration (Manual)

**Phase 6: Integration**
- [ ] 6.1 Feature flags (Manual)
- [ ] 6.2 Wire orchestrator (Manual)
- [ ] 6.3 Deprecate legacy (Manual)
- [ ] 6.4 Comparison tests (Manual)

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Tasks | 24 |
| AgentGate Tasks | 15 (62.5%) |
| Manual Tasks | 9 (37.5%) |
| Estimated AgentGate Work Orders | 15 |
| Expected Issues from Dogfooding | 3-5 |

---

## Success Criteria

The dogfooding phase is successful when:

1. **All AgentGate tasks complete** - 15 work orders submitted and merged
2. **Issues documented** - Any failures become tracked issues
3. **No regressions** - All existing tests continue to pass
4. **Feature flag works** - Can switch between legacy and new paths
5. **Comparison tests pass** - Both paths produce equivalent results

---

## Contingency Plans

### If AgentGate Can't Complete a Task

1. **Simplify the task** - Break into smaller pieces
2. **Add more verification** - Tighter constraints help the agent
3. **Manual implementation** - Move task to manual list
4. **Create issue** - Document why it failed

### If Too Many Failures

1. **Pause dogfooding** - Fix underlying issues first
2. **Review work order quality** - Are goals clear enough?
3. **Check verification gates** - Are they testing the right things?
4. **Assess agent capabilities** - Some tasks may be too complex

### If Integration Fails

1. **Rollback feature flag** - Disable new engine
2. **Bisect changes** - Find which component broke
3. **Add more tests** - Cover the failure case
4. **Fix and retry** - Incremental progress

---

## Next Steps After v0.2.25

Once this refactor is complete:

1. **v0.2.26**: Enable new engine by default
2. **v0.2.27**: Remove shadow mode, stabilize
3. **v0.3.0**: Remove deprecated code, breaking change

The dogfooding approach will be repeated for each subsequent version, continuously validating AgentGate's capabilities while improving its own codebase.
