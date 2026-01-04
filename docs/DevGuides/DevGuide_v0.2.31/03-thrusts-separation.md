# Separation Thrusts (Phase 2)

---

## Thrust 4: SaaS Package Migration

### 4.1 Objective

Move SaaS-specific packages (`dashboard`, `web`) from the public repository to the private repository.

### 4.2 Background

The public repository should contain only the core orchestration engine. Customer-facing UI and marketing site belong in the private repo. These packages are:

| Package | Purpose | Destination |
|---------|---------|-------------|
| `packages/dashboard` | Customer UI for managing work orders | `agentgate-internal/packages/dashboard` |
| `packages/web` | Marketing site, Stripe checkout, OAuth | `agentgate-internal/packages/web` |

### 4.3 Subtasks

#### 4.3.1 Copy Dashboard Package

```bash
# From public to private
cp -r ~/repos/agentgate/packages/dashboard ~/repos/agentgate-internal/packages/

# Update workspace
cd ~/repos/agentgate-internal
# Edit pnpm-workspace.yaml if needed (already includes packages/*)
```

#### 4.3.2 Update Dashboard Dependencies

Edit `packages/dashboard/package.json`:

```json
{
  "name": "@agentgate-internal/dashboard",
  "dependencies": {
    "@agentgate/shared": "^0.2.31",
    // Keep existing UI dependencies
  }
}
```

Update imports in dashboard source files:
- Replace `../server/` with `@agentgate/server`
- Replace `../shared/` with `@agentgate/shared`

#### 4.3.3 Copy Web Package

```bash
cp -r ~/repos/agentgate/packages/web ~/repos/agentgate-internal/packages/
```

#### 4.3.4 Update Web Dependencies

Edit `packages/web/package.json`:

```json
{
  "name": "@agentgate-internal/web",
  "dependencies": {
    "@agentgate/shared": "^0.2.31",
    // Keep existing Next.js, Stripe, etc.
  }
}
```

#### 4.3.5 Verify Private Repo Builds

```bash
cd ~/repos/agentgate-internal
pnpm install
pnpm build

# Verify each package
pnpm --filter dashboard build
pnpm --filter web build
```

#### 4.3.6 Create Migration Tag in Public Repo

Before deleting anything from public:

```bash
cd ~/repos/agentgate
git tag pre-split-v0.2.31
git push origin pre-split-v0.2.31
```

### 4.4 Verification Steps

1. Dashboard builds in private repo
2. Web package builds in private repo
3. No broken imports
4. Pre-split tag exists in public repo

### 4.5 Files Created/Modified

**Private Repo:**

| File | Action |
|------|--------|
| `packages/dashboard/*` | Created (copied) |
| `packages/dashboard/package.json` | Modified |
| `packages/web/*` | Created (copied) |
| `packages/web/package.json` | Modified |

---

## Thrust 5: OSS Cleanup

### 5.1 Objective

Remove all SaaS-specific code, packages, and references from the public repository.

### 5.2 Background

After migration, the public repo should be clean of:
- SaaS packages (dashboard, web)
- Credit/billing code (keep only local usage tracking)
- Multi-tenant references
- OAuth/authentication code

### 5.3 Subtasks

#### 5.3.1 Delete Migrated Packages

```bash
cd ~/repos/agentgate

# Remove migrated packages
rm -rf packages/dashboard
rm -rf packages/web

# Update workspace
# Edit pnpm-workspace.yaml to remove references
```

#### 5.3.2 Simplify Billing Module

The billing module in `packages/server/src/billing/` should:

**Keep:**
- `types.ts` - `UsageRecord`, `ModelPricing`, `CostEstimate`
- `cost-calculator.ts` - Token counting and cost calculation
- `usage-store.ts` - Local usage persistence (remove credit methods)
- `usage-service.ts` - Usage recording integration
- API routes for usage viewing

**Remove or Simplify:**
- `CreditBalance` type
- `BudgetAlert` type
- Credit-related methods: `getCreditBalance`, `addCredits`, `deductCredits`
- Budget alert methods

#### 5.3.3 Update Type Definitions

Edit `packages/server/src/billing/types.ts`:

```typescript
// KEEP - Local usage tracking
export interface UsageRecord {
  id: string;
  workOrderId: string;
  runId: string;
  iteration: number;
  timestamp: Date;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  estimatedCost: number;
}

export interface UsageAggregate {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalEstimatedCost: number;
  recordCount: number;
  byModel: Map<string, ModelUsageAggregate>;
}

export interface ModelPricing {
  model: string;
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M?: number;
  cacheCreationPer1M?: number;
}

// REMOVE - SaaS specific
// export interface CreditBalance { ... }
// export interface BudgetAlert { ... }
```

#### 5.3.4 Update Usage Store

Edit `packages/server/src/billing/usage-store.ts`:

Remove methods:
- `getCreditBalance()`
- `setCreditBalance()`
- `addCredits()`
- `deductCredits()`
- `checkBudgetAlerts()`
- `saveAlerts()`

Keep methods:
- `recordUsage()`
- `queryUsage()`
- `getUsageAggregate()`
- `getWorkOrderUsage()`
- `getUsageSummary()`

#### 5.3.5 Update README

Rewrite `README.md` to focus on self-hosted usage:

```markdown
# AgentGate

Open-source AI coding agent orchestrator.

## Quick Start

1. Clone and install:
   ```bash
   git clone https://github.com/org/agentgate.git
   cd agentgate && pnpm install
   ```

2. Configure (uses your Claude subscription):
   ```bash
   cp examples/config.yaml ~/.agentgate/config.yaml
   # Edit config to match your setup
   ```

3. Start server:
   ```bash
   pnpm dev
   ```

4. Submit a work order:
   ```bash
   curl -X POST http://localhost:3001/api/v1/work-orders ...
   ```

## Features

- Work order orchestration
- L0-L3 verification gates
- Sandbox isolation (Docker/subprocess)
- Local usage tracking
- Crash recovery via WAL

## Documentation

- [Architecture](./docs/architecture.md)
- [Configuration](./docs/configuration.md)
- [API Reference](./docs/api.md)
```

#### 5.3.6 Update CLAUDE.md

Remove SaaS-specific sections from CLAUDE.md:
- Remove billing module details (except usage tracking)
- Remove dashboard/web package references
- Update safe zones list
- Focus on core orchestration

#### 5.3.7 Search and Replace

Run comprehensive search for SaaS terms:

```bash
# Find SaaS references (should return minimal results after cleanup)
grep -r "credits" packages/ --include="*.ts" | grep -v test | grep -v node_modules
grep -r "CreditBalance" packages/
grep -r "saas" packages/ --include="*.ts" -i
grep -r "multi-tenant" packages/ -i
grep -r "BudgetAlert" packages/
```

### 5.4 Verification Steps

1. `pnpm install` completes (no dashboard/web deps)
2. `pnpm typecheck` passes
3. `pnpm test` passes
4. `pnpm build` succeeds
5. No SaaS references in grep results
6. Server starts and health check passes
7. Usage API endpoints work

### 5.5 Files Modified/Deleted

| File | Action |
|------|--------|
| `packages/dashboard/*` | Deleted |
| `packages/web/*` | Deleted |
| `packages/server/src/billing/types.ts` | Modified |
| `packages/server/src/billing/usage-store.ts` | Modified |
| `pnpm-workspace.yaml` | Modified |
| `README.md` | Rewritten |
| `CLAUDE.md` | Modified |

---

## Thrust 6: TUI Simplification

### 6.1 Objective

Simplify the Terminal UI to focus on local self-hosted usage, removing all SaaS/credit-related features.

### 6.2 Background

The TUI should provide a streamlined experience for self-hosted users:
- Submit and monitor work orders
- View local usage statistics (tokens, costs)
- Configure local settings

It should NOT include:
- Login/authentication
- Credit balance management
- API key generation (for SaaS)
- Team/organization features

### 6.3 Subtasks

#### 6.3.1 Audit TUI Components

Review `packages/tui/src/` for SaaS-related code:

| Component | Action |
|-----------|--------|
| Login screen | Remove |
| Credit display | Remove |
| Buy credits button | Remove |
| API key management | Remove |
| Usage display | Keep (show tokens/cost) |
| Work order submission | Keep |
| Run monitoring | Keep |
| Settings | Simplify (local config only) |

#### 6.3.2 Remove Authentication Components

```bash
# Files to remove or stub
packages/tui/src/screens/login.tsx
packages/tui/src/store/auth.ts
packages/tui/src/api/auth.ts
```

Replace with simple local mode:

```typescript
// packages/tui/src/config/mode.ts
export const MODE = 'local';

// No authentication needed - uses local config
export function isAuthenticated(): boolean {
  return true; // Always authenticated in local mode
}
```

#### 6.3.3 Update Usage Display

Change terminology from "credits" to "usage":

```typescript
// Before
<Text>Credit Balance: {credits} credits</Text>
<Button>Buy Credits</Button>

// After
<Text>Estimated Cost: ${estimatedCost.toFixed(4)}</Text>
<Text>Tokens Used: {totalTokens.toLocaleString()}</Text>
```

#### 6.3.4 Simplify Menu Structure

```typescript
// packages/tui/src/config/menu.ts
export const menuItems = [
  { label: 'Submit Work Order', screen: 'submit' },
  { label: 'View Runs', screen: 'runs' },
  { label: 'Usage Statistics', screen: 'usage' },
  { label: 'Settings', screen: 'settings' },
  { label: 'Exit', action: 'exit' },
];

// Removed: Login, Credits, API Keys, Organization
```

#### 6.3.5 Update Help Text

Replace all SaaS terminology:

| Before | After |
|--------|-------|
| "Purchase credits" | (remove) |
| "Your credit balance" | "Your usage statistics" |
| "credits remaining" | "estimated cost so far" |
| "Sign in" | (remove) |
| "Your plan" | "Your configuration" |

#### 6.3.6 Test TUI Locally

```bash
cd ~/repos/agentgate/packages/tui
pnpm dev

# Verify:
# - No login screen appears
# - Main menu shows simplified options
# - Usage screen shows tokens/costs (not credits)
# - Work order submission works
```

### 6.4 Verification Steps

1. TUI builds successfully
2. Starts without login prompt
3. No "credits" text anywhere in UI
4. Usage displays tokens and estimated cost
5. Work order submission works
6. Run monitoring works

### 6.5 Files Modified/Deleted

| File | Action |
|------|--------|
| `packages/tui/src/screens/login.tsx` | Deleted |
| `packages/tui/src/components/credit-display.tsx` | Deleted |
| `packages/tui/src/components/usage-display.tsx` | Modified |
| `packages/tui/src/store/auth.ts` | Removed or stubbed |
| `packages/tui/src/config/menu.ts` | Modified |
| `packages/tui/src/config/mode.ts` | Created |
| `packages/tui/src/constants/text.ts` | Modified |

---

## Phase 2 Summary

After completing Phase 2, you have:

```
PUBLIC REPO (agentgate)              PRIVATE REPO (agentgate-internal)
├── packages/                        ├── packages/
│   ├── server/     # Core engine    │   ├── saas-server/   # Extended
│   ├── shared/     # Types          │   ├── dashboard/     # Migrated
│   └── tui/        # Simplified     │   └── web/           # Migrated
│                                    │
├── No SaaS code                     ├── All SaaS features
├── Local usage tracking             ├── Credit-based billing
└── Self-hosted ready                └── Multi-tenant ready
```

**Capabilities Unlocked:**
- Public repo works standalone (clone, install, run)
- Private repo extends public with SaaS features
- Clear separation of concerns
- Independent release cycles possible

**Next Phase:** Production Deployment (Thrusts 7-9)
