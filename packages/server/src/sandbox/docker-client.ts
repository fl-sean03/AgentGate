/**
 * Docker Client Wrapper
 *
 * Provides a wrapper around dockerode for Docker daemon interaction.
 * Implements singleton pattern and handles connection management.
 */

import Docker from 'dockerode';
import type { Container, ContainerCreateOptions, ContainerInfo } from 'dockerode';
import { createLogger } from '../utils/logger.js';
import type { ExecResult, SandboxStats } from './types.js';

const logger = createLogger('sandbox:docker-client');

/**
 * Minimum Docker version required
 */
const MIN_DOCKER_VERSION = '20.10';

/**
 * Label used to identify AgentGate containers
 */
export const AGENTGATE_CONTAINER_LABEL = 'agentgate.sandbox';

/**
 * Container stats from Docker API
 */
export interface ContainerStats {
  cpuPercent: number;
  memoryBytes: number;
  memoryLimit: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

/**
 * Options for exec operations
 */
export interface ExecOptions {
  cmd: string[];
  env?: string[];
  workingDir?: string;
  timeout?: number;
}

/**
 * Docker Client class providing Docker daemon interaction.
 * Uses singleton pattern for connection reuse.
 */
export class DockerClient {
  private docker: Docker;
  private static instance: DockerClient | null = null;

  /**
   * Create a DockerClient instance.
   * @param socketPath - Docker socket path (default: /var/run/docker.sock)
   */
  constructor(socketPath?: string) {
    this.docker = new Docker({
      socketPath: socketPath ?? '/var/run/docker.sock',
    });
  }

  /**
   * Get singleton instance of DockerClient.
   */
  static getInstance(): DockerClient {
    if (!DockerClient.instance) {
      DockerClient.instance = new DockerClient();
    }
    return DockerClient.instance;
  }

  /**
   * Reset singleton (for testing).
   */
  static resetInstance(): void {
    DockerClient.instance = null;
  }

  /**
   * Check if Docker daemon is available and meets version requirements.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const version = await this.docker.version();
      const dockerVersion = version.Version;

      if (!dockerVersion) {
        logger.warn('Could not determine Docker version');
        return false;
      }

      // Parse version and compare
      const versionParts = dockerVersion.split('.').map(Number);
      const reqParts = MIN_DOCKER_VERSION.split('.').map(Number);
      const major = versionParts[0] ?? 0;
      const minor = versionParts[1] ?? 0;
      const reqMajor = reqParts[0] ?? 0;
      const reqMinor = reqParts[1] ?? 0;

      if (major < reqMajor || (major === reqMajor && minor < reqMinor)) {
        logger.warn(
          { version: dockerVersion, required: MIN_DOCKER_VERSION },
          'Docker version too old'
        );
        return false;
      }

      logger.debug({ version: dockerVersion }, 'Docker daemon available');
      return true;
    } catch (error) {
      logger.debug({ err: error }, 'Docker daemon not available');
      return false;
    }
  }

  /**
   * Ping Docker daemon to check connectivity.
   */
  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get Docker version information.
   */
  async getVersion(): Promise<{ version: string; apiVersion: string } | null> {
    try {
      const version = await this.docker.version();
      return {
        version: version.Version ?? 'unknown',
        apiVersion: version.ApiVersion ?? 'unknown',
      };
    } catch {
      return null;
    }
  }

  /**
   * Pull an image from registry if not already present.
   * @param image - Image name with tag (e.g., 'agentgate/agent:latest')
   */
  async pullImage(image: string): Promise<void> {
    try {
      // Check if image exists locally
      const images = await this.docker.listImages({
        filters: { reference: [image] },
      });

      if (images.length > 0) {
        logger.debug({ image }, 'Image already exists locally');
        return;
      }

      // Pull the image
      logger.info({ image }, 'Pulling Docker image');
      const stream = await this.docker.pull(image);

      // Wait for pull to complete
      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(
          stream,
          (err: Error | null) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          },
          (event: { status?: string; progress?: string }) => {
            // Log progress occasionally
            if (event.status === 'Downloading' || event.status === 'Extracting') {
              logger.debug({ image, status: event.status, progress: event.progress }, 'Pull progress');
            }
          }
        );
      });

      logger.info({ image }, 'Image pulled successfully');
    } catch (error) {
      logger.error({ image, err: error }, 'Failed to pull image');
      throw error;
    }
  }

  /**
   * Create a container with the specified options.
   */
  async createContainer(options: ContainerCreateOptions): Promise<Container> {
    try {
      const container = await this.docker.createContainer(options);
      logger.debug({ containerId: container.id }, 'Container created');
      return container;
    } catch (error) {
      logger.error({ err: error, options }, 'Failed to create container');
      throw error;
    }
  }

  /**
   * Start a container.
   */
  async startContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.start();
      logger.debug({ containerId }, 'Container started');
    } catch (error) {
      logger.error({ containerId, err: error }, 'Failed to start container');
      throw error;
    }
  }

  /**
   * Stop a container with optional timeout.
   */
  async stopContainer(containerId: string, timeout = 10): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: timeout });
      logger.debug({ containerId }, 'Container stopped');
    } catch (error) {
      // Container might already be stopped
      const err = error as { statusCode?: number };
      if (err.statusCode === 304) {
        logger.debug({ containerId }, 'Container already stopped');
        return;
      }
      logger.error({ containerId, err: error }, 'Failed to stop container');
      throw error;
    }
  }

  /**
   * Remove a container.
   */
  async removeContainer(containerId: string, force = false): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ force });
      logger.debug({ containerId }, 'Container removed');
    } catch (error) {
      const err = error as { statusCode?: number };
      if (err.statusCode === 404) {
        logger.debug({ containerId }, 'Container not found (already removed)');
        return;
      }
      logger.error({ containerId, err: error }, 'Failed to remove container');
      throw error;
    }
  }

  /**
   * Execute a command in a container.
   */
  async execInContainer(
    containerId: string,
    options: ExecOptions
  ): Promise<ExecResult> {
    const startTime = Date.now();
    let timedOut = false;

    try {
      const container = this.docker.getContainer(containerId);

      // Create exec instance
      const exec = await container.exec({
        Cmd: options.cmd,
        AttachStdout: true,
        AttachStderr: true,
        Env: options.env,
        WorkingDir: options.workingDir,
      });

      // Start exec and attach to streams
      const stream = await exec.start({ hijack: true, stdin: false });

      // Collect output with demultiplexing
      const output = await new Promise<{ stdout: string; stderr: string }>(
        (resolve, reject) => {
          let stdout = '';
          let stderr = '';
          let timeoutId: NodeJS.Timeout | undefined;

          if (options.timeout && options.timeout > 0) {
            timeoutId = setTimeout(() => {
              timedOut = true;
              stream.destroy();
            }, options.timeout * 1000);
          }

          // Docker streams are multiplexed - demux them
          const chunks: { type: 'stdout' | 'stderr'; data: Buffer }[] = [];

          // Read the multiplexed stream
          stream.on('data', (chunk: Buffer) => {
            // Docker stream format: [type(1), 0, 0, 0, size(4), payload]
            let offset = 0;
            while (offset < chunk.length) {
              if (offset + 8 > chunk.length) break;

              const type = chunk[offset];
              const size = chunk.readUInt32BE(offset + 4);

              if (offset + 8 + size > chunk.length) break;

              const data = chunk.subarray(offset + 8, offset + 8 + size);
              chunks.push({
                type: type === 1 ? 'stdout' : 'stderr',
                data,
              });
              offset += 8 + size;
            }
          });

          stream.on('end', () => {
            if (timeoutId) clearTimeout(timeoutId);
            for (const chunk of chunks) {
              if (chunk.type === 'stdout') {
                stdout += chunk.data.toString();
              } else {
                stderr += chunk.data.toString();
              }
            }
            resolve({ stdout, stderr });
          });

          stream.on('error', (err: Error) => {
            if (timeoutId) clearTimeout(timeoutId);
            if (timedOut) {
              resolve({ stdout, stderr });
            } else {
              reject(err);
            }
          });
        }
      );

      // Get exit code
      const inspectResult = await exec.inspect();
      const exitCode = inspectResult.ExitCode ?? -1;

      return {
        exitCode,
        stdout: output.stdout,
        stderr: output.stderr,
        timedOut,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error({ containerId, err: error, cmd: options.cmd }, 'Exec failed');

      return {
        exitCode: -1,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        timedOut,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Get container stats.
   */
  async getContainerStats(containerId: string): Promise<SandboxStats> {
    try {
      const container = this.docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });

      // Calculate CPU percentage
      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage -
        stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta =
        stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuCount = stats.cpu_stats.online_cpus || 1;
      const cpuPercent =
        systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

      // Memory stats
      const memoryBytes = stats.memory_stats.usage || 0;

      // Network stats
      let networkRxBytes = 0;
      let networkTxBytes = 0;
      if (stats.networks) {
        for (const net of Object.values(stats.networks)) {
          const network = net as { rx_bytes?: number; tx_bytes?: number };
          networkRxBytes += network.rx_bytes ?? 0;
          networkTxBytes += network.tx_bytes ?? 0;
        }
      }

      return {
        cpuPercent,
        memoryBytes,
        networkRxBytes,
        networkTxBytes,
      };
    } catch (error) {
      logger.debug({ containerId, err: error }, 'Failed to get container stats');
      return {};
    }
  }

  /**
   * List containers with AgentGate label.
   */
  async listAgentGateContainers(): Promise<ContainerInfo[]> {
    try {
      return await this.docker.listContainers({
        all: true,
        filters: {
          label: [AGENTGATE_CONTAINER_LABEL],
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to list containers');
      return [];
    }
  }

  /**
   * Check if a container exists.
   */
  async containerExists(containerId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.inspect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get container state.
   */
  async getContainerState(containerId: string): Promise<string | null> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      return info.State?.Status ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Kill a container.
   */
  async killContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.kill();
      logger.debug({ containerId }, 'Container killed');
    } catch (error) {
      const err = error as { statusCode?: number };
      if (err.statusCode === 404 || err.statusCode === 409) {
        // Container not found or not running
        return;
      }
      logger.error({ containerId, err: error }, 'Failed to kill container');
      throw error;
    }
  }
}
