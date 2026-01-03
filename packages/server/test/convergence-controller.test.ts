/**
 * Convergence Controller Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createConvergenceController,
  type ConvergenceController,
  type ConvergenceContext,
} from '../src/convergence/controller.js';
import type { ResolvedTaskSpec, GateResult } from '../src/types/index.js';
import type { Snapshot } from '../src/types/snapshot.js';

// Mock TaskSpec for testing
function createMockTaskSpec(
  overrides: Partial<ResolvedTaskSpec['spec']['convergence']> = {}
): ResolvedTaskSpec {
  return {
    apiVersion: 'agentgate.dev/v1',
    kind: 'Task',
    metadata: {
      name: 'test-task',
      version: '1.0.0',
    },
    spec: {
      task: {
        description: 'Test task',
      },
      execution: {
        workspace: { source: 'local', path: '/tmp/test' },
        agent: { driver: 'claude-code-subscription' },
      },
      convergence: {
        strategy: 'fixed',
        limits: { maxIterations: 3 },
        gates: [
          {
            name: 'test-gate',
            check: { type: 'custom', command: 'echo ok' },
            onFailure: { action: 'continue' },
          },
        ],
        ...overrides,
      },
      delivery: {
        git: { mode: 'local' },
      },
    },
  };
}

// Mock Snapshot
function createMockSnapshot(): Snapshot {
  return {
    id: 'snapshot-1',
    beforeSha: 'abc123',
    afterSha: 'def456',
    status: 'ready',
    diff: '',
    filesChanged: 2,
    timestamp: Date.now(),
    workspacePath: '/tmp/test',
  };
}

describe('ConvergenceController', () => {
  let controller: ConvergenceController;

  beforeEach(() => {
    controller = createConvergenceController();
  });

  describe('factory', () => {
    it('should create a convergence controller instance', () => {
      const ctrl = createConvergenceController();
      expect(ctrl).toBeDefined();
      expect(typeof ctrl.initialize).toBe('function');
      expect(typeof ctrl.run).toBe('function');
      expect(typeof ctrl.stop).toBe('function');
      expect(typeof ctrl.isRunning).toBe('function');
      expect(typeof ctrl.getProgress).toBe('function');
    });
  });

  describe('initialize', () => {
    it('should initialize with convergence spec', async () => {
      const spec = createMockTaskSpec().spec.convergence;
      await controller.initialize(spec);

      const progress = controller.getProgress();
      expect(progress.iteration).toBe(0);
      expect(progress.maxIterations).toBe(3);
    });

    it('should initialize with different strategies', async () => {
      const specGateDriven = createMockTaskSpec({ strategy: 'hybrid' }).spec.convergence;
      await controller.initialize(specGateDriven);

      const progress = controller.getProgress();
      expect(progress.iteration).toBe(0);
    });
  });

  describe('isRunning', () => {
    it('should return false when not running', () => {
      expect(controller.isRunning()).toBe(false);
    });
  });

  describe('stop', () => {
    it('should be callable even when not running', async () => {
      await expect(controller.stop('Test stop')).resolves.not.toThrow();
    });
  });

  describe('run with fixed strategy', () => {
    it('should converge when all gates pass', async () => {
      const taskSpec = createMockTaskSpec({ strategy: 'fixed', limits: { maxIterations: 2 } });
      await controller.initialize(taskSpec.spec.convergence);

      const context: ConvergenceContext = {
        taskSpec,
        workOrderId: 'wo-1',
        runId: 'run-1',
        onBuild: vi.fn().mockResolvedValue({ success: true }),
        onSnapshot: vi.fn().mockResolvedValue(createMockSnapshot()),
        onGateCheck: vi.fn().mockImplementation(async () => ({
          gate: 'test-gate',
          type: 'custom',
          passed: true,
          timestamp: new Date(),
          duration: 100,
          details: {},
        })),
        onFeedback: vi.fn().mockResolvedValue(''),
      };

      const result = await controller.run(context);

      expect(result.status).toBe('converged');
      expect(result.iterations).toBeGreaterThan(0);
    });

    it('should exhaust iterations when gates fail', async () => {
      const taskSpec = createMockTaskSpec({ strategy: 'fixed', limits: { maxIterations: 2 } });
      await controller.initialize(taskSpec.spec.convergence);

      const context: ConvergenceContext = {
        taskSpec,
        workOrderId: 'wo-1',
        runId: 'run-1',
        onBuild: vi.fn().mockResolvedValue({ success: true }),
        onSnapshot: vi.fn().mockResolvedValue(createMockSnapshot()),
        onGateCheck: vi.fn().mockResolvedValue({
          gate: 'test-gate',
          type: 'custom',
          passed: false,
          timestamp: new Date(),
          duration: 100,
          details: {},
          failures: [{ message: 'Test failure' }],
        }),
        onFeedback: vi.fn().mockResolvedValue('Fix the error'),
      };

      const result = await controller.run(context);

      expect(result.status).toBe('diverged');
      expect(result.iterations).toBe(2);
    });
  });
});
