/**
 * Docker Sandbox Provider
 *
 * Implements container-based isolation for agent execution using Docker.
 * Provides full namespace and cgroup isolation for security.
 */

import { randomBytes } from 'node:crypto';
import { DockerClient, getDockerClient, type ContainerStats } from './docker-client.js';
import { BaseSandboxProvider, DEFAULT_WORKSPACE_MOUNT } from './provider.js';
import type {
  Sandbox,
  SandboxConfig,
  SandboxStatus,
  SandboxStats,
  ExecOptions,
  ExecResult,
} from './types.js';

/**
 * Default container image for agent execution.
 */
const DEFAULT_IMAGE = 'agentgate/agent:latest';

/**
 * Default container user.
 */
const DEFAULT_USER = 'agentgate';

/**
 * Labels applied to all AgentGate containers.
 */
const AGENTGATE_LABELS = {
  'agentgate.sandbox': 'true',
};

/**
 * Generate a unique sandbox ID.
 */
function generateSandboxId(): string {
  return `docker-${randomBytes(8).toString('hex')}`;
}

/**
 * Docker-based sandbox implementation.
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
  private createdAt: Date;

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
    this.createdAt = new Date();
  }

  /**
   * Get the creation timestamp.
   */
  getCreatedAt(): Date {
    return this.createdAt;
  }

  /**
   * Validate that a path stays within the workspace.
   */
  private validatePath(relativePath: string): string {
    // Normalize and check for traversal
    const normalized = relativePath.replace(/\\/g, '/');
    if (normalized.includes('..') || normalized.startsWith('/')) {
      throw new Error(`Path traversal detected: ${relativePath}`);
    }

    // Combine with workspace mount
    return `${this.workspaceMount}/${normalized}`;
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
    const timeout = options?.timeout ?? this.defaultTimeout;

    // Build command array
    const cmd = [command, ...args];

    // Build environment variables
    const envArray: string[] = [];
    const mergedEnv = { ...this.env, ...options?.env };
    for (const [key, value] of Object.entries(mergedEnv)) {
      envArray.push(`${key}=${value}`);
    }

    // Determine working directory
    let workingDir = this.workspaceMount;
    if (options?.cwd) {
      workingDir = this.validatePath(options.cwd);
    }

    try {
      const result = await this.dockerClient.execInContainer(
        this.containerId,
        cmd,
        {
          env: envArray,
          workingDir,
          timeout,
        }
      );

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: false,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const err = error as Error;
      const timedOut = err.message?.includes('timed out');

      return {
        exitCode: timedOut ? 124 : 1,
        stdout: '',
        stderr: err.message,
        timedOut,
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

    const fullPath = this.validatePath(filePath);

    // Use shell to write file (handles escaping and directory creation)
    // Base64 encode to avoid shell escaping issues
    const base64Content = Buffer.from(content, 'utf-8').toString('base64');

    const result = await this.dockerClient.execInContainer(
      this.containerId,
      [
        'sh',
        '-c',
        `mkdir -p "$(dirname "${fullPath}")" && echo "${base64Content}" | base64 -d > "${fullPath}"`,
      ]
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file: ${result.stderr}`);
    }
  }

  async readFile(filePath: string): Promise<string> {
    if (this.status !== 'running') {
      throw new Error(`Sandbox is not running (status: ${this.status})`);
    }

    if (!this.containerId) {
      throw new Error('Container ID not available');
    }

    const fullPath = this.validatePath(filePath);

    const result = await this.dockerClient.execInContainer(
      this.containerId,
      ['cat', fullPath]
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

    const fullPath = this.validatePath(dirPath);

    const result = await this.dockerClient.execInContainer(
      this.containerId,
      ['ls', '-1', fullPath]
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to list files: ${result.stderr}`);
    }

    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  async destroy(): Promise<void> {
    if (this.status === 'destroyed') {
      return;
    }

    if (this.containerId) {
      try {
        await this.dockerClient.stopContainer(this.containerId, 5);
      } catch {
        // Ignore stop errors
      }

      try {
        await this.dockerClient.removeContainer(this.containerId, true);
      } catch {
        // Ignore remove errors
      }
    }

    this.status = 'destroyed';
    this.onDestroy(this.id);
  }

  async getStats(): Promise<SandboxStats> {
    if (!this.containerId) {
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
 * Creates isolated containers for agent execution.
 */
export class DockerProvider extends BaseSandboxProvider {
  readonly name = 'docker';

  private readonly dockerClient: DockerClient;
  private readonly defaultImage: string;

  constructor(options?: { socketPath?: string; defaultImage?: string }) {
    super();
    this.dockerClient = getDockerClient(options?.socketPath);
    this.defaultImage = options?.defaultImage ?? DEFAULT_IMAGE;
  }

  protected getProviderName(): string {
    return 'docker';
  }

  /**
   * Check if Docker is available and meets version requirements.
   */
  async isAvailable(): Promise<boolean> {
    return this.dockerClient.isAvailable();
  }

  /**
   * Get the Docker version.
   */
  getDockerVersion(): string | null {
    return this.dockerClient.getVersion();
  }

  /**
   * Create a new Docker-based sandbox.
   */
  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    const appliedConfig = this.applyDefaults(config);

    // Ensure Docker is available
    if (!(await this.isAvailable())) {
      throw new Error('Docker is not available');
    }

    const id = generateSandboxId();
    const image = appliedConfig.image ?? this.defaultImage;
    const workspaceMount = appliedConfig.workspaceMount ?? DEFAULT_WORKSPACE_MOUNT;
    const user = appliedConfig.user ?? DEFAULT_USER;
    const networkMode = appliedConfig.networkMode ?? 'none';
    const resourceLimits = appliedConfig.resourceLimits ?? {};

    // Pull image if needed
    await this.dockerClient.pullImage(image);

    // Build container configuration
    const envArray: string[] = [
      'NODE_ENV=production',
      `HOME=/home/${user}`,
      `USER=${user}`,
      `WORKSPACE=${workspaceMount}`,
      'NO_COLOR=1',
      'FORCE_COLOR=0',
    ];

    if (appliedConfig.env) {
      for (const [key, value] of Object.entries(appliedConfig.env)) {
        envArray.push(`${key}=${value}`);
      }
    }

    // Calculate resource limits
    const memoryBytes = resourceLimits.memoryMB
      ? resourceLimits.memoryMB * 1024 * 1024
      : undefined;
    const nanoCpus = resourceLimits.cpuCount
      ? resourceLimits.cpuCount * 1e9
      : undefined;

    // Create container
    this.logger.info(
      {
        sandboxId: id,
        image,
        workspacePath: appliedConfig.workspacePath,
        networkMode,
        memoryMB: resourceLimits.memoryMB,
        cpuCount: resourceLimits.cpuCount,
      },
      'Creating Docker sandbox'
    );

    const container = await this.dockerClient.createContainer({
      Image: image,
      Cmd: ['sleep', 'infinity'],
      WorkingDir: workspaceMount,
      User: user,
      Env: envArray,
      Labels: {
        ...AGENTGATE_LABELS,
        'agentgate.sandbox-id': id,
      },
      HostConfig: {
        Binds: [`${appliedConfig.workspacePath}:${workspaceMount}:rw`],
        NetworkMode: networkMode,
        ...(memoryBytes !== undefined && { Memory: memoryBytes }),
        ...(nanoCpus !== undefined && { NanoCpus: nanoCpus }),
        PidsLimit: 256,
        ReadonlyRootfs: true,
        SecurityOpt: ['no-new-privileges'],
        CapDrop: ['ALL'],
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=100m',
          [`/home/${user}`]: 'rw,noexec,nosuid,size=50m',
        },
      },
    });

    // Start container
    await this.dockerClient.startContainer(container.id);

    // Create sandbox instance
    const sandbox = new DockerSandbox(
      id,
      container.id,
      this.dockerClient,
      appliedConfig.workspacePath,
      workspaceMount,
      appliedConfig.env ?? {},
      resourceLimits.timeoutSeconds ?? 300,
      (sandboxId) => this.unregisterSandbox(sandboxId)
    );

    this.registerSandbox(sandbox);
    this.logger.info(
      { sandboxId: id, containerId: container.id },
      'Docker sandbox created'
    );

    return sandbox;
  }

  /**
   * Clean up orphaned containers.
   */
  async cleanup(): Promise<void> {
    // First, destroy all tracked sandboxes
    await super.cleanup();

    // Then clean up any orphaned containers (older than 2 hours)
    const maxAgeSeconds = 7200;
    const cleaned = await this.dockerClient.cleanupOrphanedContainers(maxAgeSeconds);

    if (cleaned > 0) {
      this.logger.info({ cleaned }, 'Cleaned up orphaned containers');
    }
  }

  /**
   * Get the underlying Docker client for advanced operations.
   */
  getDockerClient(): DockerClient {
    return this.dockerClient;
  }
}
