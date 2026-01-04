/**
 * Configuration Loader
 * Loads configuration from multiple sources with priority-based merging.
 *
 * (v0.2.27 - Thrust 11: Configuration Registry System)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createLogger } from '../utils/logger.js';
import { getConfigRegistry, ConfigSource } from './registry.js';
import { type AgentGateFullConfig, configSchema, defaultConfig } from './schema.js';

const log = createLogger('config-loader');

/**
 * Configuration file paths to search
 */
const CONFIG_FILE_PATHS = [
  () => path.join(os.homedir(), '.agentgate', 'config.yaml'),
  () => path.join(os.homedir(), '.agentgate', 'config.json'),
  () => path.join(process.cwd(), '.agentgate.yaml'),
  () => path.join(process.cwd(), '.agentgate.json'),
];

/**
 * Environment variable prefix
 */
const ENV_PREFIX = 'AGENTGATE_';

/**
 * Environment variable to config path mapping
 */
const ENV_MAPPINGS: Record<string, string> = {
  // Server
  'AGENTGATE_PORT': 'server.port',
  'AGENTGATE_HOST': 'server.host',

  // Execution
  'AGENTGATE_MAX_CONCURRENT_RUNS': 'execution.maxConcurrentRuns',
  'AGENTGATE_DEFAULT_TIMEOUT_SECONDS': 'execution.defaultTimeoutSeconds',
  'AGENTGATE_POLL_INTERVAL_MS': 'execution.pollIntervalMs',
  'AGENTGATE_LEASE_DURATION_SECONDS': 'execution.leaseDurationSeconds',

  // Sandbox
  'AGENTGATE_SANDBOX_PROVIDER': 'sandbox.provider',
  'AGENTGATE_SANDBOX_IMAGE': 'sandbox.image',
  'AGENTGATE_SANDBOX_NETWORK_MODE': 'sandbox.networkMode',
  'AGENTGATE_SANDBOX_CPU_COUNT': 'sandbox.cpuCount',
  'AGENTGATE_SANDBOX_MEMORY_MB': 'sandbox.memoryMB',
  'AGENTGATE_SANDBOX_TIMEOUT_SECONDS': 'sandbox.timeoutSeconds',
  'AGENTGATE_SANDBOX_CLEANUP_INTERVAL_MS': 'sandbox.cleanupIntervalMs',

  // GitHub
  'AGENTGATE_GITHUB_API_BASE_URL': 'github.apiBaseUrl',
  'AGENTGATE_GITHUB_RATE_LIMIT_RESERVE': 'github.rateLimitReservePercent',
  'AGENTGATE_GITHUB_MAX_RETRIES': 'github.maxRetries',
  'AGENTGATE_GITHUB_BASE_DELAY_MS': 'github.baseDelayMs',

  // CI
  'AGENTGATE_CI_ENABLED': 'ci.enabled',
  'AGENTGATE_CI_WAIT_BY_DEFAULT': 'ci.waitByDefault',
  'AGENTGATE_CI_POLL_INTERVAL_MS': 'ci.pollIntervalMs',
  'AGENTGATE_CI_TIMEOUT_MS': 'ci.timeoutMs',
  'AGENTGATE_CI_MAX_ITERATIONS': 'ci.maxIterations',
  'AGENTGATE_CI_SKIP_IF_NO_WORKFLOWS': 'ci.skipIfNoWorkflows',
  'AGENTGATE_CI_LOG_RETENTION_COUNT': 'ci.logRetentionCount',

  // Harness
  'AGENTGATE_HARNESS_DEFAULT_PROFILE': 'harness.defaultProfile',
  'AGENTGATE_HARNESS_PROFILES_DIR': 'harness.profilesDir',
  'AGENTGATE_MAX_SPAWN_DEPTH': 'harness.maxSpawnDepth',
  'AGENTGATE_MAX_CHILDREN_PER_PARENT': 'harness.maxChildrenPerParent',
  'AGENTGATE_MAX_TREE_SIZE': 'harness.maxTreeSize',

  // Logging
  'AGENTGATE_LOG_LEVEL': 'logging.level',
  'AGENTGATE_LOG_FORMAT': 'logging.format',
  'AGENTGATE_LOG_FILE': 'logging.file',

  // WAL
  'AGENTGATE_WAL_ENABLED': 'wal.enabled',
  'AGENTGATE_WAL_DIRECTORY': 'wal.directory',
  'AGENTGATE_WAL_RETENTION_DAYS': 'wal.retentionDays',
  'AGENTGATE_WAL_MAX_ENTRIES': 'wal.maxEntriesPerRun',

  // SDK
  'AGENTGATE_SDK_TIMEOUT_MS': 'sdk.timeoutMs',
  'AGENTGATE_SDK_ENABLE_SANDBOX': 'sdk.enableSandbox',
  'AGENTGATE_SDK_LOG_TOOL_USE': 'sdk.logToolUse',
  'AGENTGATE_SDK_TRACK_FILE_CHANGES': 'sdk.trackFileChanges',
  'AGENTGATE_SDK_MAX_TURNS': 'sdk.maxTurns',

  // Verification
  'AGENTGATE_VERIFICATION_LOCAL_RETRY_ENABLED': 'verification.localRetryEnabled',
  'AGENTGATE_VERIFICATION_CI_RETRY_ENABLED': 'verification.ciRetryEnabled',

  // Data
  'AGENTGATE_DATA_DIR': 'dataDir',
};

/**
 * Load configuration from file
 */
function loadFromFile(filePath: string): Partial<AgentGateFullConfig> | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.json') {
      return JSON.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
      // Simple YAML parsing for basic key-value structures
      // For production, should use a proper YAML parser
      try {
        // Try to parse as JSON first (YAML is a superset)
        return JSON.parse(content);
      } catch {
        log.warn({ filePath }, 'YAML config files require yaml package');
        return null;
      }
    }

    return null;
  } catch (error) {
    log.error({ error, filePath }, 'Failed to load config file');
    return null;
  }
}

/**
 * Load configuration from environment variables
 */
function loadFromEnvironment(): Partial<Record<string, unknown>> {
  const config: Record<string, unknown> = {};

  for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
    const value = process.env[envVar];
    if (value !== undefined) {
      setNestedValue(config, configPath, value);
    }
  }

  return config;
}

/**
 * Set a nested value in an object
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current)) {
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
 * Deep merge configuration objects
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;

    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Find the first available config file
 */
export function findConfigFile(): string | null {
  for (const pathFn of CONFIG_FILE_PATHS) {
    const filePath = pathFn();
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Load and initialize the configuration registry
 */
export function loadAndInitializeConfig(): AgentGateFullConfig {
  const registry = getConfigRegistry();

  // Start with defaults
  let config: Record<string, unknown> = JSON.parse(JSON.stringify(defaultConfig));

  // Layer 1: Load from config file
  const configFile = findConfigFile();
  if (configFile) {
    const fileConfig = loadFromFile(configFile);
    if (fileConfig) {
      config = deepMerge(config, fileConfig as Record<string, unknown>);
      log.info({ configFile }, 'Loaded configuration from file');
    }
  }

  // Layer 2: Load from environment variables
  const envConfig = loadFromEnvironment();
  config = deepMerge(config, envConfig);

  // Validate the final configuration
  const result = configSchema.safeParse(config);
  if (!result.success) {
    log.error({ errors: result.error.errors }, 'Configuration validation failed');
    throw new Error(`Configuration validation failed: ${result.error.message}`);
  }

  // Initialize the registry
  registry.initialize(result.data);

  log.info('Configuration loaded and validated');
  return result.data;
}

/**
 * Reload configuration from file (hot reload)
 */
export function reloadConfigFromFile(): boolean {
  const registry = getConfigRegistry();
  const configFile = findConfigFile();

  if (!configFile) {
    log.warn('No config file found for reload');
    return false;
  }

  const fileConfig = loadFromFile(configFile);
  if (!fileConfig) {
    log.warn({ configFile }, 'Failed to reload config file');
    return false;
  }

  // Re-initialize with merged config
  const currentConfig = registry.getAll();
  const mergedConfig = deepMerge(
    currentConfig as unknown as Record<string, unknown>,
    fileConfig as Record<string, unknown>
  );

  const result = configSchema.safeParse(mergedConfig);
  if (!result.success) {
    log.error({ errors: result.error.errors }, 'Config reload validation failed');
    return false;
  }

  registry.initialize(result.data);
  log.info({ configFile }, 'Configuration reloaded from file');
  return true;
}

/**
 * Watch config file for changes
 */
export function watchConfigFile(onChange: () => void): () => void {
  const configFile = findConfigFile();
  if (!configFile) {
    log.debug('No config file to watch');
    return () => {};
  }

  let debounceTimer: NodeJS.Timeout | null = null;

  const watcher = fs.watch(configFile, (eventType) => {
    if (eventType === 'change') {
      // Debounce rapid changes
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        log.debug({ configFile }, 'Config file changed');
        onChange();
      }, 100);
    }
  });

  log.info({ configFile }, 'Watching config file for changes');

  return () => {
    watcher.close();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  };
}

/**
 * Validate a configuration object without loading it
 */
export function validateConfigObject(config: unknown): {
  valid: boolean;
  errors?: string[];
} {
  const result = configSchema.safeParse(config);
  if (result.success) {
    return { valid: true };
  }
  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}
