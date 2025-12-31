# DevGuide v0.2.3: Overview

## Current State Analysis

The codebase has accumulated lint errors during initial development. These are primarily "dead code" issues - imports and variables that were added during development but never used, or became unused after refactoring.

### Error Distribution by Type

| Error Type | Count | Severity |
|------------|-------|----------|
| `no-unused-vars` (imports) | ~35 | Low - dead code |
| `no-unused-vars` (variables) | ~10 | Low - dead code |
| `prefer-nullish-coalescing` | 3 | Low - style |
| `prefer-optional-chain` | 1 | Low - style |
| `no-unsafe-assignment` | 1 | Medium - type safety |
| `no-floating-promises` | 1 | Medium - error handling |
| `unbound-method` | 2 | Medium - potential bug |
| `no-unnecessary-type-assertion` | 1 | Low - style |
| `require-await` | 1 | Low - style |
| `restrict-template-expressions` | 1 | Medium - type safety |
| `explicit-function-return-type` | 4 | Low - style (warning) |
| `no-console` | 3 | Low - intentional CLI (warning) |

---

## Fix Strategies

### 1. Unused Imports (Majority of Errors)

**Pattern:** Import statements include types/functions that are never used.

**Example:**
```typescript
// Before
import { mkdir, rm, writeFile, chmod } from 'node:fs/promises';
// Only mkdir is actually used

// After
import { mkdir } from 'node:fs/promises';
```

**Strategy:** Remove unused names from import statements. If entire import becomes empty, remove the line.

---

### 2. Unused Function Parameters

**Pattern:** Function signature includes parameters that aren't used in the body.

**Example:**
```typescript
// Before
async function ingestCI(workspacePath: string, gatePlan: GatePlan) {
  // workspacePath is never used
}

// After - prefix with underscore
async function ingestCI(_workspacePath: string, gatePlan: GatePlan) {
  // Now ESLint knows it's intentionally unused
}
```

**Strategy:** Prefix unused parameters with `_` to indicate intentional non-use.

---

### 3. Unused Assigned Variables

**Pattern:** Variable is assigned but never read.

**Example:**
```typescript
// Before
const verbose = options.verbose ?? false;
// verbose is never used

// After - remove if not needed
// Or use it, or prefix with _
```

**Strategy:** Remove the variable if it's truly dead code, or use `_` prefix if it's for future use.

---

### 4. Nullish Coalescing

**Pattern:** Using `||` when `??` is more appropriate.

**Example:**
```typescript
// Before
const value = input || 'default';  // Bug: 0 or '' become 'default'

// After
const value = input ?? 'default';  // Correct: only null/undefined become 'default'
```

**Strategy:** Replace `||` with `??` for default values.

---

### 5. Optional Chaining

**Pattern:** Using `&&` chains when `?.` is cleaner.

**Example:**
```typescript
// Before
if (obj && obj.prop && obj.prop.value) { ... }

// After
if (obj?.prop?.value) { ... }
```

**Strategy:** Replace `&&` chains with optional chaining.

---

### 6. Floating Promises

**Pattern:** Promise not awaited or handled.

**Example:**
```typescript
// Before
main();  // Promise returned but not handled

// After
main().catch(console.error);
// Or
void main();  // Explicitly mark as intentionally unhandled
```

**Strategy:** Add `.catch()` handler or `void` operator.

---

### 7. Unbound Methods

**Pattern:** Passing a method reference that may lose `this` binding.

**Example:**
```typescript
// Before
const result = items.filter(this.isValid);  // 'this' may be wrong

// After - use arrow function
const result = items.filter((item) => this.isValid(item));
// Or bind
const result = items.filter(this.isValid.bind(this));
```

**Strategy:** Use arrow function wrapper or explicit bind.

---

### 8. Console Statements

**Pattern:** `console.log` used for CLI output.

**For CLI entry points, console is intentional:**
```typescript
// eslint-disable-next-line no-console -- CLI output
console.log('Starting...');
```

**Strategy:** Add eslint-disable comment with justification.

---

## Module-by-Module Analysis

### Verifier Module (7 files)

The verifier module has the most issues because it was scaffolded with many imports that haven't been used yet. This is typical for modules under active development.

**Common patterns:**
- Imported `GatePlan` type but verification doesn't use it yet
- Imported fs functions for future features
- Imported path utilities not yet needed

### Orchestrator Module (3 files)

The orchestrator has some type-related issues and a few unused imports from refactoring.

**Key issues:**
- Unnecessary type assertion on line 107
- Async method without await (callback pattern)
- Missing return types on helper functions

### Control Plane Module (4 files)

CLI-related code with some console statements and type safety issues.

**Key issues:**
- Console statements for CLI output (intentional)
- Unsafe any in formatter calls

### Gate Module (3 files)

Gate resolution logic with some style issues.

**Key issues:**
- Optional chaining opportunity
- Nullish coalescing for defaults

### Workspace Module (2 files)

Workspace management with method binding issues.

**Key issues:**
- Unbound method references in filter callbacks

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Removing actually-used code | Very Low | High | Only remove imports, run tests |
| Breaking type inference | Low | Medium | TypeScript will catch issues |
| Missing edge cases | Very Low | Low | Changes are syntactic only |

---

## Approach

1. **Fix by module** - Work through one module at a time to stay organized
2. **Test after each module** - Run `pnpm test` after completing each module's fixes
3. **Verify lint count decreases** - Check error count after each thrust
4. **No behavior changes** - These are all syntactic/dead-code fixes
