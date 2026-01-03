# 04: Legacy Removal

## Overview

With the ExecutionEngine fully integrated, we can remove the legacy `executeRun()` function and related code. This document details the deprecation and removal process.

---

## Legacy Code to Remove

### Primary Targets

| File | Lines | Description |
|------|-------|-------------|
| `run-executor.ts` | 675 | Main legacy executor |
| `execution/coordinator.ts` | ~400 | Unused coordinator (already deprecated) |

### Secondary Cleanup

| File | Change | Description |
|------|--------|-------------|
| `orchestrator.ts` | Remove import | No longer uses executeRun |
| `execution/index.ts` | Remove export | Clean up exports |
| `types/run-executor.ts` | Remove | Types no longer needed |

---

## Deprecation Strategy

### Phase 1: Deprecation Notices (v0.2.26)

Add deprecation warnings that log when legacy code is used:

```typescript
// run-executor.ts
/**
 * @deprecated Use ExecutionEngine instead. Will be removed in v0.3.0.
 */
export async function executeRun(options: RunExecutorOptions): Promise<Run> {
  console.warn(
    '[DEPRECATED] executeRun() is deprecated and will be removed in v0.3.0. ' +
    'Use ExecutionEngine.execute() instead. ' +
    'Set AGENTGATE_USE_LEGACY_EXECUTOR=false to use new engine.'
  );

  // ... existing implementation
}
```

### Phase 2: Environment Variable Fallback

Allow temporary fallback via environment variable:

```typescript
// orchestrator.ts
const useLegacyExecutor = process.env.AGENTGATE_USE_LEGACY_EXECUTOR === 'true';

if (useLegacyExecutor) {
  log.warn('Using legacy executeRun() - this will be removed in v0.3.0');
  run = await executeRun(executorOptions);
} else {
  // New execution path (default)
  const { engine, input } = createOrchestratorEngine(executorOptions);
  const result = await engine.execute(input);
  run = result.run;
}
```

### Phase 3: Removal (v0.2.26 completion)

After verifying the new path works:

1. Remove `run-executor.ts`
2. Remove `execution/coordinator.ts`
3. Remove fallback code from orchestrator
4. Update all imports

---

## Files to Delete

### run-executor.ts

```bash
rm packages/server/src/orchestrator/run-executor.ts
```

**Checklist before deletion**:
- [ ] All tests updated to use ExecutionEngine
- [ ] No direct imports remain
- [ ] Integration tests pass with new engine
- [ ] E2E tests pass with real GitHub

### execution/coordinator.ts

```bash
rm packages/server/src/execution/coordinator.ts
```

**Already deprecated** in v0.2.24, safe to remove.

---

## Import Updates

### orchestrator.ts

**Before**:
```typescript
import { executeRun, type RunExecutorOptions } from './run-executor.js';
```

**After**:
```typescript
import { createExecutionEngine, type ExecutionInput } from '../execution/index.js';
import { createServicesFromCallbacks } from './engine-bridge.js';
import { resolveTaskSpec } from '../execution/task-spec-resolver.js';
```

### execution/index.ts

**Before**:
```typescript
// Legacy Coordinator (deprecated - use ExecutionEngine)
export {
  ExecutionCoordinator,
  createExecutionCoordinator,
  type ExecutionCallbacks,
  type BuildContext,
  type SnapshotContext,
  type IterationResult as LegacyIterationResult,
  type ExecutionResult as LegacyExecutionResult,
} from './coordinator.js';
```

**After**:
```typescript
// Removed legacy coordinator exports
```

---

## Test Updates

### Tests Using executeRun Directly

These tests need to be updated to use ExecutionEngine:

```typescript
// Before
import { executeRun } from '../orchestrator/run-executor.js';
const run = await executeRun(options);

// After
import { createExecutionEngine } from '../execution/index.js';
const engine = createExecutionEngine();
const result = await engine.execute(input);
const run = result.run;
```

### Tests to Update

| Test File | Changes Needed |
|-----------|----------------|
| `test/orchestrator/run-executor.test.ts` | Rename to engine.test.ts, update API |
| `test/integration/full-run.test.ts` | Use ExecutionEngine |
| `test/e2e/github-e2e.test.ts` | Verify still works with new engine |

---

## Type Cleanup

### RunExecutorOptions → ExecutionInput

The `RunExecutorOptions` interface had 16+ callback parameters. These are now handled by:

1. **PhaseServices** - For execution callbacks
2. **DeliveryManager** - For GitHub callbacks
3. **ProgressEmitter** - For observability callbacks

### Types to Remove

```typescript
// These types are no longer needed after removal:

// From run-executor.ts
export interface RunExecutorOptions { ... }

// From coordinator.ts
export interface ExecutionCallbacks { ... }
export interface BuildContext { ... }
export interface SnapshotContext { ... }
```

---

## Verification Steps

Before removing legacy code:

1. **Run all unit tests**
   ```bash
   pnpm test
   ```

2. **Run integration tests**
   ```bash
   pnpm test:integration
   ```

3. **Run E2E tests (if GitHub token available)**
   ```bash
   AGENTGATE_GITHUB_TOKEN=xxx pnpm test:e2e
   ```

4. **Manual smoke test**
   ```bash
   # Create a simple work order and verify execution
   pnpm dev:server &
   curl -X POST http://localhost:3000/api/work-orders -d '{...}'
   ```

5. **Check for any remaining imports**
   ```bash
   grep -r "run-executor" packages/server/src/
   grep -r "executeRun" packages/server/src/
   grep -r "coordinator" packages/server/src/execution/
   ```

---

## Rollback Procedure

If issues are discovered after removal:

1. **Git revert** the removal commit
2. **Re-enable** legacy executor
3. **Investigate** the issue
4. **Fix** and retry removal

```bash
# Revert if needed
git revert HEAD
git push origin main
```

---

## Timeline

| Step | When | Duration |
|------|------|----------|
| Add deprecation notices | Start of v0.2.26 | 10 min |
| Update tests to new engine | After integration | 2 hours |
| Verify all tests pass | Before removal | 30 min |
| Remove legacy files | End of v0.2.26 | 30 min |
| Final verification | After removal | 30 min |

**Total deprecation and removal time**: ~4 hours
