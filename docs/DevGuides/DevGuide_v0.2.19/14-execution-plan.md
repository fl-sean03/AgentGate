# 14: Execution Plan

## Overview

This document outlines the implementation sequence for v0.2.19, organized into phases with clear dependencies and verification steps.

---

## Phase 1: Observability Foundation

### Thrust 1: Persist AgentResult

**Priority:** Critical
**Dependencies:** None
**Estimated Complexity:** Medium

#### Implementation Steps

1. **Create type definitions**
   - Create `src/types/persisted-results.ts`
   - Define `PersistedAgentResult` interface
   - Define `SaveAgentResultOptions` interface

2. **Implement ResultPersister**
   - Create `src/orchestrator/result-persister.ts`
   - Implement `saveAgentResult()` method
   - Implement `loadAgentResult()` method
   - Implement `listAgentResults()` method
   - Add truncation logic for large outputs

3. **Integrate with orchestrator**
   - Import ResultPersister in orchestrator
   - Call `saveAgentResult()` after agent execution
   - Handle persistence errors gracefully (log, don't fail)

4. **Write tests**
   - Unit tests for ResultPersister
   - Integration test for save/load round-trip

**Verification:**
- [ ] Files created at `~/.agentgate/runs/{runId}/agent-{N}.json`
- [ ] Files contain full stdout, stderr, toolCalls
- [ ] Large outputs truncated with warning
- [ ] Persistence errors don't fail runs

---

### Thrust 2: Persist VerificationReport

**Priority:** Critical
**Dependencies:** Thrust 1 (uses same persister)
**Estimated Complexity:** Low

#### Implementation Steps

1. **Extend type definitions**
   - Add `PersistedVerificationReport` to `persisted-results.ts`

2. **Extend ResultPersister**
   - Add `saveVerificationReport()` method
   - Add `loadVerificationReport()` method
   - Add `listVerificationReports()` method

3. **Integrate with run executor**
   - Call `saveVerificationReport()` after verification
   - Pass harness config for skip levels recording

4. **Write tests**
   - Unit tests for verification persistence

**Verification:**
- [ ] Files created at `~/.agentgate/runs/{runId}/verification-{N}.json`
- [ ] Files contain all level results with check outputs
- [ ] Skipped levels recorded correctly

---

### Thrust 3: Enhanced IterationData

**Priority:** High
**Dependencies:** Thrusts 1-2
**Estimated Complexity:** Medium

#### Implementation Steps

1. **Update type definitions**
   - Add `IterationErrorType` enum to `run.ts`
   - Extend `IterationData` with new fields
   - Create `createIterationData()` helper

2. **Update run-store**
   - Add `saveIterationData()` function
   - Add `loadIterationData()` function
   - Add `updateWithAgentResult()` helper
   - Add `updateWithVerificationResult()` helper
   - Add `updateWithError()` helper

3. **Integrate with run executor**
   - Create IterationData at start of iteration
   - Update with results as they occur
   - Save at iteration completion

4. **Write tests**
   - Unit tests for all helpers

**Verification:**
- [ ] Files created at `~/.agentgate/runs/{runId}/iteration-{N}.json`
- [ ] Files reference agent and verification files
- [ ] Error types classified correctly

---

### Thrust 4: Structured Error Types

**Priority:** High
**Dependencies:** Thrusts 1-3
**Estimated Complexity:** Medium

#### Implementation Steps

1. **Create type definitions**
   - Create `src/types/build-error.ts`
   - Define `BuildErrorType` enum
   - Define `BuildError` interface
   - Add descriptions map

2. **Implement ErrorBuilder**
   - Create `src/orchestrator/error-builder.ts`
   - Implement `fromAgentResult()` method
   - Implement `fromVerificationReport()` method
   - Implement `fromSystemError()` method
   - Add classification logic

3. **Integrate with run executor**
   - Use ErrorBuilder for all failures
   - Store BuildError in run data
   - Include file references in errors

4. **Write tests**
   - Unit tests for error classification
   - Test each error type scenario

**Verification:**
- [ ] Errors include type classification
- [ ] Errors include file references
- [ ] Error messages are actionable
- [ ] Backwards compatible (string error still present)

---

## Phase 2: Reliability Improvements

### Thrust 5: Retry Policy

**Priority:** High
**Dependencies:** Thrust 4 (uses error types)
**Estimated Complexity:** Medium

#### Implementation Steps

1. **Create type definitions**
   - Create `src/types/retry-policy.ts`
   - Define `RetryPolicy`, `RetryAttempt`, `RetryResult`
   - Define default policies

2. **Implement RetryExecutor**
   - Create `src/orchestrator/retry-executor.ts`
   - Implement `execute()` with retry loop
   - Implement `calculateBackoff()` with jitter
   - Implement `isRetryable()` check

3. **Update HarnessConfig**
   - Add optional `retry` field

4. **Integrate with run executor**
   - Wrap agent execution with retry
   - Log retry attempts

5. **Write tests**
   - Unit tests for retry logic
   - Integration test for transient failure recovery

**Verification:**
- [ ] Transient failures retried
- [ ] Backoff timing correct
- [ ] Non-retryable errors fail fast
- [ ] Retry attempts logged

---

### Thrust 6: GitHub Operation Modes

**Priority:** Medium
**Dependencies:** Thrust 5 (uses retry)
**Estimated Complexity:** Low

#### Implementation Steps

1. **Create type definitions**
   - Create `src/types/github-mode.ts`
   - Define `GitHubMode` enum
   - Define `GitHubOperationResult` interface

2. **Implement GitHubHandler**
   - Create `src/orchestrator/github-handler.ts`
   - Implement mode-based execution
   - Track operations summary

3. **Update GitOpsConfig**
   - Add `githubMode` field

4. **Integrate with run executor**
   - Use GitHubHandler for all GitHub ops
   - Record summary in run data

5. **Write tests**
   - Unit tests for each mode

**Verification:**
- [ ] DISABLED skips GitHub operations
- [ ] FAIL_FAST fails run on error
- [ ] BEST_EFFORT continues with warning
- [ ] Operations summary recorded

---

### Thrust 7: Work Order Queue

**Priority:** Medium
**Dependencies:** None
**Estimated Complexity:** Medium

#### Implementation Steps

1. **Create type definitions**
   - Create `src/types/work-order-queue.ts`
   - Define `QueuePosition`, `QueueStats`
   - Add PENDING status

2. **Implement WorkOrderQueue**
   - Create `src/control-plane/work-order-queue.ts`
   - Implement priority queue
   - Implement position tracking
   - Emit events for ready/timeout

3. **Integrate with orchestrator**
   - Replace rejection with queueing
   - Listen for ready events
   - Update work order status

4. **Add API endpoints**
   - GET /queue/stats
   - GET /work-orders/:id/position

5. **Write tests**
   - Unit tests for queue operations
   - Integration test for queue flow

**Verification:**
- [ ] Work orders queued at capacity
- [ ] Position tracking accurate
- [ ] Priority ordering works
- [ ] API returns queue info

---

## Phase 3: Architectural Cleanup

### Thrust 8: WorkspaceManager Facade

**Priority:** Medium
**Dependencies:** None (can run parallel)
**Estimated Complexity:** High

#### Implementation Steps

1. **Create types**
   - Create `src/workspace/types.ts`
   - Define `Workspace`, `PreparedWorkspace`
   - Define operation option types

2. **Implement WorkspaceManager**
   - Create `src/workspace/manager.ts`
   - Delegate to existing implementations
   - Add event emission
   - Add compound operations

3. **Create index file**
   - Create `src/workspace/index.ts`
   - Export public API

4. **Refactor orchestrator**
   - Replace 15+ imports with single import
   - Use WorkspaceManager methods

5. **Write tests**
   - Unit tests with mocked implementations

**Verification:**
- [ ] Single import replaces many
- [ ] All workspace operations work
- [ ] Events emitted correctly
- [ ] Cleanup on failure

---

### Thrust 9: Simplified Loop Strategy

**Priority:** Medium
**Dependencies:** None (can run parallel)
**Estimated Complexity:** Medium

#### Implementation Steps

1. **Create new types**
   - Update `src/types/loop-strategy.ts`
   - Define `IterationCompleteEvent`
   - Define `LoopDecision`
   - Define simplified `LoopStrategy` interface

2. **Implement strategies**
   - Create `src/harness/strategies/fixed.ts`
   - Create `src/harness/strategies/hybrid.ts`
   - Create `src/harness/strategies/ralph.ts`

3. **Create factory**
   - Create `src/harness/strategy-factory.ts`

4. **Refactor run executor**
   - Use new single-callback interface
   - Pass full event context
   - Handle decisions

5. **Write tests**
   - Unit tests for each strategy

**Verification:**
- [ ] Single callback receives all context
- [ ] Decisions include reason
- [ ] All strategy modes work
- [ ] Feedback passed to next iteration

---

### Thrust 10: Event-Driven Architecture

**Priority:** Low
**Dependencies:** Thrusts 8-9
**Estimated Complexity:** High

#### Implementation Steps

1. **Create event definitions**
   - Create `src/orchestrator/events.ts`
   - Define all event types
   - Create event map

2. **Create TypedEventEmitter**
   - Create `src/orchestrator/typed-emitter.ts`
   - Type-safe emit/on

3. **Refactor orchestrator**
   - Extend TypedEventEmitter
   - Emit events at key points
   - Remove direct calls

4. **Create subscribers**
   - Create broadcaster subscriber
   - Create metrics subscriber
   - Create audit subscriber

5. **Create setup function**
   - Wire all subscribers

6. **Write tests**
   - Unit tests for event emission
   - Integration tests for subscribers

**Verification:**
- [ ] All events emitted
- [ ] Subscribers receive events
- [ ] Type safety maintained
- [ ] Decoupling achieved

---

## Implementation Order

```
Week 1:
├── Thrust 1: Persist AgentResult       [CRITICAL]
├── Thrust 2: Persist VerificationReport [CRITICAL]
└── Thrust 3: Enhanced IterationData    [HIGH]

Week 2:
├── Thrust 4: Structured Error Types    [HIGH]
├── Thrust 5: Retry Policy              [HIGH]
└── Thrust 6: GitHub Operation Modes    [MEDIUM]

Week 3:
├── Thrust 7: Work Order Queue          [MEDIUM]
├── Thrust 8: WorkspaceManager (parallel) [MEDIUM]
└── Thrust 9: Simplified Loop Strategy (parallel) [MEDIUM]

Week 4:
├── Thrust 10: Event-Driven Architecture [LOW]
├── Integration Testing                  [REQUIRED]
└── Documentation Updates               [REQUIRED]
```

---

## Verification Milestones

### Milestone 1: Observability (End of Week 1)

Run a failing work order and verify:
- [ ] `agent-1.json` contains full stdout/stderr
- [ ] `verification-1.json` contains check results
- [ ] `iteration-1.json` links both files
- [ ] Error message includes file references

### Milestone 2: Reliability (End of Week 2)

Run stress tests and verify:
- [ ] Transient failures are retried
- [ ] GitHub failures handled per mode
- [ ] Error classification is accurate

### Milestone 3: Queue (End of Week 3)

Submit many work orders and verify:
- [ ] Work orders queue instead of reject
- [ ] Position updates are accurate
- [ ] Queue empties as capacity frees

### Milestone 4: Architecture (End of Week 4)

Run full integration tests and verify:
- [ ] Single WorkspaceManager import
- [ ] Single callback loop strategies
- [ ] Events emitted and handled
- [ ] All existing behavior preserved

---

## Risk Mitigation

### Risk: Breaking Changes

**Mitigation:**
- All new fields are additive/optional
- Keep string `error` field for backwards compat
- Test with existing run data

### Risk: Performance Impact

**Mitigation:**
- Async file writes (don't block execution)
- Truncate large outputs
- Monitor disk usage

### Risk: Complexity Increase

**Mitigation:**
- Phase 3 cleanup reduces complexity
- Better test coverage
- Clearer interfaces

---

## Success Criteria

At the end of v0.2.19:

1. **Never lose diagnostic info**
   - Every run has agent output files
   - Every verification has report files
   - Every error has classification and references

2. **Handle transient failures**
   - Retry policy configurable
   - GitHub mode configurable
   - Queue instead of reject

3. **Cleaner architecture**
   - WorkspaceManager facade
   - Simple loop strategy interface
   - Event-driven decoupling

4. **Test coverage**
   - 90%+ on new code
   - Integration tests for flows
   - E2E dogfooding test

5. **Documentation**
   - All thrusts documented
   - Appendices complete
   - Migration guide ready
