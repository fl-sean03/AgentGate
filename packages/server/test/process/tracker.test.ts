/**
 * Tests for Process Tracker.
 * (v0.2.27 - Thrust 8: Process Tracking Persistence)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { ProcessTracker, getProcessTracker } from '../../src/process/tracker.js';

describe('ProcessTracker', () => {
  let testDir: string;
  let registryPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `process-tracker-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    registryPath = join(testDir, 'process-registry.json');
    ProcessTracker.resetInstance();
  });

  afterEach(async () => {
    ProcessTracker.resetInstance();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ProcessTracker.getInstance();
      const instance2 = ProcessTracker.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('track', () => {
    it('should track a process', () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(12345, 'agent', 'node', {
        args: ['index.js'],
        workOrderId: 'wo-1',
      });

      const entry = tracker.get(12345);
      expect(entry).toBeDefined();
      expect(entry?.pid).toBe(12345);
      expect(entry?.type).toBe('agent');
      expect(entry?.command).toBe('node');
      expect(entry?.status).toBe('running');
    });

    it('should track with all options', () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(12345, 'sandbox', 'docker', {
        args: ['run', 'ubuntu'],
        cwd: '/tmp',
        workOrderId: 'wo-1',
        runId: 'run-1',
        sandboxId: 'sandbox-1',
        parentPid: 1000,
      });

      const entry = tracker.get(12345);
      expect(entry?.workOrderId).toBe('wo-1');
      expect(entry?.runId).toBe('run-1');
      expect(entry?.sandboxId).toBe('sandbox-1');
      expect(entry?.parentPid).toBe(1000);
    });
  });

  describe('status methods', () => {
    it('should mark process as exited', () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(12345, 'agent', 'node');
      tracker.markExited(12345, 0);

      const entry = tracker.get(12345);
      expect(entry?.status).toBe('exited');
      expect(entry?.exitCode).toBe(0);
    });

    it('should mark process as killed', () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(12345, 'agent', 'node');
      tracker.markKilled(12345, 'SIGTERM');

      const entry = tracker.get(12345);
      expect(entry?.status).toBe('killed');
      expect(entry?.exitSignal).toBe('SIGTERM');
    });

    it('should mark process as crashed', () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(12345, 'agent', 'node');
      tracker.markCrashed(12345, 1);

      expect(tracker.get(12345)?.status).toBe('crashed');
    });

    it('should mark process as orphaned', () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(12345, 'agent', 'node');
      tracker.markOrphaned(12345);

      expect(tracker.get(12345)?.status).toBe('orphaned');
    });
  });

  describe('heartbeat', () => {
    it('should update heartbeat', async () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(12345, 'agent', 'node');
      const before = tracker.get(12345)?.lastHeartbeat;

      await new Promise(r => setTimeout(r, 10));
      tracker.heartbeat(12345);

      const after = tracker.get(12345)?.lastHeartbeat;
      expect(after).not.toBe(before);
    });

    it('should not heartbeat non-running process', () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(12345, 'agent', 'node');
      tracker.markExited(12345, 0);

      const result = tracker.heartbeat(12345);
      expect(result).toBe(false);
    });
  });

  describe('getters', () => {
    it('should get all processes', () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(1, 'agent', 'node');
      tracker.track(2, 'sandbox', 'docker');

      expect(tracker.getAll()).toHaveLength(2);
    });

    it('should get running processes', () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(1, 'agent', 'node');
      tracker.track(2, 'agent', 'node');
      tracker.markExited(2, 0);

      expect(tracker.getRunning()).toHaveLength(1);
    });

    it('should get by type', () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(1, 'agent', 'node');
      tracker.track(2, 'sandbox', 'docker');
      tracker.track(3, 'agent', 'python');

      expect(tracker.getByType('agent')).toHaveLength(2);
    });

    it('should get by work order', () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(1, 'agent', 'node', { workOrderId: 'wo-1' });
      tracker.track(2, 'agent', 'node', { workOrderId: 'wo-2' });
      tracker.track(3, 'sandbox', 'docker', { workOrderId: 'wo-1' });

      expect(tracker.getByWorkOrder('wo-1')).toHaveLength(2);
    });
  });

  describe('orphans', () => {
    it('should detect orphaned processes', async () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
        orphanThresholdMs: 50,
      });

      tracker.track(12345, 'agent', 'node');

      await new Promise(r => setTimeout(r, 100));

      const orphans = tracker.getOrphans();
      expect(orphans).toHaveLength(1);
    });

    it('should not include non-running as orphans', async () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
        orphanThresholdMs: 50,
      });

      tracker.track(12345, 'agent', 'node');
      tracker.markExited(12345, 0);

      await new Promise(r => setTimeout(r, 100));

      expect(tracker.getOrphans()).toHaveLength(0);
    });
  });

  describe('stats', () => {
    it('should return correct stats', () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(1, 'agent', 'node');
      tracker.track(2, 'agent', 'node');
      tracker.track(3, 'agent', 'node');
      tracker.markExited(2, 0);
      tracker.markCrashed(3, 1);

      const stats = tracker.getStats();
      expect(stats.running).toBe(1);
      expect(stats.exited).toBe(1);
      expect(stats.crashed).toBe(1);
      expect(stats.total).toBe(3);
    });
  });

  describe('persistence', () => {
    it('should save and load', async () => {
      const tracker1 = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker1.track(12345, 'agent', 'node', { workOrderId: 'wo-1' });
      await tracker1.save();

      ProcessTracker.resetInstance();

      const tracker2 = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });
      await tracker2.load();

      const entry = tracker2.get(12345);
      expect(entry).toBeDefined();
      expect(entry?.workOrderId).toBe('wo-1');
    });
  });

  describe('prune', () => {
    it('should prune old terminated processes', () => {
      const tracker = ProcessTracker.getInstance({
        registryPath,
        heartbeatIntervalMs: 0,
        autoSaveIntervalMs: 0,
      });

      tracker.track(12345, 'agent', 'node');
      tracker.markExited(12345, 0);

      // Manually set old start time
      const entry = tracker.get(12345);
      if (entry) {
        entry.startedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      }

      const pruned = tracker.prune(24 * 60 * 60 * 1000);
      expect(pruned).toBe(1);
      expect(tracker.get(12345)).toBeUndefined();
    });
  });
});

describe('getProcessTracker', () => {
  beforeEach(() => {
    ProcessTracker.resetInstance();
  });

  it('should return singleton', () => {
    const tracker1 = getProcessTracker();
    const tracker2 = getProcessTracker();
    expect(tracker1).toBe(tracker2);
  });
});
