/**
 * Sandbox Manager
 *
 * Central manager for sandbox lifecycle, provider selection, and resource cleanup.
 * Implements automatic provider selection with Docker preferred, subprocess fallback.
 */

import { createLogger } from '../utils/logger.js';
import { DockerProvider } from './docker-provider.js';
import { SubprocessProvider } from './subprocess-provider.js';
import type { Sandbox, SandboxConfig, SandboxProvider } from './types.js';

const logger = createLogger('sandbox:manager');

/**
 * Provider type for configuration.
 */
export type ProviderType = 'auto' | 'docker' | 'subprocess';

/**
 * Sandbox manager configuration.
 */
export interface SandboxManagerConfig {
  /** Provider selection mode */
  provider?: ProviderType;
  /** Default container image */
  defaultImage?: string;
  /** Default resource limits */
  defaultResourceLimits?: {
    cpuCount?: number;
    memoryMB?: number;
    timeoutSeconds?: number;
  };
  /** Default network mode */
  defaultNetworkMode?: 'none' | 'bridge' | 'host';
  /** Auto cleanup interval in milliseconds */
  autoCleanupIntervalMs?: number;
}

/**
 * System status for sandbox infrastructure.
 */
export interface SandboxSystemStatus {
  /** Currently active provider name */
  activeProvider: string;
  /** Whether Docker is available */
  dockerAvailable: boolean;
  /** Docker version if available */
  dockerVersion: string | null;
  /** Number of active sandboxes */
  activeSandboxCount: number;
  /** Total sandboxes created since startup */
  totalCreated: number;
  /** Last cleanup timestamp */
  lastCleanup: string | null;
  /** Last error message if any */
  lastError: string | null;
}

/**
 * Sandbox metadata for tracking.
 */
interface SandboxMetadata {
  sandbox: Sandbox;
  createdAt: Date;
  runId?: string;
  workOrderId?: string;
}

/**
 * Manages sandbox lifecycle and provider selection.
 */
export class SandboxManager {
  private readonly config: Required<SandboxManagerConfig>;
  private readonly providers: Map<string, SandboxProvider> = new Map();
  private activeProvider: SandboxProvider | null = null;
  private readonly activeSandboxes: Map<string, SandboxMetadata> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private totalCreated = 0;
  private lastCleanup: Date | null = null;
  private lastError: string | null = null;
  private initialized = false;

  constructor(config: SandboxManagerConfig = {}) {
    this.config = {
      provider: config.provider ?? 'auto',
      defaultImage: config.defaultImage ?? 'agentgate/agent:latest',
      defaultResourceLimits: config.defaultResourceLimits ?? {
        cpuCount: 2,
        memoryMB: 4096,
        timeoutSeconds: 3600,
      },
      defaultNetworkMode: config.defaultNetworkMode ?? 'none',
      autoCleanupIntervalMs: config.autoCleanupIntervalMs ?? 300000, // 5 minutes
    };

    // Register built-in providers
    this.registerProvider(new DockerProvider({ defaultImage: this.config.defaultImage }));
    this.registerProvider(new SubprocessProvider());
  }

  /**
   * Register a sandbox provider.
   */
  registerProvider(provider: SandboxProvider): void {
    this.providers.set(provider.name, provider);
    logger.debug({ provider: provider.name }, 'Registered sandbox provider');
  }

  /**
   * Initialize the manager and select the active provider.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info({ mode: this.config.provider }, 'Initializing sandbox manager');

    // Select provider based on configuration
    if (this.config.provider === 'docker') {
      const dockerProvider = this.providers.get('docker');
      if (!dockerProvider) {
        throw new Error('Docker provider not registered');
      }

      const available = await dockerProvider.isAvailable();
      if (!available) {
        throw new Error('Docker provider configured but Docker is not available');
      }

      this.activeProvider = dockerProvider;
    } else if (this.config.provider === 'subprocess') {
      const subprocessProvider = this.providers.get('subprocess');
      if (!subprocessProvider) {
        throw new Error('Subprocess provider not registered');
      }

      this.activeProvider = subprocessProvider;
    } else {
      // Auto mode: try Docker first, fall back to subprocess
      const dockerProvider = this.providers.get('docker');
      const subprocessProvider = this.providers.get('subprocess');

      if (dockerProvider && (await dockerProvider.isAvailable())) {
        this.activeProvider = dockerProvider;
        logger.info('Auto-selected Docker provider');
      } else if (subprocessProvider) {
        this.activeProvider = subprocessProvider;
        logger.info('Docker unavailable, falling back to subprocess provider');
      } else {
        throw new Error('No sandbox providers available');
      }
    }

    logger.info(
      { provider: this.activeProvider.name },
      'Sandbox manager initialized'
    );

    // Start periodic cleanup
    this.startPeriodicCleanup();
    this.initialized = true;
  }

  /**
   * Ensure the manager is initialized.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get the active provider.
   */
  getActiveProvider(): SandboxProvider | null {
    return this.activeProvider;
  }

  /**
   * Check if Docker is available.
   */
  async isDockerAvailable(): Promise<boolean> {
    const dockerProvider = this.providers.get('docker');
    return dockerProvider ? dockerProvider.isAvailable() : false;
  }

  /**
   * Create a new sandbox with the given configuration.
   */
  async createSandbox(
    config: SandboxConfig,
    metadata?: { runId?: string; workOrderId?: string }
  ): Promise<Sandbox> {
    await this.ensureInitialized();

    if (!this.activeProvider) {
      throw new Error('No active sandbox provider');
    }

    // Apply default configuration
    const appliedConfig: SandboxConfig = {
      ...config,
      resourceLimits: {
        ...this.config.defaultResourceLimits,
        ...config.resourceLimits,
      },
      networkMode: config.networkMode ?? this.config.defaultNetworkMode,
      image: config.image ?? this.config.defaultImage,
    };

    try {
      const sandbox = await this.activeProvider.createSandbox(appliedConfig);

      // Track sandbox
      const sandboxMeta: SandboxMetadata = {
        sandbox,
        createdAt: new Date(),
      };
      if (metadata?.runId) {
        sandboxMeta.runId = metadata.runId;
      }
      if (metadata?.workOrderId) {
        sandboxMeta.workOrderId = metadata.workOrderId;
      }
      this.activeSandboxes.set(sandbox.id, sandboxMeta);

      this.totalCreated++;
      this.lastError = null;

      logger.info(
        {
          sandboxId: sandbox.id,
          provider: this.activeProvider.name,
          workOrderId: metadata?.workOrderId,
          runId: metadata?.runId,
        },
        'Sandbox created via manager'
      );

      return sandbox;
    } catch (error) {
      const err = error as Error;
      this.lastError = err.message;
      logger.error(
        { error: err.message, provider: this.activeProvider.name },
        'Failed to create sandbox'
      );
      throw error;
    }
  }

  /**
   * Get a sandbox by ID.
   */
  getSandbox(id: string): Sandbox | undefined {
    return this.activeSandboxes.get(id)?.sandbox;
  }

  /**
   * Destroy a sandbox by ID.
   */
  async destroySandbox(id: string): Promise<void> {
    const metadata = this.activeSandboxes.get(id);
    if (!metadata) {
      logger.debug({ sandboxId: id }, 'Sandbox not found for destruction');
      return;
    }

    try {
      await metadata.sandbox.destroy();
      this.activeSandboxes.delete(id);
      logger.info({ sandboxId: id }, 'Sandbox destroyed via manager');
    } catch (error) {
      const err = error as Error;
      this.lastError = err.message;
      logger.error({ sandboxId: id, error: err.message }, 'Failed to destroy sandbox');
      // Still remove from tracking even if destroy fails
      this.activeSandboxes.delete(id);
    }
  }

  /**
   * Get all active sandboxes.
   */
  listSandboxes(): Sandbox[] {
    return Array.from(this.activeSandboxes.values()).map((m) => m.sandbox);
  }

  /**
   * Get sandboxes filtered by work order or run ID.
   */
  getSandboxesByWorkOrder(workOrderId: string): Sandbox[] {
    return Array.from(this.activeSandboxes.values())
      .filter((m) => m.workOrderId === workOrderId)
      .map((m) => m.sandbox);
  }

  getSandboxesByRun(runId: string): Sandbox[] {
    return Array.from(this.activeSandboxes.values())
      .filter((m) => m.runId === runId)
      .map((m) => m.sandbox);
  }

  /**
   * Get system status.
   */
  async getStatus(): Promise<SandboxSystemStatus> {
    await this.ensureInitialized();

    const dockerProvider = this.providers.get('docker') as DockerProvider | undefined;
    const dockerAvailable = dockerProvider
      ? await dockerProvider.isAvailable()
      : false;

    return {
      activeProvider: this.activeProvider?.name ?? 'none',
      dockerAvailable,
      dockerVersion: dockerProvider?.getDockerVersion() ?? null,
      activeSandboxCount: this.activeSandboxes.size,
      totalCreated: this.totalCreated,
      lastCleanup: this.lastCleanup?.toISOString() ?? null,
      lastError: this.lastError,
    };
  }

  /**
   * Start periodic cleanup of orphaned sandboxes.
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(
      () => void this.performCleanup(),
      this.config.autoCleanupIntervalMs
    );

    // Don't prevent process exit
    this.cleanupInterval.unref();

    logger.debug(
      { intervalMs: this.config.autoCleanupIntervalMs },
      'Started periodic cleanup'
    );
  }

  /**
   * Stop periodic cleanup.
   */
  private stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Perform cleanup of stale sandboxes.
   */
  private async performCleanup(): Promise<void> {
    const now = Date.now();
    const timeoutSeconds = this.config.defaultResourceLimits.timeoutSeconds ?? 3600;
    const maxAge = timeoutSeconds * 1000 * 2; // 2x timeout

    let cleaned = 0;

    for (const [id, metadata] of this.activeSandboxes) {
      const age = now - metadata.createdAt.getTime();

      if (age > maxAge) {
        logger.info(
          { sandboxId: id, ageSeconds: Math.floor(age / 1000) },
          'Cleaning up stale sandbox'
        );

        try {
          await metadata.sandbox.destroy();
        } catch (error) {
          const err = error as Error;
          logger.warn(
            { sandboxId: id, error: err.message },
            'Failed to destroy stale sandbox'
          );
        }

        this.activeSandboxes.delete(id);
        cleaned++;
      }
    }

    // Also run provider-level cleanup
    for (const provider of this.providers.values()) {
      try {
        await provider.cleanup();
      } catch (error) {
        const err = error as Error;
        logger.warn(
          { provider: provider.name, error: err.message },
          'Provider cleanup failed'
        );
      }
    }

    this.lastCleanup = new Date();

    if (cleaned > 0) {
      logger.info({ cleaned }, 'Periodic cleanup completed');
    }
  }

  /**
   * Clean up all sandboxes and stop the manager.
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down sandbox manager');

    this.stopPeriodicCleanup();

    // Destroy all active sandboxes
    const destroyPromises: Promise<void>[] = [];

    for (const [id, metadata] of this.activeSandboxes) {
      destroyPromises.push(
        metadata.sandbox.destroy().catch((err: Error) => {
          logger.warn(
            { sandboxId: id, error: err.message },
            'Failed to destroy sandbox during shutdown'
          );
        })
      );
    }

    await Promise.all(destroyPromises);
    this.activeSandboxes.clear();

    // Run provider cleanup
    for (const provider of this.providers.values()) {
      try {
        await provider.cleanup();
      } catch (error) {
        const err = error as Error;
        logger.warn(
          { provider: provider.name, error: err.message },
          'Provider cleanup failed during shutdown'
        );
      }
    }

    this.initialized = false;
    logger.info('Sandbox manager shut down');
  }
}

/**
 * Singleton manager instance.
 */
let managerInstance: SandboxManager | null = null;

/**
 * Get the sandbox manager singleton.
 */
export function getSandboxManager(config?: SandboxManagerConfig): SandboxManager {
  if (!managerInstance) {
    managerInstance = new SandboxManager(config);
  }
  return managerInstance;
}

/**
 * Reset the manager singleton (for testing).
 */
export function resetSandboxManager(): void {
  if (managerInstance) {
    void managerInstance.shutdown();
    managerInstance = null;
  }
}
