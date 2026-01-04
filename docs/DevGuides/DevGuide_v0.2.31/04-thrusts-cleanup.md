# Public Repo Cleanup Thrusts

---

## Thrust 7: Billing Module Refinement

### 7.1 Objective

Refine the billing module to focus solely on local usage tracking, removing credit-based billing features.

### 7.2 Background

The billing module (`packages/server/src/billing/`) currently contains:
- **Keep**: Token counting, cost calculation, usage persistence
- **Remove**: Credit balance, budget alerts, multi-tenant billing

For local users, tracking usage is valuable (they pay their own API bills), but credit management is not relevant.

### 7.3 Subtasks

#### 7.3.1 Simplify Types

Update `billing/types.ts`:
- Keep: `UsageRecord`, `UsageAggregate`, `CostEstimate`, `ModelPricing`
- Remove: `CreditBalance`, `BudgetAlert`
- Simplify: `UsageQueryFilters` (remove userId, billingMethod)

#### 7.3.2 Remove Credit Operations

Update `billing/usage-store.ts`:
- Remove: `getCreditBalance`, `setCreditBalance`, `addCredits`, `deductCredits`
- Remove: `checkBudgetAlerts`, `saveAlerts`, `getAlerts`, `acknowledgeAlert`
- Keep: `recordUsage`, `queryUsage`, `getUsageAggregate`, `getWorkOrderUsage`

#### 7.3.3 Simplify Usage Service

Update `billing/usage-service.ts`:
- Remove billing method parameter (local always uses user's key)
- Remove userId tracking (no multi-tenant)
- Keep all usage recording and querying

#### 7.3.4 Update API Endpoints

Simplify `routes/usage.ts`:
- Keep: `GET /api/v1/usage`, `GET /api/v1/usage/summary`
- Keep: `GET /api/v1/usage/work-orders/:id`
- Remove: Any credit-related endpoints (if any)

#### 7.3.5 Update Module Exports

Update `billing/index.ts`:
- Remove credit-related exports
- Keep usage tracking exports

### 7.4 Verification Steps

1. No references to `CreditBalance` or `BudgetAlert` in billing module
2. Usage recording still works
3. Usage API endpoints return data
4. TypeScript compilation succeeds

### 7.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/billing/types.ts` | Modified - remove credit types |
| `packages/server/src/billing/usage-store.ts` | Modified - remove credit operations |
| `packages/server/src/billing/usage-service.ts` | Modified - simplify |
| `packages/server/src/billing/index.ts` | Modified - update exports |
| `packages/server/src/server/routes/usage.ts` | Modified - simplify |

---

## Thrust 8: Public Repo Cleanup

### 8.1 Objective

Remove all SaaS references from documentation, configuration, and remaining code in the public repository.

### 8.2 Background

After migrating SaaS packages and simplifying the billing module, we need to ensure no SaaS language or references remain that would confuse open-source users.

### 8.3 Subtasks

#### 8.3.1 Update README

Rewrite the main README.md to focus on:
- Self-hosted installation
- Using your own API keys/subscriptions
- Local usage tracking
- Contributing to the core

Remove:
- SaaS signup links
- Credit/billing information
- Dashboard screenshots
- Pricing information

#### 8.3.2 Update CLAUDE.md

Ensure AI agent context is accurate:
- Remove SaaS deployment instructions
- Focus on core architecture
- Update module descriptions
- Remove billing-related safe zones

#### 8.3.3 Update Configuration Examples

Update example configurations:
- Remove multi-tenant settings
- Remove billing configuration
- Focus on local setup
- Show API key configuration

#### 8.3.4 Update Package Descriptions

Update `package.json` files:
- Remove SaaS-related keywords
- Update descriptions to reflect OSS nature
- Remove references to migrated packages

#### 8.3.5 Search and Replace

Perform comprehensive search for SaaS-related terms:
- "credits" (in billing context)
- "subscription" (in SaaS context, not Claude subscription)
- "plan" (in pricing context)
- "quota"
- "limit" (in billing context)
- "saas"
- "billing" (where credit-related)

#### 8.3.6 Update DevGuide README

Update `docs/DevGuides/README.md`:
- Remove SaaS DevGuides from active list
- Move to "Migrated to Private Repo" section
- Update version history

### 8.4 Verification Steps

1. `grep -r "credits" packages/` returns no billing-related results
2. README focuses on self-hosted usage
3. No broken links to migrated packages
4. All example configs work for local setup

### 8.5 Files Created/Modified

| File | Action |
|------|--------|
| `README.md` | Modified - rewrite for OSS |
| `CLAUDE.md` | Modified - update for core only |
| `packages/server/CLAUDE.md` | Modified - remove SaaS |
| `packages/server/package.json` | Modified - update description |
| `docs/DevGuides/README.md` | Modified - update list |
| `examples/*` | Modified - local configs only |

---

## Thrust 9: CI/CD Separation

### 9.1 Objective

Configure independent CI/CD pipelines for the public and private repositories.

### 9.2 Background

The repositories need separate CI configurations:
- **Public**: Standard OSS CI (tests, lint, build)
- **Private**: Extended CI with deployment (tests, lint, build, deploy)

### 9.3 Subtasks

#### 9.3.1 Update Public Repo CI

Simplify `.github/workflows/` for public repo:
- Keep: Unit tests, integration tests, linting
- Keep: Build verification
- Remove: Any SaaS deployment steps
- Remove: Any secret-dependent steps

#### 9.3.2 Create Private Repo CI

Set up CI in private repo:
- Tests for all packages
- Build verification
- Staging deployment
- Production deployment (manual trigger)
- Integration with private dependencies

#### 9.3.3 Configure Dependency Sync

Set up automation to track public repo updates:
- GitHub Action to check for new releases
- Automated PR creation for updates
- Integration test suite

#### 9.3.4 Update Release Process

**Public Repo:**
- Standard semantic versioning
- npm publish for server/shared packages
- GitHub releases with changelogs

**Private Repo:**
- Internal versioning
- Docker image publishing
- Deployment to cloud infrastructure

### 9.4 Verification Steps

1. Public CI runs on PRs without secrets
2. Public releases publish to npm
3. Private CI detects public updates
4. Private deployment pipeline works

### 9.5 Files Created/Modified

**Public Repo:**

| File | Action |
|------|--------|
| `.github/workflows/ci.yml` | Modified - simplify |
| `.github/workflows/release.yml` | Modified - OSS release |

**Private Repo:**

| File | Action |
|------|--------|
| `.github/workflows/ci.yml` | Created |
| `.github/workflows/deploy-staging.yml` | Created |
| `.github/workflows/deploy-production.yml` | Created |
| `.github/workflows/sync-public.yml` | Created |
