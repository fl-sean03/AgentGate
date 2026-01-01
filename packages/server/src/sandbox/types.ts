/**
 * Sandbox Types
 *
 * Defines abstract interfaces for sandbox providers, enabling pluggable
 * isolation backends for agent execution.
 */

/**
 * Network access mode for sandbox containers.
 */
export type NetworkMode = 'none' | 'bridge' | 'host';

/**
 * Resource constraints for sandbox execution.
 */
export interface ResourceLimits {
  /** Number of CPU cores available */
  cpuCount?: number;
  /** Memory limit in megabytes */
  memoryMB?: number;
  /** Disk space limit in megabytes (optional) */
  diskMB?: number;
  /** Maximum execution time in seconds */
  timeoutSeconds?: number;
}

/**
 * Configuration for creating a sandbox.
 */
export interface SandboxConfig {
  /** Host path to workspace directory */
  workspacePath: string;
  /** Path inside container (default: /workspace) */
  workspaceMount?: string;
  /** Container image to use */
  image?: string;
  /** CPU, memory, disk, timeout limits */
  resourceLimits?: ResourceLimits;
  /** Network access mode */
  networkMode?: NetworkMode;
  /** Environment variables to pass */
  env?: Record<string, string>;
  /** User to run as inside container */
  user?: string;
}

/**
 * Lifecycle states for a sandbox.
 */
export type SandboxStatus =
  | 'creating'
  | 'running'
  | 'stopped'
  | 'destroyed'
  | 'error';

/**
 * Options for executing a command in a sandbox.
 */
export interface ExecOptions {
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Working directory inside sandbox */
  cwd?: string;
  /** Command-specific timeout in seconds */
  timeout?: number;
  /** Input to provide to stdin */
  stdin?: string;
}

/**
 * Result of executing a command in a sandbox.
 */
export interface ExecResult {
  /** Process exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether execution timed out */
  timedOut: boolean;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Resource usage statistics for a sandbox.
 */
export interface SandboxStats {
  /** CPU usage percentage (0-100) */
  cpuPercent?: number;
  /** Memory usage in bytes */
  memoryBytes?: number;
  /** Disk I/O read bytes */
  diskReadBytes?: number;
  /** Disk I/O write bytes */
  diskWriteBytes?: number;
  /** Network received bytes */
  networkRxBytes?: number;
  /** Network transmitted bytes */
  networkTxBytes?: number;
}

/**
 * Represents an active sandbox instance.
 */
export interface Sandbox {
  /** Unique identifier for this sandbox */
  readonly id: string;
  /** Current lifecycle status */
  status: SandboxStatus;
  /** Container ID (if applicable) */
  containerId?: string;

  /**
   * Execute a command inside the sandbox.
   * @param command - Command to execute
   * @param args - Command arguments
   * @param options - Execution options
   * @returns Execution result
   */
  execute(
    command: string,
    args: string[],
    options?: ExecOptions
  ): Promise<ExecResult>;

  /**
   * Write a file to the sandbox filesystem.
   * @param path - Path relative to workspace
   * @param content - File content
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Read a file from the sandbox filesystem.
   * @param path - Path relative to workspace
   * @returns File content
   */
  readFile(path: string): Promise<string>;

  /**
   * List files in a directory.
   * @param path - Path relative to workspace
   * @returns Array of file/directory names
   */
  listFiles(path: string): Promise<string[]>;

  /**
   * Destroy the sandbox and clean up resources.
   */
  destroy(): Promise<void>;

  /**
   * Get current resource usage statistics.
   */
  getStats(): Promise<SandboxStats>;
}

/**
 * Provider interface for creating and managing sandboxes.
 */
export interface SandboxProvider {
  /** Provider identifier (e.g., 'docker', 'subprocess') */
  readonly name: string;

  /**
   * Check if this provider is available on the current system.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Create a new sandbox with the given configuration.
   * @param config - Sandbox configuration
   */
  createSandbox(config: SandboxConfig): Promise<Sandbox>;

  /**
   * List all active sandboxes managed by this provider.
   */
  listSandboxes(): Promise<Sandbox[]>;

  /**
   * Clean up orphaned resources.
   */
  cleanup(): Promise<void>;
}
