# DevGuide v0.2.2: Technical Debt Cleanup & Quality Ratchet

**Status**: IN PROGRESS
**Created**: 2025-12-30
**Target**: Zero lint errors, zero type errors, improved test coverage

---

## Executive Summary

This DevGuide addresses technical debt accumulated during rapid v0.2.1 feature development. The focus is on code quality, type safety, and establishing a quality ratchet that prevents regression.

**Evidence-Based Assessment:**
- 1 TypeScript error blocking compilation
- ~40 ESLint errors across 7 files
- 0% test coverage in verifier module
- ~20% coverage in orchestrator module
- Package version mismatch (0.1.0 vs actual 0.2.1)

---

## Success Criteria

1. `pnpm typecheck` passes with zero errors
2. `pnpm lint` passes with zero errors
3. All existing tests continue to pass (35 tests)
4. Package version updated to 0.2.2
5. No new lint rules disabled

---

## Thrust Summary

| # | Thrust | Description | Status |
|---|--------|-------------|--------|
| 1 | Fix TypeScript Error | Resolve type narrowing in opencode-driver.ts | Pending |
| 2 | Fix Unused Imports | Remove 6 unused import statements | Pending |
| 3 | Fix require-await | Address async functions without await | Pending |
| 4 | Fix Type Safety | Eliminate unsafe any access patterns | Pending |
| 5 | Fix Nullish Coalescing | Replace || with ?? where appropriate | Pending |
| 6 | Add Missing Return Types | Add explicit return types | Pending |
| 7 | Update Package Version | Bump to 0.2.2 | Pending |
| 8 | Final Validation | Run all checks and tests | Pending |

---

## Files to Modify

### TypeScript Error (1 file)
| File | Issue | Action |
|------|-------|--------|
| `src/agent/opencode-driver.ts:280` | Property 'completed' type narrowing | Fix type guard |

### ESLint Errors (7 files)
| File | Issues | Line Numbers |
|------|--------|--------------|
| `src/agent/claude-agent-sdk-driver.ts` | Unused imports, require-await | 7, 71 |
| `src/agent/claude-code-driver.ts` | require-await, unused var | 47, 117 |
| `src/agent/openai-agents-driver.ts` | Missing return type, require-await, unsafe any | 60, 169, 261 |
| `src/agent/openai-codex-driver.ts` | Unused imports, require-await | 8, 74 |
| `src/agent/opencode-driver.ts` | prefer-nullish-coalescing, require-await | 142, 205, 210, 212, 262, 400 |
| `src/agent/sdk-hooks.ts` | Unused import, require-await | 12, 39, 50, 71, 95 |
| `src/agent/sdk-message-parser.ts` | Unsafe any access (15+ instances) | 106-158, 207-209 |

### Package Update (1 file)
| File | Change |
|------|--------|
| `package.json` | version: "0.1.0" → "0.2.2" |

---

## Navigation

- [01-overview.md](./01-overview.md) - Detailed debt analysis and rationale
- [02-implementation.md](./02-implementation.md) - Thrust specifications
- [03-appendices.md](./03-appendices.md) - Checklists and verification commands

---

## Quick Reference

### Verification Commands

```bash
# TypeScript check
pnpm typecheck

# Lint check
pnpm lint

# Run tests
pnpm test

# Full validation (all must pass)
pnpm typecheck && pnpm lint && pnpm test
```

### Error Counts (Before)

| Category | Count |
|----------|-------|
| TypeScript errors | 1 |
| ESLint errors | ~40 |
| ESLint warnings | 1 |
| Test failures | 0 |

### Target (After)

| Category | Count |
|----------|-------|
| TypeScript errors | 0 |
| ESLint errors | 0 |
| ESLint warnings | 0 |
| Test failures | 0 |
