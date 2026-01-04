/**
 * Plugin System - Modular extension system for AgentGate.
 * Allows third-party plugins to extend functionality.
 *
 * (v0.2.27 - Phase 3: Extensibility Framework)
 */

import { createLogger } from '../utils/logger.js';
import { getHookManager, type HookHandler, type HookTiming } from './hooks.js';
import { getEventBus, type EventHandler, type AllEvents } from './events.js';

const log = createLogger('plugins');

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  /** Unique plugin identifier */
  id: string;
  /** Plugin name */
  name: string;
  /** Plugin version (semver) */
  version: string;
  /** Plugin description */
  description?: string;
  /** Plugin author */
  author?: string;
  /** Dependencies on other plugins */
  dependencies?: string[];
}

/**
 * Plugin context provided to plugins
 */
export interface PluginContext {
  /** Register a hook */
  registerHook: <TContext = unknown, TResult = void>(
    hookPoint: string,
    handler: HookHandler<TContext, TResult>,
    options?: { priority?: number; timing?: HookTiming }
  ) => void;
  /** Subscribe to an event */
  subscribeEvent: <K extends keyof AllEvents>(
    eventType: K,
    handler: EventHandler<AllEvents[K]>
  ) => void;
  /** Logger for the plugin */
  logger: ReturnType<typeof createLogger>;
  /** Plugin configuration */
  config: Record<string, unknown>;
}

/**
 * Plugin interface that all plugins must implement
 */
export interface Plugin {
  /** Plugin metadata */
  metadata: PluginMetadata;
  /** Initialize the plugin */
  initialize(context: PluginContext): Promise<void>;
  /** Cleanup when plugin is disabled */
  destroy?(): Promise<void>;
}

/**
 * Loaded plugin state
 */
interface LoadedPlugin {
  plugin: Plugin;
  context: PluginContext;
  hooks: Array<{ hookPoint: string; name: string }>;
  subscriptions: Array<{ eventType: string; unsubscribe: () => void }>;
  enabled: boolean;
}

/**
 * Plugin manager singleton
 */
export class PluginManager {
  private static instance: PluginManager | null = null;
  private plugins: Map<string, LoadedPlugin> = new Map();
  private configs: Map<string, Record<string, unknown>> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    if (PluginManager.instance) {
      PluginManager.instance.unloadAll();
    }
    PluginManager.instance = null;
  }

  /**
   * Set plugin configuration
   */
  setConfig(pluginId: string, config: Record<string, unknown>): void {
    this.configs.set(pluginId, config);
  }

  /**
   * Load a plugin
   */
  async load(plugin: Plugin): Promise<void> {
    const { id } = plugin.metadata;

    if (this.plugins.has(id)) {
      log.warn({ pluginId: id }, 'Plugin already loaded');
      return;
    }

    // Check dependencies
    const missingDeps = this.checkDependencies(plugin);
    if (missingDeps.length > 0) {
      throw new Error(
        `Plugin ${id} has missing dependencies: ${missingDeps.join(', ')}`
      );
    }

    // Create plugin context
    const hooks: LoadedPlugin['hooks'] = [];
    const subscriptions: LoadedPlugin['subscriptions'] = [];

    const context: PluginContext = {
      registerHook: (hookPoint, handler, options) => {
        const hookName = `${id}:${hookPoint}`;
        getHookManager().register(hookPoint, hookName, handler, options);
        hooks.push({ hookPoint, name: hookName });
      },
      subscribeEvent: (eventType, handler) => {
        const sub = getEventBus().on(eventType, handler);
        subscriptions.push({ eventType: eventType as string, unsubscribe: sub.unsubscribe });
      },
      logger: createLogger(`plugin:${id}`),
      config: this.configs.get(id) || {},
    };

    // Initialize plugin
    try {
      await plugin.initialize(context);
    } catch (error) {
      log.error({ pluginId: id, error }, 'Plugin initialization failed');
      throw error;
    }

    this.plugins.set(id, {
      plugin,
      context,
      hooks,
      subscriptions,
      enabled: true,
    });

    log.info(
      { pluginId: id, version: plugin.metadata.version },
      'Plugin loaded'
    );
  }

  /**
   * Unload a plugin
   */
  async unload(pluginId: string): Promise<boolean> {
    const loaded = this.plugins.get(pluginId);
    if (!loaded) {
      return false;
    }

    // Call destroy if available
    if (loaded.plugin.destroy) {
      try {
        await loaded.plugin.destroy();
      } catch (error) {
        log.error({ pluginId, error }, 'Plugin destroy failed');
      }
    }

    // Unregister hooks
    for (const { hookPoint, name } of loaded.hooks) {
      getHookManager().unregister(hookPoint, name);
    }

    // Unsubscribe events
    for (const { unsubscribe } of loaded.subscriptions) {
      unsubscribe();
    }

    this.plugins.delete(pluginId);
    log.info({ pluginId }, 'Plugin unloaded');

    return true;
  }

  /**
   * Unload all plugins
   */
  async unloadAll(): Promise<void> {
    for (const pluginId of this.plugins.keys()) {
      await this.unload(pluginId);
    }
  }

  /**
   * Enable a plugin
   */
  enable(pluginId: string): boolean {
    const loaded = this.plugins.get(pluginId);
    if (!loaded) {
      return false;
    }

    loaded.enabled = true;

    // Re-enable hooks
    for (const { hookPoint, name } of loaded.hooks) {
      const registry = getHookManager().getRegistry(hookPoint);
      registry.enable(name);
    }

    log.info({ pluginId }, 'Plugin enabled');
    return true;
  }

  /**
   * Disable a plugin
   */
  disable(pluginId: string): boolean {
    const loaded = this.plugins.get(pluginId);
    if (!loaded) {
      return false;
    }

    loaded.enabled = false;

    // Disable hooks
    for (const { hookPoint, name } of loaded.hooks) {
      const registry = getHookManager().getRegistry(hookPoint);
      registry.disable(name);
    }

    log.info({ pluginId }, 'Plugin disabled');
    return true;
  }

  /**
   * Get a loaded plugin
   */
  get(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId)?.plugin;
  }

  /**
   * Check if plugin is loaded
   */
  isLoaded(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Check if plugin is enabled
   */
  isEnabled(pluginId: string): boolean {
    return this.plugins.get(pluginId)?.enabled ?? false;
  }

  /**
   * Get all loaded plugins
   */
  getAll(): PluginMetadata[] {
    return Array.from(this.plugins.values()).map(p => p.plugin.metadata);
  }

  /**
   * Check plugin dependencies
   */
  private checkDependencies(plugin: Plugin): string[] {
    const deps = plugin.metadata.dependencies || [];
    const missing: string[] = [];

    for (const dep of deps) {
      if (!this.plugins.has(dep)) {
        missing.push(dep);
      }
    }

    return missing;
  }
}

/**
 * Get the plugin manager singleton
 */
export function getPluginManager(): PluginManager {
  return PluginManager.getInstance();
}

/**
 * Create a plugin (helper function)
 */
export function createPlugin(
  metadata: PluginMetadata,
  initialize: (context: PluginContext) => Promise<void>,
  destroy?: () => Promise<void>
): Plugin {
  return {
    metadata,
    initialize,
    destroy,
  };
}
