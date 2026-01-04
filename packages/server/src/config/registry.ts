/**
 * Configuration Registry
 * Centralized registry for all configuration with dynamic updates and validation.
 *
 * (v0.2.27 - Thrust 11: Configuration Registry System)
 */

import { createLogger } from '../utils/logger.js';
import {
  type AgentGateFullConfig,
  type ConfigSection,
  configSchema,
  defaultConfig,
  getDefaultValue,
} from './schema.js';

const log = createLogger('config-registry');

/**
 * Configuration source priority
 */
export enum ConfigSource {
  DEFAULT = 0,
  FILE = 1,
  ENVIRONMENT = 2,
  RUNTIME = 3,
}

/**
 * Configuration entry with source tracking
 */
interface ConfigEntry {
  value: unknown;
  source: ConfigSource;
  updatedAt: Date;
}

/**
 * Configuration change listener
 */
export type ConfigChangeListener = (
  path: string,
  newValue: unknown,
  oldValue: unknown,
  source: ConfigSource
) => void;

/**
 * Configuration Registry Singleton
 * Manages all configuration with support for dynamic updates, validation, and hierarchical overrides.
 */
export class ConfigRegistry {
  private static instance: ConfigRegistry | null = null;

  private config: AgentGateFullConfig;
  private overrides: Map<string, ConfigEntry> = new Map();
  private listeners: Set<ConfigChangeListener> = new Set();
  private initialized = false;

  private constructor() {
    this.config = { ...defaultConfig };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ConfigRegistry {
    if (!ConfigRegistry.instance) {
      ConfigRegistry.instance = new ConfigRegistry();
    }
    return ConfigRegistry.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    ConfigRegistry.instance = null;
  }

  /**
   * Initialize with configuration from all sources
   */
  initialize(config: Partial<AgentGateFullConfig>): void {
    const result = configSchema.safeParse({
      ...defaultConfig,
      ...config,
    });

    if (!result.success) {
      log.error({ errors: result.error.errors }, 'Invalid configuration');
      throw new Error(`Configuration validation failed: ${result.error.message}`);
    }

    this.config = result.data;
    this.initialized = true;
    log.info('Configuration registry initialized');
  }

  /**
   * Check if registry is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get a configuration value by path
   * @param path - Dot-separated path (e.g., 'server.port')
   * @returns The configuration value
   */
  get<T = unknown>(path: string): T {
    // Check runtime overrides first
    const override = this.overrides.get(path);
    if (override) {
      return override.value as T;
    }

    // Navigate to the path in the config
    const parts = path.split('.');
    let current: unknown = this.config;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        // Return default if path not found
        return getDefaultValue(path) as T;
      }
    }

    return current as T;
  }

  /**
   * Set a configuration value at runtime
   * @param path - Dot-separated path
   * @param value - New value
   */
  set(path: string, value: unknown): void {
    const oldValue = this.get(path);

    // Validate the new value would be valid
    const testConfig = this.buildConfigWithOverride(path, value);
    const result = configSchema.safeParse(testConfig);

    if (!result.success) {
      throw new Error(`Invalid configuration value for ${path}: ${result.error.message}`);
    }

    // Store the override
    this.overrides.set(path, {
      value,
      source: ConfigSource.RUNTIME,
      updatedAt: new Date(),
    });

    // Notify listeners
    this.notifyListeners(path, value, oldValue, ConfigSource.RUNTIME);

    log.debug({ path, value }, 'Configuration updated');
  }

  /**
   * Reset a configuration value to default
   * @param path - Dot-separated path, or undefined to reset all
   */
  reset(path?: string): void {
    if (path) {
      const oldValue = this.get(path);
      this.overrides.delete(path);
      const newValue = this.get(path);
      this.notifyListeners(path, newValue, oldValue, ConfigSource.DEFAULT);
      log.debug({ path }, 'Configuration reset to default');
    } else {
      this.overrides.clear();
      this.config = { ...defaultConfig };
      this.initialized = false;
      log.info('Configuration reset to defaults');
    }
  }

  /**
   * Get all configuration values
   */
  getAll(): AgentGateFullConfig {
    // Build complete config with overrides applied
    const result = { ...this.config };

    for (const [path, entry] of this.overrides) {
      this.setValueAtPath(result, path, entry.value);
    }

    return result;
  }

  /**
   * Get configuration for a specific section
   */
  getSection<K extends ConfigSection>(section: K): AgentGateFullConfig[K] {
    return this.get(section) as AgentGateFullConfig[K];
  }

  /**
   * Check if a path has a runtime override
   */
  hasOverride(path: string): boolean {
    return this.overrides.has(path);
  }

  /**
   * Get all runtime overrides
   */
  getOverrides(): Map<string, ConfigEntry> {
    return new Map(this.overrides);
  }

  /**
   * Add a change listener
   */
  addChangeListener(listener: ConfigChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Remove a change listener
   */
  removeChangeListener(listener: ConfigChangeListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Export configuration as JSON (with secrets redacted)
   */
  toJSON(redact = true): Record<string, unknown> {
    const config = this.getAll();
    if (redact) {
      return this.redactSecrets(config);
    }
    return config as unknown as Record<string, unknown>;
  }

  /**
   * Build a test config with an override applied
   */
  private buildConfigWithOverride(path: string, value: unknown): Record<string, unknown> {
    const config = JSON.parse(JSON.stringify(this.config));
    this.setValueAtPath(config, path, value);
    return config;
  }

  /**
   * Set a value at a path in an object
   */
  private setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = value;
    }
  }

  /**
   * Notify all listeners of a change
   */
  private notifyListeners(
    path: string,
    newValue: unknown,
    oldValue: unknown,
    source: ConfigSource
  ): void {
    for (const listener of this.listeners) {
      try {
        listener(path, newValue, oldValue, source);
      } catch (error) {
        log.error({ error, path }, 'Config change listener error');
      }
    }
  }

  /**
   * Redact sensitive fields from config
   */
  private redactSecrets(obj: unknown): Record<string, unknown> {
    if (typeof obj !== 'object' || obj === null) {
      return obj as Record<string, unknown>;
    }

    const redactPatterns = ['password', 'token', 'secret', 'key', 'api'];
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const shouldRedact = redactPatterns.some(pattern =>
        key.toLowerCase().includes(pattern)
      );

      if (shouldRedact && typeof value === 'string') {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.redactSecrets(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}

/**
 * Get the configuration registry singleton
 */
export function getConfigRegistry(): ConfigRegistry {
  return ConfigRegistry.getInstance();
}

/**
 * Convenience function to get a config value
 */
export function configGet<T = unknown>(path: string): T {
  return getConfigRegistry().get<T>(path);
}

/**
 * Convenience function to set a config value
 */
export function configSet(path: string, value: unknown): void {
  getConfigRegistry().set(path, value);
}
