# 02: Foundation - Setup, Design System, Authentication

This document covers Thrusts 1-3, establishing the foundation for the website.

---

## Dog Fooding Strategy

Each thrust can be implemented via AgentGate work orders:

```bash
agentgate run agentgate/agentgate "
Create the packages/web directory with Next.js 14 App Router.
Use TypeScript, Tailwind CSS, and configure for Vercel deployment.
Add to pnpm-workspace.yaml.
Create a basic layout with dark theme.
Ensure pnpm install and pnpm dev work.
"
```

---

## Thrust 1: Project Setup

### 1.1 Objective

Create the `packages/web` package with Next.js 14, Tailwind CSS, and project structure.

### 1.2 Background

The website uses Next.js 14 with App Router for:
- Server Components (fast initial load)
- API Routes (backend endpoints)
- Edge Runtime (fast globally)
- Vercel deployment (easy hosting)

### 1.3 Subtasks

#### 1.3.1 Create Next.js Project

Initialize the Next.js project with proper configuration.

**Files to create:**
- `packages/web/package.json` - Package manifest
- `packages/web/tsconfig.json` - TypeScript configuration
- `packages/web/next.config.js` - Next.js configuration
- `packages/web/tailwind.config.ts` - Tailwind configuration
- `packages/web/postcss.config.js` - PostCSS for Tailwind

**Dog Food Work Order:**
```
Create packages/web as a Next.js 14 project:

1. Create package.json with:
   - name: @agentgate/web
   - scripts: dev, build, start, lint
   - dependencies: next@14, react@18, react-dom@18
   - devDependencies: typescript, @types/react, tailwindcss, autoprefixer, postcss

2. Create tsconfig.json extending Next.js defaults with strict mode

3. Create next.config.js with:
   - output: 'standalone' for Docker
   - experimental.serverActions: true

4. Create tailwind.config.ts with:
   - content paths for app and components
   - dark mode: 'class'
   - custom colors matching brand (teal, purple, dark grays)

5. Add packages/web to pnpm-workspace.yaml

Verify pnpm install and pnpm dev work.
```

#### 1.3.2 Create App Structure

Set up the App Router directory structure.

**Files to create:**
- `packages/web/app/layout.tsx` - Root layout
- `packages/web/app/globals.css` - Global styles with Tailwind
- `packages/web/app/page.tsx` - Temporary home page
- `packages/web/app/(marketing)/layout.tsx` - Marketing layout
- `packages/web/app/(dashboard)/layout.tsx` - Dashboard layout

**Dog Food Work Order:**
```
Create the App Router structure in packages/web:

1. app/layout.tsx:
   - Import globals.css
   - Set metadata (title, description)
   - Use Inter font from next/font
   - Wrap children in dark theme container

2. app/globals.css:
   - Tailwind directives (@tailwind base, components, utilities)
   - CSS variables for colors
   - Dark theme as default

3. app/page.tsx:
   - Temporary "AgentGate" heading
   - Link to /dashboard

4. app/(marketing)/layout.tsx:
   - Public layout with header/footer
   - No authentication required

5. app/(dashboard)/layout.tsx:
   - Authenticated layout
   - Sidebar navigation
   - Will require auth (placeholder for now)

Use route groups (parentheses) to organize without affecting URLs.
```

#### 1.3.3 Configure Development Environment

Set up environment variables and development tooling.

**Files to create:**
- `packages/web/.env.example` - Example environment variables
- `packages/web/.eslintrc.json` - ESLint configuration
- `packages/web/.prettierrc` - Prettier configuration

**Dog Food Work Order:**
```
Set up development environment for packages/web:

1. .env.example with:
   - NEXT_PUBLIC_API_URL=http://localhost:3001
   - NEXTAUTH_SECRET=your-secret-here
   - NEXTAUTH_URL=http://localhost:3000
   - GITHUB_ID=your-github-app-id
   - GITHUB_SECRET=your-github-app-secret
   - STRIPE_SECRET_KEY=sk_test_...
   - STRIPE_WEBHOOK_SECRET=whsec_...
   - DATABASE_URL=postgresql://...

2. .eslintrc.json extending next/core-web-vitals

3. .prettierrc with:
   - singleQuote: true
   - trailingComma: 'es5'
   - tabWidth: 2

Add lint and format scripts to package.json.
```

### 1.4 Verification Steps

1. `pnpm install` from monorepo root succeeds
2. `pnpm dev` starts development server
3. Browser shows page at http://localhost:3000
4. Dark theme is applied
5. Hot reload works

### 1.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/web/package.json` | Created | Package manifest |
| `packages/web/tsconfig.json` | Created | TypeScript config |
| `packages/web/next.config.js` | Created | Next.js config |
| `packages/web/tailwind.config.ts` | Created | Tailwind config |
| `packages/web/postcss.config.js` | Created | PostCSS config |
| `packages/web/app/layout.tsx` | Created | Root layout |
| `packages/web/app/globals.css` | Created | Global styles |
| `packages/web/app/page.tsx` | Created | Home page |
| `pnpm-workspace.yaml` | Modified | Add packages/web |

---

## Thrust 2: Design System

### 2.1 Objective

Set up shadcn/ui components and establish the design system.

### 2.2 Background

shadcn/ui provides:
- Accessible components built on Radix UI
- Tailwind-based styling
- Copy-paste components (not a package)
- Full customization control

### 2.3 Subtasks

#### 2.3.1 Initialize shadcn/ui

Set up shadcn/ui with configuration.

**Files to create:**
- `packages/web/components.json` - shadcn/ui configuration
- `packages/web/lib/utils.ts` - Utility functions (cn)

**Dog Food Work Order:**
```
Initialize shadcn/ui in packages/web:

1. Create components.json with:
   - style: "default"
   - rsc: true (React Server Components)
   - tailwind.config: "tailwind.config.ts"
   - aliases for components, utils, lib

2. Create lib/utils.ts with:
   - cn() function using clsx and tailwind-merge
   - Export for use in components

3. Install dependencies:
   - @radix-ui/react-slot
   - class-variance-authority
   - clsx
   - tailwind-merge

This enables the shadcn/ui add command.
```

#### 2.3.2 Add Core Components

Add the most commonly used components.

**Files to create:**
- `packages/web/components/ui/button.tsx`
- `packages/web/components/ui/card.tsx`
- `packages/web/components/ui/input.tsx`
- `packages/web/components/ui/label.tsx`
- `packages/web/components/ui/badge.tsx`
- `packages/web/components/ui/dialog.tsx`
- `packages/web/components/ui/dropdown-menu.tsx`
- `packages/web/components/ui/table.tsx`

**Dog Food Work Order:**
```
Add core shadcn/ui components to packages/web:

Using the shadcn/ui patterns, create these components:

1. button.tsx - with variants: default, destructive, outline, secondary, ghost, link
2. card.tsx - Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
3. input.tsx - styled input with focus ring
4. label.tsx - form label
5. badge.tsx - with variants: default, secondary, destructive, outline
6. dialog.tsx - modal dialog using Radix
7. dropdown-menu.tsx - menu using Radix
8. table.tsx - data table components

All components should:
- Use Tailwind for styling
- Support className prop via cn()
- Use dark theme colors
- Be fully accessible
```

#### 2.3.3 Create Theme Configuration

Define the color palette and design tokens.

**Files to modify:**
- `packages/web/tailwind.config.ts` - Add custom theme
- `packages/web/app/globals.css` - Add CSS variables

**Dog Food Work Order:**
```
Configure the design theme in packages/web:

1. In tailwind.config.ts, add custom colors:
   - background: near-black (#0F172A)
   - foreground: white (#F8FAFC)
   - card: dark gray (#1E293B)
   - primary: teal (#14B8A6)
   - secondary: purple (#8B5CF6)
   - muted: gray (#64748B)
   - destructive: red (#EF4444)
   - success: green (#22C55E)
   - border: gray (#334155)

2. In globals.css, add CSS variables for colors:
   - :root and .dark selectors
   - Variables like --background, --foreground, etc.

3. Add custom animations:
   - fadeIn, slideIn for transitions
```

#### 2.3.4 Create Layout Components

Create shared layout components.

**Files to create:**
- `packages/web/components/shared/header.tsx` - Site header
- `packages/web/components/shared/footer.tsx` - Site footer
- `packages/web/components/shared/sidebar.tsx` - Dashboard sidebar
- `packages/web/components/shared/nav-link.tsx` - Navigation link

**Dog Food Work Order:**
```
Create layout components in packages/web/components/shared:

1. header.tsx:
   - Logo on left
   - Navigation links in center (for marketing)
   - Login/Dashboard button on right
   - Dark background with subtle border bottom
   - Responsive (hamburger on mobile)

2. footer.tsx:
   - Links: Docs, Pricing, Blog, Contact
   - Social links: GitHub, Twitter
   - Copyright notice
   - Dark background

3. sidebar.tsx:
   - Dashboard navigation
   - Links: Overview, Runs, Billing, Settings
   - User profile at bottom
   - Collapsible on mobile

4. nav-link.tsx:
   - Styled link with active state
   - Icon + label pattern
```

### 2.4 Verification Steps

1. All components render without errors
2. Dark theme is applied consistently
3. Components are accessible (keyboard nav, ARIA)
4. Responsive design works
5. No Tailwind class conflicts

### 2.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/web/components.json` | Created | shadcn config |
| `packages/web/lib/utils.ts` | Created | Utilities |
| `packages/web/components/ui/*.tsx` | Created | UI components |
| `packages/web/components/shared/*.tsx` | Created | Layout components |
| `packages/web/tailwind.config.ts` | Modified | Theme colors |
| `packages/web/app/globals.css` | Modified | CSS variables |

---

## Thrust 3: Authentication

### 3.1 Objective

Implement authentication using NextAuth.js with GitHub OAuth.

### 3.2 Background

Authentication flow:
1. User clicks "Sign in with GitHub"
2. OAuth flow with GitHub
3. Create user in database (if new)
4. Create session
5. Redirect to dashboard

### 3.3 Subtasks

#### 3.3.1 Set Up Prisma

Configure Prisma for database access.

**Files to create:**
- `packages/web/prisma/schema.prisma` - Database schema
- `packages/web/lib/db.ts` - Prisma client

**Dog Food Work Order:**
```
Set up Prisma in packages/web:

1. Install dependencies: prisma, @prisma/client

2. Create prisma/schema.prisma with:
   - datasource: postgresql
   - generator: prisma-client-js
   - Models:
     - User (id, email, name, image, githubId, stripeCustomerId, etc.)
     - Account (for NextAuth)
     - Session (for NextAuth)
     - VerificationToken (for NextAuth)
     - ApiKey (id, key, name, userId, createdAt, lastUsed)
     - UserSettings (id, userId, preferences)

3. Create lib/db.ts:
   - Export singleton Prisma client
   - Handle edge runtime compatibility

Add prisma scripts to package.json: generate, migrate, studio.
```

#### 3.3.2 Configure NextAuth

Set up NextAuth with GitHub provider.

**Files to create:**
- `packages/web/lib/auth.ts` - NextAuth configuration
- `packages/web/app/api/auth/[...nextauth]/route.ts` - Auth API route

**Dog Food Work Order:**
```
Configure NextAuth in packages/web:

1. Install: next-auth@beta, @auth/prisma-adapter

2. Create lib/auth.ts with:
   - GitHub provider configuration
   - Prisma adapter
   - Session strategy: jwt
   - Callbacks:
     - jwt: add user.id to token
     - session: add user.id to session
   - Pages:
     - signIn: "/login"
     - error: "/login"

3. Create app/api/auth/[...nextauth]/route.ts:
   - Export GET and POST handlers from NextAuth

4. Create middleware.ts at root:
   - Protect /dashboard/* routes
   - Allow public routes: /, /pricing, /login, /api/auth/*
```

#### 3.3.3 Create Auth Context

Provide auth state to client components.

**Files to create:**
- `packages/web/components/providers/session-provider.tsx` - Session provider
- `packages/web/lib/auth-client.ts` - Client-side auth utilities

**Dog Food Work Order:**
```
Create auth utilities in packages/web:

1. components/providers/session-provider.tsx:
   - Wrap SessionProvider from next-auth/react
   - Export for use in root layout

2. lib/auth-client.ts:
   - useSession hook wrapper
   - signIn, signOut helper functions
   - getSession for server components

3. Update app/layout.tsx:
   - Wrap with SessionProvider

4. Create types/next-auth.d.ts:
   - Extend Session type to include user.id
```

#### 3.3.4 Implement Device Auth for TUI

Create device auth flow for TUI authentication.

**Files to create:**
- `packages/web/app/api/auth/device/route.ts` - Device code generation
- `packages/web/app/api/auth/device/[code]/route.ts` - Device code polling
- `packages/web/app/(auth)/device/page.tsx` - Device verification page

**Dog Food Work Order:**
```
Implement device auth flow in packages/web:

1. app/api/auth/device/route.ts (POST):
   - Generate random device code
   - Store in database with expiration (5 min)
   - Return { deviceCode, verificationUrl, expiresIn }

2. app/api/auth/device/[code]/route.ts (GET):
   - Look up device code
   - If authenticated: return { status: 'complete', token }
   - If pending: return { status: 'pending' }
   - If expired: return { status: 'expired' }

3. app/(auth)/device/page.tsx:
   - Show device code prominently
   - If not logged in: prompt to log in
   - If logged in: show "Authorize?" button
   - On authorize: mark device code as authenticated
   - Generate JWT token for TUI

The TUI will poll the device/[code] endpoint until authenticated.
```

### 3.4 Verification Steps

1. "Sign in with GitHub" redirects to GitHub
2. After GitHub auth, user is created in database
3. Session is created and persisted
4. Protected routes redirect to login
5. Device auth flow works end-to-end

### 3.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/web/prisma/schema.prisma` | Created | Database schema |
| `packages/web/lib/db.ts` | Created | Prisma client |
| `packages/web/lib/auth.ts` | Created | NextAuth config |
| `packages/web/app/api/auth/[...nextauth]/route.ts` | Created | Auth routes |
| `packages/web/app/api/auth/device/route.ts` | Created | Device auth |
| `packages/web/app/api/auth/device/[code]/route.ts` | Created | Device poll |
| `packages/web/app/(auth)/device/page.tsx` | Created | Device verify page |
| `packages/web/middleware.ts` | Created | Route protection |
| `packages/web/components/providers/session-provider.tsx` | Created | Session context |

---

## Phase 1 Completion Checklist

After completing Thrusts 1-3:

- [ ] Next.js project runs with `pnpm dev`
- [ ] Dark theme is applied
- [ ] shadcn/ui components work
- [ ] Design system colors are consistent
- [ ] Header/footer/sidebar render
- [ ] GitHub OAuth flow works
- [ ] Users are created in database
- [ ] Sessions persist across page loads
- [ ] Protected routes require login
- [ ] Device auth flow works for TUI

---

## Next Steps

After Phase 1, proceed to [03-marketing.md](./03-marketing.md) for landing and pricing pages.
