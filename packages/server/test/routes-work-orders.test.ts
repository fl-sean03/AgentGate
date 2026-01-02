/**
 * Work Orders Routes Unit Tests
 * Tests for /api/v1/work-orders endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { WorkOrderStatus, RunResult, RunState } from '../src/types/index.js';

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
      markSucceeded: vi.fn(async () => {}),
      markFailed: vi.fn(async () => {}),
      getCounts: vi.fn(async () => ({
        [WorkOrderStatus.QUEUED]: 1,
        [WorkOrderStatus.RUNNING]: 0,
        [WorkOrderStatus.SUCCEEDED]: 0,
        [WorkOrderStatus.FAILED]: 0,
        [WorkOrderStatus.CANCELED]: 0,
      })),
      purge: vi.fn(async (options: any) => {
        const orders = Array.from(mockOrders.values()) as any[];
        let matching = orders;

        // Filter by status
        if (options.statuses && options.statuses.length > 0) {
          matching = matching.filter((o) => options.statuses.includes(o.status));
        }

        // Filter by age
        if (options.olderThan) {
          matching = matching.filter((o) => o.createdAt < options.olderThan);
        }

        if (options.dryRun) {
          return {
            deletedCount: 0,
            deletedIds: [],
            wouldDelete: matching.length,
          };
        }

        const deletedIds = matching.map((o) => o.id);
        for (const id of deletedIds) {
          mockOrders.delete(id);
        }

        return {
          deletedCount: deletedIds.length,
          deletedIds,
        };
      }),
    },
    _mockOrders: mockOrders,
  };
});

// Mock run store with shared mock runs
const mockRuns: any[] = [];
vi.mock('../src/orchestrator/run-store.js', () => ({
  listRuns: vi.fn(async () => mockRuns),
}));

// Mock orchestrator
vi.mock('../src/orchestrator/orchestrator.js', () => ({
  createOrchestrator: vi.fn(() => ({
    execute: vi.fn(async (order: any) => {
      const run = {
        id: `run-${Date.now()}`,
        workOrderId: order.id,
        state: RunState.SUCCEEDED,
        result: RunResult.PASSED,
        iteration: 1,
        maxIterations: 3,
        startedAt: new Date(),
        completedAt: new Date(),
      };
      mockRuns.push(run);
      return run;
    }),
  })),
}));

describe('Work Orders Routes', () => {
  let app: FastifyInstance;
  const testApiKey = 'test-api-key-123';

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear mock orders
    const { _mockOrders } = await import('../src/control-plane/work-order-service.js');
    _mockOrders.clear();
    // Clear mock runs
    mockRuns.length = 0;

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

  describe('POST /api/v1/work-orders/:id/runs', () => {
    it('should start run for queued work order', async () => {
      const { _mockOrders } = await import('../src/control-plane/work-order-service.js');
      const order = {
        id: 'queued-order-1',
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
        method: 'POST',
        url: `/api/v1/work-orders/${order.id}/runs`,
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(202);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('runId');
      expect(body.data).toHaveProperty('status');
      expect(body.data).toHaveProperty('startedAt');
    });

    it('should start run for failed work order', async () => {
      const { _mockOrders } = await import('../src/control-plane/work-order-service.js');
      const order = {
        id: 'failed-order-1',
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
        method: 'POST',
        url: `/api/v1/work-orders/${order.id}/runs`,
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(202);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('runId');
    });

    it('should return 401 without auth header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders/some-id/runs',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 404 for nonexistent order', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders/nonexistent-id/runs',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Work order not found');
    });

    it('should return 409 when starting run for running work order', async () => {
      const { _mockOrders } = await import('../src/control-plane/work-order-service.js');
      const order = {
        id: 'running-order',
        taskPrompt: 'Test task',
        status: WorkOrderStatus.RUNNING,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(),
      };
      _mockOrders.set(order.id, order);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/work-orders/${order.id}/runs`,
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toContain('Cannot start run');
    });

    it('should return 409 when starting run for succeeded work order', async () => {
      const { _mockOrders } = await import('../src/control-plane/work-order-service.js');
      const order = {
        id: 'succeeded-order',
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
        method: 'POST',
        url: `/api/v1/work-orders/${order.id}/runs`,
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('should return 409 when starting run for canceled work order', async () => {
      const { _mockOrders } = await import('../src/control-plane/work-order-service.js');
      const order = {
        id: 'canceled-order-run',
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
        method: 'POST',
        url: `/api/v1/work-orders/${order.id}/runs`,
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('CONFLICT');
    });
  });

  describe('POST /api/v1/work-orders/purge', () => {
    it('should purge work orders with valid auth', async () => {
      const { _mockOrders } = await import('../src/control-plane/work-order-service.js');

      // Create some work orders
      const order1 = {
        id: 'purge-test-1',
        taskPrompt: 'Test task 1',
        status: WorkOrderStatus.FAILED,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      };
      const order2 = {
        id: 'purge-test-2',
        taskPrompt: 'Test task 2',
        status: WorkOrderStatus.SUCCEEDED,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      };
      _mockOrders.set(order1.id, order1);
      _mockOrders.set(order2.id, order2);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders/purge',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          statuses: ['failed'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.deletedCount).toBe(1);
      expect(body.data.deletedIds).toContain('purge-test-1');
    });

    it('should return 401 without auth header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders/purge',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          statuses: ['failed'],
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should support dry run mode', async () => {
      const { _mockOrders } = await import('../src/control-plane/work-order-service.js');

      const order = {
        id: 'dry-run-test',
        taskPrompt: 'Test task',
        status: WorkOrderStatus.FAILED,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(),
      };
      _mockOrders.set(order.id, order);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders/purge',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          statuses: ['failed'],
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.deletedCount).toBe(0);
      expect(body.data.wouldDelete).toBe(1);
      // Order should still exist
      expect(_mockOrders.has('dry-run-test')).toBe(true);
    });

    it('should support olderThanDays filter', async () => {
      const { _mockOrders, workOrderService } = await import('../src/control-plane/work-order-service.js');

      const oldOrder = {
        id: 'old-order',
        taskPrompt: 'Old task',
        status: WorkOrderStatus.FAILED,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      };
      const newOrder = {
        id: 'new-order',
        taskPrompt: 'New task',
        status: WorkOrderStatus.FAILED,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(), // Now
      };
      _mockOrders.set(oldOrder.id, oldOrder);
      _mockOrders.set(newOrder.id, newOrder);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders/purge',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          statuses: ['failed'],
          olderThanDays: 7, // Older than 7 days
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(workOrderService.purge).toHaveBeenCalled();
    });

    it('should support multiple status filters', async () => {
      const { _mockOrders } = await import('../src/control-plane/work-order-service.js');

      const failedOrder = {
        id: 'failed-order-purge',
        taskPrompt: 'Failed task',
        status: WorkOrderStatus.FAILED,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(),
      };
      const canceledOrder = {
        id: 'canceled-order-purge',
        taskPrompt: 'Canceled task',
        status: WorkOrderStatus.CANCELED,
        workspaceSource: { type: 'local' as const, path: '/tmp' },
        agentType: 'claude-code-subscription' as const,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        createdAt: new Date(),
      };
      _mockOrders.set(failedOrder.id, failedOrder);
      _mockOrders.set(canceledOrder.id, canceledOrder);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders/purge',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          statuses: ['failed', 'canceled'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.deletedCount).toBe(2);
    });

    it('should reject invalid status values', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders/purge',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          statuses: ['invalid_status'],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    it('should accept empty body for purging all', async () => {
      const { workOrderService } = await import('../src/control-plane/work-order-service.js');

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders/purge',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(workOrderService.purge).toHaveBeenCalled();
    });
  });
});
