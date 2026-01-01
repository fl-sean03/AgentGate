/**
 * Sandbox Integration Tests
 *
 * These tests verify the sandbox module exports and basic integration.
 * Full integration tests with real Docker require a Docker environment.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Import from the module index
import {
  SubprocessProvider,
  DockerProvider,
  SandboxManager,
  getSandboxManager,
  createSandbox,
  DockerClient,
  getDockerClient,
  BaseSandboxProvider,
  DEFAULT_RESOURCE_LIMITS,
  DEFAULT_WORKSPACE_MOUNT,
  type Sandbox,
  type SandboxConfig,
  type SandboxProvider,
  type SandboxStatus,
  type ExecOptions,
  type ExecResult,
  type ProviderMode,
  type SandboxManagerConfig,
  type SandboxSystemStatus,
} from '../../src/sandbox/index.js';

describe('Sandbox Module Exports', () => {
  it('should export SubprocessProvider', () => {
    expect(SubprocessProvider).toBeDefined();
    expect(typeof SubprocessProvider).toBe('function');
  });

  it('should export DockerProvider', () => {
    expect(DockerProvider).toBeDefined();
    expect(typeof DockerProvider).toBe('function');
  });

  it('should export SandboxManager', () => {
    expect(SandboxManager).toBeDefined();
    expect(typeof SandboxManager).toBe('function');
  });

  it('should export getSandboxManager function', () => {
    expect(getSandboxManager).toBeDefined();
    expect(typeof getSandboxManager).toBe('function');
  });

  it('should export createSandbox function', () => {
    expect(createSandbox).toBeDefined();
    expect(typeof createSandbox).toBe('function');
  });

  it('should export DockerClient', () => {
    expect(DockerClient).toBeDefined();
    expect(typeof DockerClient).toBe('function');
  });

  it('should export getDockerClient function', () => {
    expect(getDockerClient).toBeDefined();
    expect(typeof getDockerClient).toBe('function');
  });

  it('should export BaseSandboxProvider', () => {
    expect(BaseSandboxProvider).toBeDefined();
    expect(typeof BaseSandboxProvider).toBe('function');
  });

  it('should export DEFAULT_RESOURCE_LIMITS', () => {
    expect(DEFAULT_RESOURCE_LIMITS).toBeDefined();
    expect(DEFAULT_RESOURCE_LIMITS.cpuCount).toBe(2);
    expect(DEFAULT_RESOURCE_LIMITS.memoryMB).toBe(2048);
    expect(DEFAULT_RESOURCE_LIMITS.timeoutSeconds).toBe(300);
  });

  it('should export DEFAULT_WORKSPACE_MOUNT', () => {
    expect(DEFAULT_WORKSPACE_MOUNT).toBeDefined();
    expect(DEFAULT_WORKSPACE_MOUNT).toBe('/workspace');
  });
});

describe('SubprocessProvider Integration', () => {
  let provider: SubprocessProvider;
  let tempDir: string;
  let sandbox: Sandbox | null = null;

  beforeEach(async () => {
    provider = new SubprocessProvider();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-integration-'));
  });

  afterEach(async () => {
    if (sandbox) {
      await sandbox.destroy();
      sandbox = null;
    }
    await provider.cleanup();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create subprocess sandbox', async () => {
    sandbox = await provider.createSandbox({
      workspacePath: tempDir,
    });

    expect(sandbox).toBeDefined();
    expect(sandbox.id).toMatch(/^subprocess-/);
    expect(sandbox.status).toBe('running');
  });

  it('should execute commands', async () => {
    sandbox = await provider.createSandbox({
      workspacePath: tempDir,
    });

    const result = await sandbox.execute('echo', ['hello']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('should read and write files', async () => {
    sandbox = await provider.createSandbox({
      workspacePath: tempDir,
    });

    await sandbox.writeFile('test.txt', 'test content');
    const content = await sandbox.readFile('test.txt');

    expect(content).toBe('test content');
  });

  it('should list files', async () => {
    sandbox = await provider.createSandbox({
      workspacePath: tempDir,
    });

    await sandbox.writeFile('file1.txt', 'content1');
    await sandbox.writeFile('file2.txt', 'content2');

    const files = await sandbox.listFiles('.');

    expect(files).toContain('file1.txt');
    expect(files).toContain('file2.txt');
  });

  it('should destroy sandbox', async () => {
    sandbox = await provider.createSandbox({
      workspacePath: tempDir,
    });

    expect(sandbox.status).toBe('running');

    await sandbox.destroy();

    expect(sandbox.status).toBe('destroyed');
    sandbox = null; // Already destroyed
  });
});

describe('SandboxManager Integration', () => {
  beforeEach(() => {
    SandboxManager.resetInstance();
    DockerClient.resetInstance();
  });

  afterEach(() => {
    SandboxManager.resetInstance();
    DockerClient.resetInstance();
  });

  it('should create manager with default config', () => {
    const manager = getSandboxManager();

    expect(manager).toBeDefined();
  });

  it('should initialize and select provider', async () => {
    const manager = getSandboxManager({ provider: 'subprocess' });
    await manager.initialize();

    expect(manager.getProviderName()).toBe('subprocess');
  });

  it('should get system status', async () => {
    const manager = getSandboxManager({ provider: 'subprocess' });
    await manager.initialize();

    const status = await manager.getStatus();

    expect(status).toBeDefined();
    expect(status.provider).toBe('subprocess');
    expect(typeof status.activeSandboxes).toBe('number');
  });

  it('should create sandbox through manager', async () => {
    const manager = getSandboxManager({ provider: 'subprocess' });
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-mgr-'));

    try {
      const sandbox = await manager.createSandbox({
        workspacePath: tempDir,
      });

      expect(sandbox).toBeDefined();
      expect(sandbox.status).toBe('running');

      await sandbox.destroy();
    } finally {
      await manager.cleanup();
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe('Docker Client', () => {
  beforeEach(() => {
    DockerClient.resetInstance();
  });

  afterEach(() => {
    DockerClient.resetInstance();
  });

  it('should create singleton instance', () => {
    const client1 = getDockerClient();
    const client2 = getDockerClient();

    expect(client1).toBe(client2);
  });

  it('should check availability without throwing', async () => {
    const client = getDockerClient();

    // Should not throw, even if Docker is not available
    const available = await client.isAvailable();

    expect(typeof available).toBe('boolean');
  });
});

describe('Type Compatibility', () => {
  it('should satisfy SandboxProvider interface', () => {
    const provider: SandboxProvider = new SubprocessProvider();

    expect(provider.name).toBeDefined();
    expect(typeof provider.isAvailable).toBe('function');
    expect(typeof provider.createSandbox).toBe('function');
    expect(typeof provider.listSandboxes).toBe('function');
    expect(typeof provider.cleanup).toBe('function');
  });

  it('should use SandboxConfig type', () => {
    const config: SandboxConfig = {
      workspacePath: '/tmp/test',
      image: 'test:latest',
      networkMode: 'none',
      resourceLimits: {
        cpuCount: 2,
        memoryMB: 1024,
        timeoutSeconds: 300,
      },
      env: {
        TEST: 'value',
      },
    };

    expect(config.workspacePath).toBe('/tmp/test');
    expect(config.resourceLimits?.cpuCount).toBe(2);
  });

  it('should use SandboxManagerConfig type', () => {
    const config: SandboxManagerConfig = {
      provider: 'auto',
      defaultImage: 'test:latest',
      defaultNetworkMode: 'none',
      defaultResourceLimits: {
        cpuCount: 2,
        memoryMB: 2048,
        timeoutSeconds: 600,
      },
      cleanupIntervalMs: 60000,
    };

    expect(config.provider).toBe('auto');
    expect(config.defaultResourceLimits?.memoryMB).toBe(2048);
  });

  it('should use ProviderMode type', () => {
    const modes: ProviderMode[] = ['auto', 'docker', 'subprocess'];

    expect(modes).toHaveLength(3);
    expect(modes).toContain('auto');
    expect(modes).toContain('docker');
    expect(modes).toContain('subprocess');
  });

  it('should use SandboxStatus type', () => {
    const statuses: SandboxStatus[] = ['creating', 'running', 'stopped', 'destroyed'];

    expect(statuses).toContain('running');
    expect(statuses).toContain('destroyed');
  });
});
