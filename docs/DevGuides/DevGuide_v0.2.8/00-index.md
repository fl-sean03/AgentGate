# DevGuide v0.2.8: Monorepo Restructuring

**Version**: 0.2.8
**Status**: Planning
**Created**: 2025-12-31
**Target**: Unified monorepo with pnpm workspaces

---

## Executive Summary

This DevGuide restructures AgentGate from a single-package repository into a **pnpm workspaces monorepo** containing:

- `packages/server/` - The AgentGate backend (CLI, HTTP server, orchestrator)
- `packages/dashboard/` - The React frontend (from agentgate-dashboard repo)
- `packages/shared/` - Shared TypeScript types and API contracts

This restructuring enables:
- **Atomic commits** across frontend and backend
- **Shared type definitions** eliminating drift between API contracts
- **Cross-cutting integration tests** that verify frontend-backend interaction
- **Unified CI/CD pipeline** with workspace-aware verification
- **Single version control** simplifying release management

---

## Success Criteria

| Criterion | Verification |
|-----------|--------------|
| Monorepo structure created | `packages/server/`, `packages/dashboard/`, `packages/shared/` exist |
| pnpm workspaces configured | `pnpm install` installs all packages |
| Shared types work | Dashboard imports types from `@agentgate/shared` |
| Server still works | `pnpm --filter @agentgate/server test` passes |
| Dashboard still works | `pnpm --filter @agentgate/dashboard build` succeeds |
| Integration tests pass | Cross-cutting tests verify API contracts |
| CI pipeline updated | GitHub Actions runs all workspace checks |
| verify.yaml updated | L1-L3 tests work with monorepo structure |

---

## Design Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| DD-1 | pnpm workspaces over npm/yarn | Native workspace support, faster installs, strict dependency isolation |
| DD-2 | Flat packages/ directory | Simple structure, no nested workspaces, easy navigation |
| DD-3 | Shared types package | Single source of truth for API contracts, eliminates type drift |
| DD-4 | Keep server as main entry | Preserve `node dist/index.js` behavior, dashboard is auxiliary |
| DD-5 | Integration tests at root | Cross-cutting tests live outside individual packages |
| DD-6 | Turborepo optional | Start simple, add build orchestration if needed later |

---

## Thrust Summary

### Phase 1: Foundation (Thrusts 1-3)

| Thrust | Title | Objective |
|--------|-------|-----------|
| 1 | Workspace Initialization | Create pnpm workspace config, root package.json |
| 2 | Shared Types Package | Create `@agentgate/shared` with API types |
| 3 | Server Package Migration | Move existing code to `packages/server/` |

### Phase 2: Dashboard Integration (Thrusts 4-5)

| Thrust | Title | Objective |
|--------|-------|-----------|
| 4 | Dashboard Integration | Clone and integrate dashboard into `packages/dashboard/` |
| 5 | Shared Type Adoption | Update dashboard to use `@agentgate/shared` types |

### Phase 3: Testing & CI (Thrusts 6-7)

| Thrust | Title | Objective |
|--------|-------|-----------|
| 6 | Integration Tests | Create cross-cutting E2E tests |
| 7 | CI/CD Updates | Update GitHub Actions and verify.yaml |

### Phase 4: Validation (Thrust 8)

| Thrust | Title | Objective |
|--------|-------|-----------|
| 8 | Final Validation | End-to-end verification, cleanup, documentation |

---

## Architecture Overview

```
AgentGate/
├── packages/
│   ├── server/                    # @agentgate/server
│   │   ├── src/
│   │   │   ├── control-plane/     # CLI commands
│   │   │   ├── orchestrator/      # Work order execution
│   │   │   ├── server/            # HTTP/WebSocket server
│   │   │   └── ...
│   │   ├── test/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── dashboard/                 # @agentgate/dashboard
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── api/
│   │   │   └── ...
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   │
│   └── shared/                    # @agentgate/shared
│       ├── src/
│       │   ├── types/
│       │   │   ├── work-order.ts
│       │   │   ├── run.ts
│       │   │   ├── api.ts
│       │   │   └── index.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── test/
│   └── integration/               # Cross-cutting tests
│       ├── api-dashboard.test.ts
│       └── setup.ts
│
├── docs/                          # Documentation (unchanged)
├── .github/workflows/             # Updated CI
├── pnpm-workspace.yaml            # Workspace definition
├── package.json                   # Root scripts
├── verify.yaml                    # Updated verification
├── turbo.json                     # Build orchestration (optional)
└── tsconfig.json                  # Root TypeScript config
```

---

## Dependencies

### New Root Dependencies

```json
{
  "devDependencies": {
    "turbo": "^2.0.0"
  }
}
```

### Shared Package Dependencies

```json
{
  "dependencies": {
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

---

## Navigation

| Document | Contents |
|----------|----------|
| [01-overview.md](./01-overview.md) | Architecture decisions, rationale, trade-offs |
| [02-implementation.md](./02-implementation.md) | Thrusts 1-4: Foundation and Integration |
| [03-testing.md](./03-testing.md) | Thrusts 5-7: Testing and CI |
| [04-appendices.md](./04-appendices.md) | Checklists, file references, troubleshooting |

---

## Quick Start

After completing this DevGuide:

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Start server
pnpm --filter @agentgate/server start

# Start dashboard dev server
pnpm --filter @agentgate/dashboard dev

# Run integration tests
pnpm test:integration
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Import path breakage | Medium | High | Careful path updates, TypeScript catches issues |
| CI pipeline failure | Medium | Medium | Test locally before pushing |
| Dashboard build issues | Low | Medium | Vite config adjustments |
| Type mismatch during migration | Low | High | Incremental adoption, compile checks |
