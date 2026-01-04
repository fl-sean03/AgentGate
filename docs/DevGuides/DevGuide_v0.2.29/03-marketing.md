# 03: Marketing Pages - Landing, Pricing, Auth

This document covers Thrusts 4-6, implementing public-facing pages.

---

## Thrust 4: Landing Page

### 4.1 Objective

Create a compelling landing page that converts visitors to users.

### 4.2 Background

The landing page must:
- Explain what AgentGate does in seconds
- Show the value proposition clearly
- Provide social proof (when available)
- Drive users to sign up

### 4.3 Subtasks

#### 4.3.1 Create Hero Section

The main above-the-fold content.

**Files to create:**
- `packages/web/components/marketing/hero.tsx` - Hero section

**Dog Food Work Order:**
```
Create the Hero section in packages/web/components/marketing/hero.tsx:

Design a hero section with:
- Large heading: "AI-powered code changes, verified & delivered"
- Subheading: "Submit a task. Watch an AI agent work. Get a PR back."
- Two CTAs: "Get Started Free" (primary), "See Pricing" (secondary)
- Optional: animated terminal preview showing agent activity

Use:
- Dark background with subtle gradient
- Large, bold Inter font for heading
- Teal accent for primary CTA
- Centered layout with generous padding
- Responsive: stack on mobile

The hero should feel modern and developer-focused.
```

#### 4.3.2 Create Features Section

Highlight key features.

**Files to create:**
- `packages/web/components/marketing/features.tsx` - Features grid

**Dog Food Work Order:**
```
Create the Features section in packages/web/components/marketing/features.tsx:

Display 4-6 key features in a grid:

1. "4-Level Verification"
   - Icon: Shield or CheckCircle
   - Every change is tested against L0-L3 gates

2. "Real-Time Streaming"
   - Icon: Activity or Eye
   - Watch the agent work in real-time

3. "GitHub Integration"
   - Icon: GitHub logo
   - PRs delivered to your repository

4. "Pay Per Use"
   - Icon: DollarSign or CreditCard
   - Only pay for what you use

5. "Terminal-First"
   - Icon: Terminal
   - Beautiful TUI for developers

6. "Automatic Iteration"
   - Icon: RefreshCw
   - Agent iterates until verification passes

Use:
- 2 or 3 column grid (responsive)
- Card-style containers with subtle borders
- Consistent icon styling
- Brief descriptions (1-2 sentences)
```

#### 4.3.3 Create How It Works Section

Step-by-step explanation.

**Files to create:**
- `packages/web/components/marketing/how-it-works.tsx` - Process steps

**Dog Food Work Order:**
```
Create How It Works section in packages/web/components/marketing/how-it-works.tsx:

Show 4 steps with connecting lines/arrows:

1. "Connect GitHub"
   - Connect your repositories
   - One-click OAuth

2. "Describe Your Task"
   - Natural language prompt
   - "Fix the auth bug in login.ts"

3. "Agent Makes Changes"
   - Watch real-time activity
   - Automatic verification

4. "Review Your PR"
   - Changes delivered as PR
   - Ready for review

Use:
- Horizontal layout on desktop
- Vertical with connecting lines on mobile
- Step numbers or icons
- Brief descriptions under each
```

#### 4.3.4 Create CTA Section

Final call-to-action.

**Files to create:**
- `packages/web/components/marketing/cta.tsx` - Bottom CTA

**Dog Food Work Order:**
```
Create final CTA section in packages/web/components/marketing/cta.tsx:

Design a compelling CTA section:

- Heading: "Ready to automate your code changes?"
- Subtext: "Start free. No credit card required."
- Large CTA button: "Get Started Free"
- Subtle background (gradient or pattern)

Use:
- Centered text layout
- Prominent button with hover effect
- Teal primary color
- Generous vertical padding
```

#### 4.3.5 Assemble Landing Page

Put all sections together.

**Files to create:**
- `packages/web/app/(marketing)/page.tsx` - Landing page

**Dog Food Work Order:**
```
Assemble the landing page at packages/web/app/(marketing)/page.tsx:

Import and compose sections:
1. Hero section
2. Features section (with ID for anchor)
3. How It Works section
4. CTA section

Add:
- Smooth scroll between sections
- SEO metadata (title, description, OpenGraph)
- Subtle section dividers if needed
```

### 4.4 Verification Steps

1. Landing page renders all sections
2. CTAs link to /signup or /pricing
3. Responsive design works on mobile
4. Page loads quickly (< 2s)
5. Metadata is correct

### 4.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/web/components/marketing/hero.tsx` | Created | Hero section |
| `packages/web/components/marketing/features.tsx` | Created | Features grid |
| `packages/web/components/marketing/how-it-works.tsx` | Created | Process steps |
| `packages/web/components/marketing/cta.tsx` | Created | Bottom CTA |
| `packages/web/app/(marketing)/page.tsx` | Created | Landing page |

---

## Thrust 5: Pricing Page

### 5.1 Objective

Create a pricing page that clearly presents plans and encourages conversion.

### 5.2 Background

Pricing should be:
- Clear and easy to understand
- Show value of paid plans
- Include FAQ for common questions
- Drive users to the right plan

### 5.3 Subtasks

#### 5.3.1 Create Pricing Card Component

Individual plan card.

**Files to create:**
- `packages/web/components/marketing/pricing-card.tsx` - Plan card

**Dog Food Work Order:**
```
Create PricingCard component in packages/web/components/marketing/pricing-card.tsx:

Design a plan card with:
- Plan name (Free, Pro, Team)
- Price ($0, $49, $149 /month)
- "Most Popular" badge for Pro
- Included usage ("$60/mo included")
- Feature list with checkmarks
- CTA button

Props:
- name: string
- price: number
- period: 'month' | 'year'
- includedUsage: string
- features: string[]
- popular?: boolean
- ctaText: string
- ctaHref: string

Use:
- Card component with border
- Highlight popular plan (different border color or glow)
- Consistent spacing
- Button variant based on plan
```

#### 5.3.2 Create Feature Comparison Table

Detailed feature comparison.

**Files to create:**
- `packages/web/components/marketing/pricing-table.tsx` - Comparison table

**Dog Food Work Order:**
```
Create pricing comparison table in packages/web/components/marketing/pricing-table.tsx:

Create a table comparing all plans:

| Feature                | Free    | Pro       | Team      |
|------------------------|---------|-----------|-----------|
| Included usage         | $5/mo   | $60/mo    | $200/mo   |
| Tasks per month        | 10      | Unlimited | Unlimited |
| Max iterations         | 2       | 5         | 10        |
| Parallel runs          | 1       | 3         | 10        |
| GitHub repositories    | 3       | Unlimited | Unlimited |
| Team members           | 1       | 1         | 10        |
| Support                | Docs    | Email     | Priority  |

Use:
- Table component with sticky header
- Checkmarks for boolean features
- "Unlimited" text styled differently
- Responsive (horizontal scroll on mobile)
```

#### 5.3.3 Create FAQ Section

Common pricing questions.

**Files to create:**
- `packages/web/components/marketing/faq.tsx` - FAQ accordion

**Dog Food Work Order:**
```
Create FAQ section in packages/web/components/marketing/faq.tsx:

Add 5-8 common questions:

1. "How does billing work?"
   - Monthly subscription + pay-per-use overage

2. "What counts toward usage?"
   - Token usage and compute time

3. "Can I upgrade or downgrade?"
   - Yes, changes take effect immediately

4. "Is there a free trial?"
   - Free plan available, no credit card required

5. "What happens if I exceed my included usage?"
   - Overage charged at discounted rate

6. "Can I cancel anytime?"
   - Yes, no lock-in contracts

Use:
- Accordion pattern (click to expand)
- Plus/minus icons for toggle
- Smooth animation
```

#### 5.3.4 Assemble Pricing Page

Put pricing page together.

**Files to create:**
- `packages/web/app/(marketing)/pricing/page.tsx` - Pricing page

**Dog Food Work Order:**
```
Create pricing page at packages/web/app/(marketing)/pricing/page.tsx:

Structure:
1. Header: "Simple, transparent pricing"
2. Subheader: "Start free, scale as you grow"
3. Pricing cards in 3-column grid
4. Feature comparison table
5. FAQ section
6. CTA: "Still have questions? Contact us"

Add SEO metadata for pricing page.
Ensure responsive layout.
```

### 5.4 Verification Steps

1. All three plan cards render
2. "Most Popular" badge on Pro
3. Feature table is accurate
4. FAQ accordion works
5. CTAs link correctly

### 5.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/web/components/marketing/pricing-card.tsx` | Created | Plan card |
| `packages/web/components/marketing/pricing-table.tsx` | Created | Comparison table |
| `packages/web/components/marketing/faq.tsx` | Created | FAQ section |
| `packages/web/app/(marketing)/pricing/page.tsx` | Created | Pricing page |

---

## Thrust 6: Auth Pages

### 6.1 Objective

Create login and signup pages with GitHub OAuth.

### 6.2 Background

Auth pages should be:
- Simple and focused
- Quick to complete
- Show value proposition
- Handle errors gracefully

### 6.3 Subtasks

#### 6.3.1 Create Login Page

Simple login with GitHub.

**Files to create:**
- `packages/web/app/(auth)/login/page.tsx` - Login page

**Dog Food Work Order:**
```
Create login page at packages/web/app/(auth)/login/page.tsx:

Design:
- Centered card on dark background
- AgentGate logo at top
- "Welcome back" heading
- "Sign in with GitHub" button
- "Don't have an account? Sign up" link
- Error display if auth failed

Use:
- Card component
- GitHub logo on button
- Handle ?error query param
- Redirect to /dashboard on success

Make it feel secure and professional.
```

#### 6.3.2 Create Signup Page

Signup with plan selection.

**Files to create:**
- `packages/web/app/(auth)/signup/page.tsx` - Signup page

**Dog Food Work Order:**
```
Create signup page at packages/web/app/(auth)/signup/page.tsx:

Flow:
1. Show plan selection (Free, Pro, Team)
2. "Continue with GitHub" button
3. After GitHub auth:
   - Free: redirect to dashboard
   - Paid: redirect to Stripe checkout

Design:
- Centered layout
- Plan cards (compact version)
- GitHub button prominent
- "Already have an account? Log in" link

Handle ?plan query param to pre-select plan.
```

#### 6.3.3 Create Logout Page

Logout confirmation.

**Files to create:**
- `packages/web/app/(auth)/logout/page.tsx` - Logout page

**Dog Food Work Order:**
```
Create logout page at packages/web/app/(auth)/logout/page.tsx:

Simple page that:
- Shows "You've been logged out"
- Clears session on load
- Links to home page
- Auto-redirect after 3 seconds (optional)

Keep it minimal.
```

#### 6.3.4 Create Auth Layout

Shared layout for auth pages.

**Files to create:**
- `packages/web/app/(auth)/layout.tsx` - Auth layout

**Dog Food Work Order:**
```
Create auth layout at packages/web/app/(auth)/layout.tsx:

Minimal layout with:
- Dark full-screen background
- AgentGate logo link to home
- Centered content area
- No header/footer (clean focus)

Apply to all auth pages via route group.
```

### 6.4 Verification Steps

1. Login page shows GitHub button
2. Clicking GitHub initiates OAuth
3. Signup shows plan selection
4. Paid plans redirect to Stripe
5. Logout clears session
6. Error states display correctly

### 6.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/web/app/(auth)/layout.tsx` | Created | Auth layout |
| `packages/web/app/(auth)/login/page.tsx` | Created | Login page |
| `packages/web/app/(auth)/signup/page.tsx` | Created | Signup page |
| `packages/web/app/(auth)/logout/page.tsx` | Created | Logout page |

---

## Phase 2 Completion Checklist

After completing Thrusts 4-6:

- [ ] Landing page displays all sections
- [ ] Hero CTAs work
- [ ] Features and how-it-works render
- [ ] Pricing page shows all plans
- [ ] Feature comparison is accurate
- [ ] FAQ accordion works
- [ ] Login redirects to GitHub
- [ ] Signup shows plan selection
- [ ] Logout clears session
- [ ] All pages are responsive
- [ ] SEO metadata is set

---

## Next Steps

After Phase 2, proceed to [04-dashboard.md](./04-dashboard.md) for the user dashboard.
