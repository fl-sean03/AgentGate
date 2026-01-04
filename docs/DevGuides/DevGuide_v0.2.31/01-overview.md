# Overview: OSS/SaaS Repository Split

---

## Current State

AgentGate currently exists as a single monorepo containing:

```
packages/
├── server/          # Core orchestration (OSS-appropriate)
├── dashboard/       # React dashboard (SaaS-focused)
├── web/             # Next.js SaaS website (Stripe, OAuth)
├── tui/             # Terminal UI (mixed - has credit references)
├── shared/          # Shared types (OSS-appropriate)
└── ...
```

### Problems with Current State

1. **User confusion**: Open-source users see SaaS features they can't use
2. **Security exposure**: SaaS infrastructure code is public
3. **Bloated installation**: Users download code they don't need
4. **Mixed messaging**: README talks about credits when users use own keys
5. **Contribution friction**: Contributors unsure what's public vs internal

---

## Target State

### Public Repository: `agentgate` (Open Source)

Purpose: Community-usable AI coding agent orchestrator

```
packages/
├── server/          # Core orchestration engine
├── tui/             # Terminal UI (simplified, no credits)
├── shared/          # Shared TypeScript types
└── ...

Features:
- Work order submission and execution
- Verification gates (L0-L3)
- Sandbox isolation
- Local usage tracking (user's own costs)
- GitHub integration
- Session resume
```

### Private Repository: `agentgate-internal` (SaaS)

Purpose: Production SaaS deployment infrastructure

```
packages/
├── core/            # -> imports from public agentgate
├── saas-server/     # Extended server with billing
├── dashboard/       # Customer dashboard (migrated)
├── web/             # SaaS website (migrated)
├── billing/         # Credit-based billing system
└── infra/           # Deployment, monitoring, etc.

Features:
- Everything from public repo
- Credit-based billing
- Multi-tenant isolation
- Customer dashboard
- Stripe integration
- GitHub OAuth
- Usage limits and quotas
```

---

## Architecture Decision: Import vs Fork

**Decision**: Private repo imports public as dependency

Rationale:
1. Single source of truth for core functionality
2. Bug fixes in core automatically available to SaaS
3. Clear separation of concerns
4. Community contributions go to the right place

Implementation:
```json
// agentgate-internal/package.json
{
  "dependencies": {
    "@agentgate/server": "npm:agentgate@latest",
    "@agentgate/shared": "npm:agentgate-shared@latest"
  }
}
```

---

## What Stays in Public Repo

### Keep: Core Orchestration (`packages/server/`)

| Module | Rationale |
|--------|-----------|
| `orchestrator/` | Core state machine, WAL |
| `execution/` | Execution engine, phases |
| `verifier/` | L0-L3 verification |
| `sandbox/` | Docker/subprocess isolation |
| `delivery/` | Git operations, PR creation |
| `agent/` | Agent drivers |
| `config/` | Configuration system |
| `errors/` | Error framework |
| `gate/` | Gate runners |
| `queue/` | Execution queue |

### Keep: Usage Tracking (Modified)

| What | Keep | Remove |
|------|------|--------|
| Token counting | Yes | - |
| Cost calculation | Yes | - |
| Usage persistence | Yes (local) | Multi-tenant |
| Credit balance | - | Yes |
| Budget alerts | - | Yes |
| User/org billing | - | Yes |

### Keep: Terminal UI (Modified)

| Feature | Keep | Remove |
|---------|------|--------|
| Work order submission | Yes | - |
| Run monitoring | Yes | - |
| Usage display | Yes (local costs) | Credit balance |
| Login/OAuth | - | Yes (SaaS) |
| API key input | - | Yes (SaaS) |

---

## What Moves to Private Repo

### Move: Dashboard (`packages/dashboard/`)

Entire package is SaaS-focused:
- Customer usage views
- Billing management
- Team/org management
- API key management

### Move: SaaS Website (`packages/web/`)

Entire package is SaaS infrastructure:
- Marketing pages
- Pricing/plans
- Stripe checkout
- GitHub OAuth
- Account management

### Move: SaaS Billing Logic

From `packages/server/src/billing/`:
- `CreditBalance` type and operations
- `BudgetAlert` system
- Multi-tenant usage queries
- User-based billing method

---

## Configuration Strategy

### Public Repo Config

```yaml
# ~/.agentgate/config.yaml (user's machine)
agentDriver:
  type: claude-code-subscription  # or api-key
  sandbox:
    provider: subprocess
usage:
  trackLocally: true  # Local cost tracking
  displayCosts: true  # Show in TUI
```

### Private Repo Config (extends public)

```yaml
# SaaS deployment config
extends: "@agentgate/server/config"
billing:
  enabled: true
  provider: stripe
  creditsPerDollar: 100
multiTenant:
  enabled: true
  isolation: strict
```

---

## Migration Strategy

### Phase 1: Preparation

1. Create private repo with proper structure
2. Define clear interfaces between core and SaaS
3. Add feature flags for SaaS-specific code

### Phase 2: Migration

4. Copy dashboard package to private repo
5. Copy web package to private repo
6. Extract SaaS billing from server to private repo

### Phase 3: Cleanup

7. Remove SaaS packages from public repo
8. Update TUI to remove credit references
9. Refine billing module for local-only use
10. Update all documentation

---

## API Compatibility

### Public API (Preserved)

```
POST /api/v1/work-orders     # Submit work order
GET  /api/v1/work-orders/:id # Get work order
GET  /api/v1/runs/:id        # Get run details
GET  /api/v1/usage/summary   # Local usage stats
```

### SaaS API (Private Repo Only)

```
POST /api/v1/credits/purchase  # Buy credits
GET  /api/v1/billing/usage     # Billing usage
GET  /api/v1/organization      # Org management
POST /api/v1/auth/github       # OAuth
```

---

## Documentation Updates Needed

### Public Repo

- README: Focus on self-hosted usage
- Installation: Just core packages
- Configuration: Local API keys only
- Contributing: Core orchestration focus

### Private Repo

- Deployment guide
- SaaS architecture
- Billing integration
- Multi-tenant setup
