# 07 - Appendix: Migration Plan

## Overview

This document outlines the migration strategy from the current queue implementation to the new robust queue system. The migration is designed to be:

- **Non-breaking**: Existing API contracts are preserved
- **Gradual**: Can be rolled out incrementally
- **Reversible**: Can fall back to old system if issues arise

## Current vs New Architecture

### Current Implementation

```
packages/server/src/
├── control-plane/
│   ├── queue-manager.ts      # Manages work order queue (string-based status)
│   └── commands/
│       └── serve.ts          # Server entry point
├── sandbox/
│   ├── provider.ts           # Base sandbox provider
│   ├── subprocess-provider.ts
│   └── docker-provider.ts
└── harness/
    └── harness.ts            # Executes work orders
```

### New Implementation

```
packages/server/src/
├── queue/                    # NEW MODULE
│   ├── index.ts              # Public exports
│   ├── types.ts              # Shared types
│   ├── state-machine.ts      # WorkOrderStateMachine
│   ├── scheduler.ts          # Pull-based scheduler
│   ├── resource-monitor.ts   # Resource tracking
│   ├── execution-manager.ts  # Execution lifecycle
│   ├── retry-manager.ts      # Retry logic
│   └── observability.ts      # Metrics & audit
├── control-plane/
│   ├── queue-manager.ts      # MODIFIED: Delegates to new queue module
│   └── commands/
│       └── serve.ts          # MODIFIED: Initializes new queue system
└── sandbox/                  # UNCHANGED (used by execution-manager)
```

## Migration Phases

### Phase 1: Parallel Implementation (Non-Breaking)

**Goal**: Build new queue system alongside existing, no user-facing changes

**Steps**:

1. Create `packages/server/src/queue/` directory
2. Implement all new components (state machine, scheduler, etc.)
3. Write comprehensive tests
4. Do NOT wire into existing code yet

**Files Created**:
- `packages/server/src/queue/types.ts`
- `packages/server/src/queue/state-machine.ts`
- `packages/server/src/queue/resource-monitor.ts`
- `packages/server/src/queue/scheduler.ts`
- `packages/server/src/queue/execution-manager.ts`
- `packages/server/src/queue/retry-manager.ts`
- `packages/server/src/queue/observability.ts`
- `packages/server/src/queue/index.ts`

**Verification**:
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] No changes to existing behavior

---

### Phase 2: Feature Flag Integration

**Goal**: Enable new system via feature flag, run both in parallel

**Steps**:

1. Add feature flag configuration
2. Modify queue-manager to delegate based on flag
3. Add migration endpoints for testing
4. Run shadow mode (both systems process, compare results)

**Configuration**:
```typescript
// packages/server/src/config/index.ts
export interface QueueConfig {
  // ... existing config ...

  /** Enable new queue system (default: false) */
  useNewQueueSystem: boolean;

  /** Run in shadow mode - both systems process (default: false) */
  shadowMode: boolean;
}
```

**Files Modified**:
- `packages/server/src/config/index.ts` - Add feature flags
- `packages/server/src/control-plane/queue-manager.ts` - Add delegation logic
- `packages/server/src/control-plane/commands/serve.ts` - Initialize both systems

**Example Delegation**:
```typescript
// packages/server/src/control-plane/queue-manager.ts
export class QueueManager {
  private readonly legacyQueue: LegacyQueueManager;
  private readonly newQueue: NewQueueManager;
  private readonly config: QueueConfig;

  async submit(workOrder: WorkOrder): Promise<string> {
    if (this.config.useNewQueueSystem) {
      return this.newQueue.submit(workOrder);
    }
    return this.legacyQueue.submit(workOrder);
  }

  // Shadow mode for comparison
  async submitWithShadow(workOrder: WorkOrder): Promise<string> {
    const legacyResult = await this.legacyQueue.submit(workOrder);

    if (this.config.shadowMode) {
      const newResult = await this.newQueue.submit(workOrder);
      this.compareResults(legacyResult, newResult);
    }

    return legacyResult;
  }
}
```

**Verification**:
- [ ] Feature flag correctly switches systems
- [ ] Shadow mode logs differences
- [ ] No regression in existing behavior

---

### Phase 3: Gradual Rollout

**Goal**: Enable new system for percentage of work orders

**Steps**:

1. Add rollout percentage configuration
2. Route based on work order ID hash
3. Monitor metrics for both systems
4. Gradually increase percentage

**Configuration**:
```typescript
export interface QueueConfig {
  useNewQueueSystem: boolean;
  newQueueRolloutPercent: number;  // 0-100
}
```

**Routing Logic**:
```typescript
function shouldUseNewQueue(workOrderId: string, rolloutPercent: number): boolean {
  const hash = hashString(workOrderId);
  return (hash % 100) < rolloutPercent;
}
```

**Rollout Schedule**:
1. 0% - Development/testing only
2. 10% - Initial production validation
3. 50% - Confidence building
4. 100% - Full rollout

**Verification**:
- [ ] Rollout percentage is respected
- [ ] Metrics are comparable between systems
- [ ] No degradation at each percentage level

---

### Phase 4: Legacy Removal

**Goal**: Remove old queue implementation

**Steps**:

1. Ensure 100% rollout is stable
2. Remove feature flags
3. Delete legacy code
4. Update documentation

**Files Removed**:
- Old queue manager code (after extracting to new system)
- Feature flag configuration
- Shadow mode logic

**Files Modified**:
- `packages/server/src/control-plane/queue-manager.ts` - Direct delegation
- `packages/server/src/config/index.ts` - Remove flags

**Verification**:
- [ ] All functionality works without flags
- [ ] No orphaned code
- [ ] Documentation is updated

---

## Data Migration

### Work Order Status Mapping

| Old Status | New State |
|------------|-----------|
| `queued` | `PENDING` |
| `building` | `PREPARING` |
| `running` | `RUNNING` |
| `completed` | `COMPLETED` |
| `failed` | `FAILED` |
| (none) | `WAITING_RETRY` |
| (none) | `CANCELLED` |

### Migrating In-Flight Work Orders

Work orders that are in progress during migration:

1. **Queued work orders**: Can be migrated to new system's PENDING state
2. **Running work orders**: Let them complete in old system
3. **Failed work orders**: Remain as-is (no retry in old system)

**Migration Script**:
```typescript
async function migrateWorkOrders(db: Database): Promise<void> {
  const workOrders = await db.workOrders.findAll({ status: 'queued' });

  for (const wo of workOrders) {
    await newQueueManager.submit({
      ...wo,
      migrated: true,
      originalSubmittedAt: wo.submittedAt,
    });
  }
}
```

---

## Rollback Plan

If issues are discovered after rollout:

### Immediate Rollback (< 5 minutes)

1. Set `useNewQueueSystem: false` in config
2. Restart server
3. New work orders go to old system
4. In-flight work orders complete in new system

### Data Recovery

If work orders are lost or corrupted:

1. Query audit log for affected work orders
2. Re-submit from audit trail
3. Investigate root cause

### Post-Mortem

After any rollback:

1. Document what went wrong
2. Write regression test
3. Fix issue
4. Re-attempt rollout

---

## Testing Strategy

### Pre-Migration Testing

1. **Unit tests**: All new components
2. **Integration tests**: Full work order lifecycle
3. **Load tests**: 100+ concurrent work orders
4. **Chaos tests**: Random failures, restarts

### During Migration Testing

1. **Shadow mode validation**: Compare old vs new results
2. **Canary testing**: Monitor error rates at each rollout stage
3. **Performance testing**: Latency and throughput comparison

### Post-Migration Testing

1. **Smoke tests**: Basic functionality
2. **Regression tests**: All existing test suites
3. **Long-running tests**: 24-hour stability test

---

## Monitoring During Migration

### Key Metrics to Watch

| Metric | Threshold | Action if Exceeded |
|--------|-----------|-------------------|
| Error rate | > 1% | Pause rollout |
| p99 latency | > 2x baseline | Investigate |
| Queue depth growth | > 10/min | Check scheduler |
| Memory usage | > 90% | Reduce concurrency |

### Dashboards

1. **Migration Progress**: Rollout percentage, work orders per system
2. **Comparison**: Side-by-side metrics for old vs new
3. **Health**: System health for both systems

---

## Timeline

| Phase | Duration | Milestone |
|-------|----------|-----------|
| Phase 1: Implementation | - | New system built and tested |
| Phase 2: Feature Flag | - | Both systems running in parallel |
| Phase 3: Rollout | - | 100% on new system |
| Phase 4: Cleanup | - | Legacy code removed |

---

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Data loss during migration | Low | High | Audit log backup, dry-run migration |
| Performance regression | Medium | Medium | Load testing, gradual rollout |
| State inconsistency | Medium | High | Extensive testing, shadow mode |
| Rollback needed | Medium | Low | Feature flags, clear rollback plan |
