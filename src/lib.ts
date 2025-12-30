/**
 * AgentGate Library API
 *
 * Exports all public modules for programmatic usage.
 */

// Types
export * from './types/index.js';

// Orchestrator (main entry point)
export {
  Orchestrator,
  createOrchestrator,
  type OrchestratorConfig,
} from './orchestrator/index.js';

// Workspace Management
export * as workspace from './workspace/index.js';

// Gate Resolution
export * as gate from './gate/index.js';

// Verification
export * as verifier from './verifier/index.js';

// Snapshot
export * as snapshot from './snapshot/index.js';

// Feedback
export * as feedback from './feedback/index.js';

// Artifacts
export * as artifacts from './artifacts/index.js';

// Agent Drivers
export * as agent from './agent/index.js';

// Control Plane
export * as controlPlane from './control-plane/index.js';

// Utilities
export { createLogger, logger } from './utils/logger.js';
export { createTempDir, removeTempDir } from './utils/temp.js';
