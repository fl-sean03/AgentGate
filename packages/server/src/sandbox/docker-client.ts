/**
 * Docker Client
 *
 * Singleton wrapper around dockerode for Docker daemon communication.
 * Provides connection management, health checks, and container operations.
 */

import Docker from 'dockerode';
import type { Container, ContainerCreateOptions, Exec } from 'dockerode';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('sandbox:docker-client');

/**
 * Result of executing a command in a container.
 */
export interface ContainerExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Container resource statistics.
 */
export interface ContainerStats {
  cpuPercent: number;
  memoryBytes: number;
  memoryLimitBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

/**
 * Docker version information.
 */
export interface DockerVersionInfo {
  version: string;
  apiVersion: string;
  minApiVersion: string;
  os: string;
  arch: string;
}

/**
 * Minimum required Docker API version.
 */
const MIN_API_VERSION = '1.40'; // Docker 19.03+

/**
 * Docker client singleton for container operations.
 */
export class DockerClient {
  private static instance: DockerClient | null = null;

  private readonly docker: Docker;
  private available: boolean | null = null;
  private versionInfo: DockerVersionInfo | null = null;

  private constructor(socketPath?: string) {
    this.docker = new Docker({
      socketPath: socketPath ?? '/var/run/docker.sock',
    });
  }

  /**
   * Get the singleton Docker client instance.
   */
  static getInstance(socketPath?: string): DockerClient {
    if (!DockerClient.instance) {
      DockerClient.instance = new DockerClient(socketPath);
    }
    return DockerClient.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance(): void {
    DockerClient.instance = null;
  }

  /**
   * Check if Docker daemon is available and meets version requirements.
   */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) {
      return this.available;
    }

    try {
      // Ping Docker daemon
      await this.docker.ping();

      // Get version info
      const info = await this.docker.version();
      this.versionInfo = {
        version: info.Version ?? 'unknown',
        apiVersion: info.ApiVersion ?? 'unknown',
        minApiVersion: info.MinAPIVersion ?? 'unknown',
        os: info.Os ?? 'unknown',
        arch: info.Arch ?? 'unknown',
      };

      // Check API version
      const apiVersion = parseFloat(this.versionInfo.apiVersion);
      const minRequired = parseFloat(MIN_API_VERSION);

      if (apiVersion < minRequired) {
        logger.warn(
          {
            apiVersion: this.versionInfo.apiVersion,
            required: MIN_API_VERSION,
          },
          'Docker API version too old'
        );
        this.available = false;
        return false;
      }

      logger.info(
        {
          version: this.versionInfo.version,
          apiVersion: this.versionInfo.apiVersion,
          os: this.versionInfo.os,
          arch: this.versionInfo.arch,
        },
        'Docker daemon available'
      );

      this.available = true;
      return true;
    } catch (error) {
      logger.debug({ err: error }, 'Docker daemon not available');
      this.available = false;
      return false;
    }
  }

  /**
   * Get Docker version information.
   */
  getVersionInfo(): DockerVersionInfo | null {
    return this.versionInfo;
  }

  /**
   * Pull a Docker image if not present locally.
   */
  async pullImage(image: string): Promise<void> {
    try {
      // Check if image exists locally
      const images = await this.docker.listImages({
        filters: { reference: [image] },
      });

      if (images.length > 0) {
        logger.debug({ image }, 'Image already present');
        return;
      }

      logger.info({ image }, 'Pulling image');

      // Pull image
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
            logger.debug({ image, status: event.status }, 'Pull progress');
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
   * Create a new container.
   */
  async createContainer(options: ContainerCreateOptions): Promise<Container> {
    try {
      const container = await this.docker.createContainer(options);
      logger.debug(
        { containerId: container.id, image: options.Image },
        'Container created'
      );
      return container;
    } catch (error) {
      logger.error({ err: error, image: options.Image }, 'Failed to create container');
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
   * Execute a command inside a running container.
   */
  async execInContainer(
    containerId: string,
    cmd: string[],
    options: {
      env?: string[];
      workingDir?: string;
      timeout?: number;
    } = {}
  ): Promise<ContainerExecResult> {
    const container = this.docker.getContainer(containerId);

    // Create exec instance
    const exec: Exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      Env: options.env,
      WorkingDir: options.workingDir,
    });

    // Start exec and attach streams
    const stream = await exec.start({ hijack: true, stdin: false });

    // Collect output
    let stdout = '';
    let stderr = '';

    return new Promise<ContainerExecResult>((resolve, reject) => {
      // Set up timeout if specified
      let timeoutId: NodeJS.Timeout | undefined;
      if (options.timeout) {
        timeoutId = setTimeout(() => {
          stream.destroy();
          reject(new Error(`Exec timed out after ${options.timeout}ms`));
        }, options.timeout);
      }

      // Demultiplex stdout/stderr from Docker stream
      // Docker streams have a header: [type, 0, 0, 0, size1, size2, size3, size4]
      const demux = (data: Buffer): void => {
        let offset = 0;
        while (offset < data.length) {
          if (offset + 8 > data.length) break;

          const type = data[offset];
          const size =
            (data[offset + 4]! << 24) |
            (data[offset + 5]! << 16) |
            (data[offset + 6]! << 8) |
            data[offset + 7]!;

          if (offset + 8 + size > data.length) break;

          const payload = data.subarray(offset + 8, offset + 8 + size).toString();

          if (type === 1) {
            stdout += payload;
          } else if (type === 2) {
            stderr += payload;
          }

          offset += 8 + size;
        }
      };

      stream.on('data', demux);

      stream.on('end', () => {
        if (timeoutId) clearTimeout(timeoutId);

        // Get exit code
        exec.inspect()
          .then((inspectResult) => {
            const exitCode = inspectResult.ExitCode ?? -1;
            resolve({ exitCode, stdout, stderr });
          })
          .catch((error: unknown) => {
            reject(error);
          });
      });

      stream.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Stop a container.
   */
  async stopContainer(containerId: string, timeout = 10): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: timeout });
      logger.debug({ containerId }, 'Container stopped');
    } catch (error) {
      // Ignore if already stopped
      if ((error as { statusCode?: number }).statusCode === 304) {
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
      await container.remove({ force, v: true });
      logger.debug({ containerId, force }, 'Container removed');
    } catch (error) {
      // Ignore if already removed
      if ((error as { statusCode?: number }).statusCode === 404) {
        logger.debug({ containerId }, 'Container already removed');
        return;
      }
      logger.error({ containerId, err: error }, 'Failed to remove container');
      throw error;
    }
  }

  /**
   * Get container statistics.
   */
  async getContainerStats(containerId: string): Promise<ContainerStats> {
    try {
      const container = this.docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });

      // Calculate CPU percentage
      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage -
        stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta =
        stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const numCpus = stats.cpu_stats.online_cpus ?? 1;
      const cpuPercent =
        systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

      // Memory stats
      const memoryBytes = stats.memory_stats.usage ?? 0;
      const memoryLimitBytes = stats.memory_stats.limit ?? 0;

      // Network stats (sum all interfaces)
      let networkRxBytes = 0;
      let networkTxBytes = 0;
      if (stats.networks) {
        for (const net of Object.values(stats.networks)) {
          networkRxBytes += (net as { rx_bytes?: number }).rx_bytes ?? 0;
          networkTxBytes += (net as { tx_bytes?: number }).tx_bytes ?? 0;
        }
      }

      return {
        cpuPercent,
        memoryBytes,
        memoryLimitBytes,
        networkRxBytes,
        networkTxBytes,
      };
    } catch (error) {
      logger.error({ containerId, err: error }, 'Failed to get container stats');
      throw error;
    }
  }

  /**
   * List containers with a specific label.
   */
  async listContainersByLabel(
    label: string,
    value?: string
  ): Promise<Docker.ContainerInfo[]> {
    const filter = value ? `${label}=${value}` : label;
    return this.docker.listContainers({
      all: true,
      filters: { label: [filter] },
    });
  }

  /**
   * Inspect a container.
   */
  async inspectContainer(containerId: string): Promise<Docker.ContainerInspectInfo> {
    const container = this.docker.getContainer(containerId);
    return container.inspect();
  }

  /**
   * Check if a container is running.
   */
  async isContainerRunning(containerId: string): Promise<boolean> {
    try {
      const info = await this.inspectContainer(containerId);
      return info.State.Running;
    } catch {
      return false;
    }
  }
}

/**
 * Get the singleton Docker client instance.
 */
export function getDockerClient(socketPath?: string): DockerClient {
  return DockerClient.getInstance(socketPath);
}
