# AgentGate - AI Coding Agent Context

This document provides AI coding agents with comprehensive context about the AgentGate codebase, enabling effective development and self-improvement.

## Project Overview

**AgentGate** is an orchestration platform for AI coding agents that provides:
- Work order submission and execution management
- Verification gates (L0-L3) for code quality
- Sandbox isolation for safe execution
- CI/CD integration for GitHub Actions
- Crash recovery through Write-Ahead Logging (WAL)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Control Plane                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │   CLI    │  │  Server  │  │WebSocket │                   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                   │
│       └─────────────┼─────────────┘                         │
│                     ▼                                        │
│            ┌────────────────┐                               │
│            │  Orchestrator  │  (State Machine, WAL)         │
│            └───────┬────────┘                               │
│       ┌────────────┼────────────┐                           │
│       ▼            ▼            ▼                           │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                      │
│ │Execution │ │Verifier  │ │Delivery  │                      │
│ │ Engine   │ │(L0-L3)   │ │(Git/PR)  │                      │
│ └────┬─────┘ └──────────┘ └──────────┘                      │
│      ▼                                                       │
│ ┌──────────────────────────────────┐                        │
│ │        Sandbox Manager           │                        │
│ │  (Docker | Subprocess)           │                        │
│ └──────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

- **Work Order**: A request for an agent to complete a task
- **Run**: An execution of a work order (has state machine lifecycle)
- **Gate**: A verification check (L0=contracts, L1=tests, L2=blackbox, L3=sanity)
- **Sandbox**: Isolated environment for agent execution (Docker or subprocess)
- **Iteration**: One cycle of agent work + verification
- **WAL**: Write-Ahead Log for crash recovery

## Repository Structure

```
packages/
├── server/          # Main AgentGate server (TypeScript)
│   ├── src/
│   │   ├── orchestrator/   # State machine, WAL, run lifecycle
│   │   ├── execution/      # Execution engine, phases
│   │   ├── verifier/       # L0-L3 verification
│   │   ├── sandbox/        # Docker & subprocess providers
│   │   ├── delivery/       # Git operations, PR creation
│   │   ├── control-plane/  # CLI, server, commands
│   │   ├── queue/          # Execution queue
│   │   ├── gate/           # Gate runners, pipeline
│   │   ├── agent/          # Agent drivers
│   │   ├── config/         # Configuration system
│   │   ├── errors/         # Error framework
│   │   ├── extensibility/  # Hooks, events, plugins
│   │   └── types/          # TypeScript type definitions
│   └── test/               # Tests (vitest)
└── dashboard/       # React dashboard (Vite)
```

## Module Responsibilities

### Orchestrator (`src/orchestrator/`)
- **state-machine.ts**: Run state transitions (QUEUED→LEASED→BUILDING→etc.)
- **orchestrator.ts**: Main coordination logic
- **wal.ts**: Write-ahead log for crash recovery
- **run-store.ts**: Run persistence

### Execution (`src/execution/`)
- **engine.ts**: Executes phases (build, snapshot, verify)
- **phases/**: Individual phase handlers
- **context.ts**: Execution context

### Verifier (`src/verifier/`)
- **l0-contracts.ts**: Contract verification (file existence, patterns)
- **l1-tests.ts**: Test execution
- **l2-blackbox.ts**: Black-box testing
- **l3-sanity.ts**: Sanity checks

### Sandbox (`src/sandbox/`)
- **docker-provider.ts**: Docker container isolation
- **subprocess-provider.ts**: Process-based execution
- **registry.ts**: Sandbox tracking for cleanup
- **orphan-detector.ts**: Orphan cleanup

### Delivery (`src/delivery/`)
- **git-handler.ts**: Git operations (commit, branch)
- **pr-handler.ts**: Pull request creation
- **coordinator.ts**: Delivery orchestration

### Control Plane (`src/control-plane/`)
- **cli.ts**: Command-line interface
- **commands/**: Individual CLI commands
- **shutdown-manager.ts**: Graceful shutdown

## Coding Conventions

### TypeScript
- Strict mode enabled, explicit types required
- Prefer `interface` over `type` for object shapes
- Use `readonly` for immutable properties
- No `any` - use `unknown` with type guards instead

### Error Handling
```typescript
import { AgentGateError, ValidationError } from '../errors/index.js';

// Use typed errors
throw new ValidationError(
  ErrorCode.VALIDATION_FAILED,
  'Invalid work order format',
  { field: 'task', value: undefined }
);

// Wrap unknown errors
try { ... } catch (error) {
  throw normalizeError(error, ErrorCode.INTERNAL_ERROR);
}
```

### Async Patterns
```typescript
import { withTimeout, checkAborted } from '../utils/timeout.js';

// Use AbortSignal for cancellation
async function execute(signal?: AbortSignal): Promise<Result> {
  checkAborted(signal);  // Early exit if aborted

  // With timeout
  const result = await withTimeout(
    longOperation(),
    30000,  // 30 seconds
    signal
  );
}
```

### Naming
- Functions: `camelCase` (`createWorkOrder`, `validateConfig`)
- Classes: `PascalCase` (`WorkOrderService`, `SandboxManager`)
- Constants: `UPPER_SNAKE_CASE` (`MAX_RETRIES`, `DEFAULT_TIMEOUT`)
- Files: `kebab-case` (`work-order-service.ts`)

### Imports
```typescript
// Node built-ins with 'node:' prefix
import fs from 'node:fs';
import path from 'node:path';

// External packages
import { z } from 'zod';

// Internal - relative within module
import { helper } from './helper.js';

// Internal - always use .js extension
import { SomeType } from '../types/index.js';
```

## Safe Modification Zones

### ✅ Safe to Modify (low risk)
- `src/feedback/*` - Feedback formatting
- `src/utils/*` - Utilities (with tests)
- `test/*` - Test files
- Documentation files
- Example harnesses

### ⚠️ Caution Required
- `src/verifier/*` - Affects verification logic
- `src/delivery/*` - Affects Git/PR operations
- `src/sandbox/*` - Affects isolation

### 🔴 Critical (extensive testing required)
- `src/orchestrator/*` - State machine, core coordination
- `src/queue/*` - Execution queue
- `src/control-plane/*` - Server, CLI

## Testing

### Running Tests
```bash
# All tests
pnpm test

# Specific file
pnpm test -- test/orchestrator/wal.test.ts

# Pattern matching
pnpm test -- --grep "WAL"

# Watch mode
pnpm test:watch
```

### Test Requirements
- New functions require unit tests
- Modified behavior requires updated tests
- Integration tests for cross-module changes
- Run `pnpm test` before every commit
- Run `pnpm lint` to check for warnings

### Writing Tests
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('MyFeature', () => {
  beforeEach(() => {
    // Reset singletons
    MyClass.resetInstance();
  });

  it('should do something', async () => {
    const result = await myFunction();
    expect(result).toBe(expected);
  });
});
```

## Self-Awareness Context

When executing within AgentGate sandbox:

### Environment Variables
- `AGENTGATE_SANDBOX=true` - Indicates sandbox context
- `AGENTGATE_RUN_ID` - Current run identifier
- `AGENTGATE_ITERATION` - Current iteration number

### Resource Limits
- Memory limit enforced (default 4GB)
- CPU limit enforced (default 2 cores)
- Execution timeout (configurable, default 1 hour)
- Network may be disabled (`AGENTGATE_NETWORK=false`)

### Forbidden Operations
- Writing outside workspace directory
- Network access (if disabled)
- Process spawning limits

### Reading Feedback
Verification feedback follows this format:
```
## Verification Failed

### CRITICAL Priority
- **gate-id** (type): error message

### Errors
- File.ts:10: Error description
  - Suggestion: How to fix
```

### Handling Rate Limits
If GitHub rate limited:
1. Check `AGENTGATE_GITHUB_RATE_LIMIT` environment
2. Wait for indicated time before retrying
3. Reduce API call frequency

## Common Patterns

### Singleton Pattern
```typescript
export class MyManager {
  private static instance: MyManager | null = null;

  static getInstance(): MyManager {
    if (!MyManager.instance) {
      MyManager.instance = new MyManager();
    }
    return MyManager.instance;
  }

  static resetInstance(): void {
    MyManager.instance = null;
  }
}
```

### Logger Usage
```typescript
import { createLogger } from '../utils/logger.js';

const log = createLogger('my-module');

log.info({ key: 'value' }, 'Message');
log.error({ error }, 'Error occurred');
log.debug({ details }, 'Debug info');
```

### Configuration Access
```typescript
import { getConfig } from '../config/index.js';

const config = getConfig();
const timeout = config.execution.defaultTimeoutSeconds;
```

## Quick Reference

| Task | Command |
|------|---------|
| Run tests | `pnpm test` |
| Run lint | `pnpm lint` |
| Build | `pnpm build` |
| Type check | `pnpm typecheck` |
| Start server | `pnpm start` |
| Dev mode | `pnpm dev` |

## See Also

- [packages/server/CLAUDE.md](./packages/server/CLAUDE.md) - Server-specific context
- [docs/DevGuides/](./docs/DevGuides/) - Development guides
- [AGENTS.md](./AGENTS.md) - Engineering standards
