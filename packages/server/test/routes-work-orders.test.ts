/**
 * Work Orders Routes Unit Tests
 * Tests for /api/v1/work-orders endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { WorkOrderStatus } from '../src/types/index.js';

// Mock the work order service and run store
vi.mock('../src/control-plane/work-order-service.js', () => {
  const mockOrders = new Map();

  return {
    workOrderService: {
      list: vi.fn(async (filters: any) => {
        const orders = Array.from(mockOrders.values());
        let filtered = orders;

        if (filters.status) {
          filtered = filtered.filter((o: any) => o.status === filters.status);
        }

        const start = filters.offset ?? 0;
        const end = start + (filters.limit ?? 20);
        return filtered.slice(start, end);
      }),
      get: vi.fn(async (id: string) => {
        return mockOrders.get(id) || null;
      }),
      submit: vi.fn(async (request: any) => {
        const order = {
          id: `wo-${Date.now()}`,
          taskPrompt: request.taskPrompt,
          workspaceSource: request.workspaceSource,
          agentType: request.agentType ?? 'claude-code-subscription',
          maxIterations: request.maxIterations ?? 3,
          maxWallClockSeconds: request.maxWallClockSeconds ?? 3600,
          status: WorkOrderStatus.QUEUED,
          createdAt: new Date(),
        };
        mockOrders.set(order.id, order);
        return order;
      }),
      cancel: vi.fn(async (id: string) => {
        const order = mockOrders.get(id);
        if (!order) {
          throw new Error(`Work order not found: ${id}`);
        }
        if ([WorkOrderStatus.SUCCEEDED, WorkOrderStatus.FAILED, WorkOrderStatus.CANCELED].includes(order.status)) {
          throw new Error(`Cannot cancel work order in status '${order.status}'`);
        }
        order.status = WorkOrderStatus.CANCELED;
        mockOrders.set(id, order);
      }),
      getCounts: vi.fn(async () => ({
        [WorkOrderStatus.QUEUED]: 1,
        [WorkOrderStatus.RUNNING]: 0,
        [WorkOrderStatus.SUCCEEDED]: 0,
        [WorkOrderStatus.FAILED]: 0,
        [WorkOrderStatus.CANCELED]: 0,
      })),
    },
    _mockOrders: mockOrders,
  };
});

vi.mock('../src/orchestrator/run-store.js', () => ({
  listRuns: vi.fn(async () => []),
}));

describe('Work Orders Routes', () => {
  let app: FastifyInstance;
  const testApiKey = 'test-api-key-123';

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear mock orders
    const { _mockOrders } = await import('../src/control-plane/work-order-service.js');
    _mockOrders.clear();

    app = await createApp({
      apiKey: testApiKey,
      enableLogging: false,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/work-orders', () => {
    it('should return list of work orders', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('items');
      expect(Array.isArray(body.data.items)).toBe(true);
    });

    it('should return pagination metadata', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders',
      });

      const body = response.json();
      expect(body.data).toHaveProperty('total');
      expect(body.data).toHaveProperty('limit');
      expect(body.data).toHaveProperty('offset');
      expect(body.data).toHaveProperty('hasMore');
    });

    it('should support limit parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders?limit=5',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.limit).toBe(5);
    });

    it('should support offset parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders?offset=10',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.offset).toBe(10);
    });

    it('should support status filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders?status=queued',
      });

      expect(response.statusCode).toBe(200);
      const { workOrderService } = await import('../src/control-plane/work-order-service.js');
      expect(workOrderService.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'queued' })
      );
    });

    it('should reject invalid query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders?limit=invalid',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('GET /api/v1/work-orders/:id', () => {
    it('should return work order detail when found', async () => {
      // Create a work order first
      const { workOrderService, _mockOrders } = await import('../src/control-plane/work-order-service.js');
      const order = {
        id: 'test-order-1',
        taskPrompt: 'Test task',
        status: WorkOrderStatus.QUEUED,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(),
      };
      _mockOrders.set(order.id, order);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/work-orders/${order.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(order.id);
      expect(body.data).toHaveProperty('runs');
    });

    it('should return 404 when order not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders/nonexistent-id',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Work order not found');
    });

    it('should return work order with runs array', async () => {
      const { _mockOrders } = await import('../src/control-plane/work-order-service.js');
      const order = {
        id: 'test-order-2',
        taskPrompt: 'Test task',
        status: WorkOrderStatus.QUEUED,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(),
      };
      _mockOrders.set(order.id, order);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/work-orders/${order.id}`,
      });

      const body = response.json();
      expect(body.data.runs).toBeDefined();
      expect(Array.isArray(body.data.runs)).toBe(true);
    });
  });

  describe('POST /api/v1/work-orders', () => {
    const validPayload = {
      taskPrompt: 'This is a valid task prompt with enough characters',
      workspaceSource: {
        type: 'local' as const,
        path: '/tmp/test',
      },
    };

    it('should create work order with valid auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
      expect(body.data.taskPrompt).toBe(validPayload.taskPrompt);
    });

    it('should return 401 without auth header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 with invalid API key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Authorization': 'Bearer wrong-key',
          'Content-Type': 'application/json',
        },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should validate request body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          taskPrompt: 'short', // Too short
          workspaceSource: { type: 'local', path: '/tmp' },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toContain('Invalid request body');
    });

    it('should accept optional parameters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          ...validPayload,
          maxIterations: 5,
          maxTime: 1800,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
    });

    it('should handle github workspace source', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          taskPrompt: 'This is a valid task prompt with enough characters',
          workspaceSource: {
            type: 'github',
            repo: 'owner/repo',
            branch: 'main',
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
    });
  });

  describe('DELETE /api/v1/work-orders/:id', () => {
    it('should cancel work order with valid auth', async () => {
      // Create a queued order
      const { _mockOrders } = await import('../src/control-plane/work-order-service.js');
      const order = {
        id: 'cancel-test-1',
        taskPrompt: 'Test task',
        status: WorkOrderStatus.QUEUED,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(),
      };
      _mockOrders.set(order.id, order);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/work-orders/${order.id}`,
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('canceled');
    });

    it('should return 401 without auth header', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/work-orders/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 404 for nonexistent order', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/work-orders/nonexistent-id',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 409 when canceling completed order', async () => {
      // Create a completed order
      const { _mockOrders } = await import('../src/control-plane/work-order-service.js');
      const order = {
        id: 'completed-order',
        taskPrompt: 'Test task',
        status: WorkOrderStatus.SUCCEEDED,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(),
        completedAt: new Date(),
      };
      _mockOrders.set(order.id, order);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/work-orders/${order.id}`,
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toContain('Cannot cancel');
    });

    it('should return 409 when canceling failed order', async () => {
      const { _mockOrders } = await import('../src/control-plane/work-order-service.js');
      const order = {
        id: 'failed-order',
        taskPrompt: 'Test task',
        status: WorkOrderStatus.FAILED,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(),
        completedAt: new Date(),
      };
      _mockOrders.set(order.id, order);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/work-orders/${order.id}`,
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('should return 409 when canceling already canceled order', async () => {
      const { _mockOrders } = await import('../src/control-plane/work-order-service.js');
      const order = {
        id: 'canceled-order',
        taskPrompt: 'Test task',
        status: WorkOrderStatus.CANCELED,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(),
        completedAt: new Date(),
      };
      _mockOrders.set(order.id, order);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/work-orders/${order.id}`,
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('CONFLICT');
    });
  });
});
