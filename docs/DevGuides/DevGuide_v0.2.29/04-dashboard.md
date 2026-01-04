# 04: Account Pages - Overview & Billing

This document covers Thrusts 7-8, implementing the authenticated account pages.

**Note**: This is a simple SaaS frontend, not a full dashboard. The TUI is the primary interface for actually using AgentGate. The website handles account management, billing, and settings only.

---

## Thrust 7: Account Overview

### 7.1 Objective

Create a simple account overview page showing usage summary and quick links.

### 7.2 Background

The account page is a landing spot after login. It should:
- Show current usage at a glance
- Provide quick links to key actions
- Not replicate TUI functionality

### 7.3 Subtasks

#### 7.3.1 Create Usage Summary Component

Show usage progress.

**Files to create:**
- `packages/web/components/account/usage-summary.tsx` - Usage bar

**Dog Food Work Order:**
```
Create UsageSummary component in packages/web/components/account/usage-summary.tsx:

Display:
- Progress bar showing used vs included
- "$X.XX / $Y.YY used this month"
- Overage indicator if applicable
- Days remaining in billing period

Props:
- used: number (cents)
- included: number (cents)
- periodEndsAt: Date

Use:
- Progress component from shadcn/ui
- Color: teal for normal, yellow for >80%, red for overage
- Clean typography
```

#### 7.3.2 Create Quick Stats Component

Simple stats cards.

**Files to create:**
- `packages/web/components/account/quick-stats.tsx` - Stats grid

**Dog Food Work Order:**
```
Create QuickStats component in packages/web/components/account/quick-stats.tsx:

Display 3 stats in a row:
1. Runs this month (number)
2. Success rate (percentage)
3. Avg duration (time)

Props:
- runs: number
- successRate: number
- avgDuration: number (seconds)

Use:
- Card component for each stat
- Bold number, muted label
- 3-column grid, stack on mobile
```

#### 7.3.3 Create Quick Links Component

Links to common actions.

**Files to create:**
- `packages/web/components/account/quick-links.tsx` - Action links

**Dog Food Work Order:**
```
Create QuickLinks component in packages/web/components/account/quick-links.tsx:

Display links to:
- "Manage Billing" → /account/billing
- "API Keys" → /account/settings/api-keys
- "GitHub Settings" → /account/settings/github
- "Download TUI" → /docs/install (or npm command)

Use:
- List of link cards with icons
- Chevron right indicator
- Subtle hover effect
```

#### 7.3.4 Create Account Overview Page

Assemble the account page.

**Files to create:**
- `packages/web/app/(account)/page.tsx` - Account overview
- `packages/web/app/(account)/layout.tsx` - Account layout

**Dog Food Work Order:**
```
Create account pages:

1. app/(account)/layout.tsx:
   - Simple layout with header (logo + user menu)
   - No sidebar - keep it minimal
   - User can logout from header menu
   - Link back to home

2. app/(account)/page.tsx:
   - Fetch user's usage from API
   - "Welcome back, {name}" greeting
   - UsageSummary component
   - QuickStats component
   - QuickLinks component
   - "Open TUI to submit tasks" prompt

Keep it simple - this is not a full dashboard.
The TUI is where real work happens.
```

### 7.4 Verification Steps

1. Account page shows usage summary
2. Stats display correctly
3. Quick links navigate properly
4. User menu has logout option
5. Page is responsive

### 7.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/web/components/account/usage-summary.tsx` | Created | Usage bar |
| `packages/web/components/account/quick-stats.tsx` | Created | Stats cards |
| `packages/web/components/account/quick-links.tsx` | Created | Action links |
| `packages/web/app/(account)/layout.tsx` | Created | Account layout |
| `packages/web/app/(account)/page.tsx` | Created | Overview page |

---

## Thrust 8: Billing Management

### 8.1 Objective

Implement billing page with Stripe integration for subscription management.

### 8.2 Background

Billing page allows users to:
- View current subscription
- Upgrade/downgrade plans
- Update payment method
- View invoices

### 8.3 Subtasks

#### 8.3.1 Set Up Stripe

Configure Stripe SDK and webhooks.

**Files to create:**
- `packages/web/lib/stripe.ts` - Stripe utilities
- `packages/web/app/api/webhooks/stripe/route.ts` - Webhook handler

**Dog Food Work Order:**
```
Set up Stripe in packages/web:

1. Install: stripe

2. Create lib/stripe.ts:
   - Initialize Stripe with secret key
   - Helper functions:
     - createCheckoutSession(userId, priceId)
     - createPortalSession(customerId)
     - getSubscription(subscriptionId)
   - Price IDs for each plan

3. Create app/api/webhooks/stripe/route.ts:
   - Verify webhook signature
   - Handle events:
     - checkout.session.completed → create subscription
     - customer.subscription.updated → update status
     - customer.subscription.deleted → cancel subscription
     - invoice.paid → record payment
   - Update user's subscription in database

Use raw body for signature verification.
```

#### 8.3.2 Create Subscription Display

Show current subscription status.

**Files to create:**
- `packages/web/components/account/subscription-card.tsx` - Subscription info

**Dog Food Work Order:**
```
Create SubscriptionCard component in packages/web/components/account/subscription-card.tsx:

Display:
- Current plan name and price
- Included usage amount
- Renewal date
- Status (active, past due, canceled)
- "Change Plan" button
- "Cancel Subscription" button (with confirmation)

Props:
- subscription: object with plan, price, renewsAt, status

Use:
- Card component
- Badge for status
- Buttons open Stripe Portal or confirmation dialog
```

#### 8.3.3 Create Payment Method Display

Show and update payment method.

**Files to create:**
- `packages/web/components/account/payment-method.tsx` - Payment info

**Dog Food Work Order:**
```
Create PaymentMethod component in packages/web/components/account/payment-method.tsx:

Display:
- Card brand and last 4 digits
- Expiration date
- "Update" button (opens Stripe Portal)

Props:
- paymentMethod: object with brand, last4, expMonth, expYear

If no payment method (Free plan):
- Show "No payment method on file"
- "Add Payment Method" button for upgrades
```

#### 8.3.4 Create Invoices List

Show invoice history.

**Files to create:**
- `packages/web/components/account/invoices-list.tsx` - Invoice table

**Dog Food Work Order:**
```
Create InvoicesList component in packages/web/components/account/invoices-list.tsx:

Display table with:
- Date
- Amount
- Status (Paid, Open, Past Due)
- Download PDF link

Props:
- invoices: array of invoice objects

Use:
- Table component
- Badge for status (green=paid, yellow=open, red=past due)
- External link to Stripe invoice PDF

Show "No invoices yet" if empty.
```

#### 8.3.5 Create Billing Page

Assemble billing page.

**Files to create:**
- `packages/web/app/(account)/billing/page.tsx` - Billing page

**Dog Food Work Order:**
```
Create billing page at packages/web/app/(account)/billing/page.tsx:

Server Component that:
1. Fetches user's Stripe subscription
2. Fetches payment method
3. Fetches recent invoices

Structure:
- "Billing" heading
- Usage summary (same as account page)
- Current Plan section (SubscriptionCard)
- Payment Method section
- Invoices section

Actions:
- Change Plan → opens Stripe Portal
- Update Payment → opens Stripe Portal
- Download Invoice → Stripe PDF
- Cancel → confirmation dialog → API call

Handle free users (no Stripe subscription):
- Show plan as "Free"
- "Upgrade" button instead of "Change Plan"
```

#### 8.3.6 Create Upgrade Flow

Handle upgrading from Free.

**Files to create:**
- `packages/web/app/api/billing/checkout/route.ts` - Create checkout session

**Dog Food Work Order:**
```
Create checkout API route at packages/web/app/api/billing/checkout/route.ts:

POST handler:
- Require authentication
- Accept { priceId } in body
- Create Stripe Checkout Session
- Return { url } for redirect

The frontend will:
1. User clicks "Upgrade to Pro"
2. POST to /api/billing/checkout
3. Redirect to Stripe Checkout
4. Stripe redirects back to /account/billing?success=true
5. Webhook updates subscription status

Handle errors gracefully.
```

### 8.4 Verification Steps

1. Subscription displays correctly
2. "Change Plan" opens Stripe Portal
3. Payment method shows card info
4. "Update" opens Stripe Portal
5. Invoices list with download links
6. Upgrade flow creates checkout session
7. Webhooks update subscription status

### 8.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/web/lib/stripe.ts` | Created | Stripe utilities |
| `packages/web/app/api/webhooks/stripe/route.ts` | Created | Webhook handler |
| `packages/web/app/api/billing/checkout/route.ts` | Created | Checkout API |
| `packages/web/components/account/subscription-card.tsx` | Created | Subscription display |
| `packages/web/components/account/payment-method.tsx` | Created | Payment display |
| `packages/web/components/account/invoices-list.tsx` | Created | Invoice list |
| `packages/web/app/(account)/billing/page.tsx` | Created | Billing page |

---

## Phase 3 Completion Checklist

After completing Thrusts 7-8:

- [ ] Account overview shows usage
- [ ] Quick stats display correctly
- [ ] Quick links navigate properly
- [ ] Billing shows subscription status
- [ ] Change Plan opens Stripe Portal
- [ ] Payment method displays
- [ ] Invoices list with downloads
- [ ] Upgrade flow works
- [ ] Webhooks update database
- [ ] Error states handled

---

## Next Steps

After Phase 3, proceed to [05-settings.md](./05-settings.md) for settings pages.
