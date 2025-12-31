# DevGuide v0.2.7: Phase 1 - HTTP Server Implementation

This document contains detailed thrust specifications for implementing the AgentGate HTTP server. **All thrusts are implemented via AgentGate work orders**, demonstrating the system's ability to extend itself.

---

## Execution Strategy

Phase 1 uses AgentGate to modify its own codebase. **This is a rigorous stress test of AgentGate's self-modification capabilities** - the system must successfully extend itself through its own work order mechanism.

### Sequential Workflow (Critical)

Work orders MUST be executed sequentially with full merge cycles:

1. **Ensure clean state** - `main` branch must be up-to-date with all prior changes
2. **Submit work order** - Target the AgentGate GitHub repository
3. **Monitor execution** - Check progress per monitoring protocol below
4. **Review PR** - Agent creates PR automatically on success
5. **Merge to main** - Human reviews code, runs tests, merges PR
6. **Rebuild AgentGate** - `git pull && pnpm install && pnpm build`
7. **Verify** - Test the new functionality works
8. **Repeat** - Only then submit the next work order

**Why sequential?** Each thrust builds on prior work. WO-P1-002 needs the server from WO-P1-001. WO-P1-003 needs the routes from WO-P1-002. Submitting work orders in parallel or before merging will cause failures.

### Monitoring Protocol

Work orders run as background tasks. Monitor them on this schedule:

| Check | Time After Submit | Action |
|-------|-------------------|--------|
| Initial | 2 minutes | Verify work order started, check for early failures |
| Progress | Every 10 minutes | Check iteration progress, review agent output |
| Completion | On notification | Review PR, run verification, decide to merge |

**Monitoring commands:**
```bash
# Check work order status
agentgate status <work-order-id>

# List recent work orders
agentgate list --limit 5

# View run details
agentgate status <work-order-id> --verbose
```

**Signs of trouble:**
- Stuck on same iteration for >15 minutes
- Repeated verification failures (agent may be in a loop)
- No PR created after all iterations complete

---

## Thrust 1: HTTP Server Foundation (WO-P1-001)

### 1.1 Objective

Create the core Fastify HTTP server with health endpoints and CLI serve command.

### 1.2 Background

AgentGate needs an HTTP server to:
- Expose REST API for work order management
- Enable web dashboard connectivity
- Provide programmatic access for automation
- Support real-time updates via WebSocket

Fastify is chosen for its speed, TypeScript support, and modular architecture.

### 1.3 Implementation Requirements

The agent must:

**1.3.1 Add Fastify Dependencies**
- Add `fastify`, `@fastify/cors`, `@fastify/websocket` to package.json
- Run `pnpm install` to update lockfile

**1.3.2 Create Server Types**

Create `src/server/types.ts` with:
- `ServerConfig` - Server configuration (port, host, cors origins)
- `ApiResponse<T>` - Generic success response wrapper
- `ApiError` - Error response format
- Zod schemas for runtime validation

**1.3.3 Create Fastify App Factory**

Create `src/server/app.ts` with:
- `createApp(config)` function that configures Fastify
- CORS plugin registration
- WebSocket plugin registration
- Request ID generation
- Error handler
- Not found handler

**1.3.4 Create Health Routes**

Create `src/server/routes/health.ts` with:
- `GET /health` - Basic health check returning `{ status: 'ok', version }`
- `GET /health/ready` - Readiness check verifying components
- `GET /health/live` - Simple liveness check

**1.3.5 Create Server Entry Point**

Create `src/server/index.ts` with:
- `startServer(config)` function to start HTTP server
- `stopServer(server)` function for graceful shutdown
- Export module interface

**1.3.6 Add CLI Serve Command**

Create `src/control-plane/commands/serve.ts` with:
- `agentgate serve` command
- Options: `--port`, `--host`, `--cors-origin`
- Update `src/control-plane/cli.ts` to register command

**1.3.7 Update Exports**

- Create `src/server/index.ts` as module entry
- Update `src/lib.ts` if needed

### 1.4 Verification Requirements

The agent must ensure:
1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. `pnpm test` passes (no regressions)
4. `pnpm build` succeeds
5. `agentgate serve --help` shows options

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `package.json` | Modified - Add fastify dependencies |
| `src/server/types.ts` | Created |
| `src/server/app.ts` | Created |
| `src/server/routes/health.ts` | Created |
| `src/server/index.ts` | Created |
| `src/control-plane/commands/serve.ts` | Created |
| `src/control-plane/cli.ts` | Modified |

---

## Thrust 2: Work Order API (WO-P1-002)

### 2.1 Objective

Implement REST endpoints for work order CRUD operations.

### 2.2 Background

The dashboard needs to:
- List all work orders with filtering
- Get details of a specific work order
- Submit new work orders
- Cancel pending work orders

These endpoints wrap the existing work order service with HTTP interface.

### 2.3 Implementation Requirements

The agent must:

**2.3.1 Create API Types**

Create `src/server/types/api.ts` with:

Request types:
- `ListWorkOrdersQuery` - Pagination, status filter
- `CreateWorkOrderBody` - Task prompt, workspace source, options
- `CancelWorkOrderParams` - Work order ID

Response types:
- `WorkOrderListResponse` - Array with pagination
- `WorkOrderDetailResponse` - Full work order
- `CreateWorkOrderResponse` - Created work order
- `CancelWorkOrderResponse` - Cancellation result

**2.3.2 Create Authentication Middleware**

Create `src/server/middleware/auth.ts` with:
- `apiKeyAuth` - Validates `Authorization: Bearer <key>` header
- Returns 401 for invalid keys
- Configurable via environment or CLI option

**2.3.3 Implement Work Order Routes**

Create `src/server/routes/work-orders.ts` with:

- **GET /api/v1/work-orders** - List work orders
  - Query: `status`, `limit`, `offset`
  - Uses existing work order service

- **GET /api/v1/work-orders/:id** - Get work order details
  - Returns 404 if not found

- **POST /api/v1/work-orders** - Submit work order
  - Requires auth
  - Validates body with Zod
  - Returns created work order

- **DELETE /api/v1/work-orders/:id** - Cancel work order
  - Requires auth
  - Returns 404 if not found
  - Returns 409 if completed

**2.3.4 Implement Run Routes**

Create `src/server/routes/runs.ts` with:
- **GET /api/v1/runs** - List runs
- **GET /api/v1/runs/:id** - Get run details

**2.3.5 Register Routes**

Update `src/server/app.ts`:
- Import and register work order routes
- Import and register run routes
- Apply `/api/v1` prefix

**2.3.6 Update Serve Command**

Update `src/control-plane/commands/serve.ts`:
- Add `--api-key <key>` option
- Pass to server config

### 2.4 Verification Requirements

1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. `pnpm test` passes
4. `pnpm build` succeeds

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/server/types/api.ts` | Created |
| `src/server/middleware/auth.ts` | Created |
| `src/server/routes/work-orders.ts` | Created |
| `src/server/routes/runs.ts` | Created |
| `src/server/app.ts` | Modified |
| `src/control-plane/commands/serve.ts` | Modified |

---

## Thrust 3: Real-time Updates (WO-P1-003)

### 3.1 Objective

Implement WebSocket support for real-time status updates.

### 3.2 Background

The dashboard needs live updates for:
- Work order status changes
- Run progress (iteration updates)
- Verification results
- Error notifications

### 3.3 Implementation Requirements

The agent must:

**3.3.1 Create WebSocket Types**

Create `src/server/websocket/types.ts` with:

Client messages:
- `SubscribeMessage` - Subscribe to work order
- `UnsubscribeMessage` - Unsubscribe
- `PingMessage` - Keep-alive

Server messages:
- `WorkOrderCreatedEvent`
- `WorkOrderUpdatedEvent`
- `RunStartedEvent`
- `RunIterationEvent`
- `RunCompletedEvent`
- `RunFailedEvent`
- `PongMessage`
- `ErrorMessage`

**3.3.2 Create Event Broadcaster**

Create `src/server/websocket/broadcaster.ts` with:
- `EventBroadcaster` class
- Track active connections
- `broadcast(event)` to relevant connections
- `broadcastToAll(event)` to all
- Connection management

**3.3.3 Create WebSocket Handler**

Create `src/server/websocket/handler.ts` with:
- Parse incoming messages
- Handle subscribe/unsubscribe
- Respond to pings
- Connection cleanup on disconnect

**3.3.4 Integrate with Orchestrator**

Update `src/orchestrator/orchestrator.ts`:
- Accept optional event broadcaster in config
- Emit events on state changes:
  - Work order status change
  - Run started/completed/failed
  - Iteration complete

**3.3.5 Register WebSocket Route**

Update `src/server/app.ts`:
- Register WebSocket at `/ws`
- Create broadcaster instance
- Pass to orchestrator

**3.3.6 Export WebSocket Module**

Create `src/server/websocket/index.ts` with exports.

### 3.4 Verification Requirements

1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. `pnpm test` passes
4. `pnpm build` succeeds

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/server/websocket/types.ts` | Created |
| `src/server/websocket/broadcaster.ts` | Created |
| `src/server/websocket/handler.ts` | Created |
| `src/server/websocket/index.ts` | Created |
| `src/server/app.ts` | Modified |
| `src/orchestrator/orchestrator.ts` | Modified |

---

## Phase 1 Execution Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Phase 1 Execution Flow                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Submit WO-P1-001 (Server Foundation)                                    │
│     └─► agentgate submit --prompt "<prompt>" --github fl-sean03/AgentGate   │
│                                                                              │
│  2. Wait for completion                                                      │
│     └─► Monitor: agentgate status <work-order-id>                           │
│                                                                              │
│  3. Review PR on GitHub                                                      │
│     └─► Check code, run tests, merge                                        │
│                                                                              │
│  4. Update local and rebuild                                                 │
│     └─► git pull && pnpm install && pnpm build                              │
│                                                                              │
│  5. Verify                                                                   │
│     └─► agentgate serve --port 3001                                         │
│     └─► curl http://localhost:3001/health                                   │
│                                                                              │
│  6. Repeat for WO-P1-002 (API) and WO-P1-003 (WebSocket)                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Work Order Execution Commands

### WO-P1-001: Server Foundation

```bash
agentgate submit \
  --prompt "Add HTTP server foundation with Fastify. See docs/DevGuides/DevGuide_v0.2.7/02-implementation.md Thrust 1 for detailed requirements." \
  --github fl-sean03/AgentGate \
  --max-iterations 3
```

### WO-P1-002: Work Order API

```bash
agentgate submit \
  --prompt "Add REST API endpoints for work orders. See docs/DevGuides/DevGuide_v0.2.7/02-implementation.md Thrust 2 for detailed requirements." \
  --github fl-sean03/AgentGate \
  --max-iterations 3
```

### WO-P1-003: WebSocket Support

```bash
agentgate submit \
  --prompt "Add WebSocket support for real-time updates. See docs/DevGuides/DevGuide_v0.2.7/02-implementation.md Thrust 3 for detailed requirements." \
  --github fl-sean03/AgentGate \
  --max-iterations 3
```

---

## Post-Phase 1 Validation

After all three work orders are merged:

```bash
# Rebuild
git pull
pnpm install
pnpm build

# Start server
agentgate serve --port 3001 --api-key test123

# Test health endpoint
curl http://localhost:3001/health
# Expected: {"status":"ok","version":"0.2.7",...}

# Test work order list
curl http://localhost:3001/api/v1/work-orders
# Expected: {"success":true,"data":[],...}

# Test work order submission
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Authorization: Bearer test123" \
  -H "Content-Type: application/json" \
  -d '{"taskPrompt":"Test","workspaceSource":{"type":"local","path":"/tmp/test"}}'
# Expected: {"success":true,"data":{"id":"wo-xxx",...},...}

# Test WebSocket
wscat -c ws://localhost:3001/ws
# Send: {"type":"ping"}
# Expected: {"type":"pong",...}
```

When all validations pass, Phase 1 is complete. Proceed to Phase 2 (Frontend).
