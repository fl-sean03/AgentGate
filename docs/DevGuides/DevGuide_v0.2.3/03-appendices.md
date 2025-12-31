# DevGuide v0.2.3: Appendices

## A. Master Checklist

### Thrust 1: Verifier Module
- [ ] clean-room.ts - Remove unused imports and variables
- [ ] l0-contracts.ts - Remove unused imports
- [ ] l1-tests.ts - Remove unused imports, fix param
- [ ] l2-blackbox.ts - Remove unused imports, fix unsafe any
- [ ] l3-sanity.ts - Remove unused imports
- [ ] types.ts - Remove unused imports
- [ ] verifier.ts - Remove unused, add return type, fix template

### Thrust 2: Orchestrator Module
- [ ] orchestrator.ts - Remove unused, fix assertion, add return types
- [ ] run-executor.ts - Remove unused imports
- [ ] run-store.ts - Remove unused import

### Thrust 3: Control Plane Module
- [ ] commands/list.ts - Fix unsafe argument
- [ ] commands/submit.ts - Remove unused, fix unsafe argument
- [ ] formatter.ts - Remove unused, add console eslint-disable
- [ ] validators.ts - Add return types, fix nullish coalescing

### Thrust 4: Gate Module
- [ ] ci-ingestion.ts - Remove unused, fix param
- [ ] github-actions-parser.ts - Optional chain, nullish coalescing
- [ ] verify-profile-parser.ts - Remove unused import

### Thrust 5: Workspace Module
- [ ] checkout.ts - Remove unused import
- [ ] manager.ts - Fix unbound methods

### Thrust 6: Other Modules
- [ ] artifacts/cleanup.ts - Remove unused variable
- [ ] artifacts/store.ts - Remove unused, fix unbound method
- [ ] feedback/formatter.ts - Remove unused import
- [ ] snapshot/snapshotter.ts - Remove unused import
- [ ] index.ts - Add console eslint-disable, handle promise

### Thrust 7: Final Validation
- [ ] `pnpm lint` passes (0 errors, 0 warnings)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (35 tests)
- [ ] `pnpm build` succeeds
- [ ] Update package.json version to 0.2.3

---

## B. Verification Commands

### Per-Module Lint Check
```bash
# Verifier
pnpm lint 2>&1 | grep "verifier/"

# Orchestrator
pnpm lint 2>&1 | grep "orchestrator/"

# Control Plane
pnpm lint 2>&1 | grep "control-plane/"

# Gate
pnpm lint 2>&1 | grep "gate/"

# Workspace
pnpm lint 2>&1 | grep "workspace/"

# Other
pnpm lint 2>&1 | grep -E "artifacts/|feedback/|snapshot/|src/index.ts"
```

### Full Validation
```bash
pnpm typecheck && pnpm lint && pnpm test
```

### Error Count Check
```bash
pnpm lint 2>&1 | grep "problems" || echo "No problems"
```

---

## C. Common Fix Patterns

### Remove Unused Import
```typescript
// Before
import { used, unused } from 'module';

// After
import { used } from 'module';
```

### Prefix Unused Parameter
```typescript
// Before
function foo(unused: string, used: number) { return used; }

// After
function foo(_unused: string, used: number) { return used; }
```

### Remove Unused Variable
```typescript
// Before
const unused = getValue();
doSomething();

// After
getValue();  // If side effects matter
doSomething();
// Or just remove the line if no side effects
```

### Nullish Coalescing
```typescript
// Before
const value = input || 'default';

// After
const value = input ?? 'default';
```

### Optional Chaining
```typescript
// Before
if (obj && obj.prop) { obj.prop.method(); }

// After
obj?.prop?.method();
```

### Handle Floating Promise
```typescript
// Before
main();

// After - if errors should crash
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Or - if intentionally fire-and-forget
void main();
```

### Fix Unbound Method
```typescript
// Before
items.filter(this.isValid);

// After
items.filter((item) => this.isValid(item));
```

### Add Return Type
```typescript
// Before
function helper() {
  return { success: true };
}

// After
function helper(): { success: boolean } {
  return { success: true };
}
```

### ESLint Disable for Console
```typescript
// eslint-disable-next-line no-console -- CLI output
console.log('Status:', status);
```

---

## D. Error Reference

### Full Error List (Before)

```
src/artifacts/cleanup.ts:163 - 'root' unused
src/artifacts/store.ts:13 - 'getRunWorkOrderPath' unused
src/artifacts/store.ts:212 - unbound method
src/control-plane/commands/list.ts:31 - unsafe argument
src/control-plane/commands/submit.ts:8 - 'parseWorkspaceSource' unused
src/control-plane/commands/submit.ts:63 - unsafe argument
src/control-plane/formatter.ts:1 - 'ListFilters' unused
src/control-plane/formatter.ts:399 - console
src/control-plane/formatter.ts:406 - console
src/control-plane/validators.ts:91 - missing return type
src/control-plane/validators.ts:98 - missing return type
src/control-plane/validators.ts:252 - prefer-nullish-coalescing
src/feedback/formatter.ts:1 - 'Failure' unused
src/gate/ci-ingestion.ts:6 - 'join' unused
src/gate/ci-ingestion.ts:74 - 'workspacePath' unused param
src/gate/github-actions-parser.ts:75 - prefer-optional-chain
src/gate/github-actions-parser.ts:161 - prefer-nullish-coalescing
src/gate/github-actions-parser.ts:198 - prefer-nullish-coalescing
src/gate/verify-profile-parser.ts:10 - 'ProfileNotFoundError' unused
src/index.ts:12 - console
src/index.ts:20 - no-floating-promises
src/orchestrator/orchestrator.ts:12 - 'VerificationReport' unused
src/orchestrator/orchestrator.ts:15 - 'WorkOrderStatus' unused
src/orchestrator/orchestrator.ts:16 - 'AgentType' unused
src/orchestrator/orchestrator.ts:107 - unnecessary-type-assertion
src/orchestrator/orchestrator.ts:234 - require-await
src/orchestrator/orchestrator.ts:286 - missing return type
src/orchestrator/orchestrator.ts:293 - missing return type
src/orchestrator/run-executor.ts:16 - 'RunState' unused
src/orchestrator/run-executor.ts:19 - 'WorkOrderStatus' unused
src/orchestrator/run-executor.ts:24 - 'getResultForEvent' unused
src/orchestrator/run-store.ts:6 - 'mkdir' unused
src/snapshot/snapshotter.ts:2 - 'nanoid' unused
src/verifier/clean-room.ts:6 - 'mkdir,rm,writeFile,chmod' unused
src/verifier/clean-room.ts:7 - 'resolve' unused
src/verifier/clean-room.ts:155 - 'gatePlan' unused param
src/verifier/clean-room.ts:160 - 'packageJsonPath' unused
src/verifier/clean-room.ts:166 - 'npmLock' unused
src/verifier/l0-contracts.ts:6 - 'readdir,stat' unused
src/verifier/l0-contracts.ts:7 - 'relative' unused
src/verifier/l0-contracts.ts:9 - 'GatePlan' unused
src/verifier/l0-contracts.ts:10 - 'Diagnostic,ContractCheckResult' unused
src/verifier/l1-tests.ts:7 - 'GatePlan,CommandResult' unused
src/verifier/l1-tests.ts:143 - 'ctx' unused param
src/verifier/l2-blackbox.ts:6 - 'writeFile,mkdir,access' unused
src/verifier/l2-blackbox.ts:7 - 'dirname' unused
src/verifier/l2-blackbox.ts:9 - 'GatePlan' unused
src/verifier/l2-blackbox.ts:300 - unsafe-assignment
src/verifier/l2-blackbox.ts:355 - 'getJsonPath' unused
src/verifier/l3-sanity.ts:6 - 'readdir,access' unused
src/verifier/types.ts:8 - 'Workspace' unused
src/verifier/types.ts:11 - 'CommandResult' unused
src/verifier/types.ts:12 - 'BlackboxResult' unused
src/verifier/verifier.ts:9 - 'GatePlan' unused
src/verifier/verifier.ts:61 - 'verbose' unused
src/verifier/verifier.ts:98 - missing return type
src/verifier/verifier.ts:251 - restrict-template-expressions
src/workspace/checkout.ts:5 - 'ensureDir' unused
src/workspace/manager.ts:87 - unbound-method (x2)
```

---

## E. Post-Completion Tasks

After v0.2.3 is complete:

1. Update DevGuide README with v0.2.3 entry
2. Update 00-index.md to mark complete
3. Create completion report in reports/
4. Consider adding lint to CI/pre-commit hooks
5. Consider enabling stricter lint rules gradually
