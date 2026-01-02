/**
 * Orphan Cleanup Unit Tests
 * (v0.2.23 - Wave 1.6: Run Store Orphan Cleanup)
 *
 * Tests for cleaning up orphaned runs whose work orders no longer exist.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  setAgentGateRoot,
  getRunsDir,
  getWorkOrdersDir,
  getRunDir,
} from '../src/artifacts/paths.js';
import {
  saveRun,
  loadRun,
  createRun,
  cleanupOrphanedRuns,
  type OrphanCleanupOptions,
} from '../src/orchestrator/run-store.js';
import { WorkOrderStore } from '../src/control-plane/work-order-store.js';
import { WorkOrderStatus, type WorkOrder } from '../src/types/index.js';

describe('Orphan Cleanup', () => {
  let testRoot: string;
  let workOrderStore: WorkOrderStore;

  beforeEach(async () => {
    // Use a temp directory for tests
    testRoot = join(tmpdir(), `agentgate-orphan-test-${Date.now()}`);
    setAgentGateRoot(testRoot);

    // Create required directories
    await mkdir(getRunsDir(), { recursive: true });
    await mkdir(getWorkOrdersDir(), { recursive: true });

    workOrderStore = new WorkOrderStore();
  });

  afterEach(async () => {
    // Cleanup test files
    try {
      await rm(testRoot, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper to create a test work order
   */
  function createTestWorkOrder(id: string): WorkOrder {
    return {
      id,
      taskPrompt: 'Test task',
      workspaceSource: { type: 'local', path: '/tmp/test' },
      agentType: 'claude-code',
      maxIterations: 5,
      maxWallClockSeconds: 3600,
      gatePlanSource: 'default',
      policies: {},
      createdAt: new Date(),
      status: WorkOrderStatus.COMPLETED,
    };
  }

  describe('WorkOrderStore.getAllIds', () => {
    it('should return empty set when no work orders exist', async () => {
      const ids = await workOrderStore.getAllIds();

      expect(ids).toBeInstanceOf(Set);
      expect(ids.size).toBe(0);
    });

    it('should return all work order IDs', async () => {
      // Create work orders
      await workOrderStore.save(createTestWorkOrder('wo-001'));
      await workOrderStore.save(createTestWorkOrder('wo-002'));
      await workOrderStore.save(createTestWorkOrder('wo-003'));

      const ids = await workOrderStore.getAllIds();

      expect(ids.size).toBe(3);
      expect(ids.has('wo-001')).toBe(true);
      expect(ids.has('wo-002')).toBe(true);
      expect(ids.has('wo-003')).toBe(true);
    });

    it('should handle directory not existing', async () => {
      // Remove the work orders directory
      await rm(getWorkOrdersDir(), { recursive: true });

      const ids = await workOrderStore.getAllIds();

      expect(ids).toBeInstanceOf(Set);
      expect(ids.size).toBe(0);
    });

    it('should ignore non-JSON files', async () => {
      await workOrderStore.save(createTestWorkOrder('wo-001'));

      // Create a non-JSON file
      await writeFile(join(getWorkOrdersDir(), 'notes.txt'), 'some notes');
      await writeFile(join(getWorkOrdersDir(), '.gitkeep'), '');

      const ids = await workOrderStore.getAllIds();

      expect(ids.size).toBe(1);
      expect(ids.has('wo-001')).toBe(true);
    });
  });

  describe('cleanupOrphanedRuns', () => {
    it('should return empty result when no runs exist', async () => {
      const validIds = new Set(['wo-001', 'wo-002']);
      const result = await cleanupOrphanedRuns(validIds);

      expect(result.orphanedCount).toBe(0);
      expect(result.deletedCount).toBe(0);
      expect(result.deletedRunIds).toEqual([]);
      expect(result.failedRunIds).toEqual([]);
      expect(result.freedBytes).toBe(0);
    });

    it('should return empty result when runs directory does not exist', async () => {
      await rm(getRunsDir(), { recursive: true });

      const validIds = new Set(['wo-001']);
      const result = await cleanupOrphanedRuns(validIds);

      expect(result.orphanedCount).toBe(0);
      expect(result.deletedCount).toBe(0);
    });

    it('should not delete runs with valid work orders', async () => {
      // Create a run with a valid work order
      const run = createRun('run-001', 'wo-001', 'ws-001', 5);
      await saveRun(run);

      // Add some files to the run directory
      await writeFile(join(getRunDir('run-001'), 'iteration-1.json'), '{}');

      const validIds = new Set(['wo-001']);
      const result = await cleanupOrphanedRuns(validIds);

      expect(result.orphanedCount).toBe(0);
      expect(result.deletedCount).toBe(0);

      // Verify run still exists
      const loadedRun = await loadRun('run-001');
      expect(loadedRun).not.toBeNull();
    });

    it('should delete orphaned runs', async () => {
      // Create runs - some with valid work orders, some orphaned
      const validRun = createRun('run-valid', 'wo-001', 'ws-001', 5);
      const orphanedRun = createRun('run-orphan', 'wo-deleted', 'ws-002', 5);
      await saveRun(validRun);
      await saveRun(orphanedRun);

      // Only wo-001 exists
      const validIds = new Set(['wo-001']);
      const result = await cleanupOrphanedRuns(validIds);

      expect(result.orphanedCount).toBe(1);
      expect(result.deletedCount).toBe(1);
      expect(result.deletedRunIds).toContain('run-orphan');
      expect(result.failedRunIds).toEqual([]);

      // Verify orphaned run was deleted
      const orphanCheck = await loadRun('run-orphan');
      expect(orphanCheck).toBeNull();

      // Verify valid run still exists
      const validCheck = await loadRun('run-valid');
      expect(validCheck).not.toBeNull();
    });

    it('should delete multiple orphaned runs', async () => {
      // Create multiple orphaned runs
      await saveRun(createRun('run-orphan-1', 'wo-deleted-1', 'ws-001', 5));
      await saveRun(createRun('run-orphan-2', 'wo-deleted-2', 'ws-002', 5));
      await saveRun(createRun('run-orphan-3', 'wo-deleted-3', 'ws-003', 5));
      await saveRun(createRun('run-valid', 'wo-001', 'ws-004', 5));

      const validIds = new Set(['wo-001']);
      const result = await cleanupOrphanedRuns(validIds);

      expect(result.orphanedCount).toBe(3);
      expect(result.deletedCount).toBe(3);
      expect(result.deletedRunIds).toHaveLength(3);
      expect(result.failedRunIds).toEqual([]);
    });

    it('should support dry run mode', async () => {
      // Create an orphaned run
      const orphanedRun = createRun('run-orphan', 'wo-deleted', 'ws-001', 5);
      await saveRun(orphanedRun);

      const validIds = new Set<string>();
      const options: OrphanCleanupOptions = { dryRun: true };
      const result = await cleanupOrphanedRuns(validIds, options);

      expect(result.orphanedCount).toBe(1);
      expect(result.deletedCount).toBe(0);
      expect(result.deletedRunIds).toEqual([]);

      // Verify run was NOT deleted
      const loadedRun = await loadRun('run-orphan');
      expect(loadedRun).not.toBeNull();
    });

    it('should respect maxOrphans limit', async () => {
      // Create multiple orphaned runs
      await saveRun(createRun('run-a', 'wo-deleted-1', 'ws-001', 5));
      await saveRun(createRun('run-b', 'wo-deleted-2', 'ws-002', 5));
      await saveRun(createRun('run-c', 'wo-deleted-3', 'ws-003', 5));
      await saveRun(createRun('run-d', 'wo-deleted-4', 'ws-004', 5));

      const validIds = new Set<string>();
      const options: OrphanCleanupOptions = { maxOrphans: 2 };
      const result = await cleanupOrphanedRuns(validIds, options);

      expect(result.orphanedCount).toBe(2);
      expect(result.deletedCount).toBe(2);
      expect(result.deletedRunIds).toHaveLength(2);
    });

    it('should track freed bytes', async () => {
      // Create a run with some content
      const orphanedRun = createRun('run-orphan', 'wo-deleted', 'ws-001', 5);
      await saveRun(orphanedRun);

      // Add extra content to increase size
      const extraContent = 'x'.repeat(1000);
      await writeFile(join(getRunDir('run-orphan'), 'extra.json'), extraContent);

      const validIds = new Set<string>();
      const result = await cleanupOrphanedRuns(validIds);

      expect(result.deletedCount).toBe(1);
      expect(result.freedBytes).toBeGreaterThan(0);
    });

    it('should skip runs that cannot be loaded', async () => {
      // Create a valid orphaned run
      await saveRun(createRun('run-valid-orphan', 'wo-deleted', 'ws-001', 5));

      // Create a corrupted run directory (no run.json or invalid JSON)
      const corruptedDir = getRunDir('run-corrupted');
      await mkdir(corruptedDir, { recursive: true });
      await writeFile(join(corruptedDir, 'run.json'), 'invalid json{{{');

      const validIds = new Set<string>();
      const result = await cleanupOrphanedRuns(validIds);

      // Should only find the valid orphan
      expect(result.orphanedCount).toBe(1);
      expect(result.deletedCount).toBe(1);
      expect(result.deletedRunIds).toContain('run-valid-orphan');
    });

    it('should handle empty valid IDs set (delete all runs)', async () => {
      await saveRun(createRun('run-1', 'wo-1', 'ws-001', 5));
      await saveRun(createRun('run-2', 'wo-2', 'ws-002', 5));

      const validIds = new Set<string>(); // Empty - no valid work orders
      const result = await cleanupOrphanedRuns(validIds);

      expect(result.orphanedCount).toBe(2);
      expect(result.deletedCount).toBe(2);
    });
  });

  describe('Integration: Full cleanup workflow', () => {
    it('should clean orphaned runs using work order store', async () => {
      // Setup: Create work orders
      await workOrderStore.save(createTestWorkOrder('wo-active-1'));
      await workOrderStore.save(createTestWorkOrder('wo-active-2'));

      // Setup: Create runs - mix of valid and orphaned
      await saveRun(createRun('run-valid-1', 'wo-active-1', 'ws-001', 5));
      await saveRun(createRun('run-valid-2', 'wo-active-2', 'ws-002', 5));
      await saveRun(createRun('run-orphan-1', 'wo-deleted-1', 'ws-003', 5));
      await saveRun(createRun('run-orphan-2', 'wo-deleted-2', 'ws-004', 5));

      // Get valid work order IDs
      const validIds = await workOrderStore.getAllIds();
      expect(validIds.size).toBe(2);

      // Run cleanup
      const result = await cleanupOrphanedRuns(validIds);

      expect(result.orphanedCount).toBe(2);
      expect(result.deletedCount).toBe(2);
      expect(result.deletedRunIds.sort()).toEqual(['run-orphan-1', 'run-orphan-2'].sort());

      // Verify correct runs exist/don't exist
      expect(await loadRun('run-valid-1')).not.toBeNull();
      expect(await loadRun('run-valid-2')).not.toBeNull();
      expect(await loadRun('run-orphan-1')).toBeNull();
      expect(await loadRun('run-orphan-2')).toBeNull();
    });

    it('should handle concurrent runs on same work order', async () => {
      // Setup: One work order with multiple runs (can happen with retries)
      await workOrderStore.save(createTestWorkOrder('wo-001'));

      await saveRun(createRun('run-attempt-1', 'wo-001', 'ws-001', 5));
      await saveRun(createRun('run-attempt-2', 'wo-001', 'ws-002', 5));
      await saveRun(createRun('run-attempt-3', 'wo-001', 'ws-003', 5));

      const validIds = await workOrderStore.getAllIds();
      const result = await cleanupOrphanedRuns(validIds);

      expect(result.orphanedCount).toBe(0);
      expect(result.deletedCount).toBe(0);

      // All runs should still exist
      const entries = await readdir(getRunsDir());
      expect(entries).toHaveLength(3);
    });
  });
});
