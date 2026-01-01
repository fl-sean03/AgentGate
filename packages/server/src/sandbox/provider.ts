/**
 * Base Sandbox Provider
 *
 * Abstract base class implementing common functionality for sandbox providers.
 */

import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import type {
  Sandbox,
  SandboxConfig,
  SandboxProvider,
  ResourceLimits,
} from './types.js';

/**
 * Default resource limits applied when not specified in config.
 */
export const DEFAULT_RESOURCE_LIMITS: Required<ResourceLimits> = {
  cpuCount: 2,
  memoryMB: 2048,
  diskMB: 10240,
  timeoutSeconds: 300,
};

/**
 * Default workspace mount path inside container.
 */
export const DEFAULT_WORKSPACE_MOUNT = '/workspace';

/**
 * Abstract base class for sandbox providers.
 *
 * Provides common functionality like logging, default resource limits,
 * and error handling utilities.
 */
export abstract class BaseSandboxProvider implements SandboxProvider {
  abstract readonly name: string;

  protected readonly logger: Logger;
  protected readonly activeSandboxes: Map<string, Sandbox> = new Map();

  constructor() {
    this.logger = createLogger(`sandbox:${this.getProviderName()}`);
  }

  /**
   * Subclasses must implement to return provider name for logger initialization.
   */
  protected abstract getProviderName(): string;

  abstract isAvailable(): Promise<boolean>;
  abstract createSandbox(config: SandboxConfig): Promise<Sandbox>;

  /**
   * List all active sandboxes managed by this provider.
   */
  listSandboxes(): Promise<Sandbox[]> {
    return Promise.resolve(Array.from(this.activeSandboxes.values()));
  }

  /**
   * Clean up all active sandboxes.
   */
  async cleanup(): Promise<void> {
    this.logger.info(
      { count: this.activeSandboxes.size },
      'Cleaning up sandboxes'
    );

    const destroyPromises: Promise<void>[] = [];

    for (const sandbox of this.activeSandboxes.values()) {
      destroyPromises.push(
        sandbox.destroy().catch((err: unknown) => {
          this.logger.error(
            { sandboxId: sandbox.id, err },
            'Failed to destroy sandbox during cleanup'
          );
        })
      );
    }

    await Promise.all(destroyPromises);
    this.activeSandboxes.clear();
  }

  /**
   * Apply default resource limits to a config.
   */
  protected applyDefaults(config: SandboxConfig): SandboxConfig {
    return {
      ...config,
      workspaceMount: config.workspaceMount ?? DEFAULT_WORKSPACE_MOUNT,
      resourceLimits: {
        ...DEFAULT_RESOURCE_LIMITS,
        ...config.resourceLimits,
      },
    };
  }

  /**
   * Register a sandbox with this provider.
   */
  protected registerSandbox(sandbox: Sandbox): void {
    this.activeSandboxes.set(sandbox.id, sandbox);
    this.logger.debug({ sandboxId: sandbox.id }, 'Registered sandbox');
  }

  /**
   * Unregister a sandbox from this provider.
   */
  protected unregisterSandbox(sandboxId: string): void {
    this.activeSandboxes.delete(sandboxId);
    this.logger.debug({ sandboxId }, 'Unregistered sandbox');
  }
}
