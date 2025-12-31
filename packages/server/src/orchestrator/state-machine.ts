/**
 * State machine for run execution.
 * Manages state transitions for the build-verify-feedback loop.
 */

import { RunState, RunEvent, RunResult, type Run } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('state-machine');

/**
 * State transition table.
 * Maps (current state, event) -> next state
 */
const transitions: Record<RunState, Partial<Record<RunEvent, RunState>>> = {
  [RunState.QUEUED]: {
    [RunEvent.WORKSPACE_ACQUIRED]: RunState.LEASED,
    [RunEvent.USER_CANCELED]: RunState.CANCELED,
    [RunEvent.SYSTEM_ERROR]: RunState.FAILED,
  },
  [RunState.LEASED]: {
    [RunEvent.BUILD_STARTED]: RunState.BUILDING,
    [RunEvent.USER_CANCELED]: RunState.CANCELED,
    [RunEvent.SYSTEM_ERROR]: RunState.FAILED,
  },
  [RunState.BUILDING]: {
    [RunEvent.BUILD_COMPLETED]: RunState.SNAPSHOTTING,
    [RunEvent.BUILD_FAILED]: RunState.FAILED,
    [RunEvent.USER_CANCELED]: RunState.CANCELED,
    [RunEvent.SYSTEM_ERROR]: RunState.FAILED,
  },
  [RunState.SNAPSHOTTING]: {
    [RunEvent.SNAPSHOT_COMPLETED]: RunState.VERIFYING,
    [RunEvent.SNAPSHOT_FAILED]: RunState.FAILED,
    [RunEvent.USER_CANCELED]: RunState.CANCELED,
    [RunEvent.SYSTEM_ERROR]: RunState.FAILED,
  },
  [RunState.VERIFYING]: {
    [RunEvent.VERIFY_PASSED]: RunState.SUCCEEDED,
    [RunEvent.VERIFY_FAILED_RETRYABLE]: RunState.FEEDBACK,
    [RunEvent.VERIFY_FAILED_TERMINAL]: RunState.FAILED,
    [RunEvent.USER_CANCELED]: RunState.CANCELED,
    [RunEvent.SYSTEM_ERROR]: RunState.FAILED,
  },
  [RunState.FEEDBACK]: {
    [RunEvent.FEEDBACK_GENERATED]: RunState.BUILDING,
    [RunEvent.USER_CANCELED]: RunState.CANCELED,
    [RunEvent.SYSTEM_ERROR]: RunState.FAILED,
  },
  // Terminal states - no transitions out
  [RunState.SUCCEEDED]: {},
  [RunState.FAILED]: {},
  [RunState.CANCELED]: {},
};

/**
 * Check if a state is terminal (no more transitions possible).
 */
export function isTerminalState(state: RunState): boolean {
  return (
    state === RunState.SUCCEEDED ||
    state === RunState.FAILED ||
    state === RunState.CANCELED
  );
}

/**
 * Check if a transition is valid.
 */
export function canTransition(currentState: RunState, event: RunEvent): boolean {
  const stateTransitions = transitions[currentState];
  return stateTransitions !== undefined && event in stateTransitions;
}

/**
 * Get the next state for a given transition.
 * Returns null if the transition is invalid.
 */
export function getNextState(
  currentState: RunState,
  event: RunEvent
): RunState | null {
  const stateTransitions = transitions[currentState];
  if (!stateTransitions) {
    return null;
  }
  return stateTransitions[event] ?? null;
}

/**
 * Apply a state transition to a run.
 * Returns the updated run or throws if the transition is invalid.
 */
export function applyTransition(run: Run, event: RunEvent): Run {
  const nextState = getNextState(run.state, event);

  if (nextState === null) {
    const error = `Invalid transition: ${run.state} + ${event}`;
    log.error({ runId: run.id, currentState: run.state, event }, error);
    throw new Error(error);
  }

  log.info(
    {
      runId: run.id,
      from: run.state,
      event,
      to: nextState,
    },
    'State transition'
  );

  const updatedRun: Run = {
    ...run,
    state: nextState,
  };

  // Set result for terminal states
  if (nextState === RunState.SUCCEEDED) {
    updatedRun.result = RunResult.PASSED;
    updatedRun.completedAt = new Date();
  } else if (nextState === RunState.FAILED) {
    updatedRun.completedAt = new Date();
    // Result should be set by the caller based on the specific failure
  } else if (nextState === RunState.CANCELED) {
    updatedRun.result = RunResult.CANCELED;
    updatedRun.completedAt = new Date();
  }

  return updatedRun;
}

/**
 * Get the result type based on the failure event.
 */
export function getResultForEvent(event: RunEvent): RunResult {
  switch (event) {
    case RunEvent.BUILD_FAILED:
      return RunResult.FAILED_BUILD;
    case RunEvent.VERIFY_FAILED_TERMINAL:
      return RunResult.FAILED_VERIFICATION;
    case RunEvent.SYSTEM_ERROR:
      return RunResult.FAILED_ERROR;
    case RunEvent.USER_CANCELED:
      return RunResult.CANCELED;
    default:
      return RunResult.FAILED_ERROR;
  }
}

/**
 * Get human-readable progress description.
 */
export function getProgressDescription(run: Run): string {
  switch (run.state) {
    case RunState.QUEUED:
      return 'Waiting in queue';
    case RunState.LEASED:
      return 'Preparing workspace';
    case RunState.BUILDING:
      return `Building (iteration ${run.iteration}/${run.maxIterations})`;
    case RunState.SNAPSHOTTING:
      return `Capturing snapshot (iteration ${run.iteration}/${run.maxIterations})`;
    case RunState.VERIFYING:
      return `Verifying (iteration ${run.iteration}/${run.maxIterations})`;
    case RunState.FEEDBACK:
      return `Generating feedback (iteration ${run.iteration}/${run.maxIterations})`;
    case RunState.SUCCEEDED:
      return 'Completed successfully';
    case RunState.FAILED:
      return `Failed: ${run.error ?? 'Unknown error'}`;
    case RunState.CANCELED:
      return 'Canceled by user';
    default:
      return 'Unknown state';
  }
}
