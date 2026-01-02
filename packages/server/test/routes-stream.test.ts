/**
 * Stream Routes Unit Tests
 * Tests for SSE Streaming API endpoints
 * v0.2.17 - Thrust 4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import http from 'http';
import { createApp } from '../src/server/app.js';
import { RunState } from '../src/types/index.js';
import type { Run } from '../src/types/index.js';

// Mock runs storage
const mockRuns = new Map<string, Run>();

// Helper to create a mock run
function createMockRun(
  runId: string,
  options: Partial<Run> = {}
): Run {
  return {
    id: runId,
    workOrderId: options.workOrderId ?? `wo-${runId}`,
    workspaceId: options.workspaceId ?? `ws-${runId}`,
    iteration: options.iteration ?? 1,
    maxIterations: options.maxIterations ?? 3,
    state: options.state ?? RunState.BUILDING,
    snapshotBeforeSha: null,
    snapshotAfterSha: null,
    snapshotIds: [],
    startedAt: options.startedAt ?? new Date(),
    completedAt: options.completedAt ?? null,
    result: options.result ?? null,
    error: null,
    sessionId: null,
    gitHubBranch: null,
    gitHubPrUrl: null,
    gitHubPrNumber: null,
    warnings: [],
    ciEnabled: false,
    ciIterationCount: 0,
    maxCiIterations: 3,
    ciStatus: null,
    ciPollingStartedAt: null,
    ciCompletedAt: null,
    ciWorkflowUrl: null,
  };
}

// Mock run-store module
vi.mock('../src/orchestrator/run-store.js', () => ({
  loadRun: vi.fn(async (runId: string) => {
    return mockRuns.get(runId) ?? null;
  }),
  listRuns: vi.fn(async () => Array.from(mockRuns.values())),
  saveRun: vi.fn(async () => {}),
  createRun: vi.fn(),
}));

/**
 * Helper function to make SSE requests and collect response data.
 * Uses real HTTP requests to handle SSE streaming properly.
 */
async function makeSSERequest(
  port: number,
  path: string,
  timeout = 200
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; data: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
      },
      (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk.toString();
        });

        // Give time for initial SSE events to be sent, then close
        setTimeout(() => {
          req.destroy();
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            data,
          });
        }, timeout);
      }
    );

    req.on('error', (err) => {
      // ECONNRESET is expected when we destroy the connection
      if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') {
        return;
      }
      reject(err);
    });

    req.end();
  });
}

describe('Stream Routes', () => {
  let app: FastifyInstance;
  let serverPort: number;
  const testApiKey = 'test-api-key-123';

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRuns.clear();

    app = await createApp({
      apiKey: testApiKey,
      enableLogging: false,
    });

    // Start the server on a random port for SSE tests
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    serverPort = typeof address === 'object' && address ? address.port : 0;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/runs/:id/stream', () => {
    it('should return 404 when run not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/runs/nonexistent/stream',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Run not found');
    });

    it('should establish SSE connection for existing run', async () => {
      const runId = 'run-sse-1';
      mockRuns.set(runId, createMockRun(runId));

      const response = await makeSSERequest(serverPort, `/api/v1/runs/${runId}/stream`);

      // SSE returns 200 with text/event-stream content type
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
    });

    it('should set correct SSE headers', async () => {
      const runId = 'run-sse-headers';
      mockRuns.set(runId, createMockRun(runId));

      const response = await makeSSERequest(serverPort, `/api/v1/runs/${runId}/stream`);

      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
    });

    it('should send connected event on connection', async () => {
      const runId = 'run-sse-connected';
      mockRuns.set(runId, createMockRun(runId, { iteration: 2 }));

      const response = await makeSSERequest(serverPort, `/api/v1/runs/${runId}/stream`);

      // Parse SSE response
      const payload = response.data;
      expect(payload).toContain('event: connected');
      expect(payload).toContain('"type":"connected"');
      expect(payload).toContain(`"runId":"${runId}"`);
    });

    it('should include clientId in connected event', async () => {
      const runId = 'run-sse-clientid';
      mockRuns.set(runId, createMockRun(runId));

      const response = await makeSSERequest(serverPort, `/api/v1/runs/${runId}/stream`);

      const payload = response.data;
      expect(payload).toContain('"clientId"');
    });

    it('should include current run status in connected event', async () => {
      const runId = 'run-sse-status';
      mockRuns.set(runId, createMockRun(runId, { state: RunState.BUILDING, iteration: 2 }));

      const response = await makeSSERequest(serverPort, `/api/v1/runs/${runId}/stream`);

      const payload = response.data;
      expect(payload).toContain('"runStatus"');
      expect(payload).toContain('"currentIteration"');
    });

    it('should not require authentication', async () => {
      const runId = 'run-sse-no-auth';
      mockRuns.set(runId, createMockRun(runId));

      // SSE connection without auth header
      const response = await makeSSERequest(serverPort, `/api/v1/runs/${runId}/stream`);

      expect(response.statusCode).toBe(200);
    });

    it('should return 400 for invalid run ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/runs//stream',
      });

      expect([400, 404]).toContain(response.statusCode);
    });
  });

  describe('GET /api/v1/runs/:id/config', () => {
    it('should return run configuration when found', async () => {
      const runId = 'run-config-1';
      const workOrderId = 'wo-config-1';
      mockRuns.set(runId, createMockRun(runId, { workOrderId }));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}/config`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.runId).toBe(runId);
      expect(body.data.workOrderId).toBe(workOrderId);
    });

    it('should return 404 when run not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/runs/nonexistent/config',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should include expected fields', async () => {
      const runId = 'run-config-fields';
      mockRuns.set(runId, createMockRun(runId, {
        workOrderId: 'wo-config-fields',
        state: RunState.BUILDING,
        iteration: 2,
        startedAt: new Date('2024-01-01T00:00:00Z'),
      }));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}/config`,
      });

      const body = response.json();
      expect(body.data).toHaveProperty('runId');
      expect(body.data).toHaveProperty('workOrderId');
      expect(body.data).toHaveProperty('state');
      expect(body.data).toHaveProperty('iteration');
      expect(body.data).toHaveProperty('startedAt');
      expect(body.data).toHaveProperty('completedAt');
    });

    it('should return null completedAt for running runs', async () => {
      const runId = 'run-config-running';
      mockRuns.set(runId, createMockRun(runId, {
        state: RunState.BUILDING,
        completedAt: null,
      }));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}/config`,
      });

      const body = response.json();
      expect(body.data.completedAt).toBeNull();
    });

    it('should return completedAt for completed runs', async () => {
      const runId = 'run-config-completed';
      const completedAt = new Date('2024-01-01T01:00:00Z');
      mockRuns.set(runId, createMockRun(runId, {
        state: RunState.SUCCEEDED,
        completedAt,
      }));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}/config`,
      });

      const body = response.json();
      expect(body.data.completedAt).toBe(completedAt.toISOString());
    });

    it('should not require authentication', async () => {
      const runId = 'run-config-no-auth';
      mockRuns.set(runId, createMockRun(runId));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}/config`,
        // No auth header
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return proper state values', async () => {
      const runId = 'run-config-state';
      mockRuns.set(runId, createMockRun(runId, { state: RunState.SUCCEEDED }));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}/config`,
      });

      const body = response.json();
      expect(body.data.state).toBe('succeeded');
    });

    it('should include iteration count', async () => {
      const runId = 'run-config-iteration';
      mockRuns.set(runId, createMockRun(runId, { iteration: 5 }));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}/config`,
      });

      const body = response.json();
      expect(body.data.iteration).toBe(5);
    });
  });

  describe('SSE Event Format', () => {
    it('should format events as SSE data', async () => {
      const runId = 'run-sse-format';
      mockRuns.set(runId, createMockRun(runId));

      const response = await makeSSERequest(serverPort, `/api/v1/runs/${runId}/stream`);

      const payload = response.data;

      // SSE format: event: type\ndata: json\n\n
      expect(payload).toMatch(/event: connected\n/);
      expect(payload).toMatch(/data: \{.*\}\n/);
    });

    it('should include timestamp in events', async () => {
      const runId = 'run-sse-timestamp';
      mockRuns.set(runId, createMockRun(runId));

      const response = await makeSSERequest(serverPort, `/api/v1/runs/${runId}/stream`);

      const payload = response.data;
      expect(payload).toContain('"timestamp"');
    });

    it('should include type in event data', async () => {
      const runId = 'run-sse-type';
      mockRuns.set(runId, createMockRun(runId));

      const response = await makeSSERequest(serverPort, `/api/v1/runs/${runId}/stream`);

      const payload = response.data;
      expect(payload).toContain('"type":"connected"');
    });
  });

  describe('Error handling', () => {
    it('should handle empty run ID gracefully for stream', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/runs/%20/stream',
      });

      expect([400, 404]).toContain(response.statusCode);
    });

    it('should handle empty run ID gracefully for config', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/runs/%20/config',
      });

      expect([400, 404]).toContain(response.statusCode);
    });

    it('should return proper error format for stream endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/runs/nonexistent/stream',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body).toHaveProperty('success', false);
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
    });

    it('should return proper error format for config endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/runs/nonexistent/config',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body).toHaveProperty('success', false);
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
    });
  });

  describe('Run state handling', () => {
    it('should return config for queued run', async () => {
      const runId = 'run-queued';
      mockRuns.set(runId, createMockRun(runId, { state: RunState.QUEUED }));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}/config`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.state).toBe('queued');
    });

    it('should return config for failed run', async () => {
      const runId = 'run-failed';
      mockRuns.set(runId, createMockRun(runId, {
        state: RunState.FAILED,
        completedAt: new Date(),
      }));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}/config`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.state).toBe('failed');
    });

    it('should return config for canceled run', async () => {
      const runId = 'run-canceled';
      mockRuns.set(runId, createMockRun(runId, {
        state: RunState.CANCELED,
        completedAt: new Date(),
      }));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}/config`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.state).toBe('canceled');
    });

    it('should allow SSE connection to completed run', async () => {
      const runId = 'run-completed-sse';
      mockRuns.set(runId, createMockRun(runId, {
        state: RunState.SUCCEEDED,
        completedAt: new Date(),
      }));

      const response = await makeSSERequest(serverPort, `/api/v1/runs/${runId}/stream`);

      // Should still allow connection (client might want to see final state)
      expect(response.statusCode).toBe(200);
    });
  });
});
