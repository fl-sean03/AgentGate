# 06: Appendices - Reference Materials

## A. Complete File Map

### Package Structure

```
packages/web/
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── components.json                 # shadcn/ui config
├── middleware.ts                   # Route protection
├── .env.example
│
├── prisma/
│   └── schema.prisma               # Database schema
│
├── lib/
│   ├── utils.ts                    # cn() utility
│   ├── db.ts                       # Prisma client
│   ├── auth.ts                     # NextAuth config
│   ├── auth-client.ts              # Client auth helpers
│   └── stripe.ts                   # Stripe utilities
│
├── app/
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Global styles
│   ├── page.tsx                    # Redirect to marketing
│   │
│   ├── (marketing)/                # Public pages
│   │   ├── layout.tsx
│   │   ├── page.tsx                # Landing page
│   │   └── pricing/
│   │       └── page.tsx            # Pricing page
│   │
│   ├── (auth)/                     # Auth pages
│   │   ├── layout.tsx
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── signup/
│   │   │   └── page.tsx
│   │   ├── logout/
│   │   │   └── page.tsx
│   │   └── device/
│   │       └── page.tsx            # Device auth for TUI
│   │
│   ├── (account)/                  # Protected pages
│   │   ├── layout.tsx
│   │   ├── page.tsx                # Account overview
│   │   ├── billing/
│   │   │   └── page.tsx
│   │   ├── runs/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       ├── layout.tsx
│   │       ├── github/
│   │       │   └── page.tsx
│   │       ├── api-keys/
│   │       │   └── page.tsx
│   │       └── profile/
│   │           └── page.tsx
│   │
│   └── api/
│       ├── auth/
│       │   ├── [...nextauth]/
│       │   │   └── route.ts
│       │   └── device/
│       │       ├── route.ts        # Create device code
│       │       └── [code]/
│       │           └── route.ts    # Poll device code
│       ├── webhooks/
│       │   └── stripe/
│       │       └── route.ts
│       ├── billing/
│       │   └── checkout/
│       │       └── route.ts
│       ├── user/
│       │   ├── api-keys/
│       │   │   └── route.ts
│       │   └── settings/
│       │       └── route.ts
│       └── runs/
│           └── route.ts            # Proxy to AgentGate
│
├── components/
│   ├── ui/                         # shadcn components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── badge.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   ├── progress.tsx
│   │   └── sheet.tsx
│   │
│   ├── shared/                     # Layout components
│   │   ├── header.tsx
│   │   ├── footer.tsx
│   │   └── nav-link.tsx
│   │
│   ├── marketing/                  # Marketing components
│   │   ├── hero.tsx
│   │   ├── features.tsx
│   │   ├── how-it-works.tsx
│   │   ├── cta.tsx
│   │   ├── pricing-card.tsx
│   │   ├── pricing-table.tsx
│   │   └── faq.tsx
│   │
│   ├── account/                    # Account components
│   │   ├── usage-summary.tsx
│   │   ├── quick-stats.tsx
│   │   ├── quick-links.tsx
│   │   ├── subscription-card.tsx
│   │   ├── payment-method.tsx
│   │   ├── invoices-list.tsx
│   │   ├── github-connection.tsx
│   │   ├── api-key-card.tsx
│   │   ├── create-key-dialog.tsx
│   │   ├── run-list.tsx
│   │   └── run-detail.tsx
│   │
│   └── providers/
│       └── session-provider.tsx
│
├── types/
│   └── next-auth.d.ts              # NextAuth type extensions
│
└── public/
    ├── logo.svg
    ├── favicon.ico
    └── og-image.png
```

**Total: ~55 source files**

---

## B. Implementation Checklist

### Phase 1: Foundation (Thrusts 1-3)

#### Thrust 1: Project Setup
- [ ] Create packages/web with Next.js 14
- [ ] Configure Tailwind CSS
- [ ] Set up TypeScript
- [ ] Create app directory structure
- [ ] Add to pnpm-workspace.yaml
- [ ] Verify dev server runs

#### Thrust 2: Design System
- [ ] Initialize shadcn/ui
- [ ] Add core UI components
- [ ] Configure theme colors
- [ ] Create layout components
- [ ] Dark theme working

#### Thrust 3: Authentication
- [ ] Set up Prisma schema
- [ ] Configure NextAuth with GitHub
- [ ] Create auth API routes
- [ ] Implement route protection
- [ ] Create device auth for TUI
- [ ] Test full auth flow

### Phase 2: Marketing (Thrusts 4-6)

#### Thrust 4: Landing Page
- [ ] Create Hero section
- [ ] Create Features section
- [ ] Create How It Works section
- [ ] Create CTA section
- [ ] Assemble landing page
- [ ] Add SEO metadata

#### Thrust 5: Pricing Page
- [ ] Create PricingCard component
- [ ] Create comparison table
- [ ] Create FAQ accordion
- [ ] Assemble pricing page

#### Thrust 6: Auth Pages
- [ ] Create login page
- [ ] Create signup page
- [ ] Create logout page
- [ ] Create auth layout

### Phase 3: Account (Thrusts 7-8)

#### Thrust 7: Account Overview
- [ ] Create UsageSummary component
- [ ] Create QuickStats component
- [ ] Create QuickLinks component
- [ ] Create account layout
- [ ] Create overview page

#### Thrust 8: Billing
- [ ] Set up Stripe integration
- [ ] Create webhook handler
- [ ] Create SubscriptionCard
- [ ] Create PaymentMethod
- [ ] Create InvoicesList
- [ ] Create billing page
- [ ] Implement upgrade flow

### Phase 4: Settings (Thrusts 9-10)

#### Thrust 9: Settings Pages
- [ ] Create settings layout
- [ ] Create GitHub settings page
- [ ] Create API keys page
- [ ] Create profile page
- [ ] Implement API endpoints

#### Thrust 10: Run History
- [ ] Create RunList component
- [ ] Create RunDetail component
- [ ] Create runs page
- [ ] Create runs API proxy

---

## C. Environment Variables

```bash
# App
NEXT_PUBLIC_APP_URL=https://agentgate.dev
NEXT_PUBLIC_API_URL=https://api.agentgate.dev

# Auth
NEXTAUTH_SECRET=your-random-secret-32-chars
NEXTAUTH_URL=https://agentgate.dev

# GitHub OAuth
GITHUB_ID=your-github-app-client-id
GITHUB_SECRET=your-github-app-client-secret

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Stripe Price IDs
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_TEAM_MONTHLY=price_...

# Database
DATABASE_URL=postgresql://user:pass@host:5432/agentgate

# AgentGate API (internal)
AGENTGATE_API_URL=https://api.agentgate.dev
AGENTGATE_API_KEY=internal-service-key
```

---

## D. Database Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  emailVerified DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // GitHub
  githubId    String? @unique
  githubToken String?

  // Stripe
  stripeCustomerId     String? @unique
  stripeSubscriptionId String?
  stripePriceId        String?
  stripeCurrentPeriodEnd DateTime?

  // Relations
  accounts Account[]
  sessions Session[]
  apiKeys  ApiKey[]
  settings UserSettings?
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

model ApiKey {
  id        String    @id @default(cuid())
  keyHash   String    @unique
  keyPrefix String
  name      String
  createdAt DateTime  @default(now())
  lastUsed  DateTime?
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model UserSettings {
  id     String @id @default(cuid())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Preferences
  defaultMaxIterations Int     @default(3)
  emailOnComplete      Boolean @default(true)
}

model DeviceCode {
  id        String   @id @default(cuid())
  code      String   @unique
  userId    String?
  token     String?
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

---

## E. API Routes Reference

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/[...nextauth]` | * | - | NextAuth handlers |
| `/api/auth/device` | POST | - | Create device code |
| `/api/auth/device/[code]` | GET | - | Poll device code |
| `/api/webhooks/stripe` | POST | Stripe | Stripe webhooks |
| `/api/billing/checkout` | POST | User | Create checkout session |
| `/api/user/api-keys` | GET | User | List API keys |
| `/api/user/api-keys` | POST | User | Create API key |
| `/api/user/api-keys` | DELETE | User | Revoke API key |
| `/api/user/settings` | GET | User | Get user settings |
| `/api/user/settings` | PATCH | User | Update settings |
| `/api/runs` | GET | User | Proxy to AgentGate |

---

## F. Stripe Setup

### Products and Prices

Create in Stripe Dashboard:

1. **Product: AgentGate Pro**
   - Price: $49/month (price_xxx)
   - Metadata: { plan: 'pro', included_cents: 6000 }

2. **Product: AgentGate Team**
   - Price: $149/month (price_yyy)
   - Metadata: { plan: 'team', included_cents: 20000 }

### Webhook Events

Configure webhook to send:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

---

## G. Deployment

### Vercel Deployment

1. Connect GitHub repository
2. Set root directory to `packages/web`
3. Configure environment variables
4. Set up custom domain
5. Enable Edge Functions

### Database Setup

1. Create Postgres database (Neon, Supabase, or PlanetScale)
2. Run `pnpm prisma migrate deploy`
3. Set DATABASE_URL in Vercel

### Stripe Setup

1. Create webhook endpoint in Stripe Dashboard
2. Point to `https://agentgate.dev/api/webhooks/stripe`
3. Copy webhook secret to STRIPE_WEBHOOK_SECRET

---

## H. Dog Fooding Work Orders

### Landing Page
```
Create the landing page for packages/web at app/(marketing)/page.tsx.
Include a hero section with heading "AI-powered code changes, verified & delivered".
Add two CTAs: "Get Started Free" and "See Pricing".
Create a features section with 4 cards.
Create a how-it-works section with 4 steps.
Create a final CTA section.
Use Tailwind CSS with dark theme.
Make it mobile responsive.
```

### Billing Page
```
Create the billing page for packages/web at app/(account)/billing/page.tsx.
Show current subscription status from Stripe.
Display payment method (last 4 digits).
Show list of invoices with download links.
Add "Change Plan" and "Update Payment" buttons that open Stripe Customer Portal.
Handle free users (show upgrade button instead).
```

### API Keys
```
Create API key management for packages/web.
Create an API route at app/api/user/api-keys/route.ts with GET, POST, DELETE.
Create components: api-key-card.tsx and create-key-dialog.tsx.
Create the page at app/(account)/settings/api-keys/page.tsx.
Keys should be hashed in the database (only show full key on creation).
Include copy button and revoke with confirmation.
```

---

**End of DevGuide v0.2.29**
