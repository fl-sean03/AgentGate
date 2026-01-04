# Overview: Workshop & Storefront Architecture

---

## The Core Model

Development and production are completely separate environments with different purposes:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  WORKSHOP (Laptop - WSL)              STOREFRONT (Home Server - Dell)   │
│  ════════════════════════             ═══════════════════════════════   │
│                                                                         │
│  Purpose: Build and test              Purpose: Run production           │
│                                                                         │
│  ┌─────────────────────┐              ┌─────────────────────┐          │
│  │ ~/repos/agentgate   │              │                     │          │
│  │ (OSS - cloned)      │───push───────│    GitHub           │          │
│  └─────────────────────┘      │       │    (source of       │          │
│                               │       │     truth)          │          │
│  ┌─────────────────────┐      │       │                     │          │
│  │ ~/repos/agentgate-  │──────┘       └──────────┬──────────┘          │
│  │ internal (Private)  │                         │                      │
│  └─────────────────────┘                         │ pull                 │
│                                                  ▼                      │
│  Activities:                          ┌─────────────────────┐          │
│  • Edit code                          │ /opt/agentgate/     │          │
│  • Run tests                          │ Docker containers   │          │
│  • Start local server                 │ Always running      │          │
│  • Debug with live logs               │ Serves users        │          │
│  • Submit test work orders            └─────────────────────┘          │
│                                                                         │
│  You are here: Claude Code            Operator: Another person or       │
│  running in this environment          automated deploy system           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Why This Separation?

### Workshop (Laptop)

| Benefit | Description |
|---------|-------------|
| **Fast iteration** | Edit → test → see results in seconds |
| **Full visibility** | Logs stream directly to your terminal |
| **No dependencies** | Works even if home server is offline |
| **Direct debugging** | Add console.logs, breakpoints, whatever you need |
| **Both repos accessible** | Can test OSS and Internal together |

### Storefront (Home Server)

| Benefit | Description |
|---------|-------------|
| **Always on** | Runs 24/7 without your laptop |
| **Production-like** | Docker containers, proper isolation |
| **Stable** | Only runs tested, pushed code |
| **Serves users** | External access if needed |
| **Automated** | Can auto-update, auto-restart |

---

## Repository Architecture

### Public Repository: `agentgate`

**Location**: GitHub (public), cloned to laptop

**Purpose**: Open-source AI coding agent orchestrator that anyone can use

**Contents**:
```
agentgate/
├── packages/
│   ├── server/              # Core orchestration engine
│   │   ├── orchestrator/    # State machine, WAL
│   │   ├── execution/       # Work order execution
│   │   ├── verifier/        # L0-L3 verification gates
│   │   ├── sandbox/         # Docker/subprocess isolation
│   │   ├── agent/           # Claude Code drivers
│   │   ├── billing/         # Local usage tracking (simplified)
│   │   └── ...
│   │
│   ├── shared/              # TypeScript types
│   └── tui/                 # Terminal UI (simplified)
│
├── docs/                    # Documentation
├── examples/                # Usage examples
└── .github/workflows/       # OSS CI (tests, lint, npm publish)
```

**Users**: Open-source community, self-hosters using their own API keys

---

### Private Repository: `agentgate-internal`

**Location**: GitHub (private), cloned to laptop, deployed to home server

**Purpose**: SaaS layer + continuous improvement infrastructure

**Contents**:
```
agentgate-internal/
├── packages/
│   ├── saas-server/         # Extended server
│   │   ├── src/
│   │   │   ├── billing/     # Credit-based billing (Stripe)
│   │   │   ├── auth/        # GitHub OAuth, sessions
│   │   │   ├── multi-tenant/# User/org isolation
│   │   │   └── index.ts     # Imports and extends @agentgate/server
│   │   └── package.json     # depends on @agentgate/server
│   │
│   ├── dashboard/           # Customer dashboard (React)
│   ├── web/                 # Marketing site (Next.js)
│   │
│   ├── scheduler/           # (Future) Task queue
│   ├── discovery/           # (Future) Task discovery plugins
│   └── worker/              # (Future) Continuous improvement daemon
│
├── infra/
│   ├── docker/              # Dockerfiles, compose
│   └── scripts/             # Deployment scripts
│
└── .github/workflows/       # Private CI (tests + deploy)
```

**Users**: You (for SaaS), potentially future customers

---

## How They Connect

### Dependency Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  agentgate (OSS)                                                 │
│  ├── Published to npm as @agentgate/server                       │
│  └── Published to npm as @agentgate/shared                       │
│                                                                  │
│                            ▼                                     │
│                                                                  │
│  agentgate-internal (Private)                                    │
│  └── package.json:                                               │
│      {                                                           │
│        "dependencies": {                                         │
│          "@agentgate/server": "^0.3.0",                          │
│          "@agentgate/shared": "^0.3.0"                           │
│        }                                                         │
│      }                                                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Development Flow (Cross-Repo Changes)

When you need to change OSS and test in Internal before publishing:

```
1. Make changes in ~/repos/agentgate/packages/server/

2. Link locally:
   cd ~/repos/agentgate/packages/server && pnpm link --global
   cd ~/repos/agentgate-internal && pnpm link @agentgate/server

3. Test Internal with local OSS changes

4. When working:
   - Push OSS changes, publish to npm
   - Update Internal to use npm version
   - Push Internal changes
```

---

## Development Workflow Detail

### Scenario: Fix a Bug in OSS

```
LAPTOP:

1. Reproduce the bug
   $ cd ~/Workspace/main/43-AgentGate
   $ pnpm dev                    # Start local server
   $ curl localhost:3001/...    # Trigger the bug

2. Find and fix
   $ code packages/server/src/...  # Edit
   $ pnpm test                     # Run tests

3. Verify fix
   $ pnpm dev                      # Restart server
   $ curl localhost:3001/...      # Bug fixed!

4. Push
   $ git add . && git commit -m "fix: ..." && git push

HOME SERVER:

5. Deploy (auto or manual)
   $ cd /opt/agentgate && git pull && docker-compose restart
```

### Scenario: Add Feature to SaaS

```
LAPTOP:

1. Develop the feature
   $ cd ~/Workspace/main/44-AgentGate-Internal
   $ code packages/saas-server/src/...  # Edit
   $ pnpm test                          # Run tests

2. Test locally
   $ pnpm dev                           # Start local SaaS server
   $ curl localhost:3001/...           # Test new endpoint

3. Push when working
   $ git add . && git commit -m "feat: ..." && git push

HOME SERVER:

4. Deploy
   $ cd /opt/agentgate && git pull && docker-compose restart
```

### Scenario: OSS Change Affects Internal

```
LAPTOP:

1. Make OSS change
   $ cd ~/Workspace/main/43-AgentGate
   $ code packages/server/src/...  # Edit core
   $ pnpm test                     # OSS tests pass

2. Link and test Internal
   $ cd ~/Workspace/main/43-AgentGate/packages/server && pnpm link --global
   $ cd ~/Workspace/main/44-AgentGate-Internal && pnpm link @agentgate/server
   $ pnpm test                     # Internal tests pass with linked OSS

3. Push OSS, wait for npm publish
   $ cd ~/Workspace/main/43-AgentGate && git push
   # CI publishes @agentgate/server@0.3.1

4. Update Internal to use published version
   $ cd ~/Workspace/main/44-AgentGate-Internal
   $ pnpm update @agentgate/server
   $ git add . && git commit -m "chore: update agentgate" && git push

HOME SERVER:

5. Deploy Internal with new OSS
   $ cd /opt/agentgate && git pull && docker-compose restart
```

---

## What Changes from Current State

### In Public Repo (agentgate)

| Change | Before | After |
|--------|--------|-------|
| `packages/dashboard/` | Exists | Deleted |
| `packages/web/` | Exists | Deleted |
| `packages/tui/` | Has SaaS features | Simplified for local use |
| `packages/server/src/billing/` | Has credits | Only local usage tracking |
| README | Mixed messaging | Focus on self-hosted |

### In Private Repo (agentgate-internal)

| Change | Before | After |
|--------|--------|-------|
| Repository | Doesn't exist | Created |
| `packages/dashboard/` | - | Migrated from public |
| `packages/web/` | - | Migrated from public |
| `packages/saas-server/` | - | New, extends OSS |

---

## Configuration

### Local Development (Laptop)

```
# ~/.agentgate/config.yaml
server:
  port: 3001
  host: localhost

agentDriver:
  type: claude-code-subscription
  sandbox:
    provider: subprocess

usage:
  trackLocally: true
  displayCosts: true
```

### Production (Home Server)

```
# /opt/agentgate/.env
NODE_ENV=production
PORT=8080

# SaaS features
STRIPE_SECRET_KEY=sk_live_...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
DATABASE_URL=postgres://...

# Core config
AGENTGATE_API_KEY=...
```

---

## Future: Continuous Improvement

Once the foundation is solid, we add automation:

```
┌─────────────────────────────────────────────────────────────────┐
│                    HOME SERVER (Extended)                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     AgentGate SaaS                          │ │
│  │                     (serving users)                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              +                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  Continuous Improvement                     │ │
│  │                                                             │ │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐               │ │
│  │  │Discovery │ → │Scheduler │ → │ Worker   │               │ │
│  │  │          │   │          │   │          │               │ │
│  │  │• Issues  │   │• Queue   │   │• Execute │               │ │
│  │  │• Deps    │   │• Priority│   │• Submit  │               │ │
│  │  │• Tests   │   │• Order   │   │• PRs     │               │ │
│  │  └──────────┘   └──────────┘   └──────────┘               │ │
│  │                                                             │ │
│  │  Result: PRs created automatically for you to review       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

This is Phase 4 (Thrusts 10-12) - not part of initial setup.
