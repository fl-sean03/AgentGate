/**
 * Sandbox Manager
 *
 * Central manager for sandbox providers and lifecycle management.
 * Handles provider selection, sandbox creation, and cleanup.
 */

import { createLogger } from '../utils/logger.js';
import type { Sandbox, SandboxConfig, SandboxProvider } from './types.js';
import { SubprocessProvider } from './subprocess-provider.js';
import { DockerProvider } from './docker-provider.js';

const logger = createLogger('sandbox:manager');

/**
 * Provider selection mode.
 */
export type ProviderMode = 'auto' | 'docker' | 'subprocess';

/**
 * Configuration for the sandbox manager.
 */
export interface SandboxManagerConfig {
  /** Provider selection mode */
  provider?: ProviderMode;
  /** Default image for Docker sandboxes */
  defaultImage?: string;
  /** Default network mode */
  defaultNetworkMode?: 'none' | 'bridge' | 'host';
  /** Default resource limits */
  defaultResourceLimits?: {
    cpuCount?: number;
    memoryMB?: number;
    timeoutSeconds?: number;
  };
  /** Periodic cleanup interval in milliseconds (0 to disable) */
  cleanupIntervalMs?: number;
}

/**
 * Status of the sandbox system.
 */
export interface SandboxSystemStatus {
  /** Currently selected provider */
  provider: string;
  /** Whether Docker is available */
  dockerAvailable: boolean;
  /** Number of active sandboxes */
  activeSandboxes: number;
  /** Last cleanup timestamp */
  lastCleanup: string | null;
  /** Any error from last operation */
  lastError: string | null;
}

/**
 * Sandbox Manager singleton.
 *
 * Provides centralized management of sandbox providers and sandboxes.
 * Automatically selects the best available provider.
 */
export class SandboxManager {
  private static instance: SandboxManager | null = null;

  private readonly config: Required<SandboxManagerConfig>;
  private readonly providers: Map<string, SandboxProvider> = new Map();
  private selectedProvider: SandboxProvider | null = null;
  private dockerAvailable = false;
  private lastCleanup: Date | null = null;
  private lastError: string | null = null;
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  private initialized = false;

  private constructor(config: SandboxManagerConfig = {}) {
    this.config = {
      provider: config.provider ?? 'auto',
      defaultImage: config.defaultImage ?? 'agentgate/agent:latest',
      defaultNetworkMode: config.defaultNetworkMode ?? 'none',
      defaultResourceLimits: config.defaultResourceLimits ?? {
        cpuCount: 2,
        memoryMB: 4096,
        timeoutSeconds: 3600,
      },
      cleanupIntervalMs: config.cleanupIntervalMs ?? 5 * 60 * 1000, // 5 minutes
    };

    // Register providers
    this.providers.set('subprocess', new SubprocessProvider());
    this.providers.set('docker', new DockerProvider());
  }

  /**
   * Get the singleton manager instance.
   */
  static getInstance(config?: SandboxManagerConfig): SandboxManager {
    if (!SandboxManager.instance) {
      SandboxManager.instance = new SandboxManager(config);
    }
    return SandboxManager.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance(): void {
    if (SandboxManager.instance) {
      SandboxManager.instance.shutdown();
    }
    SandboxManager.instance = null;
  }

  /**
   * Initialize the manager and select a provider.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info({ mode: this.config.provider }, 'Initializing sandbox manager');

    // Check Docker availability
    const dockerProvider = this.providers.get('docker')!;
    this.dockerAvailable = await dockerProvider.isAvailable();

    // Select provider based on mode
    this.selectProvider();

    // Start periodic cleanup
    if (this.config.cleanupIntervalMs > 0) {
      this.cleanupIntervalId = setInterval(
        () => void this.periodicCleanup(),
        this.config.cleanupIntervalMs
      );
    }

    this.initialized = true;
    logger.info(
      {
        selectedProvider: this.selectedProvider?.name,
        dockerAvailable: this.dockerAvailable,
      },
      'Sandbox manager initialized'
    );
  }

  /**
   * Select the appropriate provider based on configuration.
   */
  private selectProvider(): void {
    const mode = this.config.provider;

    if (mode === 'docker') {
      if (!this.dockerAvailable) {
        throw new Error('Docker provider requested but Docker is not available');
      }
      this.selectedProvider = this.providers.get('docker')!;
    } else if (mode === 'subprocess') {
      this.selectedProvider = this.providers.get('subprocess')!;
    } else {
      // Auto mode: prefer Docker if available
      if (this.dockerAvailable) {
        this.selectedProvider = this.providers.get('docker')!;
        logger.info('Auto-selected Docker provider');
      } else {
        this.selectedProvider = this.providers.get('subprocess')!;
        logger.info('Auto-selected subprocess provider (Docker not available)');
      }
    }
  }

  /**
   * Create a sandbox with the given configuration.
   */
  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.selectedProvider) {
      throw new Error('No sandbox provider available');
    }

    // Merge with defaults
    const mergedConfig: SandboxConfig = {
      ...config,
      image: config.image ?? this.config.defaultImage,
      networkMode: config.networkMode ?? this.config.defaultNetworkMode,
      resourceLimits: {
        ...this.config.defaultResourceLimits,
        ...config.resourceLimits,
      },
    };

    try {
      const sandbox = await this.selectedProvider.createSandbox(mergedConfig);
      this.lastError = null;

      logger.debug(
        {
          sandboxId: sandbox.id,
          provider: this.selectedProvider.name,
          workspacePath: config.workspacePath,
        },
        'Created sandbox'
      );

      return sandbox;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);

      // Try fallback to subprocess if Docker failed in auto mode
      if (
        this.config.provider === 'auto' &&
        this.selectedProvider.name === 'docker'
      ) {
        logger.warn(
          { err: error },
          'Docker sandbox creation failed, falling back to subprocess'
        );

        const subprocessProvider = this.providers.get('subprocess')!;
        return subprocessProvider.createSandbox(mergedConfig);
      }

      throw error;
    }
  }

  /**
   * Get the currently selected provider name.
   */
  getProviderName(): string {
    return this.selectedProvider?.name ?? 'none';
  }

  /**
   * Check if Docker is available.
   */
  isDockerAvailable(): boolean {
    return this.dockerAvailable;
  }

  /**
   * Get system status.
   */
  async getStatus(): Promise<SandboxSystemStatus> {
    if (!this.initialized) {
      await this.initialize();
    }

    let activeSandboxes = 0;
    for (const provider of this.providers.values()) {
      const sandboxes = await provider.listSandboxes();
      activeSandboxes += sandboxes.length;
    }

    return {
      provider: this.selectedProvider?.name ?? 'none',
      dockerAvailable: this.dockerAvailable,
      activeSandboxes,
      lastCleanup: this.lastCleanup?.toISOString() ?? null,
      lastError: this.lastError,
    };
  }

  /**
   * List all active sandboxes across all providers.
   */
  async listAllSandboxes(): Promise<Sandbox[]> {
    const allSandboxes: Sandbox[] = [];

    for (const provider of this.providers.values()) {
      const sandboxes = await provider.listSandboxes();
      allSandboxes.push(...sandboxes);
    }

    return allSandboxes;
  }

  /**
   * Periodic cleanup of orphaned sandboxes.
   */
  private async periodicCleanup(): Promise<void> {
    logger.debug('Running periodic sandbox cleanup');

    try {
      for (const provider of this.providers.values()) {
        await provider.cleanup();
      }

      this.lastCleanup = new Date();
      this.lastError = null;

      logger.debug('Periodic cleanup completed');
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      logger.error({ err: error }, 'Periodic cleanup failed');
    }
  }

  /**
   * Clean up all sandboxes and stop periodic cleanup.
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up all sandboxes');

    for (const provider of this.providers.values()) {
      try {
        await provider.cleanup();
      } catch (error) {
        logger.error(
          { provider: provider.name, err: error },
          'Provider cleanup failed'
        );
      }
    }

    this.lastCleanup = new Date();
  }

  /**
   * Shutdown the manager.
   */
  shutdown(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }

    this.initialized = false;
    logger.info('Sandbox manager shutdown');
  }

  /**
   * Register a custom provider.
   */
  registerProvider(provider: SandboxProvider): void {
    this.providers.set(provider.name, provider);
    logger.debug({ provider: provider.name }, 'Registered custom provider');
  }
}

/**
 * Get the sandbox manager singleton.
 */
export function getSandboxManager(config?: SandboxManagerConfig): SandboxManager {
  return SandboxManager.getInstance(config);
}

/**
 * Create a sandbox using the default manager.
 */
export async function createSandbox(config: SandboxConfig): Promise<Sandbox> {
  const manager = getSandboxManager();
  return manager.createSandbox(config);
}
