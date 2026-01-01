/**
 * Subprocess Sandbox Provider
 *
 * A subprocess-based provider that maintains backward compatibility
 * and serves as a fallback when Docker is unavailable. This provider
 * offers no isolation - processes run directly on the host.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { BaseSandboxProvider } from './provider.js';
import type {
  Sandbox,
  SandboxConfig,
  SandboxStatus,
  SandboxStats,
  ExecOptions,
  ExecResult,
} from './types.js';

/**
 * Generate a unique sandbox ID.
 */
function generateSandboxId(): string {
  return `subprocess-${randomBytes(8).toString('hex')}`;
}

/**
 * Validate that a path stays within the workspace directory.
 * Prevents path traversal attacks.
 */
function validatePath(workspacePath: string, relativePath: string): string {
  const normalizedWorkspace = path.resolve(workspacePath);
  const fullPath = path.resolve(workspacePath, relativePath);

  if (!fullPath.startsWith(normalizedWorkspace + path.sep) && fullPath !== normalizedWorkspace) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }

  return fullPath;
}

/**
 * Subprocess-based sandbox implementation.
 *
 * Executes commands directly on the host using child_process.spawn.
 * Provides no isolation but implements the Sandbox interface for compatibility.
 */
class SubprocessSandbox implements Sandbox {
  readonly id: string;
  status: SandboxStatus;
  containerId?: string;

  private readonly workspacePath: string;
  private readonly env: Record<string, string>;
  private readonly defaultTimeout: number;
  private currentProcess: ChildProcess | null = null;
  private readonly onDestroy: (id: string) => void;

  constructor(
    id: string,
    workspacePath: string,
    env: Record<string, string>,
    defaultTimeout: number,
    onDestroy: (id: string) => void
  ) {
    this.id = id;
    this.workspacePath = workspacePath;
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

    const cwd = options?.cwd
      ? validatePath(this.workspacePath, options.cwd)
      : this.workspacePath;

    const timeout = (options?.timeout ?? this.defaultTimeout) * 1000;
    const env = {
      ...process.env,
      ...this.env,
      ...options?.env,
    };

    const startTime = Date.now();
    let timedOut = false;

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.currentProcess = proc;

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Handle stdin if provided
      if (options?.stdin) {
        proc.stdin?.write(options.stdin);
        proc.stdin?.end();
      } else {
        proc.stdin?.end();
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGKILL');
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        this.currentProcess = null;

        resolve({
          exitCode: code ?? -1,
          stdout,
          stderr,
          timedOut,
          durationMs: Date.now() - startTime,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        this.currentProcess = null;
        reject(err);
      });
    });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    if (this.status !== 'running') {
      throw new Error(`Sandbox is not running (status: ${this.status})`);
    }

    const fullPath = validatePath(this.workspacePath, filePath);

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async readFile(filePath: string): Promise<string> {
    if (this.status !== 'running') {
      throw new Error(`Sandbox is not running (status: ${this.status})`);
    }

    const fullPath = validatePath(this.workspacePath, filePath);
    return fs.readFile(fullPath, 'utf-8');
  }

  async listFiles(dirPath: string): Promise<string[]> {
    if (this.status !== 'running') {
      throw new Error(`Sandbox is not running (status: ${this.status})`);
    }

    const fullPath = validatePath(this.workspacePath, dirPath);
    return fs.readdir(fullPath);
  }

  destroy(): Promise<void> {
    if (this.status === 'destroyed') {
      return Promise.resolve();
    }

    // Kill any running process
    if (this.currentProcess) {
      this.currentProcess.kill('SIGKILL');
      this.currentProcess = null;
    }

    this.status = 'destroyed';
    this.onDestroy(this.id);
    return Promise.resolve();
  }

  getStats(): Promise<SandboxStats> {
    // Subprocess provider doesn't track detailed stats
    // Return empty stats object
    return Promise.resolve({});
  }
}

/**
 * Subprocess-based sandbox provider.
 *
 * Creates sandboxes that execute commands directly on the host.
 * Always available (Node.js is always present).
 */
export class SubprocessProvider extends BaseSandboxProvider {
  readonly name = 'subprocess';

  protected getProviderName(): string {
    return 'subprocess';
  }

  isAvailable(): Promise<boolean> {
    // Subprocess provider is always available (Node.js is always present)
    return Promise.resolve(true);
  }

  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    const appliedConfig = this.applyDefaults(config);

    // Verify workspace path exists
    try {
      await fs.access(appliedConfig.workspacePath);
    } catch {
      throw new Error(
        `Workspace path does not exist: ${appliedConfig.workspacePath}`
      );
    }

    const id = generateSandboxId();
    const defaultTimeout = appliedConfig.resourceLimits?.timeoutSeconds ?? 300;

    const sandbox = new SubprocessSandbox(
      id,
      appliedConfig.workspacePath,
      appliedConfig.env ?? {},
      defaultTimeout,
      (sandboxId) => this.unregisterSandbox(sandboxId)
    );

    this.registerSandbox(sandbox);
    this.logger.info(
      { sandboxId: id, workspacePath: appliedConfig.workspacePath },
      'Created subprocess sandbox'
    );

    return sandbox;
  }
}
