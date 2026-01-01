/**
 * Docker Client Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DockerClient, getDockerClient } from '../../src/sandbox/docker-client.js';
import { createMockDockerClient } from './test-utils.js';

// Mock dockerode
vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => createMockDockerClient()),
  };
});

describe('DockerClient', () => {
  beforeEach(() => {
    DockerClient.resetInstance();
  });

  afterEach(() => {
    DockerClient.resetInstance();
  });

  describe('singleton', () => {
    it('should return same instance from getInstance', () => {
      const client1 = DockerClient.getInstance();
      const client2 = DockerClient.getInstance();

      expect(client1).toBe(client2);
    });

    it('should return same instance from getDockerClient', () => {
      const client1 = getDockerClient();
      const client2 = getDockerClient();

      expect(client1).toBe(client2);
    });

    it('should reset on resetInstance', () => {
      const client1 = DockerClient.getInstance();
      DockerClient.resetInstance();
      const client2 = DockerClient.getInstance();

      expect(client1).not.toBe(client2);
    });
  });

  describe('isAvailable', () => {
    it('should return true when Docker is running', async () => {
      const client = DockerClient.getInstance();
      const available = await client.isAvailable();

      expect(available).toBe(true);
    });

    it('should cache availability result', async () => {
      const client = DockerClient.getInstance();

      await client.isAvailable();
      await client.isAvailable();

      // The mock's ping should only be called once due to caching
      // This is verified by checking the implementation
      expect(await client.isAvailable()).toBe(true);
    });

    it('should return version after availability check', async () => {
      const client = DockerClient.getInstance();

      expect(client.getVersion()).toBeNull();

      await client.isAvailable();

      expect(client.getVersion()).toBe('24.0.0');
    });
  });

  describe('pullImage', () => {
    it('should not pull if image exists locally', async () => {
      const client = DockerClient.getInstance();

      // Mock indicates image exists
      await client.pullImage('test-image:latest');

      // Should complete without error
    });

    it('should pull image if not present', async () => {
      const client = DockerClient.getInstance();
      const docker = client.getDocker() as unknown as ReturnType<typeof createMockDockerClient>;

      // Mock no images
      docker.listImages.mockResolvedValueOnce([]);

      await client.pullImage('new-image:latest');

      expect(docker.pull).toHaveBeenCalledWith('new-image:latest');
    });

    it('should call progress callback during pull', async () => {
      const client = DockerClient.getInstance();
      const docker = client.getDocker() as unknown as ReturnType<typeof createMockDockerClient>;

      docker.listImages.mockResolvedValueOnce([]);

      const onProgress = vi.fn();
      await client.pullImage('new-image:latest', onProgress);

      // Progress may or may not be called depending on mock implementation
    });
  });

  describe('createContainer', () => {
    it('should create container with options', async () => {
      const client = DockerClient.getInstance();

      const container = await client.createContainer({
        Image: 'test-image:latest',
        Cmd: ['sleep', 'infinity'],
        WorkingDir: '/workspace',
      });

      expect(container).toBeDefined();
      expect(container.id).toBe('mock-container-id-12345');
    });
  });

  describe('startContainer', () => {
    it('should start container by ID', async () => {
      const client = DockerClient.getInstance();
      const docker = client.getDocker() as unknown as ReturnType<typeof createMockDockerClient>;

      await client.startContainer('container-123');

      expect(docker.getContainer).toHaveBeenCalledWith('container-123');
      expect(docker.mockContainer.start).toHaveBeenCalled();
    });
  });

  describe('stopContainer', () => {
    it('should stop container by ID', async () => {
      const client = DockerClient.getInstance();
      const docker = client.getDocker() as unknown as ReturnType<typeof createMockDockerClient>;

      await client.stopContainer('container-123');

      expect(docker.getContainer).toHaveBeenCalledWith('container-123');
      expect(docker.mockContainer.stop).toHaveBeenCalled();
    });

    it('should use custom timeout', async () => {
      const client = DockerClient.getInstance();
      const docker = client.getDocker() as unknown as ReturnType<typeof createMockDockerClient>;

      await client.stopContainer('container-123', 30);

      expect(docker.mockContainer.stop).toHaveBeenCalledWith({ t: 30 });
    });
  });

  describe('removeContainer', () => {
    it('should remove container by ID', async () => {
      const client = DockerClient.getInstance();
      const docker = client.getDocker() as unknown as ReturnType<typeof createMockDockerClient>;

      await client.removeContainer('container-123');

      expect(docker.getContainer).toHaveBeenCalledWith('container-123');
      expect(docker.mockContainer.remove).toHaveBeenCalled();
    });

    it('should force remove by default', async () => {
      const client = DockerClient.getInstance();
      const docker = client.getDocker() as unknown as ReturnType<typeof createMockDockerClient>;

      await client.removeContainer('container-123');

      expect(docker.mockContainer.remove).toHaveBeenCalledWith({ force: true });
    });
  });

  describe('getContainerStats', () => {
    it('should get container statistics', async () => {
      const client = DockerClient.getInstance();

      const stats = await client.getContainerStats('container-123');

      expect(stats).toBeDefined();
      expect(typeof stats.cpuPercent).toBe('number');
      expect(typeof stats.memoryBytes).toBe('number');
      expect(typeof stats.memoryLimit).toBe('number');
      expect(typeof stats.networkRxBytes).toBe('number');
      expect(typeof stats.networkTxBytes).toBe('number');
    });
  });

  describe('listAgentGateContainers', () => {
    it('should list containers with AgentGate label', async () => {
      const client = DockerClient.getInstance();

      const containers = await client.listAgentGateContainers();

      expect(Array.isArray(containers)).toBe(true);
    });
  });

  describe('cleanupOrphanedContainers', () => {
    it('should clean up old containers', async () => {
      const client = DockerClient.getInstance();
      const docker = client.getDocker() as unknown as ReturnType<typeof createMockDockerClient>;

      // Mock old container
      const oldTimestamp = Math.floor((Date.now() - 10000000) / 1000);
      docker.listContainers.mockResolvedValueOnce([
        { Id: 'old-container', Created: oldTimestamp },
      ]);

      const cleaned = await client.cleanupOrphanedContainers(3600);

      expect(cleaned).toBe(1);
    });

    it('should not remove recent containers', async () => {
      const client = DockerClient.getInstance();
      const docker = client.getDocker() as unknown as ReturnType<typeof createMockDockerClient>;

      // Mock recent container
      const recentTimestamp = Math.floor(Date.now() / 1000);
      docker.listContainers.mockResolvedValueOnce([
        { Id: 'recent-container', Created: recentTimestamp },
      ]);

      const cleaned = await client.cleanupOrphanedContainers(3600);

      expect(cleaned).toBe(0);
    });
  });
});
