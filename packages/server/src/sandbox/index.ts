/**
 * Sandbox Module
 *
 * Provides pluggable sandbox providers for isolated agent execution.
 */

// Types
export type {
  NetworkMode,
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
  type ProviderMode,
  type SandboxManagerConfig,
  type SandboxSystemStatus,
} from './manager.js';
