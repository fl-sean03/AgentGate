/**
 * Sandbox Module
 *
 * Provides pluggable sandbox providers for isolated agent execution.
 */

// Types
export type {
  NetworkMode,
  ProviderMode,
  ResourceLimits,
  SandboxConfig,
  SandboxStatus,
  ExecOptions,
  ExecResult,
  SandboxStats,
  Sandbox,
  SandboxProvider,
} from './types.js';

// Base provider class and constants
export {
  BaseSandboxProvider,
  DEFAULT_RESOURCE_LIMITS,
  DEFAULT_WORKSPACE_MOUNT,
} from './provider.js';

// Subprocess provider (fallback, no isolation)
export { SubprocessProvider } from './subprocess-provider.js';

// Docker provider (container isolation)
export { DockerProvider } from './docker-provider.js';

// Docker client
export {
  DockerClient,
  getDockerClient,
  type ContainerExecResult,
  type ContainerStats,
  type DockerVersionInfo,
} from './docker-client.js';

// Sandbox manager
export {
  SandboxManager,
  getSandboxManager,
  createSandbox,
  type SandboxManagerConfig,
  type SandboxSystemStatus,
} from './manager.js';

// Sandbox Registry (v0.2.27 - Thrust 4: Guaranteed Sandbox Cleanup)
export {
  SandboxRegistry,
  getSandboxRegistry,
  type SandboxRegistryEntry,
  type SandboxType,
  type RegistryStatus,
  type RegistryConfig,
} from './registry.js';

// Orphan Detector (v0.2.27 - Thrust 4: Guaranteed Sandbox Cleanup)
export {
  detectAndCleanupOrphans,
  runStartupCleanup,
  cleanupSandboxById,
  forceCleanupAll,
  getCleanupStats,
  type OrphanCleanupResult,
  type CleanupConfig,
} from './orphan-detector.js';
