/**
 * Sandbox Manager Tests
 *
 * Tests for sandbox manager functionality including provider selection,
 * lifecycle management, and cleanup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  SandboxManager,
  resetSandboxManager,
  getSandboxManager,
} from '../../src/sandbox/manager.js';
import type { Sandbox } from '../../src/sandbox/types.js';

describe('SandboxManager', () => {
  let manager: SandboxManager;
  let tempDir: string;
  let sandbox: Sandbox | null = null;

  beforeEach(async () => {
    // Reset singleton
    resetSandboxManager();

    // Create fresh manager
    manager = new SandboxManager({
      provider: 'subprocess', // Use subprocess for reliable testing
    });

    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-manager-test-'));
  });

  afterEach(async () => {
    // Destroy sandbox if created
    if (sandbox) {
      await sandbox.destroy();
      sandbox = null;
    }

    // Shutdown manager
    await manager.shutdown();

    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should initialize with subprocess provider', async () => {
      await manager.initialize();

      expect(manager.getProviderName()).toBe('subprocess');
    });

    it('should use auto provider selection', async () => {
      const autoManager = new SandboxManager({ provider: 'auto' });
      await autoManager.initialize();

      // Should select subprocess or docker based on availability
      const providerName = autoManager.getProviderName();
      expect(['subprocess', 'docker']).toContain(providerName);

      await autoManager.shutdown();
    });
  });

  describe('createSandbox', () => {
    it('should create sandbox with valid workspace', async () => {
      await manager.initialize();

      sandbox = await manager.createSandbox({
        workspacePath: tempDir,
      });

      expect(sandbox).toBeDefined();
      expect(sandbox.id).toBeDefined();
      expect(sandbox.status).toBe('running');
    });

    it('should auto-initialize if not initialized', async () => {
      sandbox = await manager.createSandbox({
        workspacePath: tempDir,
      });

      expect(sandbox).toBeDefined();
      expect(manager.getProviderName()).toBe('subprocess');
    });

    it('should track sandbox with runId', async () => {
      await manager.initialize();

      sandbox = await manager.createSandbox(
        { workspacePath: tempDir },
        'test-run-id'
      );

      const sandboxes = manager.listSandboxes();
      expect(sandboxes).toHaveLength(1);
      expect(sandboxes[0]?.id).toBe(sandbox.id);
      expect(sandboxes[0]?.runId).toBe('test-run-id');
    });

    it('should merge config with defaults', async () => {
      await manager.initialize();

      // Create sandbox with partial config
      sandbox = await manager.createSandbox({
        workspacePath: tempDir,
        // networkMode and resourceLimits should be filled from defaults
      });

      expect(sandbox).toBeDefined();
    });
  });

  describe('destroySandbox', () => {
    it('should destroy and untrack sandbox', async () => {
      await manager.initialize();

      sandbox = await manager.createSandbox({
        workspacePath: tempDir,
      });

      const sandboxId = sandbox.id;

      await manager.destroySandbox(sandboxId);
      sandbox = null; // Already destroyed

      const sandboxes = manager.listSandboxes();
      expect(sandboxes.find((s) => s.id === sandboxId)).toBeUndefined();
    });

    it('should handle non-existent sandbox gracefully', async () => {
      await manager.initialize();

      // Should not throw
      await manager.destroySandbox('non-existent-id');
    });
  });

  describe('getStatus', () => {
    it('should return system status', async () => {
      await manager.initialize();

      const status = await manager.getStatus();

      expect(status.activeProvider).toBe('subprocess');
      expect(typeof status.dockerAvailable).toBe('boolean');
      expect(status.activeSandboxCount).toBe(0);
      expect(status.defaultNetworkMode).toBe('none');
    });

    it('should count active sandboxes', async () => {
      await manager.initialize();

      sandbox = await manager.createSandbox({
        workspacePath: tempDir,
      });

      const status = await manager.getStatus();
      expect(status.activeSandboxCount).toBe(1);
    });
  });

  describe('listSandboxes', () => {
    it('should return empty list initially', () => {
      const sandboxes = manager.listSandboxes();
      expect(sandboxes).toEqual([]);
    });

    it('should list created sandboxes', async () => {
      await manager.initialize();

      const sandbox1 = await manager.createSandbox({
        workspacePath: tempDir,
      });
      const sandbox2 = await manager.createSandbox({
        workspacePath: tempDir,
      });

      const sandboxes = manager.listSandboxes();
      expect(sandboxes).toHaveLength(2);
      expect(sandboxes.map((s) => s.id)).toContain(sandbox1.id);
      expect(sandboxes.map((s) => s.id)).toContain(sandbox2.id);

      // Cleanup
      await sandbox1.destroy();
      await sandbox2.destroy();
    });
  });

  describe('cleanup', () => {
    it('should destroy all active sandboxes', async () => {
      await manager.initialize();

      const sandbox1 = await manager.createSandbox({
        workspacePath: tempDir,
      });
      const sandbox2 = await manager.createSandbox({
        workspacePath: tempDir,
      });

      expect(manager.listSandboxes()).toHaveLength(2);

      await manager.cleanup();

      expect(manager.listSandboxes()).toHaveLength(0);
      expect(sandbox1.status).toBe('destroyed');
      expect(sandbox2.status).toBe('destroyed');
    });
  });

  describe('shutdown', () => {
    it('should cleanup and stop manager', async () => {
      await manager.initialize();

      sandbox = await manager.createSandbox({
        workspacePath: tempDir,
      });

      await manager.shutdown();
      sandbox = null; // Already destroyed by shutdown

      expect(manager.listSandboxes()).toHaveLength(0);
    });
  });

  describe('isDockerAvailable', () => {
    it('should return boolean', async () => {
      const available = await manager.isDockerAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('getSandboxManager singleton', () => {
    it('should return same instance', () => {
      const manager1 = getSandboxManager();
      const manager2 = getSandboxManager();

      expect(manager1).toBe(manager2);
    });

    it('should return fresh instance after reset', () => {
      const manager1 = getSandboxManager();
      resetSandboxManager();
      const manager2 = getSandboxManager();

      expect(manager1).not.toBe(manager2);
    });
  });
});

describe('SandboxManager configuration', () => {
  afterEach(() => {
    resetSandboxManager();
  });

  it('should use custom image', async () => {
    const manager = new SandboxManager({
      provider: 'subprocess',
      image: 'custom/image:latest',
    });

    await manager.initialize();

    const status = await manager.getStatus();
    expect(status.defaultImage).toBe('custom/image:latest');

    await manager.shutdown();
  });

  it('should use custom network mode', async () => {
    const manager = new SandboxManager({
      provider: 'subprocess',
      networkMode: 'bridge',
    });

    await manager.initialize();

    const status = await manager.getStatus();
    expect(status.defaultNetworkMode).toBe('bridge');

    await manager.shutdown();
  });

  it('should use custom resource limits', async () => {
    const manager = new SandboxManager({
      provider: 'subprocess',
      resourceLimits: {
        cpuCount: 4,
        memoryMB: 8192,
        timeoutSeconds: 7200,
      },
    });

    await manager.initialize();

    // Resource limits are applied to created sandboxes
    expect(manager.getProviderName()).toBe('subprocess');

    await manager.shutdown();
  });
});
