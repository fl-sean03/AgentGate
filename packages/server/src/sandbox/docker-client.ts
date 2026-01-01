/**
 * Docker Client Wrapper
 *
 * Provides a singleton Docker client with connection management
 * and utility methods for container operations.
 */

import Docker from 'dockerode';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('sandbox:docker-client');

/**
 * Container creation options passed to Docker API.
 */
export interface ContainerCreateOptions {
  name?: string;
  Image: string;
  Cmd?: string[];
  Entrypoint?: string[];
  WorkingDir?: string;
  User?: string;
  Env?: string[];
  Labels?: Record<string, string>;
  HostConfig?: {
    Binds?: string[];
    NetworkMode?: string;
    Memory?: number;
    NanoCpus?: number;
    PidsLimit?: number;
    ReadonlyRootfs?: boolean;
    SecurityOpt?: string[];
    CapDrop?: string[];
    Tmpfs?: Record<string, string>;
  };
}

/**
 * Result of executing a command in a container.
 */
export interface ContainerExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Container resource usage statistics.
 */
export interface ContainerStats {
  cpuPercent: number;
  memoryBytes: number;
  memoryLimit: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

/**
 * Minimum required Docker version (20.10.x).
 */
const MIN_DOCKER_VERSION = '20.10.0';

/**
 * Parse Docker version string to comparable format.
 */
function parseVersion(version: string): number[] {
  return version.split('.').map((n) => parseInt(n, 10) || 0);
}

/**
 * Compare two version arrays.
 * Returns true if a >= b.
 */
function versionGte(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

/**
 * Docker client singleton.
 * Manages connection to Docker daemon and provides container operations.
 */
export class DockerClient {
  private static instance: DockerClient | null = null;

  private readonly docker: Docker;
  private availabilityChecked = false;
  private isAvailableCache = false;
  private dockerVersion: string | null = null;

  private constructor(socketPath?: string) {
    this.docker = new Docker({
      socketPath: socketPath ?? '/var/run/docker.sock',
    });
  }

  /**
   * Get the singleton DockerClient instance.
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
   * Get the underlying dockerode instance for advanced operations.
   */
  getDocker(): Docker {
    return this.docker;
  }

  /**
   * Check if Docker daemon is available and meets minimum version.
   */
  async isAvailable(): Promise<boolean> {
    if (this.availabilityChecked) {
      return this.isAvailableCache;
    }

    try {
      // Ping Docker daemon
      await this.docker.ping();

      // Check version
      const info = await this.docker.version();
      this.dockerVersion = info.Version;

      const currentVersion = parseVersion(info.Version);
      const minVersion = parseVersion(MIN_DOCKER_VERSION);

      if (!versionGte(currentVersion, minVersion)) {
        logger.warn(
          { version: info.Version, minimum: MIN_DOCKER_VERSION },
          'Docker version too old'
        );
        this.availabilityChecked = true;
        this.isAvailableCache = false;
        return false;
      }

      logger.info({ version: info.Version }, 'Docker daemon available');
      this.availabilityChecked = true;
      this.isAvailableCache = true;
      return true;
    } catch (error) {
      const err = error as Error;
      if (err.message?.includes('ENOENT')) {
        logger.debug('Docker socket not found');
      } else if (err.message?.includes('EACCES')) {
        logger.warn('Docker socket permission denied - add user to docker group');
      } else {
        logger.debug({ error: err.message }, 'Docker daemon not available');
      }

      this.availabilityChecked = true;
      this.isAvailableCache = false;
      return false;
    }
  }

  /**
   * Get Docker version (null if not available).
   */
  getVersion(): string | null {
    return this.dockerVersion;
  }

  /**
   * Pull a Docker image if not present locally.
   */
  async pullImage(image: string, onProgress?: (event: { status: string }) => void): Promise<void> {
    try {
      // Check if image exists locally
      const images = await this.docker.listImages({
        filters: JSON.stringify({ reference: [image] }),
      });

      if (images.length > 0) {
        logger.debug({ image }, 'Image already present locally');
        return;
      }

      // Pull image
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
          (event: { status: string }) => {
            if (onProgress) {
              onProgress(event);
            }
          }
        );
      });

      logger.info({ image }, 'Image pulled successfully');
    } catch (error) {
      const err = error as Error;
      logger.error({ image, error: err.message }, 'Failed to pull image');
      throw new Error(`Failed to pull image ${image}: ${err.message}`);
    }
  }

  /**
   * Create a new container with the given options.
   */
  async createContainer(options: ContainerCreateOptions): Promise<Docker.Container> {
    try {
      const container = await this.docker.createContainer(options);
      logger.debug({ containerId: container.id, image: options.Image }, 'Container created');
      return container;
    } catch (error) {
      const err = error as Error;
      logger.error({ error: err.message, image: options.Image }, 'Failed to create container');
      throw new Error(`Failed to create container: ${err.message}`);
    }
  }

  /**
   * Start a container by ID.
   */
  async startContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.start();
      logger.debug({ containerId }, 'Container started');
    } catch (error) {
      const err = error as Error;
      logger.error({ containerId, error: err.message }, 'Failed to start container');
      throw new Error(`Failed to start container: ${err.message}`);
    }
  }

  /**
   * Execute a command inside a running container.
   */
  async execInContainer(
    containerId: string,
    cmd: string[],
    options?: {
      env?: string[];
      workingDir?: string;
      timeout?: number;
    }
  ): Promise<ContainerExecResult> {
    const container = this.docker.getContainer(containerId);

    try {
      // Create exec instance
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        Env: options?.env,
        WorkingDir: options?.workingDir,
      });

      // Start exec and attach to streams
      const stream = await exec.start({ hijack: true, stdin: false });

      // Collect output
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      // Docker multiplexes stdout/stderr with a header
      // Header: 8 bytes - [type:1][0:3][size:4 big-endian]
      // type: 1 = stdout, 2 = stderr
      let buffer = Buffer.alloc(0);

      const demux = (): void => {
        while (buffer.length >= 8) {
          const type = buffer[0];
          const size = buffer.readUInt32BE(4);

          if (buffer.length < 8 + size) {
            break; // Need more data
          }

          const data = buffer.subarray(8, 8 + size);
          buffer = buffer.subarray(8 + size);

          if (type === 1) {
            stdout.push(data);
          } else if (type === 2) {
            stderr.push(data);
          }
        }
      };

      await new Promise<void>((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        if (options?.timeout) {
          timeoutId = setTimeout(() => {
            stream.destroy();
            reject(new Error('Execution timed out'));
          }, options.timeout * 1000);
        }

        stream.on('data', (data: Buffer) => {
          buffer = Buffer.concat([buffer, data]);
          demux();
        });

        stream.on('end', () => {
          if (timeoutId) clearTimeout(timeoutId);
          demux(); // Process remaining buffer
          resolve();
        });

        stream.on('error', (err: Error) => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(err);
        });
      });

      // Get exit code
      const inspectResult = await exec.inspect();
      const exitCode = inspectResult.ExitCode ?? 1;

      return {
        exitCode,
        stdout: Buffer.concat(stdout).toString('utf-8'),
        stderr: Buffer.concat(stderr).toString('utf-8'),
      };
    } catch (error) {
      const err = error as Error;
      logger.error({ containerId, cmd, error: err.message }, 'Container exec failed');
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
      const err = error as Error;
      // Ignore "container already stopped" errors
      if (!err.message?.includes('container already stopped')) {
        logger.error({ containerId, error: err.message }, 'Failed to stop container');
        throw error;
      }
    }
  }

  /**
   * Remove a container.
   */
  async removeContainer(containerId: string, force = true): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ force });
      logger.debug({ containerId }, 'Container removed');
    } catch (error) {
      const err = error as Error;
      // Ignore "no such container" errors
      if (!err.message?.includes('no such container')) {
        logger.error({ containerId, error: err.message }, 'Failed to remove container');
        throw error;
      }
    }
  }

  /**
   * Get resource usage statistics for a container.
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
      const numCpus = stats.cpu_stats.online_cpus || 1;
      const cpuPercent =
        systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

      // Memory usage
      const memoryBytes = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 0;

      // Network I/O
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
        memoryLimit,
        networkRxBytes,
        networkTxBytes,
      };
    } catch (error) {
      const err = error as Error;
      logger.debug({ containerId, error: err.message }, 'Failed to get container stats');
      return {
        cpuPercent: 0,
        memoryBytes: 0,
        memoryLimit: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
      };
    }
  }

  /**
   * List containers with AgentGate labels.
   */
  async listAgentGateContainers(): Promise<Docker.ContainerInfo[]> {
    try {
      return await this.docker.listContainers({
        all: true,
        filters: JSON.stringify({
          label: ['agentgate.sandbox=true'],
        }),
      });
    } catch (error) {
      const err = error as Error;
      logger.error({ error: err.message }, 'Failed to list containers');
      return [];
    }
  }

  /**
   * Remove orphaned AgentGate containers older than the specified age.
   */
  async cleanupOrphanedContainers(maxAgeSeconds: number): Promise<number> {
    const containers = await this.listAgentGateContainers();
    const now = Date.now();
    let cleaned = 0;

    for (const containerInfo of containers) {
      const createdAt = containerInfo.Created * 1000; // Docker uses seconds
      const ageSeconds = (now - createdAt) / 1000;

      if (ageSeconds > maxAgeSeconds) {
        logger.info(
          { containerId: containerInfo.Id, ageSeconds },
          'Removing orphaned container'
        );
        await this.removeContainer(containerInfo.Id, true);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Get the Docker client singleton.
 */
export function getDockerClient(socketPath?: string): DockerClient {
  return DockerClient.getInstance(socketPath);
}
