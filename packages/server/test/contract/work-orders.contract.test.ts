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
        workspaceSource: { type: 'local' as const, path: '/tmp/workspace' },
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
