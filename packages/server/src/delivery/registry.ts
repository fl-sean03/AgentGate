/**
 * Delivery Manager Registry
 * v0.2.25: Registry for looking up delivery managers by type
 */

import {
  type DeliveryManager,
  type DeliveryManagerRegistry,
  type DeliveryConfig,
} from './types.js';
import { LocalDeliveryManager } from './local-manager.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('delivery-registry');

/**
 * Default registry implementation
 */
class DefaultDeliveryManagerRegistry implements DeliveryManagerRegistry {
  private readonly managers = new Map<string, DeliveryManager>();

  /**
   * Register a delivery manager
   */
  register(manager: DeliveryManager): void {
    if (this.managers.has(manager.type)) {
      log.warn(
        { type: manager.type },
        'Overwriting existing delivery manager'
      );
    }

    this.managers.set(manager.type, manager);

    log.info({ type: manager.type }, 'Delivery manager registered');
  }

  /**
   * Get manager for a configuration
   */
  getManager(config: DeliveryConfig): DeliveryManager | null {
    const manager = this.managers.get(config.type);

    if (!manager) {
      log.warn({ type: config.type }, 'No delivery manager found for type');
      return null;
    }

    if (!manager.canHandle(config)) {
      log.warn(
        { type: config.type },
        'Delivery manager cannot handle configuration'
      );
      return null;
    }

    return manager;
  }

  /**
   * List all registered managers
   */
  listManagers(): string[] {
    return Array.from(this.managers.keys());
  }
}

/**
 * Global registry instance
 */
let registryInstance: DeliveryManagerRegistry | null = null;

/**
 * Get or create the global registry
 */
export function getDeliveryRegistry(): DeliveryManagerRegistry {
  if (!registryInstance) {
    registryInstance = new DefaultDeliveryManagerRegistry();

    // Register built-in managers
    registryInstance.register(new LocalDeliveryManager());

    // Note: GitHubDeliveryManager will be registered when github module loads
  }

  return registryInstance;
}

/**
 * Reset registry (for testing)
 */
export function resetDeliveryRegistry(): void {
  registryInstance = null;
}
