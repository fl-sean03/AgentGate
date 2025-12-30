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

// Run executor
export {
  executeRun,
  cancelRun,
  type RunExecutorOptions,
} from './run-executor.js';

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
