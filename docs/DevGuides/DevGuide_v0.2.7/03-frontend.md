# DevGuide v0.2.7: Phase 2 - Frontend Dashboard Implementation

This document contains detailed thrust specifications for building the AgentGate Dashboard frontend. **All thrusts are implemented via AgentGate work orders** to a new GitHub repository.

---

## Execution Strategy

Phase 2 creates a new repository for the dashboard:

1. First work order creates new GitHub repo: `fl-sean03/agentgate-dashboard`
2. Subsequent work orders target this new repo
3. Each work order creates a branch `agentgate/<run-id>`
4. Agent implements the thrust, verification runs
5. PR is created automatically on success
6. Human reviews, merges
7. Continue with next work order

**Prerequisite**: Phase 1 must be complete so AgentGate has HTTP server capability.

---

## Thrust 4: Project Bootstrap (WO-P2-001)

### 4.1 Objective

Create a new React/Vite/TypeScript project with TailwindCSS in a new GitHub repository.

### 4.2 Background

The dashboard needs a modern React frontend with:
- Fast development with Vite
- Type safety with TypeScript
- Rapid styling with TailwindCSS
- State management with React Query

### 4.3 Implementation Requirements

The agent must:

**4.3.1 Create Project Structure**

Initialize a Vite + React + TypeScript project with:
- React 18+
- TypeScript 5+
- Vite 5+
- TailwindCSS 3+

**4.3.2 Configure TailwindCSS**

Set up Tailwind with:
- `tailwind.config.js` with custom theme colors
- `postcss.config.js`
- Base styles in `src/index.css`

**4.3.3 Add Core Dependencies**

Install and configure:
- `@tanstack/react-query` - Async state management
- `react-router-dom` - Client-side routing
- `lucide-react` - Icon library
- `zod` - Runtime validation

**4.3.4 Create Basic App Structure**

Set up:
- `src/main.tsx` - Entry point with providers
- `src/App.tsx` - Main app with router
- `src/routes/` - Route definitions
- `src/components/` - Component directory
- `src/hooks/` - Custom hooks
- `src/api/` - API client
- `src/types/` - TypeScript types

**4.3.5 Configure ESLint and Prettier**

Add linting with:
- ESLint with React and TypeScript rules
- Prettier for formatting
- Lint script in package.json

**4.3.6 Add verify.yaml**

Create gate plan for AgentGate verification:
```yaml
version: "1"
environment:
  runtime: node
  runtimeVersion: "20"
  setupCommands:
    - name: install
      command: pnpm install
tests:
  - name: typecheck
    command: pnpm typecheck
  - name: lint
    command: pnpm lint
  - name: build
    command: pnpm build
```

**4.3.7 Create README**

Document project setup and development workflow.

### 4.4 Verification Requirements

1. `pnpm install` succeeds
2. `pnpm typecheck` passes
3. `pnpm lint` passes
4. `pnpm build` succeeds
5. `pnpm dev` starts dev server

### 4.5 Files Created

| File | Purpose |
|------|---------|
| `package.json` | Project configuration |
| `vite.config.ts` | Vite configuration |
| `tailwind.config.js` | Tailwind configuration |
| `postcss.config.js` | PostCSS configuration |
| `tsconfig.json` | TypeScript configuration |
| `.eslintrc.cjs` | ESLint configuration |
| `.prettierrc` | Prettier configuration |
| `src/main.tsx` | Entry point |
| `src/App.tsx` | Main app component |
| `src/index.css` | Global styles |
| `verify.yaml` | AgentGate gate plan |
| `README.md` | Documentation |

---

## Thrust 5: Core Layout (WO-P2-002)

### 5.1 Objective

Create the main application layout with navigation, header, and content area.

### 5.2 Implementation Requirements

The agent must:

**5.2.1 Create Layout Components**

Create `src/components/layout/`:
- `Layout.tsx` - Main layout wrapper with sidebar and content
- `Sidebar.tsx` - Left navigation with links
- `Header.tsx` - Top header with branding and user info
- `MainContent.tsx` - Scrollable content area

**5.2.2 Implement Navigation**

Sidebar navigation items:
- Dashboard (home icon)
- Work Orders (list icon)
- Runs (play icon)
- Settings (gear icon)

**5.2.3 Configure Routes**

Set up React Router with:
- `/` - Dashboard home
- `/work-orders` - Work order list
- `/work-orders/:id` - Work order detail
- `/runs` - Run list
- `/runs/:id` - Run detail
- `/settings` - Settings page

**5.2.4 Add Responsive Design**

- Collapsible sidebar on mobile
- Hamburger menu for mobile nav
- Responsive content area

**5.2.5 Create Page Components**

Create placeholder pages:
- `src/pages/Dashboard.tsx`
- `src/pages/WorkOrders.tsx`
- `src/pages/WorkOrderDetail.tsx`
- `src/pages/Runs.tsx`
- `src/pages/RunDetail.tsx`
- `src/pages/Settings.tsx`

### 5.3 Verification Requirements

1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. `pnpm build` succeeds
4. Navigation between pages works

### 5.4 Files Created/Modified

| File | Action |
|------|--------|
| `src/components/layout/Layout.tsx` | Created |
| `src/components/layout/Sidebar.tsx` | Created |
| `src/components/layout/Header.tsx` | Created |
| `src/components/layout/MainContent.tsx` | Created |
| `src/components/layout/index.ts` | Created |
| `src/pages/Dashboard.tsx` | Created |
| `src/pages/WorkOrders.tsx` | Created |
| `src/pages/WorkOrderDetail.tsx` | Created |
| `src/pages/Runs.tsx` | Created |
| `src/pages/RunDetail.tsx` | Created |
| `src/pages/Settings.tsx` | Created |
| `src/App.tsx` | Modified |

---

## Thrust 6: Work Order List (WO-P2-003)

### 6.1 Objective

Implement the work order list view with filtering, sorting, and status display.

### 6.2 Implementation Requirements

The agent must:

**6.2.1 Create Work Order Types**

Create `src/types/work-order.ts` with:
- `WorkOrder` interface matching API
- `WorkOrderStatus` type
- `WorkspaceSource` type
- List/filter types

**6.2.2 Create Work Order Components**

Create `src/components/work-orders/`:
- `WorkOrderCard.tsx` - Card display for single work order
- `WorkOrderList.tsx` - List/grid of work order cards
- `WorkOrderFilters.tsx` - Filter controls (status, date)
- `StatusBadge.tsx` - Colored status indicator

**6.2.3 Implement List Features**

- Grid/list view toggle
- Filter by status (queued, running, succeeded, failed)
- Sort by date, status
- Pagination or infinite scroll
- Empty state message

**6.2.4 Create Mock Data**

Create `src/mocks/work-orders.ts` with sample data for development.

**6.2.5 Update Work Orders Page**

Implement `src/pages/WorkOrders.tsx`:
- Use WorkOrderList component
- Add filters bar
- Link to detail pages

### 6.3 Verification Requirements

1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. `pnpm build` succeeds
4. Work order list renders with mock data

### 6.4 Files Created/Modified

| File | Action |
|------|--------|
| `src/types/work-order.ts` | Created |
| `src/components/work-orders/WorkOrderCard.tsx` | Created |
| `src/components/work-orders/WorkOrderList.tsx` | Created |
| `src/components/work-orders/WorkOrderFilters.tsx` | Created |
| `src/components/work-orders/StatusBadge.tsx` | Created |
| `src/components/work-orders/index.ts` | Created |
| `src/mocks/work-orders.ts` | Created |
| `src/pages/WorkOrders.tsx` | Modified |

---

## Thrust 7: Work Order Detail (WO-P2-004)

### 7.1 Objective

Implement the work order detail view with full information and run timeline.

### 7.2 Implementation Requirements

The agent must:

**7.2.1 Create Run Types**

Create `src/types/run.ts` with:
- `Run` interface
- `Iteration` interface
- `VerificationReport` interface

**7.2.2 Create Detail Components**

Create `src/components/work-orders/`:
- `WorkOrderHeader.tsx` - Title, status, actions
- `WorkOrderInfo.tsx` - Task prompt, workspace, config
- `WorkOrderTimeline.tsx` - Run timeline with iterations

**7.2.3 Create Run Components**

Create `src/components/runs/`:
- `RunCard.tsx` - Summary of a run
- `IterationCard.tsx` - Single iteration details
- `VerificationBadge.tsx` - L0-L3 verification status

**7.2.4 Implement Detail Page**

Update `src/pages/WorkOrderDetail.tsx`:
- Fetch work order by ID
- Display all sections
- Show run history if exists
- Cancel button for pending orders

**7.2.5 Add Navigation**

- Back button to list
- Link to full run view

### 7.3 Verification Requirements

1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. `pnpm build` succeeds
4. Detail page renders with mock data

### 7.4 Files Created/Modified

| File | Action |
|------|--------|
| `src/types/run.ts` | Created |
| `src/components/work-orders/WorkOrderHeader.tsx` | Created |
| `src/components/work-orders/WorkOrderInfo.tsx` | Created |
| `src/components/work-orders/WorkOrderTimeline.tsx` | Created |
| `src/components/runs/RunCard.tsx` | Created |
| `src/components/runs/IterationCard.tsx` | Created |
| `src/components/runs/VerificationBadge.tsx` | Created |
| `src/components/runs/index.ts` | Created |
| `src/mocks/runs.ts` | Created |
| `src/pages/WorkOrderDetail.tsx` | Modified |

---

## Thrust 8: Submission Form (WO-P2-005)

### 8.1 Objective

Create a form for submitting new work orders.

### 8.2 Implementation Requirements

The agent must:

**8.2.1 Create Form Components**

Create `src/components/forms/`:
- `WorkOrderForm.tsx` - Main form component
- `WorkspaceSourceSelect.tsx` - Source type selector
- `AgentTypeSelect.tsx` - Agent type dropdown
- `FormField.tsx` - Reusable form field wrapper
- `TextArea.tsx` - Styled textarea
- `Button.tsx` - Styled button

**8.2.2 Implement Form Fields**

Form fields:
- Task Prompt (required, textarea)
- Workspace Source Type (select: local, github, github-new)
- Source Details (dynamic based on type)
- Agent Type (select: claude-code, claude-code-subscription, etc.)
- Max Iterations (number, 1-10)
- Max Time (number, seconds)

**8.2.3 Add Validation**

Use Zod for validation:
- Task prompt required, min 10 chars
- Workspace source required
- Path/URL validation based on type
- Numeric range validation

**8.2.4 Create Submit Modal**

Create modal for new work order:
- Opens from Work Orders page
- Closes on success
- Shows error on failure

**8.2.5 Update Work Orders Page**

Add "New Work Order" button that opens form modal.

### 8.3 Verification Requirements

1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. `pnpm build` succeeds
4. Form renders and validates

### 8.4 Files Created/Modified

| File | Action |
|------|--------|
| `src/components/forms/WorkOrderForm.tsx` | Created |
| `src/components/forms/WorkspaceSourceSelect.tsx` | Created |
| `src/components/forms/AgentTypeSelect.tsx` | Created |
| `src/components/forms/FormField.tsx` | Created |
| `src/components/forms/TextArea.tsx` | Created |
| `src/components/forms/Button.tsx` | Created |
| `src/components/forms/index.ts` | Created |
| `src/components/common/Modal.tsx` | Created |
| `src/pages/WorkOrders.tsx` | Modified |

---

## Thrust 9: API Integration (WO-P2-006)

### 9.1 Objective

Connect the dashboard to the AgentGate HTTP API.

### 9.2 Implementation Requirements

The agent must:

**9.2.1 Create API Client**

Create `src/api/client.ts`:
- Base URL configuration (env var)
- Request/response interceptors
- Error handling
- Type-safe requests

**9.2.2 Create API Hooks**

Create `src/hooks/`:
- `useWorkOrders.ts` - List work orders with React Query
- `useWorkOrder.ts` - Get single work order
- `useCreateWorkOrder.ts` - Submit mutation
- `useCancelWorkOrder.ts` - Cancel mutation
- `useRuns.ts` - List runs
- `useRun.ts` - Get single run

**9.2.3 Update Components**

Replace mock data with API calls:
- WorkOrderList uses useWorkOrders
- WorkOrderDetail uses useWorkOrder
- WorkOrderForm uses useCreateWorkOrder
- Add loading states
- Add error states

**9.2.4 Add Environment Configuration**

Create `.env.example`:
```
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001/ws
```

**9.2.5 Handle Authentication**

Add API key configuration:
- Store in localStorage or environment
- Add to Authorization header
- Settings page for API key input

### 9.3 Verification Requirements

1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. `pnpm build` succeeds

### 9.4 Files Created/Modified

| File | Action |
|------|--------|
| `src/api/client.ts` | Created |
| `src/api/work-orders.ts` | Created |
| `src/api/runs.ts` | Created |
| `src/api/index.ts` | Created |
| `src/hooks/useWorkOrders.ts` | Created |
| `src/hooks/useWorkOrder.ts` | Created |
| `src/hooks/useCreateWorkOrder.ts` | Created |
| `src/hooks/useCancelWorkOrder.ts` | Created |
| `src/hooks/useRuns.ts` | Created |
| `src/hooks/useRun.ts` | Created |
| `src/hooks/index.ts` | Created |
| `src/pages/Settings.tsx` | Modified |
| `.env.example` | Created |

---

## Thrust 10: Real-time Updates (WO-P2-007)

### 10.1 Objective

Add WebSocket support for real-time status updates.

### 10.2 Implementation Requirements

The agent must:

**10.2.1 Create WebSocket Client**

Create `src/api/websocket.ts`:
- Connection management
- Automatic reconnection
- Message parsing
- Event subscription

**10.2.2 Create WebSocket Hook**

Create `src/hooks/useWebSocket.ts`:
- Connect on mount
- Disconnect on unmount
- Subscribe to work order updates
- Invalidate React Query cache on events

**10.2.3 Create WebSocket Context**

Create `src/contexts/WebSocketContext.tsx`:
- Provide WebSocket state to components
- Connection status indicator
- Event subscription methods

**10.2.4 Update Components**

Add real-time features:
- Live status badges
- Auto-refresh on events
- Iteration progress updates
- Connection status in header

**10.2.5 Add Visual Indicators**

- Pulsing indicator for running work orders
- Toast notifications for completions
- Sound option for notifications (disabled by default)

### 10.3 Verification Requirements

1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. `pnpm build` succeeds

### 10.4 Files Created/Modified

| File | Action |
|------|--------|
| `src/api/websocket.ts` | Created |
| `src/hooks/useWebSocket.ts` | Created |
| `src/contexts/WebSocketContext.tsx` | Created |
| `src/components/common/ConnectionStatus.tsx` | Created |
| `src/components/common/Toast.tsx` | Created |
| `src/components/layout/Header.tsx` | Modified |
| `src/main.tsx` | Modified |

---

## Thrust 11: Polish & Deploy (WO-P2-008)

### 11.1 Objective

Final polish, error handling, and deployment configuration.

### 11.2 Implementation Requirements

The agent must:

**11.2.1 Add Loading States**

Create `src/components/common/`:
- `LoadingSpinner.tsx` - Animated spinner
- `Skeleton.tsx` - Content skeleton
- `LoadingCard.tsx` - Card skeleton

**11.2.2 Add Error States**

Create error components:
- `ErrorDisplay.tsx` - General error message
- `NotFound.tsx` - 404 page
- `ErrorBoundary.tsx` - React error boundary

**11.2.3 Add Empty States**

Create empty state messages:
- No work orders message with CTA
- No runs message
- No results for filter

**11.2.4 Improve UX**

- Keyboard shortcuts (n for new, / for search)
- Confirmation dialogs for destructive actions
- Copy to clipboard for IDs
- Better mobile experience

**11.2.5 Add Dashboard Page**

Implement Dashboard with:
- Summary stats (total, running, success rate)
- Recent work orders
- Quick actions

**11.2.6 Update README**

Document:
- Setup instructions
- Environment variables
- Development workflow
- Deployment options

**11.2.7 Add Build Configuration**

Configure for production:
- Optimized build
- Environment variable handling
- Asset optimization

### 11.3 Verification Requirements

1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. `pnpm build` succeeds
4. Production build runs correctly

### 11.4 Files Created/Modified

| File | Action |
|------|--------|
| `src/components/common/LoadingSpinner.tsx` | Created |
| `src/components/common/Skeleton.tsx` | Created |
| `src/components/common/LoadingCard.tsx` | Created |
| `src/components/common/ErrorDisplay.tsx` | Created |
| `src/components/common/ErrorBoundary.tsx` | Created |
| `src/pages/NotFound.tsx` | Created |
| `src/pages/Dashboard.tsx` | Modified |
| `README.md` | Modified |
| `vite.config.ts` | Modified |

---

## Phase 2 Execution Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Phase 2 Execution Flow                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Prerequisite: Phase 1 complete, AgentGate HTTP server running              │
│                                                                              │
│  1. Submit WO-P2-001 (Project Bootstrap) - Creates new repo                 │
│     └─► agentgate submit --prompt "..." --github-new fl-sean03/agentgate-dashboard │
│                                                                              │
│  2. Wait for completion                                                      │
│     └─► Monitor: agentgate status <work-order-id>                           │
│                                                                              │
│  3. Review PR on GitHub                                                      │
│     └─► Check code, merge                                                   │
│                                                                              │
│  4. Submit WO-P2-002 (Core Layout)                                          │
│     └─► agentgate submit --prompt "..." --github fl-sean03/agentgate-dashboard │
│                                                                              │
│  5. Repeat for WO-P2-003 through WO-P2-008                                  │
│                                                                              │
│  6. Final: Clone repo, configure .env, run dev server                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Post-Phase 2 Validation

After all eight work orders are merged:

```bash
# Clone the dashboard
git clone https://github.com/fl-sean03/agentgate-dashboard.git
cd agentgate-dashboard

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env to set VITE_API_URL to your AgentGate server

# Start development server
pnpm dev

# Open http://localhost:5173
# Should see dashboard connected to AgentGate API

# Verify features:
# - Work order list loads from API
# - Can submit new work order
# - Real-time updates when work orders change
# - Navigation between pages works
```

---

## Deployment Options

### Option A: Vercel (Recommended)

```bash
# Install Vercel CLI
pnpm add -g vercel

# Deploy
cd agentgate-dashboard
vercel
```

### Option B: Static Hosting

```bash
# Build
pnpm build

# Deploy dist/ folder to any static host:
# - GitHub Pages
# - Netlify
# - Cloudflare Pages
# - S3 + CloudFront
```

### Option C: Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
```
