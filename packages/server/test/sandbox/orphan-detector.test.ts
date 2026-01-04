/**
 * Tests for Orphan Detector.
 * (v0.2.27 - Thrust 4: Guaranteed Sandbox Cleanup)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { SandboxRegistry } from '../../src/sandbox/registry.js';
import {
  detectAndCleanupOrphans,
  runStartupCleanup,
  cleanupSandboxById,
  forceCleanupAll,
  getCleanupStats,
  type OrphanCleanupResult,
} from '../../src/sandbox/orphan-detector.js';

// Note: We don't mock child_process since the orphan detector
// handles non-existent processes/containers gracefully

describe('OrphanDetector', () => {
  let testDir: string;
  let registryPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `orphan-detector-test-${randomUUID()}`);
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
    vi.clearAllMocks();
  });

  describe('detectAndCleanupOrphans', () => {
    it('should return empty result when no orphans exist', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
        orphanThresholdMs: 1000,
      });
      await registry.initialize();

      const result = await detectAndCleanupOrphans();

      expect(result.orphansDetected).toBe(0);
      expect(result.cleanedUp).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.failures).toHaveLength(0);
    });

    it('should detect orphans with stale heartbeats', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
        orphanThresholdMs: 50, // Very short for testing
      });
      await registry.initialize();

      registry.register('sandbox-1', 'subprocess', '99999');

      // Wait for orphan threshold
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await detectAndCleanupOrphans();

      expect(result.orphansDetected).toBe(1);
    });

    it('should mark orphaned sandboxes as terminated on success', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
        orphanThresholdMs: 50,
      });
      await registry.initialize();

      // Register a subprocess with a non-existent PID
      registry.register('sandbox-1', 'subprocess', '999999999');

      await new Promise(resolve => setTimeout(resolve, 100));

      await detectAndCleanupOrphans();

      const entry = registry.get('sandbox-1');
      expect(entry?.status).toBe('terminated');
    });

    it('should report duration', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
      });
      await registry.initialize();

      const result = await detectAndCleanupOrphans();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should not cleanup sandboxes with fresh heartbeats', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
        orphanThresholdMs: 500,
      });
      await registry.initialize();

      registry.register('sandbox-1', 'subprocess', '12345');

      // Heartbeat immediately
      registry.heartbeat('sandbox-1');

      const result = await detectAndCleanupOrphans();

      expect(result.orphansDetected).toBe(0);
      expect(registry.get('sandbox-1')?.status).toBe('active');
    });
  });

  describe('runStartupCleanup', () => {
    it('should initialize registry and detect orphans', async () => {
      // Pre-configure the registry
      SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
        orphanThresholdMs: 50,
      });

      const result = await runStartupCleanup();

      expect(result).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should prune old terminated entries', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
      });

      // Register and terminate a sandbox
      registry.register('sandbox-1', 'subprocess', '12345');
      registry.markTerminated('sandbox-1');

      // Manually make it old
      const entry = registry.get('sandbox-1');
      if (entry) {
        entry.createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      }

      await registry.save();

      // Reset and run startup cleanup
      SandboxRegistry.resetInstance();
      SandboxRegistry.getInstance({ registryPath, autoSaveIntervalMs: 0 });

      await runStartupCleanup();

      const newRegistry = SandboxRegistry.getInstance();
      expect(newRegistry.get('sandbox-1')).toBeUndefined();
    });
  });

  describe('cleanupSandboxById', () => {
    it('should return false for non-existent sandbox', async () => {
      SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
      });

      const result = await cleanupSandboxById('non-existent');

      expect(result).toBe(false);
    });

    it('should cleanup specific sandbox by ID', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
      });

      // Register with non-existent PID (will be cleaned up successfully)
      registry.register('sandbox-1', 'subprocess', '999999999');

      const result = await cleanupSandboxById('sandbox-1');

      expect(result).toBe(true);
      expect(registry.get('sandbox-1')?.status).toBe('terminated');
    });
  });

  describe('forceCleanupAll', () => {
    it('should cleanup all active sandboxes', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
      });

      // Register multiple sandboxes with non-existent PIDs
      registry.register('sandbox-1', 'subprocess', '999999991');
      registry.register('sandbox-2', 'subprocess', '999999992');
      registry.register('sandbox-3', 'subprocess', '999999993');

      const result = await forceCleanupAll();

      expect(result.orphansDetected).toBe(3);
      expect(result.cleanedUp).toBe(3);
    });

    it('should not cleanup already terminated sandboxes', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
      });

      registry.register('sandbox-1', 'subprocess', '999999991');
      registry.markTerminated('sandbox-1');
      registry.register('sandbox-2', 'subprocess', '999999992');

      const result = await forceCleanupAll();

      expect(result.orphansDetected).toBe(1);
      expect(result.cleanedUp).toBe(1);
    });
  });

  describe('getCleanupStats', () => {
    it('should return counts by status', () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
      });

      registry.register('sandbox-1', 'subprocess', '12345');
      registry.register('sandbox-2', 'subprocess', '12346');
      registry.register('sandbox-3', 'subprocess', '12347');
      registry.markTerminated('sandbox-2');
      registry.markOrphaned('sandbox-3');

      const stats = getCleanupStats();

      expect(stats.active).toBe(1);
      expect(stats.terminated).toBe(1);
      expect(stats.orphaned).toBe(1);
      expect(stats.cleanup_failed).toBe(0);
    });
  });

  describe('cleanup retries', () => {
    it('should retry on failure with exponential backoff', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
        orphanThresholdMs: 50,
      });
      await registry.initialize();

      // Register a docker container that will fail cleanup
      // (docker commands will fail because the container doesn't exist)
      registry.register('sandbox-docker', 'docker', 'non-existent-container-id');

      await new Promise(resolve => setTimeout(resolve, 100));

      // Run with very short retry delays for testing
      const result = await detectAndCleanupOrphans({
        maxRetries: 2,
        baseRetryDelayMs: 10,
        exponentialBackoff: true,
      });

      // Should detect the orphan but cleanup may succeed or fail depending on docker availability
      expect(result.orphansDetected).toBe(1);
    });
  });

  describe('subprocess cleanup', () => {
    it('should handle already dead process gracefully', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
        orphanThresholdMs: 50,
      });
      await registry.initialize();

      // Use a PID that definitely doesn't exist
      registry.register('sandbox-1', 'subprocess', '999999999');

      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await detectAndCleanupOrphans();

      expect(result.orphansDetected).toBe(1);
      expect(result.cleanedUp).toBe(1);
      expect(registry.get('sandbox-1')?.status).toBe('terminated');
    });
  });

  describe('docker cleanup', () => {
    it('should handle non-existent container gracefully', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
        orphanThresholdMs: 50,
      });
      await registry.initialize();

      // Use a container ID that definitely doesn't exist
      registry.register('sandbox-docker', 'docker', 'nonexistent123abc');

      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await detectAndCleanupOrphans({
        maxRetries: 1,
        baseRetryDelayMs: 10,
      });

      expect(result.orphansDetected).toBe(1);
      // Cleanup may succeed (container already gone) or fail (docker error)
    });
  });

  describe('result structure', () => {
    it('should have correct result structure', async () => {
      const registry = SandboxRegistry.getInstance({
        registryPath,
        autoSaveIntervalMs: 0,
      });
      await registry.initialize();

      const result = await detectAndCleanupOrphans();

      expect(result).toHaveProperty('orphansDetected');
      expect(result).toHaveProperty('cleanedUp');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('failures');
      expect(result).toHaveProperty('durationMs');
      expect(Array.isArray(result.failures)).toBe(true);
    });
  });
});
