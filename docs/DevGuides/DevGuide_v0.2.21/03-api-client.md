# 03: Thrust 2 - API Client

## Objective

Create a reusable API client layer for the TUI that handles HTTP requests to the AgentGate server and Server-Sent Events (SSE) for real-time run streaming.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F2.1 | HTTP client for REST API | Must Have |
| F2.2 | SSE client for run streaming | Must Have |
| F2.3 | Automatic retry on failure | Must Have |
| F2.4 | Request timeout handling | Must Have |
| F2.5 | Error response parsing | Must Have |
| F2.6 | API key authentication | Must Have |
| F2.7 | Request/response logging | Should Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N2.1 | Works without browser APIs | Must Have |
| N2.2 | Handles offline gracefully | Should Have |
| N2.3 | Memory efficient for long streams | Must Have |

---

## Architecture

### File Structure

```
src/api/
├── client.ts           # Main HTTP client
├── sse.ts              # SSE streaming client
├── types.ts            # API-specific types
└── errors.ts           # Custom error classes
```

### Data Flow

```
Component
    │
    ▼
useWorkOrders() / useRunStream()
    │
    ▼
API Client (client.ts / sse.ts)
    │
    ▼
AgentGate Server (localhost:3000)
```

---

## HTTP Client Specification

### src/api/client.ts

```
Purpose: HTTP client wrapper using ky

Configuration:
- Base URL from environment/config
- API key in Authorization header
- JSON content type
- Timeout: 30 seconds
- Retry: 2 attempts

Methods:
- getWorkOrders(params): Promise<WorkOrder[]>
- getWorkOrder(id): Promise<WorkOrder>
- createWorkOrder(data): Promise<WorkOrder>
- cancelWorkOrder(id): Promise<void>
- getRuns(workOrderId): Promise<Run[]>
- getRun(id): Promise<Run>
- triggerRun(workOrderId): Promise<Run>
- getHealth(): Promise<HealthStatus>
- getProfiles(): Promise<Profile[]>
```

### Client Instance Pattern

```
Create client with configuration:
{
  baseUrl: string,
  apiKey?: string,
  timeout?: number,
  onError?: (error) => void,
  onRequest?: (request) => void,
  onResponse?: (response) => void,
}

Returns object with all API methods bound to this configuration.
```

### Request Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Timeout | 30000ms | Long enough for slow responses |
| Retry | 2 | Handle transient failures |
| Retry Delay | 1000ms | Exponential backoff |
| Headers | Authorization: Bearer <key> | API authentication |
| Headers | Content-Type: application/json | JSON API |

### Error Handling

```
Error Types:
1. NetworkError - Cannot reach server
2. TimeoutError - Request timed out
3. HttpError - Server returned error status
4. ParseError - Invalid JSON response

Error Shape:
{
  type: 'network' | 'timeout' | 'http' | 'parse',
  message: string,
  status?: number,
  code?: string,
  details?: unknown,
}
```

---

## API Endpoints

### Work Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/work-orders | List all work orders |
| GET | /api/v1/work-orders/:id | Get single work order |
| POST | /api/v1/work-orders | Create work order |
| DELETE | /api/v1/work-orders/:id | Cancel work order |

### Runs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/work-orders/:id/runs | List runs for work order |
| GET | /api/v1/runs/:id | Get single run |
| POST | /api/v1/work-orders/:id/runs | Trigger new run |
| GET | /api/v1/runs/:id/stream | SSE stream (see below) |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET | /api/v1/profiles | List profiles |

---

## SSE Client Specification

### src/api/sse.ts

```
Purpose: Server-Sent Events client for run streaming

Configuration:
{
  url: string,
  apiKey?: string,
  onEvent: (event: RunEvent) => void,
  onError: (error: Error) => void,
  onOpen: () => void,
  onClose: () => void,
}

Returns:
{
  connect: () => void,
  disconnect: () => void,
  isConnected: boolean,
}
```

### Event Types

```
SSE Event Names:
- run:status - Run status changed
- run:iteration:start - Iteration started
- run:iteration:end - Iteration completed
- agent:event - Agent tool call or output
- error - Error occurred
- heartbeat - Keep-alive ping

Event Data Shape:
{
  type: string,
  timestamp: string,
  data: RunEvent | AgentEvent | Error,
}
```

### Connection Management

```
States:
1. disconnected - Initial state, no connection
2. connecting - Attempting to connect
3. connected - Active connection, receiving events
4. reconnecting - Lost connection, attempting reconnect
5. error - Fatal error, will not reconnect

Reconnection:
- Automatic reconnect on disconnect
- Exponential backoff: 1s, 2s, 4s, 8s, max 30s
- Max 10 reconnection attempts
- Manual reconnect via connect()
```

### Heartbeat Handling

```
Server sends heartbeat every 15 seconds.
Client tracks last heartbeat time.
If no heartbeat in 45 seconds, consider connection stale.
Trigger reconnection.
```

---

## React Hooks

### src/hooks/useApi.ts

```
Purpose: Provide API client instance to components

Returns:
{
  client: ApiClient,
  isConfigured: boolean,
  error: Error | null,
}

Usage:
const { client } = useApi();
const workOrders = await client.getWorkOrders();
```

### src/hooks/useWorkOrders.ts

```
Purpose: Fetch and cache work orders

Parameters:
{
  status?: WorkOrderStatus,
  limit?: number,
  pollInterval?: number, // Default: 5000ms
}

Returns:
{
  data: WorkOrder[] | undefined,
  isLoading: boolean,
  error: Error | null,
  refetch: () => void,
}

Behavior:
- Polls API at interval
- Caches in Zustand store
- Deduplicates requests
```

### src/hooks/useRunStream.ts

```
Purpose: Connect to SSE stream for run

Parameters:
{
  runId: string,
  autoConnect?: boolean, // Default: true
}

Returns:
{
  events: RunEvent[],
  status: 'disconnected' | 'connecting' | 'connected' | 'error',
  connect: () => void,
  disconnect: () => void,
  error: Error | null,
}

Behavior:
- Auto-connects on mount
- Disconnects on unmount
- Stores events in local state
- Max 1000 events (oldest removed)
```

---

## Request/Response Types

### Work Order Types

```typescript
interface WorkOrderListParams {
  status?: WorkOrderStatus;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

interface WorkOrderListResponse {
  data: WorkOrder[];
  total: number;
  limit: number;
  offset: number;
}

interface CreateWorkOrderRequest {
  taskPrompt: string;
  repoUrl: string;
  profileName?: string;
  metadata?: Record<string, unknown>;
}
```

### Run Types

```typescript
interface RunListResponse {
  data: Run[];
  total: number;
}

interface TriggerRunRequest {
  profileName?: string; // Override profile
}

interface TriggerRunResponse {
  run: Run;
}
```

### SSE Event Types

```typescript
interface SSEEvent {
  id: string;
  type: string;
  timestamp: string;
  data: unknown;
}

interface RunStatusEvent {
  type: 'run:status';
  status: RunStatus;
  iteration?: number;
}

interface AgentToolEvent {
  type: 'agent:event';
  eventType: 'tool_call' | 'output' | 'error';
  tool?: string;
  content?: string;
}
```

---

## Error Handling Patterns

### Retry Logic

```
Retryable errors:
- Network errors (ECONNRESET, ENOTFOUND)
- 502 Bad Gateway
- 503 Service Unavailable
- 504 Gateway Timeout

Non-retryable errors:
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 422 Unprocessable Entity
```

### Error Display in TUI

```
Error Type -> Display Format:

Network:
  "Cannot connect to server at {url}"
  "Check that AgentGate server is running"

Timeout:
  "Request timed out after 30 seconds"
  "Server may be under heavy load"

HTTP 401:
  "Authentication failed"
  "Run: agentgate config set api-key <key>"

HTTP 404:
  "Work order {id} not found"

HTTP 500:
  "Server error: {message}"
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTGATE_API_URL` | Server URL | http://localhost:3000 |
| `AGENTGATE_API_KEY` | API key | (none) |
| `AGENTGATE_TIMEOUT` | Request timeout | 30000 |
| `AGENTGATE_DEBUG` | Enable debug logs | false |

### Config File (~/.agentgate/config.json)

```json
{
  "apiUrl": "http://localhost:3000",
  "apiKey": "your-api-key",
  "timeout": 30000
}
```

### Priority Order

1. CLI flags (--api-url, --api-key)
2. Environment variables
3. Config file
4. Defaults

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC2.1 | Can fetch work orders | API call returns list |
| AC2.2 | Can create work order | POST creates and returns |
| AC2.3 | SSE connects | Events received |
| AC2.4 | Retries on failure | Retry count increments |
| AC2.5 | Handles timeout | Error after timeout |
| AC2.6 | Auth header sent | Wireshark/logs confirm |
| AC2.7 | Error messages clear | User-friendly text |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| Client construction | Creates with config |
| GET request | Returns parsed JSON |
| POST request | Sends body, returns response |
| Auth header | Includes Authorization header |
| Timeout | Throws after timeout |
| Retry | Retries on 503 |
| No retry | Does not retry 404 |
| Parse error | Handles invalid JSON |

### Integration Tests

| Test | Description |
|------|-------------|
| getWorkOrders | Returns work order list |
| createWorkOrder | Creates and returns |
| SSE connect | Receives events |
| SSE reconnect | Reconnects after disconnect |
| Config priority | CLI > env > file |

### Mock Server

```
For testing, use MSW (Mock Service Worker) or local Express server.

Mock responses:
- GET /api/v1/work-orders -> 3 mock work orders
- GET /api/v1/runs/:id/stream -> Mock SSE events
- GET /health -> { status: 'healthy' }
```

---

## Files to Create

| File | Lines (est.) | Description |
|------|--------------|-------------|
| `src/api/client.ts` | 150 | HTTP client |
| `src/api/sse.ts` | 120 | SSE client |
| `src/api/types.ts` | 80 | API types |
| `src/api/errors.ts` | 50 | Error classes |
| `src/hooks/useApi.ts` | 30 | API hook |
| `src/hooks/useWorkOrders.ts` | 60 | Work orders hook |
| `src/hooks/useRunStream.ts` | 80 | SSE hook |
| `src/config/settings.ts` | 60 | Config loading |

**Total: ~8 files, ~630 lines**

---

## Usage Examples

### Fetching Work Orders

```
In component:
1. Call useWorkOrders() hook
2. Hook returns { data, isLoading, error }
3. If isLoading, show Spinner
4. If error, show error message
5. If data, render work order list
```

### Streaming Run Events

```
In RunStreamView:
1. Call useRunStream(runId)
2. Hook connects to SSE
3. Events accumulate in events array
4. Render events in EventList
5. On unmount, hook disconnects
```

### Error Handling

```
In any component:
1. Check error from hook
2. If error.type === 'network', show connection error
3. If error.type === 'http' && error.status === 401, show auth error
4. Otherwise, show generic error with message
```
