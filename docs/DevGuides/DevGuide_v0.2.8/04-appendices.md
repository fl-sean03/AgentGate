# DevGuide v0.2.8: Appendices

This document contains checklists, file references, and additional resources.

---

## A. Master Checklist

### Prerequisites

- [ ] pnpm version 9+ installed
- [ ] Node.js 20+ installed
- [ ] AgentGate repository cloned
- [ ] agentgate-dashboard repository accessible
- [ ] Git configured for commits

### Phase 1: Foundation (Thrusts 1-3)

| Work Order | Status | PR | Merged | Validated |
|------------|--------|-----|--------|-----------|
| WO-M-001: Workspace Init | ⬜ | - | ⬜ | ⬜ |
| WO-M-002: Shared Types | ⬜ | - | ⬜ | ⬜ |
| WO-M-003: Server Migration | ⬜ | - | ⬜ | ⬜ |

### Phase 2: Dashboard Integration (Thrusts 4-5)

| Work Order | Status | PR | Merged | Validated |
|------------|--------|-----|--------|-----------|
| WO-M-004: Dashboard Integration | ⬜ | - | ⬜ | ⬜ |
| WO-M-005: Type Adoption | ⬜ | - | ⬜ | ⬜ |

### Phase 3: Testing & CI (Thrusts 6-7)

| Work Order | Status | PR | Merged | Validated |
|------------|--------|-----|--------|-----------|
| WO-M-006: Integration Tests | ⬜ | - | ⬜ | ⬜ |
| WO-M-007: CI Updates | ⬜ | - | ⬜ | ⬜ |

### Phase 4: Validation (Thrust 8)

| Work Order | Status | PR | Merged | Validated |
|------------|--------|-----|--------|-----------|
| WO-M-008: Final Validation | ⬜ | - | ⬜ | ⬜ |

### Post-Migration Validation

- [ ] `pnpm install` completes successfully
- [ ] `pnpm build` builds all packages
- [ ] `pnpm test` all tests pass
- [ ] `pnpm test:integration` integration tests pass
- [ ] Server CLI works: `node packages/server/dist/index.js --help`
- [ ] Server starts: `node packages/server/dist/index.js serve`
- [ ] Dashboard builds: `pnpm --filter @agentgate/dashboard build`
- [ ] Dashboard dev server starts
- [ ] API connection works
- [ ] WebSocket updates work
- [ ] GitHub CI passes all checks

---

## B. File Reference - Root Level

### New Root Files

| File | Purpose |
|------|---------|
| `pnpm-workspace.yaml` | Workspace package definition |
| `vitest.integration.config.ts` | Integration test configuration |
| `turbo.json` | Build orchestration (optional) |

### Modified Root Files

| File | Changes |
|------|---------|
| `package.json` | Add workspace scripts, mark private |
| `tsconfig.json` | Add project references |
| `.gitignore` | Add packages/*/dist |
| `verify.yaml` | Workspace-aware tests |
| `.github/workflows/ci.yml` | Monorepo CI jobs |

---

## C. File Reference - packages/shared/

### Package Structure

| File | Purpose |
|------|---------|
| `package.json` | Package configuration |
| `tsconfig.json` | TypeScript config |
| `src/index.ts` | Package exports |
| `src/types/work-order.ts` | WorkOrder types |
| `src/types/run.ts` | Run types |
| `src/types/api.ts` | API response types |
| `src/types/websocket.ts` | WebSocket message types |

### Exported Types

| Type | Description |
|------|-------------|
| `WorkOrder` | Core work order interface |
| `WorkOrderStatus` | Status enum type |
| `CreateWorkOrderInput` | Work order creation input |
| `WorkspaceSource` | Workspace source configuration |
| `AgentType` | Agent type enum |
| `Run` | Run interface |
| `RunStatus` | Run status enum |
| `Iteration` | Iteration interface |
| `VerificationResult` | Verification result interface |
| `ApiResponse<T>` | Generic API response wrapper |
| `ApiError` | Error response interface |
| `WebSocketMessage` | WebSocket message union |

---

## D. File Reference - packages/server/

### Moved From Root

| Original Path | New Path |
|---------------|----------|
| `src/` | `packages/server/src/` |
| `test/` | `packages/server/test/` |
| `tsconfig.json` | `packages/server/tsconfig.json` |
| `vitest.config.ts` | `packages/server/vitest.config.ts` |
| `eslint.config.js` | `packages/server/eslint.config.js` |

### New Files

| File | Purpose |
|------|---------|
| `packages/server/package.json` | Package configuration |

### Source Structure (Unchanged)

```
packages/server/src/
├── control-plane/
│   ├── cli.ts
│   └── commands/
├── orchestrator/
│   ├── orchestrator.ts
│   └── ...
├── server/
│   ├── app.ts
│   ├── routes/
│   └── websocket/
├── workspaces/
├── agents/
└── index.ts
```

---

## E. File Reference - packages/dashboard/

### Source Structure

```
packages/dashboard/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   ├── work-orders/
│   │   ├── runs/
│   │   └── common/
│   ├── hooks/
│   ├── api/
│   ├── pages/
│   └── App.tsx
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── postcss.config.js
```

### Modified Files

| File | Changes |
|------|---------|
| `package.json` | Add @agentgate/shared dependency |
| `tsconfig.json` | Add path alias for shared |
| `vite.config.ts` | Configure resolve paths |

---

## F. File Reference - test/integration/

### Test Files

| File | Purpose |
|------|---------|
| `setup.ts` | Test utilities, server helpers |
| `api-contracts.test.ts` | API response validation |
| `dashboard-api.test.ts` | Dashboard client tests |
| `websocket.test.ts` | WebSocket integration |
| `e2e-workflow.test.ts` | End-to-end workflows |

---

## G. Work Order Prompts

### WO-M-001: Workspace Initialization

```
Initialize pnpm workspace for AgentGate monorepo.

Tasks:
1. Create pnpm-workspace.yaml with packages/* glob
2. Create packages/server/, packages/dashboard/, packages/shared/ directories with .gitkeep
3. Update root package.json:
   - Add "private": true
   - Add workspace scripts: build, test, typecheck, lint (using pnpm -r)
   - Add filter scripts: dev:server, dev:dashboard
4. Update root tsconfig.json to add project references for packages

Verification:
- pnpm install completes
- pnpm -r list shows empty (no packages yet)
- Directory structure exists
```

### WO-M-002: Shared Types Package

```
Create @agentgate/shared package with TypeScript types and Zod schemas.

Tasks:
1. Create packages/shared/package.json with:
   - name: @agentgate/shared
   - version: 0.2.8
   - main: ./dist/index.js
   - types: ./dist/index.d.ts
   - dependencies: zod
   - scripts: build, typecheck

2. Create packages/shared/tsconfig.json extending root

3. Create type files:
   - src/types/work-order.ts: WorkOrder, WorkOrderStatus, WorkspaceSource, AgentType, CreateWorkOrderInput
   - src/types/run.ts: Run, RunStatus, Iteration, VerificationResult
   - src/types/api.ts: ApiResponse<T>, ApiError, PaginatedResponse<T>
   - src/types/websocket.ts: WebSocketMessage, SubscribeMessage, events

4. Create src/index.ts exporting all types

5. Include Zod schemas for runtime validation

Verification:
- pnpm --filter @agentgate/shared build succeeds
- dist/ contains .js and .d.ts files
- Types can be imported
```

### WO-M-003: Server Migration

```
Move existing AgentGate code to packages/server/.

Tasks:
1. Move src/ to packages/server/src/
2. Move test/ to packages/server/test/
3. Move tsconfig.json, vitest.config.ts, eslint.config.js to packages/server/
4. Create packages/server/package.json:
   - name: @agentgate/server (or agentgate)
   - version: 0.2.8
   - Move all dependencies from root package.json
   - Add dependency: @agentgate/shared: "workspace:*"
   - Keep bin entry for CLI
5. Update packages/server/tsconfig.json for new location
6. Update any absolute import paths to relative
7. Update .gitignore for packages/*/dist

IMPORTANT:
- Keep docs/, .github/, verify.yaml at root
- Preserve all existing functionality
- All 250+ tests must pass

Verification:
- pnpm install succeeds
- pnpm --filter @agentgate/server build succeeds
- pnpm --filter @agentgate/server test passes (all 250+ tests)
- node packages/server/dist/index.js --help works
```

### WO-M-004: Dashboard Integration

```
Integrate agentgate-dashboard into packages/dashboard/.

Tasks:
1. Copy all files from agentgate-dashboard repo to packages/dashboard/
   - Exclude .git/ and node_modules/
2. Update packages/dashboard/package.json:
   - name: @agentgate/dashboard
   - version: 0.2.8
   - Add dependency: @agentgate/shared: "workspace:*"
3. Update vite.config.ts for monorepo paths
4. Update tsconfig.json with path alias for @agentgate/shared
5. Configure API proxy for development

Verification:
- pnpm --filter @agentgate/dashboard install succeeds
- pnpm --filter @agentgate/dashboard build succeeds
- pnpm --filter @agentgate/dashboard dev starts dev server
- Dashboard loads at localhost:5173
```

### WO-M-005: Shared Type Adoption

```
Update server and dashboard to use @agentgate/shared types.

Tasks:
1. In packages/server/:
   - Find all local WorkOrder, Run, API type definitions
   - Replace with imports from @agentgate/shared
   - Delete duplicate type files

2. In packages/dashboard/:
   - Find all local type definitions
   - Replace with imports from @agentgate/shared
   - Delete duplicate type files

3. Ensure Zod schemas from shared package are used for validation

4. Run typecheck on all packages to catch errors

Verification:
- pnpm typecheck passes for all packages
- No duplicate type definitions remain
- All tests pass
```

### WO-M-006: Integration Tests

```
Create cross-cutting integration tests.

Tasks:
1. Create test/integration/ directory at root
2. Create setup.ts with:
   - startTestServer(port) helper
   - stopTestServer() cleanup
   - API client utilities

3. Create test files:
   - api-contracts.test.ts: Verify API responses match shared types
   - dashboard-api.test.ts: Test dashboard client against real server
   - websocket.test.ts: Test WebSocket connection and events
   - e2e-workflow.test.ts: Full workflow simulation

4. Create vitest.integration.config.ts at root
5. Add test:integration script to root package.json

Verification:
- pnpm test:integration runs all tests
- All integration tests pass
- Tests complete in < 60 seconds
```

### WO-M-007: CI Updates

```
Update verify.yaml and GitHub Actions for monorepo.

Tasks:
1. Update verify.yaml:
   - Add workspace-aware test commands (--filter)
   - Add shared, server, dashboard typecheck
   - Add integration tests
   - Update blackbox tests for new paths
   - Update sanity checks for packages/

2. Update .github/workflows/ci.yml:
   - Use pnpm workspaces for install
   - Add jobs for each package
   - Add integration test job
   - Update artifact paths

Verification:
- Push to branch triggers CI
- All CI jobs pass
- Integration tests run in CI
```

### WO-M-008: Final Validation

```
Perform final validation and cleanup.

Tasks:
1. Run complete build from clean state
2. Run all tests
3. Verify CLI backwards compatibility
4. Verify dashboard functionality
5. Delete .gitkeep placeholders
6. Update README.md with monorepo structure
7. Update docs/DevGuides/README.md with v0.2.8 entry
8. Create completion report

Verification:
- Fresh clone, install, build, test all pass
- Server CLI works
- Dashboard connects to server
- Real-time updates work
- Documentation is accurate
```

---

## H. Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `workspace:*` not resolving | Run `pnpm install` from root |
| TypeScript path errors | Check tsconfig.json references |
| Module not found | Verify package.json exports |
| Tests fail to find server | Check port not in use |
| Dashboard build fails | Verify vite.config.ts paths |
| CI fails on install | Check pnpm-lock.yaml committed |

### Rollback Procedure

If migration fails:

1. Keep a backup branch before starting
2. Revert to backup: `git checkout backup-branch`
3. Delete packages directory
4. Restore original structure

### Debugging Tips

- Use `pnpm why <package>` to debug dependencies
- Use `pnpm --filter <pkg> exec -- node -e "console.log(require.resolve('@agentgate/shared'))"` to check resolution
- Check `dist/` directories exist after build

---

## I. Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.2.8 | 2025-12-31 | Monorepo restructuring |
| 0.2.7 | 2025-12-31 | HTTP server + Dashboard |
| 0.2.6 | 2025-12-31 | Subscription-based billing |

---

## J. Resources

### Documentation

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Turborepo](https://turbo.build/repo/docs)
- [Vitest Workspaces](https://vitest.dev/guide/workspace.html)

### Related DevGuides

- [v0.2.7 - HTTP Server + Dashboard](../DevGuide_v0.2.7/00-index.md)
- [v0.2.6 - Subscription Driver](../DevGuide_v0.2.6/00-index.md)

---

## K. Glossary

| Term | Definition |
|------|------------|
| Workspace | A pnpm concept for managing multiple packages in one repo |
| Package | An individual npm package within the monorepo |
| Filter | pnpm command option to target specific packages |
| Project Reference | TypeScript feature for incremental builds |
| Integration Test | Test spanning multiple packages |
| Shared Types | Types defined once and used by multiple packages |
