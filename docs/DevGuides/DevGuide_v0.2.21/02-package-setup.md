# 02: Thrust 1 - Package Setup

## Objective

Create the `packages/tui` package with all necessary dependencies, configuration, and entry point for the Ink-based terminal user interface.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1.1 | Package builds with tsup | Must Have |
| F1.2 | CLI command `agentgate` runs | Must Have |
| F1.3 | Basic App component renders | Must Have |
| F1.4 | TypeScript strict mode enabled | Must Have |
| F1.5 | Package integrated in monorepo | Must Have |
| F1.6 | Development mode with watch | Should Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N1.1 | Build time < 5 seconds | Should Have |
| N1.2 | Bundle size < 200KB | Should Have |
| N1.3 | Works on Node.js 18+ | Must Have |

---

## Directory Structure

```
packages/tui/
├── src/
│   ├── index.tsx           # Entry point (renders App)
│   ├── App.tsx             # Root Ink component
│   ├── cli.ts              # Commander.js CLI setup
│   ├── api/                # API client (Thrust 2)
│   ├── store/              # Zustand stores
│   ├── hooks/              # React hooks
│   ├── components/
│   │   ├── core/           # Primitives
│   │   ├── views/          # Full-screen views
│   │   ├── panels/         # Reusable panels
│   │   └── forms/          # Input components
│   ├── commands/           # CLI subcommands
│   ├── config/             # Configuration
│   └── utils/              # Helpers
├── tests/
│   ├── setup.ts            # Test setup
│   └── components/         # Component tests
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
└── README.md
```

---

## Package Configuration

### package.json

```json
{
  "name": "@agentgate/tui",
  "version": "0.2.21",
  "description": "Terminal User Interface for AgentGate",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "agentgate": "dist/cli.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "start": "node dist/cli.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "dependencies": {
    "ink": "^5.0.0",
    "ink-spinner": "^5.0.0",
    "@inkjs/ui": "^2.0.0",
    "react": "^18.3.0",
    "zustand": "^4.5.0",
    "commander": "^12.0.0",
    "ky": "^1.2.0",
    "eventsource": "^2.0.0",
    "chalk": "^5.3.0",
    "date-fns": "^3.0.0",
    "@agentgate/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/eventsource": "^1.1.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0",
    "ink-testing-library": "^4.0.0",
    "tsup": "^8.0.0",
    "@types/node": "^20.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "files": [
    "dist"
  ]
}
```

### Key Dependencies Explained

| Package | Version | Purpose |
|---------|---------|---------|
| `ink` | ^5.0.0 | React for terminals - core rendering |
| `@inkjs/ui` | ^2.0.0 | Pre-built Ink components (Select, TextInput) |
| `ink-spinner` | ^5.0.0 | Loading spinners |
| `react` | ^18.3.0 | React runtime |
| `zustand` | ^4.5.0 | Lightweight state management |
| `commander` | ^12.0.0 | CLI argument parsing |
| `ky` | ^1.2.0 | HTTP client (modern fetch wrapper) |
| `eventsource` | ^2.0.0 | SSE client for Node.js |
| `chalk` | ^5.3.0 | Terminal colors |
| `date-fns` | ^3.0.0 | Date formatting |

---

## TypeScript Configuration

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Key TypeScript Settings

| Setting | Value | Rationale |
|---------|-------|-----------|
| `target` | ES2022 | Modern Node.js features |
| `module` | ESNext | ES modules for tree-shaking |
| `moduleResolution` | bundler | Works with tsup |
| `jsx` | react-jsx | Modern JSX transform |
| `strict` | true | Full type safety |

---

## Build Configuration

### tsup.config.ts

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.tsx',
    cli: 'src/cli.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  esbuildOptions(options) {
    options.banner = {
      js: options.entryPoints?.includes('cli')
        ? '#!/usr/bin/env node'
        : '',
    };
  },
});
```

### Build Output

```
dist/
├── index.js          # Main library entry
├── index.d.ts        # Type declarations
├── cli.js            # CLI entry (with shebang)
└── cli.d.ts          # CLI types
```

---

## Entry Point Files

### src/index.tsx

```
Purpose: Main entry point for programmatic use

Responsibilities:
1. Export render function
2. Export main App component
3. Re-export key types

Exports:
- render(): Instance - Renders TUI and returns Ink instance
- App: React.FC - Main application component
- Types from @agentgate/shared
```

### src/App.tsx

```
Purpose: Root Ink component

Responsibilities:
1. Initialize Zustand stores
2. Set up keyboard input
3. Route to correct view
4. Handle global state

Structure:
App
├── StoreProvider (Zustand)
├── KeyboardHandler (global shortcuts)
└── Router
    ├── DashboardView (default)
    ├── WorkOrdersView
    ├── WorkOrderDetailView
    ├── RunStreamView
    ├── CreateWorkOrderView
    └── HelpView
```

### src/cli.ts

```
Purpose: CLI argument parsing with Commander.js

Commands:
- agentgate (default) - Launch interactive TUI
- agentgate status - Show dashboard
- agentgate list - List work orders
- agentgate watch <id> - Stream run output
- agentgate create - Create work order
- agentgate config - Manage configuration

Global Options:
--api-url <url>    Server URL (default: http://localhost:3000)
--api-key <key>    API key for authentication
--no-color         Disable colors
--json             Output as JSON (for status/list)
```

---

## Store Setup

### src/store/app.ts

```
Purpose: Global application state

State Shape:
{
  // Navigation
  currentView: 'dashboard' | 'work-orders' | 'run-stream' | 'create',
  viewHistory: string[],

  // API
  apiUrl: string,
  apiKey: string | null,

  // Selection
  selectedWorkOrderId: string | null,
  selectedRunId: string | null,

  // UI
  isLoading: boolean,
  error: string | null,
}

Actions:
- navigate(view): void
- goBack(): void
- setApiConfig(url, key): void
- setSelectedWorkOrder(id): void
- setSelectedRun(id): void
- setLoading(loading): void
- setError(error): void
```

---

## Development Workflow

### Initial Setup

```bash
# From monorepo root
cd packages/tui

# Install dependencies
pnpm install

# Build once
pnpm build

# Link binary globally (optional)
pnpm link --global

# Run in development mode
pnpm dev

# In another terminal, run the CLI
node dist/cli.js
# or if linked:
agentgate
```

### Development Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Watch mode - rebuilds on changes |
| `pnpm build` | Production build |
| `pnpm test` | Run unit tests |
| `pnpm test:watch` | Watch mode for tests |
| `pnpm typecheck` | Type check without emit |

### Debugging

```bash
# Debug with Node inspector
node --inspect dist/cli.js

# Enable verbose logging
DEBUG=agentgate:* node dist/cli.js

# Check terminal capabilities
node -e "console.log(process.stdout.isTTY)"
```

---

## Monorepo Integration

### Root pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
```

### Root package.json Scripts

```json
{
  "scripts": {
    "tui": "pnpm --filter @agentgate/tui",
    "tui:build": "pnpm --filter @agentgate/tui build",
    "tui:dev": "pnpm --filter @agentgate/tui dev"
  }
}
```

### Shared Types Import

```typescript
// Import shared types from monorepo
import type {
  WorkOrder,
  Run,
  RunEvent,
  WorkOrderStatus
} from '@agentgate/shared';
```

---

## Test Configuration

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/'],
    },
  },
});
```

### tests/setup.ts

```typescript
// Setup for ink-testing-library
import { cleanup } from 'ink-testing-library';
import { afterEach, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment
vi.stubEnv('NODE_ENV', 'test');
```

---

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `AGENTGATE_API_URL` | Server URL | http://localhost:3000 |
| `AGENTGATE_API_KEY` | API key | (none) |
| `AGENTGATE_CONFIG_DIR` | Config directory | ~/.agentgate |
| `NO_COLOR` | Disable colors | (none) |
| `DEBUG` | Debug logging | (none) |

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC1.1 | Package builds without errors | `pnpm build` succeeds |
| AC1.2 | CLI command works | `agentgate --version` shows version |
| AC1.3 | App renders in terminal | Shows basic UI |
| AC1.4 | TypeScript compiles | `pnpm typecheck` passes |
| AC1.5 | Tests pass | `pnpm test` passes |
| AC1.6 | Shared types work | Can import from @agentgate/shared |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| Package version | Matches package.json |
| CLI help | --help shows usage |
| CLI version | --version shows version |
| App render | Basic render without crash |
| Store initialization | Default state correct |

### Integration Tests

| Test | Description |
|------|-------------|
| Build output | All expected files exist |
| Binary execution | CLI runs without error |
| Type exports | All types accessible |

---

## Common Issues

### Issue: Command not found after linking

```bash
# Solution: Add to PATH or use npx
npx agentgate

# Or run directly
node packages/tui/dist/cli.js
```

### Issue: React version mismatch

```bash
# Solution: Check React version consistency
pnpm why react
# Ensure only one React version across monorepo
```

### Issue: ESM/CJS conflicts

```bash
# Solution: Ensure all imports use ESM
# Check for .js extensions in imports
# Use "type": "module" in package.json
```

---

## Files to Create

| File | Lines (est.) | Description |
|------|--------------|-------------|
| `package.json` | 50 | Package configuration |
| `tsconfig.json` | 30 | TypeScript config |
| `tsup.config.ts` | 20 | Build config |
| `vitest.config.ts` | 20 | Test config |
| `src/index.tsx` | 30 | Entry point |
| `src/App.tsx` | 80 | Root component |
| `src/cli.ts` | 100 | CLI setup |
| `src/store/app.ts` | 60 | Global state |
| `tests/setup.ts` | 15 | Test setup |

**Total: ~9 files, ~400 lines**
