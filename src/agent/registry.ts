import type { AgentDriver } from '../types/index.js';
import { createLogger } from '../utils/index.js';

const logger = createLogger('agent:registry');

/**
 * Registry for agent drivers
 */
class DriverRegistry {
  private drivers: Map<string, AgentDriver> = new Map();
  private defaultDriverName: string | null = null;

  /**
   * Registers a driver with the registry
   */
  register(driver: AgentDriver): void {
    const name = driver.name.toLowerCase();

    if (this.drivers.has(name)) {
      logger.warn({ name }, 'Driver already registered, replacing');
    }

    this.drivers.set(name, driver);
    logger.debug({ name, version: driver.version }, 'Driver registered');

    // Set as default if it's the first driver
    if (this.defaultDriverName === null) {
      this.defaultDriverName = name;
      logger.debug({ name }, 'Set as default driver');
    }
  }

  /**
   * Gets a driver by name (case-insensitive)
   */
  get(name: string): AgentDriver | null {
    return this.drivers.get(name.toLowerCase()) ?? null;
  }

  /**
   * Lists all registered drivers
   */
  list(): AgentDriver[] {
    return Array.from(this.drivers.values());
  }

  /**
   * Gets the default driver
   * @throws Error if no drivers are registered
   */
  getDefault(): AgentDriver {
    if (this.defaultDriverName === null) {
      throw new Error('No drivers registered');
    }

    const driver = this.drivers.get(this.defaultDriverName);
    if (!driver) {
      throw new Error(`Default driver "${this.defaultDriverName}" not found`);
    }

    return driver;
  }

  /**
   * Sets the default driver by name
   */
  setDefault(name: string): void {
    const normalizedName = name.toLowerCase();

    if (!this.drivers.has(normalizedName)) {
      throw new Error(`Driver "${name}" not registered`);
    }

    this.defaultDriverName = normalizedName;
    logger.debug({ name: normalizedName }, 'Default driver changed');
  }

  /**
   * Checks if a driver is registered
   */
  has(name: string): boolean {
    return this.drivers.has(name.toLowerCase());
  }

  /**
   * Removes a driver from the registry
   */
  unregister(name: string): boolean {
    const normalizedName = name.toLowerCase();
    const removed = this.drivers.delete(normalizedName);

    if (removed) {
      logger.debug({ name: normalizedName }, 'Driver unregistered');

      // Reset default if we removed the default driver
      if (this.defaultDriverName === normalizedName) {
        this.defaultDriverName = this.drivers.size > 0
          ? this.drivers.keys().next().value ?? null
          : null;
        logger.debug({ name: this.defaultDriverName }, 'New default driver');
      }
    }

    return removed;
  }

  /**
   * Clears all registered drivers
   */
  clear(): void {
    this.drivers.clear();
    this.defaultDriverName = null;
    logger.debug('Registry cleared');
  }

  /**
   * Gets the count of registered drivers
   */
  get size(): number {
    return this.drivers.size;
  }
}

// Global singleton registry
export const driverRegistry = new DriverRegistry();

// Export convenience functions that operate on the singleton
export function register(driver: AgentDriver): void {
  driverRegistry.register(driver);
}

export function get(name: string): AgentDriver | null {
  return driverRegistry.get(name);
}

export function list(): AgentDriver[] {
  return driverRegistry.list();
}

export function getDefault(): AgentDriver {
  return driverRegistry.getDefault();
}

export function setDefault(name: string): void {
  driverRegistry.setDefault(name);
}

export function has(name: string): boolean {
  return driverRegistry.has(name);
}

export function unregister(name: string): boolean {
  return driverRegistry.unregister(name);
}

export function clear(): void {
  driverRegistry.clear();
}
