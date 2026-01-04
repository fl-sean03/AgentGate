/**
 * Tests for Debug Mode and Dry Run System.
 * (v0.2.27 - Thrust 19: Debug Mode & Dry Runs)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DebugMode,
  getDebugMode,
  isDebugEnabled,
  resetDebugMode,
  type DebugEvent,
} from '../../src/debug/mode.js';
import {
  DryRun,
  getDryRun,
  isDryRunEnabled,
  resetDryRun,
  analyzeWorkOrder,
} from '../../src/debug/dry-run.js';
import type { WorkOrder } from '../../src/types/work-order.js';

describe('Debug Mode', () => {
  beforeEach(() => {
    resetDebugMode();
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getDebugMode();
      const instance2 = getDebugMode();
      expect(instance1).toBe(instance2);
    });

    it('should reset instance', () => {
      const instance1 = getDebugMode();
      resetDebugMode();
      const instance2 = getDebugMode();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('enable/disable', () => {
    it('should enable debug mode', () => {
      const debug = getDebugMode();
      expect(debug.isEnabled()).toBe(false);

      debug.enable();
      expect(debug.isEnabled()).toBe(true);
    });

    it('should disable debug mode', () => {
      const debug = getDebugMode();
      debug.enable();
      debug.disable();
      expect(debug.isEnabled()).toBe(false);
    });

    it('should accept settings on enable', () => {
      const debug = getDebugMode();
      debug.enable({ verbosity: 2, traceTools: true });

      const settings = debug.getSettings();
      expect(settings.verbosity).toBe(2);
      expect(settings.traceTools).toBe(true);
    });
  });

  describe('isDebugEnabled helper', () => {
    it('should reflect current state', () => {
      expect(isDebugEnabled()).toBe(false);
      getDebugMode().enable();
      expect(isDebugEnabled()).toBe(true);
    });
  });

  describe('breakpoints', () => {
    it('should add and remove breakpoints', () => {
      const debug = getDebugMode();

      debug.addBreakpoint('step-1');
      expect(debug.getSettings().breakpoints.has('step-1')).toBe(true);

      debug.removeBreakpoint('step-1');
      expect(debug.getSettings().breakpoints.has('step-1')).toBe(false);
    });

    it('should clear all breakpoints', () => {
      const debug = getDebugMode();
      debug.addBreakpoint('step-1');
      debug.addBreakpoint('step-2');

      debug.clearBreakpoints();
      expect(debug.getSettings().breakpoints.size).toBe(0);
    });
  });

  describe('pause/resume', () => {
    it('should track pause state', () => {
      const debug = getDebugMode();
      expect(debug.isPaused()).toBe(false);

      debug.pause();
      expect(debug.isPaused()).toBe(true);

      debug.resume();
      expect(debug.isPaused()).toBe(false);
    });
  });

  describe('executeStep', () => {
    it('should execute and record step', async () => {
      const debug = getDebugMode();
      debug.enable({ verbosity: 1 });

      const result = await debug.executeStep('step-1', 'Test Step', async () => {
        return 'result';
      });

      expect(result).toBe('result');

      const history = debug.getStepHistory();
      expect(history.length).toBe(1);
      expect(history[0].stepId).toBe('step-1');
      expect(history[0].success).toBe(true);
    });

    it('should record failed steps', async () => {
      const debug = getDebugMode();
      debug.enable({ verbosity: 1 });

      await expect(
        debug.executeStep('step-2', 'Failing Step', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      const history = debug.getStepHistory();
      expect(history.length).toBe(1);
      expect(history[0].success).toBe(false);
      expect(history[0].error?.message).toBe('Test error');
    });
  });

  describe('tracing', () => {
    it('should trace tool calls when enabled', () => {
      const debug = getDebugMode();
      debug.enable({ traceTools: true });

      const events: DebugEvent[] = [];
      debug.on('tool:call', (e) => events.push(e));

      debug.traceToolCall('testTool', { arg: 1 }, { result: 'ok' });

      expect(events.length).toBe(1);
      expect(events[0].data?.tool).toBe('testTool');
    });

    it('should not trace when disabled', () => {
      const debug = getDebugMode();
      debug.enable({ traceTools: false });

      const events: DebugEvent[] = [];
      debug.on('tool:call', (e) => events.push(e));

      debug.traceToolCall('testTool', { arg: 1 });

      expect(events.length).toBe(0);
    });

    it('should trace API calls when enabled', () => {
      const debug = getDebugMode();
      debug.enable({ traceApi: true });

      const events: DebugEvent[] = [];
      debug.on('api:request', (e) => events.push(e));

      debug.traceApiRequest('GET', 'https://api.example.com/test');

      expect(events.length).toBe(1);
      expect(events[0].data?.method).toBe('GET');
    });
  });

  describe('state management', () => {
    it('should save and retrieve states', () => {
      const debug = getDebugMode();
      debug.enable({ saveStates: true });

      debug.saveState('test-state', { value: 42 });

      const state = debug.getState('test-state') as { value: number };
      expect(state.value).toBe(42);
    });

    it('should get all states', () => {
      const debug = getDebugMode();
      debug.enable({ saveStates: true });

      debug.saveState('state1', { a: 1 });
      debug.saveState('state2', { b: 2 });

      const all = debug.getAllStates();
      expect(all.size).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear history and states', async () => {
      const debug = getDebugMode();
      debug.enable({ saveStates: true });

      await debug.executeStep('step-1', 'Test', async () => 'ok');
      debug.saveState('test', { x: 1 });

      debug.clear();

      expect(debug.getStepHistory().length).toBe(0);
      expect(debug.getAllStates().size).toBe(0);
    });
  });

  describe('formatHistory', () => {
    it('should format step history', async () => {
      const debug = getDebugMode();
      debug.enable();

      await debug.executeStep('step-1', 'First', async () => 'a');
      await debug.executeStep('step-2', 'Second', async () => 'b');

      const formatted = debug.formatHistory();
      expect(formatted).toContain('Step History');
      expect(formatted).toContain('step-1');
      expect(formatted).toContain('step-2');
    });
  });
});

describe('Dry Run', () => {
  beforeEach(() => {
    resetDryRun();
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getDryRun();
      const instance2 = getDryRun();
      expect(instance1).toBe(instance2);
    });

    it('should reset instance', () => {
      const instance1 = getDryRun();
      resetDryRun();
      const instance2 = getDryRun();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('enable/disable', () => {
    it('should enable dry run mode', () => {
      const dryRun = getDryRun();
      expect(dryRun.isEnabled()).toBe(false);

      dryRun.enable();
      expect(dryRun.isEnabled()).toBe(true);
    });

    it('should disable dry run mode', () => {
      const dryRun = getDryRun();
      dryRun.enable();
      dryRun.disable();
      expect(dryRun.isEnabled()).toBe(false);
    });
  });

  describe('isDryRunEnabled helper', () => {
    it('should reflect current state', () => {
      expect(isDryRunEnabled()).toBe(false);
      getDryRun().enable();
      expect(isDryRunEnabled()).toBe(true);
    });
  });

  describe('file operations', () => {
    it('should record file writes', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      dryRun.simulateFileWrite('/path/to/file.ts', 'content');

      const actions = dryRun.getActions();
      expect(actions.length).toBe(1);
      expect(actions[0].type).toBe('file:write');
      expect(actions[0].details.path).toBe('/path/to/file.ts');
    });

    it('should record file deletes', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      dryRun.simulateFileDelete('/path/to/delete.ts');

      const actions = dryRun.getActions();
      expect(actions.length).toBe(1);
      expect(actions[0].type).toBe('file:delete');
    });

    it('should not record when disabled', () => {
      const dryRun = getDryRun();
      // Not enabled

      dryRun.simulateFileWrite('/path/to/file.ts', 'content');

      expect(dryRun.getActions().length).toBe(0);
    });
  });

  describe('git operations', () => {
    it('should record git commits', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      dryRun.simulateGitCommit('Test commit', ['file1.ts', 'file2.ts']);

      const actions = dryRun.getActions();
      expect(actions.length).toBe(1);
      expect(actions[0].type).toBe('git:commit');
      expect(actions[0].wouldAffect).toEqual(['file1.ts', 'file2.ts']);
    });

    it('should record git pushes', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      dryRun.simulateGitPush('feature/test');

      const actions = dryRun.getActions();
      expect(actions.length).toBe(1);
      expect(actions[0].type).toBe('git:push');
      expect(actions[0].details.branch).toBe('feature/test');
    });
  });

  describe('API operations', () => {
    it('should record API calls', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      dryRun.simulateApiCall('POST', 'https://api.github.com/repos');

      const actions = dryRun.getActions();
      expect(actions.length).toBe(1);
      expect(actions[0].type).toBe('api:call');
    });

    it('should use custom handler', () => {
      const handler = vi.fn().mockReturnValue({ id: 123 });

      const dryRun = getDryRun();
      dryRun.enable({
        handlers: {
          onApiCall: handler,
        },
      });

      const result = dryRun.simulateApiCall('GET', 'https://api.example.com');

      expect(handler).toHaveBeenCalled();
      expect(result).toEqual({ id: 123 });
    });
  });

  describe('agent operations', () => {
    it('should record agent executions', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      const result = dryRun.simulateAgentExecute('Fix the bug');

      expect(result).toContain('DRY RUN');

      const actions = dryRun.getActions();
      expect(actions.length).toBe(1);
      expect(actions[0].type).toBe('agent:execute');
    });
  });

  describe('gate operations', () => {
    it('should record gate checks', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      dryRun.simulateGateCheck({
        type: 'verification-levels',
        config: { levels: ['L0', 'L1'] },
      });

      const actions = dryRun.getActions();
      expect(actions.length).toBe(1);
      expect(actions[0].type).toBe('gate:run');
    });
  });

  describe('warnings and errors', () => {
    it('should track warnings', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      dryRun.warn('Potential issue');

      expect(dryRun.getWarnings()).toContain('Potential issue');
    });

    it('should track errors', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      dryRun.error('Critical error');

      expect(dryRun.getErrors()).toContain('Critical error');
    });
  });

  describe('getSummary', () => {
    it('should summarize actions', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      dryRun.simulateFileWrite('/a.ts', 'a');
      dryRun.simulateFileWrite('/b.ts', 'b');
      dryRun.simulateFileDelete('/c.ts');
      dryRun.simulateGitCommit('msg', []);
      dryRun.simulateApiCall('GET', 'url');

      const summary = dryRun.getSummary();

      expect(summary.totalActions).toBe(5);
      expect(summary.fileWrites).toBe(2);
      expect(summary.fileDeletes).toBe(1);
      expect(summary.gitOperations).toBe(1);
      expect(summary.apiCalls).toBe(1);
    });
  });

  describe('getResult', () => {
    it('should generate complete result', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      dryRun.simulateFileWrite('/test.ts', 'content');
      dryRun.warn('Warning');

      const result = dryRun.getResult('wo-123');

      expect(result.workOrderId).toBe('wo-123');
      expect(result.success).toBe(true);
      expect(result.actions.length).toBe(1);
      expect(result.warnings.length).toBe(1);
      expect(result.estimatedDuration).toBeGreaterThan(0);
    });

    it('should mark as failed with errors', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      dryRun.error('Something went wrong');

      const result = dryRun.getResult('wo-123');
      expect(result.success).toBe(false);
    });
  });

  describe('formatResult', () => {
    it('should format result for display', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      dryRun.simulateFileWrite('/test.ts', 'x');
      dryRun.warn('Check this');

      const formatted = dryRun.formatResult('wo-test');

      expect(formatted).toContain('Dry Run Report');
      expect(formatted).toContain('wo-test');
      expect(formatted).toContain('File Writes: 1');
      expect(formatted).toContain('Check this');
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      const dryRun = getDryRun();
      dryRun.enable();

      dryRun.simulateFileWrite('/test.ts', 'x');
      dryRun.warn('warning');
      dryRun.error('error');

      dryRun.clear();

      expect(dryRun.getActions().length).toBe(0);
      expect(dryRun.getWarnings().length).toBe(0);
      expect(dryRun.getErrors().length).toBe(0);
    });
  });

  describe('analyzeWorkOrder', () => {
    it('should analyze work order actions', () => {
      const workOrder: WorkOrder = {
        id: 'wo-1',
        task: 'Fix the bug in authentication',
        repository: {
          url: 'https://github.com/test/repo',
          branch: 'main',
        },
        gate: {
          checks: [
            { type: 'verification-levels', config: { levels: ['L0'] } },
          ],
        },
        prDelivery: true,
        branch: 'fix/auth-bug',
      };

      const actions = analyzeWorkOrder(workOrder);

      expect(actions.length).toBeGreaterThan(0);

      const types = actions.map(a => a.type);
      expect(types).toContain('agent:execute');
      expect(types).toContain('gate:run');
      expect(types).toContain('git:commit');
      expect(types).toContain('git:push');
    });
  });
});
