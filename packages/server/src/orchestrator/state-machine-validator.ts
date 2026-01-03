/**
 * State Machine Validator
 * v0.2.25: Validates state machine completeness and correctness.
 *
 * Provides utilities to:
 * - Validate all states have proper entry/exit transitions
 * - Find unreachable states
 * - Find dead-end states (non-terminal with no exits)
 * - Enumerate all possible paths from initial to terminal states
 */

import { RunState, RunEvent } from '../types/index.js';

/**
 * Terminal states that are valid end states
 */
const TERMINAL_STATES: RunState[] = [
  RunState.SUCCEEDED,
  RunState.FAILED,
  RunState.CANCELED,
];

/**
 * Initial state
 */
const INITIAL_STATE: RunState = RunState.QUEUED;

/**
 * Validation issue types
 */
export type ValidationIssueType =
  | 'missing_entry'
  | 'missing_exit'
  | 'orphan_event'
  | 'unreachable'
  | 'dead_end';

/**
 * A validation issue found in the state machine
 */
export interface ValidationIssue {
  type: ValidationIssueType;
  state?: RunState;
  event?: RunEvent;
  message: string;
}

/**
 * Result of validation
 */
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * A path through the state machine
 */
export interface StatePath {
  states: RunState[];
  events: RunEvent[];
  terminal: RunState;
}

/**
 * Transition table type (mirrors state-machine.ts)
 */
type TransitionTable = Record<RunState, Partial<Record<RunEvent, RunState>>>;

/**
 * State Machine Validator
 */
export class StateMachineValidator {
  private readonly transitions: TransitionTable;
  private readonly allStates: RunState[];
  private readonly allEvents: RunEvent[];

  constructor(transitions: TransitionTable) {
    this.transitions = transitions;
    this.allStates = Object.values(RunState);
    this.allEvents = Object.values(RunEvent);
  }

  /**
   * Run all validations and return combined result
   */
  validate(): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Check for unreachable states
    const unreachable = this.findUnreachableStates();
    for (const state of unreachable) {
      issues.push({
        type: 'unreachable',
        state,
        message: `State '${state}' is unreachable from initial state '${INITIAL_STATE}'`,
      });
    }

    // Check for dead-end states (non-terminal with no exits)
    const deadEnds = this.findDeadEndStates();
    for (const state of deadEnds) {
      issues.push({
        type: 'dead_end',
        state,
        message: `Non-terminal state '${state}' has no outgoing transitions`,
      });
    }

    // Check that all terminal states have no outgoing transitions
    for (const state of TERMINAL_STATES) {
      const stateTransitions = this.transitions[state];
      if (stateTransitions && Object.keys(stateTransitions).length > 0) {
        issues.push({
          type: 'dead_end',
          state,
          message: `Terminal state '${state}' should have no outgoing transitions but has: ${Object.keys(stateTransitions).join(', ')}`,
        });
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Validate that all states have proper transitions
   */
  validateStateCompleteness(): ValidationResult {
    const issues: ValidationIssue[] = [];

    for (const state of this.allStates) {
      // Skip terminal states - they don't need exits
      if (TERMINAL_STATES.includes(state)) {
        continue;
      }

      const stateTransitions = this.transitions[state];
      if (!stateTransitions || Object.keys(stateTransitions).length === 0) {
        issues.push({
          type: 'missing_exit',
          state,
          message: `Non-terminal state '${state}' has no outgoing transitions`,
        });
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Validate that all events are handled by at least one state
   */
  validateEventCoverage(): ValidationResult {
    const issues: ValidationIssue[] = [];
    const handledEvents = new Set<RunEvent>();

    // Collect all events that are handled
    for (const state of this.allStates) {
      const stateTransitions = this.transitions[state];
      if (stateTransitions) {
        for (const event of Object.keys(stateTransitions) as RunEvent[]) {
          handledEvents.add(event);
        }
      }
    }

    // Check for orphan events
    for (const event of this.allEvents) {
      if (!handledEvents.has(event)) {
        issues.push({
          type: 'orphan_event',
          event,
          message: `Event '${event}' is not handled by any state`,
        });
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Find states that are unreachable from the initial state
   */
  findUnreachableStates(): RunState[] {
    const reachable = new Set<RunState>();
    const queue: RunState[] = [INITIAL_STATE];

    // BFS to find all reachable states
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);

      const stateTransitions = this.transitions[current];
      if (stateTransitions) {
        for (const nextState of Object.values(stateTransitions)) {
          if (!reachable.has(nextState)) {
            queue.push(nextState);
          }
        }
      }
    }

    // Return states that are not reachable
    return this.allStates.filter((state) => !reachable.has(state));
  }

  /**
   * Find non-terminal states that have no outgoing transitions
   */
  findDeadEndStates(): RunState[] {
    const deadEnds: RunState[] = [];

    for (const state of this.allStates) {
      // Skip terminal states
      if (TERMINAL_STATES.includes(state)) {
        continue;
      }

      const stateTransitions = this.transitions[state];
      if (!stateTransitions || Object.keys(stateTransitions).length === 0) {
        deadEnds.push(state);
      }
    }

    return deadEnds;
  }

  /**
   * Enumerate all possible paths from initial state to terminal states
   * Note: This can be expensive for complex state machines with cycles
   */
  enumeratePaths(maxDepth: number = 20): StatePath[] {
    const paths: StatePath[] = [];

    const dfs = (
      currentState: RunState,
      statesPath: RunState[],
      eventsPath: RunEvent[],
      visited: Set<string>
    ): void => {
      // Add current state to path
      statesPath = [...statesPath, currentState];

      // Check depth limit
      if (statesPath.length > maxDepth) {
        return;
      }

      // If we've reached a terminal state, record the path
      if (TERMINAL_STATES.includes(currentState)) {
        paths.push({
          states: statesPath,
          events: eventsPath,
          terminal: currentState,
        });
        return;
      }

      const stateTransitions = this.transitions[currentState];
      if (!stateTransitions) return;

      for (const [event, nextState] of Object.entries(stateTransitions)) {
        // Create a unique key for this transition to detect cycles
        const transitionKey = `${currentState}-${event}-${nextState}`;
        if (visited.has(transitionKey)) continue;

        const newVisited = new Set(visited);
        newVisited.add(transitionKey);

        dfs(
          nextState as RunState,
          statesPath,
          [...eventsPath, event as RunEvent],
          newVisited
        );
      }
    };

    dfs(INITIAL_STATE, [], [], new Set());
    return paths;
  }

  /**
   * Get all valid events for a given state
   */
  getValidEvents(state: RunState): RunEvent[] {
    const stateTransitions = this.transitions[state];
    if (!stateTransitions) return [];
    return Object.keys(stateTransitions) as RunEvent[];
  }

  /**
   * Check if a specific transition is valid
   */
  isValidTransition(fromState: RunState, event: RunEvent): boolean {
    const stateTransitions = this.transitions[fromState];
    if (!stateTransitions) return false;
    return event in stateTransitions;
  }

  /**
   * Get the target state for a transition
   */
  getTargetState(fromState: RunState, event: RunEvent): RunState | null {
    const stateTransitions = this.transitions[fromState];
    if (!stateTransitions) return null;
    return stateTransitions[event] ?? null;
  }
}

/**
 * Export the transition table from state-machine.ts for validation
 * This should be imported dynamically to avoid circular dependencies
 */
export async function getTransitionTable(): Promise<TransitionTable> {
  // Dynamic import to get the actual transitions
  const stateMachine = await import('./state-machine.js');

  // We need to access the transitions - they're defined in the module but not exported
  // For testing, we'll reconstruct from canTransition and getNextState
  const transitions: TransitionTable = {} as TransitionTable;

  for (const state of Object.values(RunState)) {
    transitions[state] = {};
    for (const event of Object.values(RunEvent)) {
      if (stateMachine.canTransition(state, event)) {
        const nextState = stateMachine.getNextState(state, event);
        if (nextState) {
          transitions[state][event] = nextState;
        }
      }
    }
  }

  return transitions;
}

/**
 * Quick validation helper
 */
export async function validateStateMachine(): Promise<ValidationResult> {
  const transitions = await getTransitionTable();
  const validator = new StateMachineValidator(transitions);
  return validator.validate();
}
