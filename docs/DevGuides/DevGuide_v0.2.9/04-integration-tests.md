# DevGuide v0.2.9: Integration Tests

## Thrust 5: API Contract Tests

### Overview

API contract tests ensure the server's REST API responses match the expected format used by the dashboard. These tests validate that both sides of the API agree on the data structures.

### Implementation Tasks

#### Task 5.1: Contract Test Infrastructure

**File**: `packages/server/test/contract/helpers.ts`

```typescript
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../src/server/app.js';

let app: FastifyInstance | null = null;

export async function getTestApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await createApp({
      apiKey: 'test-api-key',
      enableLogging: false,
    });
  }
  return app;
}

export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}

export const TEST_API_KEY = 'test-api-key';

export function authHeaders() {
  return {
    Authorization: `Bearer ${TEST_API_KEY}`,
    'Content-Type': 'application/json',
  };
}
```

#### Task 5.2: Work Orders API Contract Tests

**File**: `packages/server/test/contract/work-orders.contract.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  paginationQuerySchema,
  createWorkOrderBodySchema,
} from '@agentgate/shared';
import { getTestApp, closeTestApp, authHeaders } from './helpers.js';

describe('Work Orders API Contract', () => {
  let app: Awaited<ReturnType<typeof getTestApp>>;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('GET /api/v1/work-orders', () => {
    it('should return paginated response matching PaginatedResponse schema', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Validate response structure
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('items');
      expect(body.data).toHaveProperty('total');
      expect(body.data).toHaveProperty('limit');
      expect(body.data).toHaveProperty('offset');
      expect(body.data).toHaveProperty('hasMore');

      // Validate types
      expect(Array.isArray(body.data.items)).toBe(true);
      expect(typeof body.data.total).toBe('number');
      expect(typeof body.data.limit).toBe('number');
      expect(typeof body.data.offset).toBe('number');
      expect(typeof body.data.hasMore).toBe('boolean');
    });

    it('should accept valid pagination query params', async () => {
      // First validate the params with shared schema
      const params = { limit: 10, offset: 0 };
      const validation = paginationQuerySchema.safeParse(params);
      expect(validation.success).toBe(true);

      // Then make request
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/work-orders?limit=${params.limit}&offset=${params.offset}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.limit).toBe(params.limit);
      expect(body.data.offset).toBe(params.offset);
    });

    it('should return items matching WorkOrderSummary schema', async () => {
      // Create a work order first
      await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: authHeaders(),
        payload: {
          taskPrompt: 'Test task for contract validation',
          workspaceSource: { type: 'local', path: '/tmp/test' },
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders',
      });

      const body = response.json();

      if (body.data.items.length > 0) {
        const item = body.data.items[0];

        // Validate WorkOrderSummary fields
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('taskPrompt');
        expect(item).toHaveProperty('status');
        expect(item).toHaveProperty('createdAt');

        // Validate types
        expect(typeof item.id).toBe('string');
        expect(typeof item.taskPrompt).toBe('string');
        expect(['queued', 'running', 'succeeded', 'failed', 'canceled']).toContain(item.status);
        expect(typeof item.createdAt).toBe('string');
      }
    });
  });

  describe('GET /api/v1/work-orders/:id', () => {
    it('should return WorkOrderDetail matching schema', async () => {
      // Create a work order
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: authHeaders(),
        payload: {
          taskPrompt: 'Test task for detail contract',
          workspaceSource: { type: 'local', path: '/tmp/test' },
        },
      });

      const created = createResponse.json();
      const workOrderId = created.data.id;

      // Get detail
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/work-orders/${workOrderId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Validate WorkOrderDetail structure
      expect(body).toHaveProperty('success', true);
      expect(body.data).toHaveProperty('id');
      expect(body.data).toHaveProperty('taskPrompt');
      expect(body.data).toHaveProperty('status');
      expect(body.data).toHaveProperty('workspaceSource');
      expect(body.data).toHaveProperty('createdAt');
      expect(body.data).toHaveProperty('runs');

      // Validate runs is an array
      expect(Array.isArray(body.data.runs)).toBe(true);
    });

    it('should return 404 for non-existent work order', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();

      // Validate error response structure
      expect(body).toHaveProperty('success', false);
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code', 'NOT_FOUND');
      expect(body.error).toHaveProperty('message');
    });
  });

  describe('POST /api/v1/work-orders', () => {
    it('should accept request body matching createWorkOrderBodySchema', async () => {
      const payload = {
        taskPrompt: 'This is a valid task prompt for contract testing',
        workspaceSource: { type: 'local', path: '/tmp/workspace' },
        maxIterations: 3,
      };

      // Validate with shared schema first
      const validation = createWorkOrderBodySchema.safeParse(payload);
      expect(validation.success).toBe(true);

      // Then make request
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: authHeaders(),
        payload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body).toHaveProperty('success', true);
      expect(body.data).toHaveProperty('id');
      expect(body.data.taskPrompt).toBe(payload.taskPrompt);
    });

    it('should reject invalid request body', async () => {
      const invalidPayload = {
        taskPrompt: 'short', // Too short
        workspaceSource: { type: 'local', path: '/tmp' },
      };

      // Validate with shared schema first - should fail
      const validation = createWorkOrderBodySchema.safeParse(invalidPayload);
      expect(validation.success).toBe(false);

      // Server should also reject
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: authHeaders(),
        payload: invalidPayload,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('Error Response Contract', () => {
    it('should return consistent error format for 400 errors', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders?limit=invalid',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();

      expect(body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.any(String),
        },
        requestId: expect.any(String),
      });
    });

    it('should return consistent error format for 401 errors', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: { 'Content-Type': 'application/json' },
        payload: { taskPrompt: 'test', workspaceSource: { type: 'local', path: '/tmp' } },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();

      expect(body).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: expect.any(String),
        },
      });
    });

    it('should return consistent error format for 404 errors', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders/non-existent',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();

      expect(body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: expect.any(String),
        },
      });
    });
  });
});
```

### Verification

```bash
cd packages/server
pnpm test test/contract
```

---

## Thrust 6: WebSocket Integration Tests

### Overview

Test the WebSocket communication between server broadcaster and client, verifying real-time event delivery works correctly.

### Implementation Tasks

#### Task 6.1: WebSocket Test Helpers

**File**: `packages/server/test/websocket/helpers.ts`

```typescript
import WebSocket from 'ws';

export interface TestWebSocket extends WebSocket {
  messages: unknown[];
  waitForMessage: (predicate?: (msg: unknown) => boolean, timeout?: number) => Promise<unknown>;
}

export function createTestWebSocket(url: string): Promise<TestWebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url) as TestWebSocket;
    ws.messages = [];

    ws.waitForMessage = (predicate, timeout = 5000) => {
      return new Promise((res, rej) => {
        // Check existing messages first
        const existing = ws.messages.find(m => !predicate || predicate(m));
        if (existing) {
          return res(existing);
        }

        const timer = setTimeout(() => {
          rej(new Error(`Timeout waiting for message`));
        }, timeout);

        const handler = (data: WebSocket.Data) => {
          const msg = JSON.parse(data.toString());
          if (!predicate || predicate(msg)) {
            clearTimeout(timer);
            ws.off('message', handler);
            res(msg);
          }
        };

        ws.on('message', handler);
      });
    };

    ws.on('open', () => resolve(ws));
    ws.on('error', reject);

    ws.on('message', (data) => {
      ws.messages.push(JSON.parse(data.toString()));
    });
  });
}

export function sendMessage(ws: WebSocket, message: object): void {
  ws.send(JSON.stringify(message));
}

export async function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

#### Task 6.2: WebSocket Lifecycle Tests

**File**: `packages/server/test/websocket/lifecycle.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../src/server/app.js';
import { createTestWebSocket, sendMessage, waitFor, type TestWebSocket } from './helpers.js';

describe('WebSocket Lifecycle', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  const connections: TestWebSocket[] = [];

  beforeAll(async () => {
    app = await createApp({ enableLogging: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (typeof address === 'object' && address) {
      baseUrl = `ws://127.0.0.1:${address.port}`;
    }
  });

  afterEach(() => {
    // Close all test connections
    for (const ws of connections) {
      if (ws.readyState === ws.OPEN) {
        ws.close();
      }
    }
    connections.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should accept WebSocket connections', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    expect(ws.readyState).toBe(ws.OPEN);
  });

  it('should respond to ping with pong', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    sendMessage(ws, { type: 'ping' });

    const pong = await ws.waitForMessage(
      (msg: any) => msg.type === 'pong'
    );

    expect(pong).toMatchObject({
      type: 'pong',
      timestamp: expect.any(String),
    });
  });

  it('should handle multiple concurrent connections', async () => {
    const ws1 = await createTestWebSocket(`${baseUrl}/ws`);
    const ws2 = await createTestWebSocket(`${baseUrl}/ws`);
    const ws3 = await createTestWebSocket(`${baseUrl}/ws`);

    connections.push(ws1, ws2, ws3);

    expect(ws1.readyState).toBe(ws1.OPEN);
    expect(ws2.readyState).toBe(ws2.OPEN);
    expect(ws3.readyState).toBe(ws3.OPEN);

    // All should respond to ping
    sendMessage(ws1, { type: 'ping' });
    sendMessage(ws2, { type: 'ping' });
    sendMessage(ws3, { type: 'ping' });

    await Promise.all([
      ws1.waitForMessage((msg: any) => msg.type === 'pong'),
      ws2.waitForMessage((msg: any) => msg.type === 'pong'),
      ws3.waitForMessage((msg: any) => msg.type === 'pong'),
    ]);
  });

  it('should return error for invalid message format', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    ws.send('not valid json');

    const error = await ws.waitForMessage(
      (msg: any) => msg.type === 'error'
    );

    expect(error).toMatchObject({
      type: 'error',
      code: 'INVALID_MESSAGE',
    });
  });

  it('should return error for unknown message type', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    sendMessage(ws, { type: 'unknown_type' });

    const error = await ws.waitForMessage(
      (msg: any) => msg.type === 'error'
    );

    expect(error).toMatchObject({
      type: 'error',
      code: 'INVALID_MESSAGE',
    });
  });
});
```

#### Task 6.3: Subscription Tests

**File**: `packages/server/test/websocket/subscription.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../src/server/app.js';
import { EventBroadcaster } from '../../src/server/websocket/broadcaster.js';
import { createTestWebSocket, sendMessage, type TestWebSocket } from './helpers.js';

describe('WebSocket Subscriptions', () => {
  let app: FastifyInstance;
  let broadcaster: EventBroadcaster;
  let baseUrl: string;
  const connections: TestWebSocket[] = [];

  beforeAll(async () => {
    broadcaster = new EventBroadcaster();
    app = await createApp({ enableLogging: false, broadcaster });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (typeof address === 'object' && address) {
      baseUrl = `ws://127.0.0.1:${address.port}`;
    }
  });

  afterEach(() => {
    for (const ws of connections) {
      if (ws.readyState === ws.OPEN) {
        ws.close();
      }
    }
    connections.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should confirm subscription', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    sendMessage(ws, { type: 'subscribe', workOrderId: 'wo-test-123' });

    const confirmation = await ws.waitForMessage(
      (msg: any) => msg.type === 'subscription_confirmed'
    );

    expect(confirmation).toMatchObject({
      type: 'subscription_confirmed',
      workOrderId: 'wo-test-123',
    });
  });

  it('should confirm unsubscription', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    // Subscribe first
    sendMessage(ws, { type: 'subscribe', workOrderId: 'wo-test-456' });
    await ws.waitForMessage((msg: any) => msg.type === 'subscription_confirmed');

    // Then unsubscribe
    sendMessage(ws, { type: 'unsubscribe', workOrderId: 'wo-test-456' });

    const confirmation = await ws.waitForMessage(
      (msg: any) => msg.type === 'unsubscription_confirmed'
    );

    expect(confirmation).toMatchObject({
      type: 'unsubscription_confirmed',
      workOrderId: 'wo-test-456',
    });
  });

  it('should receive events for subscribed work order', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    const workOrderId = 'wo-event-test';

    // Subscribe
    sendMessage(ws, { type: 'subscribe', workOrderId });
    await ws.waitForMessage((msg: any) => msg.type === 'subscription_confirmed');

    // Emit event through broadcaster
    broadcaster.broadcast(workOrderId, {
      type: 'workorder:updated',
      workOrderId,
      data: { status: 'running' },
      timestamp: new Date().toISOString(),
    });

    const event = await ws.waitForMessage(
      (msg: any) => msg.type === 'workorder:updated'
    );

    expect(event).toMatchObject({
      type: 'workorder:updated',
      workOrderId,
      data: { status: 'running' },
    });
  });

  it('should NOT receive events for unsubscribed work order', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    const subscribedId = 'wo-subscribed';
    const unsubscribedId = 'wo-not-subscribed';

    // Subscribe to one
    sendMessage(ws, { type: 'subscribe', workOrderId: subscribedId });
    await ws.waitForMessage((msg: any) => msg.type === 'subscription_confirmed');

    // Emit events for both
    broadcaster.broadcast(unsubscribedId, {
      type: 'workorder:updated',
      workOrderId: unsubscribedId,
      data: { status: 'running' },
      timestamp: new Date().toISOString(),
    });

    broadcaster.broadcast(subscribedId, {
      type: 'workorder:updated',
      workOrderId: subscribedId,
      data: { status: 'succeeded' },
      timestamp: new Date().toISOString(),
    });

    // Wait for subscribed event
    const event = await ws.waitForMessage(
      (msg: any) => msg.type === 'workorder:updated'
    );

    // Should only receive the subscribed one
    expect(event).toMatchObject({
      workOrderId: subscribedId,
    });
  });

  it('should allow subscribing to multiple work orders', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    const workOrder1 = 'wo-multi-1';
    const workOrder2 = 'wo-multi-2';

    // Subscribe to both
    sendMessage(ws, { type: 'subscribe', workOrderId: workOrder1 });
    await ws.waitForMessage((msg: any) =>
      msg.type === 'subscription_confirmed' && msg.workOrderId === workOrder1
    );

    sendMessage(ws, { type: 'subscribe', workOrderId: workOrder2 });
    await ws.waitForMessage((msg: any) =>
      msg.type === 'subscription_confirmed' && msg.workOrderId === workOrder2
    );

    // Should receive events for both
    broadcaster.broadcast(workOrder1, {
      type: 'workorder:updated',
      workOrderId: workOrder1,
      data: { status: 'running' },
      timestamp: new Date().toISOString(),
    });

    broadcaster.broadcast(workOrder2, {
      type: 'run:updated',
      workOrderId: workOrder2,
      data: { iteration: 1 },
      timestamp: new Date().toISOString(),
    });

    const event1 = await ws.waitForMessage(
      (msg: any) => msg.workOrderId === workOrder1
    );
    const event2 = await ws.waitForMessage(
      (msg: any) => msg.workOrderId === workOrder2
    );

    expect(event1).toBeDefined();
    expect(event2).toBeDefined();
  });
});
```

### Work Order for Thrust 5-6

**Prompt for AgentGate**:
```
Implement API contract tests and WebSocket integration tests for @agentgate/server.

TASKS:
1. Create packages/server/test/contract/helpers.ts with:
   - getTestApp() function
   - closeTestApp() function
   - authHeaders() helper

2. Create packages/server/test/contract/work-orders.contract.test.ts with:
   - Tests validating GET /api/v1/work-orders response structure
   - Tests validating GET /api/v1/work-orders/:id response
   - Tests validating POST /api/v1/work-orders request/response
   - Error response contract tests (400, 401, 404)
   - Use @agentgate/shared schemas for validation

3. Create packages/server/test/websocket/helpers.ts with:
   - createTestWebSocket() function
   - sendMessage() helper
   - waitFor() utility

4. Create packages/server/test/websocket/lifecycle.test.ts with:
   - Connection establishment test
   - Ping/pong test
   - Multiple connections test
   - Invalid message error test

5. Create packages/server/test/websocket/subscription.test.ts with:
   - Subscribe confirmation test
   - Unsubscribe confirmation test
   - Event delivery to subscriber test
   - Event isolation (non-subscriber doesn't receive) test
   - Multi-subscription test

6. Ensure all tests pass with pnpm test

VERIFICATION:
- pnpm --filter @agentgate/server test passes
- Contract tests validate response structures
- WebSocket tests verify real-time communication

CONSTRAINTS:
- Use vitest
- Use actual server (not mocks) for integration tests
- Use 'ws' package for WebSocket client
- Tests must clean up connections properly
- No flaky tests - use proper waits/timeouts
```

### Completion Checklist

- [ ] Contract test helpers created
- [ ] Work orders API contract tests passing
- [ ] Error response contract tests passing
- [ ] WebSocket test helpers created
- [ ] WebSocket lifecycle tests passing
- [ ] WebSocket subscription tests passing
- [ ] All tests clean up properly
- [ ] No flaky tests
