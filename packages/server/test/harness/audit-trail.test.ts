/**
 * Audit Trail Tests
 *
 * @since v0.2.16 - Thrust 12
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import {
  AuditTrail,
  createAuditTrail,
  loadAuditRecord,
  listAuditRecords,
  deleteAuditRecord,
  type ConfigAuditRecord,
} from '../../src/harness/audit-trail.js';
import { setAgentGateRoot, getAuditDir } from '../../src/artifacts/paths.js';
import type { ResolvedHarnessConfig } from '../../src/types/harness-config.js';
import { LoopStrategyMode, GitOperationMode } from '../../src/types/harness-config.js';

// Test fixtures
function createTestConfig(overrides: Partial<ResolvedHarnessConfig> = {}): ResolvedHarnessConfig {
  return {
    version: '1.0',
    loopStrategy: {
      mode: LoopStrategyMode.FIXED,
      maxIterations: 3,
      completionDetection: ['verification_pass'],
    },
    agentDriver: {
      type: 'claude-code-subscription',
    },
    verification: {
      skipLevels: [],
      timeoutMs: 300000,
      cleanRoom: true,
      parallelTests: true,
      retryFlaky: false,
      maxRetries: 0,
    },
    gitOps: {
      mode: GitOperationMode.LOCAL,
      branchPrefix: 'agentgate/',
      commitMessagePrefix: '[AgentGate]',
      autoCommit: true,
      autoPush: false,
      createPR: false,
      prDraft: true,
      prReviewers: [],
      prLabels: [],
    },
    executionLimits: {
      maxWallClockSeconds: 3600,
      maxIterationSeconds: 600,
      maxTotalTokens: 1000000,
      maxIterationTokens: 100000,
      maxDiskMb: 1024,
      maxMemoryMb: 2048,
      maxConcurrentAgents: 1,
    },
    metadata: {},
    ...overrides,
  };
}

describe('AuditTrail', () => {
  let tempDir: string;
  let originalRoot: string | undefined;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'agentgate-audit-test-'));
    originalRoot = process.env['AGENTGATE_ROOT'];
    setAgentGateRoot(tempDir);

    // Ensure audit directory exists
    await fs.mkdir(getAuditDir(), { recursive: true });
  });

  afterEach(async () => {
    // Restore original root
    if (originalRoot) {
      setAgentGateRoot(originalRoot);
    }

    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createAuditTrail', () => {
    it('should create an audit trail instance', () => {
      const trail = createAuditTrail('wo-123', 'run-456');
      expect(trail).toBeInstanceOf(AuditTrail);
    });
  });

  describe('AuditTrail instance', () => {
    let trail: AuditTrail;

    beforeEach(() => {
      trail = createAuditTrail('wo-123', 'run-456');
    });

    it('should record initial configuration', () => {
      const config = createTestConfig();
      const snapshot = trail.recordInitialConfig(config);

      expect(snapshot.id).toBeDefined();
      expect(snapshot.workOrderId).toBe('wo-123');
      expect(snapshot.runId).toBe('run-456');
      expect(snapshot.iteration).toBe(0);
      expect(snapshot.configHash).toBeDefined();
      expect(snapshot.changesFromPrevious).toBeNull();
    });

    it('should not create new snapshot when config unchanged', () => {
      const config = createTestConfig();
      trail.recordInitialConfig(config);

      const snapshot = trail.recordIterationConfig(config, 1);
      expect(snapshot).toBeNull();
    });

    it('should create snapshot when config changes', () => {
      const config1 = createTestConfig();
      trail.recordInitialConfig(config1);

      const config2 = createTestConfig({
        loopStrategy: {
          mode: LoopStrategyMode.HYBRID,
          baseIterations: 5,
          maxBonusIterations: 2,
          progressThreshold: 0.1,
          completionDetection: ['verification_pass'],
          progressTracking: 'git_history',
        },
      });

      const snapshot = trail.recordIterationConfig(config2, 1);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.changesFromPrevious).toBeDefined();
      expect(snapshot!.changesFromPrevious!.length).toBeGreaterThan(0);
    });

    it('should detect config changes', () => {
      const config1 = createTestConfig();
      trail.recordInitialConfig(config1);

      expect(trail.hasConfigChanged()).toBe(false);

      const config2 = createTestConfig({
        executionLimits: {
          maxWallClockSeconds: 7200,
          maxIterationSeconds: 600,
          maxTotalTokens: 1000000,
          maxIterationTokens: 100000,
          maxDiskMb: 1024,
          maxMemoryMb: 2048,
          maxConcurrentAgents: 1,
        },
      });

      trail.recordIterationConfig(config2, 1);
      expect(trail.hasConfigChanged()).toBe(true);
    });

    it('should record final configuration', () => {
      const config = createTestConfig();
      trail.recordInitialConfig(config);
      const finalSnapshot = trail.recordFinalConfig(config, 3);

      // If config hasn't changed, finalSnapshot is the initial snapshot (iteration 0)
      // The iteration field represents when this config was introduced
      expect(finalSnapshot.iteration).toBe(0);
      const record = trail.getRecord();
      expect(record!.finalConfig).not.toBeNull();
      expect(record!.totalIterations).toBe(3);
    });

    it('should save and load audit record', async () => {
      const config = createTestConfig();
      trail.recordInitialConfig(config);
      trail.recordFinalConfig(config, 2);

      await trail.save();

      const loaded = await loadAuditRecord('run-456');
      expect(loaded).not.toBeNull();
      expect(loaded!.runId).toBe('run-456');
      expect(loaded!.workOrderId).toBe('wo-123');
    });
  });

  describe('loadAuditRecord', () => {
    it('should return null for non-existent record', async () => {
      const loaded = await loadAuditRecord('non-existent');
      expect(loaded).toBeNull();
    });
  });

  describe('listAuditRecords', () => {
    it('should list all audit records', async () => {
      // Create multiple trails
      const trail1 = createAuditTrail('wo-1', 'run-1');
      trail1.recordInitialConfig(createTestConfig());
      await trail1.save();

      const trail2 = createAuditTrail('wo-2', 'run-2');
      trail2.recordInitialConfig(createTestConfig());
      await trail2.save();

      const records = await listAuditRecords();
      expect(records).toContain('run-1');
      expect(records).toContain('run-2');
    });

    it('should return empty array when no records exist', async () => {
      const records = await listAuditRecords();
      expect(records).toEqual([]);
    });
  });

  describe('deleteAuditRecord', () => {
    it('should delete existing record', async () => {
      const trail = createAuditTrail('wo-123', 'run-to-delete');
      trail.recordInitialConfig(createTestConfig());
      await trail.save();

      const deleted = await deleteAuditRecord('run-to-delete');
      expect(deleted).toBe(true);

      const loaded = await loadAuditRecord('run-to-delete');
      expect(loaded).toBeNull();
    });

    it('should return false for non-existent record', async () => {
      const deleted = await deleteAuditRecord('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('Config comparison', () => {
    it('should detect nested object changes', () => {
      const trail = createAuditTrail('wo-123', 'run-456');

      const config1 = createTestConfig();
      trail.recordInitialConfig(config1);

      const config2 = createTestConfig({
        verification: {
          skipLevels: ['L0'],
          timeoutMs: 600000,
          cleanRoom: false,
          parallelTests: true,
          retryFlaky: true,
          maxRetries: 3,
        },
      });

      const snapshot = trail.recordIterationConfig(config2, 1);
      expect(snapshot).not.toBeNull();

      const changes = snapshot!.changesFromPrevious!;
      const paths = changes.map(c => c.path);

      expect(paths).toContain('verification.skipLevels');
      expect(paths).toContain('verification.timeoutMs');
      expect(paths).toContain('verification.cleanRoom');
    });

    it('should handle array changes', () => {
      const trail = createAuditTrail('wo-123', 'run-456');

      const config1 = createTestConfig({
        loopStrategy: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 3,
          completionDetection: ['verification_pass'],
        },
      });
      trail.recordInitialConfig(config1);

      const config2 = createTestConfig({
        loopStrategy: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 3,
          completionDetection: ['verification_pass', 'no_changes', 'ci_pass'],
        },
      });

      const snapshot = trail.recordIterationConfig(config2, 1);
      expect(snapshot).not.toBeNull();

      const changes = snapshot!.changesFromPrevious!;
      const completionChange = changes.find(c => c.path === 'loopStrategy.completionDetection');
      expect(completionChange).toBeDefined();
    });
  });
});
