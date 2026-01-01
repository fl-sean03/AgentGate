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

// Docker client
export {
  DockerClient,
  AGENTGATE_CONTAINER_LABEL,
  type ContainerStats,
  type ExecOptions as DockerExecOptions,
} from './docker-client.js';

// Docker provider (container isolation)
export { DockerProvider, DEFAULT_AGENT_IMAGE } from './docker-provider.js';

// Sandbox manager
export {
  SandboxManager,
  getSandboxManager,
  resetSandboxManager,
  initializeSandboxManager,
  type SandboxProviderType,
  type SandboxManagerConfig,
  type SandboxSystemStatus,
} from './manager.js';
