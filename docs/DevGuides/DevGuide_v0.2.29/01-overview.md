# 01: Overview - Website Architecture

## Current State

AgentGate currently has:
- **Server** - API endpoints for work orders and runs
- **Dashboard** - Basic React dashboard for monitoring (packages/dashboard)
- **TUI** - Terminal interface for task execution (v0.2.28)

What's missing:
- User accounts and authentication
- Billing and subscriptions
- GitHub OAuth integration
- API key management
- Usage tracking and analytics

---

## Target State

A complete SaaS website that:
- Handles user onboarding (signup → GitHub → payment)
- Manages subscriptions via Stripe
- Provides usage dashboards
- Allows self-service account management
- Integrates with TUI via device auth flow

---

## Design Principles

### 1. Developer-Focused Aesthetic

Dark mode, terminal-inspired design that feels at home with developer tools:

- Near-black backgrounds
- Monospace fonts for code/data
- Subtle borders and shadows
- Cyan/teal accent colors
- Minimal, functional UI

### 2. Fast Onboarding

Get users from landing page to first task in under 5 minutes:

1. Click "Get Started"
2. Sign in with GitHub (OAuth)
3. Select plan (or start free)
4. Enter payment (if paid plan)
5. Copy API key or open TUI
6. Submit first task

### 3. Self-Service Everything

Users shouldn't need to contact support for:
- Upgrading/downgrading plans
- Updating payment methods
- Connecting/disconnecting GitHub
- Creating/revoking API keys
- Viewing invoices and usage

### 4. Mobile Responsive

All pages work on mobile, though the TUI is the primary interface:
- Landing page is fully responsive
- Dashboard works on tablet+
- Settings work on mobile
- Billing works on mobile

---

## Page Designs

### Landing Page

Hero section with clear value proposition:

```
╭──────────────────────────────────────────────────────────────╮
│                                                              │
│                        AgentGate                             │
│                                                              │
│         AI-powered code changes, verified & delivered        │
│                                                              │
│    Submit a task. Watch an AI agent work. Get a PR back.    │
│                                                              │
│              [Get Started Free]  [See Pricing]               │
│                                                              │
╰──────────────────────────────────────────────────────────────╯
```

Features section:
- **4-Level Verification** - Every change is tested
- **Real-Time Streaming** - Watch the agent work
- **GitHub Integration** - PRs delivered automatically
- **Pay Per Use** - Only pay for what you use

How it works:
1. Connect your GitHub
2. Describe your task
3. Agent makes changes
4. Review the PR

Social proof / testimonials (when available)

Final CTA: "Ready to automate your code changes?"

### Pricing Page

Three-column layout with plan comparison:

```
┌─────────────────┬─────────────────┬─────────────────┐
│      Free       │   Pro (Popular) │      Team       │
├─────────────────┼─────────────────┼─────────────────┤
│     $0/mo       │    $49/mo       │    $149/mo      │
│                 │                 │                 │
│ $5 included     │ $60 included    │ $200 included   │
│ 10 tasks/mo     │ Unlimited       │ Unlimited       │
│ 1 parallel      │ 3 parallel      │ 10 parallel     │
│ 3 repos         │ Unlimited repos │ Unlimited repos │
│                 │                 │ 10 team members │
│                 │                 │                 │
│ [Get Started]   │ [Start Free     │ [Contact Sales] │
│                 │  Trial]         │                 │
└─────────────────┴─────────────────┴─────────────────┘
```

Feature comparison table below

FAQ section with common questions

### Dashboard

Clean overview with key metrics:

```
╭─ Dashboard ──────────────────────────────────────────────────╮
│                                                              │
│  Usage This Month                                            │
│  ┌────────────────────────────────────────┐                  │
│  │ ████████████████░░░░░░░░░░░░░░░░ 45%   │  $27.50 / $60   │
│  └────────────────────────────────────────┘                  │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ 23 Runs     │  │ 87% Success │  │ 4m 32s Avg  │          │
│  │ this month  │  │ rate        │  │ duration    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                              │
│  Recent Runs                                                 │
│  ────────────────────────────────────────────────────────    │
│  ✓ mycompany/api     "Add rate limiting"         2h ago     │
│  ✓ mycompany/web     "Fix auth bug"              5h ago     │
│  ✗ mycompany/api     "Refactor tests"            1d ago     │
│                                              [View All →]   │
│                                                              │
╰──────────────────────────────────────────────────────────────╯
```

### Billing Page

Subscription and payment management:

```
╭─ Billing ────────────────────────────────────────────────────╮
│                                                              │
│  Current Plan: Pro                                           │
│  ───────────────────────────────────────────────────────     │
│  $49/month · $60 included usage · Renews Jan 15, 2025       │
│                                                              │
│  [Change Plan]  [Cancel Subscription]                        │
│                                                              │
│  Usage This Period                                           │
│  ───────────────────────────────────────────────────────     │
│  Included:    $60.00                                         │
│  Used:        $27.50                                         │
│  Remaining:   $32.50                                         │
│  Overage:     $0.00                                          │
│                                                              │
│  Payment Method                                              │
│  ───────────────────────────────────────────────────────     │
│  Visa •••• 4242    Expires 12/25    [Update]                │
│                                                              │
│  Invoices                                                    │
│  ───────────────────────────────────────────────────────     │
│  Dec 2024    $49.00    Paid    [Download]                   │
│  Nov 2024    $67.50    Paid    [Download]                   │
│  Oct 2024    $49.00    Paid    [Download]                   │
│                                                              │
╰──────────────────────────────────────────────────────────────╯
```

### Settings - GitHub

GitHub connection management:

```
╭─ Settings > GitHub ──────────────────────────────────────────╮
│                                                              │
│  Connected Account                                           │
│  ───────────────────────────────────────────────────────     │
│  ✓ Connected as @sarahdev                                    │
│    Authorized: Dec 1, 2024                                   │
│    [Reconnect]  [Disconnect]                                 │
│                                                              │
│  Repository Access                                           │
│  ───────────────────────────────────────────────────────     │
│  AgentGate can access:                                       │
│  ○ All repositories                                          │
│  ● Selected repositories only                                │
│                                                              │
│  Selected Repositories (5)                                   │
│  ☑ mycompany/api                                             │
│  ☑ mycompany/web                                             │
│  ☑ mycompany/mobile                                          │
│  ☑ personal/dotfiles                                         │
│  ☑ personal/blog                                             │
│                                                              │
│  [Manage on GitHub]                                          │
│                                                              │
╰──────────────────────────────────────────────────────────────╯
```

### Settings - API Keys

API key management:

```
╭─ Settings > API Keys ────────────────────────────────────────╮
│                                                              │
│  Your API Keys                                               │
│  ───────────────────────────────────────────────────────     │
│  Use these keys to authenticate with the AgentGate API      │
│  or TUI. Keep them secret!                                   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Production Key                                         │  │
│  │ ag_live_****************************abcd               │  │
│  │ Created Dec 1 · Last used 2h ago                       │  │
│  │                                [Copy]  [Revoke]        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Development Key                                        │  │
│  │ ag_test_****************************efgh               │  │
│  │ Created Dec 5 · Last used 1d ago                       │  │
│  │                                [Copy]  [Revoke]        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  [+ Create New Key]                                          │
│                                                              │
╰──────────────────────────────────────────────────────────────╯
```

### Run History

Detailed run browser:

```
╭─ Runs ───────────────────────────────────────────────────────╮
│                                                              │
│  Filter: [All ▾]  Repository: [All ▾]  Search: [________]   │
│                                                              │
│  ───────────────────────────────────────────────────────     │
│                                                              │
│  ✓ mycompany/api                                    2h ago   │
│    Add rate limiting to /api/users endpoint                  │
│    Duration: 4m 32s · Iterations: 2 · PR #127                │
│                                                              │
│  ✓ mycompany/web                                    5h ago   │
│    Fix authentication bug in login flow                      │
│    Duration: 3m 15s · Iterations: 1 · PR #89                 │
│                                                              │
│  ✗ mycompany/api                                    1d ago   │
│    Refactor database connection tests                        │
│    Duration: 8m 45s · Iterations: 3 · Failed: L1 Tests       │
│                                                              │
│  ✓ mycompany/mobile                                 1d ago   │
│    Add offline mode support                                  │
│    Duration: 12m 10s · Iterations: 4 · PR #45                │
│                                                              │
│  ← Previous   Page 1 of 5   Next →                           │
│                                                              │
╰──────────────────────────────────────────────────────────────╯
```

---

## Authentication Flow

### GitHub OAuth

1. User clicks "Sign in with GitHub"
2. Redirect to GitHub OAuth authorize URL
3. User approves access
4. GitHub redirects back with code
5. Exchange code for access token
6. Create/update user in database
7. Create session

### Device Auth (for TUI)

1. TUI requests device code from `/api/auth/device`
2. Server generates code and returns verification URL
3. TUI opens browser to verification URL
4. User authenticates on website (GitHub OAuth)
5. Website marks device code as authenticated
6. TUI polls `/api/auth/device/:code` and gets token
7. Token stored in TUI config

---

## Billing Flow

### Subscription Creation

1. User selects plan on pricing page
2. Redirect to Stripe Checkout
3. User enters payment details
4. Stripe creates subscription
5. Webhook updates user's subscription status
6. User redirected to dashboard

### Usage Tracking

1. Each work order records cost
2. Cost based on: tokens used, compute time
3. Costs accumulated against monthly allowance
4. When allowance exceeded, overage charges apply
5. Overage billed at end of month

### Invoice Generation

1. Stripe generates invoices automatically
2. Webhook receives invoice events
3. Store invoice reference in database
4. Show invoices in billing page
5. PDFs available via Stripe

---

## Component Architecture

### Shared Components

- `Button` - Primary, secondary, ghost variants
- `Card` - Container with subtle border
- `Input` - Text input with label and error
- `Select` - Dropdown select
- `Badge` - Status indicators
- `Table` - Data table with sorting
- `Dialog` - Modal dialogs
- `Dropdown` - Menu dropdowns

### Marketing Components

- `Hero` - Landing page hero section
- `FeatureCard` - Feature highlight
- `PricingCard` - Plan card with CTA
- `Testimonial` - Quote with avatar
- `Footer` - Site footer with links

### Dashboard Components

- `UsageBar` - Usage progress bar
- `StatCard` - Metric card
- `RunRow` - Run list item
- `ApiKeyCard` - API key display
- `InvoiceRow` - Invoice list item

---

## State Management

Using React Server Components + minimal client state:

- **Server Components** for data fetching
- **Client Components** for interactivity
- **URL state** for filters and pagination
- **React Query** for client-side data (optional)

No global state management needed - Next.js handles it.
