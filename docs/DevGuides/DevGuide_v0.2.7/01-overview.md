# DevGuide v0.2.7: Overview

This document provides the architectural context and design decisions for implementing the AgentGate Dashboard.

---

## Background

### Current State

AgentGate is a CLI-only tool that:
- Accepts work orders via command line (`agentgate submit`)
- Executes AI agents (Claude Code, OpenAI Codex, OpenCode)
- Verifies output through L0-L3 pipeline
- Creates GitHub PRs for approved work
- Stores work orders in local JSON files

**Limitations**:
- No HTTP API for programmatic access
- No web interface for management
- Requires terminal access
- No real-time status visibility without watching logs

### Target State

AgentGate becomes a full-featured platform:
- HTTP server mode for API access
- WebSocket for real-time updates
- Web dashboard for management
- Same CLI functionality preserved
- Remote access capabilities

---

## Architectural Decisions

### AD-1: Fastify for HTTP Server

**Decision**: Use Fastify instead of Express

**Rationale**:
- Native TypeScript support with excellent type inference
- 2-3x faster than Express in benchmarks
- Plugin architecture aligns with AgentGate's modular design
- First-class WebSocket support via `@fastify/websocket`
- Built-in request validation with JSON Schema
- Better error handling out of the box

**Alternatives Considered**:
- **Express**: More familiar, but slower and requires more TypeScript setup
- **Hono**: Newer, but less mature ecosystem
- **Koa**: Middle ground, but less TypeScript-native

### AD-2: Separate Frontend Repository

**Decision**: Frontend lives in a separate GitHub repository

**Rationale**:
- Clean separation of concerns
- Independent deployment (frontend can be static hosted)
- Demonstrates AgentGate's GitHub integration
- Allows different release cycles
- Frontend can be built entirely by AgentGate work orders

**Trade-offs**:
- Requires CORS configuration
- Two repos to maintain
- Version coordination needed

### AD-3: React + Vite + TailwindCSS

**Decision**: Modern React stack for frontend

**Rationale**:
- **React**: Industry standard, Claude Code knows it well
- **Vite**: Fastest build tool, excellent DX
- **TailwindCSS**: Rapid styling, consistent design, no CSS files needed
- **TypeScript**: Type safety, better agent understanding
- **React Query**: Perfect for API-heavy dashboards

**Stack Details**:
```
Frontend Stack:
├── react@18           # UI library
├── vite@5             # Build tool
├── typescript@5       # Type safety
├── tailwindcss@3      # Styling
├── @tanstack/react-query@5  # Async state
├── react-router@6     # Routing
├── lucide-react       # Icons
└── zod                # Runtime validation
```

### AD-4: REST + WebSocket API

**Decision**: REST for CRUD, WebSocket for real-time

**Rationale**:
- REST is familiar, easy to debug, cacheable
- WebSocket enables instant status updates
- Hybrid approach gives best of both worlds
- GraphQL overkill for this use case

**API Structure**:
```
REST Endpoints:
  GET    /api/v1/work-orders          # List work orders
  GET    /api/v1/work-orders/:id      # Get work order details
  POST   /api/v1/work-orders          # Submit new work order
  DELETE /api/v1/work-orders/:id      # Cancel work order
  GET    /api/v1/runs                 # List runs
  GET    /api/v1/runs/:id             # Get run details

WebSocket Events:
  connect                             # Client connected
  workorder:created                   # New work order submitted
  workorder:updated                   # Status change
  run:started                         # Run began
  run:iteration                       # Iteration complete
  run:completed                       # Run finished
  run:failed                          # Run failed
```

### AD-5: Fully Self-Building via AgentGate

**Decision**: Use AgentGate to build BOTH the HTTP server AND its own frontend

**Rationale**:
- Proves the system can modify its own codebase
- Rigorous end-to-end test of self-extension capability
- Demonstrates capability to stakeholders
- Dogfooding reveals issues early
- Creates a compelling narrative
- Documents the workflow through DevGuide

**Process**:
1. Submit work orders for HTTP server (Phase 1) to AgentGate repo
2. Review PRs, merge, rebuild AgentGate
3. Start AgentGate server (now with HTTP API)
4. Submit work orders for frontend (Phase 2) to new repo
5. AgentGate builds each component
6. Review PRs, merge, continue
7. Final result: HTTP API + production dashboard, all self-built

---

## Component Architecture

### HTTP Server Components

```
src/
└── server/
    ├── index.ts                 # Server entry point
    ├── app.ts                   # Fastify app configuration
    ├── routes/
    │   ├── health.ts           # Health check endpoints
    │   ├── work-orders.ts      # Work order CRUD
    │   └── runs.ts             # Run management
    ├── websocket/
    │   ├── handler.ts          # WebSocket connection handler
    │   └── events.ts           # Event broadcasting
    ├── middleware/
    │   ├── auth.ts             # API key authentication
    │   └── error.ts            # Error handling
    └── types/
        └── api.ts              # API request/response types
```

### Frontend Components (Built by AgentGate)

```
agentgate-dashboard/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── MainContent.tsx
│   │   ├── work-orders/
│   │   │   ├── WorkOrderList.tsx
│   │   │   ├── WorkOrderCard.tsx
│   │   │   ├── WorkOrderDetail.tsx
│   │   │   └── WorkOrderForm.tsx
│   │   ├── runs/
│   │   │   ├── RunTimeline.tsx
│   │   │   ├── IterationCard.tsx
│   │   │   └── VerificationBadge.tsx
│   │   └── common/
│   │       ├── StatusBadge.tsx
│   │       ├── LoadingSpinner.tsx
│   │       └── ErrorDisplay.tsx
│   ├── hooks/
│   │   ├── useWorkOrders.ts
│   │   ├── useWebSocket.ts
│   │   └── useApi.ts
│   ├── api/
│   │   └── client.ts
│   ├── types/
│   │   └── index.ts
│   └── App.tsx
├── tailwind.config.js
├── vite.config.ts
└── package.json
```

---

## API Design

### Authentication

Simple API key authentication for initial version:

```typescript
// Header-based auth
Authorization: Bearer <api-key>

// API key management via CLI
agentgate auth api-key --generate
agentgate auth api-key --list
agentgate auth api-key --revoke <key-id>
```

**Security Notes**:
- API keys stored hashed in config
- Rate limiting per key
- Scope restrictions possible (read-only, full access)
- Future: OAuth2, JWT tokens

### Request/Response Format

All API responses follow consistent format:

```typescript
// Success response
{
  "success": true,
  "data": { /* payload */ },
  "meta": {
    "timestamp": "2025-12-31T00:00:00Z",
    "requestId": "req-xxx"
  }
}

// Error response
{
  "success": false,
  "error": {
    "code": "WORK_ORDER_NOT_FOUND",
    "message": "Work order with ID 'xxx' not found",
    "details": { /* additional info */ }
  },
  "meta": {
    "timestamp": "2025-12-31T00:00:00Z",
    "requestId": "req-xxx"
  }
}
```

### WebSocket Protocol

```typescript
// Client -> Server
{
  "type": "subscribe",
  "payload": {
    "workOrderId": "wo-xxx"  // Subscribe to specific work order
  }
}

// Server -> Client
{
  "type": "workorder:updated",
  "payload": {
    "workOrderId": "wo-xxx",
    "status": "running",
    "runId": "run-xxx",
    "iteration": 2
  },
  "timestamp": "2025-12-31T00:00:00Z"
}
```

---

## Data Flow

### Work Order Submission

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Dashboard  │────▶│  HTTP API    │────▶│ Work Order   │
│  (Submit     │     │  POST /api/  │     │ Service      │
│   Form)      │     │  work-orders │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                                                  │
                                                  ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Dashboard  │◀────│  WebSocket   │◀────│ Orchestrator │
│  (Real-time  │     │  Event       │     │ (Runs agent, │
│   Updates)   │     │  Broadcast   │     │  verifies)   │
└──────────────┘     └──────────────┘     └──────────────┘
```

### State Synchronization

1. Dashboard loads initial state via REST API
2. WebSocket connection established
3. Server broadcasts events on state changes
4. Dashboard updates local state via React Query
5. Optimistic updates for user actions

---

## Security Considerations

### Phase 1: HTTP Server

- **API Key Auth**: Required for all mutations
- **CORS**: Restrict to known origins
- **Rate Limiting**: Prevent abuse
- **Input Validation**: Zod schemas on all inputs
- **No Secret Exposure**: API keys never in responses

### Phase 2: Frontend

- **Environment Variables**: API URL, not keys in client
- **HTTPS Only**: Enforce in production
- **CSP Headers**: Prevent XSS
- **No Sensitive Data**: Keys managed server-side

### Future Enhancements

- OAuth2 / OpenID Connect
- Role-based access control
- Audit logging
- IP allowlisting

---

## Deployment Model

### Development

```bash
# Terminal 1: AgentGate server
agentgate serve --port 3001

# Terminal 2: Frontend dev server
cd agentgate-dashboard
pnpm dev  # Vite on port 5173
```

### Production Options

**Option A: Same Server**
- Fastify serves both API and static frontend
- Single process, simple deployment
- Built frontend copied to `dist/public/`

**Option B: Separate Services**
- Frontend on Vercel/Netlify/Cloudflare Pages
- API on dedicated server/container
- Better scaling, CDN for frontend

**Option C: Docker Compose**
```yaml
services:
  api:
    build: .
    command: agentgate serve
    ports: ["3001:3001"]

  dashboard:
    build: ./dashboard
    ports: ["3000:80"]
```

---

## Testing Strategy

### HTTP Server Tests

- Unit tests for route handlers
- Integration tests with supertest
- WebSocket tests with ws client
- Mock orchestrator for isolation

### Frontend Tests (Created by AgentGate)

- Component tests with Vitest + Testing Library
- Hook tests for API integration
- E2E tests with Playwright (optional)

### Self-Build Verification

Each AgentGate work order includes:
- TypeScript compilation check
- Lint verification
- Test execution
- Build success check

---

## Timeline & Milestones

### Phase 1: HTTP Server (Thrusts 1-3)
- **Effort**: 2-3 hours direct implementation
- **Outcome**: Working HTTP API server

### Phase 2: Frontend (Thrusts 4-11)
- **Effort**: 8 work order submissions
- **Per Work Order**: ~15-30 minutes (agent execution + verification)
- **Total**: ~4-6 hours including review time
- **Outcome**: Production-ready dashboard

### Validation Gates

| Gate | Verification |
|------|--------------|
| Phase 1 Complete | `agentgate serve` starts, `/health` responds |
| WO-001 Complete | React project created, builds successfully |
| WO-004 Complete | Can view work order details |
| WO-006 Complete | Dashboard connected to real API |
| Final | Full workflow: submit via dashboard, watch live updates |

---

## Risk Mitigation

### Risk: Agent Fails to Build Frontend

**Mitigation**:
- Clear, detailed prompts in DevGuide
- TypeScript template provides starting structure
- Each work order is small and focused
- Can fall back to manual implementation

### Risk: API Design Changes During Development

**Mitigation**:
- API types defined upfront
- Mock API layer in frontend for development
- Version API endpoints (/api/v1/)

### Risk: WebSocket Complexity

**Mitigation**:
- Start with polling fallback
- WebSocket as progressive enhancement
- React Query refetch intervals as backup

---

## Related Documents

- [02-implementation.md](./02-implementation.md) - HTTP Server thrust details
- [03-frontend.md](./03-frontend.md) - Frontend thrust details
- [04-work-order-prompts.md](./04-work-order-prompts.md) - Exact prompts for submissions
- [05-appendices.md](./05-appendices.md) - Checklists and references
