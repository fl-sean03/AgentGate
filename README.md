# AgentGate

[![CI](https://github.com/fl-sean03/AgentGate/actions/workflows/ci.yml/badge.svg)](https://github.com/fl-sean03/AgentGate/actions/workflows/ci.yml)

A contained builder with verification gate for AI coding agents. AgentGate provides a structured environment for running AI agents with iterative build-verify-feedback loops.

## Features

- **Workspace Management**: Create, lease, and manage isolated workspaces for agent execution
- **Multi-Agent Support**: Pluggable agent drivers (Claude Code, OpenCode SDK)
- **Verification Pipeline**: Four-level verification system (L0-L3)
  - L0: Contract checks (required files, forbidden patterns, schemas)
  - L1: Test command execution
  - L2: Blackbox test verification
  - L3: Sanity checks
- **Gate Plans**: Define verification requirements via `verify.yaml` or auto-detect from CI workflows
- **Feedback Generation**: Structured feedback for agent iteration
- **Snapshot Management**: Git-based state capture and diffing
- **Clean Room Execution**: Isolated verification environments

## Installation

```bash
# Using pnpm (recommended)
pnpm add agentgate

# Using npm
npm install agentgate

# Using yarn
yarn add agentgate
```

## CLI Usage

```bash
# Submit a work order
agentgate submit --prompt "Build a REST API" --path ./my-project

# List work orders
agentgate list

# Check status
agentgate status <work-order-id>

# Cancel a work order
agentgate cancel <work-order-id>
```

## Programmatic Usage

```typescript
import { Orchestrator, createOrchestrator } from 'agentgate';

const orchestrator = createOrchestrator({
  maxConcurrentRuns: 5,
  defaultTimeoutSeconds: 3600,
});

const run = await orchestrator.execute({
  id: 'work-order-1',
  taskPrompt: 'Build a REST API with Express',
  workspaceSource: { type: 'local', path: './my-project' },
  agentType: 'claude-code',
  maxIterations: 3,
  maxWallClockSeconds: 3600,
  gatePlanSource: 'auto',
  policies: {
    networkAllowed: false,
    allowedPaths: [],
    forbiddenPatterns: ['**/.env'],
  },
});
```

## Gate Plan Configuration

Create a `verify.yaml` in your project root:

```yaml
version: "1"

environment:
  runtime: node
  runtimeVersion: "20"
  setupCommands:
    - name: install
      command: pnpm install
      timeout: 300

contracts:
  requiredFiles:
    - package.json
    - src/index.ts
  forbiddenPatterns:
    - "**/.env"
    - "**/secrets/**"

tests:
  - name: typecheck
    command: pnpm typecheck
    timeout: 120
  - name: lint
    command: pnpm lint
    timeout: 60
  - name: test
    command: pnpm test
    timeout: 300

policy:
  networkAllowed: false
  maxRuntimeSeconds: 600
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build
```

## Architecture

```
src/
├── agent/           # Agent drivers (Claude Code, OpenCode)
├── artifacts/       # Run artifact storage
├── control-plane/   # CLI and work order management
├── feedback/        # Feedback generation and formatting
├── gate/            # Gate plan resolution and parsing
├── orchestrator/    # Run execution coordination
├── snapshot/        # Git-based state management
├── types/           # TypeScript type definitions
├── utils/           # Shared utilities
├── verifier/        # L0-L3 verification levels
└── workspace/       # Workspace lifecycle management
```

## License

MIT
