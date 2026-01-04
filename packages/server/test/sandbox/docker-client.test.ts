/**
 * Docker Client Tests
 *
 * Comprehensive tests for DockerClient singleton wrapper around dockerode.
 * Tests cover: health checks, container operations, stats, error handling, version compatibility.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import type { Container, Exec, ContainerInfo, ContainerInspectInfo } from 'dockerode';

// Mock dockerode before importing DockerClient
vi.mock('dockerode', () => {
  const mockContainer = {
    id: 'test-container-123',
    start: vi.fn(),
    stop: vi.fn(),
    remove: vi.fn(),
    inspect: vi.fn(),
    stats: vi.fn(),
    exec: vi.fn(),
  };

  const mockExec = {
    start: vi.fn(),
    inspect: vi.fn(),
  };

  const MockDocker = vi.fn().mockImplementation(() => ({
    ping: vi.fn(),
    version: vi.fn(),
    listImages: vi.fn(),
    pull: vi.fn(),
    createContainer: vi.fn().mockResolvedValue(mockContainer),
    getContainer: vi.fn().mockReturnValue(mockContainer),
    listContainers: vi.fn(),
    modem: {
      followProgress: vi.fn(
        (
          stream: unknown,
          onComplete: (err: Error | null) => void,
          _onProgress: (event: unknown) => void
        ) => {
          onComplete(null);
        }
      ),
    },
  }));

  return {
    default: MockDocker,
    __mockContainer: mockContainer,
    __mockExec: mockExec,
  };
});

// Import after mocking
import Docker from 'dockerode';
import {
  DockerClient,
  getDockerClient,
  type ContainerExecResult,
  type ContainerStats,
  type DockerVersionInfo,
} from '../../src/sandbox/docker-client.js';

// Get mock references
const mockDockerode = vi.mocked(Docker);

describe('DockerClient', () => {
  let dockerInstance: ReturnType<typeof Docker.prototype.ping> extends Promise<unknown>
    ? InstanceType<typeof Docker>
    : never;

  beforeEach(() => {
    vi.clearAllMocks();
    DockerClient.resetInstance();

    // Get the mock instance that will be created
    dockerInstance = new Docker() as typeof dockerInstance;
  });

  afterEach(() => {
    DockerClient.resetInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = DockerClient.getInstance();
      const instance2 = DockerClient.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = DockerClient.getInstance();
      DockerClient.resetInstance();
      const instance2 = DockerClient.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    it('should use default socket path when not specified', () => {
      DockerClient.getInstance();

      expect(mockDockerode).toHaveBeenCalledWith({
        socketPath: '/var/run/docker.sock',
      });
    });

    it('should use custom socket path when specified', () => {
      DockerClient.getInstance('/custom/docker.sock');

      expect(mockDockerode).toHaveBeenCalledWith({
        socketPath: '/custom/docker.sock',
      });
    });

    it('should provide getDockerClient helper function', () => {
      const client = getDockerClient();
      const instance = DockerClient.getInstance();

      expect(client).toBe(instance);
    });
  });

  describe('isAvailable()', () => {
    it('should return true when Docker daemon is available and meets version requirements', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.ping).mockResolvedValue('OK');
      vi.mocked(docker.version).mockResolvedValue({
        Version: '24.0.5',
        ApiVersion: '1.43',
        MinAPIVersion: '1.24',
        Os: 'linux',
        Arch: 'amd64',
      });

      const available = await client.isAvailable();

      expect(available).toBe(true);
      expect(docker.ping).toHaveBeenCalled();
      expect(docker.version).toHaveBeenCalled();
    });

    it('should cache availability result', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.ping).mockResolvedValue('OK');
      vi.mocked(docker.version).mockResolvedValue({
        Version: '24.0.5',
        ApiVersion: '1.43',
        MinAPIVersion: '1.24',
        Os: 'linux',
        Arch: 'amd64',
      });

      // Call twice
      await client.isAvailable();
      await client.isAvailable();

      // Should only call ping once due to caching
      expect(docker.ping).toHaveBeenCalledTimes(1);
    });

    it('should return false when Docker daemon ping fails', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.ping).mockRejectedValue(new Error('Cannot connect to Docker daemon'));

      const available = await client.isAvailable();

      expect(available).toBe(false);
    });

    it('should return false when API version is too old', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.ping).mockResolvedValue('OK');
      vi.mocked(docker.version).mockResolvedValue({
        Version: '18.09.0',
        ApiVersion: '1.39', // Below MIN_API_VERSION (1.40)
        MinAPIVersion: '1.12',
        Os: 'linux',
        Arch: 'amd64',
      });

      const available = await client.isAvailable();

      expect(available).toBe(false);
    });

    it('should handle missing version fields gracefully', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.ping).mockResolvedValue('OK');
      vi.mocked(docker.version).mockResolvedValue({
        ApiVersion: '1.43',
      });

      const available = await client.isAvailable();

      expect(available).toBe(true);

      const versionInfo = client.getVersionInfo();
      expect(versionInfo?.version).toBe('unknown');
      expect(versionInfo?.os).toBe('unknown');
      expect(versionInfo?.arch).toBe('unknown');
    });
  });

  describe('getVersionInfo()', () => {
    it('should return null before isAvailable is called', () => {
      const client = DockerClient.getInstance();

      expect(client.getVersionInfo()).toBeNull();
    });

    it('should return version info after successful isAvailable call', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.ping).mockResolvedValue('OK');
      vi.mocked(docker.version).mockResolvedValue({
        Version: '24.0.5',
        ApiVersion: '1.43',
        MinAPIVersion: '1.24',
        Os: 'linux',
        Arch: 'amd64',
      });

      await client.isAvailable();
      const info = client.getVersionInfo();

      expect(info).toEqual({
        version: '24.0.5',
        apiVersion: '1.43',
        minApiVersion: '1.24',
        os: 'linux',
        arch: 'amd64',
      });
    });
  });

  describe('pullImage()', () => {
    it('should skip pull if image already exists locally', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.listImages).mockResolvedValue([{ Id: 'image-123' }] as never);

      await client.pullImage('node:18');

      expect(docker.listImages).toHaveBeenCalledWith({
        filters: { reference: ['node:18'] },
      });
      expect(docker.pull).not.toHaveBeenCalled();
    });

    it('should pull image if not present locally', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.listImages).mockResolvedValue([]);
      vi.mocked(docker.pull).mockResolvedValue({} as never);

      await client.pullImage('node:18');

      expect(docker.pull).toHaveBeenCalledWith('node:18');
    });

    it('should wait for pull to complete via modem.followProgress', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.listImages).mockResolvedValue([]);
      const mockStream = {};
      vi.mocked(docker.pull).mockResolvedValue(mockStream as never);

      await client.pullImage('node:18');

      expect(docker.modem.followProgress).toHaveBeenCalledWith(
        mockStream,
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should throw error if pull fails', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.listImages).mockResolvedValue([]);
      vi.mocked(docker.pull).mockRejectedValue(new Error('Pull failed: unauthorized'));

      await expect(client.pullImage('private/image:latest')).rejects.toThrow(
        'Pull failed: unauthorized'
      );
    });

    it('should throw error if modem.followProgress reports error', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.listImages).mockResolvedValue([]);
      vi.mocked(docker.pull).mockResolvedValue({} as never);
      vi.mocked(docker.modem.followProgress).mockImplementation(
        (stream, onComplete) => {
          onComplete(new Error('Download failed'));
        }
      );

      await expect(client.pullImage('node:18')).rejects.toThrow('Download failed');
    });
  });

  describe('createContainer()', () => {
    it('should create container with provided options', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      const mockContainer = { id: 'new-container-456' };
      vi.mocked(docker.createContainer).mockResolvedValue(mockContainer as never);

      const container = await client.createContainer({
        Image: 'node:18',
        Cmd: ['node', '-e', 'console.log("test")'],
        HostConfig: {
          Memory: 512 * 1024 * 1024,
          CpuPeriod: 100000,
          CpuQuota: 50000,
        },
      });

      expect(container.id).toBe('new-container-456');
      expect(docker.createContainer).toHaveBeenCalledWith({
        Image: 'node:18',
        Cmd: ['node', '-e', 'console.log("test")'],
        HostConfig: {
          Memory: 512 * 1024 * 1024,
          CpuPeriod: 100000,
          CpuQuota: 50000,
        },
      });
    });

    it('should throw error if container creation fails', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.createContainer).mockRejectedValue(
        new Error('No such image: invalid:latest')
      );

      await expect(
        client.createContainer({ Image: 'invalid:latest' })
      ).rejects.toThrow('No such image');
    });
  });

  describe('startContainer()', () => {
    it('should start container by ID', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.start).mockResolvedValue(undefined as never);

      await client.startContainer('container-123');

      expect(docker.getContainer).toHaveBeenCalledWith('container-123');
      expect(mockContainer.start).toHaveBeenCalled();
    });

    it('should throw error if start fails', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.start).mockRejectedValue(
        new Error('Container already started')
      );

      await expect(client.startContainer('container-123')).rejects.toThrow(
        'Container already started'
      );
    });
  });

  describe('execInContainer()', () => {
    it('should execute command and return result', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      const mockExec = {
        start: vi.fn(),
        inspect: vi.fn(),
      };

      vi.mocked(mockContainer.exec).mockResolvedValue(mockExec as never);

      // Create a mock stream that emits demuxed data
      const mockStream = {
        on: vi.fn((event: string, callback: (data?: Buffer) => void) => {
          if (event === 'data') {
            // Docker stream format: [type(1), 0, 0, 0, size(4), payload]
            // type=1 for stdout, type=2 for stderr
            const payload = Buffer.from('hello world');
            const header = Buffer.alloc(8);
            header[0] = 1; // stdout
            header.writeUInt32BE(payload.length, 4);
            const data = Buffer.concat([header, payload]);
            callback(data);
          } else if (event === 'end') {
            callback();
          }
          return mockStream;
        }),
        destroy: vi.fn(),
      };

      mockExec.start.mockResolvedValue(mockStream as never);
      mockExec.inspect.mockResolvedValue({ ExitCode: 0 });

      const result = await client.execInContainer('container-123', ['echo', 'hello world']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello world');
      expect(result.stderr).toBe('');
    });

    it('should capture stderr separately', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      const mockExec = {
        start: vi.fn(),
        inspect: vi.fn(),
      };

      vi.mocked(mockContainer.exec).mockResolvedValue(mockExec as never);

      const mockStream = {
        on: vi.fn((event: string, callback: (data?: Buffer) => void) => {
          if (event === 'data') {
            // type=2 for stderr
            const payload = Buffer.from('error message');
            const header = Buffer.alloc(8);
            header[0] = 2; // stderr
            header.writeUInt32BE(payload.length, 4);
            const data = Buffer.concat([header, payload]);
            callback(data);
          } else if (event === 'end') {
            callback();
          }
          return mockStream;
        }),
        destroy: vi.fn(),
      };

      mockExec.start.mockResolvedValue(mockStream as never);
      mockExec.inspect.mockResolvedValue({ ExitCode: 1 });

      const result = await client.execInContainer('container-123', ['failing-cmd']);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('error message');
    });

    it('should handle timeout option', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      const mockExec = {
        start: vi.fn(),
        inspect: vi.fn(),
      };

      vi.mocked(mockContainer.exec).mockResolvedValue(mockExec as never);

      const mockStream = {
        on: vi.fn((event: string, callback: (data?: Buffer | Error) => void) => {
          // Never emit 'end' to simulate long-running command
          return mockStream;
        }),
        destroy: vi.fn(),
      };

      mockExec.start.mockResolvedValue(mockStream as never);

      const execPromise = client.execInContainer('container-123', ['sleep', '100'], {
        timeout: 50,
      });

      await expect(execPromise).rejects.toThrow('Exec timed out after 50ms');
      expect(mockStream.destroy).toHaveBeenCalled();
    });

    it('should handle AbortSignal - already aborted', async () => {
      const client = DockerClient.getInstance();
      const controller = new AbortController();
      controller.abort();

      const result = await client.execInContainer('container-123', ['echo', 'test'], {
        signal: controller.signal,
      });

      expect(result.exitCode).toBe(-1);
      expect(result.stderr).toBe('Operation was aborted before execution');
    });

    it('should handle AbortSignal - aborted during execution', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      const mockExec = {
        start: vi.fn(),
        inspect: vi.fn(),
      };

      vi.mocked(mockContainer.exec).mockResolvedValue(mockExec as never);

      const controller = new AbortController();

      const mockStream = {
        on: vi.fn((event: string, callback: (data?: Buffer) => void) => {
          if (event === 'data') {
            // Emit some data before abort
            const payload = Buffer.from('partial');
            const header = Buffer.alloc(8);
            header[0] = 1;
            header.writeUInt32BE(payload.length, 4);
            callback(Buffer.concat([header, payload]));
            // Abort mid-stream
            setTimeout(() => controller.abort(), 10);
          } else if (event === 'end') {
            // Wait for abort to happen, then end
            setTimeout(() => callback(), 50);
          }
          return mockStream;
        }),
        destroy: vi.fn(),
      };

      mockExec.start.mockResolvedValue(mockStream as never);

      const result = await client.execInContainer('container-123', ['long-cmd'], {
        signal: controller.signal,
      });

      expect(result.exitCode).toBe(-1);
      expect(result.stdout).toBe('partial');
      expect(result.stderr).toContain('Operation was aborted');
    });

    it('should pass environment variables and working directory', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      const mockExec = {
        start: vi.fn(),
        inspect: vi.fn(),
      };

      vi.mocked(mockContainer.exec).mockResolvedValue(mockExec as never);

      const mockStream = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'end') callback();
          return mockStream;
        }),
        destroy: vi.fn(),
      };

      mockExec.start.mockResolvedValue(mockStream as never);
      mockExec.inspect.mockResolvedValue({ ExitCode: 0 });

      await client.execInContainer('container-123', ['npm', 'test'], {
        env: ['NODE_ENV=test', 'DEBUG=true'],
        workingDir: '/app',
      });

      expect(mockContainer.exec).toHaveBeenCalledWith({
        Cmd: ['npm', 'test'],
        AttachStdout: true,
        AttachStderr: true,
        Env: ['NODE_ENV=test', 'DEBUG=true'],
        WorkingDir: '/app',
      });
    });

    it('should handle stream errors', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      const mockExec = {
        start: vi.fn(),
        inspect: vi.fn(),
      };

      vi.mocked(mockContainer.exec).mockResolvedValue(mockExec as never);

      const mockStream = {
        on: vi.fn((event: string, callback: (arg?: Error) => void) => {
          if (event === 'error') {
            callback(new Error('Stream error'));
          }
          return mockStream;
        }),
        destroy: vi.fn(),
      };

      mockExec.start.mockResolvedValue(mockStream as never);

      await expect(
        client.execInContainer('container-123', ['cmd'])
      ).rejects.toThrow('Stream error');
    });
  });

  describe('stopContainer()', () => {
    it('should stop container with default timeout', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.stop).mockResolvedValue(undefined as never);

      await client.stopContainer('container-123');

      expect(docker.getContainer).toHaveBeenCalledWith('container-123');
      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
    });

    it('should stop container with custom timeout', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.stop).mockResolvedValue(undefined as never);

      await client.stopContainer('container-123', 30);

      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 30 });
    });

    it('should ignore already stopped container (304)', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      const error = new Error('Container already stopped') as Error & { statusCode?: number };
      error.statusCode = 304;
      vi.mocked(mockContainer.stop).mockRejectedValue(error);

      // Should not throw
      await expect(client.stopContainer('container-123')).resolves.toBeUndefined();
    });

    it('should throw on other errors', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.stop).mockRejectedValue(new Error('Container not found'));

      await expect(client.stopContainer('container-123')).rejects.toThrow('Container not found');
    });
  });

  describe('removeContainer()', () => {
    it('should remove container without force', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.remove).mockResolvedValue(undefined as never);

      await client.removeContainer('container-123');

      expect(mockContainer.remove).toHaveBeenCalledWith({ force: false, v: true });
    });

    it('should remove container with force', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.remove).mockResolvedValue(undefined as never);

      await client.removeContainer('container-123', true);

      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true, v: true });
    });

    it('should ignore already removed container (404)', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      const error = new Error('Container not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      vi.mocked(mockContainer.remove).mockRejectedValue(error);

      // Should not throw
      await expect(client.removeContainer('container-123')).resolves.toBeUndefined();
    });

    it('should throw on other errors', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.remove).mockRejectedValue(new Error('Container in use'));

      await expect(client.removeContainer('container-123')).rejects.toThrow('Container in use');
    });
  });

  describe('getContainerStats()', () => {
    it('should calculate CPU percentage correctly', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.stats).mockResolvedValue({
        cpu_stats: {
          cpu_usage: { total_usage: 200000000 },
          system_cpu_usage: 1000000000,
          online_cpus: 4,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 100000000 },
          system_cpu_usage: 500000000,
        },
        memory_stats: {
          usage: 512 * 1024 * 1024,
          limit: 2048 * 1024 * 1024,
        },
        networks: {},
      } as never);

      const stats = await client.getContainerStats('container-123');

      // CPU delta = 200000000 - 100000000 = 100000000
      // System delta = 1000000000 - 500000000 = 500000000
      // CPU % = (100000000 / 500000000) * 4 * 100 = 80%
      expect(stats.cpuPercent).toBe(80);
      expect(stats.memoryBytes).toBe(512 * 1024 * 1024);
      expect(stats.memoryLimitBytes).toBe(2048 * 1024 * 1024);
    });

    it('should sum network stats across all interfaces', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.stats).mockResolvedValue({
        cpu_stats: {
          cpu_usage: { total_usage: 100 },
          system_cpu_usage: 1000,
          online_cpus: 1,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 50 },
          system_cpu_usage: 500,
        },
        memory_stats: { usage: 1024, limit: 2048 },
        networks: {
          eth0: { rx_bytes: 1000, tx_bytes: 2000 },
          eth1: { rx_bytes: 500, tx_bytes: 300 },
        },
      } as never);

      const stats = await client.getContainerStats('container-123');

      expect(stats.networkRxBytes).toBe(1500); // 1000 + 500
      expect(stats.networkTxBytes).toBe(2300); // 2000 + 300
    });

    it('should handle missing network stats', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.stats).mockResolvedValue({
        cpu_stats: {
          cpu_usage: { total_usage: 100 },
          system_cpu_usage: 1000,
          online_cpus: 1,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 50 },
          system_cpu_usage: 500,
        },
        memory_stats: { usage: 1024, limit: 2048 },
        // No networks field
      } as never);

      const stats = await client.getContainerStats('container-123');

      expect(stats.networkRxBytes).toBe(0);
      expect(stats.networkTxBytes).toBe(0);
    });

    it('should handle zero system delta (avoid division by zero)', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.stats).mockResolvedValue({
        cpu_stats: {
          cpu_usage: { total_usage: 100 },
          system_cpu_usage: 500,
          online_cpus: 1,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 50 },
          system_cpu_usage: 500, // Same as current = zero delta
        },
        memory_stats: { usage: 1024, limit: 2048 },
        networks: {},
      } as never);

      const stats = await client.getContainerStats('container-123');

      expect(stats.cpuPercent).toBe(0);
    });

    it('should handle missing online_cpus', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.stats).mockResolvedValue({
        cpu_stats: {
          cpu_usage: { total_usage: 200 },
          system_cpu_usage: 1000,
          // No online_cpus
        },
        precpu_stats: {
          cpu_usage: { total_usage: 100 },
          system_cpu_usage: 500,
        },
        memory_stats: { usage: 1024, limit: 2048 },
        networks: {},
      } as never);

      const stats = await client.getContainerStats('container-123');

      // Should default to 1 CPU
      expect(stats.cpuPercent).toBe(20); // (100/500) * 1 * 100
    });

    it('should throw error on stats failure', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.stats).mockRejectedValue(new Error('Container not running'));

      await expect(client.getContainerStats('container-123')).rejects.toThrow(
        'Container not running'
      );
    });
  });

  describe('listContainersByLabel()', () => {
    it('should list containers by label key only', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.listContainers).mockResolvedValue([
        { Id: 'container-1', Names: ['/c1'] },
        { Id: 'container-2', Names: ['/c2'] },
      ] as ContainerInfo[]);

      const containers = await client.listContainersByLabel('agentgate');

      expect(docker.listContainers).toHaveBeenCalledWith({
        all: true,
        filters: { label: ['agentgate'] },
      });
      expect(containers).toHaveLength(2);
    });

    it('should list containers by label key and value', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.listContainers).mockResolvedValue([
        { Id: 'container-1', Names: ['/c1'] },
      ] as ContainerInfo[]);

      const containers = await client.listContainersByLabel('agentgate.run-id', 'run-123');

      expect(docker.listContainers).toHaveBeenCalledWith({
        all: true,
        filters: { label: ['agentgate.run-id=run-123'] },
      });
      expect(containers).toHaveLength(1);
    });
  });

  describe('inspectContainer()', () => {
    it('should inspect container and return info', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      const inspectResult = {
        Id: 'container-123',
        State: { Running: true, ExitCode: 0 },
        Config: { Image: 'node:18' },
      } as ContainerInspectInfo;

      vi.mocked(mockContainer.inspect).mockResolvedValue(inspectResult);

      const info = await client.inspectContainer('container-123');

      expect(info).toEqual(inspectResult);
      expect(docker.getContainer).toHaveBeenCalledWith('container-123');
    });
  });

  describe('isContainerRunning()', () => {
    it('should return true for running container', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.inspect).mockResolvedValue({
        State: { Running: true },
      } as ContainerInspectInfo);

      const running = await client.isContainerRunning('container-123');

      expect(running).toBe(true);
    });

    it('should return false for stopped container', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.inspect).mockResolvedValue({
        State: { Running: false },
      } as ContainerInspectInfo);

      const running = await client.isContainerRunning('container-123');

      expect(running).toBe(false);
    });

    it('should return false when container does not exist', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();
      const mockContainer = docker.getContainer('test-id');

      vi.mocked(mockContainer.inspect).mockRejectedValue(new Error('Container not found'));

      const running = await client.isContainerRunning('container-123');

      expect(running).toBe(false);
    });
  });

  describe('Error Handling for Missing Docker Daemon', () => {
    it('should handle ENOENT (socket not found)', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      const error = new Error('connect ENOENT /var/run/docker.sock') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(docker.ping).mockRejectedValue(error);

      const available = await client.isAvailable();

      expect(available).toBe(false);
    });

    it('should handle ECONNREFUSED (daemon not running)', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      const error = new Error('connect ECONNREFUSED') as NodeJS.ErrnoException;
      error.code = 'ECONNREFUSED';
      vi.mocked(docker.ping).mockRejectedValue(error);

      const available = await client.isAvailable();

      expect(available).toBe(false);
    });

    it('should handle permission denied errors', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      const error = new Error('permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      vi.mocked(docker.ping).mockRejectedValue(error);

      const available = await client.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('Version Compatibility', () => {
    it('should accept exactly MIN_API_VERSION (1.40)', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.ping).mockResolvedValue('OK');
      vi.mocked(docker.version).mockResolvedValue({
        Version: '19.03.0',
        ApiVersion: '1.40',
        MinAPIVersion: '1.12',
        Os: 'linux',
        Arch: 'amd64',
      });

      const available = await client.isAvailable();

      expect(available).toBe(true);
    });

    it('should accept newer API versions', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.ping).mockResolvedValue('OK');
      vi.mocked(docker.version).mockResolvedValue({
        Version: '25.0.0',
        ApiVersion: '1.45',
        MinAPIVersion: '1.24',
        Os: 'linux',
        Arch: 'amd64',
      });

      const available = await client.isAvailable();

      expect(available).toBe(true);
    });

    it('should reject API version just below minimum (1.39)', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.ping).mockResolvedValue('OK');
      vi.mocked(docker.version).mockResolvedValue({
        Version: '18.09.9',
        ApiVersion: '1.39',
        MinAPIVersion: '1.12',
        Os: 'linux',
        Arch: 'amd64',
      });

      const available = await client.isAvailable();

      expect(available).toBe(false);
    });

    it('should handle very old Docker versions', async () => {
      const client = DockerClient.getInstance();
      const docker = new Docker();

      vi.mocked(docker.ping).mockResolvedValue('OK');
      vi.mocked(docker.version).mockResolvedValue({
        Version: '1.12.0',
        ApiVersion: '1.24',
        MinAPIVersion: '1.12',
        Os: 'linux',
        Arch: 'amd64',
      });

      const available = await client.isAvailable();

      expect(available).toBe(false);
    });
  });
});
