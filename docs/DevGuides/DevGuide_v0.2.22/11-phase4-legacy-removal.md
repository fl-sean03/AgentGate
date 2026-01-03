# 11 - Phase 4: Legacy Removal

## Overview

Phase 4 removes the legacy queue implementation after successful validation at 100% rollout. This:
- Simplifies the codebase
- Removes feature flag overhead
- Completes the v0.2.22 migration

## Prerequisites

- Phase 3 complete with 100% rollout
- No issues reported for at least 24 hours at 100%
- All metrics comparable to legacy

## Implementation Tasks

### Task 1: Remove Feature Flags from Config

Modify `packages/server/src/config/index.ts`:

**Remove:**
```typescript
// Delete these schema definitions
const queueConfigSchema = z.object({
  useNewQueueSystem: z.coerce.boolean().default(false),
  shadowMode: z.coerce.boolean().default(false),
  rolloutPercent: z.coerce.number().int().min(0).max(100).default(0),
});

// Delete queue config from main schema
queue: queueConfigSchema,

// Delete environment variable mapping
queue: {
  useNewQueueSystem: process.env.AGENTGATE_QUEUE_USE_NEW_SYSTEM,
  shadowMode: process.env.AGENTGATE_QUEUE_SHADOW_MODE,
  rolloutPercent: process.env.AGENTGATE_QUEUE_ROLLOUT_PERCENT,
},

// Delete getQueueConfig() function
export function getQueueConfig(): QueueConfig {
  // ...
}
```

### Task 2: Simplify QueueFacade to Direct Delegation

Modify `packages/server/src/queue/queue-facade.ts`:

**Remove:**
- All feature flag checks
- `shouldUseNewSystem()` method
- `isShadowMode()` method
- `isInRollout()` method
- `hashString()` method
- Shadow mode comparison logic
- Legacy queue references

**Result:**
```typescript
/**
 * Queue Facade - Direct delegation to new queue system
 *
 * After v0.2.22 migration complete, this provides a clean interface
 * to the new queue system components.
 */

export class QueueFacade extends EventEmitter {
  private readonly resourceMonitor: ResourceMonitor;
  private readonly scheduler: Scheduler;
  private readonly executionManager: ExecutionManager;
  private readonly retryManager: RetryManager;
  private readonly observability: QueueObservability;

  // Direct delegation to new system only
}
```

### Task 3: Remove Legacy Queue Manager Usage

**Files to modify:**

1. `packages/server/src/control-plane/commands/serve.ts`
   - Remove legacy QueueManager initialization
   - Remove auto-processing tied to legacy queue
   - Use only QueueFacade

2. `packages/server/src/server/routes/*.ts`
   - Update any routes using legacy QueueManager
   - Use QueueFacade instead

3. `packages/server/src/control-plane/orchestrator.ts` (if exists)
   - Update to use new queue system

### Task 4: Cleanup Legacy Files

**Consider for removal (with careful review):**
- Legacy code in `queue-manager.ts` that's now handled by new system
- Shadow mode routes from Phase 3
- Comparison endpoints from Phase 3

**Keep (refactored):**
- `queue-manager.ts` - May still have useful utilities
- Test helpers

### Task 5: Update Documentation

1. Update `README.md` to document new queue system
2. Remove migration notes from docs
3. Update API documentation for new endpoints

## Verification Checklist

- [ ] All feature flags removed
- [ ] QueueFacade uses only new system
- [ ] All routes updated
- [ ] No references to legacy queue in active code paths
- [ ] All tests pass
- [ ] TypeScript compiles without errors
- [ ] Server starts and processes work orders correctly
- [ ] No orphaned code

## Files Modified

| File | Change |
|------|--------|
| `config/index.ts` | Remove queue feature flags |
| `queue/queue-facade.ts` | Direct delegation only |
| `commands/serve.ts` | Use QueueFacade |
| `routes/work-orders.ts` | Use new queue system |

## Files Potentially Removed

| File | Reason |
|------|--------|
| `routes/queue-rollout.ts` | Migration complete |
| Legacy code paths | No longer needed |

## Testing

Run full test suite:
```bash
pnpm test
pnpm typecheck
pnpm lint
```

Run manual validation:
```bash
# Start server
pnpm dev:server

# Submit work order
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{"taskPrompt": "Test work order"}'

# Verify queue health
curl http://localhost:3001/api/v1/queue/health
```

## Rollback Plan

If issues arise during Phase 4:

1. Revert the Phase 4 changes
2. Re-enable feature flags
3. Set `AGENTGATE_QUEUE_USE_NEW_SYSTEM=false`
4. Investigate and fix issues
5. Re-attempt Phase 4

## Completion Criteria

v0.2.22 is complete when:

1. New queue system is the only queue system
2. All feature flags removed
3. No legacy code in active paths
4. All tests pass
5. Documentation updated
6. Server runs stably with new system
