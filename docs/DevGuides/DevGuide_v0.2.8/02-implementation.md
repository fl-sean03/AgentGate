# DevGuide v0.2.8: Implementation

This document contains Thrusts 1-5 covering workspace initialization, shared types, and package migration.

---

## Thrust 1: Workspace Initialization

### 1.1 Objective

Create the pnpm workspace configuration and root package.json with monorepo scripts.

### 1.2 Background

pnpm workspaces require a `pnpm-workspace.yaml` file defining which directories contain packages. The root `package.json` provides shared scripts and devDependencies.

### 1.3 Subtasks

#### 1.3.1 Create pnpm-workspace.yaml

Create the workspace definition file at the repository root:

- Define `packages/` glob pattern
- Exclude node_modules and other non-package directories

#### 1.3.2 Create packages directory structure

Create the empty package directories:

- `packages/server/` - Will contain existing code
- `packages/dashboard/` - Will contain frontend
- `packages/shared/` - Will contain shared types

#### 1.3.3 Update root package.json

Modify the existing root package.json:

- Add workspace-aware scripts
- Add `"private": true` (required for workspaces)
- Keep existing metadata (name, version, description)
- Add pnpm filter scripts for each package

#### 1.3.4 Create root tsconfig.json

Create a base TypeScript configuration:

- Define common compiler options
- Set up project references for packages
- Enable composite builds for incremental compilation

### 1.4 Verification Steps

1. Run `pnpm install` - should complete without errors
2. Run `pnpm -r list` - should show empty package list (no packages yet)
3. Verify directory structure exists with `ls packages/`

### 1.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `pnpm-workspace.yaml` | Created | Workspace definition |
| `packages/server/.gitkeep` | Created | Placeholder |
| `packages/dashboard/.gitkeep` | Created | Placeholder |
| `packages/shared/.gitkeep` | Created | Placeholder |
| `package.json` | Modified | Add workspace scripts |
| `tsconfig.json` | Modified | Add project references |

---

## Thrust 2: Shared Types Package

### 2.1 Objective

Create the `@agentgate/shared` package containing TypeScript types and Zod schemas for API contracts.

### 2.2 Background

The shared package provides a single source of truth for types used by both server and dashboard. Using Zod enables runtime validation alongside static types.

### 2.3 Subtasks

#### 2.3.1 Create package.json for shared

Create `packages/shared/package.json`:

- Package name: `@agentgate/shared`
- Version: `0.2.8`
- Main entry point: `./dist/index.js`
- Types entry point: `./dist/index.d.ts`
- Dependencies: `zod`
- DevDependencies: `typescript`
- Build script using `tsc`

#### 2.3.2 Create tsconfig.json for shared

Create `packages/shared/tsconfig.json`:

- Extend from root tsconfig
- Enable declaration generation
- Set outDir to `./dist`
- Enable strict mode

#### 2.3.3 Create WorkOrder types

Create `packages/shared/src/types/work-order.ts`:

- `WorkOrderStatus` type (queued, running, completed, failed, cancelled)
- `WorkspaceSource` interface (github-new, github-existing, local)
- `AgentType` type (claude-code-subscription, openai-codex, etc.)
- `WorkOrder` interface with all fields
- `CreateWorkOrderInput` for API requests
- Zod schemas for validation

#### 2.3.4 Create Run types

Create `packages/shared/src/types/run.ts`:

- `RunStatus` type
- `Run` interface
- `Iteration` interface
- `VerificationResult` interface
- Zod schemas for validation

#### 2.3.5 Create API response types

Create `packages/shared/src/types/api.ts`:

- `ApiResponse<T>` generic wrapper
- `ApiError` interface
- `PaginatedResponse<T>` for lists
- Success/error response factories

#### 2.3.6 Create WebSocket message types

Create `packages/shared/src/types/websocket.ts`:

- `WebSocketMessage` discriminated union
- `SubscribeMessage` type
- `WorkOrderUpdatedMessage` type
- `RunStartedMessage`, `RunCompletedMessage`, etc.

#### 2.3.7 Create package exports

Create `packages/shared/src/index.ts`:

- Re-export all types from types/
- Export Zod schemas
- Export type guards and utilities

### 2.4 Verification Steps

1. Navigate to `packages/shared`
2. Run `pnpm install` in the package
3. Run `pnpm build` - should compile without errors
4. Verify `dist/` contains `.js` and `.d.ts` files
5. Import a type in a test file to verify exports work

### 2.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/shared/package.json` | Created | Package configuration |
| `packages/shared/tsconfig.json` | Created | TypeScript config |
| `packages/shared/src/types/work-order.ts` | Created | WorkOrder types |
| `packages/shared/src/types/run.ts` | Created | Run types |
| `packages/shared/src/types/api.ts` | Created | API response types |
| `packages/shared/src/types/websocket.ts` | Created | WebSocket types |
| `packages/shared/src/index.ts` | Created | Package exports |

---

## Thrust 3: Server Package Migration

### 3.1 Objective

Move existing AgentGate code into `packages/server/` while maintaining all functionality.

### 3.2 Background

This is the most critical thrust. All existing code, tests, and configuration must be moved without breaking anything. The server package will depend on `@agentgate/shared` for types.

### 3.3 Subtasks

#### 3.3.1 Move source code

Move these directories to `packages/server/`:

- `src/` → `packages/server/src/`
- `test/` → `packages/server/test/`

Keep these at root level:
- `docs/` - Documentation stays at root
- `.github/` - CI stays at root
- `verify.yaml` - Will be updated for monorepo

#### 3.3.2 Move configuration files

Move to `packages/server/`:

- `tsconfig.json` → `packages/server/tsconfig.json`
- `vitest.config.ts` → `packages/server/vitest.config.ts`
- `eslint.config.js` → `packages/server/eslint.config.js`

#### 3.3.3 Create server package.json

Create `packages/server/package.json`:

- Package name: `@agentgate/server` (or keep `agentgate`)
- Version: `0.2.8`
- Bin entry for CLI
- Dependencies moved from root
- DevDependencies moved from root
- Add dependency: `@agentgate/shared: "workspace:*"`
- Scripts: build, test, typecheck, lint, start, dev

#### 3.3.4 Update import paths

Review and update any absolute imports:

- Change `src/` imports to relative paths
- Add `@agentgate/shared` imports where appropriate
- Ensure all paths resolve correctly

#### 3.3.5 Update tsconfig.json

Update `packages/server/tsconfig.json`:

- Extend from root config if appropriate
- Set correct rootDir and outDir
- Add reference to `@agentgate/shared`

#### 3.3.6 Create root convenience scripts

Update root `package.json` to proxy common commands:

- `pnpm build` → builds all packages
- `pnpm test` → runs all tests
- `pnpm start` → starts server
- `pnpm dev` → starts server in dev mode

#### 3.3.7 Create build output symlink

For backwards compatibility:

- Build server to `packages/server/dist/`
- Create symlink `dist/` → `packages/server/dist/`
- Or copy files post-build

### 3.4 Verification Steps

1. Run `pnpm install` from root
2. Run `pnpm --filter @agentgate/server build` - should succeed
3. Run `pnpm --filter @agentgate/server test` - all 250+ tests pass
4. Run `pnpm --filter @agentgate/server typecheck` - no errors
5. Run `node packages/server/dist/index.js --help` - CLI works
6. Run `node packages/server/dist/index.js serve --port 13003 &`
7. Verify `curl http://localhost:13003/health` returns OK

### 3.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/**/*` | Moved | All source files |
| `packages/server/test/**/*` | Moved | All test files |
| `packages/server/package.json` | Created | Package config |
| `packages/server/tsconfig.json` | Moved/Modified | TypeScript config |
| `packages/server/vitest.config.ts` | Moved | Vitest config |
| `packages/server/eslint.config.js` | Moved | ESLint config |
| `package.json` (root) | Modified | Workspace scripts |
| `.gitignore` | Modified | Add packages/*/dist |

---

## Thrust 4: Dashboard Integration

### 4.1 Objective

Clone the agentgate-dashboard repository into `packages/dashboard/` and integrate with the monorepo.

### 4.2 Background

The dashboard was built as a separate repository but now needs to be integrated into the monorepo. This involves copying the code, updating configuration, and ensuring it builds correctly.

### 4.3 Subtasks

#### 4.3.1 Clone dashboard code

Clone or copy dashboard code into `packages/dashboard/`:

- Copy all source files from agentgate-dashboard repo
- Exclude `.git/` directory
- Exclude `node_modules/`
- Keep all configuration files

#### 4.3.2 Update package.json

Modify `packages/dashboard/package.json`:

- Update package name to `@agentgate/dashboard`
- Version: `0.2.8` (sync with monorepo)
- Add dependency: `@agentgate/shared: "workspace:*"`
- Update scripts as needed
- Remove any root-only devDependencies

#### 4.3.3 Update vite.config.ts

Update Vite configuration:

- Ensure correct resolve paths
- Update any absolute path aliases
- Configure server proxy for API in dev mode

#### 4.3.4 Update tsconfig.json

Modify TypeScript configuration:

- Extend from root config if appropriate
- Add path alias for `@agentgate/shared`
- Ensure correct include/exclude paths

#### 4.3.5 Update API configuration

Update API client configuration:

- Environment variable for API URL
- Development proxy configuration
- WebSocket URL configuration

#### 4.3.6 Verify dashboard isolation

Ensure dashboard can:

- Install dependencies independently
- Build without server running
- Run tests independently

### 4.4 Verification Steps

1. Run `pnpm install` from root
2. Run `pnpm --filter @agentgate/dashboard install`
3. Run `pnpm --filter @agentgate/dashboard build` - should succeed
4. Run `pnpm --filter @agentgate/dashboard dev` - dev server starts
5. Navigate to localhost:5173 - dashboard loads
6. Verify no TypeScript errors

### 4.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/dashboard/**/*` | Created | All dashboard files |
| `packages/dashboard/package.json` | Modified | Update for workspace |
| `packages/dashboard/tsconfig.json` | Modified | Path references |
| `packages/dashboard/vite.config.ts` | Modified | Resolve paths |

---

## Thrust 5: Shared Type Adoption

### 5.1 Objective

Update both server and dashboard to use types from `@agentgate/shared`, removing duplicate type definitions.

### 5.2 Background

After the shared package is created and both server/dashboard are in place, we need to update all imports to use the shared types, eliminating duplication.

### 5.3 Subtasks

#### 5.3.1 Identify duplicate types

Audit both packages for duplicate type definitions:

- WorkOrder-related types
- Run-related types
- API response types
- WebSocket message types

Create a mapping of where each type is defined.

#### 5.3.2 Update server imports

In `packages/server/`:

- Find all files using local WorkOrder types
- Update imports to use `@agentgate/shared`
- Remove local type definitions
- Ensure compatibility with existing code

#### 5.3.3 Update dashboard imports

In `packages/dashboard/`:

- Find all files using local types
- Update imports to use `@agentgate/shared`
- Remove local type definitions
- Update component props to use shared types

#### 5.3.4 Remove duplicate definitions

After updating imports:

- Delete `packages/server/src/types/` files that are now in shared
- Delete `packages/dashboard/src/types/` files that are now in shared
- Keep package-specific types (e.g., internal state types)

#### 5.3.5 Update Zod schemas

If server uses Zod for validation:

- Import schemas from `@agentgate/shared`
- Remove duplicate schema definitions
- Ensure runtime validation still works

#### 5.3.6 Verify type compatibility

Run type checking to catch any mismatches:

- Fix any type errors introduced
- Ensure all generics work correctly
- Verify function signatures match

### 5.4 Verification Steps

1. Run `pnpm typecheck` from root - all packages pass
2. Run `pnpm --filter @agentgate/server test` - tests pass
3. Run `pnpm --filter @agentgate/dashboard build` - builds successfully
4. Search codebase for duplicate type definitions - should find none
5. Verify shared package is only place WorkOrder/Run are defined

### 5.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/**/*.ts` | Modified | Update imports |
| `packages/dashboard/src/**/*.ts` | Modified | Update imports |
| `packages/server/src/types/*.ts` | Deleted | Moved to shared |
| `packages/dashboard/src/types/*.ts` | Deleted | Moved to shared |

---

## Navigation

- Previous: [01-overview.md](./01-overview.md)
- Next: [03-testing.md](./03-testing.md)
