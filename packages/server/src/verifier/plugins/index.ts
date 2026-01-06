/**
 * Verification Plugin System
 *
 * A pluggable verification system that allows custom and built-in
 * verification plugins to be registered and executed.
 */

// Export types
export type {
  VerificationLevel,
  VerificationStatus,
  VerificationContext,
  VerificationCheck,
  VerificationResult,
  PluginConfig,
  VerificationPlugin,
  PluginFactory,
  RunVerificationOptions,
  CombinedVerificationResult,
} from './types.js';

// Export registry
export {
  PluginRegistry,
  defaultPluginRegistry,
} from './registry.js';

// Export runner
export {
  PluginRunner,
  defaultPluginRunner,
} from './runner.js';

// Export base plugin class
export { BasePlugin } from './base-plugin.js';

// Export built-in plugins
export {
  LintPlugin,
  lintPlugin,
  TestPlugin,
  testPlugin,
  builtInPlugins,
  registerBuiltInPlugins,
} from './built-in/index.js';
