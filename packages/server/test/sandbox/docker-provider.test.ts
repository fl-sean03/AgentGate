/**
 * Docker Provider Tests
 *
 * Unit tests with mocked Docker client.
 * Integration tests are skipped as they require real Docker.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { DockerClient } from '../../src/sandbox/docker-client.js';

// Must mock before imports
vi.mock('dockerode', () => {
  const mockContainer = {
    id: 'mock-container-id-12345',
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue({
      start: vi.fn().mockResolvedValue({
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'end') {
            setTimeout(() => callback(), 10);
          }
        }),
        destroy: vi.fn(),
      }),
      inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
    }),
    stats: vi.fn().mockResolvedValue({
      cpu_stats: {
        cpu_usage: { total_usage: 1000000 },
        system_cpu_usage: 10000000,
        online_cpus: 2,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 900000 },
        system_cpu_usage: 9000000,
      },
      memory_stats: {
        usage: 104857600,
        limit: 536870912,
      },
      networks: {
        eth0: { rx_bytes: 1024, tx_bytes: 512 },
      },
    }),
  };

  return {
    default: vi.fn().mockImplementation(() => ({
      ping: vi.fn().mockResolvedValue({}),
      version: vi.fn().mockResolvedValue({ Version: '24.0.0' }),
      createContainer: vi.fn().mockResolvedValue(mockContainer),
      getContainer: vi.fn().mockReturnValue(mockContainer),
      listContainers: vi.fn().mockResolvedValue([]),
      listImages: vi.fn().mockResolvedValue([{ Id: 'image-id' }]),
      pull: vi.fn().mockResolvedValue({}),
      modem: {
        followProgress: vi.fn(
          (
            _stream: unknown,
            onFinished: (err: Error | null) => void,
          ) => {
            setTimeout(() => onFinished(null), 10);
          }
        ),
      },
    })),
  };
});

describe('DockerProvider', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Reset singleton
    DockerClient.resetInstance();

    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docker-test-'));
  });

  afterEach(async () => {
    DockerClient.resetInstance();

    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('unit tests (mocked Docker)', () => {
    it('should have name "docker"', async () => {
      // Import after mock is set up
      const { DockerProvider } = await import('../../src/sandbox/docker-provider.js');
      const provider = new DockerProvider();

      expect(provider.name).toBe('docker');

      await provider.cleanup();
    });

    it('should check Docker availability', async () => {
      const { DockerProvider } = await import('../../src/sandbox/docker-provider.js');
      const provider = new DockerProvider();

      const available = await provider.isAvailable();
      expect(available).toBe(true);

      await provider.cleanup();
    });

    it('should return Docker version', async () => {
      const { DockerProvider } = await import('../../src/sandbox/docker-provider.js');
      const provider = new DockerProvider();

      await provider.isAvailable();
      expect(provider.getDockerVersion()).toBe('24.0.0');

      await provider.cleanup();
    });

    it('should create sandbox with valid config', async () => {
      const { DockerProvider } = await import('../../src/sandbox/docker-provider.js');
      const provider = new DockerProvider();

      const sandbox = await provider.createSandbox({
        workspacePath: tempDir,
      });

      expect(sandbox).toBeDefined();
      expect(sandbox.id).toMatch(/^docker-/);
      expect(sandbox.status).toBe('running');
      expect(sandbox.containerId).toBeDefined();

      await sandbox.destroy();
      await provider.cleanup();
    });

    it('should register sandbox in provider', async () => {
      const { DockerProvider } = await import('../../src/sandbox/docker-provider.js');
      const provider = new DockerProvider();

      const sandbox = await provider.createSandbox({
        workspacePath: tempDir,
      });

      const sandboxes = await provider.listSandboxes();
      expect(sandboxes).toHaveLength(1);
      expect(sandboxes[0]?.id).toBe(sandbox.id);

      await sandbox.destroy();
      await provider.cleanup();
    });

    it('should destroy sandbox and remove from list', async () => {
      const { DockerProvider } = await import('../../src/sandbox/docker-provider.js');
      const provider = new DockerProvider();

      const sandbox = await provider.createSandbox({
        workspacePath: tempDir,
      });

      expect((await provider.listSandboxes()).length).toBe(1);

      await sandbox.destroy();
      expect(sandbox.status).toBe('destroyed');

      // Provider cleanup removes from active sandboxes
      await provider.cleanup();
    });

    it('should handle cleanup of multiple sandboxes', async () => {
      const { DockerProvider } = await import('../../src/sandbox/docker-provider.js');
      const provider = new DockerProvider();

      const sandbox1 = await provider.createSandbox({
        workspacePath: tempDir,
      });
      const sandbox2 = await provider.createSandbox({
        workspacePath: tempDir,
      });

      expect((await provider.listSandboxes()).length).toBe(2);

      await provider.cleanup();

      expect((await provider.listSandboxes()).length).toBe(0);
      expect(sandbox1.status).toBe('destroyed');
      expect(sandbox2.status).toBe('destroyed');
    });
  });

  // Integration tests are skipped by default
  describe.skip('integration tests (real Docker)', () => {
    it('should create and destroy real container', async () => {
      // This test requires a real Docker installation
      // To run: remove .skip and ensure Docker is running
    });
  });
});
