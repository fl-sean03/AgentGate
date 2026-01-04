# DevGuide v0.2.29: SaaS Website & Dashboard

**Version**: 0.2.29
**Title**: SaaS Website & Dashboard
**Status**: Planning
**Prerequisites**: v0.2.28 (TUI Implementation)
**Depends On**: AgentGate server API

---

## Executive Summary

This DevGuide implements the **AgentGate website** — a SaaS frontend for account management, billing, GitHub integration, and usage analytics. The website handles everything the TUI doesn't: signup, payments, settings, and dashboards.

**Key Principle**: The website is for **managing**, the TUI is for **doing**. Users come to the website to set up their account, connect GitHub, manage billing, and review analytics. They use the TUI to actually run tasks.

---

## Problem Statement

Users need a place to:
1. Create an account and subscribe to a plan
2. Connect their GitHub account for repository access
3. Manage billing and payment methods
4. Generate and manage API keys
5. View usage analytics and run history
6. Configure team settings (future)

The TUI deliberately omits these features to stay focused on task execution.

---

## Success Criteria

After v0.2.29 implementation:

1. **Signup flow** takes under 2 minutes (email → GitHub → payment → done)
2. **Dashboard** shows usage at a glance
3. **Billing** integrates with Stripe for subscriptions
4. **GitHub OAuth** connects user's repositories
5. **API keys** can be created and managed
6. **Run history** is viewable with filtering
7. **Mobile responsive** - works on all devices
8. **Fast** - Core Web Vitals passing

---

## Thrust Overview

| Phase | Thrust | Name | Description | Files |
|-------|--------|------|-------------|-------|
| 1 | 1 | Project Setup | Next.js 14 with App Router | 8 |
| 1 | 2 | Design System | Tailwind + shadcn/ui components | 12 |
| 1 | 3 | Authentication | NextAuth with GitHub OAuth | 8 |
| 2 | 4 | Landing Page | Marketing homepage | 6 |
| 2 | 5 | Pricing Page | Plans and features | 4 |
| 2 | 6 | Auth Pages | Login, signup, logout | 5 |
| 3 | 7 | Dashboard | Usage overview | 6 |
| 3 | 8 | Billing | Stripe integration | 8 |
| 4 | 9 | Settings | GitHub, API keys, profile | 7 |
| 4 | 10 | Run History | Detailed run browser | 5 |

**Total Files**: ~69 new files

---

## Architecture Overview

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 14 | React with App Router |
| Styling | Tailwind CSS | Utility-first CSS |
| Components | shadcn/ui | Accessible component library |
| Auth | NextAuth.js | Authentication with GitHub OAuth |
| Payments | Stripe | Subscription billing |
| Database | Postgres (via Prisma) | User and billing data |
| Hosting | Vercel | Deployment platform |

### Package Structure

```
packages/
├── web/                      # NEW: Website package
│   ├── app/                  # Next.js App Router
│   │   ├── (marketing)/      # Public pages (landing, pricing)
│   │   ├── (auth)/           # Auth pages (login, signup)
│   │   ├── (dashboard)/      # Protected pages
│   │   ├── api/              # API routes
│   │   └── layout.tsx        # Root layout
│   │
│   ├── components/
│   │   ├── ui/               # shadcn components
│   │   ├── marketing/        # Landing page components
│   │   ├── dashboard/        # Dashboard components
│   │   └── shared/           # Shared components
│   │
│   ├── lib/
│   │   ├── auth.ts           # NextAuth config
│   │   ├── stripe.ts         # Stripe utilities
│   │   ├── api.ts            # AgentGate API client
│   │   └── db.ts             # Prisma client
│   │
│   ├── prisma/
│   │   └── schema.prisma     # Database schema
│   │
│   └── public/               # Static assets
│
├── tui/                      # TUI package (v0.2.28)
├── server/                   # AgentGate server
└── shared/                   # Shared types
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Next.js Frontend                                           │
│  ├── Server Components (dashboard, pages)                   │
│  ├── Client Components (interactive elements)               │
│  └── API Routes (webhooks, auth)                           │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│  Postgres (User) │ │    Stripe    │ │  AgentGate API   │
│  - Accounts      │ │  - Billing   │ │  - Work Orders   │
│  - API Keys      │ │  - Subs      │ │  - Runs          │
│  - Settings      │ │  - Webhooks  │ │  - Repos         │
└──────────────────┘ └──────────────┘ └──────────────────┘
```

---

## Page Structure

### Public Pages (Marketing)

| Route | Purpose |
|-------|---------|
| `/` | Landing page - hero, features, testimonials, CTA |
| `/pricing` | Pricing plans with feature comparison |
| `/docs` | Documentation (link to external docs) |
| `/blog` | Blog (future, can link to external) |

### Auth Pages

| Route | Purpose |
|-------|---------|
| `/login` | Login with GitHub |
| `/signup` | Signup with GitHub + plan selection |
| `/logout` | Logout confirmation |

### Dashboard Pages (Protected)

| Route | Purpose |
|-------|---------|
| `/dashboard` | Usage overview, quick stats |
| `/dashboard/runs` | Run history with filtering |
| `/dashboard/runs/[id]` | Single run detail |
| `/dashboard/billing` | Subscription, invoices, payment |
| `/dashboard/settings` | GitHub, API keys, profile |
| `/dashboard/settings/github` | GitHub connection management |
| `/dashboard/settings/api-keys` | API key management |
| `/dashboard/settings/profile` | Profile settings |

---

## Visual Design

### Brand Identity

- **Primary Color**: Teal/Cyan (`#0D9488` / `#14B8A6`)
- **Accent Color**: Purple (`#8B5CF6`)
- **Background**: Near-black (`#0F172A`)
- **Surface**: Dark gray (`#1E293B`)
- **Text**: White (`#F8FAFC`)
- **Muted**: Gray (`#94A3B8`)

### Typography

- **Headings**: Inter (sans-serif), bold
- **Body**: Inter (sans-serif), regular
- **Code**: JetBrains Mono (monospace)

### Design Principles

1. **Dark mode first** - Modern dev tool aesthetic
2. **Minimal chrome** - Content takes priority
3. **Generous spacing** - Easy to scan
4. **Subtle animations** - Professional, not flashy
5. **Mobile responsive** - Works on all devices

---

## Document Navigation

| File | Contents |
|------|----------|
| [01-overview.md](./01-overview.md) | Detailed architecture, design decisions |
| [02-foundation.md](./02-foundation.md) | Thrusts 1-3: Setup, Design System, Auth |
| [03-marketing.md](./03-marketing.md) | Thrusts 4-6: Landing, Pricing, Auth Pages |
| [04-dashboard.md](./04-dashboard.md) | Thrusts 7-8: Dashboard, Billing |
| [05-settings.md](./05-settings.md) | Thrusts 9-10: Settings, Run History |
| [06-appendices.md](./06-appendices.md) | File map, checklists, reference |

---

## Database Schema Overview

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  createdAt     DateTime  @default(now())

  // GitHub
  githubId      String?   @unique
  githubToken   String?

  // Stripe
  stripeCustomerId     String?   @unique
  stripeSubscriptionId String?

  // Relations
  apiKeys       ApiKey[]
  settings      UserSettings?
}

model ApiKey {
  id        String   @id @default(cuid())
  key       String   @unique
  name      String
  createdAt DateTime @default(now())
  lastUsed  DateTime?
  userId    String
  user      User     @relation(fields: [userId], references: [id])
}

model UserSettings {
  id           String  @id @default(cuid())
  userId       String  @unique
  user         User    @relation(fields: [userId], references: [id])

  // Preferences
  defaultBranch    String @default("main")
  maxIterations    Int    @default(3)
  emailOnComplete  Boolean @default(true)
}
```

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/[...nextauth]` | * | NextAuth handlers |
| `/api/webhooks/stripe` | POST | Stripe webhook handler |
| `/api/user/api-keys` | GET, POST, DELETE | API key management |
| `/api/user/settings` | GET, PATCH | User settings |
| `/api/github/repos` | GET | Proxy to AgentGate repos API |
| `/api/runs` | GET | Proxy to AgentGate runs API |

---

## Subscription Plans

| Plan | Price | Included Usage | Overage Rate |
|------|-------|----------------|--------------|
| **Free** | $0/mo | $5/mo | Not available |
| **Pro** | $49/mo | $60/mo | $0.80 per $1 |
| **Team** | $149/mo | $200/mo | $0.70 per $1 |
| **Enterprise** | Custom | Custom | Custom |

### Plan Features

| Feature | Free | Pro | Team | Enterprise |
|---------|------|-----|------|------------|
| Work orders/month | 10 | Unlimited | Unlimited | Unlimited |
| Max iterations | 2 | 5 | 10 | Unlimited |
| Parallel runs | 1 | 3 | 10 | Unlimited |
| GitHub repos | 3 | Unlimited | Unlimited | Unlimited |
| Team members | 1 | 1 | 10 | Unlimited |
| Priority support | - | Email | Chat | Dedicated |
| SLA | - | - | 99.5% | 99.9% |

---

## Implementation Notes

### Dog Fooding

Once the basic structure is in place, AgentGate can be used to build out features:

```bash
agentgate run agentgate/agentgate "
In packages/web, create the pricing page at app/(marketing)/pricing/page.tsx.
Show the Free, Pro, and Team plans in a 3-column layout.
Each plan should show price, included usage, features list, and CTA button.
Highlight the Pro plan as 'Most Popular'.
Use shadcn/ui Card and Button components.
Make it mobile responsive (stack on mobile).
"
```

### Security Considerations

- API keys are hashed before storage
- GitHub tokens are encrypted at rest
- Stripe webhooks are verified with signatures
- All dashboard routes require authentication
- Rate limiting on API routes

### Performance Targets

- LCP < 2.5s
- FID < 100ms
- CLS < 0.1
- Time to First Byte < 600ms

---

## Dependencies

### Production

```json
{
  "next": "^14.0.0",
  "react": "^18.3.0",
  "tailwindcss": "^3.4.0",
  "@radix-ui/react-*": "latest",
  "next-auth": "^5.0.0",
  "@prisma/client": "^5.0.0",
  "stripe": "^14.0.0",
  "lucide-react": "^0.300.0",
  "class-variance-authority": "^0.7.0",
  "clsx": "^2.0.0"
}
```

### Development

```json
{
  "typescript": "^5.3.0",
  "prisma": "^5.0.0",
  "@types/react": "^18.3.0",
  "eslint": "^8.0.0",
  "prettier": "^3.0.0"
}
```

---

## Next Steps

After completing this DevGuide:
1. TUI can authenticate against website OAuth
2. Users can manage their accounts
3. Billing is automated via Stripe
4. Analytics provide visibility into usage

The system becomes a complete SaaS platform.
