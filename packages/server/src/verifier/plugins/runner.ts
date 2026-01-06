/**
 * Plugin Runner
 *
 * Executes verification plugins in order and collects results.
 */

import type {
  VerificationPlugin,
  VerificationContext,
  VerificationResult,
  CombinedVerificationResult,
  RunVerificationOptions,
} from './types.js';
import { PluginRegistry, defaultPluginRegistry } from './registry.js';

/**
 * Plugin Runner executes verification plugins
 */
export class PluginRunner {
  private registry: PluginRegistry;

  constructor(registry: PluginRegistry = defaultPluginRegistry) {
    this.registry = registry;
  }

  /**
   * Run all enabled plugins
   */
  async run(
    context: VerificationContext,
    options: RunVerificationOptions = {}
  ): Promise<CombinedVerificationResult> {
    const startTime = Date.now();
    const results: VerificationResult[] = [];

    // Get plugins to run
    let plugins: VerificationPlugin[];
    if (options.pluginIds && options.pluginIds.length > 0) {
      plugins = options.pluginIds
        .map((id) => this.registry.get(id))
        .filter((p): p is VerificationPlugin => p !== undefined && p.config.enabled);
    } else if (options.levels && options.levels.length > 0) {
      plugins = this.registry.getEnabledAtLevels(options.levels);
    } else {
      plugins = this.registry.getEnabled();
    }

    // Build context with previous results for chaining
    let currentContext: VerificationContext = { ...context };

    // Run plugins in priority order
    for (const plugin of plugins) {
      // Check total timeout
      if (options.totalTimeoutMs) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= options.totalTimeoutMs) {
          results.push({
            pluginId: plugin.config.id,
            status: 'skipped',
            level: plugin.config.level,
            summary: 'Skipped due to total timeout',
            checks: [],
            durationMs: 0,
          });
          continue;
        }
      }

      // Check if plugin should run
      try {
        const shouldRun = await plugin.shouldRun(currentContext);
        if (!shouldRun) {
          results.push({
            pluginId: plugin.config.id,
            status: 'skipped',
            level: plugin.config.level,
            summary: 'Skipped (shouldRun returned false)',
            checks: [],
            durationMs: 0,
          });
          continue;
        }
      } catch (error) {
        results.push({
          pluginId: plugin.config.id,
          status: 'error',
          level: plugin.config.level,
          summary: 'Error checking shouldRun',
          checks: [],
          durationMs: 0,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      // Run the plugin
      const pluginStart = Date.now();
      try {
        const result = await this.runWithTimeout(
          plugin,
          currentContext,
          context.timeoutMs || 300000 // 5 min default
        );
        results.push(result);

        // Update context with results for next plugin
        currentContext = {
          ...currentContext,
          previousResults: [...results],
        };

        // Check if we should stop
        if (
          options.stopOnFail &&
          result.status === 'failed' &&
          !result.continueOnFail &&
          !plugin.config.continueOnFail
        ) {
          break;
        }
      } catch (error) {
        const durationMs = Date.now() - pluginStart;
        results.push({
          pluginId: plugin.config.id,
          status: 'error',
          level: plugin.config.level,
          summary: 'Plugin threw an error',
          checks: [],
          durationMs,
          error: error instanceof Error ? error.message : String(error),
        });

        // Check if we should stop on error
        if (options.stopOnFail && !plugin.config.continueOnFail) {
          break;
        }
      }
    }

    // Calculate summary
    const totalDurationMs = Date.now() - startTime;
    const summary = {
      total: results.length,
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      warnings: results.filter((r) => r.status === 'warning').length,
      errors: results.filter((r) => r.status === 'error').length,
    };

    // Determine overall pass/fail
    const passed =
      summary.failed === 0 &&
      summary.errors === 0 &&
      (summary.passed > 0 || summary.skipped === summary.total);

    return {
      passed,
      results,
      totalDurationMs,
      summary,
    };
  }

  /**
   * Run a single plugin
   */
  async runSingle(
    pluginId: string,
    context: VerificationContext
  ): Promise<VerificationResult | undefined> {
    const plugin = this.registry.get(pluginId);
    if (!plugin) {
      return undefined;
    }

    try {
      return await this.runWithTimeout(
        plugin,
        context,
        context.timeoutMs || 300000
      );
    } catch (error) {
      return {
        pluginId,
        status: 'error',
        level: plugin.config.level,
        summary: 'Plugin threw an error',
        checks: [],
        durationMs: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run a plugin with timeout
   */
  private async runWithTimeout(
    plugin: VerificationPlugin,
    context: VerificationContext,
    timeoutMs: number
  ): Promise<VerificationResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve({
          pluginId: plugin.config.id,
          status: 'error',
          level: plugin.config.level,
          summary: `Plugin timed out after ${timeoutMs}ms`,
          checks: [],
          durationMs: timeoutMs,
          error: 'Timeout',
        });
      }, timeoutMs);

      plugin
        .verify(context)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}

// Global default runner instance
export const defaultPluginRunner = new PluginRunner();
