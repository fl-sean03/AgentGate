/**
 * Auth Middleware Unit Tests
 * Tests for API key authentication
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { WorkOrderStatus } from '../src/types/index.js';

// Mock the work order service to avoid real database operations
vi.mock('../src/control-plane/work-order-service.js', () => {
  return {
    workOrderService: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => null),
      submit: vi.fn(async (request: any) => ({
        id: 'test-wo-1',
        taskPrompt: request.taskPrompt,
        workspaceSource: request.workspaceSource,
        agentType: request.agentType ?? 'claude-code-subscription',
        maxIterations: request.maxIterations ?? 3,
        maxWallClockSeconds: request.maxWallClockSeconds ?? 3600,
        status: WorkOrderStatus.QUEUED,
        createdAt: new Date(),
      })),
      cancel: vi.fn(async () => undefined),
      getCounts: vi.fn(async () => ({
        [WorkOrderStatus.QUEUED]: 0,
        [WorkOrderStatus.RUNNING]: 0,
        [WorkOrderStatus.SUCCEEDED]: 0,
        [WorkOrderStatus.FAILED]: 0,
        [WorkOrderStatus.CANCELED]: 0,
      })),
    },
  };
});

vi.mock('../src/orchestrator/run-store.js', () => ({
  listRuns: vi.fn(async () => []),
}));

describe('Auth Middleware', () => {
  let app: FastifyInstance;
  const testApiKey = 'test-api-key-secret-123';

  // Reset API key before each test to ensure isolation
  beforeEach(async () => {
    const { setApiKey } = await import('../src/server/middleware/auth.js');
    setApiKey(undefined);
  });

  describe('With API key configured', () => {
    beforeEach(async () => {
      app = await createApp({
        apiKey: testApiKey,
        enableLogging: false,
      });
    });

    afterEach(async () => {
      await app.close();
    });

    it('should allow request with valid API key', async () => {
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
            type: 'local',
            path: '/tmp/test',
          },
        },
      });

      // Should not be 401 (auth passed, may fail for other reasons)
      expect(response.statusCode).not.toBe(401);
    });

    it('should reject request with invalid API key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Authorization': 'Bearer wrong-key-invalid',
          'Content-Type': 'application/json',
        },
        payload: {
          taskPrompt: 'Test task',
          workspaceSource: {
            type: 'local',
            path: '/tmp',
          },
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Invalid API key');
    });

    it('should reject request without Authorization header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          taskPrompt: 'Test task',
          workspaceSource: {
            type: 'local',
            path: '/tmp',
          },
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Authorization header required');
    });

    it('should reject malformed Bearer token format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Authorization': testApiKey, // Missing 'Bearer ' prefix
          'Content-Type': 'application/json',
        },
        payload: {
          taskPrompt: 'Test task',
          workspaceSource: {
            type: 'local',
            path: '/tmp',
          },
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Invalid authorization format');
    });

    it('should reject Basic auth format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Authorization': 'Basic dXNlcjpwYXNz', // Basic auth instead of Bearer
          'Content-Type': 'application/json',
        },
        payload: {
          taskPrompt: 'Test task',
          workspaceSource: {
            type: 'local',
            path: '/tmp',
          },
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Invalid authorization format');
    });

    it('should reject empty Bearer token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Authorization': 'Bearer ', // Empty token
          'Content-Type': 'application/json',
        },
        payload: {
          taskPrompt: 'Test task',
          workspaceSource: {
            type: 'local',
            path: '/tmp',
          },
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should include request ID in auth error responses', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Authorization': 'Bearer wrong-key',
          'Content-Type': 'application/json',
        },
        payload: {
          taskPrompt: 'Test task',
          workspaceSource: {
            type: 'local',
            path: '/tmp',
          },
        },
      });

      const body = response.json();
      expect(body).toHaveProperty('requestId');
      expect(typeof body.requestId).toBe('string');
    });

    it('should protect DELETE endpoints', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/work-orders/test-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should allow valid key on DELETE endpoints', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/work-orders/nonexistent-id',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      // Should not be 401 (will be 404 for nonexistent ID, but auth passed)
      expect(response.statusCode).not.toBe(401);
    });
  });

  describe('Without API key configured', () => {
    beforeEach(async () => {
      app = await createApp({
        // No API key
        enableLogging: false,
      });
    });

    afterEach(async () => {
      await app.close();
    });

    it('should allow requests without auth when no API key is set', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          taskPrompt: 'This is a valid task prompt with enough characters',
          workspaceSource: {
            type: 'local',
            path: '/tmp/test',
          },
        },
      });

      // Should not be 401 when no API key is configured
      expect(response.statusCode).not.toBe(401);
    });

    it('should allow DELETE without auth when no API key is set', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/work-orders/some-id',
      });

      // Should not be 401 (will be 404, but auth is bypassed)
      expect(response.statusCode).not.toBe(401);
    });
  });

  describe('Public endpoints', () => {
    beforeEach(async () => {
      app = await createApp({
        apiKey: testApiKey,
        enableLogging: false,
      });
    });

    afterEach(async () => {
      await app.close();
    });

    it('should allow GET /health without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow GET /health/ready without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect([200, 503]).toContain(response.statusCode);
    });

    it('should allow GET /health/live without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow GET /api/v1/work-orders without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow GET /api/v1/work-orders/:id without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/work-orders/test-id',
      });

      // Will be 404, but not 401 - auth is not required for GET
      expect(response.statusCode).toBe(404);
    });
  });

  describe('Case sensitivity', () => {
    beforeEach(async () => {
      app = await createApp({
        apiKey: testApiKey,
        enableLogging: false,
      });
    });

    afterEach(async () => {
      await app.close();
    });

    it('should handle lowercase bearer', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Authorization': `bearer ${testApiKey}`, // lowercase 'bearer'
          'Content-Type': 'application/json',
        },
        payload: {
          taskPrompt: 'Test task',
          workspaceSource: {
            type: 'local',
            path: '/tmp',
          },
        },
      });

      // Implementation uses startsWith('Bearer ') which is case-sensitive
      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.message).toContain('Invalid authorization format');
    });

    it('should handle mixed case authorization header name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'authorization': `Bearer ${testApiKey}`, // lowercase header name
          'Content-Type': 'application/json',
        },
        payload: {
          taskPrompt: 'This is a valid task prompt with enough characters',
          workspaceSource: {
            type: 'local',
            path: '/tmp/test',
          },
        },
      });

      // HTTP headers are case-insensitive, this should work
      expect(response.statusCode).not.toBe(401);
    });
  });
});
