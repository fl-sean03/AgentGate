# Appendix B: Migration Path

## Overview

This appendix describes how to migrate from the current dual-stack architecture to the unified ExecutionEngine. The migration is designed to be incremental with no breaking changes.

---

## Migration Strategy

### Principle: Additive Changes First

1. **Add new code** alongside existing code
2. **Test new code** independently
3. **Wire up new code** with feature flags
4. **Deprecate old code** with warnings
5. **Remove old code** in next major version

This ensures we can always roll back.

---

## Migration Phases

### Phase 1: Foundation (Thrust 1)

**Goal**: Fix state machine bugs without changing behavior

**Changes**:
- Add missing FEEDBACK → VERIFY_FAILED_TERMINAL transition
- Add SNAPSHOT_FAILED event emission
- Add state machine validation tests

**Risk**: Low - purely additive to state machine

**Verification**:
```bash
# All existing tests pass
pnpm test

# New state machine tests pass
pnpm --filter @agentgate/server test -- state-machine-complete
```

**Rollback**: Remove new transition (backwards compatible)

---

### Phase 2: New Components (Thrusts 2, 4, 5)

**Goal**: Create new components without integrating them

**Changes**:
- Phase handlers created in `execution/phases/`
- DeliveryManager created in `delivery/`
- ProgressEmitter created in `observability/`

**Risk**: Low - new code, not integrated

**Verification**:
```bash
# New component tests pass
pnpm --filter @agentgate/server test -- phases
pnpm --filter @agentgate/server test -- delivery
pnpm --filter @agentgate/server test -- observability
```

**Rollback**: Delete new files

---

### Phase 3: ExecutionEngine (Thrust 3)

**Goal**: Create unified ExecutionEngine

**Changes**:
- ExecutionEngine created
- Uses new components internally
- Not yet wired to orchestrator

**Risk**: Medium - integration complexity

**Verification**:
```bash
# Engine integration tests pass
pnpm --filter @agentgate/server test:integration -- ExecutionEngine
```

**Rollback**: Delete engine, keep components for later

---

### Phase 4: Integration

**Goal**: Wire ExecutionEngine to orchestrator with feature flag

**Changes**:
```typescript
// orchestrator.ts
async execute(workOrder: WorkOrder): Promise<Run> {
  if (config.useNewExecutionEngine) {
    // New path
    return this.engine.execute({ workOrder, taskSpec });
  } else {
    // Legacy path
    return this.executeLegacy(workOrder);
  }
}
```

**Risk**: Medium - behavior change

**Configuration**:
```typescript
// config.ts
export const config = {
  useNewExecutionEngine: process.env.USE_NEW_ENGINE === 'true',
};
```

**Verification**:
```bash
# Test with flag off (legacy)
USE_NEW_ENGINE=false pnpm test:integration

# Test with flag on (new)
USE_NEW_ENGINE=true pnpm test:integration
```

**Rollback**: Set flag to false

---

### Phase 5: Deprecation

**Goal**: Deprecate old code paths

**Changes**:
```typescript
// run-executor.ts
/**
 * @deprecated Use ExecutionEngine.execute() instead.
 * This function will be removed in v0.3.0.
 */
export async function executeRun(options: RunExecutorOptions): Promise<Run> {
  console.warn('[DEPRECATED] executeRun() is deprecated');
  // Continue to work for backwards compatibility
  return executeRunLegacy(options);
}
```

**Timeline**:
- v0.2.25: Deprecation warnings added
- v0.2.26+: Default to new engine
- v0.3.0: Remove deprecated code

---

### Phase 6: Cleanup (v0.3.0)

**Goal**: Remove deprecated code

**Changes**:
- Remove `executeRun()` function
- Remove legacy callbacks in orchestrator
- Remove feature flag
- Update documentation

**Risk**: Breaking change - major version bump

---

## Backwards Compatibility

### API Compatibility

No breaking changes to REST API:
- `/api/v1/work-orders` - Same request/response shape
- `/api/v1/runs` - Same response shape
- WebSocket events - Same event types

### Configuration Compatibility

Existing configuration continues to work:
- `HarnessConfig` profiles still supported
- Work order fields unchanged
- Environment variables unchanged

### Behavioral Compatibility

Same behavior, better implementation:
- State transitions identical
- Error classifications preserved
- Iteration counts same
- Timeouts enforced same way

---

## Testing During Migration

### Comparison Testing

Run both paths and compare:

```typescript
describe('Migration: Compare legacy and new', () => {
  it('produces same result for happy path', async () => {
    const workOrder = createTestWorkOrder();

    // Legacy path
    const legacyResult = await executeLegacy(workOrder);

    // New path
    const newResult = await engine.execute({ workOrder, taskSpec });

    // Compare
    expect(newResult.run.state).toBe(legacyResult.state);
    expect(newResult.run.result).toBe(legacyResult.result);
    expect(newResult.iterations.length).toBe(legacyResult.iteration);
  });
});
```

### Shadow Mode

Run new engine in shadow mode (results not used):

```typescript
async execute(workOrder: WorkOrder): Promise<Run> {
  // Always run legacy
  const legacyResult = await this.executeLegacy(workOrder);

  // Shadow run new engine (if enabled)
  if (config.shadowNewEngine) {
    try {
      const newResult = await this.engine.execute({ workOrder, taskSpec });
      this.compareResults(legacyResult, newResult);
    } catch (error) {
      log.error({ error }, 'Shadow engine failed');
    }
  }

  return legacyResult;
}
```

---

## Rollback Procedures

### Per-Phase Rollback

| Phase | Rollback Steps |
|-------|----------------|
| 1 | Revert state-machine.ts changes |
| 2 | Delete new component files |
| 3 | Delete execution/engine.ts |
| 4 | Set USE_NEW_ENGINE=false |
| 5 | Remove deprecation warnings |

### Emergency Rollback

If issues in production:

```bash
# Set environment variable
export USE_NEW_ENGINE=false

# Restart server
pm2 restart agentgate

# Or for Docker
docker-compose restart
```

---

## Feature Flag Management

### Environment Variables

```bash
# Enable new engine
USE_NEW_ENGINE=true

# Enable shadow mode for comparison
SHADOW_NEW_ENGINE=true

# Enable detailed migration logging
MIGRATION_DEBUG=true
```

### Configuration File

```yaml
# config.yaml
migration:
  useNewEngine: true
  shadowMode: false
  debug: false
```

### Runtime Toggle

```typescript
// API endpoint for runtime control (admin only)
router.post('/admin/migration/toggle', requireAdmin, (req, res) => {
  config.useNewExecutionEngine = req.body.enabled;
  res.json({ enabled: config.useNewExecutionEngine });
});
```

---

## Monitoring During Migration

### Metrics to Watch

```
# Compare between legacy and new
agentgate_runs_completed_total{engine="legacy"}
agentgate_runs_completed_total{engine="new"}

# Error rates
agentgate_runs_failed_total{engine="legacy"}
agentgate_runs_failed_total{engine="new"}

# Duration comparison
agentgate_run_duration_seconds{engine="legacy"}
agentgate_run_duration_seconds{engine="new"}
```

### Alerts

```yaml
# Alert if new engine has higher error rate
- alert: NewEngineHigherErrorRate
  expr: |
    rate(agentgate_runs_failed_total{engine="new"}[5m])
    >
    rate(agentgate_runs_failed_total{engine="legacy"}[5m]) * 1.1
  for: 10m
  labels:
    severity: warning
```

---

## Timeline

| Week | Activity |
|------|----------|
| 1 | Phase 1: State machine fixes |
| 1-2 | Phase 2: New components |
| 2 | Phase 3: ExecutionEngine |
| 3 | Phase 4: Integration with flag |
| 3 | Shadow mode testing |
| 4 | Phase 5: Enable by default |
| 4+ | Monitor and stabilize |
| v0.3.0 | Phase 6: Cleanup |
