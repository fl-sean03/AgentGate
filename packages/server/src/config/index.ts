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
