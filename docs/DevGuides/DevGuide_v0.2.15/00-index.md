# 00: Index - Production-Grade CI/CD System

## DevGuide v0.2.15

**Title:** Production-Grade CI/CD System
**Status:** In Progress
**Prerequisites:** v0.2.14 (Claude Agent SDK Integration), v0.2.13 (Container Sandboxing)

---

## Executive Summary

Implement a comprehensive, production-grade CI/CD system for AgentGate that serves as the verification gate for production. When CI is green, we ship. When red, we do not. This guide follows the principle of "green by truth" - achieving passing tests through correctness, not by hiding failures.

---

## Problem Statement

The current CI system has multiple issues:

| Issue | Impact | Solution |
|-------|--------|----------|
| Contract test fails (package resolution) | All platforms fail | Fix shared package resolution |
| Platform-specific path issues | macOS/Windows fail | Use path normalization |
| Flaky timing tests | Random failures | Use proper async patterns |
| Orphaned test artifacts | Resource leaks | Robust cleanup handlers |
| Long E2E test times | Slow feedback | Test tiering |

**Key Failures Identified:**

1. `test/contract/work-orders.contract.test.ts` - `@agentgate/shared` resolution error
2. `test/streaming-executor.test.ts` - `/tmp` vs `/private/tmp` on macOS
3. `test/sandbox/subprocess-provider.test.ts` - Same path issue on macOS/Windows

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GitHub Actions CI/CD                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                │
│  │   PR/Push CI   │  │   Nightly CI   │  │   Release CI   │                │
│  │  (Fast Gate)   │  │ (Full Matrix)  │  │  (Publish)     │                │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘                │
│          │                   │                   │                          │
│          ▼                   ▼                   ▼                          │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      TIER 1: FAST CHECKS (~2min)                      │ │
│  │  • lint        • typecheck      • format:check                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│          │                   │                   │                          │
│          ▼                   ▼                   ▼                          │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      TIER 2: UNIT TESTS (~5min)                       │ │
│  │  • Node 18/20/22 matrix     • Mock-isolated     • 550+ tests          │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│          │                   │                   │                          │
│          ▼                   ▼                   ▼                          │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                    TIER 3: INTEGRATION (~10min)                       │ │
│  │  • Platform tests (Ubuntu/macOS/Windows)    • Docker tests            │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│          │                   │                                              │
│          │                   ▼                                              │
│          │  ┌───────────────────────────────────────────────────────────┐  │
│          │  │                TIER 4: E2E (~20min) [Nightly]             │  │
│          │  │  • GitHub API tests    • Full work order lifecycle        │  │
│          │  └───────────────────────────────────────────────────────────┘  │
│          │                                       │                          │
│          ▼                                       ▼                          │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │                        RELEASE WORKFLOW                                ││
│  │  • Build artifacts    • GitHub Release    • npm publish               ││
│  └────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Success Criteria

- [ ] All CI checks pass on main branch
- [ ] PR feedback in under 5 minutes for critical checks
- [ ] Full test suite completes in under 15 minutes
- [ ] Cross-platform compatibility (Ubuntu, macOS, Windows)
- [ ] Node version matrix (18, 20, 22)
- [ ] Zero flaky tests in required checks
- [ ] Clear failure logs with artifact uploads
- [ ] Security audit integrated
- [ ] Coverage reporting operational
- [ ] Release workflow functional

---

## Test Categorization

| Category | Files | Tests | Purpose |
|----------|-------|-------|---------|
| Unit | 33 | ~550 | Isolated component testing |
| Integration | 8 | ~207 | Multi-component testing |
| E2E | 5 | ~47 | Full system flows |
| Contract | 1 | 15 | API contract validation |
| **Total** | **47** | **~819** | |

---

## Thrust Overview

| # | Name | Description | Files |
|---|------|-------------|-------|
| 1 | Fix Contract Tests | Resolve @agentgate/shared resolution | 3 |
| 2 | Fix Platform Tests | Handle path differences across OS | 4 |
| 3 | CI Workflow Optimization | Restructure workflows for speed | 2 |
| 4 | Test Reliability | Fix timing/flaky tests | 6 |
| 5 | Artifact Management | Logs, coverage, test reports | 2 |
| 6 | Security Integration | Audit, CodeQL, SBOM | 2 |
| 7 | Release Automation | Tag-based releases | 2 |

---

## File Map

### Modified Files (CI Workflows)

| File | Thrust | Changes |
|------|--------|---------|
| `.github/workflows/ci.yml` | 3, 5, 6 | Restructure for tiered testing |
| `.github/workflows/release.yml` | 7 | Improve release automation |

### Modified Files (Test Fixes)

| File | Thrust | Changes |
|------|--------|---------|
| `packages/server/test/contract/work-orders.contract.test.ts` | 1 | Fix import resolution |
| `packages/server/test/streaming-executor.test.ts` | 2 | Platform-agnostic paths |
| `packages/server/test/sandbox/subprocess-provider.test.ts` | 2 | Platform-agnostic paths |
| `packages/server/vitest.config.ts` | 4 | Test configuration |

### New Files

| File | Thrust | Purpose |
|------|--------|---------|
| `.github/workflows/nightly.yml` | 3 | Nightly full test suite |
| `scripts/ci-summary.sh` | 5 | CI summary generation |

---

## Quick Reference

### CI Job Dependencies

```
lint ──┬──> test (Node 18/20/22) ──┬──> build ──> cli-test
       │                           │
typecheck ──────────────────────────┴──> platform-test (ubuntu/macos/windows)
       │
       └──> security ──> deps ──> docs

All ──> ci-status (final gate)
```

### Required Checks (Merge Gates)

1. `lint` - ESLint passes
2. `typecheck` - TypeScript passes
3. `test (Node 20)` - Primary test run
4. `build` - Build succeeds
5. `ci-status` - Aggregate status

### Platform Path Normalization

```typescript
// Use fs.realpath() to resolve symlinks
const normalizedPath = await fs.realpath(tempDir);
expect(result.stdout.trim()).toBe(normalizedPath);
```

---

## Navigation

| Document | Contents |
|----------|----------|
| [01-overview.md](./01-overview.md) | Current state analysis, design decisions |
| [02-test-fixes.md](./02-test-fixes.md) | Thrusts 1-2: Contract and platform fixes |
| [03-workflow-design.md](./03-workflow-design.md) | Thrusts 3-4: CI workflow optimization |
| [04-artifacts-security.md](./04-artifacts-security.md) | Thrusts 5-6: Artifacts and security |
| [05-release-automation.md](./05-release-automation.md) | Thrust 7: Release workflow |
| [06-appendices.md](./06-appendices.md) | Checklists, troubleshooting, commands |

---

## Key Constraints

### Non-Negotiables

1. **Green by Truth** - Never skip/weaken tests to pass CI
2. **Determinism** - Same code = same result every time
3. **Security** - Least privilege, pinned action versions
4. **Usability** - Fast feedback for developers

### Platform Support Matrix

| OS | Required | Notes |
|----|----------|-------|
| Ubuntu | Yes | Primary development |
| macOS | Yes | Developer machines |
| Windows | Yes | Cross-platform support |

### Node Version Matrix

| Version | Status | Support Until |
|---------|--------|---------------|
| 18 | LTS | April 2025 |
| 20 | Active LTS | October 2026 |
| 22 | Current | October 2027 |

---

## Dependencies

- GitHub Actions (built-in)
- pnpm 9+ (package manager)
- Node.js 18+ (runtime)
- Docker (optional, for container tests)
- Codecov (optional, for coverage)

---

## Self-Implementation via AgentGate

This DevGuide is designed to be implemented by AgentGate itself, demonstrating dogfooding of the CI system.

### Prerequisite: Add skipVerification to Schema

Before running work orders, expose the verifier's `skip` parameter in the work order schema:

| File | Changes |
|------|---------|
| `packages/server/src/types/work-order.ts` | Add `skipVerification?: VerificationLevel[]` |
| `packages/server/src/control-plane/validators.ts` | Add CLI option schema |
| `packages/server/src/control-plane/commands/submit.ts` | Add `--skip-verification` option |
| `packages/server/src/orchestrator/orchestrator.ts` | Pass skip to verify() |

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXECUTION FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STEP 0: Add skipVerification to schema (manual or via Claude)  │
│     ↓                                                            │
│  STEP 1: Phase 1 Work Order (Thrusts 1-2)                       │
│     • --skip-verification L0,L1,L2,L3                           │
│     • No --wait-for-ci (CI is broken)                           │
│     ↓                                                            │
│  MERGE PR #1                                                     │
│     ↓                                                            │
│  STEP 2: Phase 2 Work Order (Thrusts 3-7)                       │
│     • --gate-plan ci-workflow                                    │
│     • --wait-for-ci (CI now works)                               │
│     ↓                                                            │
│  CI VALIDATES ITSELF                                             │
│     ↓                                                            │
│  MERGE PR #2                                                     │
│     ↓                                                            │
│  DONE: Production-grade CI operational                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 1: Bootstrap (Thrusts 1-2)

Fix failing tests so CI can run. No waitForCI since CI is broken.

```bash
agentgate exec \
  --prompt "Implement Thrusts 1-2 from DevGuide v0.2.15. Read docs/DevGuides/DevGuide_v0.2.15/02-test-fixes.md for specs." \
  --path . \
  --agent claude-code-subscription \
  --max-iterations 3 \
  --gate-plan default \
  --skip-verification L0,L1,L2,L3
```

### Phase 2: Main Implementation (Thrusts 3-7)

After CI works, implement remaining thrusts with CI validation.

```bash
agentgate exec \
  --prompt "Implement Thrusts 3-7 from DevGuide v0.2.15. Read 03-workflow-design.md, 04-artifacts-security.md, 05-release-automation.md." \
  --path . \
  --agent claude-code-subscription \
  --max-iterations 5 \
  --gate-plan ci-workflow \
  --wait-for-ci
```

### Risk Mitigation

1. **If Phase 1 fails**: Manual fix - changes are small and well-documented
2. **If Phase 2 CI loops forever**: Max CI iterations configured, manual intervention
3. **Merge conflicts**: Each phase is a single PR, no internal conflicts
