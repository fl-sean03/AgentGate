/**
 * Built-in Verification Plugins
 *
 * Exports all built-in plugins and registers them with the default registry.
 */

export { LintPlugin, lintPlugin } from './lint-plugin.js';
export { TestPlugin, testPlugin } from './test-plugin.js';

import { lintPlugin } from './lint-plugin.js';
import { testPlugin } from './test-plugin.js';
import type { VerificationPlugin } from '../types.js';

/**
 * All built-in plugins
 */
export const builtInPlugins: VerificationPlugin[] = [
  lintPlugin,
  testPlugin,
];

/**
 * Register all built-in plugins with a registry
 */
import { PluginRegistry, defaultPluginRegistry } from '../registry.js';

export function registerBuiltInPlugins(
  registry: PluginRegistry = defaultPluginRegistry
): void {
  for (const plugin of builtInPlugins) {
    if (!registry.has(plugin.config.id)) {
      registry.register(plugin);
    }
  }
}

// Auto-register with default registry
registerBuiltInPlugins();
