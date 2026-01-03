/**
 * Execution Module (v0.2.24)
 *
 * Coordinates task execution using the TaskSpec-based system.
 *
 * @module execution
 */

// Coordinator
export {
  ExecutionCoordinator,
  createExecutionCoordinator,
  type ExecutionContext,
  type ExecutionCallbacks,
  type BuildContext,
  type SnapshotContext,
  type IterationResult,
  type ExecutionResult,
} from './coordinator.js';

// Workspace Provisioner
export {
  WorkspaceProvisioner,
  createWorkspaceProvisioner,
  type ProvisionResult,
} from './workspace-provisioner.js';
