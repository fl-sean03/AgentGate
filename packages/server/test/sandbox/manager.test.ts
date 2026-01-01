/**
 * Sandbox Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SandboxManager, getSandboxManager } from '../../src/sandbox/manager.js';

// Mock the providers
vi.mock('../../src/sandbox/subprocess-provider.js', () => ({
  SubprocessProvider: vi.fn().mockImplementation(() => ({
    name: 'subprocess',
    isAvailable: vi.fn().mockResolvedValue(true),
    createSandbox: vi.fn().mockImplementation((config) => Promise.resolve({
      id: 'subprocess-mock-123',
      status: 'running',
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'test',
        stderr: '',
        timedOut: false,
        durationMs: 100,
      }),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue('content'),
      listFiles: vi.fn().mockResolvedValue(['file1.txt']),
      destroy: vi.fn().mockResolvedValue(undefined),
      getStats: vi.fn().mockResolvedValue({}),
    })),
    listSandboxes: vi.fn().mockResolvedValue([]),
    cleanup: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../src/sandbox/docker-provider.js', () => ({
  DockerProvider: vi.fn().mockImplementation(() => ({
    name: 'docker',
    isAvailable: vi.fn().mockResolvedValue(false),
    createSandbox: vi.fn(),
    listSandboxes: vi.fn().mockResolvedValue([]),
    cleanup: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('SandboxManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SandboxManager.resetInstance();
  });

  afterEach(async () => {
    SandboxManager.resetInstance();
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const manager1 = getSandboxManager();
      const manager2 = getSandboxManager();

      expect(manager1).toBe(manager2);
    });

    it('should reset instance', () => {
      const manager1 = getSandboxManager();
      SandboxManager.resetInstance();
      const manager2 = getSandboxManager();

      expect(manager1).not.toBe(manager2);
    });
  });

  describe('initialize', () => {
    it('should initialize and select provider', async () => {
      const manager = getSandboxManager();
      await manager.initialize();

      // Since Docker is mocked as unavailable, should select subprocess
      expect(manager.getProviderName()).toBe('subprocess');
    });

    it('should be idempotent', async () => {
      const manager = getSandboxManager();

      await manager.initialize();
      await manager.initialize();

      // Should not throw
      expect(manager.getProviderName()).toBe('subprocess');
    });
  });

  describe('provider selection', () => {
    it('should auto-select subprocess when Docker unavailable', async () => {
      const manager = getSandboxManager({ provider: 'auto' });
      await manager.initialize();

      expect(manager.getProviderName()).toBe('subprocess');
      expect(manager.isDockerAvailable()).toBe(false);
    });

    it('should throw when docker requested but unavailable', async () => {
      const manager = getSandboxManager({ provider: 'docker' });

      await expect(manager.initialize()).rejects.toThrow(
        'Docker provider requested but Docker is not available'
      );
    });

    it('should select subprocess when explicitly requested', async () => {
      const manager = getSandboxManager({ provider: 'subprocess' });
      await manager.initialize();

      expect(manager.getProviderName()).toBe('subprocess');
    });
  });

  describe('createSandbox', () => {
    it('should create sandbox with selected provider', async () => {
      const manager = getSandboxManager();
      await manager.initialize();

      const sandbox = await manager.createSandbox({
        workspacePath: '/tmp/test',
      });

      expect(sandbox).toBeDefined();
      expect(sandbox.id).toMatch(/^subprocess-/);
    });

    it('should auto-initialize if not initialized', async () => {
      const manager = getSandboxManager();

      const sandbox = await manager.createSandbox({
        workspacePath: '/tmp/test',
      });

      expect(sandbox).toBeDefined();
    });

    it('should merge config with defaults', async () => {
      const manager = getSandboxManager({
        defaultImage: 'custom:latest',
        defaultNetworkMode: 'bridge',
        defaultResourceLimits: {
          cpuCount: 4,
          memoryMB: 8192,
          timeoutSeconds: 7200,
        },
      });
      await manager.initialize();

      const sandbox = await manager.createSandbox({
        workspacePath: '/tmp/test',
      });

      expect(sandbox).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('should return system status', async () => {
      const manager = getSandboxManager();
      await manager.initialize();

      const status = await manager.getStatus();

      expect(status.provider).toBe('subprocess');
      expect(status.dockerAvailable).toBe(false);
      expect(status.activeSandboxes).toBe(0);
      expect(status.lastError).toBeNull();
    });
  });

  describe('listAllSandboxes', () => {
    it('should list sandboxes from all providers', async () => {
      const manager = getSandboxManager();
      await manager.initialize();

      const sandboxes = await manager.listAllSandboxes();

      expect(Array.isArray(sandboxes)).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup all providers', async () => {
      const manager = getSandboxManager();
      await manager.initialize();

      await manager.cleanup();

      // Should complete without error
    });
  });

  describe('shutdown', () => {
    it('should stop periodic cleanup', async () => {
      const manager = getSandboxManager({
        cleanupIntervalMs: 100,
      });
      await manager.initialize();

      manager.shutdown();

      // Should not throw
    });
  });

  describe('configuration options', () => {
    it('should use custom cleanup interval', async () => {
      const manager = getSandboxManager({
        cleanupIntervalMs: 1000,
      });
      await manager.initialize();

      // Manager created with custom interval
      expect(manager).toBeDefined();

      manager.shutdown();
    });

    it('should disable cleanup when interval is 0', async () => {
      const manager = getSandboxManager({
        cleanupIntervalMs: 0,
      });
      await manager.initialize();

      // No interval should be set
      expect(manager).toBeDefined();

      manager.shutdown();
    });
  });
});
