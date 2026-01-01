# 01: Overview - Comprehensive API Extension

## Current State Analysis

### Existing API Endpoints

The current AgentGate HTTP API provides basic work order and run management:

**Work Orders (`/api/v1/work-orders`):**
- `GET /` - List work orders with pagination and status filter
- `GET /:id` - Get work order details with associated runs
- `POST /` - Submit new work order (basic options only)
- `DELETE /:id` - Cancel a work order

**Runs (`/api/v1/runs`):**
- `GET /` - List runs with filters
- `GET /:id` - Get run details with iteration data

### Current Work Order Schema

The current `POST /api/v1/work-orders` accepts:

```typescript
interface CreateWorkOrderBody {
  taskPrompt: string;
  workspaceSource: WorkspaceSource;
  agentType: 'claude-code-subscription';
  maxIterations?: number;  // Partial support
  maxTime?: number;        // Partial support
}
```

**What's Missing:**
- No harness profile selection (`--harness`)
- No loop strategy options (`--loop-strategy`)
- No verification configuration (`--wait-for-ci`, `--skip-verification`)
- No git ops configuration (`--github-pr`)
- No audit trail access
- No real-time streaming

### Gap Analysis

| Capability | CLI (v0.2.16) | API (Current) | Gap |
|------------|---------------|---------------|-----|
| Submit work order | Full options | Basic only | Large |
| Harness profiles | `--harness name` | None | Full |
| Loop strategy | `--loop-strategy` | None | Full |
| Wait for CI | `--wait-for-ci` | Hardcoded false | Full |
| Skip verification | `--skip-verification` | None | Full |
| Max iterations | `--max-iterations` | Partial | Partial |
| Max time | `--max-time` | Partial | Partial |
| Profile management | `profile list/show/create` | None | Full |
| Audit queries | Internal only | None | Full |
| Real-time updates | CLI output | None | Full |

---

## Architecture Design

### API Extension Strategy

Rather than creating new endpoints, we extend existing ones where possible:

```
Current                          Extended
─────────────────────────────────────────────────────────
POST /work-orders (basic)   →   POST /work-orders (full harness)
GET /work-orders/:id        →   GET /work-orders/:id (+ harness info)
                            →   GET /work-orders/:id/audit (new)
                            →   GET /work-orders/:id/stream (new)
GET /runs/:id               →   GET /runs/:id (+ config)
                            →   GET /runs/:id/stream (new)
(none)                      →   GET/POST/PUT/DELETE /profiles (new)
(none)                      →   GET /audit/runs/:id (new)
```

### Extended Work Order Flow

```
Client                              Server
  |                                    |
  |  POST /work-orders                 |
  |  {                                 |
  |    taskPrompt: "...",              |
  |    harness: {                      |
  |      profile: "ci-focused",        |
  |      loopStrategy: {...},          |
  |      verification: {...}           |
  |    }                               |
  |  }                                 |
  |─────────────────────────────────────►
  |                                    |
  |                           1. Validate request
  |                           2. Load profile (if specified)
  |                           3. Merge with inline options
  |                           4. Resolve harness config
  |                           5. Create work order
  |                           6. Queue for execution
  |                                    |
  |◄─────────────────────────────────────
  |  201 Created                       |
  |  { id, status, harness: {...} }   |
```

### SSE Streaming Architecture

```
Client                              Server
  |                                    |
  |  GET /runs/:id/stream              |
  |  Accept: text/event-stream         |
  |─────────────────────────────────────►
  |                                    |
  |◄─────────────────────────────────────
  |  Content-Type: text/event-stream   |
  |                                    |
  |◄── event: connected                |
  |    data: {"runId":"..."}           |
  |                                    |
  |◄── event: iteration-start          |
  |    data: {"iteration":1}           |
  |                                    |
  |◄── event: agent-output             |
  |    data: {"chunk":"..."}           |
  |                                    |
  |◄── event: verification-complete    |
  |    data: {"passed":true}           |
  |                                    |
  |◄── event: run-complete             |
  |    data: {"status":"succeeded"}    |
  |                                    |
  |  Connection closed                 |
```

---

## Component Design

### Extended API Types

```
packages/server/src/server/types/
├── api.ts              # Extended work order schemas
├── profiles.ts         # Profile CRUD schemas (new)
├── audit.ts            # Audit query schemas (new)
└── stream.ts           # SSE event types (new)
```

### New Route Modules

```
packages/server/src/server/routes/
├── work-orders.ts      # Extended with harness options
├── runs.ts             # Extended with streaming
├── profiles.ts         # Profile CRUD (new)
├── audit.ts            # Audit queries (new)
└── stream.ts           # SSE helpers (new)
```

### Client SDK Structure

```
packages/client/
├── src/
│   ├── index.ts        # Public exports
│   ├── client.ts       # AgentGateClient class
│   ├── types.ts        # Type definitions
│   └── stream.ts       # SSE stream utilities
├── package.json
└── tsconfig.json
```

---

## Integration with v0.2.16

### Dependencies

v0.2.17 builds directly on v0.2.16's harness configuration system:

| v0.2.16 Component | v0.2.17 Usage |
|-------------------|---------------|
| `HarnessConfig` types | API request/response schemas |
| `ConfigResolver` | Resolve harness for API requests |
| `ConfigLoader` | Load profiles for API endpoints |
| `AuditTrail` | Query audit data via API |
| `LoopStrategy` types | Expose in run details |

### Service Layer Integration

```typescript
// Extended work order submission
async function submitWorkOrder(body: ExtendedCreateWorkOrderBody) {
  // 1. Use ConfigResolver from v0.2.16
  const harnessConfig = await resolveHarnessConfig({
    profileName: body.harness?.profile,
    cliOverrides: mapApiOptionsToHarnessConfig(body.harness),
  });

  // 2. Create work order with resolved config
  const workOrder = await workOrderService.submit({
    ...body,
    harnessConfig,
  });

  return workOrder;
}
```

---

## API Response Patterns

### Standard Response Envelope

All responses follow the existing pattern:

```typescript
interface ApiResponse<T> {
  success: true;
  data: T;
  requestId: string;
}

interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}
```

### Pagination Pattern

List endpoints use consistent pagination:

```typescript
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
```

### SSE Event Pattern

All SSE events follow a consistent format:

```typescript
interface SSEEvent<T> {
  event: string;      // Event type
  data: T;            // JSON payload
  id?: string;        // Optional event ID for resume
  retry?: number;     // Optional reconnect delay
}
```

---

## Security Considerations

### Authentication

Extended endpoints follow existing auth pattern:
- Read operations: No auth required (public)
- Write operations: API key required (`X-API-Key` header)
- Profile management: API key required
- Work order submission: API key required

### Input Validation

All inputs validated using Zod schemas:
- Profile names: alphanumeric + hyphens
- Harness config: full schema validation
- Query parameters: typed and bounded

### Rate Limiting (Design for Future)

API designed to support rate limiting:
- SSE connections: Limited per API key
- Profile writes: Limited per minute
- Audit queries: May add complexity limits

---

## Error Handling

### Error Codes

New error codes for v0.2.17:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `PROFILE_NOT_FOUND` | 404 | Profile doesn't exist |
| `PROFILE_EXISTS` | 409 | Profile already exists |
| `PROFILE_INVALID` | 400 | Profile validation failed |
| `HARNESS_INVALID` | 400 | Harness config validation failed |
| `AUDIT_NOT_FOUND` | 404 | Audit record not found |
| `STREAM_ERROR` | 500 | SSE stream error |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "PROFILE_NOT_FOUND",
    "message": "Profile 'unknown-profile' not found",
    "details": {
      "profileName": "unknown-profile",
      "availableProfiles": ["default", "ci-focused"]
    }
  },
  "requestId": "req-123"
}
```

---

## Testing Strategy

### Unit Tests

| Component | Coverage |
|-----------|----------|
| API type schemas | Validation edge cases |
| Route handlers | Input/output mapping |
| Profile CRUD | All operations |
| SSE streaming | Event formatting |

### Integration Tests

| Scenario | Verification |
|----------|--------------|
| Full work order flow | Submit → run → stream → complete |
| Profile lifecycle | Create → read → update → delete |
| Audit queries | Run completes → query audit |
| SSE reconnection | Disconnect → reconnect → resume |

### E2E Tests

| Scenario | Verification |
|----------|--------------|
| Client SDK usage | Real API calls |
| OpenAPI spec | Generated spec matches implementation |

---

## Migration Path

### Phase 1: Extended Types (No Breaking Changes)

- Add new optional fields to work order schema
- Add new type files for profiles/audit/stream
- Existing clients unaffected

### Phase 2: New Endpoints (No Breaking Changes)

- Add profile CRUD endpoints
- Add audit query endpoints
- Add streaming endpoints
- Existing endpoints unchanged

### Phase 3: Extended Responses (Minor Changes)

- Add harness info to work order responses
- Add config info to run responses
- Clients should handle unknown fields gracefully

### Phase 4: Client SDK Release

- Publish `@agentgate/client` package
- Provide migration guide for direct API users
