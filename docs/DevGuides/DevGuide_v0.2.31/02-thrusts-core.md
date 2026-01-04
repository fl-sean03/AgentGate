# Core Separation Thrusts

---

## Thrust 1: Private Repository Setup

### 1.1 Objective

Create the `agentgate-internal` private repository with proper structure to receive migrated SaaS components.

### 1.2 Background

The private repository will host all SaaS-specific functionality while importing core orchestration from the public repo. This establishes the foundation for the separation.

### 1.3 Subtasks

#### 1.3.1 Create Repository Structure

Create the private repository with the following structure:

```
agentgate-internal/
├── packages/
│   ├── saas-server/     # Extended server with billing
│   ├── dashboard/       # Migrated from public (placeholder)
│   ├── web/             # Migrated from public (placeholder)
│   ├── billing-service/ # Credit-based billing
│   └── shared-saas/     # SaaS-specific types
├── infra/
│   ├── docker/          # Deployment configs
│   ├── k8s/             # Kubernetes manifests (future)
│   └── terraform/       # Cloud infrastructure (future)
├── docs/
│   ├── deployment.md
│   └── architecture.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

#### 1.3.2 Configure pnpm Workspace

Set up pnpm workspace configuration for the private monorepo.

#### 1.3.3 Set Up TypeScript Configuration

Create base TypeScript configuration that extends the public repo patterns.

#### 1.3.4 Create saas-server Package Foundation

Create the SaaS server package that wraps and extends the public server:
- Import core from public agentgate
- Add billing middleware
- Add multi-tenant context
- Add OAuth routes

#### 1.3.5 Create billing-service Package

Set up the billing service package structure:
- Stripe integration
- Credit management
- Usage limits enforcement
- Subscription handling

### 1.4 Verification Steps

1. Private repository can be cloned and installed with `pnpm install`
2. TypeScript compilation succeeds with `pnpm typecheck`
3. Basic structure matches the specified layout
4. saas-server can import from public agentgate package

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/saas-server/package.json` | Created |
| `packages/saas-server/tsconfig.json` | Created |
| `packages/saas-server/src/index.ts` | Created |
| `packages/billing-service/package.json` | Created |
| `packages/billing-service/tsconfig.json` | Created |
| `packages/billing-service/src/index.ts` | Created |
| `packages/shared-saas/package.json` | Created |
| `packages/shared-saas/src/types.ts` | Created |
| `pnpm-workspace.yaml` | Created |
| `package.json` | Created |
| `tsconfig.json` | Created |

---

## Thrust 2: Core Module Extraction

### 2.1 Objective

Prepare the public repository's server package to be cleanly importable by the private repository.

### 2.2 Background

The public server must export clear interfaces that the private SaaS server can extend without modification.

### 2.3 Subtasks

#### 2.3.1 Define Public API Surface

Create explicit exports in `packages/server/src/index.ts`:
- Core orchestrator class
- Driver interfaces
- Configuration types
- Error types
- Utility functions

#### 2.3.2 Create Extension Points

Design and implement extension points for SaaS to hook into:
- Pre/post execution hooks
- Usage recording callbacks
- Authentication middleware slots
- Custom route registration

#### 2.3.3 Abstract SaaS-Specific Logic

Identify and abstract any code that assumes SaaS context:
- Replace hard-coded billing checks with optional callbacks
- Make user context optional (local mode has no users)
- Remove credit validation from core execution path

#### 2.3.4 Update Package Exports

Ensure `package.json` exports map correctly:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./types": "./dist/types/index.js",
    "./orchestrator": "./dist/orchestrator/index.js",
    "./config": "./dist/config/index.js",
    "./errors": "./dist/errors/index.js"
  }
}
```

### 2.4 Verification Steps

1. `pnpm build` completes successfully
2. All exports are accessible from external package
3. Type definitions are properly generated
4. No SaaS-specific code in core execution path

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/index.ts` | Modified - add explicit exports |
| `packages/server/package.json` | Modified - add exports field |
| `packages/server/src/extensibility/callbacks.ts` | Created - extension points |
| `packages/server/src/types/public-api.ts` | Created - public type exports |

---

## Thrust 3: SaaS Component Identification

### 3.1 Objective

Create a complete audit of all SaaS-specific code in the public repository that must be migrated or removed.

### 3.2 Background

Before migration, we need a definitive list of what is SaaS-specific vs core functionality.

### 3.3 Subtasks

#### 3.3.1 Audit packages/dashboard

Review all files in dashboard package:
- Document all components
- Identify API dependencies
- Note state management patterns
- List external integrations

#### 3.3.2 Audit packages/web

Review all files in web package:
- Document all pages/routes
- Identify Stripe integration points
- Note OAuth implementation
- List environment variables

#### 3.3.3 Audit packages/tui

Review TUI package for SaaS references:
- Credit/balance displays
- Login/auth flows
- API key management
- Billing-related commands

#### 3.3.4 Audit packages/server/src/billing

Review billing module:
- Separate local-only features (usage tracking)
- Identify SaaS-only features (credits, limits)
- Document API endpoints

#### 3.3.5 Create Migration Manifest

Create a comprehensive document listing:
- Files to move (with destination)
- Files to modify (with changes needed)
- Files to delete from public repo
- Files to keep unchanged

### 3.4 Verification Steps

1. Migration manifest document exists
2. All packages have been audited
3. Each file categorized as: keep/move/modify/delete
4. No ambiguous classifications

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `docs/DevGuides/DevGuide_v0.2.31/migration-manifest.md` | Created |
| `docs/DevGuides/DevGuide_v0.2.31/05-appendices.md` | Modified - add inventory |
