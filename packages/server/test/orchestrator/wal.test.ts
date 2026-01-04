/**
 * Tests for Write-Ahead Log (WAL) functionality.
 * (v0.2.27 - Thrust 1: Write-Ahead State Persistence)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { RunState, RunEvent } from '../../src/types/index.js';
import {
  WALStatus,
  type WALConfig,
  type WALEntry,
  createWALEntry,
  appendWALEntry,
  markWALComplete,
  markWALRolledBack,
  readWALEntries,
  getPendingWALEntries,
  getAllPendingWALEntries,
  recoverFromWAL,
  cleanupOldWALFiles,
  compactWALFile,
  writeAheadTransition,
  getWALFilePath,
  ensureWALDirectory,
} from '../../src/orchestrator/wal.js';

describe('WAL', () => {
  let testDir: string;
  let testConfig: WALConfig;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agentgate-wal-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });

    testConfig = {
      enabled: true,
      directory: testDir,
      retentionDays: 7,
      maxEntriesPerRun: 1000,
    };
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createWALEntry', () => {
    it('should create a valid WAL entry', () => {
      const runId = randomUUID();
      const entry = createWALEntry(
        runId,
        RunState.QUEUED,
        RunState.LEASED,
        RunEvent.WORKSPACE_ACQUIRED
      );

      expect(entry.id).toBeDefined();
      expect(entry.runId).toBe(runId);
      expect(entry.previousState).toBe(RunState.QUEUED);
      expect(entry.targetState).toBe(RunState.LEASED);
      expect(entry.event).toBe(RunEvent.WORKSPACE_ACQUIRED);
      expect(entry.status).toBe(WALStatus.PENDING);
      expect(entry.timestamp).toBeDefined();
    });

    it('should include metadata when provided', () => {
      const entry = createWALEntry(
        randomUUID(),
        RunState.BUILDING,
        RunState.SNAPSHOTTING,
        RunEvent.BUILD_COMPLETED,
        { iteration: 1, sessionId: 'test-session' }
      );

      expect(entry.metadata).toEqual({ iteration: 1, sessionId: 'test-session' });
    });
  });

  describe('appendWALEntry', () => {
    it('should append entry to WAL file', async () => {
      const runId = randomUUID();
      const entry = createWALEntry(
        runId,
        RunState.QUEUED,
        RunState.LEASED,
        RunEvent.WORKSPACE_ACQUIRED
      );

      await appendWALEntry(entry, testConfig);

      const walFile = getWALFilePath(runId, testConfig);
      const content = await readFile(walFile, 'utf-8');
      const parsed = JSON.parse(content.trim());

      expect(parsed.id).toBe(entry.id);
      expect(parsed.status).toBe(WALStatus.PENDING);
    });

    it('should append multiple entries to same file', async () => {
      const runId = randomUUID();

      const entry1 = createWALEntry(
        runId,
        RunState.QUEUED,
        RunState.LEASED,
        RunEvent.WORKSPACE_ACQUIRED
      );
      await appendWALEntry(entry1, testConfig);

      const entry2 = createWALEntry(
        runId,
        RunState.LEASED,
        RunState.BUILDING,
        RunEvent.BUILD_STARTED
      );
      await appendWALEntry(entry2, testConfig);

      const entries = await readWALEntries(runId, testConfig);
      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe(entry1.id);
      expect(entries[1].id).toBe(entry2.id);
    });

    it('should skip when WAL is disabled', async () => {
      const disabledConfig = { ...testConfig, enabled: false };
      const runId = randomUUID();
      const entry = createWALEntry(
        runId,
        RunState.QUEUED,
        RunState.LEASED,
        RunEvent.WORKSPACE_ACQUIRED
      );

      await appendWALEntry(entry, disabledConfig);

      const files = await readdir(testDir);
      expect(files).toHaveLength(0);
    });
  });

  describe('markWALComplete', () => {
    it('should update entry status to APPLIED', async () => {
      const runId = randomUUID();
      const entry = createWALEntry(
        runId,
        RunState.QUEUED,
        RunState.LEASED,
        RunEvent.WORKSPACE_ACQUIRED
      );
      await appendWALEntry(entry, testConfig);

      await markWALComplete(runId, entry.id, testConfig);

      const entries = await readWALEntries(runId, testConfig);
      expect(entries[0].status).toBe(WALStatus.APPLIED);
    });
  });

  describe('markWALRolledBack', () => {
    it('should update entry status to ROLLED_BACK', async () => {
      const runId = randomUUID();
      const entry = createWALEntry(
        runId,
        RunState.QUEUED,
        RunState.LEASED,
        RunEvent.WORKSPACE_ACQUIRED
      );
      await appendWALEntry(entry, testConfig);

      await markWALRolledBack(runId, entry.id, testConfig);

      const entries = await readWALEntries(runId, testConfig);
      expect(entries[0].status).toBe(WALStatus.ROLLED_BACK);
    });
  });

  describe('readWALEntries', () => {
    it('should return empty array for non-existent file', async () => {
      const entries = await readWALEntries('non-existent', testConfig);
      expect(entries).toEqual([]);
    });

    it('should read all entries from file', async () => {
      const runId = randomUUID();

      for (let i = 0; i < 3; i++) {
        const entry = createWALEntry(
          runId,
          RunState.BUILDING,
          RunState.SNAPSHOTTING,
          RunEvent.BUILD_COMPLETED
        );
        await appendWALEntry(entry, testConfig);
      }

      const entries = await readWALEntries(runId, testConfig);
      expect(entries).toHaveLength(3);
    });
  });

  describe('getPendingWALEntries', () => {
    it('should return only pending entries', async () => {
      const runId = randomUUID();

      // Create 3 entries
      const entry1 = createWALEntry(runId, RunState.QUEUED, RunState.LEASED, RunEvent.WORKSPACE_ACQUIRED);
      const entry2 = createWALEntry(runId, RunState.LEASED, RunState.BUILDING, RunEvent.BUILD_STARTED);
      const entry3 = createWALEntry(runId, RunState.BUILDING, RunState.SNAPSHOTTING, RunEvent.BUILD_COMPLETED);

      await appendWALEntry(entry1, testConfig);
      await appendWALEntry(entry2, testConfig);
      await appendWALEntry(entry3, testConfig);

      // Mark first two as complete
      await markWALComplete(runId, entry1.id, testConfig);
      await markWALComplete(runId, entry2.id, testConfig);

      const pending = await getPendingWALEntries(runId, testConfig);
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(entry3.id);
    });
  });

  describe('getAllPendingWALEntries', () => {
    it('should return pending entries from all runs', async () => {
      const runId1 = randomUUID();
      const runId2 = randomUUID();

      const entry1 = createWALEntry(runId1, RunState.QUEUED, RunState.LEASED, RunEvent.WORKSPACE_ACQUIRED);
      const entry2 = createWALEntry(runId2, RunState.BUILDING, RunState.SNAPSHOTTING, RunEvent.BUILD_COMPLETED);

      await appendWALEntry(entry1, testConfig);
      await appendWALEntry(entry2, testConfig);

      const allPending = await getAllPendingWALEntries(testConfig);
      expect(allPending).toHaveLength(2);
    });

    it('should sort entries by timestamp', async () => {
      const runId = randomUUID();

      const entry1 = createWALEntry(runId, RunState.QUEUED, RunState.LEASED, RunEvent.WORKSPACE_ACQUIRED);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      const entry2 = createWALEntry(runId, RunState.LEASED, RunState.BUILDING, RunEvent.BUILD_STARTED);

      await appendWALEntry(entry1, testConfig);
      await appendWALEntry(entry2, testConfig);

      const allPending = await getAllPendingWALEntries(testConfig);
      expect(allPending[0].id).toBe(entry1.id);
      expect(allPending[1].id).toBe(entry2.id);
    });
  });

  describe('recoverFromWAL', () => {
    it('should call recover function for each pending entry', async () => {
      const runId = randomUUID();
      const entry = createWALEntry(
        runId,
        RunState.QUEUED,
        RunState.LEASED,
        RunEvent.WORKSPACE_ACQUIRED
      );
      await appendWALEntry(entry, testConfig);

      const recoveredEntries: WALEntry[] = [];
      const result = await recoverFromWAL(async (e) => {
        recoveredEntries.push(e);
        return true;
      }, testConfig);

      expect(result.pendingCount).toBe(1);
      expect(result.recoveredCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(recoveredEntries).toHaveLength(1);
      expect(recoveredEntries[0].id).toBe(entry.id);
    });

    it('should mark failed recoveries as rolled back', async () => {
      const runId = randomUUID();
      const entry = createWALEntry(
        runId,
        RunState.QUEUED,
        RunState.LEASED,
        RunEvent.WORKSPACE_ACQUIRED
      );
      await appendWALEntry(entry, testConfig);

      const result = await recoverFromWAL(async () => false, testConfig);

      expect(result.pendingCount).toBe(1);
      expect(result.recoveredCount).toBe(0);
      expect(result.failedCount).toBe(1);

      const entries = await readWALEntries(runId, testConfig);
      expect(entries[0].status).toBe(WALStatus.ROLLED_BACK);
    });

    it('should handle errors during recovery', async () => {
      const runId = randomUUID();
      const entry = createWALEntry(
        runId,
        RunState.QUEUED,
        RunState.LEASED,
        RunEvent.WORKSPACE_ACQUIRED
      );
      await appendWALEntry(entry, testConfig);

      const result = await recoverFromWAL(async () => {
        throw new Error('Recovery failed');
      }, testConfig);

      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Recovery failed');
    });

    it('should return empty result when WAL is disabled', async () => {
      const disabledConfig = { ...testConfig, enabled: false };
      const result = await recoverFromWAL(async () => true, disabledConfig);

      expect(result.pendingCount).toBe(0);
      expect(result.recoveredCount).toBe(0);
    });
  });

  describe('cleanupOldWALFiles', () => {
    it('should delete old completed WAL files', async () => {
      const runId = randomUUID();
      const entry = createWALEntry(
        runId,
        RunState.QUEUED,
        RunState.LEASED,
        RunEvent.WORKSPACE_ACQUIRED
      );

      // Create entry with old timestamp
      const oldEntry = {
        ...entry,
        timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        status: WALStatus.APPLIED,
      };

      await appendWALEntry(oldEntry, testConfig);

      const configWithShortRetention = { ...testConfig, retentionDays: 1 };
      const deleted = await cleanupOldWALFiles(configWithShortRetention);

      expect(deleted).toBe(1);
    });

    it('should not delete files with pending entries', async () => {
      const runId = randomUUID();
      const entry = createWALEntry(
        runId,
        RunState.QUEUED,
        RunState.LEASED,
        RunEvent.WORKSPACE_ACQUIRED
      );

      // Create entry with old timestamp but still pending
      const oldPendingEntry = {
        ...entry,
        timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        status: WALStatus.PENDING,
      };

      await appendWALEntry(oldPendingEntry, testConfig);

      const configWithShortRetention = { ...testConfig, retentionDays: 1 };
      const deleted = await cleanupOldWALFiles(configWithShortRetention);

      expect(deleted).toBe(0);
    });
  });

  describe('compactWALFile', () => {
    it('should remove rolled back entries', async () => {
      const runId = randomUUID();
      const configWithLowMax = { ...testConfig, maxEntriesPerRun: 1 };

      // Create entries
      const entry1 = createWALEntry(runId, RunState.QUEUED, RunState.LEASED, RunEvent.WORKSPACE_ACQUIRED);
      const entry2 = createWALEntry(runId, RunState.LEASED, RunState.BUILDING, RunEvent.BUILD_STARTED);

      await appendWALEntry(entry1, configWithLowMax);
      await appendWALEntry(entry2, configWithLowMax);

      // Mark one as rolled back
      await markWALRolledBack(runId, entry1.id, configWithLowMax);

      const removed = await compactWALFile(runId, configWithLowMax);

      expect(removed).toBe(1);

      const entries = await readWALEntries(runId, configWithLowMax);
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(entry2.id);
    });
  });

  describe('writeAheadTransition', () => {
    it('should create and append WAL entry', async () => {
      const run = {
        id: randomUUID(),
        state: RunState.QUEUED,
      } as any;

      const entryId = await writeAheadTransition(
        run,
        RunEvent.WORKSPACE_ACQUIRED,
        RunState.LEASED,
        { test: 'metadata' },
        testConfig
      );

      expect(entryId).toBeDefined();

      const entries = await readWALEntries(run.id, testConfig);
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(entryId);
      expect(entries[0].metadata).toEqual({ test: 'metadata' });
    });
  });

  describe('ensureWALDirectory', () => {
    it('should create directory if it does not exist', async () => {
      const newDir = join(testDir, 'new-wal-dir');
      const config = { ...testConfig, directory: newDir };

      await ensureWALDirectory(config);

      const files = await readdir(newDir);
      expect(files).toBeDefined();
    });
  });
});
