# DevGuide v0.2.2: Overview

## Current State Assessment

### Evidence Collected

**TypeScript Errors:**
```
src/agent/opencode-driver.ts(280,54): error TS2339: Property 'completed'
does not exist on type '{ created: number; completed?: number; } | { created: number; }'.
```

**ESLint Summary (pnpm lint output):**
- 7 files with errors
- ~40 total errors
- 1 warning

**Test Results:**
- 35 tests passing
- 6 test files
- 0% coverage in verifier module
- ~20% coverage in orchestrator module

---

## Debt Categories

### Category 1: TypeScript Type Safety

**File:** `src/agent/opencode-driver.ts`
**Line:** 280
**Issue:** Accessing `completed` property without proper type narrowing

The OpenCode SDK returns messages with two possible `time` types:
```typescript
type TimeInfo =
  | { created: number; completed?: number }  // Has optional completed
  | { created: number }                       // No completed property
```

The current code assumes `completed` exists, but TypeScript union types require explicit checking.

**Fix:** Use optional chaining or explicit type guard.

---

### Category 2: Unused Imports

**Why it matters:** Dead code increases cognitive load and bundle size.

| File | Unused Import(s) |
|------|------------------|
| `claude-agent-sdk-driver.ts:7` | `Options`, `SDKMessage` |
| `openai-codex-driver.ts:8` | `ThreadEvent`, `Usage` |
| `sdk-hooks.ts:12` | `HookJSONOutput` |
| `claude-code-driver.ts:117` | `killed` variable |

---

### Category 3: Async Functions Without Await

**Why it matters:** Functions marked `async` that don't use `await` should either:
1. Remove the `async` keyword
2. Return a Promise explicitly
3. Actually await something

**Affected Methods:**

| File | Method | Line |
|------|--------|------|
| `claude-agent-sdk-driver.ts` | `isAvailable()` | 71 |
| `claude-code-driver.ts` | `isAvailable()` | 47 |
| `openai-agents-driver.ts` | `isAvailable()` | 169 |
| `openai-codex-driver.ts` | `isAvailable()` | 74 |
| `opencode-driver.ts` | `dispose()` | 400 |
| `sdk-hooks.ts` | `preHook()` | 39 |
| `sdk-hooks.ts` | `postHook()` | 50 |
| `sdk-hooks.ts` | `hook()` (x2) | 71, 95 |

**Pattern:** All `isAvailable()` methods are async but just check synchronous conditions.

---

### Category 4: Unsafe Any Access

**Why it matters:** TypeScript's `any` type bypasses all type checking, hiding potential runtime errors.

**File:** `src/agent/sdk-message-parser.ts`

This file parses Claude SDK message structures and has 15+ unsafe any accesses. The SDK returns complex nested objects that weren't properly typed.

**Lines affected:** 106-158, 207-209

**Pattern:** Iterating over message content blocks without type guards.

---

### Category 5: Nullish Coalescing

**Why it matters:** Using `||` instead of `??` can cause bugs with falsy values like `0` or `""`.

**File:** `src/agent/opencode-driver.ts`

| Line | Current | Should Be |
|------|---------|-----------|
| 142 | `process.env.OPENCODE_PROVIDER \|\| 'anthropic'` | `?? 'anthropic'` |
| 205 | `process.env.OPENCODE_PROVIDER \|\| 'openai'` | `?? 'openai'` |
| 210 | `process.env.OPENAI_API_MODEL \|\| 'gpt-4o'` | `?? 'gpt-4o'` |
| 212 | `process.env.CLAUDE_MODEL \|\| '...'` | `?? '...'` |
| 262 | `messagesCheck.data \|\| []` | `?? []` |

---

### Category 6: Missing Return Types

**File:** `src/agent/openai-agents-driver.ts:60`

Helper functions should have explicit return types for better documentation and type inference.

---

## Architecture Decision

### Approach: Fix in Place

Rather than refactoring, we fix each issue at its source. This approach:
- Minimizes risk of introducing new bugs
- Keeps changes small and reviewable
- Maintains existing test coverage
- Can be done incrementally

### Non-Goals

This DevGuide explicitly does NOT:
- Refactor large files into smaller modules
- Add new test coverage (future DevGuide)
- Change any runtime behavior
- Add new features

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing behavior | Low | High | Run full test suite after each thrust |
| Missing edge cases in type fixes | Medium | Low | Use conservative type guards |
| Lint fixes causing runtime issues | Very Low | Medium | Changes are syntactic only |

---

## Dependencies

No external dependencies required. All fixes use existing TypeScript/ESLint capabilities.

---

## Estimated Effort

| Thrust | Effort |
|--------|--------|
| Fix TypeScript Error | Small (1 line change) |
| Fix Unused Imports | Small (delete lines) |
| Fix require-await | Small (remove async or add Promise.resolve) |
| Fix Type Safety | Medium (add type guards) |
| Fix Nullish Coalescing | Small (|| → ??) |
| Add Missing Return Types | Small (add type annotations) |
| Update Package Version | Trivial |
| Validation | Small (run commands) |

**Total: Small to Medium effort, low risk**
