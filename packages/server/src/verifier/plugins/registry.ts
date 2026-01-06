/**
 * Plugin Registry
 *
 * Manages registration and retrieval of verification plugins.
 */

import type {
  VerificationPlugin,
  PluginConfig,
  VerificationLevel,
} from './types.js';

/**
 * Plugin Registry manages verification plugins
 */
export class PluginRegistry {
  private plugins: Map<string, VerificationPlugin> = new Map();

  /**
   * Register a plugin
   */
  register(plugin: VerificationPlugin): void {
    if (!plugin.config.id) {
      throw new Error('Plugin must have an id');
    }

    if (this.plugins.has(plugin.config.id)) {
      throw new Error(`Plugin already registered: ${plugin.config.id}`);
    }

    this.plugins.set(plugin.config.id, plugin);
  }

  /**
   * Unregister a plugin
   */
  unregister(pluginId: string): boolean {
    return this.plugins.delete(pluginId);
  }

  /**
   * Get a plugin by ID
   */
  get(pluginId: string): VerificationPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Check if a plugin exists
   */
  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Get all plugins sorted by priority
   */
  getAll(): VerificationPlugin[] {
    return Array.from(this.plugins.values()).sort(
      (a, b) => a.config.priority - b.config.priority
    );
  }

  /**
   * Get plugins by level
   */
  getByLevel(level: VerificationLevel): VerificationPlugin[] {
    return this.getAll().filter((p) => p.config.level === level);
  }

  /**
   * Get enabled plugins sorted by priority
   */
  getEnabled(): VerificationPlugin[] {
    return this.getAll().filter((p) => p.config.enabled);
  }

  /**
   * Get enabled plugins at specific levels
   */
  getEnabledAtLevels(levels: VerificationLevel[]): VerificationPlugin[] {
    return this.getEnabled().filter((p) => levels.includes(p.config.level));
  }

  /**
   * Enable a plugin
   */
  enable(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.config.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a plugin
   */
  disable(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.config.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Update plugin configuration
   */
  updateConfig(pluginId: string, updates: Partial<PluginConfig>): boolean {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      Object.assign(plugin.config, updates, { id: pluginId }); // Prevent ID change
      return true;
    }
    return false;
  }

  /**
   * Get count of registered plugins
   */
  count(): number {
    return this.plugins.size;
  }

  /**
   * Clear all plugins
   */
  clear(): void {
    this.plugins.clear();
  }

  /**
   * Get plugin IDs
   */
  getIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get plugin configurations
   */
  getConfigs(): PluginConfig[] {
    return this.getAll().map((p) => p.config);
  }
}

// Global default registry instance
export const defaultPluginRegistry = new PluginRegistry();
