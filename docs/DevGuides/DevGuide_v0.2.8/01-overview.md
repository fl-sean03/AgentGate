# DevGuide v0.2.8: Overview

This document provides the architectural context and design decisions for restructuring AgentGate into a monorepo.

---

## Background

### Current State

AgentGate exists as two separate repositories:

**Main Repository (`AgentGate/`)**:
- CLI tool for work order management
- HTTP server with REST API and WebSocket
- Orchestrator for agent execution
- L0-L3 verification pipeline
- 250+ tests, comprehensive CI

**Dashboard Repository (`agentgate-dashboard/`)**:
- React + Vite + TailwindCSS frontend
- Work order list, detail, submission form
- Real-time WebSocket updates
- Separate CI pipeline

**Problems with Current Structure**:
1. **Type drift** - Frontend and backend define same types independently
2. **Coordination overhead** - Changes spanning both repos require two PRs
3. **Testing gaps** - No automated tests verifying frontend-backend integration
4. **Release complexity** - Must coordinate versions between repos
5. **Developer friction** - Context switching between repos

### Target State

A unified monorepo where:
- Shared types are defined once and used everywhere
- Atomic commits can span frontend and backend
- Integration tests verify the full stack
- Single CI pipeline validates everything
- One version, one release process

---

## Architectural Decisions

### AD-1: pnpm Workspaces

**Decision**: Use pnpm workspaces for monorepo management

**Rationale**:
- **Native workspace support** - First-class monorepo features
- **Strict isolation** - Packages can only access declared dependencies
- **Performance** - Content-addressable storage, faster installs
- **Filter commands** - Easy `pnpm --filter <package>` execution
- **Already using pnpm** - No tooling change required

**Configuration**:
```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
```

**Alternatives Considered**:
- **npm workspaces**: Less mature, slower installs
- **yarn workspaces**: Good, but pnpm already in use
- **Lerna**: Deprecated for workspace management, now just publishing
- **Nx**: Overkill for 3 packages, complex setup

### AD-2: Flat Package Structure

**Decision**: Use flat `packages/` directory with three packages

**Rationale**:
- **Simplicity** - Easy to navigate and understand
- **No nesting** - Avoids workspace-in-workspace complexity
- **Clear boundaries** - Each package has distinct responsibility
- **Standard convention** - Common in TypeScript monorepos

**Structure**:
```
packages/
├── server/      # Backend (CLI, HTTP, orchestrator)
├── dashboard/   # Frontend (React app)
└── shared/      # Shared types and utilities
```

**Alternatives Considered**:
- **apps/ + packages/**: Common but adds unnecessary nesting
- **Nested packages**: Complex, hard to maintain
- **Flat with prefixes**: Less conventional

### AD-3: Shared Types Package

**Decision**: Create `@agentgate/shared` package for API contracts

**Rationale**:
- **Single source of truth** - Types defined once
- **Compile-time safety** - TypeScript catches mismatches
- **Zod schemas** - Runtime validation + type inference
- **API stability** - Breaking changes are visible

**Package Contents**:
```typescript
// @agentgate/shared
export * from './types/work-order';
export * from './types/run';
export * from './types/api';
export * from './types/websocket';
```

**Type Examples**:
```typescript
// types/work-order.ts
export interface WorkOrder {
  id: string;
  taskPrompt: string;
  status: WorkOrderStatus;
  workspaceSource: WorkspaceSource;
  agentType: AgentType;
  maxIterations: number;
  maxWallClockSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export type WorkOrderStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

**Alternatives Considered**:
- **Copy types**: Leads to drift, maintenance burden
- **Generate from OpenAPI**: Additional tooling, less flexible
- **No shared types**: TypeScript loses value

### AD-4: Server as Primary Entry Point

**Decision**: Keep `packages/server/` as the main entry point

**Rationale**:
- **Preserves behavior** - `node dist/index.js` still works
- **CLI is primary interface** - Dashboard is auxiliary
- **Build output at root** - Symlink or copy for backwards compatibility
- **Package name**: `@agentgate/server` or keep as `agentgate`

**Entry Point Strategy**:
```json
// Root package.json
{
  "scripts": {
    "start": "pnpm --filter @agentgate/server start",
    "build": "pnpm -r build"
  }
}
```

### AD-5: Integration Tests at Root Level

**Decision**: Place cross-cutting tests in root `test/integration/`

**Rationale**:
- **Package independence** - Individual packages test themselves
- **Cross-cutting concerns** - Integration tests span packages
- **Clear separation** - Unit vs integration is obvious
- **CI organization** - Can run different test suites

**Test Categories**:
```
test/
└── integration/
    ├── api-dashboard.test.ts    # Dashboard ↔ Server API
    ├── websocket-sync.test.ts   # Real-time updates
    ├── type-contracts.test.ts   # Shared type compliance
    └── setup.ts                 # Test utilities
```

### AD-6: Optional Turborepo

**Decision**: Make Turborepo optional, add if needed

**Rationale**:
- **Start simple** - pnpm scripts sufficient initially
- **Add when needed** - If builds become slow
- **Low switching cost** - Easy to add later
- **Avoid complexity** - One less tool to maintain

**When to Add Turborepo**:
- Build times exceed 60 seconds
- Need remote caching
- Complex dependency graphs

---

## Data Flow

### Type Sharing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     @agentgate/shared                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ WorkOrder    │  │ Run          │  │ ApiResponse  │          │
│  │ types        │  │ types        │  │ types        │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ @agentgate/     │  │ @agentgate/     │  │ Integration     │
│ server          │  │ dashboard       │  │ Tests           │
│                 │  │                 │  │                 │
│ Uses types for: │  │ Uses types for: │  │ Uses types for: │
│ - API responses │  │ - API requests  │  │ - Assertions    │
│ - WebSocket msg │  │ - State types   │  │ - Mocks         │
│ - Storage       │  │ - Components    │  │ - Contracts     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Build Dependency Graph

```
┌──────────────────┐
│ @agentgate/shared│  ← Build first (no dependencies)
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐  ┌──────────┐
│server │  │dashboard │  ← Build in parallel (both depend on shared)
└───────┘  └──────────┘
```

### CI Pipeline Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Install │────▶│Typecheck│────▶│  Lint   │
└─────────┘     │ (all)   │     │ (all)   │
                └─────────┘     └────┬────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Server Tests   │     │ Dashboard Tests │     │  Shared Tests   │
│  (unit + int)   │     │  (unit + e2e)   │     │  (unit)         │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────┐
                    │  Integration Tests  │
                    │  (cross-cutting)    │
                    └─────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────┐
                    │   Build All         │
                    └─────────────────────┘
```

---

## Package Configuration

### Root package.json

```json
{
  "name": "agentgate-monorepo",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "clean": "pnpm -r clean",
    "dev:server": "pnpm --filter @agentgate/server dev",
    "dev:dashboard": "pnpm --filter @agentgate/dashboard dev"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "vitest": "^1.0.0"
  }
}
```

### Server package.json

```json
{
  "name": "@agentgate/server",
  "version": "0.2.8",
  "dependencies": {
    "@agentgate/shared": "workspace:*",
    "fastify": "^4.25.0"
  }
}
```

### Dashboard package.json

```json
{
  "name": "@agentgate/dashboard",
  "version": "0.2.8",
  "dependencies": {
    "@agentgate/shared": "workspace:*",
    "react": "^18.2.0"
  }
}
```

### Shared package.json

```json
{
  "name": "@agentgate/shared",
  "version": "0.2.8",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "dependencies": {
    "zod": "^3.22.0"
  }
}
```

---

## Migration Strategy

### Phase 1: Non-Breaking Foundation

1. Create workspace configuration
2. Create shared types package (empty initially)
3. Move server code (preserving all paths)
4. Verify existing tests pass

### Phase 2: Dashboard Integration

1. Clone dashboard code into packages/
2. Update dashboard dependencies
3. Verify dashboard builds

### Phase 3: Type Unification

1. Extract types to shared package
2. Update server imports
3. Update dashboard imports
4. Remove duplicate type definitions

### Phase 4: Integration Testing

1. Create integration test infrastructure
2. Add cross-cutting tests
3. Update CI pipeline
4. Final validation

---

## Verification Plan

### L1 Tests (Unit/Integration)

```yaml
tests:
  - name: shared-typecheck
    command: pnpm --filter @agentgate/shared typecheck
  - name: server-typecheck
    command: pnpm --filter @agentgate/server typecheck
  - name: dashboard-typecheck
    command: pnpm --filter @agentgate/dashboard typecheck
  - name: server-tests
    command: pnpm --filter @agentgate/server test
  - name: dashboard-tests
    command: pnpm --filter @agentgate/dashboard test
```

### L2 Blackbox Tests

```yaml
blackbox:
  - name: api-dashboard-integration
    setup: |
      pnpm --filter @agentgate/server build
      node packages/server/dist/index.js serve --port 13002 &
      sleep 3
    command: |
      curl -s http://localhost:13002/health | grep -q '"status":"ok"'
    teardown: pkill -f "serve --port 13002" || true
```

### L3 Sanity Checks

```yaml
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
```

---

## Related Documents

- [02-implementation.md](./02-implementation.md) - Thrusts 1-4 details
- [03-testing.md](./03-testing.md) - Thrusts 5-7 details
- [04-appendices.md](./04-appendices.md) - Checklists and references
