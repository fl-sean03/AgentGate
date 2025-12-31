# DevGuide v0.2.3: Implementation

## Thrust 1: Verifier Module

### 1.1 Objective
Fix all 22 lint errors in the verifier module (7 files).

### 1.2 Files and Fixes

#### 1.2.1 verifier/clean-room.ts (8 errors)
- Line 6: Remove unused imports `mkdir`, `rm`, `writeFile`, `chmod` from fs/promises
- Line 7: Remove unused import `resolve` from path
- Line 155: Rename `gatePlan` to `_gatePlan` (unused parameter)
- Line 160: Remove unused variable `packageJsonPath`
- Line 166: Remove unused variable `npmLock`

#### 1.2.2 verifier/l0-contracts.ts (6 errors)
- Line 6: Remove unused imports `readdir`, `stat` from fs/promises
- Line 7: Remove unused import `relative` from path
- Line 9: Remove unused import `GatePlan` from types
- Line 10: Remove unused imports `Diagnostic`, `ContractCheckResult` from types

#### 1.2.3 verifier/l1-tests.ts (3 errors)
- Line 7: Remove unused imports `GatePlan`, `CommandResult` from types
- Line 143: Rename `ctx` to `_ctx` (unused parameter)

#### 1.2.4 verifier/l2-blackbox.ts (7 errors)
- Line 6: Remove unused imports `writeFile`, `mkdir`, `access` from fs/promises
- Line 7: Remove unused import `dirname` from path
- Line 9: Remove unused import `GatePlan` from types
- Line 300: Add eslint-disable for unsafe any assignment
- Line 355: Remove unused function `getJsonPath`

#### 1.2.5 verifier/l3-sanity.ts (2 errors)
- Line 6: Remove unused imports `readdir`, `access` from fs/promises

#### 1.2.6 verifier/types.ts (3 errors)
- Line 8: Remove unused import `Workspace`
- Line 11: Remove unused import `CommandResult`
- Line 12: Remove unused import `BlackboxResult`

#### 1.2.7 verifier/verifier.ts (4 errors)
- Line 9: Remove unused import `GatePlan`
- Line 61: Remove unused variable `verbose`
- Line 98: Add explicit return type to function
- Line 251: Fix template expression type (add String() or type assertion)

### 1.3 Verification
```bash
pnpm lint 2>&1 | grep "verifier/" | wc -l
# Should be 0
```

---

## Thrust 2: Orchestrator Module

### 2.1 Objective
Fix all 10 lint errors in the orchestrator module (3 files).

### 2.2 Files and Fixes

#### 2.2.1 orchestrator/orchestrator.ts (7 errors)
- Line 12: Remove unused import `VerificationReport`
- Line 15: Remove unused import `WorkOrderStatus`
- Line 16: Remove unused import `AgentType`
- Line 107: Remove unnecessary type assertion
- Line 234: Add eslint-disable for require-await (callback interface)
- Line 286: Add explicit return type
- Line 293: Add explicit return type

#### 2.2.2 orchestrator/run-executor.ts (3 errors)
- Line 16: Remove unused import `RunState`
- Line 19: Remove unused import `WorkOrderStatus`
- Line 24: Remove unused import `getResultForEvent`

#### 2.2.3 orchestrator/run-store.ts (1 error)
- Line 6: Remove unused import `mkdir` from fs/promises

### 2.3 Verification
```bash
pnpm lint 2>&1 | grep "orchestrator/" | wc -l
# Should be 0
```

---

## Thrust 3: Control Plane Module

### 3.1 Objective
Fix all 8 lint errors in the control-plane module (4 files).

### 3.2 Files and Fixes

#### 3.2.1 control-plane/commands/list.ts (1 error)
- Line 31: Cast argument to proper type or use type guard

#### 3.2.2 control-plane/commands/submit.ts (2 errors)
- Line 8: Remove unused import `parseWorkspaceSource`
- Line 63: Cast argument to proper type or use type guard

#### 3.2.3 control-plane/formatter.ts (3 errors)
- Line 1: Remove unused import `ListFilters`
- Line 399: Add eslint-disable for console.log (CLI output)
- Line 406: Add eslint-disable for console.log (CLI output)

#### 3.2.4 control-plane/validators.ts (3 errors)
- Line 91: Add explicit return type to function
- Line 98: Add explicit return type to function
- Line 252: Replace `||` with `??`

### 3.3 Verification
```bash
pnpm lint 2>&1 | grep "control-plane/" | wc -l
# Should be 0
```

---

## Thrust 4: Gate Module

### 4.1 Objective
Fix all 5 lint errors in the gate module (3 files).

### 4.2 Files and Fixes

#### 4.2.1 gate/ci-ingestion.ts (2 errors)
- Line 6: Remove unused import `join` from path
- Line 74: Rename `workspacePath` to `_workspacePath` (unused parameter)

#### 4.2.2 gate/github-actions-parser.ts (3 errors)
- Line 75: Replace `&&` chain with optional chaining `?.`
- Line 161: Replace `||` with `??`
- Line 198: Replace `||` with `??`

#### 4.2.3 gate/verify-profile-parser.ts (1 error)
- Line 10: Remove unused import `ProfileNotFoundError`

### 4.3 Verification
```bash
pnpm lint 2>&1 | grep "gate/" | wc -l
# Should be 0
```

---

## Thrust 5: Workspace Module

### 5.1 Objective
Fix all 3 lint errors in the workspace module (2 files).

### 5.2 Files and Fixes

#### 5.2.1 workspace/checkout.ts (1 error)
- Line 5: Remove unused import `ensureDir`

#### 5.2.2 workspace/manager.ts (2 errors)
- Line 87: Fix unbound method references in filter - use arrow function wrapper

### 5.3 Verification
```bash
pnpm lint 2>&1 | grep "workspace/" | wc -l
# Should be 0
```

---

## Thrust 6: Other Modules

### 6.1 Objective
Fix remaining 5 lint errors in artifacts, feedback, snapshot, and index.

### 6.2 Files and Fixes

#### 6.2.1 artifacts/cleanup.ts (1 error)
- Line 163: Remove unused variable `root`

#### 6.2.2 artifacts/store.ts (2 errors)
- Line 13: Remove unused import `getRunWorkOrderPath`
- Line 212: Fix unbound method reference

#### 6.2.3 feedback/formatter.ts (1 error)
- Line 1: Remove unused import `Failure`

#### 6.2.4 snapshot/snapshotter.ts (1 error)
- Line 2: Remove unused import `nanoid`

#### 6.2.5 index.ts (2 errors)
- Line 12: Add eslint-disable for console.log (CLI entry point)
- Line 20: Add `.catch()` or `void` to handle promise

### 6.3 Verification
```bash
pnpm lint 2>&1 | grep -E "artifacts/|feedback/|snapshot/|index.ts" | wc -l
# Should be 0
```

---

## Thrust 7: Final Validation

### 7.1 Objective
Verify complete lint cleanup and all tests pass.

### 7.2 Verification Steps

1. Run full lint check:
```bash
pnpm lint
# Expected: 0 errors, 0 warnings
```

2. Run TypeScript check:
```bash
pnpm typecheck
# Expected: No errors
```

3. Run test suite:
```bash
pnpm test
# Expected: 35 tests passing
```

4. Run build:
```bash
pnpm build
# Expected: Success
```

5. Update package version to 0.2.3

---

## Implementation Order

For efficiency, implement thrusts in this order:

1. **Thrust 6** - Other Modules (fewest files, warm up)
2. **Thrust 5** - Workspace Module (small, simple)
3. **Thrust 4** - Gate Module (small)
4. **Thrust 3** - Control Plane Module (moderate)
5. **Thrust 2** - Orchestrator Module (moderate)
6. **Thrust 1** - Verifier Module (largest, most changes)
7. **Thrust 7** - Final Validation
