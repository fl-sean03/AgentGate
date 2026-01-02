import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentGateClient } from '../src/client.js';
import {
  NetworkError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  ConflictError,
  RateLimitError,
  ServerError,
} from '../src/errors.js';

describe('AgentGateClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: AgentGateClient;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new AgentGateClient({
      baseUrl: 'http://localhost:3000',
      apiKey: 'test-api-key',
      timeout: 5000,
      fetch: mockFetch as unknown as typeof fetch,
    });
  });

  describe('constructor', () => {
    it('should remove trailing slash from baseUrl', () => {
      const c = new AgentGateClient({
        baseUrl: 'http://localhost:3000/',
        fetch: mockFetch as unknown as typeof fetch,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: [], total: 0 } }),
      });

      c.workOrders.list();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:3000/api/'),
        expect.anything()
      );
    });

    it('should use default timeout of 30000', () => {
      const c = new AgentGateClient({
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as unknown as typeof fetch,
      });

      expect(c).toBeDefined();
    });
  });

  describe('request headers', () => {
    it('should include API key header when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: [], total: 0 } }),
      });

      await client.workOrders.list();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key',
          }),
        })
      );
    });

    it('should include Content-Type header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: [], total: 0 } }),
      });

      await client.workOrders.list();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should not include API key header when not provided', async () => {
      const clientWithoutApiKey = new AgentGateClient({
        baseUrl: 'http://localhost:3000',
        fetch: mockFetch as unknown as typeof fetch,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: [], total: 0 } }),
      });

      await clientWithoutApiKey.workOrders.list();

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders['X-API-Key']).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should throw ValidationError for 400 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { field: 'name' } },
        }),
      });

      await expect(client.workOrders.create({ taskPrompt: '', workspaceSource: { type: 'local', path: '/tmp' } }))
        .rejects.toThrow(ValidationError);
    });

    it('should throw AuthenticationError for 401 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
        }),
      });

      await expect(client.workOrders.list()).rejects.toThrow(AuthenticationError);
    });

    it('should throw NotFoundError for 404 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          success: false,
          error: { code: 'NOT_FOUND', message: 'wo_123' },
        }),
      });

      await expect(client.workOrders.get('wo_123')).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError for 409 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: { code: 'CONFLICT', message: 'Resource already exists' },
        }),
      });

      await expect(client.profiles.create({ name: 'existing' })).rejects.toThrow(ConflictError);
    });

    it('should throw RateLimitError for 429 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          success: false,
          error: { code: 'RATE_LIMIT', message: 'Too many requests' },
        }),
      });

      await expect(client.workOrders.list()).rejects.toThrow(RateLimitError);
    });

    it('should throw ServerError for 500 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          error: { code: 'SERVER_ERROR', message: 'Internal server error' },
        }),
      });

      await expect(client.workOrders.list()).rejects.toThrow(ServerError);
    });

    it('should throw NetworkError for fetch failures', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(client.workOrders.list()).rejects.toThrow(NetworkError);
    });

    it('should throw NetworkError for timeout', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(client.workOrders.list()).rejects.toThrow(NetworkError);
    });
  });

  describe('workOrders resource', () => {
    it('should list work orders', async () => {
      const mockResponse = {
        items: [
          { id: 'wo_1', taskPrompt: 'Task 1', status: 'queued' },
          { id: 'wo_2', taskPrompt: 'Task 2', status: 'running' },
        ],
        total: 2,
        limit: 10,
        offset: 0,
        hasMore: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockResponse }),
      });

      const result = await client.workOrders.list();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/work-orders',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should list work orders with filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: [], total: 0 } }),
      });

      await client.workOrders.list({ limit: 5, offset: 10, status: 'running' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/work-orders?limit=5&offset=10&status=running',
        expect.anything()
      );
    });

    it('should get work order by id', async () => {
      const mockWorkOrder = {
        id: 'wo_123',
        taskPrompt: 'Task',
        status: 'running',
        runs: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockWorkOrder }),
      });

      const result = await client.workOrders.get('wo_123');

      expect(result).toEqual(mockWorkOrder);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/work-orders/wo_123',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should create work order', async () => {
      const createOptions = {
        taskPrompt: 'New task',
        workspaceSource: { type: 'local' as const, path: '/tmp/test' },
        harness: {
          profile: 'ci-focused',
          loopStrategy: { maxIterations: 5 },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'wo_new', ...createOptions } }),
      });

      const result = await client.workOrders.create(createOptions);

      expect(result.id).toBe('wo_new');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/work-orders',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('New task'),
        })
      );
    });

    it('should cancel work order', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'wo_123', status: 'canceled', message: 'Work order canceled' },
        }),
      });

      const result = await client.workOrders.cancel('wo_123');

      expect(result.status).toBe('canceled');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/work-orders/wo_123',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('runs resource', () => {
    it('should list runs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: [], total: 0 } }),
      });

      await client.runs.list({ workOrderId: 'wo_123', status: 'running' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/runs?workOrderId=wo_123&status=running',
        expect.anything()
      );
    });

    it('should get run by id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'run_123', status: 'running', iterations: [] },
        }),
      });

      const result = await client.runs.get('run_123');

      expect(result.id).toBe('run_123');
    });

    it('should get run config', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { runId: 'run_123', config: { loopStrategy: { mode: 'fixed' } } },
        }),
      });

      const result = await client.runs.getConfig('run_123');

      expect(result.runId).toBe('run_123');
    });

    it('should get run strategy state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { runId: 'run_123', state: { iteration: 2 } },
        }),
      });

      const result = await client.runs.getStrategyState('run_123');

      expect(result.state).toEqual({ iteration: 2 });
    });
  });

  describe('profiles resource', () => {
    it('should list profiles', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { items: [{ name: 'default', isBuiltIn: true }], total: 1 },
        }),
      });

      const result = await client.profiles.list();

      expect(result.items).toHaveLength(1);
    });

    it('should get profile with resolve option', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { name: 'custom', resolved: { inheritanceChain: ['default', 'custom'] } },
        }),
      });

      await client.profiles.get('custom', true);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/profiles/custom?resolve=true',
        expect.anything()
      );
    });

    it('should create profile', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { name: 'new-profile', isBuiltIn: false },
        }),
      });

      const result = await client.profiles.create({
        name: 'new-profile',
        extends: 'default',
        loopStrategy: { mode: 'hybrid' },
      });

      expect(result.name).toBe('new-profile');
    });

    it('should update profile', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { name: 'my-profile', message: 'Updated' },
        }),
      });

      const result = await client.profiles.update('my-profile', {
        description: 'Updated description',
      });

      expect(result.message).toBe('Updated');
    });

    it('should delete profile', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { name: 'my-profile', message: 'Deleted' },
        }),
      });

      const result = await client.profiles.delete('my-profile');

      expect(result.message).toBe('Deleted');
    });

    it('should validate profile', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { valid: true, errors: [], warnings: [] },
        }),
      });

      const result = await client.profiles.validate('my-profile');

      expect(result.valid).toBe(true);
    });
  });

  describe('audit resource', () => {
    it('should get audit record', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            runId: 'run_123',
            workOrderId: 'wo_123',
            snapshotCount: 5,
            changeCount: 2,
            configHashChanged: true,
          },
        }),
      });

      const result = await client.audit.getRecord('run_123');

      expect(result.runId).toBe('run_123');
      expect(result.configHashChanged).toBe(true);
    });

    it('should get audit snapshots', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { items: [{ id: 'snap_1', iteration: 1 }], total: 1 },
        }),
      });

      const result = await client.audit.getSnapshots('run_123');

      expect(result.items).toHaveLength(1);
    });

    it('should get audit snapshots with iteration filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { items: [], total: 0 },
        }),
      });

      await client.audit.getSnapshots('run_123', 2);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/audit/runs/run_123/snapshots?iteration=2',
        expect.anything()
      );
    });

    it('should get audit changes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            items: [{ path: 'loopStrategy.maxIterations', previousValue: 5, newValue: 10 }],
            total: 1,
            summary: { totalChanges: 1, byInitiator: { user: 1, strategy: 0, system: 0 } },
          },
        }),
      });

      const result = await client.audit.getChanges('run_123');

      expect(result.items).toHaveLength(1);
      expect(result.summary.totalChanges).toBe(1);
    });
  });
});
