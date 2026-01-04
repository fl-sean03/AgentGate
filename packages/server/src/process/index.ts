/**
 * Process Module
 *
 * Provides process tracking, spawn management, and resource enforcement.
 * (v0.2.27 - Thrusts 8-10)
 */

// Process Tracker (Thrust 8)
export {
  ProcessTracker,
  getProcessTracker,
  type TrackedProcess,
  type ProcessType,
  type ProcessStatus,
  type TrackerConfig,
} from './tracker.js';

// Spawn Tracker (Thrust 9)
export {
  SpawnTracker,
  getSpawnTracker,
  type SpawnChainEntry,
  type DeadlockResult,
  type SpawnTrackerOptions,
} from './spawn-tracker.js';

// Resource Enforcer (Thrust 10)
export {
  ResourceEnforcer,
  createResourceEnforcer,
  RESOURCE_PRESETS,
  type ResourceLimits,
  type ResourceUsage,
  type ResourceViolation,
  type EnforcementAction,
  type EnforcementResult,
  type ResourceEnforcerOptions,
} from './resource-enforcer.js';
