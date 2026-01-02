# 01 - Architecture Overview

## Current System Context

The existing AgentGate queue system has the following architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Current Architecture                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  HTTP API                                                        │
│  ┌─────────────────┐                                            │
│  │ work-orders.ts  │ ─────→ Submit, Get, Cancel, Trigger        │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ↓                                                      │
│  Control Plane                                                   │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │ work-order-     │ ←──→│ queue-manager   │                    │
│  │ service.ts      │     │ .ts             │                    │
│  └────────┬────────┘     └────────┬────────┘                    │
│           │                       │                              │
│           ↓                       ↓                              │
│  Storage                  Execution                              │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │ work-order-     │     │ run-executor.ts │                    │
│  │ store.ts        │     └────────┬────────┘                    │
│  └─────────────────┘              │                              │
│                                   ↓                              │
│                          ┌─────────────────┐                    │
│                          │ sandbox/        │                    │
│                          │ provider.ts     │                    │
│                          └─────────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Problems in Current System

### 1. Cancel Only Works for Queued

```typescript
// Current limitation in work-order-service.ts
async cancel(id: string): Promise<void> {
  const workOrder = await this.store.get(id);
  if (workOrder.status !== 'queued') {
    throw new Error('Can only cancel queued work orders');  // ❌ Problem
  }
  // ...
}
```

**Fix**: Extend to support running work orders by tracking PIDs.

### 2. No Purge Endpoint

```typescript
// No way to permanently delete work orders
// Users can only cancel, not purge history
```

**Fix**: Add `purge()` method and `DELETE ?purge=true` endpoint.

### 3. No Force Kill

```typescript
// No way to forcefully terminate stuck processes
// If agent hangs, work order is stuck forever
```

**Fix**: Create AgentProcessManager to track and kill PIDs.

### 4. No Timeout Enforcement

```typescript
// maxTime configuration exists but isn't enforced
// Work orders can run indefinitely
```

**Fix**: Add timer that auto-kills after maxTime.

### 5. Storage Corruption Not Handled

```typescript
// If JSON file is corrupted, parsing throws
// Server may fail to start or list work orders
```

**Fix**: Validate on startup, quarantine corrupted files.

### 6. Run Store Orphans

```typescript
// Work order references run that doesn't exist
// Causes errors when fetching work order details
```

**Fix**: Cleanup orphaned references on startup.

### 7. No Queue Health Visibility

```typescript
// No endpoint to see queue health
// Hard to diagnose stuck/slow queue issues
```

**Fix**: Add `/api/v1/queue/health` endpoint.

### 8. Workspace Source API Bug

```typescript
// API accepts owner + repo separately
// But mapWorkspaceSource() ignores owner, parses from repo
// Silent failure if owner provided separately
```

**Fix**: Support all input formats correctly.

### 9. No Auto-Queue Processing

```typescript
// After submit, work order sits in 'queued' forever
// Manual trigger required: POST /work-orders/:id/runs
// Doesn't scale, easy to forget
```

**Fix**: Add poll loop that auto-starts queued work orders.

### 10. No Stale Detection

```typescript
// If agent process dies externally (OOM, kill -9)
// Work order shows 'running' forever
// No heartbeat or liveness check
```

**Fix**: Add StaleDetector service.

## Design Principles for Fixes

### Principle 1: Minimal Invasive Changes

Each fix should:
- Modify minimal code
- Not change public API contracts (only add)
- Be independently testable
- Be easily reversible

### Principle 2: Backward Compatibility

- Existing API endpoints must continue working
- New parameters should be optional with sensible defaults
- No database migrations required

### Principle 3: Defense in Depth

- Multiple safeguards for critical issues
- Graceful degradation on failure
- Clear error messages and logging

## Approach: Wave Pattern

Using wave pattern from MultiAgentParallelism.md:

**Wave 1 (Parallel)**: 8 independent foundation fixes
- Each fix can be developed and tested in isolation
- No dependencies between Wave 1 tasks
- All can be submitted and run simultaneously

**Wave 2 (Sequential)**: 2 automation tasks
- Depends on Wave 1 (cancel, kill, timeout)
- Must be developed sequentially
- Auto-queue depends on kill capability

**Wave 3 (Parallel with Wave 2)**: 1 CLI task
- Independent of Wave 2
- Can run concurrently
- Nice-to-have, not critical path

## Files Affected

### Wave 1 Files

| Task | Files Modified | Files Created |
|------|---------------|---------------|
| 1.1 Cancel Running | work-order-service.ts, queue-manager.ts, routes/work-orders.ts | - |
| 1.2 Purge API | work-order-store.ts, work-order-service.ts, routes/work-orders.ts | - |
| 1.3 Force Kill | work-order-service.ts, queue-manager.ts, routes/work-orders.ts | agent-process-manager.ts |
| 1.4 Timeout | queue-manager.ts, run-executor.ts | - |
| 1.5 Storage Validation | work-order-store.ts, app.ts | - |
| 1.6 Orphan Cleanup | run-store.ts, work-order-store.ts | - |
| 1.7 Queue Health | app.ts | routes/queue.ts |
| 1.8 Workspace API | types/api.ts, routes/work-orders.ts | - |

### Wave 2 Files

| Task | Files Modified | Files Created |
|------|---------------|---------------|
| 2.1 Auto-Queue | queue-manager.ts, app.ts, serve.ts | - |
| 2.2 Stale Detection | queue-manager.ts | stale-detector.ts |

### Wave 3 Files

| Task | Files Modified | Files Created |
|------|---------------|---------------|
| 3.1 CLI Commands | - | cli/commands/queue.ts |

## Integration with v0.2.22

After v0.2.23 is complete, the system will be stable for daily use. v0.2.22's architectural refactor can then be developed in parallel, with migration planned as:

1. Build v0.2.22 new queue system (parallel implementation)
2. Feature flag to switch between old and new
3. Gradual rollout
4. Remove old system

v0.2.23 fixes will be preserved in the v0.2.22 new system where applicable (e.g., timeout enforcement, stale detection).
