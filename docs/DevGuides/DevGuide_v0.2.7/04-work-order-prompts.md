# DevGuide v0.2.7: Work Order Prompts

This document contains the exact prompts and commands for each work order submission. Copy and run these commands in sequence.

---

## Prerequisites

Before starting, ensure:

```bash
# 1. GitHub token configured
export AGENTGATE_GITHUB_TOKEN=ghp_your_token_here

# 2. AgentGate built and available
cd /home/sf2/LabWork/Workspace/27-PMOS/5-CampaignBuilder/3-AgentGate
pnpm build

# 3. Verify CLI works
node dist/index.js --help
```

---

## Phase 1: HTTP Server (AgentGate Repository)

### WO-P1-001: Server Foundation

```bash
node dist/index.js submit \
  --prompt "Implement HTTP server foundation with Fastify for AgentGate.

REQUIREMENTS:
1. Add dependencies: fastify, @fastify/cors, @fastify/websocket
2. Create src/server/types.ts with ServerConfig, ApiResponse<T>, ApiError types using Zod schemas
3. Create src/server/app.ts with createApp(config) factory that:
   - Creates Fastify instance
   - Registers CORS plugin
   - Registers WebSocket plugin
   - Adds request ID generation
   - Adds error handler
   - Adds not found handler
4. Create src/server/routes/health.ts with:
   - GET /health - returns { status: 'ok', version }
   - GET /health/ready - checks components, returns { ready: boolean, checks: {...} }
   - GET /health/live - returns { alive: true }
5. Create src/server/index.ts with startServer(config) and stopServer(server)
6. Create src/control-plane/commands/serve.ts with CLI command:
   - Command: agentgate serve
   - Options: --port (default 3001), --host (default 0.0.0.0), --cors-origin
7. Update src/control-plane/cli.ts to register serve command

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm test passes (no regressions)
- pnpm build succeeds

See docs/DevGuides/DevGuide_v0.2.7/02-implementation.md Thrust 1 for complete details." \
  --github fl-sean03/AgentGate \
  --max-iterations 3
```

### WO-P1-002: Work Order API

```bash
node dist/index.js submit \
  --prompt "Add REST API endpoints for work order operations to AgentGate.

REQUIREMENTS:
1. Create src/server/types/api.ts with request/response types:
   - ListWorkOrdersQuery, CreateWorkOrderBody, CancelWorkOrderParams
   - WorkOrderListResponse, WorkOrderDetailResponse, CreateWorkOrderResponse

2. Create src/server/middleware/auth.ts with:
   - apiKeyAuth preHandler that validates Authorization: Bearer <key>
   - Returns 401 for invalid keys

3. Create src/server/routes/work-orders.ts with:
   - GET /api/v1/work-orders - list with status/limit/offset query params
   - GET /api/v1/work-orders/:id - get by ID, 404 if not found
   - POST /api/v1/work-orders - create (requires auth), validates with Zod
   - DELETE /api/v1/work-orders/:id - cancel (requires auth), 409 if completed

4. Create src/server/routes/runs.ts with:
   - GET /api/v1/runs - list runs
   - GET /api/v1/runs/:id - get run details

5. Update src/server/app.ts to register routes with /api/v1 prefix

6. Update src/control-plane/commands/serve.ts:
   - Add --api-key <key> option

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm test passes
- pnpm build succeeds

See docs/DevGuides/DevGuide_v0.2.7/02-implementation.md Thrust 2 for complete details." \
  --github fl-sean03/AgentGate \
  --max-iterations 3
```

### WO-P1-003: WebSocket Support

```bash
node dist/index.js submit \
  --prompt "Add WebSocket support for real-time updates to AgentGate.

REQUIREMENTS:
1. Create src/server/websocket/types.ts with:
   Client messages: SubscribeMessage, UnsubscribeMessage, PingMessage
   Server messages: WorkOrderCreatedEvent, WorkOrderUpdatedEvent, RunStartedEvent,
   RunIterationEvent, RunCompletedEvent, RunFailedEvent, PongMessage, ErrorMessage

2. Create src/server/websocket/broadcaster.ts with EventBroadcaster class:
   - Track active connections
   - broadcast(event) to relevant connections
   - broadcastToAll(event) to all
   - addConnection(conn), removeConnection(conn)

3. Create src/server/websocket/handler.ts with:
   - Message parsing
   - Handle subscribe/unsubscribe
   - Respond to pings with pongs
   - Connection cleanup on disconnect

4. Update src/orchestrator/orchestrator.ts:
   - Accept optional event broadcaster in config
   - Emit events on work order status changes
   - Emit events on run started/completed/failed
   - Emit events on iteration complete

5. Update src/server/app.ts:
   - Register WebSocket route at /ws
   - Create broadcaster instance

6. Create src/server/websocket/index.ts with module exports

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm test passes
- pnpm build succeeds

See docs/DevGuides/DevGuide_v0.2.7/02-implementation.md Thrust 3 for complete details." \
  --github fl-sean03/AgentGate \
  --max-iterations 3
```

---

## Phase 2: Frontend Dashboard (New Repository)

**IMPORTANT**: Phase 1 must be complete before starting Phase 2.

### WO-P2-001: Project Bootstrap

```bash
node dist/index.js submit \
  --prompt "Create a new React dashboard project for AgentGate.

REQUIREMENTS:
1. Initialize Vite + React + TypeScript project
2. Configure TailwindCSS with custom theme
3. Add dependencies:
   - @tanstack/react-query
   - react-router-dom
   - lucide-react
   - zod

4. Set up project structure:
   - src/main.tsx - entry with QueryClient and Router providers
   - src/App.tsx - main app with router
   - src/components/ - component directory
   - src/hooks/ - custom hooks
   - src/api/ - API client
   - src/types/ - TypeScript types
   - src/pages/ - page components

5. Configure ESLint and Prettier for React/TypeScript

6. Create verify.yaml for AgentGate verification:
   version: '1'
   environment:
     runtime: node
     runtimeVersion: '20'
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

7. Create README.md with setup instructions

VERIFICATION:
- pnpm install succeeds
- pnpm typecheck passes
- pnpm lint passes
- pnpm build succeeds

See docs/DevGuides/DevGuide_v0.2.7/03-frontend.md Thrust 4 for complete details." \
  --github-new fl-sean03/agentgate-dashboard \
  --template typescript \
  --max-iterations 3
```

### WO-P2-002: Core Layout

```bash
node dist/index.js submit \
  --prompt "Add core layout components to the AgentGate Dashboard.

REQUIREMENTS:
1. Create src/components/layout/:
   - Layout.tsx - main wrapper with sidebar and content area
   - Sidebar.tsx - left navigation with icons for Dashboard, Work Orders, Runs, Settings
   - Header.tsx - top header with AgentGate branding
   - MainContent.tsx - scrollable content area
   - index.ts - exports

2. Configure React Router with routes:
   - / - Dashboard
   - /work-orders - Work order list
   - /work-orders/:id - Work order detail
   - /runs - Run list
   - /runs/:id - Run detail
   - /settings - Settings

3. Create placeholder pages in src/pages/:
   - Dashboard.tsx
   - WorkOrders.tsx
   - WorkOrderDetail.tsx
   - Runs.tsx
   - RunDetail.tsx
   - Settings.tsx

4. Add responsive design:
   - Collapsible sidebar on mobile
   - Hamburger menu
   - Responsive content

5. Use Tailwind for styling with consistent design

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm build succeeds

See docs/DevGuides/DevGuide_v0.2.7/03-frontend.md Thrust 5 for complete details." \
  --github fl-sean03/agentgate-dashboard \
  --max-iterations 3
```

### WO-P2-003: Work Order List

```bash
node dist/index.js submit \
  --prompt "Implement work order list view for AgentGate Dashboard.

REQUIREMENTS:
1. Create src/types/work-order.ts with:
   - WorkOrder interface matching AgentGate API
   - WorkOrderStatus type (queued, running, succeeded, failed, canceled)
   - WorkspaceSource types

2. Create src/components/work-orders/:
   - WorkOrderCard.tsx - card display with status, prompt, date
   - WorkOrderList.tsx - grid of cards
   - WorkOrderFilters.tsx - status filter, search
   - StatusBadge.tsx - colored status indicator
   - index.ts - exports

3. Create src/mocks/work-orders.ts with sample data

4. Implement list features:
   - Grid/list view toggle
   - Filter by status
   - Sort by date
   - Empty state message
   - Click to navigate to detail

5. Update src/pages/WorkOrders.tsx to use components

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm build succeeds

See docs/DevGuides/DevGuide_v0.2.7/03-frontend.md Thrust 6 for complete details." \
  --github fl-sean03/agentgate-dashboard \
  --max-iterations 3
```

### WO-P2-004: Work Order Detail

```bash
node dist/index.js submit \
  --prompt "Implement work order detail view for AgentGate Dashboard.

REQUIREMENTS:
1. Create src/types/run.ts with:
   - Run interface
   - Iteration interface
   - VerificationReport interface (L0-L3 results)

2. Create src/components/work-orders/:
   - WorkOrderHeader.tsx - title, status, actions
   - WorkOrderInfo.tsx - task prompt, workspace source, config
   - WorkOrderTimeline.tsx - run timeline with iterations

3. Create src/components/runs/:
   - RunCard.tsx - run summary
   - IterationCard.tsx - iteration details
   - VerificationBadge.tsx - L0/L1/L2/L3 status indicators
   - index.ts - exports

4. Create src/mocks/runs.ts with sample data

5. Update src/pages/WorkOrderDetail.tsx:
   - Display all work order info
   - Show run history if exists
   - Cancel button for pending orders
   - Back navigation

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm build succeeds

See docs/DevGuides/DevGuide_v0.2.7/03-frontend.md Thrust 7 for complete details." \
  --github fl-sean03/agentgate-dashboard \
  --max-iterations 3
```

### WO-P2-005: Submission Form

```bash
node dist/index.js submit \
  --prompt "Create work order submission form for AgentGate Dashboard.

REQUIREMENTS:
1. Create src/components/forms/:
   - WorkOrderForm.tsx - main form component
   - WorkspaceSourceSelect.tsx - source type selector
   - AgentTypeSelect.tsx - agent dropdown
   - FormField.tsx - reusable field wrapper
   - TextArea.tsx - styled textarea
   - Button.tsx - styled button
   - index.ts - exports

2. Create src/components/common/Modal.tsx for form modal

3. Form fields:
   - Task Prompt (required, textarea)
   - Workspace Source Type (local, github, github-new)
   - Source details (dynamic based on type)
   - Agent Type (claude-code-subscription, etc.)
   - Max Iterations (1-10)
   - Max Time (seconds)

4. Add Zod validation:
   - Task prompt required, min 10 chars
   - Required fields validation
   - Numeric range validation

5. Update src/pages/WorkOrders.tsx:
   - Add 'New Work Order' button
   - Open modal on click

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm build succeeds

See docs/DevGuides/DevGuide_v0.2.7/03-frontend.md Thrust 8 for complete details." \
  --github fl-sean03/agentgate-dashboard \
  --max-iterations 3
```

### WO-P2-006: API Integration

```bash
node dist/index.js submit \
  --prompt "Connect AgentGate Dashboard to the HTTP API.

REQUIREMENTS:
1. Create src/api/client.ts:
   - Base URL from VITE_API_URL env var
   - Fetch wrapper with error handling
   - Type-safe request functions

2. Create API modules:
   - src/api/work-orders.ts - work order CRUD
   - src/api/runs.ts - run queries
   - src/api/index.ts - exports

3. Create React Query hooks in src/hooks/:
   - useWorkOrders.ts - list with filters
   - useWorkOrder.ts - single by ID
   - useCreateWorkOrder.ts - create mutation
   - useCancelWorkOrder.ts - cancel mutation
   - useRuns.ts - list runs
   - useRun.ts - single run
   - index.ts - exports

4. Update components to use hooks:
   - Replace mock data with API calls
   - Add loading states
   - Add error states

5. Create .env.example:
   VITE_API_URL=http://localhost:3001
   VITE_WS_URL=ws://localhost:3001/ws

6. Add API key configuration in Settings page

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm build succeeds

See docs/DevGuides/DevGuide_v0.2.7/03-frontend.md Thrust 9 for complete details." \
  --github fl-sean03/agentgate-dashboard \
  --max-iterations 3
```

### WO-P2-007: Real-time Updates

```bash
node dist/index.js submit \
  --prompt "Add WebSocket support for real-time updates to AgentGate Dashboard.

REQUIREMENTS:
1. Create src/api/websocket.ts:
   - WebSocket connection management
   - Automatic reconnection
   - Message parsing
   - Event subscription

2. Create src/hooks/useWebSocket.ts:
   - Connect on mount
   - Disconnect on unmount
   - Subscribe to work order events
   - Invalidate React Query cache on events

3. Create src/contexts/WebSocketContext.tsx:
   - Provide WebSocket state
   - Connection status
   - Subscribe/unsubscribe methods

4. Create src/components/common/:
   - ConnectionStatus.tsx - green/red indicator
   - Toast.tsx - notification component

5. Update components:
   - Live status badges
   - Auto-refresh on events
   - Connection status in header

6. Update src/main.tsx to add WebSocketProvider

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm build succeeds

See docs/DevGuides/DevGuide_v0.2.7/03-frontend.md Thrust 10 for complete details." \
  --github fl-sean03/agentgate-dashboard \
  --max-iterations 3
```

### WO-P2-008: Polish & Deploy

```bash
node dist/index.js submit \
  --prompt "Add final polish and deployment configuration to AgentGate Dashboard.

REQUIREMENTS:
1. Create src/components/common/:
   - LoadingSpinner.tsx - animated spinner
   - Skeleton.tsx - content skeleton
   - LoadingCard.tsx - card skeleton
   - ErrorDisplay.tsx - error message
   - ErrorBoundary.tsx - React error boundary

2. Create src/pages/NotFound.tsx for 404

3. Add empty states:
   - No work orders message with 'Create your first' CTA
   - No runs message
   - No results for filter

4. Improve UX:
   - Confirmation dialogs for cancel
   - Copy to clipboard for IDs
   - Better mobile experience

5. Implement Dashboard page with:
   - Summary stats (total, running, success rate)
   - Recent work orders
   - Quick 'New Work Order' action

6. Update README.md with:
   - Complete setup instructions
   - Environment variables
   - Deployment options

7. Optimize vite.config.ts for production

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm build succeeds

See docs/DevGuides/DevGuide_v0.2.7/03-frontend.md Thrust 11 for complete details." \
  --github fl-sean03/agentgate-dashboard \
  --max-iterations 3
```

---

## Execution Checklist

### Phase 1 Execution

- [ ] WO-P1-001: Submit, wait for PR, review, merge
  - [ ] `git pull && pnpm install && pnpm build`
  - [ ] Verify: `node dist/index.js serve --port 3001`
  - [ ] Test: `curl http://localhost:3001/health`

- [ ] WO-P1-002: Submit, wait for PR, review, merge
  - [ ] `git pull && pnpm install && pnpm build`
  - [ ] Verify: `node dist/index.js serve --port 3001 --api-key test123`
  - [ ] Test: `curl http://localhost:3001/api/v1/work-orders`

- [ ] WO-P1-003: Submit, wait for PR, review, merge
  - [ ] `git pull && pnpm install && pnpm build`
  - [ ] Test: `wscat -c ws://localhost:3001/ws`

### Phase 2 Execution

- [ ] Start AgentGate server: `node dist/index.js serve --port 3001 --api-key test123`

- [ ] WO-P2-001: Submit with `--github-new`, wait for PR, merge
  - [ ] Creates new repo: fl-sean03/agentgate-dashboard

- [ ] WO-P2-002: Submit with `--github`, wait for PR, merge
- [ ] WO-P2-003: Submit, wait, merge
- [ ] WO-P2-004: Submit, wait, merge
- [ ] WO-P2-005: Submit, wait, merge
- [ ] WO-P2-006: Submit, wait, merge
- [ ] WO-P2-007: Submit, wait, merge
- [ ] WO-P2-008: Submit, wait, merge

### Final Validation

```bash
# Clone and run the dashboard
git clone https://github.com/fl-sean03/agentgate-dashboard.git
cd agentgate-dashboard
pnpm install
cp .env.example .env
# Edit .env: VITE_API_URL=http://localhost:3001
pnpm dev

# Open http://localhost:5173
# Verify all features work end-to-end
```

---

## Troubleshooting

### Work Order Fails

If a work order fails verification:
1. Check the run status: `agentgate status <work-order-id>`
2. Review the iteration logs
3. Check the PR for any partial progress
4. Adjust the prompt if needed and resubmit

### Merge Conflicts

If there are merge conflicts (unlikely with sequential execution):
1. Pull the latest branch
2. Resolve conflicts
3. Force push if needed

### Server Not Starting

If `agentgate serve` fails after Phase 1:
1. Check build output for errors
2. Verify all dependencies installed
3. Check for port conflicts
