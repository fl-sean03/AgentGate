# AgentGate Server - AI Agent Context

Server-specific context for AI coding agents working on the AgentGate server package.

## Package Overview

The `@agentgate/server` package is the core of AgentGate, handling:
- Work order submission and lifecycle management
- Agent execution in sandboxed environments
- Multi-level verification (L0-L3)
- Git operations and PR delivery
- Real-time WebSocket streaming

## Source Structure

```
src/
├── agent/              # Agent drivers (Claude Code, SDK, etc.)
│   ├── capabilities.ts   # Capability declarations
│   ├── matcher.ts        # Capability matching
│   ├── claude-code-driver.ts
│   └── claude-agent-sdk-driver.ts
│
├── config/             # Configuration system
│   ├── schema.ts         # Zod schemas
│   ├── registry.ts       # Runtime config registry
│   └── loader.ts         # Multi-source loader
│
├── control-plane/      # CLI and server
│   ├── cli.ts            # CLI entry point
│   ├── commands/         # Individual commands
│   ├── shutdown-manager.ts
│   └── work-order-service.ts
│
├── errors/             # Error framework
│   ├── types.ts          # Error codes, categories
│   ├── base.ts           # Error classes
│   └── propagation.ts    # Error utilities
│
├── execution/          # Execution engine
│   ├── engine.ts         # Main engine
│   ├── context.ts        # Execution context
│   └── phases/           # Phase handlers
│
├── extensibility/      # Plugin system
│   ├── hooks.ts          # Hook registry
│   ├── events.ts         # Event emitter
│   └── plugins.ts        # Plugin manager
│
├── gate/               # Gate system
│   ├── registry.ts       # Gate runner registry
│   ├── builder.ts        # Gate plan builder
│   ├── aggregator.ts     # Result aggregation
│   └── runners/          # Gate implementations
│
├── github/             # GitHub integration
│   ├── rate-limiter.ts   # Rate limit handling
│   └── workflow-monitor.ts
│
├── git/                # Git operations
│   └── conflict-detector.ts
│
├── orchestrator/       # Core orchestration
│   ├── state-machine.ts  # Run state machine
│   ├── orchestrator.ts   # Main orchestrator
│   └── wal.ts            # Write-ahead log
│
├── process/            # Process management
│   ├── tracker.ts        # Process tracking
│   ├── spawn-tracker.ts  # Deadlock detection
│   └── resource-enforcer.ts
│
├── sandbox/            # Sandbox providers
│   ├── docker-provider.ts
│   ├── subprocess-provider.ts
│   ├── registry.ts       # Sandbox tracking
│   └── orphan-detector.ts
│
├── server/             # HTTP/WebSocket server
│   ├── app.ts            # Fastify app
│   ├── routes/           # API routes
│   └── websocket/        # WebSocket handlers
│
├── types/              # Type definitions
│   ├── work-order.ts
│   ├── run.ts
│   ├── gate.ts
│   └── index.ts          # Re-exports
│
├── utils/              # Utilities
│   ├── logger.ts         # Structured logging
│   └── timeout.ts        # AbortSignal utilities
│
└── verifier/           # Verification levels
    ├── l0-contracts.ts
    ├── l1-tests.ts
    ├── l2-blackbox.ts
    └── l3-sanity.ts
```

## Key Entry Points

### CLI
```typescript
// src/control-plane/cli.ts
import { program } from 'commander';
// Commands in src/control-plane/commands/
```

### Server
```typescript
// src/server/app.ts
import Fastify from 'fastify';
// Routes in src/server/routes/
```

### Orchestrator
```typescript
// src/orchestrator/orchestrator.ts
export class Orchestrator {
  async processWorkOrder(workOrder: WorkOrder): Promise<Run> {}
}
```

## State Machine

Run lifecycle states:
```
QUEUED → LEASED → BUILDING → SNAPSHOTTING → VERIFYING
                                              ↓
                    FEEDBACK ← ← ← ← ← ← ← ← ←
                        ↓
                   (iterate or complete)
                        ↓
              SUCCEEDED | FAILED | CANCELED
```

Special states:
- `INTERRUPTED`: Saved during graceful shutdown, will resume
- `CI_POLLING`: Waiting for GitHub Actions

## Important Types

### WorkOrder
```typescript
interface WorkOrder {
  id: string;
  task: string;
  repository: Repository;
  branch?: string;
  maxIterations?: number;
  gate?: GatePlan;
}
```

### Run
```typescript
interface Run {
  id: string;
  workOrderId: string;
  status: RunStatus;
  iteration: number;
  startedAt: Date;
  completedAt?: Date;
}
```

### GatePlan
```typescript
interface GatePlan {
  checks: GateCheck[];
}

interface GateCheck {
  type: 'verification-levels' | 'github-actions' | 'custom' | ...;
  config?: Record<string, unknown>;
}
```

## Testing Patterns

### Singleton Reset
```typescript
beforeEach(() => {
  ConfigRegistry.resetInstance();
  PluginManager.resetInstance();
  HookManager.resetInstance();
});
```

### Mocking
```typescript
import { vi } from 'vitest';

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));
```

### Test File Location
- Unit tests: `test/<module-name>.test.ts`
- Integration tests: `test/e2e/`
- Module-specific: `test/<module>/`

## Configuration

### Environment Variables
```bash
AGENTGATE_PORT=3001
AGENTGATE_MAX_CONCURRENT_RUNS=5
AGENTGATE_SANDBOX_PROVIDER=auto
AGENTGATE_WAL_ENABLED=true
```

### Config Access
```typescript
import { getConfig } from '../config/index.js';
import { getConfigRegistry } from '../config/registry.js';

// Static config
const config = getConfig();

// Runtime registry (dynamic)
const registry = getConfigRegistry();
registry.get('server.port');
registry.set('server.port', 8080);
```

## Error Handling

### Error Hierarchy
```
AgentGateError (base)
├── InfrastructureError  # System issues
├── AgentError           # Agent failures
├── ValidationError      # Input validation
├── ConfigurationError   # Config issues
├── ResourceError        # Resource limits
├── TimeoutError         # Timeouts
├── ConflictError        # Git conflicts
├── GitHubError          # GitHub API
└── InternalError        # Unexpected errors
```

### Usage
```typescript
import { ValidationError, ErrorCode, normalizeError } from '../errors/index.js';

// Throw typed error
throw new ValidationError(ErrorCode.VALIDATION_FAILED, 'Invalid input');

// Normalize unknown error
try {
  await operation();
} catch (error) {
  throw normalizeError(error, ErrorCode.INTERNAL_ERROR);
}
```

## Extensibility

### Hooks
```typescript
import { registerHook, getHookManager } from '../extensibility/hooks.js';

// Register hook
registerHook('workOrder:beforeSubmit', 'my-hook', async (ctx) => {
  // Modify context or validate
});
```

### Events
```typescript
import { getEventBus } from '../extensibility/events.js';

const bus = getEventBus();
bus.on('workOrder:submitted', (data) => {
  console.log('Work order submitted:', data);
});
```

### Plugins
```typescript
import { createPlugin, getPluginManager } from '../extensibility/plugins.js';

const plugin = createPlugin(
  { id: 'my-plugin', name: 'My Plugin', version: '1.0.0' },
  async (ctx) => {
    ctx.registerHook('workOrder:beforeSubmit', async () => {});
    ctx.subscribeEvent('workOrder:submitted', (data) => {});
  }
);

await getPluginManager().load(plugin);
```

## Quick Commands

```bash
# Development
pnpm dev          # Start dev server
pnpm test         # Run tests
pnpm test:watch   # Watch mode
pnpm lint         # Check linting
pnpm typecheck    # Type checking
pnpm build        # Build

# Testing specific files
pnpm test -- test/orchestrator/wal.test.ts
pnpm test -- --grep "pattern"
```

## Current Test Status

- **2200+ tests** passing
- Key test files:
  - `test/orchestrator/wal.test.ts` - WAL tests
  - `test/control-plane/shutdown-manager.test.ts` - Shutdown
  - `test/sandbox/registry.test.ts` - Sandbox registry
  - `test/extensibility/*.test.ts` - Plugin system

## Common Pitfalls

1. **Forgetting .js extension**: Always use `.js` in imports
2. **Not resetting singletons in tests**: Use `resetInstance()` in `beforeEach`
3. **Missing AbortSignal propagation**: Pass signal through async chains
4. **Empty catch blocks**: Always log or re-throw errors
5. **Hardcoded paths**: Use `path.join()` for cross-platform

## See Also

- [../../CLAUDE.md](../../CLAUDE.md) - Project-wide context
- [../../docs/DevGuides/](../../docs/DevGuides/) - Development guides
