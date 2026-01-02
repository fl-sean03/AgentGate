import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import {
  WorkOrderState,
  StateEvent,
  StateTransition,
  STATE_TRANSITIONS,
  TERMINAL_STATES,
} from './types.js';

/**
 * Configuration for state machine behavior.
 */
export interface StateMachineConfig {
  maxRetries: number;
  workOrderId: string;
  initialState?: WorkOrderState;
}

/**
 * Error thrown when an invalid state transition is attempted.
 */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly workOrderId: string,
    public readonly fromState: WorkOrderState,
    public readonly event: StateEvent,
    public readonly validEvents: StateEvent[]
  ) {
    super(
      `Invalid transition: Cannot apply '${event}' to work order ${workOrderId} ` +
      `in state '${fromState}'. Valid events: [${validEvents.join(', ')}]`
    );
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Events emitted by the state machine.
 */
export interface StateMachineEvents {
  'state-changed': (transition: StateTransition) => void;
  'terminal-reached': (state: WorkOrderState, workOrderId: string) => void;
}

/**
 * Work order state machine with explicit transitions and audit trail.
 */
export class WorkOrderStateMachine extends EventEmitter {
  private readonly logger: Logger;
  private _currentState: WorkOrderState;
  private _retryCount: number = 0;
  private readonly _history: StateTransition[] = [];

  constructor(private readonly config: StateMachineConfig) {
    super();
    this.logger = createLogger(`state-machine:${config.workOrderId}`);
    this._currentState = config.initialState ?? 'PENDING';

    // Log initial state
    this.logger.info(
      { state: this._currentState },
      'State machine initialized'
    );
  }

  /**
   * Current state of the work order.
   */
  get currentState(): WorkOrderState {
    return this._currentState;
  }

  /**
   * Number of retry attempts so far.
   */
  get retryCount(): number {
    return this._retryCount;
  }

  /**
   * Complete transition history for audit.
   */
  get history(): readonly StateTransition[] {
    return this._history;
  }

  /**
   * Whether the state machine has reached a terminal state.
   */
  get isTerminal(): boolean {
    return TERMINAL_STATES.includes(this._currentState);
  }

  /**
   * Attempt to transition to a new state via an event.
   * Throws InvalidTransitionError if the transition is not valid.
   */
  transition(event: StateEvent, metadata?: Record<string, unknown>): WorkOrderState {
    const validTransitions = STATE_TRANSITIONS[this._currentState];
    const nextState = validTransitions[event];

    if (!nextState) {
      const validEvents = Object.keys(validTransitions) as StateEvent[];
      throw new InvalidTransitionError(
        this.config.workOrderId,
        this._currentState,
        event,
        validEvents
      );
    }

    const transition: StateTransition = metadata !== undefined
      ? {
          id: nanoid(),
          workOrderId: this.config.workOrderId,
          fromState: this._currentState,
          toState: nextState,
          event,
          timestamp: new Date(),
          metadata,
        }
      : {
          id: nanoid(),
          workOrderId: this.config.workOrderId,
          fromState: this._currentState,
          toState: nextState,
          event,
          timestamp: new Date(),
        };

    // Update state
    const previousState = this._currentState;
    this._currentState = nextState;
    this._history.push(transition);

    // Log transition
    this.logger.info(
      { from: previousState, to: nextState, event, metadata },
      'State transition'
    );

    // Emit event
    this.emit('state-changed', transition);

    // Check for terminal state
    if (this.isTerminal) {
      this.emit('terminal-reached', nextState, this.config.workOrderId);
    }

    return nextState;
  }

  /**
   * Convenience method: PENDING → PREPARING
   */
  claim(metadata?: Record<string, unknown>): void {
    this.transition('CLAIM', metadata);
  }

  /**
   * Convenience method: PREPARING → RUNNING
   */
  ready(metadata?: Record<string, unknown>): void {
    this.transition('READY', metadata);
  }

  /**
   * Convenience method: RUNNING → COMPLETED
   */
  complete(result: { exitCode: number; output?: string }): void {
    this.transition('COMPLETE', result);
  }

  /**
   * Handle failure - transitions to WAITING_RETRY or FAILED based on retry count.
   */
  fail(error: { message: string; retryable: boolean }): WorkOrderState {
    if (!error.retryable || this._retryCount >= this.config.maxRetries) {
      // Force transition to FAILED (override WAITING_RETRY)
      const transition: StateTransition = {
        id: nanoid(),
        workOrderId: this.config.workOrderId,
        fromState: this._currentState,
        toState: 'FAILED',
        event: 'FAIL',
        timestamp: new Date(),
        metadata: { error, retryCount: this._retryCount, maxRetries: this.config.maxRetries },
      };

      this._currentState = 'FAILED';
      this._history.push(transition);

      this.logger.error(
        { error, retryCount: this._retryCount, maxRetries: this.config.maxRetries },
        'Work order failed permanently'
      );

      this.emit('state-changed', transition);
      this.emit('terminal-reached', 'FAILED', this.config.workOrderId);

      return 'FAILED';
    }

    // Retryable failure
    this.transition('FAIL', { error, retryCount: this._retryCount });
    return this._currentState;
  }

  /**
   * Convenience method: WAITING_RETRY → PENDING
   */
  retry(): void {
    this._retryCount++;
    this.transition('RETRY', { retryCount: this._retryCount });
  }

  /**
   * Convenience method: PENDING | WAITING_RETRY → CANCELLED
   */
  cancel(reason?: string): void {
    this.transition('CANCEL', { reason });
  }

  /**
   * Check if a transition is valid without performing it.
   */
  canTransition(event: StateEvent): boolean {
    const validTransitions = STATE_TRANSITIONS[this._currentState];
    return event in validTransitions;
  }

  /**
   * Get list of valid events for current state.
   */
  getValidEvents(): StateEvent[] {
    return Object.keys(STATE_TRANSITIONS[this._currentState]) as StateEvent[];
  }

  /**
   * Get time spent in current state.
   */
  getTimeInCurrentState(): number {
    const lastTransition = this._history[this._history.length - 1];
    if (!lastTransition) {
      return 0;
    }
    return Date.now() - lastTransition.timestamp.getTime();
  }
}
