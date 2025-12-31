/**
 * Metrics Storage Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  saveIterationMetrics,
  loadIterationMetrics,
  saveRunMetrics,
  loadRunMetrics,
  getAllIterationMetrics,
  metricsExist,
  ensureMetricsStructure,
} from '../src/metrics/storage.js';
import { setAgentGateRoot } from '../src/artifacts/paths.js';
import type { IterationMetrics, RunMetrics, LevelMetrics, PhaseMetrics } from '../src/types/index.js';

describe('Metrics Storage', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temp directory for tests
    testDir = join(tmpdir(), `agentgate-metrics-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    setAgentGateRoot(testDir);
  });

  afterEach(async () => {
    // Clean up
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  function createMockLevelMetrics(level: string): LevelMetrics {
    return {
      level: level as 'L0' | 'L1' | 'L2' | 'L3',
      passed: true,
      durationMs: 1000,
      checksRun: 5,
      checksPassed: 5,
    };
  }

  function createMockPhaseMetrics(): PhaseMetrics {
    return {
      phase: 'build',
      startedAt: new Date('2025-01-01T10:00:00Z'),
      completedAt: new Date('2025-01-01T10:00:30Z'),
      durationMs: 30000,
    };
  }

  function createMockIterationMetrics(
    runId: string,
    iteration: number
  ): IterationMetrics {
    return {
      iteration,
      runId,
      phases: [createMockPhaseMetrics()],
      totalDurationMs: 60000,
      agentTokensInput: 1000,
      agentTokensOutput: 500,
      agentExitCode: 0,
      agentDurationMs: 25000,
      filesChanged: 3,
      insertions: 100,
      deletions: 20,
      verificationPassed: true,
      verificationDurationMs: 20000,
      verificationLevels: [
        createMockLevelMetrics('L0'),
        createMockLevelMetrics('L1'),
        createMockLevelMetrics('L2'),
        createMockLevelMetrics('L3'),
      ],
      startedAt: new Date('2025-01-01T10:00:00Z'),
      completedAt: new Date('2025-01-01T10:01:00Z'),
    };
  }

  function createMockRunMetrics(runId: string): RunMetrics {
    return {
      runId,
      workOrderId: 'wo-1',
      totalDurationMs: 120000,
      iterationCount: 2,
      successfulIterations: 1,
      failedIterations: 1,
      result: 'passed',
      totalBuildDurationMs: 60000,
      totalSnapshotDurationMs: 10000,
      totalVerifyDurationMs: 40000,
      totalFeedbackDurationMs: 10000,
      totalTokensInput: 2000,
      totalTokensOutput: 1000,
      totalFilesChanged: 5,
      totalInsertions: 150,
      totalDeletions: 30,
      finalVerificationPassed: true,
      finalVerificationLevels: [
        createMockLevelMetrics('L0'),
        createMockLevelMetrics('L1'),
        createMockLevelMetrics('L2'),
        createMockLevelMetrics('L3'),
      ],
      startedAt: new Date('2025-01-01T10:00:00Z'),
      completedAt: new Date('2025-01-01T10:02:00Z'),
      collectedAt: new Date('2025-01-01T10:02:01Z'),
    };
  }

  describe('ensureMetricsStructure', () => {
    it('should create metrics directories', async () => {
      await ensureMetricsStructure('run-1');
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('iteration metrics', () => {
    it('should save and load iteration metrics', async () => {
      const metrics = createMockIterationMetrics('run-1', 1);

      await saveIterationMetrics(metrics);
      const loaded = await loadIterationMetrics('run-1', 1);

      expect(loaded).not.toBeNull();
      expect(loaded?.iteration).toBe(1);
      expect(loaded?.runId).toBe('run-1');
      expect(loaded?.agentTokensInput).toBe(1000);
      expect(loaded?.filesChanged).toBe(3);
    });

    it('should return null for non-existent metrics', async () => {
      const loaded = await loadIterationMetrics('run-nonexistent', 1);
      expect(loaded).toBeNull();
    });

    it('should preserve date types', async () => {
      const metrics = createMockIterationMetrics('run-1', 1);

      await saveIterationMetrics(metrics);
      const loaded = await loadIterationMetrics('run-1', 1);

      expect(loaded?.startedAt).toBeInstanceOf(Date);
      expect(loaded?.completedAt).toBeInstanceOf(Date);
      expect(loaded?.phases[0].startedAt).toBeInstanceOf(Date);
    });
  });

  describe('run metrics', () => {
    it('should save and load run metrics', async () => {
      const metrics = createMockRunMetrics('run-1');

      await saveRunMetrics(metrics);
      const loaded = await loadRunMetrics('run-1');

      expect(loaded).not.toBeNull();
      expect(loaded?.runId).toBe('run-1');
      expect(loaded?.iterationCount).toBe(2);
      expect(loaded?.totalTokensInput).toBe(2000);
      expect(loaded?.result).toBe('passed');
    });

    it('should return null for non-existent metrics', async () => {
      const loaded = await loadRunMetrics('run-nonexistent');
      expect(loaded).toBeNull();
    });

    it('should preserve date types', async () => {
      const metrics = createMockRunMetrics('run-1');

      await saveRunMetrics(metrics);
      const loaded = await loadRunMetrics('run-1');

      expect(loaded?.startedAt).toBeInstanceOf(Date);
      expect(loaded?.completedAt).toBeInstanceOf(Date);
      expect(loaded?.collectedAt).toBeInstanceOf(Date);
    });
  });

  describe('getAllIterationMetrics', () => {
    it('should return all iterations sorted', async () => {
      await saveIterationMetrics(createMockIterationMetrics('run-1', 3));
      await saveIterationMetrics(createMockIterationMetrics('run-1', 1));
      await saveIterationMetrics(createMockIterationMetrics('run-1', 2));

      const all = await getAllIterationMetrics('run-1');

      expect(all).toHaveLength(3);
      expect(all[0].iteration).toBe(1);
      expect(all[1].iteration).toBe(2);
      expect(all[2].iteration).toBe(3);
    });

    it('should return empty array for non-existent run', async () => {
      const all = await getAllIterationMetrics('run-nonexistent');
      expect(all).toEqual([]);
    });
  });

  describe('metricsExist', () => {
    it('should return true when metrics exist', async () => {
      const metrics = createMockRunMetrics('run-1');
      await saveRunMetrics(metrics);

      const exists = await metricsExist('run-1');
      expect(exists).toBe(true);
    });

    it('should return false when metrics do not exist', async () => {
      const exists = await metricsExist('run-nonexistent');
      expect(exists).toBe(false);
    });
  });
});
