/**
 * AgentGate Configuration Module
 *
 * Centralizes all configuration reading from environment variables
 * with validation and defaults.
 */

import { z } from 'zod';
import { createLogger } from '../utils/logger.js';

const log = createLogger('config');

/**
 * CI configuration schema
 */
const ciConfigSchema = z.object({
  /** Enable CI monitoring */
  enabled: z.coerce.boolean().default(true),
  /** Polling interval in milliseconds (5s - 5min) */
  pollIntervalMs: z.coerce.number().int().min(5000).max(300000).default(30000),
  /** Maximum wait time in milliseconds (1min - 2hours) */
  timeoutMs: z.coerce.number().int().min(60000).max(7200000).default(1800000),
  /** Maximum CI remediation attempts (1-10) */
  maxIterations: z.coerce.number().int().min(1).max(10).default(3),
  /** Skip CI check if no workflows are configured */
  skipIfNoWorkflows: z.coerce.boolean().default(true),
  /** Number of CI logs to retain per run */
  logRetentionCount: z.coerce.number().int().min(1).max(20).default(5),
});

export type CIConfig = z.infer<typeof ciConfigSchema>;

/**
 * Configuration schema with validation
 */
const configSchema = z.object({
  // Concurrency limits
  maxConcurrentRuns: z.coerce.number().int().min(1).max(100).default(5),

  // Spawn limits
  maxSpawnDepth: z.coerce.number().int().min(1).max(10).default(3),
  maxChildrenPerParent: z.coerce.number().int().min(1).max(50).default(10),
  maxTreeSize: z.coerce.number().int().min(1).max(1000).default(100),

  // Timeouts
  defaultTimeoutSeconds: z.coerce.number().int().min(60).max(86400).default(3600),
  pollIntervalMs: z.coerce.number().int().min(1000).max(60000).default(5000),
  leaseDurationSeconds: z.coerce.number().int().min(300).max(86400).default(3600),

  // Paths
  dataDir: z.string().default('.agentgate/data'),

  // Server
  port: z.coerce.number().int().min(1).max(65535).default(3001),
  host: z.string().default('0.0.0.0'),

  // CI configuration
  ci: ciConfigSchema,
});

export type AgentGateConfig = z.infer<typeof configSchema>;

/**
 * Load configuration from environment variables
 */
export function loadConfig(): AgentGateConfig {
  const raw = {
    maxConcurrentRuns: process.env.AGENTGATE_MAX_CONCURRENT_RUNS,
    maxSpawnDepth: process.env.AGENTGATE_MAX_SPAWN_DEPTH,
    maxChildrenPerParent: process.env.AGENTGATE_MAX_CHILDREN_PER_PARENT,
    maxTreeSize: process.env.AGENTGATE_MAX_TREE_SIZE,
    defaultTimeoutSeconds: process.env.AGENTGATE_DEFAULT_TIMEOUT_SECONDS,
    pollIntervalMs: process.env.AGENTGATE_POLL_INTERVAL_MS,
    leaseDurationSeconds: process.env.AGENTGATE_LEASE_DURATION_SECONDS,
    dataDir: process.env.AGENTGATE_DATA_DIR,
    port: process.env.AGENTGATE_PORT,
    host: process.env.AGENTGATE_HOST,
    // CI configuration
    ci: {
      enabled: process.env.AGENTGATE_CI_ENABLED,
      pollIntervalMs: process.env.AGENTGATE_CI_POLL_INTERVAL_MS,
      timeoutMs: process.env.AGENTGATE_CI_TIMEOUT_MS,
      maxIterations: process.env.AGENTGATE_CI_MAX_ITERATIONS,
      skipIfNoWorkflows: process.env.AGENTGATE_CI_SKIP_IF_NO_WORKFLOWS,
      logRetentionCount: process.env.AGENTGATE_CI_LOG_RETENTION_COUNT,
    },
  };

  const result = configSchema.safeParse(raw);

  if (!result.success) {
    log.error({ errors: result.error.errors }, 'Invalid configuration');
    throw new Error(`Configuration validation failed: ${result.error.message}`);
  }

  log.info(
    {
      maxConcurrentRuns: result.data.maxConcurrentRuns,
      maxSpawnDepth: result.data.maxSpawnDepth,
      maxChildrenPerParent: result.data.maxChildrenPerParent,
      maxTreeSize: result.data.maxTreeSize,
      ciEnabled: result.data.ci.enabled,
      ciMaxIterations: result.data.ci.maxIterations,
    },
    'Configuration loaded'
  );

  return result.data;
}

/**
 * Singleton configuration instance
 */
let configInstance: AgentGateConfig | null = null;

/**
 * Get the configuration singleton
 */
export function getConfig(): AgentGateConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Reset configuration (for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

/**
 * Get limits configuration for health endpoint
 */
export function getConfigLimits(): {
  maxConcurrentRuns: number;
  maxSpawnDepth: number;
  maxChildrenPerParent: number;
  maxTreeSize: number;
  defaultTimeoutSeconds: number;
} {
  const config = getConfig();
  return {
    maxConcurrentRuns: config.maxConcurrentRuns,
    maxSpawnDepth: config.maxSpawnDepth,
    maxChildrenPerParent: config.maxChildrenPerParent,
    maxTreeSize: config.maxTreeSize,
    defaultTimeoutSeconds: config.defaultTimeoutSeconds,
  };
}

/**
 * Get CI configuration for health endpoint
 */
export function getCIConfig(): CIConfig {
  const config = getConfig();
  return config.ci;
}
