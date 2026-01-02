# 01: Overview - Observability & Reliability Refactor

## Current State Analysis

### Information Flow Today

```
Agent Process                  Orchestrator                    Storage
     |                              |                              |
     | AgentResult {               |                              |
     |   stdout: "...",            |                              |
     |   stderr: "...",            |                              |
     |   toolCalls: [...],         |                              |
     |   tokensUsed: {...},        |                              |
     |   durationMs: 45000,        |                              |
     |   success: false            |                              |
     | }                           |                              |
     |─────────────────────────────►                              |
     |                              |                              |
     |                              | Extract only:                |
     |                              | { sessionId, success, error }|
     |                              |                              |
     |                              | DISCARD: stdout, stderr,     |
     |                              |   toolCalls, tokensUsed,     |
     |                              |   durationMs, model          |
     |                              |                              |
     |                              |─────────────────────────────►|
     |                              |                              | Save minimal
     |                              |                              | run.json
```

### What Gets Lost

| Data | Source | Current Fate | Impact |
|------|--------|--------------|--------|
| `stdout` | Agent process | Discarded | Can't see what agent said |
| `stderr` | Agent process | Partial (error message only) | Can't see full errors |
| `toolCalls` | Agent tracker | Discarded | Can't see what tools were used |
| `tokensUsed` | Agent | Discarded | Can't track costs |
| `durationMs` | Timer | Discarded | Can't analyze performance |
| `model` | Agent config | Not saved | Can't verify which model ran |
| `VerificationReport` | Verifier | Discarded | Can't see what verification found |

### Code Evidence

**`orchestrator.ts:435-451` - AgentResult Reduction:**

```typescript
// Full result from agent
const result: AgentResult = await driver.execute({...});

// But we only extract this:
const buildResult: { sessionId: string; success: boolean; error?: string } = {
  sessionId: result.sessionId ?? randomUUID(),
  success: result.success,
};

if (!result.success) {
  buildResult.error = result.stderr || 'Build failed';  // Just stderr!
}

return buildResult;
```

**`run-executor.ts:407-414` - Generic Error Handling:**

```typescript
if (!buildResult.success) {
  log.warn({ runId, iteration, error: buildResult.error }, 'Build failed');
  run = applyTransition(run, RunEvent.BUILD_FAILED);
  run.result = RunResult.FAILED_BUILD;
  run.error = buildResult.error ?? 'Build failed';  // Generic message!
  await saveRun(run);
  break;
}
```

### Current Run Storage Structure

```
~/.agentgate/runs/{runId}/
├── run.json          # Basic run metadata
├── iterations/       # (not implemented)
└── (nothing else)
```

**Contents of run.json:**
```json
{
  "id": "ac31daa7-620a-451e-86e0-4269fe15b824",
  "workOrderId": "2wTJMIsqVEVm",
  "state": "failed",
  "result": "failed_build",
  "error": "Build failed",
  "sessionId": "2de21b33-1af5-4d8f-aa65-6751bfdff78f"
}
```

That's it. No stdout, no stderr, no tool calls, no verification report.

---

## Target Architecture

### Information Flow After v0.2.19

```
Agent Process                  Orchestrator                    Storage
     |                              |                              |
     | AgentResult {               |                              |
     |   stdout: "...",            |                              |
     |   stderr: "...",            |                              |
     |   toolCalls: [...],         |                              |
     |   tokensUsed: {...},        |                              |
     |   durationMs: 45000,        |                              |
     |   success: false            |                              |
     | }                           |                              |
     |─────────────────────────────►                              |
     |                              |                              |
     |                              | emit('agent:complete', full) |
     |                              |─────────────────────────────►|
     |                              |                              | Save full
     |                              |                              | agent-1.json
     |                              |                              |
     |                              | VerificationReport          |
     |                              |─────────────────────────────►|
     |                              |                              | Save full
     |                              |                              | verification-1.json
     |                              |                              |
     |                              | IterationData (enhanced)     |
     |                              |─────────────────────────────►|
     |                              |                              | Save
     |                              |                              | iteration-1.json
     |                              |                              |
     |                              | BuildError (structured)      |
     |                              |─────────────────────────────►|
     |                              |                              | Update
     |                              |                              | run.json
```

### Target Run Storage Structure

```
~/.agentgate/runs/{runId}/
├── run.json                    # Run metadata + final result
├── agent-1.json                # Full agent output, iteration 1
├── agent-2.json                # Full agent output, iteration 2
├── verification-1.json         # Verification report, iteration 1
├── verification-2.json         # Verification report, iteration 2
├── iteration-1.json            # Enhanced iteration metadata
├── iteration-2.json            # Enhanced iteration metadata
└── events.jsonl                # Event stream (optional, Phase 3)
```

---

## Component Architecture

### Phase 1: Observability Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │  ResultPersister     │  │  EnhancedRunStore    │             │
│  ├──────────────────────┤  ├──────────────────────┤             │
│  │ saveAgentResult()    │  │ saveIteration()      │             │
│  │ saveVerification()   │  │ loadIteration()      │             │
│  │ loadAgentResult()    │  │ listIterations()     │             │
│  └──────────────────────┘  └──────────────────────┘             │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  StructuredErrors                                         │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ BuildErrorType.AGENT_CRASH                               │   │
│  │ BuildErrorType.TYPECHECK_FAILED                          │   │
│  │ BuildErrorType.TEST_FAILED                               │   │
│  │ BuildErrorType.TIMEOUT                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 2: Reliability Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                    RELIABILITY LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │  RetryExecutor       │  │  WorkOrderQueue      │             │
│  ├──────────────────────┤  ├──────────────────────┤             │
│  │ executeWithRetry()   │  │ enqueue()            │             │
│  │ isRetryable()        │  │ dequeue()            │             │
│  │ getBackoffMs()       │  │ getPosition()        │             │
│  └──────────────────────┘  └──────────────────────┘             │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  GitHubMode                                               │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ FAIL_FAST: Fail run if GitHub fails                      │   │
│  │ BEST_EFFORT: Log warning, continue                       │   │
│  │ DISABLED: No GitHub operations                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 3: Event-Driven Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EVENT SYSTEM                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Orchestrator (emits events)                              │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ emit('iteration:start', { runId, iteration })            │   │
│  │ emit('agent:complete', { runId, result })                │   │
│  │ emit('verification:complete', { runId, report })         │   │
│  │ emit('run:complete', { runId, result })                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │ ResultPersister│  │ Broadcaster    │  │ MetricsCollector│    │
│  ├────────────────┤  ├────────────────┤  ├────────────────┤    │
│  │ Saves to disk  │  │ Notifies SSE   │  │ Records stats  │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Gap Analysis

### Current vs Target State

| Capability | Current | Target | Gap |
|------------|---------|--------|-----|
| Agent stdout capture | None | Full file | Large |
| Agent stderr capture | Partial | Full file | Medium |
| Tool call history | None | Full JSON | Large |
| Token usage tracking | None | Per-iteration | Large |
| Duration metrics | None | Per-iteration | Medium |
| Verification reports | None | Full JSON | Large |
| Error classification | Generic string | Typed enum | Large |
| Retry logic | None | Configurable | Large |
| Work order queueing | Reject at limit | Queue + position | Large |
| GitHub failure handling | Silent skip | Configurable mode | Medium |

### Effort Estimates

| Phase | Thrust Count | New Files | Modified Files | Complexity |
|-------|--------------|-----------|----------------|------------|
| 1: Observability | 4 | 3 | 4 | Medium |
| 2: Reliability | 3 | 3 | 3 | Medium |
| 3: Architecture | 3 | 4 | 4 | High |

---

## Design Principles

### 1. Never Discard Diagnostic Data

Every piece of information from agent execution should be persisted. We can always choose not to display it, but we can never recover data we didn't save.

### 2. Fail Loudly with Context

Errors should include:
- What failed (structured type)
- Why it failed (message)
- Where to find details (file reference)
- How to investigate (pointers to full output)

### 3. Separate Concerns via Events

Rather than direct coupling:
```typescript
// BAD: Direct coupling
await saveAgentResult(result);
await notifyBroadcaster(result);
await recordMetrics(result);
```

Use events:
```typescript
// GOOD: Event-driven
this.emit('agent:complete', { runId, iteration, result });
// Subscribers handle their own persistence/notification
```

### 4. Graceful Degradation

- Queue instead of reject
- Retry instead of fail
- Continue instead of abort (for non-critical operations)

### 5. Backwards Compatibility

- New fields are additive
- Old run data can be read without new fields
- No migration required for existing data

---

## Integration Points

### With Existing Components

| Component | Integration |
|-----------|-------------|
| `Orchestrator` | Emit events, use new error types |
| `RunExecutor` | Call ResultPersister, use RetryExecutor |
| `RunStore` | Add new save/load methods |
| `Verifier` | Call ResultPersister.saveVerification() |
| `WorkOrderService` | Use WorkOrderQueue |
| `EventBroadcaster` | Subscribe to orchestrator events |

### With v0.2.16-v0.2.18 Features

| Feature | Integration |
|---------|-------------|
| Harness Profiles | Profile name saved in iteration metadata |
| Loop Strategies | Strategy state saved in iteration metadata |
| Audit Trail | Enhanced with full diagnostic data |
| Security Policy | Violations captured in verification report |

---

## Testing Strategy Overview

### Unit Test Coverage

| Component | Test Focus |
|-----------|------------|
| ResultPersister | File I/O, serialization |
| StructuredErrors | Error classification |
| RetryExecutor | Retry logic, backoff |
| WorkOrderQueue | FIFO ordering, capacity |
| WorkspaceManager | Delegation to subsystems |

### Integration Test Coverage

| Scenario | Verification |
|----------|--------------|
| Full run with persistence | All files created correctly |
| Failed run with diagnostics | Error files contain useful info |
| Retry on transient failure | Retry count, backoff timing |
| Queue at capacity | Position tracking, dequeue order |

### E2E Test Coverage

| Scenario | Verification |
|----------|--------------|
| Dogfooding work order | Can debug failures from output files |
| SSE streaming | Events include diagnostic data |
| Audit queries | Full iteration data retrievable |

---

## Migration Path

### Phase 1 (Non-Breaking)

- Add new files alongside existing code
- New persistence happens in parallel
- Old code paths unchanged
- New data accumulates for new runs

### Phase 2 (Non-Breaking)

- Add retry logic wrapped around existing execution
- Add queue logic in front of existing submission
- Old behavior available via config flag

### Phase 3 (Breaking for Internals)

- Refactor orchestrator to emit events
- Move persistence to event subscribers
- Internal API changes, external API unchanged
