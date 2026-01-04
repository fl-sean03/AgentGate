# 01: Architecture Overview & Current State

## Purpose

This document provides the architectural context needed to understand all thrusts in this DevGuide. It documents the current state, identifies specific weaknesses, and establishes the target architecture for dog fooding readiness.

---

## Current Architecture

### Module Dependency Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CONTROL PLANE                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   CLI       │  │   Server    │  │  WebSocket  │  │   Routes    │    │
│  │ commands/   │  │  server/    │  │  websocket/ │  │   routes/   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                                    │                                     │
└────────────────────────────────────┼─────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           ORCHESTRATION                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      orchestrator/                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │ orchestrator│  │state-machine│  │  run-store  │              │   │
│  │  │    .ts      │  │    .ts      │  │    .ts      │              │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │   │
│  │         │                │                │                      │   │
│  │         └────────────────┴────────────────┘                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
└────────────────────────────────────┼─────────────────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
          ▼                          ▼                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   EXECUTION     │      │   VERIFICATION  │      │    DELIVERY     │
│  ┌───────────┐  │      │  ┌───────────┐  │      │  ┌───────────┐  │
│  │ engine.ts │  │      │  │verifier/  │  │      │  │ delivery/ │  │
│  │ manager.ts│  │      │  │ runner.ts │  │      │  │git-handler│  │
│  │ phases/   │  │      │  │ levels/   │  │      │  │pr-handler │  │
│  └───────────┘  │      │  └───────────┘  │      │  └───────────┘  │
│        │        │      │        │        │      │        │        │
│        ▼        │      │        ▼        │      │        ▼        │
│  ┌───────────┐  │      │  ┌───────────┐  │      │  ┌───────────┐  │
│  │  sandbox/ │  │      │  │ feedback/ │  │      │  │ workspace/│  │
│  │  docker   │  │      │  │ generator │  │      │  │  github   │  │
│  │subprocess │  │      │  │  parser   │  │      │  │  git-ops  │  │
│  └───────────┘  │      │  └───────────┘  │      │  └───────────┘  │
└─────────────────┘      └─────────────────┘      └─────────────────┘
          │                          │                          │
          └──────────────────────────┴──────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           INFRASTRUCTURE                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   types/    │  │   config/   │  │   utils/    │  │  artifacts/ │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### State Machine

The run state machine is the heart of orchestration:

```
                                    ┌─────────┐
                                    │ QUEUED  │
                                    └────┬────┘
                                         │ lease acquired
                                         ▼
                                    ┌─────────┐
                                    │ LEASED  │
                                    └────┬────┘
                                         │ workspace ready
                                         ▼
                              ┌─────────────────────┐
                              │      BUILDING       │◄─────────────────┐
                              └──────────┬──────────┘                  │
                                         │ agent complete              │
                                         ▼                             │
                              ┌─────────────────────┐                  │
                              │    SNAPSHOTTING     │                  │
                              └──────────┬──────────┘                  │
                                         │ snapshot created            │
                                         ▼                             │
                              ┌─────────────────────┐                  │
                              │      VERIFYING      │                  │
                              └──────────┬──────────┘                  │
                                         │                             │
                        ┌────────────────┼────────────────┐            │
                        │                │                │            │
                        ▼                ▼                ▼            │
                   ┌─────────┐    ┌───────────┐    ┌───────────┐      │
                   │SUCCEEDED│    │  FEEDBACK │────│CI_POLLING │      │
                   └─────────┘    └─────┬─────┘    └───────────┘      │
                        │               │                              │
                        │               │ iterations remain            │
                        │               └──────────────────────────────┘
                        │
                        ▼
                   ┌─────────┐
                   │PR_CREATED│
                   └─────────┘

Terminal States: SUCCEEDED, FAILED, CANCELED
```

### Key File Locations

| Module | Primary Files | Purpose |
|--------|---------------|---------|
| Orchestrator | `src/orchestrator/orchestrator.ts` | Main execution coordination |
| State Machine | `src/orchestrator/state-machine.ts` | Run state transitions |
| Run Store | `src/orchestrator/run-store.ts` | Run persistence |
| Execution Engine | `src/execution/engine.ts` | Phase-based execution |
| Execution Manager | `src/queue/execution-manager.ts` | Queue and timeout management |
| Sandbox Manager | `src/sandbox/manager.ts` | Container/process lifecycle |
| Docker Provider | `src/sandbox/docker-provider.ts` | Docker container management |
| Feedback Generator | `src/feedback/generator.ts` | Structured failure feedback |
| GitHub Operations | `src/workspace/github.ts` | GitHub API integration |
| Git Handler | `src/delivery/git-handler.ts` | Git operations |
| PR Handler | `src/delivery/pr-handler.ts` | Pull request creation |

---

## Current State Problems

### Problem 1: Non-Atomic State Persistence

**Location**: `src/orchestrator/orchestrator.ts`, `src/orchestrator/state-machine.ts`

**Current Behavior**:
- `applyTransition()` returns updated run object but doesn't persist
- Caller is responsible for persistence
- No write-ahead logging
- If crash occurs between state update and file write, state is lost

**Impact on Dog Fooding**:
- Agent run could crash mid-iteration
- On restart, run is in unknown state
- Cannot safely resume or retry

**Target State**:
- Write-ahead log (WAL) before state transition
- Atomic file operations with temp file + rename
- Recovery procedure that replays WAL on startup

---

### Problem 2: Timeout Race Conditions

**Location**: `src/queue/execution-manager.ts` (lines 239-264)

**Current Behavior**:
- Uses `setTimeout` + Promise race
- `clearTimeout` called after promise resolves
- If timeout fires and execute completes simultaneously, both paths run

**Impact on Dog Fooding**:
- Agent verification could timeout incorrectly
- Zombie processes left running
- Confusing error states

**Target State**:
- AbortSignal-based cancellation
- Cooperative timeout (agent checks signal)
- Clean abort path with resource cleanup

---

### Problem 3: Non-Atomic Shutdown

**Location**: `src/control-plane/commands/serve.ts` (lines 286-292)

**Current Behavior**:
- `process.exit(0)` called even if `app.close()` throws
- No timeout for graceful shutdown
- In-flight requests not waited on
- Agent processes not terminated

**Impact on Dog Fooding**:
- Server could exit while agent run is active
- Work order left in RUNNING state forever
- Orphaned containers

**Target State**:
- Shutdown timeout with escalation (SIGTERM → SIGKILL)
- Wait for in-flight requests
- Terminate all managed processes
- Set interrupted runs to FAILED state

---

### Problem 4: Sandbox Cleanup Not Guaranteed

**Location**: `src/queue/execution-manager.ts` (lines 163-171), `src/sandbox/manager.ts`

**Current Behavior**:
- Cleanup errors are logged but swallowed
- No retry mechanism
- No tracking of orphaned containers
- Periodic cleanup can fail without recovery

**Impact on Dog Fooding**:
- Docker containers accumulate
- Resource exhaustion over time
- Agent runs in degraded environment

**Target State**:
- Cleanup with retries and exponential backoff
- Orphan detection on startup
- Force cleanup option
- Resource tracking across restarts

---

### Problem 5: No Merge Conflict Detection

**Location**: `src/delivery/git-handler.ts` (lines 158-193)

**Current Behavior**:
- Pushes without checking for upstream changes
- No fetch-before-push
- No conflict detection
- Silent failures

**Impact on Dog Fooding**:
- Agent pushes code that conflicts with main
- PR cannot be merged
- No feedback to agent about conflict

**Target State**:
- Fetch before push
- Detect diverged history
- Attempt automatic rebase or report conflict
- Structured conflict feedback for agent

---

### Problem 6: Empty Catch Blocks

**Location**: Multiple files including `src/delivery/pr-handler.ts`

**Current Behavior**:
- Operations like `addLabels`, `requestReviewers` catch and log errors
- Execution continues as if successful
- Agent receives no feedback

**Impact on Dog Fooding**:
- Agent thinks PR is complete but labels missing
- Silent partial failures
- Debugging is difficult

**Target State**:
- All errors propagated or explicitly marked as non-fatal
- Structured error types with context
- Partial success tracking

---

### Problem 7: No Agent Self-Awareness

**Location**: `src/agent/claude-code-driver.ts`, `src/agent/claude-code-subscription-driver.ts`

**Current Behavior**:
- Agent doesn't know it's in a sandbox
- No information about execution constraints
- No awareness of being "inside" AgentGate

**Impact on Dog Fooding**:
- Agent might try forbidden operations
- Agent doesn't understand verification context
- Poor decision making about file changes

**Target State**:
- Environment variables injected for sandbox awareness
- Context in system prompt about execution environment
- Available resource limits communicated

---

### Problem 8: Feedback Truncated

**Location**: `src/feedback/generator.ts` (line 83)

**Current Behavior**:
- Only first 10 failures returned
- No prioritization of failures
- Heuristic-based categorization

**Impact on Dog Fooding**:
- Agent fixes 10 issues, 40 more remain
- Multiple iterations for same underlying problem
- Inefficient convergence

**Target State**:
- Configurable failure limit
- Priority-based failure ordering (most impactful first)
- Deduplicated failures (same root cause)
- Improved categorization with explicit patterns

---

## Target Architecture

### Principle 1: Crash-Only Design

Every component should be designed to crash safely:
- State is always persisted before action
- Recovery is automatic on restart
- No cleanup required in crash path

### Principle 2: Cooperative Cancellation

All long-running operations use AbortSignal:
- Timeouts create AbortController
- Signal passed through call chain
- Operations check signal periodically
- Clean exit on abort

### Principle 3: Explicit Resource Lifecycle

Every resource has explicit lifecycle:
- Creation is tracked
- Cleanup is guaranteed (finally blocks)
- Orphan detection on startup
- Force cleanup available

### Principle 4: Structured Errors

All errors are typed and contextual:
- Error codes for programmatic handling
- Context attached (what operation, what inputs)
- Stack trace preserved
- Actionable messages

### Principle 5: Agent Awareness

Agent knows its environment:
- Sandbox type (docker/subprocess/none)
- Resource limits
- Forbidden operations
- Verification context

---

## Migration Strategy

### Phase 1: Infrastructure (Thrust 1-5)

These changes are foundational and must be done sequentially:
1. State persistence first (enables recovery)
2. Timeout system (uses new patterns from 1)
3. Graceful shutdown (uses patterns from 1, 2)
4. Sandbox cleanup (uses patterns from all above)
5. Merge detection (relatively isolated)

### Phase 2: Robustness (Thrust 6-10)

Can be parallelized after Phase 1:
- Error propagation framework enables all others
- Rate limiting is isolated
- Process tracking builds on state persistence
- Deadlock detection needs spawning understanding
- Resource limits build on sandbox cleanup

### Phase 3: Extensibility (Thrust 11-15)

Depends on robustness foundation:
- Configuration registry is foundational
- Plugin system uses configuration
- Event bus enables observability
- Custom gates use plugin system
- Capability negotiation uses configuration

### Phase 4: Developer Experience (Thrust 16-20)

Can partially overlap with earlier phases:
- CLAUDE.md can start immediately
- Enhanced feedback needs error framework
- Logging needs event bus
- Debug mode needs logging
- Interactive server needs all above

---

## Testing Strategy

### Unit Test Additions

Each thrust must include unit tests for:
- New functions and classes
- Edge cases (empty inputs, errors)
- State transitions

### Integration Test Additions

New integration tests for:
- Crash recovery scenarios
- Timeout behavior
- Cleanup verification
- Full execution cycles

### Stress Tests

Add stress tests for:
- Concurrent work orders
- Rapid submission/cancellation
- Resource exhaustion scenarios

---

**Next**: [02-infrastructure.md](./02-infrastructure.md) - Critical Infrastructure Thrusts
