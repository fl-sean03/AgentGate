# DevGuide v0.2.3: Complete Lint Cleanup

**Status**: IN PROGRESS
**Created**: 2025-12-30
**Target**: Zero lint errors and warnings across entire codebase

---

## Executive Summary

This DevGuide addresses all remaining pre-existing lint errors discovered during v0.2.2. The goal is to achieve a completely clean `pnpm lint` output with zero errors and zero warnings, establishing a quality baseline for future development.

**Current State:**
- 61 ESLint errors across 24 files
- 8 ESLint warnings across 4 files
- All errors are fixable without changing runtime behavior

---

## Success Criteria

1. `pnpm lint` passes with 0 errors and 0 warnings
2. `pnpm typecheck` continues to pass
3. All 35 tests continue to pass
4. No runtime behavior changes

---

## Error Summary by Category

| Category | Count | Fix Strategy |
|----------|-------|--------------|
| Unused imports | ~35 | Remove from import statements |
| Unused variables | ~10 | Remove or prefix with `_` |
| Nullish coalescing | 3 | Replace `\|\|` with `??` |
| Optional chaining | 1 | Replace `&&` chain with `?.` |
| Unsafe any | 1 | Add type annotation or eslint-disable |
| No-floating-promises | 1 | Add `void` operator or `.catch()` |
| Unbound methods | 2 | Use arrow function or bind |
| Unnecessary type assertion | 1 | Remove `as` cast |
| require-await | 1 | Add eslint-disable with comment |
| restrict-template-expressions | 1 | Fix type or add String() |
| Missing return types | 4 | Add explicit return types |
| Console statements | 3 | Add eslint-disable for CLI output |

---

## Thrust Summary

| # | Thrust | Description | Files | Status |
|---|--------|-------------|-------|--------|
| 1 | Verifier Module | Fix 7 verifier files | 7 | Pending |
| 2 | Orchestrator Module | Fix 3 orchestrator files | 3 | Pending |
| 3 | Control Plane Module | Fix 4 control-plane files | 4 | Pending |
| 4 | Gate Module | Fix 3 gate files | 3 | Pending |
| 5 | Workspace Module | Fix 2 workspace files | 2 | Pending |
| 6 | Other Modules | Fix artifacts, feedback, snapshot, index | 5 | Pending |
| 7 | Final Validation | Run all checks | - | Pending |

---

## Files to Modify

### Verifier Module (7 files, 22 errors)
| File | Errors | Issues |
|------|--------|--------|
| `verifier/clean-room.ts` | 8 | Unused imports, unused params/vars |
| `verifier/l0-contracts.ts` | 6 | Unused imports |
| `verifier/l1-tests.ts` | 3 | Unused imports, unused param |
| `verifier/l2-blackbox.ts` | 7 | Unused imports, unsafe any |
| `verifier/l3-sanity.ts` | 2 | Unused imports |
| `verifier/types.ts` | 3 | Unused imports |
| `verifier/verifier.ts` | 4 | Unused import, unused var, missing return type, template expr |

### Orchestrator Module (3 files, 10 errors)
| File | Errors | Issues |
|------|--------|--------|
| `orchestrator/orchestrator.ts` | 7 | Unused imports, type assertion, require-await, missing return types |
| `orchestrator/run-executor.ts` | 3 | Unused imports |
| `orchestrator/run-store.ts` | 1 | Unused import |

### Control Plane Module (4 files, 8 errors)
| File | Errors | Issues |
|------|--------|--------|
| `control-plane/commands/list.ts` | 1 | Unsafe argument |
| `control-plane/commands/submit.ts` | 2 | Unused import, unsafe argument |
| `control-plane/formatter.ts` | 3 | Unused import, console statements |
| `control-plane/validators.ts` | 3 | Missing return types, nullish coalescing |

### Gate Module (3 files, 5 errors)
| File | Errors | Issues |
|------|--------|--------|
| `gate/ci-ingestion.ts` | 2 | Unused import, unused param |
| `gate/github-actions-parser.ts` | 3 | Optional chain, nullish coalescing |
| `gate/verify-profile-parser.ts` | 1 | Unused import |

### Workspace Module (2 files, 3 errors)
| File | Errors | Issues |
|------|--------|--------|
| `workspace/checkout.ts` | 1 | Unused import |
| `workspace/manager.ts` | 2 | Unbound methods |

### Other Modules (5 files, 5 errors)
| File | Errors | Issues |
|------|--------|--------|
| `artifacts/cleanup.ts` | 1 | Unused variable |
| `artifacts/store.ts` | 2 | Unused import, unbound method |
| `feedback/formatter.ts` | 1 | Unused import |
| `snapshot/snapshotter.ts` | 1 | Unused import |
| `index.ts` | 2 | Console statement, floating promise |

---

## Navigation

- [01-overview.md](./01-overview.md) - Detailed error analysis
- [02-implementation.md](./02-implementation.md) - Thrust specifications
- [03-appendices.md](./03-appendices.md) - Checklists and commands

---

## Quick Reference

### Verification Commands

```bash
# Full lint check
pnpm lint

# TypeScript check
pnpm typecheck

# Run tests
pnpm test

# Complete validation
pnpm typecheck && pnpm lint && pnpm test
```

### Current Error Count
```
✖ 69 problems (61 errors, 8 warnings)
```

### Target
```
✔ 0 problems
```
