/**
 * Tests for Sandbox Registry.
 * (v0.2.27 - Thrust 4: Guaranteed Sandbox Cleanup)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  SandboxRegistry,
  getSandboxRegistry,
  type SandboxRegistryEntry,
} from '../../src/sandbox/registry.js';

describe('SandboxRegistry', () => {
  let testDir: string;
  let registryPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `sandbox-registry-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    registryPath = join(testDir, 'sandbox-registry.json');

    // Reset singleton
    SandboxRegistry.resetInstance();
  });

  afterEach(async () => {
    SandboxRegistry.resetInstance();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = SandboxRegistry.getInstance();
      const instance2 = SandboxRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should accept configuration', () => {
      const instance = SandboxRegistry.getInstance({
        registryPath,
        orphanThresholdMs: 1000,
      });

      expect(instance).toBeDefined();
    });
  });

  describe('register', () => {
    it('should register a sandbox', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });

      registry.register('sandbox-1', 'docker', 'container-abc');

      const entry = registry.get('sandbox-1');
      expect(entry).toBeDefined();
      expect(entry?.sandboxId).toBe('sandbox-1');
      expect(entry?.type).toBe('docker');
      expect(entry?.resourceId).toBe('container-abc');
      expect(entry?.status).toBe('active');
    });

    it('should register with optional fields', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });

      registry.register('sandbox-2', 'subprocess', '12345', {
        runId: 'run-1',
        workOrderId: 'wo-1',
        workspacePath: '/tmp/workspace',
      });

      const entry = registry.get('sandbox-2');
      expect(entry?.runId).toBe('run-1');
      expect(entry?.workOrderId).toBe('wo-1');
      expect(entry?.workspacePath).toBe('/tmp/workspace');
    });
  });

  describe('heartbeat', () => {
    it('should update heartbeat for active sandbox', async () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      registry.register('sandbox-1', 'docker', 'container-abc');

      const entryBefore = registry.get('sandbox-1');
      const heartbeatBefore = entryBefore?.lastHeartbeat;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = registry.heartbeat('sandbox-1');

      expect(result).toBe(true);

      const entryAfter = registry.get('sandbox-1');
      expect(entryAfter?.lastHeartbeat).not.toBe(heartbeatBefore);
    });

    it('should return false for non-existent sandbox', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });

      const result = registry.heartbeat('non-existent');

      expect(result).toBe(false);
    });

    it('should return false for terminated sandbox', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      registry.register('sandbox-1', 'docker', 'container-abc');
      registry.markTerminated('sandbox-1');

      const result = registry.heartbeat('sandbox-1');

      expect(result).toBe(false);
    });
  });

  describe('markTerminated', () => {
    it('should mark sandbox as terminated', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      registry.register('sandbox-1', 'docker', 'container-abc');

      const result = registry.markTerminated('sandbox-1');

      expect(result).toBe(true);
      expect(registry.get('sandbox-1')?.status).toBe('terminated');
    });

    it('should return false for non-existent sandbox', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });

      const result = registry.markTerminated('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('markOrphaned', () => {
    it('should mark sandbox as orphaned', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      registry.register('sandbox-1', 'docker', 'container-abc');

      const result = registry.markOrphaned('sandbox-1');

      expect(result).toBe(true);
      expect(registry.get('sandbox-1')?.status).toBe('orphaned');
    });
  });

  describe('recordCleanupFailure', () => {
    it('should record cleanup failure', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      registry.register('sandbox-1', 'docker', 'container-abc');

      registry.recordCleanupFailure('sandbox-1', 'Cleanup failed');

      const entry = registry.get('sandbox-1');
      expect(entry?.status).toBe('cleanup_failed');
      expect(entry?.cleanupAttempts).toBe(1);
      expect(entry?.lastCleanupError).toBe('Cleanup failed');
    });

    it('should increment cleanup attempts', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      registry.register('sandbox-1', 'docker', 'container-abc');

      registry.recordCleanupFailure('sandbox-1', 'Error 1');
      registry.recordCleanupFailure('sandbox-1', 'Error 2');

      expect(registry.get('sandbox-1')?.cleanupAttempts).toBe(2);
      expect(registry.get('sandbox-1')?.lastCleanupError).toBe('Error 2');
    });
  });

  describe('remove', () => {
    it('should remove entry from registry', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      registry.register('sandbox-1', 'docker', 'container-abc');

      const result = registry.remove('sandbox-1');

      expect(result).toBe(true);
      expect(registry.get('sandbox-1')).toBeUndefined();
    });

    it('should return false for non-existent sandbox', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });

      const result = registry.remove('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return all entries', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      registry.register('sandbox-1', 'docker', 'container-1');
      registry.register('sandbox-2', 'subprocess', '12345');

      const entries = registry.getAll();

      expect(entries).toHaveLength(2);
    });
  });

  describe('getActive', () => {
    it('should return only active entries', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      registry.register('sandbox-1', 'docker', 'container-1');
      registry.register('sandbox-2', 'subprocess', '12345');
      registry.markTerminated('sandbox-2');

      const active = registry.getActive();

      expect(active).toHaveLength(1);
      expect(active[0]?.sandboxId).toBe('sandbox-1');
    });
  });

  describe('getOrphans', () => {
    it('should return sandboxes with stale heartbeats', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
        orphanThresholdMs: 50, // Very short threshold for testing
      });

      registry.register('sandbox-1', 'docker', 'container-1');

      // Wait for threshold to pass
      await new Promise(resolve => setTimeout(resolve, 100));

      const orphans = registry.getOrphans();

      expect(orphans).toHaveLength(1);
      expect(orphans[0]?.sandboxId).toBe('sandbox-1');
    });

    it('should not return non-active sandboxes', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
        orphanThresholdMs: 50,
      });

      registry.register('sandbox-1', 'docker', 'container-1');
      registry.markTerminated('sandbox-1');

      await new Promise(resolve => setTimeout(resolve, 100));

      const orphans = registry.getOrphans();

      expect(orphans).toHaveLength(0);
    });

    it('should not return recently heartbeated sandboxes', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
        orphanThresholdMs: 200,
      });

      registry.register('sandbox-1', 'docker', 'container-1');

      // Wait a bit but not past threshold
      await new Promise(resolve => setTimeout(resolve, 50));
      registry.heartbeat('sandbox-1');

      // Wait a bit more
      await new Promise(resolve => setTimeout(resolve, 50));

      const orphans = registry.getOrphans();

      expect(orphans).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return counts by status', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      registry.register('sandbox-1', 'docker', 'container-1');
      registry.register('sandbox-2', 'docker', 'container-2');
      registry.register('sandbox-3', 'docker', 'container-3');
      registry.markTerminated('sandbox-2');
      registry.markOrphaned('sandbox-3');

      const stats = registry.getStats();

      expect(stats.active).toBe(1);
      expect(stats.terminated).toBe(1);
      expect(stats.orphaned).toBe(1);
      expect(stats.cleanup_failed).toBe(0);
    });
  });

  describe('persistence', () => {
    it('should save and load entries', async () => {
      const registry1 = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      registry1.register('sandbox-1', 'docker', 'container-abc', { runId: 'run-1' });
      await registry1.save();

      // Reset and load
      SandboxRegistry.resetInstance();
      const registry2 = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      await registry2.load();

      const entry = registry2.get('sandbox-1');
      expect(entry).toBeDefined();
      expect(entry?.sandboxId).toBe('sandbox-1');
      expect(entry?.runId).toBe('run-1');
    });

    it('should handle empty file', async () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      await registry.load(); // No file exists

      expect(registry.getAll()).toHaveLength(0);
    });
  });

  describe('prune', () => {
    it('should remove old terminated entries', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });

      // Create an entry with old timestamp
      registry.register('sandbox-1', 'docker', 'container-1');
      registry.markTerminated('sandbox-1');

      // Manually set old createdAt
      const entry = registry.get('sandbox-1');
      if (entry) {
        entry.createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      }

      const pruned = registry.prune(24 * 60 * 60 * 1000); // 1 day

      expect(pruned).toBe(1);
      expect(registry.get('sandbox-1')).toBeUndefined();
    });

    it('should not prune active entries', () => {
      const registry = SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });
      registry.register('sandbox-1', 'docker', 'container-1');

      const entry = registry.get('sandbox-1');
      if (entry) {
        entry.createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      }

      const pruned = registry.prune(24 * 60 * 60 * 1000);

      expect(pruned).toBe(0);
      expect(registry.get('sandbox-1')).toBeDefined();
    });
  });

  describe('convenience function', () => {
    it('getSandboxRegistry should return singleton', () => {
      const registry1 = getSandboxRegistry();
      const registry2 = getSandboxRegistry();

      expect(registry1).toBe(registry2);
    });
  });
});
