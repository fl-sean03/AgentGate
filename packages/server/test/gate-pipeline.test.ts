/**
 * Gate Pipeline Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createGatePipeline,
  type GatePipeline,
  type PipelineContext,
} from '../src/gate/pipeline.js';
import type { ResolvedTaskSpec, Gate, GateResult, GateFailure } from '../src/types/index.js';
import type { Snapshot } from '../src/types/snapshot.js';
import { createGateRunnerRegistry, type GateRunnerRegistry } from '../src/gate/registry.js';
import type { BaseGateRunner } from '../src/gate/base-runner.js';
import type { GateContext, ValidationResult, GateFeedback } from '../src/gate/runner-types.js';

// Mock gate runner for testing
class MockGateRunner {
  readonly name = 'mock';
  readonly type = 'custom' as const;
  private shouldPass: boolean;
  private mockFailures: GateFailure[];

  constructor(shouldPass = true, failures: GateFailure[] = []) {
    this.shouldPass = shouldPass;
    this.mockFailures = failures;
  }

  async run(context: GateContext): Promise<GateResult> {
    const result: GateResult = {
      gate: context.currentGate || 'mock-gate',
      type: 'custom',
      passed: this.shouldPass,
      timestamp: new Date(),
      duration: 50,
      details: {},
    };
    if (!this.shouldPass && this.mockFailures.length > 0) {
      result.failures = this.mockFailures;
    }
    return result;
  }

  validate(config: unknown): ValidationResult {
    return { valid: true };
  }

  async generateFeedback(result: GateResult): Promise<GateFeedback> {
    return {
      gate: result.gate,
      formatted: `Gate ${result.gate} ${result.passed ? 'passed' : 'failed'}`,
      failures: [],
    };
  }

  parseTimeout(timeout: string): number {
    return 60000;
  }
}

// Mock TaskSpec for testing
function createMockTaskSpec(gates: Gate[] = []): ResolvedTaskSpec {
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
        maxIterations: 3,
        gates,
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

// Create a mock registry with our mock runner
function createMockRegistry(shouldPass = true, failures: GateFailure[] = []): GateRunnerRegistry {
  const registry = createGateRunnerRegistry();
  const mockRunner = new MockGateRunner(shouldPass, failures);
  // Override the custom runner registration
  registry.register('custom', () => mockRunner as unknown as BaseGateRunner);
  return registry;
}

describe('GatePipeline', () => {
  describe('execute', () => {
    it('should execute all gates and return results', async () => {
      const gates: Gate[] = [
        { name: 'gate-1', check: { type: 'custom', command: 'echo 1' }, onFailure: { action: 'continue' } },
        { name: 'gate-2', check: { type: 'custom', command: 'echo 2' }, onFailure: { action: 'continue' } },
      ];

      const taskSpec = createMockTaskSpec(gates);
      const context: PipelineContext = {
        taskSpec,
        workOrderId: 'wo-1',
        runId: 'run-1',
        iteration: 1,
        snapshot: createMockSnapshot(),
        workspacePath: '/tmp/test',
      };

      const registry = createMockRegistry(true);
      const pipeline = createGatePipeline(registry);
      const result = await pipeline.execute(context, { registry });

      expect(result.results).toHaveLength(2);
      expect(result.passed).toBe(true);
    });

    it('should return passed=false when any gate fails', async () => {
      const gates: Gate[] = [
        { name: 'gate-1', check: { type: 'custom', command: 'exit 1' }, onFailure: { action: 'continue' } },
      ];

      const taskSpec = createMockTaskSpec(gates);
      const context: PipelineContext = {
        taskSpec,
        workOrderId: 'wo-1',
        runId: 'run-1',
        iteration: 1,
        snapshot: createMockSnapshot(),
        workspacePath: '/tmp/test',
      };

      const registry = createMockRegistry(false, [{ message: 'Command failed' }]);
      const pipeline = createGatePipeline(registry);
      const result = await pipeline.execute(context, { registry });

      expect(result.passed).toBe(false);
      expect(result.results[0]?.passed).toBe(false);
    });

    it('should continue with default failurePolicy', async () => {
      const gates: Gate[] = [
        { name: 'gate-1', check: { type: 'custom', command: 'exit 1' }, onFailure: { action: 'continue' } },
        { name: 'gate-2', check: { type: 'custom', command: 'echo 2' }, onFailure: { action: 'continue' } },
      ];

      const taskSpec = createMockTaskSpec(gates);
      const context: PipelineContext = {
        taskSpec,
        workOrderId: 'wo-1',
        runId: 'run-1',
        iteration: 1,
        snapshot: createMockSnapshot(),
        workspacePath: '/tmp/test',
      };

      const registry = createMockRegistry(false);
      const pipeline = createGatePipeline(registry);
      const result = await pipeline.execute(context, { registry, continueOnFailure: true });

      // Both gates should have run with continueOnFailure
      expect(result.results).toHaveLength(2);
    });

    it('should stop when gate has failurePolicy: stop', async () => {
      const gates: Gate[] = [
        {
          name: 'gate-1',
          check: { type: 'custom', command: 'exit 1' },
          onFailure: { action: 'stop' },
        },
        { name: 'gate-2', check: { type: 'custom', command: 'echo 2' }, onFailure: { action: 'continue' } },
      ];

      const taskSpec = createMockTaskSpec(gates);
      const context: PipelineContext = {
        taskSpec,
        workOrderId: 'wo-1',
        runId: 'run-1',
        iteration: 1,
        snapshot: createMockSnapshot(),
        workspacePath: '/tmp/test',
      };

      const registry = createMockRegistry(false);
      const pipeline = createGatePipeline(registry);
      const result = await pipeline.execute(context, { registry });

      // Pipeline should stop at gate-1
      expect(result.results).toHaveLength(1);
      expect(result.stoppedAt).toBe('gate-1');
    });

    it('should call onGateStart and onGateComplete callbacks', async () => {
      const gates: Gate[] = [
        { name: 'test-gate', check: { type: 'custom', command: 'echo ok' }, onFailure: { action: 'continue' } },
      ];

      const taskSpec = createMockTaskSpec(gates);
      const context: PipelineContext = {
        taskSpec,
        workOrderId: 'wo-1',
        runId: 'run-1',
        iteration: 1,
        snapshot: createMockSnapshot(),
        workspacePath: '/tmp/test',
      };

      const onGateStart = vi.fn();
      const onGateComplete = vi.fn();

      const registry = createMockRegistry(true);
      const pipeline = createGatePipeline(registry);
      await pipeline.execute(context, { registry, onGateStart, onGateComplete });

      expect(onGateStart).toHaveBeenCalledWith(gates[0]);
      expect(onGateComplete).toHaveBeenCalled();
    });
  });

  describe('executeSingle', () => {
    it('should execute a single gate', async () => {
      const gate: Gate = {
        name: 'single-gate',
        check: { type: 'custom', command: 'echo ok' },
        onFailure: { action: 'continue' },
      };

      const taskSpec = createMockTaskSpec([gate]);
      const context: PipelineContext = {
        taskSpec,
        workOrderId: 'wo-1',
        runId: 'run-1',
        iteration: 1,
        snapshot: createMockSnapshot(),
        workspacePath: '/tmp/test',
      };

      const registry = createMockRegistry(true);
      const pipeline = createGatePipeline(registry);
      const result = await pipeline.executeSingle(gate, context);

      expect(result.gate).toBe('single-gate');
      expect(result.passed).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should return error result when no runner found', async () => {
      const gate: Gate = {
        name: 'unknown-gate',
        check: { type: 'unknown-type' as any, command: 'test' },
        onFailure: { action: 'continue' },
      };

      const taskSpec = createMockTaskSpec([gate]);
      const context: PipelineContext = {
        taskSpec,
        workOrderId: 'wo-1',
        runId: 'run-1',
        iteration: 1,
        snapshot: createMockSnapshot(),
        workspacePath: '/tmp/test',
      };

      const pipeline = createGatePipeline();
      const result = await pipeline.executeSingle(gate, context);

      expect(result.passed).toBe(false);
      expect(result.failures?.[0]?.message).toContain('No gate runner');
    });
  });

  describe('collectFailures', () => {
    it('should collect all failures from gate results', () => {
      const results: GateResult[] = [
        {
          gate: 'gate-1',
          type: 'custom',
          passed: false,
          timestamp: new Date(),
          duration: 100,
          details: {},
          failures: [
            { message: 'Error 1' },
            { message: 'Error 2', file: 'test.ts', line: 10 },
          ],
        },
        {
          gate: 'gate-2',
          type: 'custom',
          passed: true,
          timestamp: new Date(),
          duration: 100,
          details: {},
        },
        {
          gate: 'gate-3',
          type: 'custom',
          passed: false,
          timestamp: new Date(),
          duration: 100,
          details: {},
          failures: [{ message: 'Error 3' }],
        },
      ];

      const pipeline = createGatePipeline();
      const failures = pipeline.collectFailures(results);

      expect(failures).toHaveLength(3);
      expect(failures.map((f) => f.message)).toContain('Error 1');
      expect(failures.map((f) => f.message)).toContain('Error 2');
      expect(failures.map((f) => f.message)).toContain('Error 3');
    });

    it('should return empty array when no failures', () => {
      const results: GateResult[] = [
        {
          gate: 'gate-1',
          type: 'custom',
          passed: true,
          timestamp: new Date(),
          duration: 100,
          details: {},
        },
      ];

      const pipeline = createGatePipeline();
      const failures = pipeline.collectFailures(results);

      expect(failures).toHaveLength(0);
    });
  });

  describe('formatFeedback', () => {
    it('should format feedback list into a single string', () => {
      const feedbackList = [
        { gate: 'gate-1', formatted: 'Gate 1 failed: Error 1', failures: [] },
        { gate: 'gate-2', formatted: 'Gate 2 failed: Error 2', failures: [] },
      ];

      const pipeline = createGatePipeline();
      const formatted = pipeline.formatFeedback(feedbackList);

      expect(formatted).toContain('Gate Check Results');
      expect(formatted).toContain('Error 1');
      expect(formatted).toContain('Error 2');
    });

    it('should return empty string for empty feedback list', () => {
      const pipeline = createGatePipeline();
      const formatted = pipeline.formatFeedback([]);

      expect(formatted).toBe('');
    });
  });
});
