/**
 * Sandbox Manager
 *
 * Main entry point for the sandbox system. Handles provider selection,
 * lifecycle management, and resource cleanup.
 */

import { createLogger } from '../utils/logger.js';
import { DockerProvider, DEFAULT_AGENT_IMAGE } from './docker-provider.js';
import { SubprocessProvider } from './subprocess-provider.js';
import { DEFAULT_RESOURCE_LIMITS, DEFAULT_WORKSPACE_MOUNT } from './provider.js';
import type {
  Sandbox,
  SandboxConfig,
  SandboxProvider,
  ResourceLimits,
  NetworkMode,
} from './types.js';

const logger = createLogger('sandbox:manager');

/**
 * Sandbox provider type selection.
 */
export type SandboxProviderType = 'auto' | 'docker' | 'subprocess';

/**
 * Configuration for the sandbox manager.
 */
export interface SandboxManagerConfig {
  /** Provider to use ('auto', 'docker', 'subprocess') */
  provider?: SandboxProviderType;
  /** Default Docker image for containers */
  image?: string;
  /** Default network mode */
  networkMode?: NetworkMode;
  /** Default resource limits */
  resourceLimits?: Partial<ResourceLimits>;
  /** Cleanup interval in milliseconds */
  cleanupIntervalMs?: number;
}

/**
 * Status of the sandbox system.
 */
export interface SandboxSystemStatus {
  /** Currently active provider name */
  activeProvider: string;
  /** Whether Docker is available */
  dockerAvailable: boolean;
  /** Number of active sandboxes */
  activeSandboxCount: number;
  /** Default image in use */
  defaultImage: string;
  /** Default network mode */
  defaultNetworkMode: NetworkMode;
  /** Timestamp of last cleanup */
  lastCleanup: string | null;
}

/**
 * Singleton sandbox manager instance.
 */
let managerInstance: SandboxManager | null = null;

/**
 * Sandbox Manager class.
 * Handles provider selection, sandbox creation, and lifecycle management.
 */
export class SandboxManager {
  private dockerProvider: DockerProvider;
  private subprocessProvider: SubprocessProvider;
  private activeProvider: SandboxProvider | null = null;
  private readonly config: Required<SandboxManagerConfig>;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private lastCleanup: Date | null = null;
  private readonly activeSandboxes: Map<string, { sandbox: Sandbox; createdAt: Date; runId?: string }> = new Map();

  constructor(config: SandboxManagerConfig = {}) {
    this.config = {
      provider: config.provider ?? 'auto',
      image: config.image ?? DEFAULT_AGENT_IMAGE,
      networkMode: config.networkMode ?? 'none',
      resourceLimits: {
        ...DEFAULT_RESOURCE_LIMITS,
        ...config.resourceLimits,
      },
      cleanupIntervalMs: config.cleanupIntervalMs ?? 5 * 60 * 1000, // 5 minutes
    };

    this.dockerProvider = new DockerProvider({ image: this.config.image });
    this.subprocessProvider = new SubprocessProvider();

    logger.info(
      {
        provider: this.config.provider,
        image: this.config.image,
        networkMode: this.config.networkMode,
      },
      'Sandbox manager initialized'
    );
  }

  /**
   * Initialize the manager and select provider.
   */
  async initialize(): Promise<void> {
    this.activeProvider = await this.selectProvider();

    logger.info(
      { provider: this.activeProvider.name },
      'Provider selected'
    );

    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  /**
   * Select the appropriate provider based on configuration and availability.
   */
  private async selectProvider(): Promise<SandboxProvider> {
    if (this.config.provider === 'docker') {
      const available = await this.dockerProvider.isAvailable();
      if (!available) {
        throw new Error('Docker provider requested but Docker is not available');
      }
      return this.dockerProvider;
    }

    if (this.config.provider === 'subprocess') {
      return this.subprocessProvider;
    }

    // Auto mode: prefer Docker if available
    const dockerAvailable = await this.dockerProvider.isAvailable();
    if (dockerAvailable) {
      logger.info('Auto-selected Docker provider');
      return this.dockerProvider;
    }

    logger.info('Docker not available, falling back to subprocess provider');
    return this.subprocessProvider;
  }

  /**
   * Create a sandbox with the given configuration.
   */
  async createSandbox(config: SandboxConfig, runId?: string): Promise<Sandbox> {
    if (!this.activeProvider) {
      await this.initialize();
    }

    // Merge with defaults
    const mergedConfig: SandboxConfig = {
      ...config,
      workspaceMount: config.workspaceMount ?? DEFAULT_WORKSPACE_MOUNT,
      image: config.image ?? this.config.image,
      networkMode: config.networkMode ?? this.config.networkMode,
      resourceLimits: {
        ...this.config.resourceLimits,
        ...config.resourceLimits,
      },
    };

    const sandbox = await this.activeProvider!.createSandbox(mergedConfig);

    // Track sandbox
    const entry: { sandbox: Sandbox; createdAt: Date; runId?: string } = {
      sandbox,
      createdAt: new Date(),
    };
    if (runId !== undefined) {
      entry.runId = runId;
    }
    this.activeSandboxes.set(sandbox.id, entry);

    logger.debug(
      {
        sandboxId: sandbox.id,
        provider: this.activeProvider!.name,
        runId,
      },
      'Sandbox created via manager'
    );

    return sandbox;
  }

  /**
   * Destroy a specific sandbox.
   */
  async destroySandbox(sandboxId: string): Promise<void> {
    const entry = this.activeSandboxes.get(sandboxId);
    if (!entry) {
      logger.debug({ sandboxId }, 'Sandbox not found in manager');
      return;
    }

    await entry.sandbox.destroy();
    this.activeSandboxes.delete(sandboxId);

    logger.debug({ sandboxId }, 'Sandbox destroyed via manager');
  }

  /**
   * Get status of the sandbox system.
   */
  async getStatus(): Promise<SandboxSystemStatus> {
    const dockerAvailable = await this.dockerProvider.isAvailable();

    return {
      activeProvider: this.activeProvider?.name ?? 'none',
      dockerAvailable,
      activeSandboxCount: this.activeSandboxes.size,
      defaultImage: this.config.image,
      defaultNetworkMode: this.config.networkMode,
      lastCleanup: this.lastCleanup?.toISOString() ?? null,
    };
  }

  /**
   * Get list of active sandboxes.
   */
  listSandboxes(): Array<{ id: string; createdAt: Date; runId?: string }> {
    const result: Array<{ id: string; createdAt: Date; runId?: string }> = [];
    for (const [id, entry] of this.activeSandboxes.entries()) {
      const item: { id: string; createdAt: Date; runId?: string } = {
        id,
        createdAt: entry.createdAt,
      };
      if (entry.runId !== undefined) {
        item.runId = entry.runId;
      }
      result.push(item);
    }
    return result;
  }

  /**
   * Cleanup all sandboxes and providers.
   */
  async cleanup(): Promise<void> {
    logger.info(
      { sandboxCount: this.activeSandboxes.size },
      'Starting sandbox cleanup'
    );

    // Destroy all tracked sandboxes
    const destroyPromises: Promise<void>[] = [];
    for (const [id, entry] of this.activeSandboxes) {
      destroyPromises.push(
        entry.sandbox.destroy().catch((err: unknown) => {
          logger.error({ sandboxId: id, err }, 'Failed to destroy sandbox during cleanup');
        })
      );
    }
    await Promise.all(destroyPromises);
    this.activeSandboxes.clear();

    // Cleanup providers
    await this.dockerProvider.cleanup();
    await this.subprocessProvider.cleanup();

    this.lastCleanup = new Date();
    logger.info('Sandbox cleanup completed');
  }

  /**
   * Start periodic cleanup of orphaned sandboxes.
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.periodicCleanup().catch((error: unknown) => {
        logger.error({ err: error }, 'Periodic cleanup failed');
      });
    }, this.config.cleanupIntervalMs);

    // Unref so it doesn't keep the process alive
    this.cleanupInterval.unref();
  }

  /**
   * Perform periodic cleanup of old sandboxes.
   */
  private async periodicCleanup(): Promise<void> {
    const now = Date.now();
    const maxAge = (this.config.resourceLimits.timeoutSeconds ?? 3600) * 1000;

    const toRemove: string[] = [];

    for (const [id, entry] of this.activeSandboxes) {
      const age = now - entry.createdAt.getTime();
      if (age > maxAge) {
        toRemove.push(id);
      }
    }

    if (toRemove.length === 0) {
      return;
    }

    logger.info({ count: toRemove.length }, 'Cleaning up old sandboxes');

    for (const id of toRemove) {
      await this.destroySandbox(id).catch((err: unknown) => {
        logger.error({ sandboxId: id, err }, 'Failed to cleanup old sandbox');
      });
    }

    // Also run provider cleanup
    await this.dockerProvider.cleanup();

    this.lastCleanup = new Date();
  }

  /**
   * Stop the manager and cleanup.
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    await this.cleanup();
    logger.info('Sandbox manager shutdown');
  }

  /**
   * Get the current provider name.
   */
  getProviderName(): string {
    return this.activeProvider?.name ?? 'none';
  }

  /**
   * Check if Docker is available.
   */
  async isDockerAvailable(): Promise<boolean> {
    return this.dockerProvider.isAvailable();
  }
}

/**
 * Get the singleton sandbox manager instance.
 */
export function getSandboxManager(config?: SandboxManagerConfig): SandboxManager {
  if (!managerInstance) {
    managerInstance = new SandboxManager(config);
  }
  return managerInstance;
}

/**
 * Reset the singleton manager (for testing).
 */
export function resetSandboxManager(): void {
  if (managerInstance) {
    void managerInstance.shutdown();
    managerInstance = null;
  }
}

/**
 * Initialize the sandbox manager with configuration.
 * Call this at server startup.
 */
export async function initializeSandboxManager(
  config?: SandboxManagerConfig
): Promise<SandboxManager> {
  const manager = getSandboxManager(config);
  await manager.initialize();
  return manager;
}
