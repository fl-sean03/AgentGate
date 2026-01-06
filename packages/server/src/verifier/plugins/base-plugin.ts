/**
 * Base Plugin
 *
 * Abstract base class for verification plugins.
 */

import type {
  VerificationPlugin,
  PluginConfig,
  VerificationContext,
  VerificationResult,
  VerificationStatus,
  VerificationCheck,
  VerificationLevel,
} from './types.js';

/**
 * Abstract base class for verification plugins
 */
export abstract class BasePlugin implements VerificationPlugin {
  config: PluginConfig;

  constructor(config: Partial<PluginConfig> & { id: string; name: string }) {
    this.config = {
      id: config.id,
      name: config.name,
      description: config.description,
      level: config.level || 'custom',
      priority: config.priority ?? 100,
      enabled: config.enabled ?? true,
      continueOnFail: config.continueOnFail ?? false,
      options: config.options,
    };
  }

  /**
   * Override to customize when the plugin should run
   * Default: always runs
   */
  shouldRun(_context: VerificationContext): boolean | Promise<boolean> {
    return true;
  }

  /**
   * Implement this method to perform the verification
   */
  abstract verify(context: VerificationContext): Promise<VerificationResult>;

  /**
   * Helper to create a successful result
   */
  protected success(
    summary: string,
    checks: VerificationCheck[] = [],
    durationMs: number = 0
  ): VerificationResult {
    return {
      pluginId: this.config.id,
      status: 'passed',
      level: this.config.level,
      summary,
      checks,
      durationMs,
      continueOnFail: this.config.continueOnFail,
    };
  }

  /**
   * Helper to create a failed result
   */
  protected failure(
    summary: string,
    checks: VerificationCheck[] = [],
    durationMs: number = 0
  ): VerificationResult {
    return {
      pluginId: this.config.id,
      status: 'failed',
      level: this.config.level,
      summary,
      checks,
      durationMs,
      continueOnFail: this.config.continueOnFail,
    };
  }

  /**
   * Helper to create a skipped result
   */
  protected skipped(
    summary: string,
    durationMs: number = 0
  ): VerificationResult {
    return {
      pluginId: this.config.id,
      status: 'skipped',
      level: this.config.level,
      summary,
      checks: [],
      durationMs,
    };
  }

  /**
   * Helper to create a warning result
   */
  protected warning(
    summary: string,
    checks: VerificationCheck[] = [],
    durationMs: number = 0
  ): VerificationResult {
    return {
      pluginId: this.config.id,
      status: 'warning',
      level: this.config.level,
      summary,
      checks,
      durationMs,
      continueOnFail: this.config.continueOnFail,
    };
  }

  /**
   * Helper to create an error result
   */
  protected error(
    summary: string,
    error: string,
    durationMs: number = 0
  ): VerificationResult {
    return {
      pluginId: this.config.id,
      status: 'error',
      level: this.config.level,
      summary,
      checks: [],
      durationMs,
      error,
    };
  }

  /**
   * Helper to create a check
   */
  protected check(
    name: string,
    status: VerificationStatus,
    options: {
      message?: string;
      details?: string;
      durationMs?: number;
      file?: string;
      line?: number;
    } = {}
  ): VerificationCheck {
    return {
      name,
      status,
      message: options.message,
      details: options.details,
      durationMs: options.durationMs,
      file: options.file,
      line: options.line,
    };
  }
}
