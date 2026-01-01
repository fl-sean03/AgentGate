/**
 * Docker Provider Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DockerProvider } from '../../src/sandbox/docker-provider.js';
import { DockerClient } from '../../src/sandbox/docker-client.js';

// Mock the docker client
vi.mock('../../src/sandbox/docker-client.js', () => {
  const mockClient = {
    isAvailable: vi.fn(),
    pullImage: vi.fn(),
    createContainer: vi.fn(),
    startContainer: vi.fn(),
    stopContainer: vi.fn(),
    removeContainer: vi.fn(),
    execInContainer: vi.fn(),
    getContainerStats: vi.fn(),
    listContainersByLabel: vi.fn(),
    inspectContainer: vi.fn(),
  };

  return {
    DockerClient: {
      getInstance: vi.fn(() => mockClient),
      resetInstance: vi.fn(),
    },
    getDockerClient: vi.fn(() => mockClient),
  };
});

describe('DockerProvider', () => {
  let provider: DockerProvider;
  let mockDockerClient: ReturnType<typeof vi.mocked<DockerClient>>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new DockerProvider();
    mockDockerClient = DockerClient.getInstance() as ReturnType<typeof vi.mocked<DockerClient>>;
  });

  afterEach(async () => {
    await provider.cleanup();
  });

  describe('provider basics', () => {
    it('should have name "docker"', () => {
      expect(provider.name).toBe('docker');
    });

    it('should check Docker availability', async () => {
      mockDockerClient.isAvailable.mockResolvedValue(true);

      const available = await provider.isAvailable();

      expect(available).toBe(true);
      expect(mockDockerClient.isAvailable).toHaveBeenCalled();
    });

    it('should return false when Docker is not available', async () => {
      mockDockerClient.isAvailable.mockResolvedValue(false);

      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('createSandbox', () => {
    beforeEach(() => {
      mockDockerClient.isAvailable.mockResolvedValue(true);
      mockDockerClient.pullImage.mockResolvedValue(undefined);
      mockDockerClient.createContainer.mockResolvedValue({
        id: 'container-123',
        start: vi.fn(),
      });
      mockDockerClient.startContainer.mockResolvedValue(undefined);
    });

    it('should create sandbox with container', async () => {
      const sandbox = await provider.createSandbox({
        workspacePath: '/tmp/workspace',
      });

      expect(sandbox).toBeDefined();
      expect(sandbox.id).toMatch(/^docker-/);
      expect(sandbox.status).toBe('running');
      expect(sandbox.containerId).toBe('container-123');
    });

    it('should pull image before creating container', async () => {
      await provider.createSandbox({
        workspacePath: '/tmp/workspace',
        image: 'custom-image:latest',
      });

      expect(mockDockerClient.pullImage).toHaveBeenCalledWith('custom-image:latest');
    });

    it('should start container after creation', async () => {
      await provider.createSandbox({
        workspacePath: '/tmp/workspace',
      });

      expect(mockDockerClient.startContainer).toHaveBeenCalledWith('container-123');
    });

    it('should register sandbox in provider', async () => {
      const sandbox = await provider.createSandbox({
        workspacePath: '/tmp/workspace',
      });

      const sandboxes = await provider.listSandboxes();
      expect(sandboxes).toHaveLength(1);
      expect(sandboxes[0]?.id).toBe(sandbox.id);
    });
  });

  describe('sandbox execute', () => {
    let sandbox: Awaited<ReturnType<typeof provider.createSandbox>>;

    beforeEach(async () => {
      mockDockerClient.isAvailable.mockResolvedValue(true);
      mockDockerClient.pullImage.mockResolvedValue(undefined);
      mockDockerClient.createContainer.mockResolvedValue({
        id: 'container-123',
        start: vi.fn(),
      });
      mockDockerClient.startContainer.mockResolvedValue(undefined);

      sandbox = await provider.createSandbox({
        workspacePath: '/tmp/workspace',
      });
    });

    it('should execute command in container', async () => {
      mockDockerClient.execInContainer.mockResolvedValue({
        exitCode: 0,
        stdout: 'hello world',
        stderr: '',
      });

      const result = await sandbox.execute('echo', ['hello world']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello world');
      expect(result.stderr).toBe('');
      expect(result.timedOut).toBe(false);
    });

    it('should capture stderr', async () => {
      mockDockerClient.execInContainer.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'error message',
      });

      const result = await sandbox.execute('failing-command', []);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('error message');
    });

    it('should handle timeout', async () => {
      mockDockerClient.execInContainer.mockRejectedValue(
        new Error('Exec timed out after 1000ms')
      );

      const result = await sandbox.execute('sleep', ['60'], {
        timeout: 1,
      });

      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(124);
    });

    it('should throw if sandbox is destroyed', async () => {
      await sandbox.destroy();

      await expect(sandbox.execute('echo', ['test'])).rejects.toThrow(
        'Sandbox is not running'
      );
    });
  });

  describe('sandbox file operations', () => {
    let sandbox: Awaited<ReturnType<typeof provider.createSandbox>>;

    beforeEach(async () => {
      mockDockerClient.isAvailable.mockResolvedValue(true);
      mockDockerClient.pullImage.mockResolvedValue(undefined);
      mockDockerClient.createContainer.mockResolvedValue({
        id: 'container-123',
        start: vi.fn(),
      });
      mockDockerClient.startContainer.mockResolvedValue(undefined);

      sandbox = await provider.createSandbox({
        workspacePath: '/tmp/workspace',
      });
    });

    it('should write file via container exec', async () => {
      mockDockerClient.execInContainer.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      await sandbox.writeFile('test.txt', 'file content');

      // Should call mkdir and then write
      expect(mockDockerClient.execInContainer).toHaveBeenCalled();
    });

    it('should read file via container exec', async () => {
      mockDockerClient.execInContainer.mockResolvedValue({
        exitCode: 0,
        stdout: 'file content',
        stderr: '',
      });

      const content = await sandbox.readFile('test.txt');

      expect(content).toBe('file content');
    });

    it('should list files via container exec', async () => {
      mockDockerClient.execInContainer.mockResolvedValue({
        exitCode: 0,
        stdout: 'file1.txt\nfile2.txt\n',
        stderr: '',
      });

      const files = await sandbox.listFiles('.');

      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
    });

    it('should block path traversal in writeFile', async () => {
      await expect(
        sandbox.writeFile('../escape.txt', 'malicious')
      ).rejects.toThrow('Path traversal detected');
    });

    it('should block path traversal in readFile', async () => {
      await expect(sandbox.readFile('../../../etc/passwd')).rejects.toThrow(
        'Path traversal detected'
      );
    });

    it('should block path traversal in listFiles', async () => {
      await expect(sandbox.listFiles('../..')).rejects.toThrow(
        'Path traversal detected'
      );
    });
  });

  describe('sandbox destroy', () => {
    let sandbox: Awaited<ReturnType<typeof provider.createSandbox>>;

    beforeEach(async () => {
      mockDockerClient.isAvailable.mockResolvedValue(true);
      mockDockerClient.pullImage.mockResolvedValue(undefined);
      mockDockerClient.createContainer.mockResolvedValue({
        id: 'container-123',
        start: vi.fn(),
      });
      mockDockerClient.startContainer.mockResolvedValue(undefined);
      mockDockerClient.stopContainer.mockResolvedValue(undefined);
      mockDockerClient.removeContainer.mockResolvedValue(undefined);

      sandbox = await provider.createSandbox({
        workspacePath: '/tmp/workspace',
      });
    });

    it('should stop and remove container', async () => {
      await sandbox.destroy();

      expect(mockDockerClient.stopContainer).toHaveBeenCalledWith('container-123', 5);
      expect(mockDockerClient.removeContainer).toHaveBeenCalledWith('container-123', true);
    });

    it('should set status to destroyed', async () => {
      expect(sandbox.status).toBe('running');

      await sandbox.destroy();

      expect(sandbox.status).toBe('destroyed');
    });

    it('should unregister from provider', async () => {
      const sandboxId = sandbox.id;
      await sandbox.destroy();

      const sandboxes = await provider.listSandboxes();
      expect(sandboxes.find((s) => s.id === sandboxId)).toBeUndefined();
    });

    it('should be idempotent', async () => {
      await sandbox.destroy();
      await sandbox.destroy();

      // Only called once
      expect(mockDockerClient.stopContainer).toHaveBeenCalledTimes(1);
    });
  });

  describe('sandbox getStats', () => {
    let sandbox: Awaited<ReturnType<typeof provider.createSandbox>>;

    beforeEach(async () => {
      mockDockerClient.isAvailable.mockResolvedValue(true);
      mockDockerClient.pullImage.mockResolvedValue(undefined);
      mockDockerClient.createContainer.mockResolvedValue({
        id: 'container-123',
        start: vi.fn(),
      });
      mockDockerClient.startContainer.mockResolvedValue(undefined);

      sandbox = await provider.createSandbox({
        workspacePath: '/tmp/workspace',
      });
    });

    it('should return container stats', async () => {
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 25.5,
        memoryBytes: 512 * 1024 * 1024,
        memoryLimitBytes: 2048 * 1024 * 1024,
        networkRxBytes: 1000,
        networkTxBytes: 2000,
      });

      const stats = await sandbox.getStats();

      expect(stats.cpuPercent).toBe(25.5);
      expect(stats.memoryBytes).toBe(512 * 1024 * 1024);
    });

    it('should return empty stats on error', async () => {
      mockDockerClient.getContainerStats.mockRejectedValue(new Error('Container not found'));

      const stats = await sandbox.getStats();

      expect(stats).toEqual({});
    });
  });

  describe('cleanup', () => {
    it('should destroy all sandboxes', async () => {
      mockDockerClient.isAvailable.mockResolvedValue(true);
      mockDockerClient.pullImage.mockResolvedValue(undefined);
      mockDockerClient.createContainer.mockResolvedValue({
        id: 'container-123',
        start: vi.fn(),
      });
      mockDockerClient.startContainer.mockResolvedValue(undefined);
      mockDockerClient.stopContainer.mockResolvedValue(undefined);
      mockDockerClient.removeContainer.mockResolvedValue(undefined);
      mockDockerClient.listContainersByLabel.mockResolvedValue([]);

      const sandbox1 = await provider.createSandbox({
        workspacePath: '/tmp/workspace1',
      });
      const sandbox2 = await provider.createSandbox({
        workspacePath: '/tmp/workspace2',
      });

      expect(await provider.listSandboxes()).toHaveLength(2);

      await provider.cleanup();

      expect(await provider.listSandboxes()).toHaveLength(0);
      expect(sandbox1.status).toBe('destroyed');
      expect(sandbox2.status).toBe('destroyed');
    });

    it('should remove orphaned containers', async () => {
      mockDockerClient.listContainersByLabel.mockResolvedValue([
        { Id: 'orphan-1', Names: ['/agentgate-sandbox-old'], State: 'running' },
      ]);
      mockDockerClient.stopContainer.mockResolvedValue(undefined);
      mockDockerClient.removeContainer.mockResolvedValue(undefined);

      await provider.cleanup();

      expect(mockDockerClient.listContainersByLabel).toHaveBeenCalled();
      expect(mockDockerClient.stopContainer).toHaveBeenCalledWith('orphan-1', 5);
      expect(mockDockerClient.removeContainer).toHaveBeenCalledWith('orphan-1', true);
    });
  });
});
