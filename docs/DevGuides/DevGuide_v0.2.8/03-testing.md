# DevGuide v0.2.8: Testing & CI

This document contains Thrusts 6-8 covering integration tests, CI updates, and final validation.

---

## Thrust 6: Integration Tests

### 6.1 Objective

Create cross-cutting integration tests that verify frontend-backend interaction and API contract compliance.

### 6.2 Background

Integration tests run against both packages simultaneously, verifying that the dashboard correctly communicates with the server and that shared types ensure contract compliance.

### 6.3 Subtasks

#### 6.3.1 Create integration test infrastructure

Create test directory structure:

- `test/integration/` at repository root
- `test/integration/setup.ts` for test utilities
- `test/integration/vitest.config.ts` for integration-specific config

Install test dependencies at root level:

- `vitest` for test runner
- `supertest` for HTTP testing
- `ws` for WebSocket testing

#### 6.3.2 Create server startup utilities

Create utilities for spinning up the server in tests:

- `startTestServer(port: number)` function
- `stopTestServer()` cleanup function
- Port management to avoid conflicts
- Environment configuration

#### 6.3.3 Create API contract tests

Create `test/integration/api-contracts.test.ts`:

- Test that server responses match shared types
- Test all REST endpoints return correct shapes
- Use Zod schemas from shared package for validation
- Verify error responses match expected format

#### 6.3.4 Create dashboard API client tests

Create `test/integration/dashboard-api.test.ts`:

- Test dashboard API client against real server
- Verify request formatting matches server expectations
- Test error handling on API failures
- Mock scenarios: server down, slow responses

#### 6.3.5 Create WebSocket integration tests

Create `test/integration/websocket.test.ts`:

- Test WebSocket connection establishment
- Test subscription messages
- Test event broadcasting
- Verify message formats match shared types

#### 6.3.6 Create end-to-end workflow tests

Create `test/integration/e2e-workflow.test.ts`:

- Simulate full workflow: create work order → monitor → complete
- Test real-time updates reach dashboard
- Verify state consistency across frontend/backend

#### 6.3.7 Configure test timeouts and cleanup

Ensure tests are robust:

- Set appropriate timeouts for server startup
- Implement proper cleanup in afterEach/afterAll
- Handle port conflicts gracefully
- Add retry logic for flaky scenarios

### 6.4 Verification Steps

1. Run `pnpm test:integration` from root
2. All integration tests pass
3. Tests complete in reasonable time (< 60 seconds)
4. No orphaned processes after tests complete
5. Tests work in CI environment

### 6.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `test/integration/setup.ts` | Created | Test utilities |
| `test/integration/api-contracts.test.ts` | Created | API validation |
| `test/integration/dashboard-api.test.ts` | Created | Client testing |
| `test/integration/websocket.test.ts` | Created | WebSocket tests |
| `test/integration/e2e-workflow.test.ts` | Created | End-to-end tests |
| `vitest.integration.config.ts` | Created | Integration test config |
| `package.json` (root) | Modified | Add test:integration script |

---

## Thrust 7: CI/CD Updates

### 7.1 Objective

Update GitHub Actions workflow and verify.yaml to support monorepo structure with workspace-aware commands.

### 7.2 Background

The CI pipeline must be updated to:
- Install all workspace packages
- Run checks for each package
- Run integration tests
- Build all packages
- Verify the complete system works

### 7.3 Subtasks

#### 7.3.1 Update verify.yaml for monorepo

Update `verify.yaml` with workspace-aware tests:

```yaml
version: "1"

environment:
  runtime: node
  runtimeVersion: "20"
  setupCommands:
    - name: install
      command: pnpm install

tests:
  - name: shared-typecheck
    command: pnpm --filter @agentgate/shared typecheck
    description: Shared types compilation

  - name: server-typecheck
    command: pnpm --filter @agentgate/server typecheck
    description: Server TypeScript compilation

  - name: dashboard-typecheck
    command: pnpm --filter @agentgate/dashboard typecheck
    description: Dashboard TypeScript compilation

  - name: server-lint
    command: pnpm --filter @agentgate/server lint
    description: Server code quality

  - name: dashboard-lint
    command: pnpm --filter @agentgate/dashboard lint
    description: Dashboard code quality

  - name: server-tests
    command: pnpm --filter @agentgate/server test
    description: Server unit and integration tests
    timeout: 300

  - name: dashboard-tests
    command: pnpm --filter @agentgate/dashboard test
    description: Dashboard component tests
    timeout: 120

  - name: integration-tests
    command: pnpm test:integration
    description: Cross-cutting integration tests
    timeout: 180

  - name: build-all
    command: pnpm build
    description: Build all packages

blackbox:
  - name: cli-help
    command: node packages/server/dist/index.js --help
    expectExitCode: 0
    description: CLI starts and shows help

  - name: health-endpoint
    setup: |
      node packages/server/dist/index.js serve --port 13001 &
      sleep 2
    command: curl -s http://localhost:13001/health
    expectContains: '"status":"ok"'
    teardown: pkill -f "serve --port 13001" || true
    description: HTTP server health check works

  - name: dashboard-build
    command: test -d packages/dashboard/dist
    expectExitCode: 0
    description: Dashboard build output exists

sanity:
  requiredFiles:
    - path: "packages/server/src/**/*.ts"
      description: Server source files
    - path: "packages/dashboard/src/**/*.ts"
      description: Dashboard source files
    - path: "packages/shared/src/**/*.ts"
      description: Shared types
    - path: "test/integration/**/*.test.ts"
      description: Integration tests

  testCoverage:
    enabled: true
    rules:
      - pattern: "packages/server/src/server/**/*.ts"
        requiresTest: "packages/server/test/**/*.test.ts"
      - pattern: "packages/shared/src/**/*.ts"
        requiresTest: "packages/shared/test/**/*.test.ts OR test/integration/**/*.test.ts"
```

#### 7.3.2 Update GitHub Actions workflow

Update `.github/workflows/ci.yml`:

- Update install step to use pnpm workspaces
- Add parallel jobs for each package
- Add integration test job
- Update build step for monorepo
- Update artifact paths

#### 7.3.3 Add package-specific CI jobs

Create separate CI jobs:

- `lint-shared` - Lint shared package
- `lint-server` - Lint server package
- `lint-dashboard` - Lint dashboard package
- `test-server` - Run server tests
- `test-dashboard` - Run dashboard tests
- `test-integration` - Run integration tests (depends on builds)

#### 7.3.4 Update build artifacts

Update artifact handling:

- Upload `packages/server/dist/` as server artifact
- Upload `packages/dashboard/dist/` as dashboard artifact
- Update deployment workflows if any

#### 7.3.5 Add cross-platform test matrix

Ensure tests run on multiple platforms:

- Ubuntu (primary)
- macOS (secondary)
- Windows (secondary)

Configure appropriate package-specific tests per platform.

#### 7.3.6 Update PR checks

Configure required checks:

- All package typechecks must pass
- All package tests must pass
- Integration tests must pass
- Build must succeed

### 7.4 Verification Steps

1. Push changes to a branch
2. Verify all CI jobs run correctly
3. Each package job completes independently
4. Integration test job runs after builds
5. Full CI completes in reasonable time (< 10 minutes)
6. PR checks show all required status checks

### 7.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `verify.yaml` | Modified | Workspace-aware tests |
| `.github/workflows/ci.yml` | Modified | Monorepo CI jobs |
| `.github/workflows/integration.yml` | Created | Integration test workflow |

---

## Thrust 8: Final Validation

### 8.1 Objective

Perform end-to-end validation of the monorepo, clean up, and document the new structure.

### 8.2 Background

Before completing the migration, we need to verify everything works correctly, clean up any migration artifacts, and ensure documentation is accurate.

### 8.3 Subtasks

#### 8.3.1 Full build verification

Run complete build and verify:

- `pnpm install` from clean state
- `pnpm build` succeeds
- All `dist/` directories populated
- No build warnings

#### 8.3.2 Full test verification

Run all tests:

- `pnpm test` runs all package tests
- `pnpm test:integration` runs integration tests
- No flaky tests
- Coverage is maintained

#### 8.3.3 CLI backwards compatibility

Verify CLI still works:

- `node packages/server/dist/index.js --help`
- `node packages/server/dist/index.js submit --help`
- `node packages/server/dist/index.js serve --port 3001`
- All commands function correctly

#### 8.3.4 Dashboard functionality

Verify dashboard works:

- `pnpm --filter @agentgate/dashboard dev` starts
- Navigate to localhost:5173
- Work order list loads (with server running)
- Real-time updates work

#### 8.3.5 Clean up migration artifacts

Remove temporary files:

- Delete `.gitkeep` placeholders
- Remove any duplicate configuration files
- Clean up unused type definitions
- Remove old CI configuration if deprecated

#### 8.3.6 Update README

Update root README.md:

- Document new monorepo structure
- Update installation instructions
- Update development workflow
- Add package-specific documentation links

#### 8.3.7 Update DevGuide README

Add v0.2.8 to the DevGuide list:

- Version: v0.2.8
- Title: Monorepo Restructuring
- Status: Complete
- Description: pnpm workspaces, shared types, integration tests

#### 8.3.8 Create completion report

Document what was accomplished:

- Summary of changes
- Files created/modified/deleted
- Test results
- Known issues (if any)

### 8.4 Verification Steps

1. Clone fresh copy of repository
2. Run `pnpm install` - succeeds
3. Run `pnpm build` - all packages build
4. Run `pnpm test` - all tests pass
5. Run `pnpm test:integration` - all pass
6. Start server: `pnpm dev:server`
7. Start dashboard: `pnpm dev:dashboard`
8. Verify dashboard connects to server
9. Create a work order via dashboard
10. Verify real-time updates work

### 8.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `README.md` | Modified | Update for monorepo |
| `docs/DevGuides/README.md` | Modified | Add v0.2.8 entry |
| `docs/DevGuides/DevGuide_v0.2.8/reports/completion.md` | Created | Completion report |
| Various `.gitkeep` files | Deleted | Remove placeholders |

---

## Post-Migration Checklist

After completing all thrusts:

- [ ] All packages install correctly
- [ ] All packages build successfully
- [ ] All package tests pass
- [ ] Integration tests pass
- [ ] CI pipeline is green
- [ ] CLI works from server package
- [ ] Dashboard starts and connects to API
- [ ] WebSocket real-time updates work
- [ ] Documentation is updated
- [ ] No duplicate type definitions remain
- [ ] agentgate-dashboard repo can be archived/deleted

---

## Navigation

- Previous: [02-implementation.md](./02-implementation.md)
- Next: [04-appendices.md](./04-appendices.md)
