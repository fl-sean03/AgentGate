# 05: Settings - GitHub, API Keys, Run History

This document covers Thrusts 9-10, implementing settings and run history pages.

---

## Thrust 9: Settings Pages

### 9.1 Objective

Create settings pages for GitHub connection, API keys, and profile.

### 9.2 Background

Settings pages allow users to:
- Manage GitHub repository access
- Create and revoke API keys
- Update profile information

### 9.3 Subtasks

#### 9.3.1 Create Settings Layout

Navigation for settings pages.

**Files to create:**
- `packages/web/app/(account)/settings/layout.tsx` - Settings layout

**Dog Food Work Order:**
```
Create settings layout at packages/web/app/(account)/settings/layout.tsx:

Simple layout with:
- "Settings" heading
- Tab navigation or sidebar:
  - GitHub (default)
  - API Keys
  - Profile
- Content area for child pages

Use:
- Tabs component from shadcn/ui
- Or simple nav links with active state
- Responsive: stack on mobile
```

#### 9.3.2 Create GitHub Settings Page

Manage GitHub connection.

**Files to create:**
- `packages/web/app/(account)/settings/github/page.tsx` - GitHub settings
- `packages/web/components/account/github-connection.tsx` - Connection display

**Dog Food Work Order:**
```
Create GitHub settings:

1. components/account/github-connection.tsx:
   - Show connected GitHub account (@username)
   - Show avatar and name
   - "Reconnect" button (re-auth with GitHub)
   - "Disconnect" button (with confirmation)
   - If not connected: "Connect GitHub" button

2. app/(account)/settings/github/page.tsx:
   - Fetch user's GitHub connection status
   - Display GitHubConnection component
   - Info about what GitHub access provides:
     - "AgentGate can access your repositories to make changes"
     - "Repository selection is managed on GitHub"
   - Link to GitHub App settings

Actions:
- Connect → redirect to GitHub OAuth
- Reconnect → redirect to GitHub OAuth (re-consent)
- Disconnect → confirmation → API call to clear token
```

#### 9.3.3 Create API Keys Page

Manage API keys.

**Files to create:**
- `packages/web/app/(account)/settings/api-keys/page.tsx` - API keys page
- `packages/web/components/account/api-key-card.tsx` - Key display
- `packages/web/components/account/create-key-dialog.tsx` - Create dialog
- `packages/web/app/api/user/api-keys/route.ts` - API endpoints

**Dog Food Work Order:**
```
Create API keys management:

1. app/api/user/api-keys/route.ts:
   - GET: list user's API keys (masked)
   - POST: create new key (return full key once)
   - DELETE: revoke key by ID

2. components/account/api-key-card.tsx:
   - Key name
   - Masked key (ag_live_****abcd)
   - Created date
   - Last used date
   - "Copy" button (if just created)
   - "Revoke" button with confirmation

3. components/account/create-key-dialog.tsx:
   - Dialog/modal form
   - Key name input
   - "Create Key" button
   - Show full key after creation (only time visible)
   - Warning: "Save this key - you won't see it again"

4. app/(account)/settings/api-keys/page.tsx:
   - List of API keys
   - "Create New Key" button
   - Empty state: "No API keys yet"
   - Usage instructions

Security:
- Keys are hashed in database
- Full key shown only on creation
- Prefix keys: ag_live_, ag_test_
```

#### 9.3.4 Create Profile Page

Basic profile settings.

**Files to create:**
- `packages/web/app/(account)/settings/profile/page.tsx` - Profile settings
- `packages/web/app/api/user/settings/route.ts` - Settings API

**Dog Food Work Order:**
```
Create profile settings:

1. app/api/user/settings/route.ts:
   - GET: get user settings
   - PATCH: update user settings

2. app/(account)/settings/profile/page.tsx:
   - Display name (from GitHub, read-only)
   - Email (from GitHub, read-only)
   - Avatar (from GitHub, read-only)

   Preferences:
   - Default max iterations (2-10)
   - Email notifications on run complete (toggle)

   Account:
   - "Delete Account" button (with serious confirmation)

Keep it minimal - most settings come from GitHub.
```

### 9.4 Verification Steps

1. GitHub connection displays status
2. Connect/Reconnect redirects to OAuth
3. Disconnect clears GitHub token
4. API keys can be created
5. Full key shown only on creation
6. Keys can be revoked
7. Profile settings can be updated

### 9.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/web/app/(account)/settings/layout.tsx` | Created | Settings layout |
| `packages/web/app/(account)/settings/github/page.tsx` | Created | GitHub settings |
| `packages/web/app/(account)/settings/api-keys/page.tsx` | Created | API keys page |
| `packages/web/app/(account)/settings/profile/page.tsx` | Created | Profile page |
| `packages/web/components/account/github-connection.tsx` | Created | GitHub display |
| `packages/web/components/account/api-key-card.tsx` | Created | Key card |
| `packages/web/components/account/create-key-dialog.tsx` | Created | Create dialog |
| `packages/web/app/api/user/api-keys/route.ts` | Created | Keys API |
| `packages/web/app/api/user/settings/route.ts` | Created | Settings API |

---

## Thrust 10: Run History

### 10.1 Objective

Create a simple run history page for viewing past runs.

### 10.2 Background

Users may want to:
- See their run history
- Find PR links from past runs
- Understand why runs failed

This is a simple list view, not a full monitoring dashboard (that's what the TUI is for).

### 10.3 Subtasks

#### 10.3.1 Create Run List Component

Display runs in a table.

**Files to create:**
- `packages/web/components/account/run-list.tsx` - Run table

**Dog Food Work Order:**
```
Create RunList component in packages/web/components/account/run-list.tsx:

Table with columns:
- Status (icon: ✓ ● ✗)
- Repository (owner/repo)
- Task (truncated)
- Duration
- Created (relative time)
- PR (link if available)

Props:
- runs: array of run objects

Features:
- Sortable by date
- Click row to expand/view details
- Status filter tabs: All, Running, Succeeded, Failed
- Simple pagination (prev/next)

Use Table component from shadcn/ui.
```

#### 10.3.2 Create Run Detail View

Show run details.

**Files to create:**
- `packages/web/components/account/run-detail.tsx` - Run detail

**Dog Food Work Order:**
```
Create RunDetail component in packages/web/components/account/run-detail.tsx:

Display (in a slide-over or modal):
- Status with icon
- Repository and full task prompt
- Timing: started, completed, duration
- Iterations used
- Verification results (L0-L3)
- PR link (if succeeded)
- Error details (if failed)

Props:
- run: run object with full details

Use:
- Sheet or Dialog component
- Color-coded verification results
- "Open PR" button if available
```

#### 10.3.3 Create Runs Page

Assemble runs page.

**Files to create:**
- `packages/web/app/(account)/runs/page.tsx` - Runs page

**Dog Food Work Order:**
```
Create runs page at packages/web/app/(account)/runs/page.tsx:

Server Component that:
1. Fetches user's runs from AgentGate API
2. Supports pagination (20 per page)
3. Supports status filter via query param

Structure:
- "Run History" heading
- Status filter tabs
- RunList component
- Pagination controls
- Empty state: "No runs yet. Use the TUI to submit your first task!"

Click on run opens RunDetail in side panel.
```

#### 10.3.4 Create API Proxy for Runs

Proxy requests to AgentGate API.

**Files to create:**
- `packages/web/app/api/runs/route.ts` - Runs proxy

**Dog Food Work Order:**
```
Create runs API proxy at packages/web/app/api/runs/route.ts:

GET handler:
- Require authentication
- Get user's API key from database
- Forward request to AgentGate API:
  GET {AGENTGATE_API_URL}/api/v1/runs
- Include user's API key in Authorization header
- Return response

Query params:
- status: filter by status
- limit: pagination limit
- offset: pagination offset

This proxies requests so the browser doesn't need the API key.
```

### 10.4 Verification Steps

1. Runs page lists runs
2. Status filter works
3. Pagination works
4. Click opens detail view
5. PR links work
6. Failed runs show error
7. Empty state displays correctly

### 10.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/web/components/account/run-list.tsx` | Created | Run table |
| `packages/web/components/account/run-detail.tsx` | Created | Run detail |
| `packages/web/app/(account)/runs/page.tsx` | Created | Runs page |
| `packages/web/app/api/runs/route.ts` | Created | Runs proxy |

---

## Phase 4 Completion Checklist

After completing Thrusts 9-10:

- [ ] Settings layout with navigation
- [ ] GitHub settings shows connection
- [ ] Connect/Disconnect GitHub works
- [ ] API keys can be created
- [ ] Full key shown only once
- [ ] Keys can be revoked
- [ ] Profile settings work
- [ ] Runs page lists history
- [ ] Status filter works
- [ ] Run detail shows info
- [ ] PR links work

---

## Final Website Completion Checklist

After all thrusts complete:

### Pages
- [ ] Landing page with hero, features, CTA
- [ ] Pricing page with plans
- [ ] Login page with GitHub OAuth
- [ ] Signup page with plan selection
- [ ] Account overview with usage
- [ ] Billing page with Stripe
- [ ] Settings: GitHub, API Keys, Profile
- [ ] Run history page

### Functionality
- [ ] GitHub OAuth authentication
- [ ] Device auth flow for TUI
- [ ] Stripe subscription management
- [ ] API key creation/revocation
- [ ] Run history viewing

### Infrastructure
- [ ] Prisma database schema
- [ ] Stripe webhook handling
- [ ] Protected routes
- [ ] Error handling
- [ ] SEO metadata

### Quality
- [ ] Mobile responsive
- [ ] Dark theme consistent
- [ ] Accessible
- [ ] Fast (< 2s LCP)

---

## Dog Fooding the Website

Once basic structure exists, AgentGate can build features:

```bash
agentgate run agentgate/agentgate "
In packages/web, add email notification settings to the profile page.
Add a toggle for 'Email me when runs complete'.
Store the preference in UserSettings table.
Create an API route to update the setting.
"
```

The website becomes self-improving via AgentGate work orders.
