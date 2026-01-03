/**
 * TaskSpec Module (v0.2.24)
 *
 * Provides utilities for loading, resolving, and converting TaskSpec configurations.
 *
 * @module task-spec
 */

// Loader exports
export {
  taskSpecSchema,
  type LoadOptions,
  type LoadResult,
  type TaskSpecLoader,
  createTaskSpecLoader,
  getDefaultLoader,
  loadTaskSpec,
  parseTaskSpec,
  loadProfile,
} from './loader.js';

// Resolver exports
export {
  DEFAULT_CONVERGENCE_CONFIG,
  DEFAULT_CONVERGENCE_LIMITS,
  DEFAULT_FAILURE_POLICY,
  DEFAULT_GIT_SPEC,
  DEFAULT_AGENT_SPEC,
  DEFAULT_SANDBOX_SPEC,
  type ResolveOptions,
  type TaskSpecOverrides,
  type TaskSpecResolver,
  createTaskSpecResolver,
  getDefaultResolver,
  resolveTaskSpec,
  computeTaskSpecHash,
} from './resolver.js';

// Converter exports
export {
  type ConvertOptions,
  type ConvertResult,
  type TaskSpecConverter,
  createTaskSpecConverter,
  getDefaultConverter,
  convertHarnessToTaskSpec,
  createMinimalTaskSpec,
} from './converter.js';
