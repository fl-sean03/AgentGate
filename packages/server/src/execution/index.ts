/**
 * Execution Module (v0.2.25)
 *
 * Coordinates task execution using the TaskSpec-based system.
 *
 * @module execution
 */

// v0.2.25: Unified ExecutionEngine
export {
  DefaultExecutionEngine,
  createExecutionEngine,
  ConcurrencyLimitError,
  RunNotFoundError,
  type ExecutionEngine,
} from './engine.js';

// v0.2.25: Context types
export {
  createDefaultEngineConfig,
  type ExecutionContext,
  type ExecutionState,
  type ExecutionStatus,
  type ExecutionInput,
  type ExecutionResult,
  type ExecutionMetrics,
  type ExecutionEngineConfig,
  type IterationData,
  type DeliveryResult,
} from './context.js';

// v0.2.25: Phase handlers
export * from './phases/index.js';

// Legacy Coordinator (deprecated - use ExecutionEngine)
export {
  ExecutionCoordinator,
  createExecutionCoordinator,
  type ExecutionCallbacks,
  type BuildContext,
  type SnapshotContext,
  type IterationResult as LegacyIterationResult,
  type ExecutionResult as LegacyExecutionResult,
} from './coordinator.js';

// Workspace Provisioner
export {
  WorkspaceProvisioner,
  createWorkspaceProvisioner,
  type ProvisionResult,
} from './workspace-provisioner.js';
