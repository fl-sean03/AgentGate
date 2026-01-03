/**
 * Orchestrator module.
 * Coordinates all modules to execute work orders.
 */

// Main orchestrator
export {
  Orchestrator,
  createOrchestrator,
  type OrchestratorConfig,
} from './orchestrator.js';

// Engine bridge (v0.2.26)
export {
  createServicesFromCallbacks,
  captureInitialBeforeState,
  type ServiceFactoryOptions,
} from './engine-bridge.js';

// State machine
export {
  isTerminalState,
  canTransition,
  getNextState,
  applyTransition,
  getResultForEvent,
  getProgressDescription,
} from './state-machine.js';

// Run store
export {
  saveRun,
  loadRun,
  saveIterationData,
  loadIterationData,
  getAllIterationData,
  getRunStatus,
  listRuns,
  createRun,
} from './run-store.js';

// Error builder (v0.2.19 - Thrust 4)
export { ErrorBuilder } from './error-builder.js';
