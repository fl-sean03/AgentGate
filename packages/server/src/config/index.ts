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
/**
 * Verification loop configuration schema
 */
const verificationConfigSchema = z.object({
  /** Enable retry loop on local L0-L3 verification failure */
  localRetryEnabled: z.coerce.boolean().default(true),
  /** Enable retry loop on CI verification failure */
  ciRetryEnabled: z.coerce.boolean().default(true),
});

export type VerificationConfig = z.infer<typeof verificationConfigSchema>;

const ciConfigSchema = z.object({
  /** Enable CI monitoring */
  enabled: z.coerce.boolean().default(true),
  /** Wait for CI by default on new work orders */
  waitByDefault: z.coerce.boolean().default(true),
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
 * Boolean string parser that handles 'true', 'false', '1', '0' strings properly
 */
const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === 'boolean') return val;
    if (val === undefined || val === null || val === '') return undefined;
    const lower = String(val).toLowerCase().trim();
    return lower === 'true' || lower === '1';
  });

/**
 * SDK Driver configuration schema
 */
const sdkConfigSchema = z.object({
  /** SDK query timeout in milliseconds (10s - 1 hour) */
  timeoutMs: z.coerce.number().int().min(10000).max(3600000).default(300000),
  /** Enable SDK built-in sandboxing */
  enableSandbox: booleanFromString.default(true),
  /** Log all tool invocations */
  logToolUse: booleanFromString.default(true),
  /** Track file changes for verification */
  trackFileChanges: booleanFromString.default(true),
  /** Maximum conversation turns (1-500) */
  maxTurns: z.coerce.number().int().min(1).max(500).default(100),
});

export type SDKConfig = z.infer<typeof sdkConfigSchema>;

/**
 * Queue configuration schema (v0.2.22 - new queue system)
 */
const queueConfigSchema = z.object({
  /** Enable new queue system (default: false) */
  useNewQueueSystem: z.coerce.boolean().default(false),

  /** Run in shadow mode - both systems process (default: false) */
  shadowMode: z.coerce.boolean().default(false),

  /** Rollout percentage for gradual migration (0-100) */
  rolloutPercent: z.coerce.number().int().min(0).max(100).default(0),
});

export type QueueConfig = z.infer<typeof queueConfigSchema>;

/**
 * Sandbox configuration schema
 */
const sandboxConfigSchema = z.object({
  /** Provider selection mode: auto, docker, subprocess */
  provider: z.enum(['auto', 'docker', 'subprocess']).default('auto'),
  /** Default Docker image for agent containers */
  image: z.string().default('agentgate/agent:latest'),
  /** Network mode for sandboxes: none, bridge, host */
  networkMode: z.enum(['none', 'bridge', 'host']).default('none'),
  /** Default CPU limit per sandbox */
  cpuCount: z.coerce.number().min(1).max(16).default(2),
  /** Default memory limit in MB per sandbox */
  memoryMB: z.coerce.number().int().min(256).max(32768).default(4096),
  /** Default timeout in seconds per sandbox execution */
  timeoutSeconds: z.coerce.number().int().min(60).max(86400).default(3600),
  /** Cleanup interval in milliseconds (0 to disable) */
  cleanupIntervalMs: z.coerce.number().int().min(0).max(3600000).default(300000),
});

export type SandboxConfig = z.infer<typeof sandboxConfigSchema>;

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

  // Verification loop configuration
  verification: verificationConfigSchema,

  // SDK Driver configuration
  sdk: sdkConfigSchema,

  // Sandbox configuration
  sandbox: sandboxConfigSchema,

  // Queue configuration (v0.2.22 - new queue system)
  queue: queueConfigSchema,
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
      waitByDefault: process.env.AGENTGATE_CI_WAIT_BY_DEFAULT,
      pollIntervalMs: process.env.AGENTGATE_CI_POLL_INTERVAL_MS,
      timeoutMs: process.env.AGENTGATE_CI_TIMEOUT_MS,
      maxIterations: process.env.AGENTGATE_CI_MAX_ITERATIONS,
      skipIfNoWorkflows: process.env.AGENTGATE_CI_SKIP_IF_NO_WORKFLOWS,
      logRetentionCount: process.env.AGENTGATE_CI_LOG_RETENTION_COUNT,
    },
    // Verification loop configuration
    verification: {
      localRetryEnabled: process.env.AGENTGATE_VERIFICATION_LOCAL_RETRY_ENABLED,
      ciRetryEnabled: process.env.AGENTGATE_VERIFICATION_CI_RETRY_ENABLED,
    },
    // SDK Driver configuration
    sdk: {
      timeoutMs: process.env.AGENTGATE_SDK_TIMEOUT_MS,
      enableSandbox: process.env.AGENTGATE_SDK_ENABLE_SANDBOX,
      logToolUse: process.env.AGENTGATE_SDK_LOG_TOOL_USE,
      trackFileChanges: process.env.AGENTGATE_SDK_TRACK_FILE_CHANGES,
      maxTurns: process.env.AGENTGATE_SDK_MAX_TURNS,
    },
    // Sandbox configuration
    sandbox: {
      provider: process.env.AGENTGATE_SANDBOX_PROVIDER,
      image: process.env.AGENTGATE_SANDBOX_IMAGE,
      networkMode: process.env.AGENTGATE_SANDBOX_NETWORK_MODE,
      cpuCount: process.env.AGENTGATE_SANDBOX_CPU_COUNT,
      memoryMB: process.env.AGENTGATE_SANDBOX_MEMORY_MB,
      timeoutSeconds: process.env.AGENTGATE_SANDBOX_TIMEOUT_SECONDS,
      cleanupIntervalMs: process.env.AGENTGATE_SANDBOX_CLEANUP_INTERVAL_MS,
    },
    // Queue configuration (v0.2.22 - new queue system)
    queue: {
      useNewQueueSystem: process.env.AGENTGATE_QUEUE_USE_NEW_SYSTEM,
      shadowMode: process.env.AGENTGATE_QUEUE_SHADOW_MODE,
      rolloutPercent: process.env.AGENTGATE_QUEUE_ROLLOUT_PERCENT,
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
      sdkTimeoutMs: result.data.sdk.timeoutMs,
      sdkMaxTurns: result.data.sdk.maxTurns,
      sandboxProvider: result.data.sandbox.provider,
      sandboxImage: result.data.sandbox.image,
      queueUseNewSystem: result.data.queue.useNewQueueSystem,
      queueShadowMode: result.data.queue.shadowMode,
      queueRolloutPercent: result.data.queue.rolloutPercent,
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

/**
 * Get SDK configuration
 */
export function getSDKConfig(): SDKConfig {
  const config = getConfig();
  return config.sdk;
}

/**
 * Build SDK driver config from environment config
 */
export function buildSDKDriverConfig(): {
  timeoutMs: number;
  enableSandbox: boolean;
  maxTurns: number;
  hooks: {
    logToolUse: boolean;
    trackFileChanges: boolean;
  };
} {
  const sdk = getSDKConfig();
  return {
    timeoutMs: sdk.timeoutMs,
    enableSandbox: sdk.enableSandbox,
    maxTurns: sdk.maxTurns,
    hooks: {
      logToolUse: sdk.logToolUse,
      trackFileChanges: sdk.trackFileChanges,
    },
  };
}

/**
 * Get sandbox configuration
 */
export function getSandboxConfig(): SandboxConfig {
  const config = getConfig();
  return config.sandbox;
}

/**
 * Build sandbox manager config from environment config
 */
export function buildSandboxManagerConfig(): {
  provider: 'auto' | 'docker' | 'subprocess';
  defaultImage: string;
  defaultNetworkMode: 'none' | 'bridge' | 'host';
  defaultResourceLimits: {
    cpuCount: number;
    memoryMB: number;
    timeoutSeconds: number;
  };
  cleanupIntervalMs: number;
} {
  const sandbox = getSandboxConfig();
  return {
    provider: sandbox.provider,
    defaultImage: sandbox.image,
    defaultNetworkMode: sandbox.networkMode,
    defaultResourceLimits: {
      cpuCount: sandbox.cpuCount,
      memoryMB: sandbox.memoryMB,
      timeoutSeconds: sandbox.timeoutSeconds,
    },
    cleanupIntervalMs: sandbox.cleanupIntervalMs,
  };
}

/**
 * Get queue configuration (v0.2.22 - new queue system)
 */
export function getQueueConfig(): QueueConfig {
  const config = getConfig();
  return config.queue;
}
