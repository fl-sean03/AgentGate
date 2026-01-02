# 00: Index - Comprehensive API Extension

## DevGuide v0.2.17

**Title:** Comprehensive API Extension
**Status:** Completed (2026-01-02)
**Prerequisites:** v0.2.16 (Work Order Harness Configuration)
---

## Executive Summary

Extend the AgentGate HTTP API to provide full functionality parity with the CLI, enabling programmatic control of all features including harness profiles, loop strategies, verification settings, and audit trails.

**Key Insight:** The CLI has evolved to support powerful harness configuration (v0.2.16), but the API remains basic. External integrations (CI/CD, dashboards, orchestrators) need programmatic access to all features.

---

## Problem Statement

The current API (`/api/v1/work-orders`) is limited:

| Feature | CLI Support | API Support |
|---------|-------------|-------------|
| Submit work order | Yes | Yes (basic) |
| Harness profiles | Yes | No |
| Loop strategy selection | Yes | No |
| Wait for CI | Yes | No |
| Skip verification levels | Yes | Partial |
| Max iterations/time | Yes | Partial |
| Audit trail queries | Yes | No |
| Profile management | Yes | No |
| Run streaming | Yes | No |

**Impact:**
- External systems can't leverage harness profiles
- No way to monitor runs in real-time via API
- Audit trail data inaccessible programmatically
- Profile management requires CLI access

---

## Target Architecture

```
+---------------------------------------------------------------------+
|                    API EXTENSION ARCHITECTURE                        |
+---------------------------------------------------------------------+
|                                                                      |
|  External Systems (CI/CD, Dashboards, Orchestrators)                |
|                              |                                       |
|                              v                                       |
|  +----------------------------------------------------------+       |
|  |                    HTTP API Layer                         |       |
|  |  +-----------+  +----------+  +---------+  +----------+  |       |
|  |  | Work      |  | Profiles |  | Audit   |  | Runs     |  |       |
|  |  | Orders    |  | CRUD     |  | Trail   |  | Stream   |  |       |
|  |  | Extended  |  |          |  | Query   |  | SSE      |  |       |
|  |  +-----------+  +----------+  +---------+  +----------+  |       |
|  +----------------------------------------------------------+       |
|                              |                                       |
|                              v                                       |
|  +----------------------------------------------------------+       |
|  |                   Service Layer                           |       |
|  |  +---------------+  +----------------+  +-------------+   |       |
|  |  | WorkOrder     |  | HarnessConfig  |  | AuditStore  |   |       |
|  |  | Service       |  | Resolver       |  |             |   |       |
|  |  +---------------+  +----------------+  +-------------+   |       |
|  +----------------------------------------------------------+       |
|                                                                      |
+---------------------------------------------------------------------+
```

---

## Target API Endpoints

### Work Orders (Extended)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/work-orders` | Submit with full harness options |
| GET | `/api/v1/work-orders/:id/audit` | Get config audit trail |
| GET | `/api/v1/work-orders/:id/stream` | SSE stream of work order events |

### Harness Profiles

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/profiles` | List available profiles |
| GET | `/api/v1/profiles/:name` | Get profile details |
| POST | `/api/v1/profiles` | Create new profile |
| PUT | `/api/v1/profiles/:name` | Update profile |
| DELETE | `/api/v1/profiles/:name` | Delete profile |
| POST | `/api/v1/profiles/:name/validate` | Validate profile |

### Runs (Extended)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/runs/:id/config` | Get resolved harness config |
| GET | `/api/v1/runs/:id/strategy-state` | Get loop strategy state |
| GET | `/api/v1/runs/:id/stream` | SSE stream of run events |

### Audit Trail

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/audit/runs/:runId` | Get audit record for run |
| GET | `/api/v1/audit/runs/:runId/snapshots` | Get config snapshots |
| GET | `/api/v1/audit/runs/:runId/changes` | Get config changes |

---

## Success Criteria

- [ ] `POST /api/v1/work-orders` accepts all CLI harness options
- [ ] Profile CRUD operations work via API
- [ ] Audit trail queryable via API endpoints
- [ ] SSE streaming provides real-time run updates
- [ ] OpenAPI spec documents all endpoints
- [ ] TypeScript client SDK provides type-safe access
- [ ] Backwards compatible - existing API calls still work
- [ ] 95%+ test coverage on new endpoints

---

## Design Decisions

### 1. Extend Rather Than Replace

The existing work order schema is extended with optional harness config fields. Old clients continue to work with defaults.

### 2. SSE for Streaming

Server-Sent Events chosen over WebSocket for simplicity:
- Unidirectional (server to client) matches use case
- Auto-reconnect built into EventSource
- Works through proxies/load balancers
- Simpler implementation

### 3. Profile API Mirrors CLI

API endpoints follow same semantics as CLI commands:
- `agentgate profile list` → `GET /api/v1/profiles`
- `agentgate profile show x` → `GET /api/v1/profiles/x`
- `agentgate profile create` → `POST /api/v1/profiles`

### 4. Audit Trail as Read-Only

Audit data is only queryable, not modifiable via API. Audit entries are created by the system during run execution.

---

## Thrust Overview

| # | Name | Description | Files |
|---|------|-------------|-------|
| 1 | Extended Work Order Schema | Add all CLI options to API | 3 |
| 2 | Profile CRUD API | Full profile management | 3 |
| 3 | Audit Trail API | Query config audit data | 2 |
| 4 | Run Streaming API | SSE for real-time updates | 3 |
| 5 | API Documentation | OpenAPI/Swagger spec | 2 |
| 6 | API Client SDK | TypeScript client library | 4 |

---

## File Map

### New Files (API Routes)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/server/routes/profiles.ts` | 2 | Profile CRUD endpoints |
| `packages/server/src/server/routes/audit.ts` | 3 | Audit trail endpoints |
| `packages/server/src/server/routes/stream.ts` | 4 | SSE streaming endpoints |

### New Files (API Types)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/server/types/profiles.ts` | 2 | Profile API schemas |
| `packages/server/src/server/types/audit.ts` | 3 | Audit API schemas |
| `packages/server/src/server/types/stream.ts` | 4 | Stream event types |

### New Files (Client SDK)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/client/src/index.ts` | 6 | Client SDK entry |
| `packages/client/src/client.ts` | 6 | AgentGateClient class |
| `packages/client/src/types.ts` | 6 | Client type definitions |
| `packages/client/src/stream.ts` | 6 | SSE stream helpers |

### New Files (Documentation)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/server/openapi.ts` | 5 | OpenAPI spec generator |
| `docs/api/openapi.yaml` | 5 | Generated OpenAPI spec |

### Modified Files

| File | Thrust | Changes |
|------|--------|---------|
| `packages/server/src/server/types/api.ts` | 1 | Extended work order schemas |
| `packages/server/src/server/routes/work-orders.ts` | 1 | Accept harness options |
| `packages/server/src/server/routes/runs.ts` | 4 | Add stream endpoint |
| `packages/server/src/server/index.ts` | 2-4 | Register new routes |
| `packages/server/package.json` | 5 | Add openapi dependencies |

---

## Quick Reference

### Extended Work Order Body

```json
{
  "taskPrompt": "Implement feature X",
  "workspaceSource": { "type": "github", "repo": "owner/repo" },
  "agentType": "claude-code-subscription",
  "harness": {
    "profile": "ci-focused",
    "loopStrategy": {
      "mode": "hybrid",
      "maxIterations": 5
    },
    "verification": {
      "waitForCI": true,
      "skipLevels": ["L3"]
    }
  }
}
```

### Profile Response

```json
{
  "name": "ci-focused",
  "extends": "default",
  "description": "CI-focused workflow",
  "loopStrategy": {
    "mode": "hybrid",
    "maxIterations": 8
  },
  "verification": {
    "waitForCI": true
  }
}
```

### SSE Event Format

```
event: iteration-start
data: {"runId":"run-123","iteration":2}

event: verification-complete
data: {"runId":"run-123","passed":true,"level":"L1"}

event: run-complete
data: {"runId":"run-123","status":"succeeded"}
```

---

## Navigation

| Document | Contents |
|----------|----------|
| [01-overview.md](./01-overview.md) | Current state, gap analysis, architecture |
| [02-extended-work-order.md](./02-extended-work-order.md) | Thrust 1: Extended work order schema |
| [03-profile-crud-api.md](./03-profile-crud-api.md) | Thrust 2: Profile management API |
| [04-audit-trail-api.md](./04-audit-trail-api.md) | Thrust 3: Audit trail query API |
| [05-run-streaming-api.md](./05-run-streaming-api.md) | Thrust 4: SSE streaming |
| [06-api-documentation.md](./06-api-documentation.md) | Thrust 5: OpenAPI/Swagger |
| [07-client-sdk.md](./07-client-sdk.md) | Thrust 6: TypeScript client SDK |
| [08-appendices.md](./08-appendices.md) | Checklists, troubleshooting, references |

---

## Dependencies

- Existing AgentGate server and routes
- v0.2.16 harness configuration system (prerequisite)
- `fastify` web framework (already in use)
- `zod` for schema validation (already in use)
- `@fastify/swagger` for OpenAPI generation
- `eventsource` for SSE client testing

---

## Key Constraints

### Backwards Compatibility

All existing API calls must continue to work:

| Current Behavior | After v0.2.17 |
|-----------------|---------------|
| POST without harness | Uses defaults |
| GET work order | Same response + optional harness |
| List/delete | Unchanged |

### Authentication

All mutating endpoints require API key authentication (existing pattern):
- `X-API-Key` header
- Profile create/update/delete
- Work order submit

### Rate Limiting (Future)

API should be designed with rate limiting in mind:
- SSE streams count against connection limits
- Profile CRUD limited per minute
- Audit queries may be expensive

---

## Sources

- [Fastify OpenAPI](https://github.com/fastify/fastify-swagger) - Swagger/OpenAPI plugin
- [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) - SSE standard
- [v0.2.16 DevGuide](../DevGuide_v0.2.16/00-index.md) - Harness configuration (prerequisite)
