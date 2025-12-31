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

## GitHub Integration (v0.2.4)

AgentGate supports GitHub-backed workspaces, where every workspace is connected to a GitHub repository. This enables:

- **Branch-per-run workflow**: Agent changes are isolated on `agentgate/<run-id>` branches
- **Automatic PR creation**: PRs are created automatically when verification passes
- **Full audit trail**: Every iteration is committed and pushed to GitHub
- **User collaboration**: Users can work locally on the same repo

### GitHub Setup

1. **Create a Personal Access Token (PAT)**:
   - Go to GitHub Settings > Developer settings > Personal access tokens
   - Generate new token (classic)
   - Select scope: `repo` (full repository access)
   - Copy the token

2. **Configure AgentGate**:
   ```bash
   # Set via environment variable (recommended)
   export AGENTGATE_GITHUB_TOKEN=ghp_your_token_here

   # Or use the auth command
   agentgate auth github --token ghp_your_token_here

   # Verify authentication
   agentgate auth github --status
   ```

### GitHub CLI Usage

```bash
# Use an existing GitHub repository
agentgate submit --prompt "Fix the login bug" --github owner/repo

# Create a new public repository
agentgate submit --prompt "Create a REST API" --github-new owner/new-repo

# Create a new private repository with TypeScript template
agentgate submit --prompt "Build internal tool" --github-new owner/new-repo --private --template typescript
```

### GitHub Workflow

1. AgentGate clones or creates the repository
2. Creates branch `agentgate/<run-id>`
3. Agent makes changes, each iteration is committed and pushed
4. Verification runs after each iteration
5. When verification passes, a PR is automatically created
6. User reviews and merges the PR

## CLI Usage

```bash
# Submit a work order (local path)
agentgate submit --prompt "Build a REST API" --path ./my-project

# Submit with GitHub (existing repo)
agentgate submit --prompt "Fix bug" --github owner/repo

# Submit with GitHub (new repo)
agentgate submit --prompt "Create API" --github-new owner/repo --private

# List work orders
agentgate list

# Check status
agentgate status <work-order-id>

# Cancel a work order
agentgate cancel <work-order-id>

# Manage GitHub authentication
agentgate auth github --status
agentgate auth github --token <token>
agentgate auth github --clear
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

## Troubleshooting

### GitHub Issues

| Error | Solution |
|-------|----------|
| `GitHub token not configured` | Run `agentgate auth github --token <token>` or set `AGENTGATE_GITHUB_TOKEN` |
| `Invalid GitHub token` | Token may be expired - create a new one at GitHub Settings |
| `Repository not found` | Check owner/repo spelling and token permissions |
| `Permission denied` | Ensure token has `repo` scope |
| `Push rejected` | Pull latest changes first, resolve any conflicts |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENTGATE_GITHUB_TOKEN` | GitHub Personal Access Token (required for GitHub features) |
| `ANTHROPIC_API_KEY` | API key for Claude Code agent |

## License

MIT
