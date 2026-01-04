# Component Migration Thrusts

---

## Thrust 4: Dashboard Migration

### 4.1 Objective

Move the entire `packages/dashboard` package from public to private repository.

### 4.2 Background

The dashboard is a React application providing customer-facing UI for:
- Work order management
- Run monitoring
- Usage visualization
- Team/org management

All of these are SaaS features not needed for local self-hosted use.

### 4.3 Subtasks

#### 4.3.1 Copy Dashboard Package

Copy the entire `packages/dashboard` directory to the private repository at `packages/dashboard/`.

#### 4.3.2 Update Import Paths

Update imports to reference the core package from npm:
- Replace relative imports to `../server/` with `@agentgate/server`
- Update shared types imports to use `@agentgate/shared`

#### 4.3.3 Add SaaS-Specific Features

Enhance the dashboard with SaaS-specific functionality:
- Add billing/usage page
- Add organization management
- Add API key management UI
- Add subscription status display

#### 4.3.4 Update Build Configuration

Configure Vite/build to work within the private monorepo:
- Update vite.config.ts paths
- Update tsconfig.json references
- Configure environment variables for SaaS

#### 4.3.5 Remove from Public Repo

Delete the `packages/dashboard` directory from public repository.

### 4.4 Verification Steps

1. Dashboard builds successfully in private repo: `pnpm build`
2. Dashboard connects to saas-server correctly
3. All pages render without errors
4. Public repo builds without dashboard

### 4.5 Files Created/Modified

**Private Repo:**

| File | Action |
|------|--------|
| `packages/dashboard/*` | Created (copied from public) |
| `packages/dashboard/package.json` | Modified - update deps |
| `packages/dashboard/tsconfig.json` | Modified - update paths |

**Public Repo:**

| File | Action |
|------|--------|
| `packages/dashboard/*` | Deleted |
| `pnpm-workspace.yaml` | Modified - remove dashboard |
| `package.json` | Modified - remove dashboard scripts |

---

## Thrust 5: SaaS Website Migration

### 5.1 Objective

Move the entire `packages/web` package from public to private repository.

### 5.2 Background

The web package is a Next.js application providing:
- Marketing/landing pages
- Stripe checkout integration
- GitHub OAuth authentication
- Account management
- Documentation portal

All SaaS-specific, not needed for self-hosted users.

### 5.3 Subtasks

#### 5.3.1 Copy Web Package

Copy the entire `packages/web` directory to the private repository at `packages/web/`.

#### 5.3.2 Update Environment Configuration

Update environment variables for SaaS deployment:
- Stripe keys
- GitHub OAuth credentials
- Database connection strings
- API endpoints

#### 5.3.3 Integrate with SaaS Server

Connect the web package to the saas-server for API calls:
- Update API base URLs
- Add authentication headers
- Configure session management

#### 5.3.4 Update Dependencies

Update package dependencies to reference private packages:
- `@agentgate-internal/billing-service`
- `@agentgate-internal/shared-saas`

#### 5.3.5 Remove from Public Repo

Delete the `packages/web` directory from public repository.

### 5.4 Verification Steps

1. Web package builds successfully: `pnpm build`
2. Stripe integration works in test mode
3. GitHub OAuth flow completes
4. API calls to saas-server succeed
5. Public repo builds without web

### 5.5 Files Created/Modified

**Private Repo:**

| File | Action |
|------|--------|
| `packages/web/*` | Created (copied from public) |
| `packages/web/package.json` | Modified - update deps |
| `packages/web/.env.example` | Modified - add SaaS vars |

**Public Repo:**

| File | Action |
|------|--------|
| `packages/web/*` | Deleted |
| `pnpm-workspace.yaml` | Modified - remove web |

---

## Thrust 6: TUI De-SaaS-ification

### 6.1 Objective

Update the Terminal UI (TUI) to remove all SaaS/credit-related features while preserving core functionality.

### 6.2 Background

The TUI was designed with both local and SaaS usage in mind. For the public repo, we need to:
- Remove credit balance displays
- Remove login/authentication flows
- Remove API key management
- Keep work order submission
- Keep run monitoring
- Keep local usage/cost display

### 6.3 Subtasks

#### 6.3.1 Audit TUI Components

Review all TUI components and screens:
- Identify credit/billing-related code
- Identify auth/login-related code
- Document what to remove vs keep

#### 6.3.2 Remove Authentication Flow

Remove or stub out authentication-related screens:
- Login screen
- OAuth callback handling
- Session management
- API key input

For local use, the TUI assumes the user has already configured their credentials in `~/.claude/`.

#### 6.3.3 Remove Credit Display

Remove all credit-related UI elements:
- Credit balance display
- "Buy Credits" buttons
- Usage quota warnings
- Billing-related menu items

#### 6.3.4 Preserve Local Usage Display

Keep the local usage tracking features:
- Token count displays
- Cost estimation
- Per-model breakdown
- Historical usage (local storage)

Change wording from "credits" to "estimated cost" or "tokens used".

#### 6.3.5 Update Menu Structure

Simplify the menu to focus on core features:
- Submit Work Order
- View Runs
- Usage Statistics (local)
- Settings (local config only)

#### 6.3.6 Update Help Text

Revise all help text and tooltips to reflect local-only operation:
- Remove mentions of credits
- Remove mentions of subscriptions (the SaaS subscription, not Claude subscription)
- Focus on self-hosted usage

### 6.4 Verification Steps

1. TUI builds successfully: `pnpm build`
2. No references to "credits" or SaaS billing in UI
3. Work order submission still works
4. Run monitoring still works
5. Local usage display shows token counts

### 6.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/tui/src/screens/login.tsx` | Deleted or stubbed |
| `packages/tui/src/components/credit-display.tsx` | Deleted |
| `packages/tui/src/components/usage-display.tsx` | Modified - local only |
| `packages/tui/src/store/auth.ts` | Simplified or removed |
| `packages/tui/src/config/menu.ts` | Modified - simplified |
| `packages/tui/src/constants/text.ts` | Modified - remove SaaS text |
