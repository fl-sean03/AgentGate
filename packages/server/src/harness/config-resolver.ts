/**
 * Config Resolver Module
 *
 * Handles configuration resolution with inheritance support, merging profiles
 * and applying defaults to produce a fully-resolved ResolvedHarnessConfig.
 *
 * @module harness/config-resolver
 */

import * as crypto from 'node:crypto';
import {
  harnessConfigSchema,
  type HarnessConfig,
  type ResolvedHarnessConfig,
  type LoopStrategyConfig,
  type AgentDriverConfig,
  type VerificationConfig,
  type GitOpsConfig,
  type ExecutionLimits,
  LoopStrategyMode,
  GitOperationMode,
} from '../types/harness-config.js';
import { loadProfile, profileExists } from './config-loader.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('config-resolver');

/**
 * Maximum inheritance depth to prevent infinite loops
 */
const MAX_INHERITANCE_DEPTH = 10;

/**
 * Error thrown when circular inheritance is detected.
 */
export class CircularInheritanceError extends Error {
  constructor(
    public readonly chain: string[],
    public readonly duplicateProfile: string
  ) {
    super(
      `Circular inheritance detected: ${chain.join(' -> ')} -> ${duplicateProfile}`
    );
    this.name = 'CircularInheritanceError';
  }
}

/**
 * Error thrown when inheritance depth limit is exceeded.
 */
export class InheritanceDepthError extends Error {
  constructor(
    public readonly chain: string[],
    public readonly maxDepth: number
  ) {
    super(
      `Inheritance depth limit exceeded (max ${maxDepth}): ${chain.join(' -> ')}`
    );
    this.name = 'InheritanceDepthError';
  }
}

/**
 * Options for resolving harness configuration.
 */
export interface ResolveOptions {
  /** Named profile to load from ~/.agentgate/harnesses/ */
  profileName?: string;
  /** Direct path to profile file */
  profilePath?: string;
  /** CLI option overrides (highest priority) */
  cliOverrides?: Partial<HarnessConfig>;
  /** Workspace path for relative path resolution */
  workspacePath?: string;
}

/**
 * CLI options that map to harness config paths.
 */
export interface CLIOptions {
  maxIterations?: number;
  maxTime?: number;
  agent?: string;
  gatePlan?: string;
  waitForCi?: boolean;
  skipVerification?: string[];
  network?: boolean;
  loopStrategy?: string;
  completion?: string[];
}

/**
 * Default agent driver configuration.
 */
const DEFAULT_AGENT_DRIVER: AgentDriverConfig = {
  type: 'claude-code-subscription',
};

/**
 * Default verification configuration.
 */
const DEFAULT_VERIFICATION: Required<VerificationConfig> = {
  skipLevels: [],
  timeoutMs: 300000,
  cleanRoom: true,
  parallelTests: true,
  retryFlaky: false,
  maxRetries: 0,
};

/**
 * Default git ops configuration.
 */
const DEFAULT_GIT_OPS: Required<GitOpsConfig> = {
  mode: GitOperationMode.LOCAL,
  branchPrefix: 'agentgate/',
  commitMessagePrefix: '[AgentGate]',
  autoCommit: true,
  autoPush: false,
  createPR: false,
  prDraft: true,
  prReviewers: [],
  prLabels: [],
};

/**
 * Default execution limits.
 */
const DEFAULT_EXECUTION_LIMITS: Required<ExecutionLimits> = {
  maxWallClockSeconds: 3600,
  maxIterationSeconds: 600,
  maxTotalTokens: 1000000,
  maxIterationTokens: 100000,
  maxDiskMb: 1024,
  maxMemoryMb: 2048,
  maxConcurrentAgents: 1,
};

/**
 * Default loop strategy configuration.
 */
const DEFAULT_LOOP_STRATEGY: LoopStrategyConfig = {
  mode: LoopStrategyMode.HYBRID,
  baseIterations: 3,
  maxBonusIterations: 2,
  progressThreshold: 0.1,
  completionDetection: ['verification_pass', 'no_changes'],
  progressTracking: 'git_history',
};

/**
 * Resolves the inheritance chain for a configuration.
 *
 * @param config - The starting configuration
 * @param chain - The current inheritance chain (for cycle detection)
 * @returns Array of configs from root to leaf (oldest to newest)
 */
export async function resolveInheritance(
  config: HarnessConfig,
  chain: string[] = []
): Promise<HarnessConfig[]> {
  // Check depth limit
  if (chain.length >= MAX_INHERITANCE_DEPTH) {
    throw new InheritanceDepthError(chain, MAX_INHERITANCE_DEPTH);
  }

  // Get current profile name for cycle detection
  const currentName = config.metadata?.name as string | undefined;
  const profileId = currentName ?? `anonymous-${chain.length}`;

  // Check for circular inheritance
  if (chain.includes(profileId)) {
    throw new CircularInheritanceError(chain, profileId);
  }

  // Add current to chain
  const newChain = [...chain, profileId];

  // If no extends, this is the root
  const extendsProfile = config.metadata?.extends as string | undefined;
  if (!extendsProfile) {
    return [config];
  }

  // Check if parent exists
  const parentExists = await profileExists(extendsProfile);
  if (!parentExists) {
    logger.warn(
      { profile: extendsProfile, chain: newChain },
      'Parent profile not found, treating as root'
    );
    return [config];
  }

  // Load and resolve parent
  const parentConfig = await loadProfile(extendsProfile);
  const parentChain = await resolveInheritance(parentConfig, newChain);

  // Return parent chain + current config
  return [...parentChain, config];
}

/**
 * Deep merges two objects.
 * Arrays are replaced, not merged.
 * Objects are recursively merged.
 * Primitives are replaced.
 *
 * @param target - The base object
 * @param source - The object to merge in
 * @returns The merged object
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (sourceValue === undefined) {
      continue;
    }

    // Arrays are replaced, not merged
    if (Array.isArray(sourceValue)) {
      result[key] = [...sourceValue] as T[keyof T];
      continue;
    }

    // Objects are recursively merged
    if (
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
      continue;
    }

    // Primitives are replaced
    result[key] = sourceValue as T[keyof T];
  }

  return result;
}

/**
 * Merges multiple configurations in order.
 * Later configurations override earlier ones.
 *
 * @param configs - Array of configs from root to leaf
 * @returns Merged configuration
 */
export function mergeConfigs(configs: HarnessConfig[]): HarnessConfig {
  if (configs.length === 0) {
    return harnessConfigSchema.parse({});
  }

  const firstConfig = configs[0];
  if (!firstConfig) {
    return harnessConfigSchema.parse({});
  }

  if (configs.length === 1) {
    return firstConfig;
  }

  let result: HarnessConfig = firstConfig;
  for (let i = 1; i < configs.length; i++) {
    const nextConfig = configs[i];
    if (nextConfig) {
      result = deepMerge(result, nextConfig);
    }
  }

  return result;
}

/**
 * Maps CLI options to harness config overrides.
 *
 * @param options - CLI options
 * @returns Partial harness config
 */
export function cliOptionsToOverrides(options: CLIOptions): Partial<HarnessConfig> {
  const overrides: Partial<HarnessConfig> = {};

  // Loop strategy overrides
  if (options.maxIterations !== undefined || options.loopStrategy !== undefined) {
    const loopStrategy: Partial<LoopStrategyConfig> = {};

    if (options.loopStrategy !== undefined) {
      // This will be validated later
      (loopStrategy as Record<string, unknown>).mode = options.loopStrategy;
    }

    if (options.maxIterations !== undefined) {
      // Different strategies use different field names
      (loopStrategy as Record<string, unknown>).maxIterations = options.maxIterations;
      (loopStrategy as Record<string, unknown>).baseIterations = options.maxIterations;
    }

    overrides.loopStrategy = loopStrategy as LoopStrategyConfig;
  }

  // Execution limits overrides
  if (options.maxTime !== undefined) {
    overrides.executionLimits = {
      maxWallClockSeconds: options.maxTime,
    } as ExecutionLimits;
  }

  // Agent driver overrides
  if (options.agent !== undefined) {
    overrides.agentDriver = {
      type: options.agent as AgentDriverConfig['type'],
    };
  }

  // Verification overrides
  if (options.skipVerification !== undefined || options.waitForCi !== undefined) {
    overrides.verification = {} as VerificationConfig;

    if (options.skipVerification !== undefined) {
      (overrides.verification as Record<string, unknown>).skipLevels = options.skipVerification;
    }
  }

  // Git ops overrides
  if (options.gatePlan !== undefined || options.waitForCi !== undefined) {
    overrides.gitOps = {} as GitOpsConfig;

    if (options.waitForCi !== undefined) {
      (overrides.gitOps as Record<string, unknown>).createPR = options.waitForCi;
    }
  }

  return overrides;
}

/**
 * Applies CLI overrides to a configuration.
 *
 * @param config - Base configuration
 * @param overrides - CLI overrides
 * @returns Configuration with overrides applied
 */
export function applyCLIOverrides(
  config: HarnessConfig,
  overrides: Partial<HarnessConfig>
): HarnessConfig {
  return deepMerge(config, overrides);
}

/**
 * Applies defaults to produce a fully-resolved configuration.
 *
 * @param config - Partially configured harness config
 * @returns Fully resolved configuration with all required fields
 */
export function applyDefaults(config: HarnessConfig): ResolvedHarnessConfig {
  // Start with validated config
  const validated = harnessConfigSchema.parse(config);

  // Build resolved config with all defaults
  const resolved: ResolvedHarnessConfig = {
    version: '1.0',
    loopStrategy: validated.loopStrategy ?? DEFAULT_LOOP_STRATEGY,
    agentDriver: validated.agentDriver ?? DEFAULT_AGENT_DRIVER,
    verification: {
      ...DEFAULT_VERIFICATION,
      ...validated.verification,
    },
    gitOps: {
      ...DEFAULT_GIT_OPS,
      ...validated.gitOps,
    },
    executionLimits: {
      ...DEFAULT_EXECUTION_LIMITS,
      ...validated.executionLimits,
    },
    metadata: validated.metadata ?? {},
  };

  return resolved;
}

/**
 * Computes a deterministic hash of a configuration.
 *
 * @param config - The configuration to hash
 * @returns 16-character hex hash
 */
export function computeConfigHash(config: ResolvedHarnessConfig): string {
  // Sort keys recursively for deterministic serialization
  const sortedJson = JSON.stringify(config, (_, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      return Object.keys(obj)
        .sort()
        .reduce(
          (acc, key) => {
            acc[key] = obj[key];
            return acc;
          },
          {} as Record<string, unknown>
        );
    }
    return value;
  });

  // Compute SHA256 and return first 16 chars
  return crypto.createHash('sha256').update(sortedJson).digest('hex').substring(0, 16);
}

/**
 * Resolves a harness configuration from options.
 *
 * Resolution order (lowest to highest priority):
 * 1. Built-in defaults
 * 2. Profile inheritance chain (parent -> child)
 * 3. Named profile / profile path
 * 4. CLI overrides
 *
 * @param options - Resolution options
 * @returns Fully resolved harness configuration
 */
export async function resolveHarnessConfig(
  options: ResolveOptions = {}
): Promise<ResolvedHarnessConfig> {
  logger.debug({ options }, 'Resolving harness configuration');

  let baseConfig: HarnessConfig = harnessConfigSchema.parse({});

  // Load profile if specified
  if (options.profilePath) {
    baseConfig = await loadProfile(options.profilePath);
    logger.debug({ path: options.profilePath }, 'Loaded profile from path');
  } else if (options.profileName) {
    baseConfig = await loadProfile(options.profileName);
    logger.debug({ name: options.profileName }, 'Loaded named profile');
  }

  // Resolve inheritance chain
  const inheritanceChain = await resolveInheritance(baseConfig);
  logger.debug(
    { chainLength: inheritanceChain.length },
    'Resolved inheritance chain'
  );

  // Merge all configs in chain
  let mergedConfig = mergeConfigs(inheritanceChain);

  // Apply CLI overrides (highest priority)
  if (options.cliOverrides) {
    mergedConfig = applyCLIOverrides(mergedConfig, options.cliOverrides);
    logger.debug('Applied CLI overrides');
  }

  // Apply defaults to get fully resolved config
  const resolved = applyDefaults(mergedConfig);

  // Compute hash for audit
  const hash = computeConfigHash(resolved);
  logger.info({ hash }, 'Configuration resolved');

  return resolved;
}

/**
 * Creates a ResolvedHarnessConfig with sensible defaults.
 * Useful for testing and when no profile is specified.
 */
export function createDefaultConfig(): ResolvedHarnessConfig {
  return applyDefaults(harnessConfigSchema.parse({}));
}
