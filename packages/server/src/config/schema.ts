/**
 * Configuration Schema Definitions
 * Centralized Zod schemas for all configuration sections.
 *
 * (v0.2.27 - Thrust 11: Configuration Registry System)
 */

import { z } from 'zod';

/**
 * Boolean string parser that handles 'true', 'false', '1', '0' strings properly
 */
export const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === 'boolean') return val;
    if (val === undefined || val === null || val === '') return undefined;
    const lower = String(val).toLowerCase().trim();
    return lower === 'true' || lower === '1';
  });

/**
 * Server configuration schema
 */
export const serverConfigSchema = z.object({
  /** HTTP server port */
  port: z.coerce.number().int().min(1).max(65535).default(3001),
  /** HTTP server host */
  host: z.string().default('0.0.0.0'),
  /** Enable CORS */
  cors: z.coerce.boolean().default(true),
  /** Request body size limit */
  bodySizeLimit: z.string().default('10mb'),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

/**
 * Execution configuration schema
 */
export const executionConfigSchema = z.object({
  /** Maximum concurrent runs */
  maxConcurrentRuns: z.coerce.number().int().min(1).max(100).default(5),
  /** Default timeout in seconds */
  defaultTimeoutSeconds: z.coerce.number().int().min(60).max(86400).default(3600),
  /** Poll interval in milliseconds */
  pollIntervalMs: z.coerce.number().int().min(1000).max(60000).default(5000),
  /** Lease duration in seconds */
  leaseDurationSeconds: z.coerce.number().int().min(300).max(86400).default(3600),
});

export type ExecutionConfig = z.infer<typeof executionConfigSchema>;

/**
 * Sandbox configuration schema
 */
export const sandboxConfigSchema = z.object({
  /** Provider selection mode */
  provider: z.enum(['auto', 'docker', 'subprocess']).default('auto'),
  /** Default Docker image */
  image: z.string().default('agentgate/agent:latest'),
  /** Network mode */
  networkMode: z.enum(['none', 'bridge', 'host']).default('none'),
  /** CPU limit per sandbox */
  cpuCount: z.coerce.number().min(1).max(16).default(2),
  /** Memory limit in MB */
  memoryMB: z.coerce.number().int().min(256).max(32768).default(4096),
  /** Timeout in seconds */
  timeoutSeconds: z.coerce.number().int().min(60).max(86400).default(3600),
  /** Cleanup interval in milliseconds */
  cleanupIntervalMs: z.coerce.number().int().min(0).max(3600000).default(300000),
});

export type SandboxConfig = z.infer<typeof sandboxConfigSchema>;

/**
 * GitHub configuration schema
 */
export const githubConfigSchema = z.object({
  /** GitHub API base URL */
  apiBaseUrl: z.string().default('https://api.github.com'),
  /** Rate limit reserve percentage */
  rateLimitReservePercent: z.coerce.number().min(0).max(50).default(10),
  /** Maximum retry attempts */
  maxRetries: z.coerce.number().int().min(1).max(10).default(5),
  /** Base delay for retries in ms */
  baseDelayMs: z.coerce.number().int().min(100).max(10000).default(1000),
});

export type GitHubConfig = z.infer<typeof githubConfigSchema>;

/**
 * CI configuration schema
 */
export const ciConfigSchema = z.object({
  /** Enable CI monitoring */
  enabled: z.coerce.boolean().default(true),
  /** Wait for CI by default */
  waitByDefault: z.coerce.boolean().default(true),
  /** Polling interval in ms */
  pollIntervalMs: z.coerce.number().int().min(5000).max(300000).default(30000),
  /** Maximum wait time in ms */
  timeoutMs: z.coerce.number().int().min(60000).max(7200000).default(1800000),
  /** Maximum iterations */
  maxIterations: z.coerce.number().int().min(1).max(10).default(3),
  /** Skip if no workflows */
  skipIfNoWorkflows: z.coerce.boolean().default(true),
  /** Log retention count */
  logRetentionCount: z.coerce.number().int().min(1).max(20).default(5),
});

export type CIConfig = z.infer<typeof ciConfigSchema>;

/**
 * Harness configuration schema
 */
export const harnessConfigSchema = z.object({
  /** Default harness profile */
  defaultProfile: z.string().default('default'),
  /** Profiles directory */
  profilesDir: z.string().optional(),
  /** Maximum spawn depth */
  maxSpawnDepth: z.coerce.number().int().min(1).max(10).default(3),
  /** Maximum children per parent */
  maxChildrenPerParent: z.coerce.number().int().min(1).max(50).default(10),
  /** Maximum tree size */
  maxTreeSize: z.coerce.number().int().min(1).max(1000).default(100),
});

export type HarnessConfig = z.infer<typeof harnessConfigSchema>;

/**
 * Logging configuration schema
 */
export const loggingConfigSchema = z.object({
  /** Minimum log level */
  level: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Output format */
  format: z.enum(['pretty', 'json']).default('pretty'),
  /** File output path */
  file: z.string().optional(),
  /** Fields to redact */
  redact: z.array(z.string()).default(['password', 'token', 'secret', 'apiKey']),
});

export type LoggingConfig = z.infer<typeof loggingConfigSchema>;

/**
 * WAL configuration schema
 */
export const walConfigSchema = z.object({
  /** Enable WAL */
  enabled: z.coerce.boolean().default(true),
  /** WAL storage directory */
  directory: z.string().optional(),
  /** Retention days */
  retentionDays: z.coerce.number().int().min(1).max(365).default(7),
  /** Max entries per run */
  maxEntriesPerRun: z.coerce.number().int().min(100).max(10000).default(1000),
});

export type WALConfig = z.infer<typeof walConfigSchema>;

/**
 * SDK configuration schema
 */
export const sdkConfigSchema = z.object({
  /** Query timeout in ms */
  timeoutMs: z.coerce.number().int().min(10000).max(3600000).default(300000),
  /** Enable sandbox */
  enableSandbox: booleanFromString.default(true),
  /** Log tool use */
  logToolUse: booleanFromString.default(true),
  /** Track file changes */
  trackFileChanges: booleanFromString.default(true),
  /** Maximum turns */
  maxTurns: z.coerce.number().int().min(1).max(500).default(100),
});

export type SDKConfig = z.infer<typeof sdkConfigSchema>;

/**
 * Verification configuration schema
 */
export const verificationConfigSchema = z.object({
  /** Enable local retry */
  localRetryEnabled: z.coerce.boolean().default(true),
  /** Enable CI retry */
  ciRetryEnabled: z.coerce.boolean().default(true),
});

export type VerificationConfig = z.infer<typeof verificationConfigSchema>;

/**
 * Complete configuration schema
 */
export const configSchema = z.object({
  server: serverConfigSchema,
  execution: executionConfigSchema,
  sandbox: sandboxConfigSchema,
  github: githubConfigSchema,
  ci: ciConfigSchema,
  harness: harnessConfigSchema,
  logging: loggingConfigSchema,
  wal: walConfigSchema,
  sdk: sdkConfigSchema,
  verification: verificationConfigSchema,
  /** Data directory */
  dataDir: z.string().default('.agentgate/data'),
});

export type AgentGateFullConfig = z.infer<typeof configSchema>;

/**
 * Configuration section names
 */
export type ConfigSection = keyof AgentGateFullConfig;

/**
 * Default configuration values
 */
export const defaultConfig: AgentGateFullConfig = configSchema.parse({
  server: {},
  execution: {},
  sandbox: {},
  github: {},
  ci: {},
  harness: {},
  logging: {},
  wal: {},
  sdk: {},
  verification: {},
});

/**
 * Get default value for a config path
 */
export function getDefaultValue(path: string): unknown {
  const parts = path.split('.');
  let current: unknown = defaultConfig;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Validate a partial configuration against schema
 */
export function validateConfig(config: unknown): { success: boolean; data?: AgentGateFullConfig; error?: z.ZodError } {
  const result = configSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
