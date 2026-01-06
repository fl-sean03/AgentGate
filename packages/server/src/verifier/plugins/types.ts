/**
 * Verification Plugin Types
 *
 * Defines the interfaces for the pluggable verification system.
 */

/**
 * Verification levels - from least to most rigorous
 */
export type VerificationLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'custom';

/**
 * Result status for a verification check
 */
export type VerificationStatus = 'passed' | 'failed' | 'skipped' | 'warning' | 'error';

/**
 * Context provided to verification plugins
 */
export interface VerificationContext {
  /** Working directory of the workspace */
  workDir: string;
  /** The task prompt/description */
  taskPrompt: string;
  /** Git diff of changes made */
  gitDiff?: string;
  /** Files that were modified */
  modifiedFiles?: string[];
  /** The harness command to use */
  harness?: string;
  /** Maximum time allowed for verification (ms) */
  timeoutMs?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Results from previous plugins (for chaining) */
  previousResults?: VerificationResult[];
}

/**
 * A single check result within a verification
 */
export interface VerificationCheck {
  /** Name of the check */
  name: string;
  /** Status of the check */
  status: VerificationStatus;
  /** Human-readable message */
  message?: string;
  /** Detailed output (e.g., test output, error logs) */
  details?: string;
  /** Duration of the check in milliseconds */
  durationMs?: number;
  /** File associated with this check */
  file?: string;
  /** Line number if applicable */
  line?: number;
}

/**
 * Result of running a verification plugin
 */
export interface VerificationResult {
  /** Plugin ID that produced this result */
  pluginId: string;
  /** Overall status */
  status: VerificationStatus;
  /** Verification level of this plugin */
  level: VerificationLevel;
  /** Summary message */
  summary: string;
  /** Individual checks performed */
  checks: VerificationCheck[];
  /** Total duration in milliseconds */
  durationMs: number;
  /** Whether verification should continue to next plugin */
  continueOnFail?: boolean;
  /** Error if plugin failed to run */
  error?: string;
}

/**
 * Configuration for a verification plugin
 */
export interface PluginConfig {
  /** Unique plugin identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of what this plugin verifies */
  description?: string;
  /** Verification level */
  level: VerificationLevel;
  /** Priority (lower = runs first) */
  priority: number;
  /** Whether this plugin is enabled */
  enabled: boolean;
  /** Whether to continue verification if this plugin fails */
  continueOnFail?: boolean;
  /** Custom configuration options */
  options?: Record<string, unknown>;
}

/**
 * Verification Plugin Interface
 *
 * All verification plugins must implement this interface.
 */
export interface VerificationPlugin {
  /** Plugin configuration */
  config: PluginConfig;

  /**
   * Check if this plugin should run for the given context
   * @param context The verification context
   * @returns true if the plugin should run
   */
  shouldRun(context: VerificationContext): boolean | Promise<boolean>;

  /**
   * Run the verification
   * @param context The verification context
   * @returns The verification result
   */
  verify(context: VerificationContext): Promise<VerificationResult>;
}

/**
 * Plugin factory function type
 */
export type PluginFactory = (options?: Record<string, unknown>) => VerificationPlugin;

/**
 * Options for running verification
 */
export interface RunVerificationOptions {
  /** Only run plugins at these levels */
  levels?: VerificationLevel[];
  /** Only run plugins with these IDs */
  pluginIds?: string[];
  /** Stop on first failure */
  stopOnFail?: boolean;
  /** Maximum total time for all verifications */
  totalTimeoutMs?: number;
}

/**
 * Combined result of running multiple plugins
 */
export interface CombinedVerificationResult {
  /** Overall pass/fail status */
  passed: boolean;
  /** Individual plugin results */
  results: VerificationResult[];
  /** Total duration across all plugins */
  totalDurationMs: number;
  /** Summary counts */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    warnings: number;
    errors: number;
  };
}
