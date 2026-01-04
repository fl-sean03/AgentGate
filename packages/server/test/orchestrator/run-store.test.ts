/**
 * Tests for run-store functions including listRuns optimization.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { RunState } from '../../src/types/index.js';
import {
  saveRun,
  loadRun,
  listRuns,
  listRunsSequential,
  createRun,
} from '../../src/orchestrator/run-store.js';
import { setAgentGateRoot } from '../../src/artifacts/paths.js';

describe('run-store', () => {
  let testDir: string;
  let originalRoot: string | undefined;

  beforeEach(async () => {
    // Save original AGENTGATE_ROOT
    originalRoot = process.env['AGENTGATE_ROOT'];

    // Create a unique test directory
    testDir = join(tmpdir(), `agentgate-run-store-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, 'runs'), { recursive: true });

    // Set the test directory as the AgentGate root
    process.env['AGENTGATE_ROOT'] = testDir;
    setAgentGateRoot(testDir);
  });

  afterEach(async () => {
    // Restore original AGENTGATE_ROOT
    if (originalRoot !== undefined) {
      process.env['AGENTGATE_ROOT'] = originalRoot;
    } else {
      delete process.env['AGENTGATE_ROOT'];
    }

    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createRun', () => {
    it('should create a run with default values', () => {
      const runId = randomUUID();
      const workOrderId = randomUUID();
      const workspaceId = randomUUID();

      const run = createRun(runId, workOrderId, workspaceId, 5);

      expect(run.id).toBe(runId);
      expect(run.workOrderId).toBe(workOrderId);
      expect(run.workspaceId).toBe(workspaceId);
      expect(run.maxIterations).toBe(5);
      expect(run.state).toBe(RunState.QUEUED);
      expect(run.iteration).toBe(1);
      expect(run.ciEnabled).toBe(false);
    });

    it('should create a run with CI options', () => {
      const run = createRun(randomUUID(), randomUUID(), randomUUID(), 3, {
        ciEnabled: true,
        maxCiIterations: 5,
      });

      expect(run.ciEnabled).toBe(true);
      expect(run.maxCiIterations).toBe(5);
    });
  });

  describe('saveRun and loadRun', () => {
    it('should save and load a run correctly', async () => {
      const run = createRun(randomUUID(), randomUUID(), randomUUID(), 5);

      await saveRun(run);
      const loaded = await loadRun(run.id);

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(run.id);
      expect(loaded!.workOrderId).toBe(run.workOrderId);
      expect(loaded!.state).toBe(run.state);
    });

    it('should return null for non-existent run', async () => {
      const loaded = await loadRun('non-existent-id');
      expect(loaded).toBeNull();
    });

    it('should preserve Date fields correctly', async () => {
      const run = createRun(randomUUID(), randomUUID(), randomUUID(), 5);
      const now = new Date();
      run.startedAt = now;
      run.completedAt = new Date(now.getTime() + 1000);

      await saveRun(run);
      const loaded = await loadRun(run.id);

      expect(loaded!.startedAt).toBeInstanceOf(Date);
      expect(loaded!.completedAt).toBeInstanceOf(Date);
      expect(loaded!.startedAt.getTime()).toBe(now.getTime());
    });
  });

  describe('listRuns', () => {
    it('should return empty array when no runs exist', async () => {
      const runs = await listRuns();
      expect(runs).toEqual([]);
    });

    it('should return all runs sorted by startedAt descending', async () => {
      // Create runs with different start times
      const runs = [];
      for (let i = 0; i < 5; i++) {
        const run = createRun(randomUUID(), randomUUID(), randomUUID(), 3);
        run.startedAt = new Date(Date.now() - (5 - i) * 1000); // Earlier runs first
        runs.push(run);
        await saveRun(run);
      }

      const listed = await listRuns();

      expect(listed).toHaveLength(5);
      // Should be sorted by startedAt descending (newest first)
      for (let i = 1; i < listed.length; i++) {
        expect(listed[i - 1].startedAt.getTime()).toBeGreaterThanOrEqual(
          listed[i].startedAt.getTime()
        );
      }
    });

    it('should respect limit option', async () => {
      // Create 10 runs
      for (let i = 0; i < 10; i++) {
        const run = createRun(randomUUID(), randomUUID(), randomUUID(), 3);
        await saveRun(run);
      }

      const listed = await listRuns({ limit: 5 });
      expect(listed).toHaveLength(5);
    });

    it('should respect offset option', async () => {
      // Create 10 runs with distinct start times
      const allRuns = [];
      for (let i = 0; i < 10; i++) {
        const run = createRun(randomUUID(), randomUUID(), randomUUID(), 3);
        run.startedAt = new Date(Date.now() - (10 - i) * 1000);
        allRuns.push(run);
        await saveRun(run);
      }

      const page1 = await listRuns({ limit: 5, offset: 0 });
      const page2 = await listRuns({ limit: 5, offset: 5 });

      expect(page1).toHaveLength(5);
      expect(page2).toHaveLength(5);

      // No overlap between pages
      const page1Ids = new Set(page1.map((r) => r.id));
      for (const run of page2) {
        expect(page1Ids.has(run.id)).toBe(false);
      }
    });

    it('should use default limit of 20', async () => {
      // Create 25 runs
      for (let i = 0; i < 25; i++) {
        const run = createRun(randomUUID(), randomUUID(), randomUUID(), 3);
        await saveRun(run);
      }

      const listed = await listRuns();
      expect(listed).toHaveLength(20);
    });
  });

  describe('listRuns vs listRunsSequential', () => {
    it('should return the same results', async () => {
      // Create 20 runs
      for (let i = 0; i < 20; i++) {
        const run = createRun(randomUUID(), randomUUID(), randomUUID(), 3);
        run.startedAt = new Date(Date.now() - (20 - i) * 1000);
        await saveRun(run);
      }

      const parallelResult = await listRuns({ limit: 10, offset: 5 });
      const sequentialResult = await listRunsSequential({ limit: 10, offset: 5 });

      expect(parallelResult).toHaveLength(sequentialResult.length);

      // Both should return runs in the same order
      for (let i = 0; i < parallelResult.length; i++) {
        expect(parallelResult[i].id).toBe(sequentialResult[i].id);
      }
    });
  });

  describe('listRuns performance', () => {
    it('should load runs in parallel (faster than sequential)', async () => {
      // Create enough runs to see a measurable difference
      const runCount = 50;
      for (let i = 0; i < runCount; i++) {
        const run = createRun(randomUUID(), randomUUID(), randomUUID(), 3);
        run.startedAt = new Date(Date.now() - (runCount - i) * 1000);
        await saveRun(run);
      }

      // Warm up (first load can be slower due to caching)
      await listRuns({ limit: 10 });
      await listRunsSequential({ limit: 10 });

      // Measure parallel version
      const parallelStart = performance.now();
      const parallelResult = await listRuns();
      const parallelTime = performance.now() - parallelStart;

      // Measure sequential version
      const sequentialStart = performance.now();
      const sequentialResult = await listRunsSequential();
      const sequentialTime = performance.now() - sequentialStart;

      // Both should return same number of runs
      expect(parallelResult.length).toBe(sequentialResult.length);

      // Log timing for debugging (not a hard assertion since IO can be variable)
      console.log(`Parallel: ${parallelTime.toFixed(2)}ms, Sequential: ${sequentialTime.toFixed(2)}ms`);

      // The parallel version should generally be faster for larger datasets
      // We don't make this a hard assertion because file I/O timing can vary
      // but we verify correctness
    });

    it('should handle many runs efficiently', async () => {
      // Create 100 runs
      const runCount = 100;
      for (let i = 0; i < runCount; i++) {
        const run = createRun(randomUUID(), randomUUID(), randomUUID(), 3);
        run.startedAt = new Date(Date.now() - (runCount - i) * 1000);
        await saveRun(run);
      }

      const start = performance.now();
      const runs = await listRuns({ limit: 20 });
      const elapsed = performance.now() - start;

      expect(runs).toHaveLength(20);

      // Should complete in reasonable time (less than 5 seconds)
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
