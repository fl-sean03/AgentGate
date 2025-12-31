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

## Prerequisites

Before executing work orders with GitHub mode, ensure:

1. **GitHub Token**: Set `AGENTGATE_GITHUB_TOKEN` environment variable
   ```bash
   # Option 1: Export directly
   export AGENTGATE_GITHUB_TOKEN=ghp_xxx

   # Option 2: Load from .env file (requires sourcing)
   source .env

   # Option 3: Use auth command (stores in config)
   agentgate auth github --token ghp_xxx
   ```

2. **Token Scopes**: The token needs `repo` scope for clone/push/PR operations

3. **Verify Authentication**:
   ```bash
   agentgate auth github --status
   ```

> **Planned Enhancement**: Auto-load `.env` file at startup using `dotenv` package (WO-P1-004)

---

## Execution Status

| Thrust | Work Order | Status | Notes |
|--------|------------|--------|-------|
| 1 | WO-P1-001 | ✅ Completed | Server foundation merged to main |
| 2 | WO-P1-002 | ✅ Completed | Work Order API endpoints (PR #8 merged) |
| 3 | WO-P1-003 | ✅ Completed | WebSocket support (PR #13 merged) |

**Hotfixes Applied:**
- `run` command added to CLI (enables `agentgate run <id>`)
- `--github` option fix (was not being passed to validator)
- CI test fix for subscription driver (handles missing Claude CLI in CI, PR #10)

---

## Parallel Hotfix Batch (WO-HF-001 to WO-HF-003)

To accelerate development, the following hotfixes are submitted in parallel. After all complete, an integration work order merges them cleanly.

### Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Parallel Hotfix Execution                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Submit hotfixes in parallel:                                            │
│     ├── WO-HF-001: Fix issue #7 (status remains QUEUED)                     │
│     ├── WO-HF-002: Add dotenv for auto-loading .env                         │
│     └── WO-HF-003: WO-P1-003 WebSocket support                              │
│                                                                              │
│  2. Monitor all three work orders                                           │
│     └── agentgate status <id> for each                                      │
│                                                                              │
│  3. Each creates its own PR:                                                 │
│     ├── PR for WO-HF-001                                                    │
│     ├── PR for WO-HF-002                                                    │
│     └── PR for WO-HF-003                                                    │
│                                                                              │
│  4. Sequential merge OR integration work order if conflicts                  │
│     └── WO-HF-INT: Integrate all changes if needed                          │
│                                                                              │
│  5. Final: All hotfixes merged to main                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Hotfix Details

| ID | Work Order ID | Issue/Feature | Description | Status | PR |
|----|---------------|---------------|-------------|--------|-----|
| WO-HF-001 | sA0AUommVBLX | Issue #7 | Work order status not updating from QUEUED to RUNNING | ✅ Merged | #12 |
| WO-HF-002 | y66JkVmevn-4 | Enhancement | Auto-load `.env` file using dotenv package | ✅ Merged | #11 |
| WO-HF-003 | _9yl2weIDNWL | Thrust 3 | WebSocket real-time updates (same as WO-P1-003) | ✅ Merged | #13 |
| WO-HF-INT | - | Integration | No conflicts - all merged successfully | ✅ N/A | - |

### Execution Commands

**WO-HF-001: Fix Status Bug (Issue #7)**
```bash
agentgate submit \
  --prompt "Fix issue #7: Work order status remains QUEUED while executing.

PROBLEM:
When a work order is executed via orchestrator, status stays QUEUED instead of RUNNING.
The status transition QUEUED → RUNNING is missing.

FIX REQUIRED:
1. Update work order status to RUNNING when orchestrator.execute() starts
2. Update status in the work-order-service or orchestrator before first iteration
3. Ensure status is RUNNING during agent execution, not just after completion

Files likely affected:
- src/orchestrator/orchestrator.ts
- src/control-plane/work-order-service.ts
- src/types/work-order.ts (if status enum needs update)

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm test passes
- pnpm build succeeds" \
  --github fl-sean03/AgentGate \
  --max-iterations 3
```

**WO-HF-002: Add dotenv Support**
```bash
agentgate submit \
  --prompt "Add dotenv support to auto-load .env file at CLI startup.

REQUIREMENTS:
1. Add 'dotenv' as a dependency in package.json
2. Call dotenv.config() at the very start of the CLI entry point
3. This allows AGENTGATE_GITHUB_TOKEN and other env vars to be loaded from .env automatically
4. Users won't need to 'source .env' or 'export' manually

Files to modify:
- package.json (add dotenv dependency)
- src/control-plane/cli.ts (or src/index.ts - wherever CLI starts)

VERIFICATION:
- pnpm install succeeds
- pnpm typecheck passes
- pnpm lint passes
- pnpm test passes
- pnpm build succeeds
- CLI loads .env automatically when run" \
  --github fl-sean03/AgentGate \
  --max-iterations 3
```

**WO-HF-003: WebSocket Support**
```bash
# Same as WO-P1-003 command - see Work Order Execution Commands section below
```

### Post-Hotfix Validation

After all hotfixes are merged:

```bash
# Rebuild
git pull origin main && pnpm install && pnpm build

# Test 1: Status update works
agentgate submit --prompt "Test task" --path /tmp/test-ws
agentgate status <id>  # Should show RUNNING during execution, not QUEUED

# Test 2: dotenv works
echo "AGENTGATE_GITHUB_TOKEN=test" > .env
agentgate auth github --status  # Should detect token without export

# Test 3: WebSocket works
agentgate serve --port 3001
wscat -c ws://localhost:3001/ws
# Send: {"type":"ping"}
# Expect: {"type":"pong"}
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

---

## Critical Enhancement: Agent Engineering Standards (WO-STD-001)

### Problem Identified

After Phase 1 completion, analysis revealed that agents are NOT following best practices:
- ❌ No unit tests written for new code
- ❌ No integration tests for features
- ❌ Minimal validation beyond "it compiles"
- ❌ No verify.yaml defining test requirements

### Solution: Multi-Layer Agent Guidance System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Agent Guidance Architecture                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Layer 1: AGENTS.md (Global Engineering Standards)                          │
│     └── Location: docs/AGENTS.md (or .agentgate/AGENTS.md)                  │
│     └── Injected into EVERY agent's system prompt                           │
│     └── Contains: Testing requirements, code patterns, validation checklist │
│                                                                              │
│  Layer 2: verify.yaml (Project-Specific Gates)                              │
│     └── Location: project root                                              │
│     └── Defines: What tests MUST pass, coverage requirements                │
│     └── Enforced by: Verification pipeline (L0-L3)                          │
│                                                                              │
│  Layer 3: Task Prompt (Specific Requirements)                               │
│     └── The actual work order task description                              │
│                                                                              │
│  FINAL = AGENTS.md + verify.yaml context + task prompt + prior feedback     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Requirements

**1. Create AGENTS.md** (docs/AGENTS.md)
- Software engineering best practices
- Testing requirements (unit tests MANDATORY)
- Code quality standards
- Validation checklist
- Common patterns (testing async, mocking, etc.)

**2. Modify Agent Command Builder** (src/agent/command-builder.ts)
```typescript
// Add to buildSystemPromptAppend():
export function buildSystemPromptAppend(request: AgentRequest): string | null {
  const parts: string[] = [];

  // NEW: Always include engineering standards
  const standards = loadEngineeringStandards();
  if (standards) {
    parts.push(standards);
  }

  // Existing: gate plan, feedback, custom prompt
  // ...
}
```

**3. Add Engineering Standards Loader** (src/agent/standards.ts)
```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const STANDARDS_PATHS = [
  '.agentgate/AGENTS.md',
  'docs/AGENTS.md',
  'AGENTS.md',
];

let cachedStandards: string | null = null;

export function loadEngineeringStandards(workspacePath?: string): string | null {
  if (cachedStandards) return cachedStandards;

  for (const relPath of STANDARDS_PATHS) {
    const fullPath = workspacePath
      ? join(workspacePath, relPath)
      : relPath;

    if (existsSync(fullPath)) {
      cachedStandards = readFileSync(fullPath, 'utf-8');
      return cachedStandards;
    }
  }

  // Fall back to embedded defaults
  return getEmbeddedStandards();
}
```

**4. Update verify.yaml Schema** (src/gate/schemas.ts)
- Add `testCoverage` section to require tests for new files
- Add `requiredTestPatterns` validation

**5. Verification Pipeline Updates** (src/verification/)
- Check that new source files have corresponding tests
- Fail verification if tests are missing

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/AGENTS.md` | Create | Engineering standards document |
| `verify.yaml` | Create | Project gate plan with test requirements |
| `src/agent/standards.ts` | Create | Standards loader utility |
| `src/agent/command-builder.ts` | Modify | Inject standards into prompts |
| `src/agent/defaults.ts` | Modify | Add embedded fallback standards |
| `src/gate/schemas.ts` | Modify | Add testCoverage schema |
| `src/verification/sanity.ts` | Modify | Verify test coverage |

### WO-STD-001: Implement Agent Standards

```bash
agentgate submit \
  --prompt "Implement the Agent Engineering Standards system.

REQUIREMENTS:
1. Move docs/drafts/AGENTS.md to docs/AGENTS.md
2. Create src/agent/standards.ts with loadEngineeringStandards() function
3. Modify src/agent/command-builder.ts to inject AGENTS.md into system prompts
4. Update src/agent/defaults.ts with embedded fallback standards
5. Ensure verify.yaml is read and enforced properly

The goal: Every agent spawned by AgentGate receives engineering standards
that require them to write tests, follow best practices, and validate properly.

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm test passes
- pnpm build succeeds
- NEW TESTS: Add tests for standards loading
- Manual verify: Submit a test work order and confirm AGENTS.md content appears in logs" \
  --github fl-sean03/AgentGate \
  --max-iterations 3
```

### WO-STD-002: Add Missing Tests for Phase 1 Features

```bash
agentgate submit \
  --prompt "Add comprehensive tests for Phase 1 features that are currently untested.

REQUIRED TESTS:

1. WebSocket Tests (test/websocket.test.ts):
   - EventBroadcaster: addConnection, removeConnection, broadcast, broadcastToAll
   - WebSocket handler: ping/pong, subscribe/unsubscribe, error handling
   - Integration: Connect via WebSocket, receive events

2. Server API Tests (test/server-api.test.ts):
   - Work order routes: GET list, GET by ID, POST create, DELETE cancel
   - Run routes: GET list, GET by ID
   - Auth middleware: Valid key, invalid key, missing key
   - Error responses: 404, 401, 409

3. Status Transition Tests (test/status-transitions.test.ts):
   - Work order status: QUEUED → RUNNING → SUCCEEDED
   - Work order status: QUEUED → RUNNING → FAILED
   - Verify status updates during execution

4. dotenv Integration Tests (test/dotenv.test.ts):
   - .env file loaded on CLI start
   - Environment variables available
   - Missing .env file handled gracefully

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm test passes (ALL new tests pass)
- pnpm build succeeds
- Test coverage for new features > 80%" \
  --github fl-sean03/AgentGate \
  --max-iterations 5
```

### Expected Outcome

After implementing:
1. **Every agent receives** AGENTS.md engineering standards
2. **verify.yaml enforces** test requirements
3. **Verification fails** if tests are missing
4. **Agents write tests** because they're instructed to

This creates a self-reinforcing quality loop where AgentGate improves its own quality standards.

---

## Local Verification Loop (Critical Enhancement)

### The Problem with GitHub CI-Only Verification

Previous work orders passed verification because:
- `pnpm typecheck` passed - code compiles
- `pnpm lint` passed - code follows style rules
- `pnpm test` passed - existing tests pass
- `pnpm build` succeeded - production build works

**But no NEW tests were written!** The agents wrote code that worked but wasn't validated.

This is a **downstream failure** - we only discover the gap after code is merged.

### Solution: Local Verification Before Commit

AgentGate's internal verification pipeline already runs L0-L3 checks during work order execution. The key enhancement is:

1. **AGENTS.md injection** - Tell agents they MUST write tests
2. **L3 Sanity: Test Coverage Check** - Fail if new source files lack tests
3. **Local loop** - Run verification locally before pushing to GitHub

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Local Verification Loop                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Agent writes code                                                           │
│       ↓                                                                      │
│  L0: Contract Check (files exist, no secrets)                               │
│       ↓                                                                      │
│  L1: Tests Pass (pnpm typecheck && lint && test && build)                   │
│       ↓                                                                      │
│  L2: Blackbox Tests (CLI works, server responds)                            │
│       ↓                                                                      │
│  L3: Sanity Check                                                           │
│       ├── NEW: Check test coverage for new files                            │
│       ├── No debug artifacts                                                │
│       └── Clean state                                                       │
│       ↓                                                                      │
│  PASS? → Create PR → GitHub CI (mirrors local checks)                       │
│  FAIL? → Return feedback → Agent fixes → Re-verify (iteration loop)         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why GitHub CI Is Not Enough

GitHub CI runs **after** the PR is created. Problems:
- Delayed feedback (agent already finished)
- No iteration loop to fix issues
- Manual intervention required

The local verification loop catches issues **during** agent execution, allowing automatic retry with feedback.

---

## Phase 1 Test Coverage Gap Analysis

After Phase 1 completion, the following features were implemented **WITHOUT dedicated tests**:

| Feature | Files Created | Tests Written | Gap |
|---------|---------------|---------------|-----|
| HTTP Server Foundation | `src/server/app.ts`, `routes/health.ts` | ❌ None | **Critical** |
| Work Order API | `src/server/routes/work-orders.ts`, `routes/runs.ts` | ❌ None | **Critical** |
| Auth Middleware | `src/server/middleware/auth.ts` | ❌ None | **Critical** |
| WebSocket Support | `src/server/websocket/*` | ❌ None | **Critical** |
| dotenv Loading | `src/control-plane/cli.ts` | ❌ None | Medium |
| Status Transition Fix | `src/orchestrator/*` | ❌ None | **Critical** |

### Required Test Files

| Test File | Must Test | Priority |
|-----------|-----------|----------|
| `test/server-app.test.ts` | Fastify app creation, CORS, error handling | P0 |
| `test/routes-health.test.ts` | `/health`, `/health/ready`, `/health/live` | P0 |
| `test/routes-work-orders.test.ts` | All CRUD operations, validation, auth | P0 |
| `test/routes-runs.test.ts` | Run list and detail endpoints | P1 |
| `test/middleware-auth.test.ts` | Valid/invalid/missing API keys | P0 |
| `test/websocket-broadcaster.test.ts` | Connection management, broadcast | P0 |
| `test/websocket-handler.test.ts` | Message handling, ping/pong | P0 |
| `test/status-transitions.test.ts` | QUEUED → RUNNING → SUCCEEDED/FAILED | P0 |
| `test/dotenv-loading.test.ts` | .env auto-load, missing file handling | P2 |

---

## Execution Procedure: Work Order Workflow

This is the **standard procedure** for every work order submission:

### Step 1: Ensure Clean State
```bash
# Pull latest from main
git pull origin main

# Rebuild
pnpm install && pnpm build

# Verify all tests pass
pnpm typecheck && pnpm lint && pnpm test
```

### Step 2: Submit Work Order
```bash
agentgate submit \
  --prompt "<detailed task prompt>" \
  --github fl-sean03/AgentGate \
  --max-iterations 3
```

### Step 3: Monitor Progress
```bash
# Check status
agentgate status <work-order-id>

# Watch for:
# - Status: QUEUED → RUNNING
# - Iterations: 1/3, 2/3, etc.
# - Verification: L0 ✓, L1 ✓, L2 ✓, L3 ✓
```

### Step 4: Review PR
- Check GitHub for auto-created PR
- Review code changes
- Verify tests were written (per AGENTS.md standards)
- Run local validation if needed

### Step 5: Merge and Sync
```bash
# After PR is merged on GitHub
git pull origin main
pnpm install && pnpm build

# Verify
pnpm typecheck && pnpm lint && pnpm test
```

### Step 6: Repeat
Only submit the next work order AFTER the previous one is fully merged and validated.

---

## WO-STD-003: Local Verification Enhancement

After WO-STD-001 (AGENTS.md injection) and WO-STD-002 (missing tests), submit this to enhance L3 sanity checks:

```bash
agentgate submit \
  --prompt "Enhance L3 sanity verification to check test coverage for new files.

REQUIREMENTS:
1. Modify src/verifier/l3-sanity.ts to add test coverage check:
   - For each new/modified source file in src/
   - Check if corresponding test file exists in test/
   - Pattern: src/foo/bar.ts → test/foo-bar.test.ts OR test/foo/bar.test.ts

2. Add checkTestCoverage() function:
   - Get list of source files in the changeset
   - Map to expected test file paths
   - Return warning (not failure) if tests missing

3. Update verify.yaml schema to support:
   testCoverage:
     enabled: true
     rules:
       - pattern: 'src/server/**/*.ts'
         requiresTest: 'test/server-*.test.ts OR test/routes-*.test.ts'

4. Write tests for the new functionality:
   - test/l3-sanity-coverage.test.ts

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm test passes (including new tests)
- pnpm build succeeds" \
  --github fl-sean03/AgentGate \
  --max-iterations 3
```

---

## Work Order Submission Queue

Execute these in order, waiting for each to merge before the next:

| Order | Work Order | Description | Depends On |
|-------|------------|-------------|------------|
| 1 | WO-STD-001 | AGENTS.md injection into agent prompts | None |
| 2 | WO-STD-002 | Add missing Phase 1 tests | WO-STD-001 |
| 3 | WO-STD-003 | L3 test coverage verification | WO-STD-002 |
| 4 | WO-P2-001 | Frontend project bootstrap | All STD complete |

### Execution Commands

**WO-STD-001: AGENTS.md Injection**
```bash
agentgate submit \
  --prompt "Implement AGENTS.md injection into agent system prompts.

CONTEXT:
docs/AGENTS.md contains engineering standards that every agent should follow.
Currently, agents don't receive these standards in their prompts.

REQUIREMENTS:
1. Create src/agent/standards.ts with:
   - loadEngineeringStandards(workspacePath?: string): string | null
   - Search for AGENTS.md in: .agentgate/, docs/, root
   - Cache the result
   - Fall back to embedded defaults if not found

2. Modify src/agent/command-builder.ts buildSystemPromptAppend():
   - Call loadEngineeringStandards() at the START of the function
   - Prepend standards to the parts array (before gate plan, feedback)
   - Pass workspace path from the request

3. Add embedded fallback in src/agent/defaults.ts:
   - getEmbeddedStandards(): string
   - Minimal version with core testing requirements

4. Write tests in test/agent-standards.test.ts:
   - Test file discovery logic
   - Test caching
   - Test fallback behavior
   - Test injection into prompts

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm test passes (including new tests)
- pnpm build succeeds
- Manual: Submit test work order, confirm standards in agent logs" \
  --github fl-sean03/AgentGate \
  --max-iterations 3
```

**WO-STD-002: Missing Phase 1 Tests**
```bash
agentgate submit \
  --prompt "Add comprehensive tests for Phase 1 features.

CONTEXT:
Phase 1 implemented HTTP server, API routes, auth, and WebSocket without tests.
This work order adds the missing test coverage.

REQUIRED TEST FILES:

1. test/server-app.test.ts:
   - createApp() returns configured Fastify instance
   - CORS configured correctly
   - Error handler returns proper format
   - Not found handler returns 404

2. test/routes-health.test.ts:
   - GET /health returns {status: 'ok', version}
   - GET /health/ready checks components
   - GET /health/live returns {alive: true}

3. test/routes-work-orders.test.ts:
   - GET /api/v1/work-orders returns list
   - GET /api/v1/work-orders/:id returns order or 404
   - POST /api/v1/work-orders creates order (with auth)
   - POST without auth returns 401
   - DELETE /api/v1/work-orders/:id cancels (with auth)
   - DELETE completed order returns 409

4. test/routes-runs.test.ts:
   - GET /api/v1/runs returns list
   - GET /api/v1/runs/:id returns run or 404

5. test/middleware-auth.test.ts:
   - Valid API key passes
   - Invalid API key returns 401
   - Missing Authorization header returns 401
   - Malformed Bearer token returns 401

6. test/websocket-broadcaster.test.ts:
   - addConnection() tracks connection
   - removeConnection() removes connection
   - broadcast() sends to subscribed connections
   - broadcastToAll() sends to all connections
   - Connection cleanup on error

7. test/websocket-handler.test.ts:
   - Ping message returns pong
   - Subscribe adds to channel
   - Unsubscribe removes from channel
   - Invalid message returns error
   - Connection cleanup on close

USE:
- Vitest for testing
- Fastify inject() for HTTP tests
- Mock WebSocket for WS tests
- Follow patterns in existing tests

VERIFICATION:
- pnpm typecheck passes
- pnpm lint passes
- pnpm test passes (ALL new tests)
- pnpm build succeeds
- Coverage for server/ directory > 80%" \
  --github fl-sean03/AgentGate \
  --max-iterations 5
```
