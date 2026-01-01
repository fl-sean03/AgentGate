/**
 * Docker Sandbox Provider
 *
 * Provides Docker container-based isolation for agent execution.
 * Creates ephemeral containers with namespace and cgroup isolation.
 */

import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ContainerCreateOptions } from 'dockerode';
import { BaseSandboxProvider, DEFAULT_WORKSPACE_MOUNT } from './provider.js';
import { DockerClient, AGENTGATE_CONTAINER_LABEL } from './docker-client.js';
import type {
  Sandbox,
  SandboxConfig,
  SandboxStatus,
  SandboxStats,
  ExecOptions,
  ExecResult,
} from './types.js';

/**
 * Default Docker image for agent execution.
 */
export const DEFAULT_AGENT_IMAGE = 'agentgate/agent:latest';

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
 * Docker container-based sandbox implementation.
 */
class DockerSandbox implements Sandbox {
  readonly id: string;
  status: SandboxStatus;
  containerId: string;

  private readonly workspacePath: string;
  private readonly workspaceMount: string;
  private readonly client: DockerClient;
  private readonly onDestroy: (id: string) => void;

  constructor(
    id: string,
    containerId: string,
    workspacePath: string,
    workspaceMount: string,
    client: DockerClient,
    onDestroy: (id: string) => void
  ) {
    this.id = id;
    this.containerId = containerId;
    this.workspacePath = workspacePath;
    this.workspaceMount = workspaceMount;
    this.client = client;
    this.onDestroy = onDestroy;
    this.status = 'running';
  }

  /**
   * Validate that a path is within the workspace.
   */
  private validatePath(relativePath: string): string {
    const normalizedMount = path.resolve(this.workspaceMount);
    const fullPath = path.resolve(this.workspaceMount, relativePath);

    if (
      !fullPath.startsWith(normalizedMount + path.sep) &&
      fullPath !== normalizedMount
    ) {
      throw new Error(`Path traversal detected: ${relativePath}`);
    }

    return fullPath;
  }

  async execute(
    command: string,
    args: string[],
    options?: ExecOptions
  ): Promise<ExecResult> {
    if (this.status !== 'running') {
      throw new Error(`Sandbox is not running (status: ${this.status})`);
    }

    // Build working directory path
    let workingDir = this.workspaceMount;
    if (options?.cwd) {
      workingDir = this.validatePath(options.cwd);
    }

    // Build environment variables
    const envArray: string[] = [];
    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        envArray.push(`${key}=${value}`);
      }
    }

    // Build exec options
    const execOpts: import('./docker-client.js').ExecOptions = {
      cmd: [command, ...args],
      workingDir,
    };

    if (envArray.length > 0) {
      execOpts.env = envArray;
    }

    if (options?.timeout !== undefined) {
      execOpts.timeout = options.timeout;
    }

    // Execute command
    const result = await this.client.execInContainer(this.containerId, execOpts);

    return result;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    if (this.status !== 'running') {
      throw new Error(`Sandbox is not running (status: ${this.status})`);
    }

    const targetPath = this.validatePath(filePath);
    const dir = path.dirname(targetPath);

    // Create parent directory if needed
    await this.client.execInContainer(this.containerId, {
      cmd: ['mkdir', '-p', dir],
    });

    // Write file content using echo and shell redirection
    // Use base64 encoding for safe content transfer
    const base64Content = Buffer.from(content).toString('base64');
    await this.client.execInContainer(this.containerId, {
      cmd: ['sh', '-c', `echo '${base64Content}' | base64 -d > '${targetPath}'`],
    });
  }

  async readFile(filePath: string): Promise<string> {
    if (this.status !== 'running') {
      throw new Error(`Sandbox is not running (status: ${this.status})`);
    }

    const targetPath = this.validatePath(filePath);

    const result = await this.client.execInContainer(this.containerId, {
      cmd: ['cat', targetPath],
    });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }

    return result.stdout;
  }

  async listFiles(dirPath: string): Promise<string[]> {
    if (this.status !== 'running') {
      throw new Error(`Sandbox is not running (status: ${this.status})`);
    }

    const targetPath = this.validatePath(dirPath);

    const result = await this.client.execInContainer(this.containerId, {
      cmd: ['ls', '-1', targetPath],
    });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to list files: ${result.stderr}`);
    }

    return result.stdout
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  }

  async destroy(): Promise<void> {
    if (this.status === 'destroyed') {
      return;
    }

    try {
      // Stop container (with short timeout)
      await this.client.stopContainer(this.containerId, 5);
    } catch {
      // Try to kill if stop fails
      await this.client.killContainer(this.containerId).catch(() => {
        // Ignore kill errors
      });
    }

    try {
      // Remove container
      await this.client.removeContainer(this.containerId, true);
    } catch {
      // Ignore removal errors (container may already be removed)
    }

    this.status = 'destroyed';
    this.onDestroy(this.id);
  }

  async getStats(): Promise<SandboxStats> {
    if (this.status !== 'running') {
      return {};
    }

    return this.client.getContainerStats(this.containerId);
  }
}

/**
 * Docker container-based sandbox provider.
 * Creates isolated containers for agent execution.
 */
export class DockerProvider extends BaseSandboxProvider {
  readonly name = 'docker';

  private readonly client: DockerClient;
  private readonly defaultImage: string;

  constructor(options?: { image?: string; socketPath?: string }) {
    super();
    this.client = options?.socketPath
      ? new DockerClient(options.socketPath)
      : DockerClient.getInstance();
    this.defaultImage = options?.image ?? DEFAULT_AGENT_IMAGE;
  }

  protected getProviderName(): string {
    return 'docker';
  }

  async isAvailable(): Promise<boolean> {
    return this.client.isAvailable();
  }

  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    const appliedConfig = this.applyDefaults(config);
    const id = generateSandboxId();
    const image = appliedConfig.image ?? this.defaultImage;

    this.logger.info(
      {
        sandboxId: id,
        workspacePath: appliedConfig.workspacePath,
        image,
      },
      'Creating Docker sandbox'
    );

    try {
      // Pull image if needed
      await this.client.pullImage(image);

      // Build container options
      const containerOptions = this.buildContainerOptions(id, appliedConfig, image);

      // Create container
      const container = await this.client.createContainer(containerOptions);

      // Start container
      await this.client.startContainer(container.id);

      // Create sandbox instance
      const sandbox = new DockerSandbox(
        id,
        container.id,
        appliedConfig.workspacePath,
        appliedConfig.workspaceMount ?? DEFAULT_WORKSPACE_MOUNT,
        this.client,
        (sandboxId) => this.unregisterSandbox(sandboxId)
      );

      this.registerSandbox(sandbox);

      this.logger.info(
        {
          sandboxId: id,
          containerId: container.id,
        },
        'Docker sandbox created'
      );

      return sandbox;
    } catch (error) {
      this.logger.error({ sandboxId: id, err: error }, 'Failed to create Docker sandbox');
      throw error;
    }
  }

  /**
   * Build container creation options.
   */
  private buildContainerOptions(
    sandboxId: string,
    config: SandboxConfig,
    image: string
  ): ContainerCreateOptions {
    const workspaceMount = config.workspaceMount ?? DEFAULT_WORKSPACE_MOUNT;
    const user = config.user ?? DEFAULT_USER;
    const limits = config.resourceLimits ?? {};

    // Build environment variables
    const env = [
      'NODE_ENV=production',
      `HOME=/home/${user}`,
      `USER=${user}`,
      `WORKSPACE=${workspaceMount}`,
      'NO_COLOR=1',
      'FORCE_COLOR=0',
    ];

    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        env.push(`${key}=${value}`);
      }
    }

    // Build tmpfs mounts for writable areas
    const tmpfs: Record<string, string> = {
      '/tmp': 'rw,noexec,nosuid,size=512m',
      [`/home/${user}`]: 'rw,noexec,nosuid,size=256m',
    };

    return {
      name: `agentgate-${sandboxId}`,
      Image: image,
      Cmd: ['sleep', 'infinity'], // Keep container running for exec
      WorkingDir: workspaceMount,
      User: user,
      Env: env,
      Labels: {
        [AGENTGATE_CONTAINER_LABEL]: 'true',
        'agentgate.sandbox-id': sandboxId,
      },
      HostConfig: {
        Binds: [`${config.workspacePath}:${workspaceMount}:rw`],
        NetworkMode: config.networkMode ?? 'none',
        Memory: limits.memoryMB ? limits.memoryMB * 1024 * 1024 : undefined,
        NanoCpus: limits.cpuCount ? limits.cpuCount * 1e9 : undefined,
        PidsLimit: 256,
        ReadonlyRootfs: true,
        SecurityOpt: ['no-new-privileges'],
        CapDrop: ['ALL'],
        Tmpfs: tmpfs,
        AutoRemove: false, // We manage removal ourselves
      },
    };
  }

  /**
   * Clean up orphaned containers.
   */
  async cleanup(): Promise<void> {
    // First clean up tracked sandboxes
    await super.cleanup();

    // Then find and remove any orphaned containers
    try {
      const containers = await this.client.listAgentGateContainers();

      for (const containerInfo of containers) {
        const containerId = containerInfo.Id;
        this.logger.info({ containerId }, 'Cleaning up orphaned container');

        try {
          await this.client.stopContainer(containerId, 5);
        } catch {
          await this.client.killContainer(containerId).catch(() => {
            // Ignore
          });
        }

        await this.client.removeContainer(containerId, true).catch(() => {
          // Ignore removal errors
        });
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to cleanup orphaned containers');
    }
  }
}
