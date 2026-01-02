/**
 * Storage Validation Tests (v0.2.23 Wave 1.5)
 * Tests for work order storage validation on startup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { WorkOrderStore } from '../src/control-plane/work-order-store.js';
import { setAgentGateRoot, getWorkOrdersDir } from '../src/artifacts/paths.js';
import { createApp } from '../src/server/app.js';
import type { WorkOrder } from '../src/types/index.js';
import { WorkOrderStatus, AgentType, GatePlanSource } from '../src/types/index.js';

describe('Storage Validation', () => {
  let tempDir: string;
  let originalRoot: string | undefined;
  let store: WorkOrderStore;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = join(tmpdir(), `agentgate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });

    // Save original root
    originalRoot = process.env['AGENTGATE_ROOT'];
    process.env['AGENTGATE_ROOT'] = tempDir;
    setAgentGateRoot(tempDir);

    // Create work-orders directory
    await mkdir(getWorkOrdersDir(), { recursive: true });

    // Create a fresh store for each test
    store = new WorkOrderStore();
  });

  afterEach(async () => {
    // Restore original root
    if (originalRoot !== undefined) {
      process.env['AGENTGATE_ROOT'] = originalRoot;
    } else {
      delete process.env['AGENTGATE_ROOT'];
    }

    // Cleanup temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('WorkOrderStore.validateStorage()', () => {
    it('should return empty result for empty directory', async () => {
      const result = await store.validateStorage();

      expect(result.directoryExists).toBe(true);
      expect(result.totalFiles).toBe(0);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(0);
      expect(result.files).toEqual([]);
      expect(result.corruptedFiles).toEqual([]);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should validate valid work order files', async () => {
      // Create a valid work order
      const workOrder: WorkOrder = {
        id: 'test-order-1',
        taskPrompt: 'Test task prompt',
        workspaceSource: { type: 'local', path: '/tmp/test' },
        agentType: AgentType.CLAUDE_CODE_SUBSCRIPTION,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        gatePlanSource: GatePlanSource.AUTO,
        policies: {
          networkAllowed: false,
          allowedPaths: [],
          forbiddenPatterns: [],
        },
        createdAt: new Date(),
        status: WorkOrderStatus.QUEUED,
      };

      await store.save(workOrder);

      const result = await store.validateStorage();

      expect(result.totalFiles).toBe(1);
      expect(result.validCount).toBe(1);
      expect(result.invalidCount).toBe(0);
      expect(result.files[0].valid).toBe(true);
      expect(result.files[0].workOrderId).toBe('test-order-1');
      expect(result.corruptedFiles).toEqual([]);
    });

    it('should detect invalid JSON files', async () => {
      const invalidJsonPath = join(getWorkOrdersDir(), 'invalid.json');
      await writeFile(invalidJsonPath, 'not valid json {{{', 'utf-8');

      const result = await store.validateStorage();

      expect(result.totalFiles).toBe(1);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(1);
      expect(result.files[0].valid).toBe(false);
      expect(result.files[0].errorType).toBe('json_parse');
      expect(result.files[0].error).toBe('Invalid JSON format');
      expect(result.corruptedFiles).toContain(invalidJsonPath);
    });

    it('should detect files with missing required fields', async () => {
      const incompleteOrderPath = join(getWorkOrdersDir(), 'incomplete.json');
      await writeFile(
        incompleteOrderPath,
        JSON.stringify({
          id: 'incomplete-order',
          taskPrompt: 'Test',
          // Missing: workspaceSource, agentType, etc.
        }),
        'utf-8'
      );

      const result = await store.validateStorage();

      expect(result.totalFiles).toBe(1);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(1);
      expect(result.files[0].valid).toBe(false);
      expect(result.files[0].errorType).toBe('schema_invalid');
      expect(result.files[0].error).toContain('Missing required fields');
      expect(result.corruptedFiles).toContain(incompleteOrderPath);
    });

    it('should detect files with invalid field types', async () => {
      const invalidTypesPath = join(getWorkOrdersDir(), 'invalid-types.json');
      await writeFile(
        invalidTypesPath,
        JSON.stringify({
          id: 12345, // Should be string
          taskPrompt: 'Test',
          workspaceSource: { type: 'local', path: '/tmp' },
          agentType: 'claude-code-subscription',
          maxIterations: 3,
          maxWallClockSeconds: 3600,
          gatePlanSource: 'auto',
          policies: { networkAllowed: false, allowedPaths: [], forbiddenPatterns: [] },
          createdAt: '2024-01-01T00:00:00.000Z',
          status: 'queued',
        }),
        'utf-8'
      );

      const result = await store.validateStorage();

      expect(result.totalFiles).toBe(1);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(1);
      expect(result.files[0].valid).toBe(false);
      expect(result.files[0].errorType).toBe('schema_invalid');
      expect(result.files[0].error).toContain('id');
    });

    it('should detect files with invalid date format', async () => {
      const invalidDatePath = join(getWorkOrdersDir(), 'invalid-date.json');
      await writeFile(
        invalidDatePath,
        JSON.stringify({
          id: 'invalid-date-order',
          taskPrompt: 'Test',
          workspaceSource: { type: 'local', path: '/tmp' },
          agentType: 'claude-code-subscription',
          maxIterations: 3,
          maxWallClockSeconds: 3600,
          gatePlanSource: 'auto',
          policies: { networkAllowed: false, allowedPaths: [], forbiddenPatterns: [] },
          createdAt: 'not-a-date',
          status: 'queued',
        }),
        'utf-8'
      );

      const result = await store.validateStorage();

      expect(result.totalFiles).toBe(1);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(1);
      expect(result.files[0].valid).toBe(false);
      expect(result.files[0].errorType).toBe('schema_invalid');
      expect(result.files[0].error).toContain('createdAt');
    });

    it('should handle mixed valid and invalid files', async () => {
      // Create a valid work order
      const validOrder: WorkOrder = {
        id: 'valid-order',
        taskPrompt: 'Test task prompt',
        workspaceSource: { type: 'local', path: '/tmp/test' },
        agentType: AgentType.CLAUDE_CODE_SUBSCRIPTION,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        gatePlanSource: GatePlanSource.AUTO,
        policies: {
          networkAllowed: false,
          allowedPaths: [],
          forbiddenPatterns: [],
        },
        createdAt: new Date(),
        status: WorkOrderStatus.QUEUED,
      };
      await store.save(validOrder);

      // Create an invalid JSON file
      const invalidJsonPath = join(getWorkOrdersDir(), 'invalid.json');
      await writeFile(invalidJsonPath, '{invalid json}', 'utf-8');

      // Create a file with missing fields
      const incompleteOrderPath = join(getWorkOrdersDir(), 'incomplete.json');
      await writeFile(
        incompleteOrderPath,
        JSON.stringify({ id: 'incomplete' }),
        'utf-8'
      );

      const result = await store.validateStorage();

      expect(result.totalFiles).toBe(3);
      expect(result.validCount).toBe(1);
      expect(result.invalidCount).toBe(2);
      expect(result.corruptedFiles).toHaveLength(2);
    });

    it('should ignore non-JSON files', async () => {
      // Create a non-JSON file
      const textFilePath = join(getWorkOrdersDir(), 'readme.txt');
      await writeFile(textFilePath, 'This is a readme file', 'utf-8');

      // Create a valid work order
      const validOrder: WorkOrder = {
        id: 'valid-order',
        taskPrompt: 'Test task prompt',
        workspaceSource: { type: 'local', path: '/tmp/test' },
        agentType: AgentType.CLAUDE_CODE_SUBSCRIPTION,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        gatePlanSource: GatePlanSource.AUTO,
        policies: {
          networkAllowed: false,
          allowedPaths: [],
          forbiddenPatterns: [],
        },
        createdAt: new Date(),
        status: WorkOrderStatus.QUEUED,
      };
      await store.save(validOrder);

      const result = await store.validateStorage();

      // Should only count the JSON file
      expect(result.totalFiles).toBe(1);
      expect(result.validCount).toBe(1);
      expect(result.invalidCount).toBe(0);
    });
  });

  describe('WorkOrderStore.getCorruptedFiles()', () => {
    it('should return empty array for valid storage', async () => {
      const validOrder: WorkOrder = {
        id: 'valid-order',
        taskPrompt: 'Test task prompt',
        workspaceSource: { type: 'local', path: '/tmp/test' },
        agentType: AgentType.CLAUDE_CODE_SUBSCRIPTION,
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        gatePlanSource: GatePlanSource.AUTO,
        policies: {
          networkAllowed: false,
          allowedPaths: [],
          forbiddenPatterns: [],
        },
        createdAt: new Date(),
        status: WorkOrderStatus.QUEUED,
      };
      await store.save(validOrder);

      const corrupted = await store.getCorruptedFiles();

      expect(corrupted).toEqual([]);
    });

    it('should return paths of corrupted files', async () => {
      const invalidJsonPath = join(getWorkOrdersDir(), 'corrupted.json');
      await writeFile(invalidJsonPath, 'not valid json', 'utf-8');

      const corrupted = await store.getCorruptedFiles();

      expect(corrupted).toHaveLength(1);
      expect(corrupted[0]).toBe(invalidJsonPath);
    });
  });
});

describe('App Storage Validation on Startup', () => {
  let tempDir: string;
  let originalRoot: string | undefined;
  let app: FastifyInstance | null = null;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = join(tmpdir(), `agentgate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });

    // Save original root
    originalRoot = process.env['AGENTGATE_ROOT'];
    process.env['AGENTGATE_ROOT'] = tempDir;
    setAgentGateRoot(tempDir);

    // Create work-orders directory
    await mkdir(getWorkOrdersDir(), { recursive: true });
  });

  afterEach(async () => {
    // Close app if created
    if (app) {
      await app.close();
      app = null;
    }

    // Restore original root
    if (originalRoot !== undefined) {
      process.env['AGENTGATE_ROOT'] = originalRoot;
    } else {
      delete process.env['AGENTGATE_ROOT'];
    }

    // Cleanup temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should not validate storage by default', async () => {
    // Create corrupted file
    const invalidJsonPath = join(getWorkOrdersDir(), 'corrupted.json');
    await writeFile(invalidJsonPath, 'not valid json', 'utf-8');

    // App should start without issues
    app = await createApp({ enableLogging: false });

    expect(app).toBeDefined();
  });

  it('should validate storage when validateStorageOnStartup is true', async () => {
    // Create a valid work order via store
    const store = new WorkOrderStore();
    const validOrder: WorkOrder = {
      id: 'valid-order',
      taskPrompt: 'Test task prompt',
      workspaceSource: { type: 'local', path: '/tmp/test' },
      agentType: AgentType.CLAUDE_CODE_SUBSCRIPTION,
      maxIterations: 3,
      maxWallClockSeconds: 3600,
      gatePlanSource: GatePlanSource.AUTO,
      policies: {
        networkAllowed: false,
        allowedPaths: [],
        forbiddenPatterns: [],
      },
      createdAt: new Date(),
      status: WorkOrderStatus.QUEUED,
    };
    await store.save(validOrder);

    // App should start and validate without errors
    app = await createApp({
      enableLogging: false,
      validateStorageOnStartup: true,
    });

    expect(app).toBeDefined();
  });

  it('should log warning for corrupted files when validateStorageOnStartup is true', async () => {
    // Create corrupted file
    const invalidJsonPath = join(getWorkOrdersDir(), 'corrupted.json');
    await writeFile(invalidJsonPath, 'not valid json', 'utf-8');

    // App should still start (default is not to fail on corrupted)
    app = await createApp({
      enableLogging: false,
      validateStorageOnStartup: true,
    });

    expect(app).toBeDefined();
  });

  it('should throw error when failOnCorruptedStorage is true and files are corrupted', async () => {
    // Create corrupted file
    const invalidJsonPath = join(getWorkOrdersDir(), 'corrupted.json');
    await writeFile(invalidJsonPath, 'not valid json', 'utf-8');

    // App should fail to start
    await expect(
      createApp({
        enableLogging: false,
        validateStorageOnStartup: true,
        failOnCorruptedStorage: true,
      })
    ).rejects.toThrow('Storage validation failed');
  });

  it('should not throw when failOnCorruptedStorage is true but no corrupted files', async () => {
    // Create a valid work order via store
    const store = new WorkOrderStore();
    const validOrder: WorkOrder = {
      id: 'valid-order',
      taskPrompt: 'Test task prompt',
      workspaceSource: { type: 'local', path: '/tmp/test' },
      agentType: AgentType.CLAUDE_CODE_SUBSCRIPTION,
      maxIterations: 3,
      maxWallClockSeconds: 3600,
      gatePlanSource: GatePlanSource.AUTO,
      policies: {
        networkAllowed: false,
        allowedPaths: [],
        forbiddenPatterns: [],
      },
      createdAt: new Date(),
      status: WorkOrderStatus.QUEUED,
    };
    await store.save(validOrder);

    // App should start without issues
    app = await createApp({
      enableLogging: false,
      validateStorageOnStartup: true,
      failOnCorruptedStorage: true,
    });

    expect(app).toBeDefined();
  });
});
