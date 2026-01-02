/**
 * Audit Routes Unit Tests
 * Tests for /api/v1/audit endpoints
 * v0.2.17 - Thrust 3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { ConfigAuditRecord, ConfigSnapshot } from '../src/harness/audit-trail.js';

// Mock audit records storage
const mockAuditRecords = new Map<string, ConfigAuditRecord>();

// Helper to create a mock config snapshot
function createMockSnapshot(
  runId: string,
  workOrderId: string,
  iteration: number,
  options: {
    changesFromPrevious?: Array<{ path: string; previousValue: unknown; newValue: unknown }>;
  } = {}
): ConfigSnapshot {
  return {
    id: `${runId}-snap-${iteration}`,
    workOrderId,
    runId,
    iteration,
    timestamp: new Date(),
    config: {
      loopStrategy: {
        mode: 'fixed',
        maxIterations: 3,
      },
      verification: {
        skipLevels: [],
      },
      gitOps: {
        mode: 'local',
      },
      executionLimits: {
        maxWallClockSeconds: 3600,
      },
    } as any,
    configHash: `hash-${iteration}`,
    changesFromPrevious: options.changesFromPrevious ?? null,
  };
}

// Helper to create a mock audit record
function createMockAuditRecord(
  runId: string,
  workOrderId: string,
  options: {
    iterationSnapshots?: ConfigSnapshot[];
    configChanged?: boolean;
  } = {}
): ConfigAuditRecord {
  const initialConfig = createMockSnapshot(runId, workOrderId, 0);
  const finalConfig = createMockSnapshot(runId, workOrderId, 3);

  return {
    runId,
    workOrderId,
    createdAt: new Date(),
    updatedAt: new Date(),
    initialConfig,
    iterationSnapshots: options.iterationSnapshots ?? [],
    finalConfig,
    totalIterations: 3,
    configChanged: options.configChanged ?? false,
  };
}

// Mock audit-trail module
vi.mock('../src/harness/audit-trail.js', () => ({
  loadAuditRecord: vi.fn(async (runId: string) => {
    return mockAuditRecords.get(runId) ?? null;
  }),
  listAuditRecords: vi.fn(async () => {
    return Array.from(mockAuditRecords.keys());
  }),
  createAuditTrail: vi.fn(),
  AuditTrail: vi.fn(),
}));

describe('Audit Routes', () => {
  let app: FastifyInstance;
  const testApiKey = 'test-api-key-123';

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuditRecords.clear();

    app = await createApp({
      apiKey: testApiKey,
      enableLogging: false,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/audit/runs/:runId', () => {
    it('should return audit record summary when found', async () => {
      const runId = 'run-123';
      const workOrderId = 'wo-123';
      mockAuditRecords.set(runId, createMockAuditRecord(runId, workOrderId));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.runId).toBe(runId);
      expect(body.data.workOrderId).toBe(workOrderId);
    });

    it('should return 404 when audit record not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/runs/nonexistent-run',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Audit record not found');
    });

    it('should return expected fields in response', async () => {
      const runId = 'run-456';
      mockAuditRecords.set(runId, createMockAuditRecord(runId, 'wo-456'));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}`,
      });

      const body = response.json();
      expect(body.data).toHaveProperty('runId');
      expect(body.data).toHaveProperty('workOrderId');
      expect(body.data).toHaveProperty('startedAt');
      expect(body.data).toHaveProperty('completedAt');
      expect(body.data).toHaveProperty('initialConfig');
      expect(body.data).toHaveProperty('finalConfig');
      expect(body.data).toHaveProperty('snapshotCount');
      expect(body.data).toHaveProperty('changeCount');
      expect(body.data).toHaveProperty('configHashChanged');
    });

    it('should include initialConfig snapshot', async () => {
      const runId = 'run-789';
      mockAuditRecords.set(runId, createMockAuditRecord(runId, 'wo-789'));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}`,
      });

      const body = response.json();
      expect(body.data.initialConfig).toBeDefined();
      expect(body.data.initialConfig).toHaveProperty('id');
      expect(body.data.initialConfig).toHaveProperty('workOrderId');
      expect(body.data.initialConfig).toHaveProperty('runId');
      expect(body.data.initialConfig).toHaveProperty('iteration');
      expect(body.data.initialConfig).toHaveProperty('snapshotAt');
      expect(body.data.initialConfig).toHaveProperty('configHash');
      expect(body.data.initialConfig).toHaveProperty('config');
    });

    it('should include config details in snapshot', async () => {
      const runId = 'run-config';
      mockAuditRecords.set(runId, createMockAuditRecord(runId, 'wo-config'));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}`,
      });

      const body = response.json();
      const config = body.data.initialConfig.config;
      expect(config).toHaveProperty('loopStrategy');
      expect(config.loopStrategy).toHaveProperty('mode');
      expect(config).toHaveProperty('verification');
      expect(config).toHaveProperty('gitOps');
      expect(config).toHaveProperty('executionLimits');
    });

    it('should return configHashChanged=false when hashes match', async () => {
      const runId = 'run-no-change';
      const record = createMockAuditRecord(runId, 'wo-no-change');
      // Set same hash
      record.initialConfig.configHash = 'same-hash';
      record.finalConfig!.configHash = 'same-hash';
      mockAuditRecords.set(runId, record);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}`,
      });

      const body = response.json();
      expect(body.data.configHashChanged).toBe(false);
    });

    it('should return configHashChanged=true when hashes differ', async () => {
      const runId = 'run-changed';
      const record = createMockAuditRecord(runId, 'wo-changed');
      record.initialConfig.configHash = 'hash-initial';
      record.finalConfig!.configHash = 'hash-final';
      mockAuditRecords.set(runId, record);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}`,
      });

      const body = response.json();
      expect(body.data.configHashChanged).toBe(true);
    });

    it('should not require authentication', async () => {
      const runId = 'run-no-auth';
      mockAuditRecords.set(runId, createMockAuditRecord(runId, 'wo-no-auth'));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}`,
        // No auth header
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/audit/runs/:runId/snapshots', () => {
    it('should return list of snapshots', async () => {
      const runId = 'run-snap-list';
      mockAuditRecords.set(runId, createMockAuditRecord(runId, 'wo-snap-list'));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}/snapshots`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('items');
      expect(body.data).toHaveProperty('total');
      expect(Array.isArray(body.data.items)).toBe(true);
    });

    it('should return 404 when audit record not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/runs/nonexistent/snapshots',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should include initial snapshot (iteration 0)', async () => {
      const runId = 'run-initial-snap';
      mockAuditRecords.set(runId, createMockAuditRecord(runId, 'wo-initial-snap'));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}/snapshots`,
      });

      const body = response.json();
      const initialSnap = body.data.items.find((s: any) => s.iteration === 0);
      expect(initialSnap).toBeDefined();
    });

    it('should include iteration snapshots', async () => {
      const runId = 'run-iter-snap';
      const record = createMockAuditRecord(runId, 'wo-iter-snap');
      record.iterationSnapshots = [
        createMockSnapshot(runId, 'wo-iter-snap', 1),
        createMockSnapshot(runId, 'wo-iter-snap', 2),
      ];
      mockAuditRecords.set(runId, record);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}/snapshots`,
      });

      const body = response.json();
      // Should include: initial (0) + 2 iterations (1, 2) + final (3)
      expect(body.data.items.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by iteration when specified', async () => {
      const runId = 'run-filter-iter';
      const record = createMockAuditRecord(runId, 'wo-filter-iter');
      record.iterationSnapshots = [
        createMockSnapshot(runId, 'wo-filter-iter', 1),
        createMockSnapshot(runId, 'wo-filter-iter', 2),
      ];
      mockAuditRecords.set(runId, record);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}/snapshots?iteration=1`,
      });

      const body = response.json();
      expect(body.data.items.every((s: any) => s.iteration === 1)).toBe(true);
    });

    it('should return empty array when iteration not found', async () => {
      const runId = 'run-no-iter';
      mockAuditRecords.set(runId, createMockAuditRecord(runId, 'wo-no-iter'));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}/snapshots?iteration=999`,
      });

      const body = response.json();
      expect(body.data.items).toHaveLength(0);
    });

    it('should return snapshot with expected format', async () => {
      const runId = 'run-snap-format';
      mockAuditRecords.set(runId, createMockAuditRecord(runId, 'wo-snap-format'));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}/snapshots`,
      });

      const body = response.json();
      const snapshot = body.data.items[0];
      expect(snapshot).toHaveProperty('id');
      expect(snapshot).toHaveProperty('workOrderId');
      expect(snapshot).toHaveProperty('runId');
      expect(snapshot).toHaveProperty('iteration');
      expect(snapshot).toHaveProperty('snapshotAt');
      expect(snapshot).toHaveProperty('configHash');
      expect(snapshot).toHaveProperty('config');
    });
  });

  describe('GET /api/v1/audit/runs/:runId/changes', () => {
    it('should return list of changes', async () => {
      const runId = 'run-changes';
      const record = createMockAuditRecord(runId, 'wo-changes');
      record.iterationSnapshots = [
        createMockSnapshot(runId, 'wo-changes', 1, {
          changesFromPrevious: [
            { path: 'loopStrategy.maxIterations', previousValue: 3, newValue: 5 },
          ],
        }),
      ];
      mockAuditRecords.set(runId, record);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}/changes`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('items');
      expect(body.data).toHaveProperty('total');
      expect(body.data).toHaveProperty('summary');
    });

    it('should return 404 when audit record not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/runs/nonexistent/changes',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return empty array when no changes', async () => {
      const runId = 'run-no-changes';
      mockAuditRecords.set(runId, createMockAuditRecord(runId, 'wo-no-changes'));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}/changes`,
      });

      const body = response.json();
      expect(body.data.items).toHaveLength(0);
      expect(body.data.total).toBe(0);
    });

    it('should include change details', async () => {
      const runId = 'run-change-details';
      const record = createMockAuditRecord(runId, 'wo-change-details');
      record.iterationSnapshots = [
        createMockSnapshot(runId, 'wo-change-details', 1, {
          changesFromPrevious: [
            { path: 'verification.skipLevels', previousValue: [], newValue: ['lint'] },
          ],
        }),
      ];
      mockAuditRecords.set(runId, record);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}/changes`,
      });

      const body = response.json();
      const change = body.data.items[0];
      expect(change).toHaveProperty('iteration');
      expect(change).toHaveProperty('path');
      expect(change).toHaveProperty('previousValue');
      expect(change).toHaveProperty('newValue');
      expect(change).toHaveProperty('changedAt');
    });

    it('should include summary with changedPaths', async () => {
      const runId = 'run-summary';
      const record = createMockAuditRecord(runId, 'wo-summary');
      record.iterationSnapshots = [
        createMockSnapshot(runId, 'wo-summary', 1, {
          changesFromPrevious: [
            { path: 'loopStrategy.mode', previousValue: 'fixed', newValue: 'hybrid' },
            { path: 'executionLimits.maxWallClockSeconds', previousValue: 3600, newValue: 7200 },
          ],
        }),
      ];
      mockAuditRecords.set(runId, record);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}/changes`,
      });

      const body = response.json();
      expect(body.data.summary).toHaveProperty('totalChanges');
      expect(body.data.summary).toHaveProperty('changedPaths');
      expect(body.data.summary.totalChanges).toBe(2);
      expect(body.data.summary.changedPaths).toContain('loopStrategy.mode');
      expect(body.data.summary.changedPaths).toContain('executionLimits.maxWallClockSeconds');
    });

    it('should aggregate changes across iterations', async () => {
      const runId = 'run-aggregate';
      const record = createMockAuditRecord(runId, 'wo-aggregate');
      record.iterationSnapshots = [
        createMockSnapshot(runId, 'wo-aggregate', 1, {
          changesFromPrevious: [
            { path: 'loopStrategy.maxIterations', previousValue: 3, newValue: 5 },
          ],
        }),
        createMockSnapshot(runId, 'wo-aggregate', 2, {
          changesFromPrevious: [
            { path: 'verification.cleanRoom', previousValue: false, newValue: true },
          ],
        }),
      ];
      mockAuditRecords.set(runId, record);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}/changes`,
      });

      const body = response.json();
      expect(body.data.total).toBe(2);
      expect(body.data.items).toHaveLength(2);
    });

    it('should not require authentication', async () => {
      const runId = 'run-no-auth-changes';
      mockAuditRecords.set(runId, createMockAuditRecord(runId, 'wo-no-auth-changes'));

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/runs/${runId}/changes`,
        // No auth header
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Error handling', () => {
    it('should return 400 for invalid runId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/runs/',
      });

      expect([400, 404]).toContain(response.statusCode);
    });

    it('should handle empty runId gracefully', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/runs/%20/snapshots',
      });

      // Either 400 or 404 is acceptable
      expect([400, 404]).toContain(response.statusCode);
    });
  });
});
