/**
 * Docker Sandbox Provider
 *
 * Container-based sandbox provider using Docker for process isolation.
 * Provides namespace and cgroup-based isolation for secure agent execution.
 */

import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { BaseSandboxProvider, DEFAULT_WORKSPACE_MOUNT } from './provider.js';
import { getDockerClient, type DockerClient, type ContainerStats } from './docker-client.js';
import type {
  Sandbox,
  SandboxConfig,
  SandboxStatus,
  SandboxStats,
  ExecOptions,
  ExecResult,
} from './types.js';

/**
 * Label used to identify AgentGate sandbox containers.
 */
const SANDBOX_LABEL = 'agentgate.sandbox';

/**
 * Default container image for agent execution.
 */
const DEFAULT_IMAGE = 'agentgate/agent:latest';

/**
 * Default container user.
 */
const DEFAULT_USER = 'agentgate';

/**
 * Generate a unique sandbox ID.
 */
function generateSandboxId(): string {
  return `docker-${randomBytes(8).toString('hex')}`;
}

/**
 * Validate that a path stays within the workspace directory.
 */
function validatePath(workspaceMount: string, relativePath: string): string {
  const normalizedMount = path.posix.resolve(workspaceMount);
  const fullPath = path.posix.resolve(workspaceMount, relativePath);

  if (!fullPath.startsWith(normalizedMount + '/') && fullPath !== normalizedMount) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }

  return fullPath;
}

/**
 * Docker container-based sandbox implementation.
 */
class DockerSandbox implements Sandbox {
  readonly id: string;
  status: SandboxStatus;
  containerId?: string;

  private readonly dockerClient: DockerClient;
  private readonly workspacePath: string;
  private readonly workspaceMount: string;
  private readonly env: Record<string, string>;
  private readonly defaultTimeout: number;
  private readonly onDestroy: (id: string) => void;

  constructor(
    id: string,
    containerId: string,
    dockerClient: DockerClient,
    workspacePath: string,
    workspaceMount: string,
    env: Record<string, string>,
    defaultTimeout: number,
    onDestroy: (id: string) => void
  ) {
    this.id = id;
    this.containerId = containerId;
    this.dockerClient = dockerClient;
    this.workspacePath = workspacePath;
    this.workspaceMount = workspaceMount;
    this.env = env;
    this.defaultTimeout = defaultTimeout;
    this.onDestroy = onDestroy;
    this.status = 'running';
  }

  async execute(
    command: string,
    args: string[],
    options?: ExecOptions
  ): Promise<ExecResult> {
    if (this.status !== 'running') {
      throw new Error(`Sandbox is not running (status: ${this.status})`);
    }

    if (!this.containerId) {
      throw new Error('Container ID not available');
    }

    const startTime = Date.now();
    const timeout = ((options?.timeout ?? this.defaultTimeout) * 1000);

    // Build working directory
    const cwd = options?.cwd
      ? validatePath(this.workspaceMount, options.cwd)
      : this.workspaceMount;

    // Build environment variables
    const envArray: string[] = [];
    for (const [key, value] of Object.entries(this.env)) {
      envArray.push(`${key}=${value}`);
    }
    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        envArray.push(`${key}=${value}`);
      }
    }

    // Build command
    const cmd = [command, ...args];

    try {
      const execOptions: {
        env?: string[];
        workingDir?: string;
        timeout?: number;
      } = {
        workingDir: cwd,
        timeout,
      };
      if (envArray.length > 0) {
        execOptions.env = envArray;
      }

      const result = await this.dockerClient.execInContainer(
        this.containerId,
        cmd,
        execOptions
      );

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: false,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const isTimeout = error instanceof Error && error.message.includes('timed out');

      return {
        exitCode: isTimeout ? 124 : 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        timedOut: isTimeout,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    if (this.status !== 'running') {
      throw new Error(`Sandbox is not running (status: ${this.status})`);
    }

    if (!this.containerId) {
      throw new Error('Container ID not available');
    }

    const fullPath = validatePath(this.workspaceMount, filePath);
    const dir = path.posix.dirname(fullPath);

    // Ensure parent directory exists
    await this.dockerClient.execInContainer(
      this.containerId,
      ['mkdir', '-p', dir],
      { workingDir: this.workspaceMount }
    );

    // Write file using heredoc via sh
    // Escape content for shell
    const escapedContent = content.replace(/'/g, "'\\''");
    await this.dockerClient.execInContainer(
      this.containerId,
      ['sh', '-c', `printf '%s' '${escapedContent}' > "${fullPath}"`],
      { workingDir: this.workspaceMount }
    );
  }

  async readFile(filePath: string): Promise<string> {
    if (this.status !== 'running') {
      throw new Error(`Sandbox is not running (status: ${this.status})`);
    }

    if (!this.containerId) {
      throw new Error('Container ID not available');
    }

    const fullPath = validatePath(this.workspaceMount, filePath);

    const result = await this.dockerClient.execInContainer(
      this.containerId,
      ['cat', fullPath],
      { workingDir: this.workspaceMount }
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }

    return result.stdout;
  }

  async listFiles(dirPath: string): Promise<string[]> {
    if (this.status !== 'running') {
      throw new Error(`Sandbox is not running (status: ${this.status})`);
    }

    if (!this.containerId) {
      throw new Error('Container ID not available');
    }

    const fullPath = validatePath(this.workspaceMount, dirPath);

    const result = await this.dockerClient.execInContainer(
      this.containerId,
      ['ls', '-1', fullPath],
      { workingDir: this.workspaceMount }
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to list files: ${result.stderr}`);
    }

    return result.stdout.trim().split('\n').filter(Boolean);
  }

  async destroy(): Promise<void> {
    if (this.status === 'destroyed') {
      return;
    }

    if (this.containerId) {
      try {
        // Stop and remove container
        await this.dockerClient.stopContainer(this.containerId, 5);
        await this.dockerClient.removeContainer(this.containerId, true);
      } catch (error) {
        // Log but don't throw - best effort cleanup
        // Error will be handled by caller
      }
    }

    this.status = 'destroyed';
    this.onDestroy(this.id);
  }

  async getStats(): Promise<SandboxStats> {
    if (this.status !== 'running' || !this.containerId) {
      return {};
    }

    try {
      const stats: ContainerStats = await this.dockerClient.getContainerStats(
        this.containerId
      );

      return {
        cpuPercent: stats.cpuPercent,
        memoryBytes: stats.memoryBytes,
        networkRxBytes: stats.networkRxBytes,
        networkTxBytes: stats.networkTxBytes,
      };
    } catch {
      return {};
    }
  }
}

/**
 * Docker-based sandbox provider.
 *
 * Creates sandboxes that execute commands in isolated Docker containers.
 * Requires Docker daemon to be running and accessible.
 */
export class DockerProvider extends BaseSandboxProvider {
  readonly name = 'docker';

  private readonly dockerClient: DockerClient;
  private imagePullPromise: Promise<void> | null = null;

  constructor(socketPath?: string) {
    super();
    this.dockerClient = getDockerClient(socketPath);
  }

  protected getProviderName(): string {
    return 'docker';
  }

  async isAvailable(): Promise<boolean> {
    return this.dockerClient.isAvailable();
  }

  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    const appliedConfig = this.applyDefaults(config);
    const image = appliedConfig.image ?? DEFAULT_IMAGE;
    const workspaceMount = appliedConfig.workspaceMount ?? DEFAULT_WORKSPACE_MOUNT;
    const user = appliedConfig.user ?? DEFAULT_USER;

    // Pull image if needed (singleton promise to avoid concurrent pulls)
    if (!this.imagePullPromise) {
      this.imagePullPromise = this.dockerClient.pullImage(image).catch((error) => {
        this.logger.warn({ image, err: error }, 'Failed to pull image, using local');
        this.imagePullPromise = null;
      });
    }
    await this.imagePullPromise;

    const id = generateSandboxId();
    const resourceLimits = appliedConfig.resourceLimits!;

    // Build container creation options
    const containerOptions = {
      name: `agentgate-sandbox-${id}`,
      Image: image,
      Cmd: ['sleep', 'infinity'], // Keep container running
      WorkingDir: workspaceMount,
      User: user,
      Env: this.buildEnvArray(appliedConfig.env ?? {}),
      Labels: {
        [SANDBOX_LABEL]: 'true',
        'agentgate.sandbox.id': id,
        'agentgate.sandbox.created': new Date().toISOString(),
      },
      HostConfig: {
        // Mount workspace
        Binds: [`${appliedConfig.workspacePath}:${workspaceMount}:rw`],
        // Network isolation
        NetworkMode: appliedConfig.networkMode ?? 'none',
        // Resource limits
        Memory: (resourceLimits.memoryMB ?? 2048) * 1024 * 1024,
        NanoCpus: (resourceLimits.cpuCount ?? 2) * 1e9,
        PidsLimit: 256,
        // Security hardening
        SecurityOpt: ['no-new-privileges'],
        CapDrop: ['ALL'],
        // Read-only root filesystem with writable /tmp and /home
        ReadonlyRootfs: true,
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=512m',
          '/home/agentgate': 'rw,noexec,nosuid,size=256m',
        },
      },
    };

    try {
      // Create container
      const container = await this.dockerClient.createContainer(containerOptions);
      const containerId = container.id;

      // Start container
      await this.dockerClient.startContainer(containerId);

      // Create sandbox instance
      const defaultTimeout = resourceLimits.timeoutSeconds ?? 300;
      const sandbox = new DockerSandbox(
        id,
        containerId,
        this.dockerClient,
        appliedConfig.workspacePath,
        workspaceMount,
        appliedConfig.env ?? {},
        defaultTimeout,
        (sandboxId) => this.unregisterSandbox(sandboxId)
      );

      this.registerSandbox(sandbox);
      this.logger.info(
        {
          sandboxId: id,
          containerId,
          workspacePath: appliedConfig.workspacePath,
          image,
          networkMode: appliedConfig.networkMode ?? 'none',
        },
        'Created Docker sandbox'
      );

      return sandbox;
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to create Docker sandbox');
      throw error;
    }
  }

  /**
   * Clean up orphaned containers (those with sandbox label but not tracked).
   */
  async cleanup(): Promise<void> {
    // First, clean up tracked sandboxes
    await super.cleanup();

    // Then, find and remove any orphaned containers
    try {
      const containers = await this.dockerClient.listContainersByLabel(SANDBOX_LABEL);

      for (const containerInfo of containers) {
        const containerId = containerInfo.Id;
        this.logger.info({ containerId }, 'Removing orphaned sandbox container');

        try {
          await this.dockerClient.stopContainer(containerId, 5);
          await this.dockerClient.removeContainer(containerId, true);
        } catch (error) {
          this.logger.error(
            { containerId, err: error },
            'Failed to remove orphaned container'
          );
        }
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to list orphaned containers');
    }
  }

  /**
   * Build environment variable array for container.
   */
  private buildEnvArray(env: Record<string, string>): string[] {
    const envArray: string[] = [
      'NODE_ENV=production',
      'HOME=/home/agentgate',
      'USER=agentgate',
      `WORKSPACE=${DEFAULT_WORKSPACE_MOUNT}`,
      'NO_COLOR=1',
      'FORCE_COLOR=0',
    ];

    for (const [key, value] of Object.entries(env)) {
      envArray.push(`${key}=${value}`);
    }

    return envArray;
  }
}
