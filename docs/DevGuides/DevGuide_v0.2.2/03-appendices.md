# DevGuide v0.2.2: Appendices

## A. Master Checklist

### Thrust 1: Fix TypeScript Error
- [ ] Fix type narrowing in opencode-driver.ts:280
- [ ] Run `pnpm typecheck` - passes

### Thrust 2: Fix Unused Imports
- [ ] Remove Options, SDKMessage from claude-agent-sdk-driver.ts
- [ ] Remove ThreadEvent, Usage from openai-codex-driver.ts
- [ ] Remove HookJSONOutput from sdk-hooks.ts
- [ ] Remove killed variable from claude-code-driver.ts

### Thrust 3: Fix require-await
- [ ] Add eslint-disable to claude-agent-sdk-driver.ts:71
- [ ] Add eslint-disable to claude-code-driver.ts:47
- [ ] Add eslint-disable to openai-agents-driver.ts:169
- [ ] Add eslint-disable to openai-codex-driver.ts:74
- [ ] Fix opencode-driver.ts:400 dispose method
- [ ] Add eslint-disable to sdk-hooks.ts async hooks

### Thrust 4: Fix Type Safety
- [ ] Define content block interfaces in sdk-message-parser.ts
- [ ] Add type guard functions
- [ ] Update extractToolCalls function
- [ ] Update extractToolResults function
- [ ] Fix lines 207-209

### Thrust 5: Fix Nullish Coalescing
- [ ] opencode-driver.ts:142 - use ??
- [ ] opencode-driver.ts:205 - use ??
- [ ] opencode-driver.ts:210 - use ??
- [ ] opencode-driver.ts:212 - use ??
- [ ] opencode-driver.ts:262 - use ??
- [ ] openai-agents-driver.ts:261 - use ??

### Thrust 6: Add Missing Return Types
- [ ] Add return type to openai-agents-driver.ts:60

### Thrust 7: Update Package Version
- [ ] Update package.json version to 0.2.2

### Thrust 8: Final Validation
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (0 errors, 0 warnings)
- [ ] `pnpm test` passes (35 tests)
- [ ] `pnpm build` succeeds

---

## B. File Reference

### Files to Modify

| File | Lines | Changes |
|------|-------|---------|
| `src/agent/opencode-driver.ts` | 142, 205, 210, 212, 262, 280, 400 | Type fix, nullish coalescing, dispose |
| `src/agent/claude-agent-sdk-driver.ts` | 7, 71 | Remove imports, eslint-disable |
| `src/agent/claude-code-driver.ts` | 47, 117 | eslint-disable, remove var |
| `src/agent/openai-codex-driver.ts` | 8, 74 | Remove imports, eslint-disable |
| `src/agent/openai-agents-driver.ts` | 60, 169, 261 | Return type, eslint-disable, nullish |
| `src/agent/sdk-hooks.ts` | 12, 39, 50, 71, 95 | Remove import, eslint-disable |
| `src/agent/sdk-message-parser.ts` | 106-158, 207-209 | Add types and guards |
| `package.json` | 3 | Update version |

---

## C. Verification Commands

### TypeScript
```bash
pnpm typecheck
# Expected: No errors
```

### ESLint
```bash
pnpm lint
# Expected: No errors, no warnings
```

### Specific Error Checks
```bash
# Check for unused imports
pnpm lint 2>&1 | grep "is defined but never used"

# Check for require-await
pnpm lint 2>&1 | grep "require-await"

# Check for unsafe any
pnpm lint 2>&1 | grep "no-unsafe"

# Check for nullish coalescing
pnpm lint 2>&1 | grep "prefer-nullish-coalescing"
```

### Tests
```bash
pnpm test
# Expected: 35 tests passing
```

### Full Validation
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
# Expected: All succeed
```

---

## D. Error Summary (Before)

### TypeScript Errors
```
src/agent/opencode-driver.ts(280,54): error TS2339: Property 'completed' does not exist on type
```

### ESLint Errors by File

**claude-agent-sdk-driver.ts**
- Line 7: 'Options' is defined but never used
- Line 7: 'SDKMessage' is defined but never used
- Line 71: Async method 'isAvailable' has no 'await' expression

**claude-code-driver.ts**
- Line 47: Async method 'isAvailable' has no 'await' expression
- Line 117: 'killed' is assigned a value but never used

**openai-agents-driver.ts**
- Line 60: Missing return type on function
- Line 169: Async method 'isAvailable' has no 'await' expression
- Line 261: Unsafe assignment of an `any` value
- Line 261: Unsafe member access .finalOutput on an `any` value

**openai-codex-driver.ts**
- Line 8: 'ThreadEvent' is defined but never used
- Line 8: 'Usage' is defined but never used
- Line 74: Async method 'isAvailable' has no 'await' expression

**opencode-driver.ts**
- Line 142: Prefer nullish coalescing operator
- Line 205: Prefer nullish coalescing operator
- Line 210: Prefer nullish coalescing operator
- Line 212: Prefer nullish coalescing operator
- Line 262: Prefer nullish coalescing operator
- Line 400: Async method 'dispose' has no 'await' expression

**sdk-hooks.ts**
- Line 12: 'HookJSONOutput' is defined but never used
- Line 39: Async arrow function 'preHook' has no 'await' expression
- Line 50: Async arrow function 'postHook' has no 'await' expression
- Line 71: Async arrow function 'hook' has no 'await' expression
- Line 95: Async arrow function 'hook' has no 'await' expression

**sdk-message-parser.ts**
- Lines 106-158: 15+ unsafe any access errors
- Lines 207-209: 3 unsafe assignment errors

---

## E. eslint-disable Comment Format

Use this format for eslint-disable comments:

```typescript
// eslint-disable-next-line @typescript-eslint/require-await -- Dynamic import is async
async isAvailable(): Promise<boolean> {
```

```typescript
// eslint-disable-next-line @typescript-eslint/require-await -- SDK callback must be async per interface
```

Always include a justification comment after `--`.

---

## F. Type Guard Pattern

Example type guard for content blocks:

```typescript
interface TextContentBlock {
  type: 'text';
  text: string;
}

function isTextBlock(block: unknown): block is TextContentBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    (block as { type: unknown }).type === 'text' &&
    'text' in block &&
    typeof (block as { text: unknown }).text === 'string'
  );
}
```

---

## G. Rollback Plan

If any thrust introduces issues:

1. Check git status for modified files
2. Revert specific file: `git checkout -- <file>`
3. Re-run verification commands
4. Document what went wrong in reports/

---

## H. Post-Implementation Tasks

After v0.2.2 is complete:

1. Update DevGuide README.md with new version entry
2. Create completion report in reports/
3. Consider future DevGuide for test coverage improvement
4. Consider future DevGuide for large file refactoring
