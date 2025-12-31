/**
 * State Machine Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isTerminalState,
  canTransition,
  applyTransition,
  getProgressDescription,
} from '../src/orchestrator/state-machine.js';
import { createRun } from '../src/orchestrator/run-store.js';
import { RunState, RunEvent } from '../src/types/index.js';

describe('State Machine', () => {
  describe('isTerminalState', () => {
    it('should identify terminal states', () => {
      expect(isTerminalState(RunState.SUCCEEDED)).toBe(true);
      expect(isTerminalState(RunState.FAILED)).toBe(true);
      expect(isTerminalState(RunState.CANCELED)).toBe(true);
    });

    it('should identify non-terminal states', () => {
      expect(isTerminalState(RunState.QUEUED)).toBe(false);
      expect(isTerminalState(RunState.LEASED)).toBe(false);
      expect(isTerminalState(RunState.BUILDING)).toBe(false);
      expect(isTerminalState(RunState.VERIFYING)).toBe(false);
    });
  });

  describe('canTransition', () => {
    it('should allow valid transitions', () => {
      expect(canTransition(RunState.QUEUED, RunEvent.WORKSPACE_ACQUIRED)).toBe(true);
      expect(canTransition(RunState.LEASED, RunEvent.BUILD_STARTED)).toBe(true);
      expect(canTransition(RunState.BUILDING, RunEvent.BUILD_COMPLETED)).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(canTransition(RunState.QUEUED, RunEvent.BUILD_COMPLETED)).toBe(false);
      expect(canTransition(RunState.SUCCEEDED, RunEvent.BUILD_STARTED)).toBe(false);
    });
  });

  describe('applyTransition', () => {
    it('should transition run state', () => {
      const run = createRun('run-1', 'wo-1', 'ws-1', 3);
      expect(run.state).toBe(RunState.QUEUED);

      const newRun = applyTransition(run, RunEvent.WORKSPACE_ACQUIRED);
      expect(newRun.state).toBe(RunState.LEASED);
    });

    it('should throw on invalid transition', () => {
      const run = createRun('run-1', 'wo-1', 'ws-1', 3);

      expect(() => applyTransition(run, RunEvent.BUILD_COMPLETED)).toThrow();
    });
  });

  describe('getProgressDescription', () => {
    it('should describe current progress', () => {
      const run = createRun('run-1', 'wo-1', 'ws-1', 3);

      const description = getProgressDescription(run);
      // The description is a string that describes the current state
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
    });

    it('should describe building state with iteration', () => {
      let run = createRun('run-1', 'wo-1', 'ws-1', 3);
      run = applyTransition(run, RunEvent.WORKSPACE_ACQUIRED);
      run = applyTransition(run, RunEvent.BUILD_STARTED);

      const description = getProgressDescription(run);
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
    });
  });
});
