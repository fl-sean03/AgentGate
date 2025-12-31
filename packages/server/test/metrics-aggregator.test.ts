/**
 * Metrics Aggregator Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { aggregateRunMetrics, computeInProgressMetrics } from '../src/metrics/aggregator.js';
import type { IterationMetrics, Run, LevelMetrics, PhaseMetrics } from '../src/types/index.js';
import { RunState, RunResult } from '../src/types/index.js';

function createMockRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    workOrderId: 'wo-1',
    workspaceId: 'ws-1',
    iteration: 1,
    maxIterations: 5,
    state: RunState.SUCCEEDED,
    snapshotBeforeSha: null,
    snapshotAfterSha: null,
    snapshotIds: [],
    startedAt: new Date('2025-01-01T10:00:00Z'),
    completedAt: new Date('2025-01-01T10:10:00Z'),
    result: RunResult.PASSED,
    error: null,
    sessionId: null,
    gitHubBranch: null,
    gitHubPrUrl: null,
    gitHubPrNumber: null,
    ...overrides,
  };
}

function createMockLevelMetrics(overrides: Partial<LevelMetrics> = {}): LevelMetrics {
  return {
    level: 'L0',
    passed: true,
    durationMs: 1000,
    checksRun: 5,
    checksPassed: 5,
    ...overrides,
  };
}

function createMockPhaseMetrics(phase: string, durationMs: number): PhaseMetrics {
  const startedAt = new Date('2025-01-01T10:00:00Z');
  const completedAt = new Date(startedAt.getTime() + durationMs);
  return {
    phase: phase as 'build' | 'snapshot' | 'verify' | 'feedback',
    startedAt,
    completedAt,
    durationMs,
  };
}

function createMockIterationMetrics(iteration: number, overrides: Partial<IterationMetrics> = {}): IterationMetrics {
  const startedAt = new Date('2025-01-01T10:00:00Z');
  const completedAt = new Date('2025-01-01T10:01:00Z');
  return {
    iteration,
    runId: 'run-1',
    phases: [
      createMockPhaseMetrics('build', 30000),
      createMockPhaseMetrics('snapshot', 5000),
      createMockPhaseMetrics('verify', 20000),
    ],
    totalDurationMs: 60000,
    agentTokensInput: 1000,
    agentTokensOutput: 500,
    agentExitCode: 0,
    agentDurationMs: 25000,
    filesChanged: 3,
    insertions: 100,
    deletions: 20,
    verificationPassed: true,
    verificationDurationMs: 20000,
    verificationLevels: [
      createMockLevelMetrics({ level: 'L0', passed: true }),
      createMockLevelMetrics({ level: 'L1', passed: true }),
      createMockLevelMetrics({ level: 'L2', passed: true }),
      createMockLevelMetrics({ level: 'L3', passed: true }),
    ],
    startedAt,
    completedAt,
    ...overrides,
  };
}

describe('aggregateRunMetrics', () => {
  describe('with empty iterations', () => {
    it('should return empty metrics', () => {
      const run = createMockRun();
      const metrics = aggregateRunMetrics([], run);

      expect(metrics.runId).toBe('run-1');
      expect(metrics.iterationCount).toBe(0);
      expect(metrics.successfulIterations).toBe(0);
      expect(metrics.failedIterations).toBe(0);
      expect(metrics.totalTokensInput).toBe(0);
      expect(metrics.totalTokensOutput).toBe(0);
    });
  });

  describe('with single iteration', () => {
    it('should compute metrics from single iteration', () => {
      const run = createMockRun();
      const iterations = [createMockIterationMetrics(1)];
      const metrics = aggregateRunMetrics(iterations, run);

      expect(metrics.iterationCount).toBe(1);
      expect(metrics.successfulIterations).toBe(1);
      expect(metrics.failedIterations).toBe(0);
      expect(metrics.totalTokensInput).toBe(1000);
      expect(metrics.totalTokensOutput).toBe(500);
      expect(metrics.totalFilesChanged).toBe(3);
      expect(metrics.totalInsertions).toBe(100);
      expect(metrics.totalDeletions).toBe(20);
    });
  });

  describe('with multiple iterations', () => {
    it('should sum phase durations', () => {
      const run = createMockRun();
      const iterations = [
        createMockIterationMetrics(1, {
          phases: [
            createMockPhaseMetrics('build', 10000),
            createMockPhaseMetrics('snapshot', 2000),
            createMockPhaseMetrics('verify', 8000),
          ],
        }),
        createMockIterationMetrics(2, {
          phases: [
            createMockPhaseMetrics('build', 15000),
            createMockPhaseMetrics('snapshot', 3000),
            createMockPhaseMetrics('verify', 12000),
            createMockPhaseMetrics('feedback', 5000),
          ],
        }),
      ];

      const metrics = aggregateRunMetrics(iterations, run);

      expect(metrics.totalBuildDurationMs).toBe(25000);
      expect(metrics.totalSnapshotDurationMs).toBe(5000);
      expect(metrics.totalVerifyDurationMs).toBe(20000);
      expect(metrics.totalFeedbackDurationMs).toBe(5000);
    });

    it('should sum token usage', () => {
      const run = createMockRun();
      const iterations = [
        createMockIterationMetrics(1, { agentTokensInput: 1000, agentTokensOutput: 500 }),
        createMockIterationMetrics(2, { agentTokensInput: 2000, agentTokensOutput: 800 }),
        createMockIterationMetrics(3, { agentTokensInput: 1500, agentTokensOutput: 600 }),
      ];

      const metrics = aggregateRunMetrics(iterations, run);

      expect(metrics.totalTokensInput).toBe(4500);
      expect(metrics.totalTokensOutput).toBe(1900);
    });

    it('should handle null token usage', () => {
      const run = createMockRun();
      const iterations = [
        createMockIterationMetrics(1, { agentTokensInput: 1000, agentTokensOutput: 500 }),
        createMockIterationMetrics(2, { agentTokensInput: null, agentTokensOutput: null }),
      ];

      const metrics = aggregateRunMetrics(iterations, run);

      expect(metrics.totalTokensInput).toBe(1000);
      expect(metrics.totalTokensOutput).toBe(500);
    });

    it('should count successful and failed iterations', () => {
      const run = createMockRun();
      const iterations = [
        createMockIterationMetrics(1, { verificationPassed: false }),
        createMockIterationMetrics(2, { verificationPassed: false }),
        createMockIterationMetrics(3, { verificationPassed: true }),
      ];

      const metrics = aggregateRunMetrics(iterations, run);

      expect(metrics.iterationCount).toBe(3);
      expect(metrics.successfulIterations).toBe(1);
      expect(metrics.failedIterations).toBe(2);
    });

    it('should accumulate code changes', () => {
      const run = createMockRun();
      const iterations = [
        createMockIterationMetrics(1, { filesChanged: 3, insertions: 100, deletions: 20 }),
        createMockIterationMetrics(2, { filesChanged: 2, insertions: 50, deletions: 30 }),
      ];

      const metrics = aggregateRunMetrics(iterations, run);

      expect(metrics.totalFilesChanged).toBe(5);
      expect(metrics.totalInsertions).toBe(150);
      expect(metrics.totalDeletions).toBe(50);
    });

    it('should capture final verification state', () => {
      const run = createMockRun();
      const failedLevels = [
        createMockLevelMetrics({ level: 'L0', passed: true }),
        createMockLevelMetrics({ level: 'L1', passed: false }),
        createMockLevelMetrics({ level: 'L2', passed: false }),
        createMockLevelMetrics({ level: 'L3', passed: false }),
      ];
      const passedLevels = [
        createMockLevelMetrics({ level: 'L0', passed: true }),
        createMockLevelMetrics({ level: 'L1', passed: true }),
        createMockLevelMetrics({ level: 'L2', passed: true }),
        createMockLevelMetrics({ level: 'L3', passed: true }),
      ];

      const iterations = [
        createMockIterationMetrics(1, { verificationPassed: false, verificationLevels: failedLevels }),
        createMockIterationMetrics(2, { verificationPassed: true, verificationLevels: passedLevels }),
      ];

      const metrics = aggregateRunMetrics(iterations, run);

      expect(metrics.finalVerificationPassed).toBe(true);
      expect(metrics.finalVerificationLevels).toEqual(passedLevels);
    });
  });

  describe('result mapping', () => {
    it('should map passed result', () => {
      const run = createMockRun({ result: RunResult.PASSED });
      const metrics = aggregateRunMetrics([createMockIterationMetrics(1)], run);
      expect(metrics.result).toBe('passed');
    });

    it('should map failed verification result', () => {
      const run = createMockRun({ result: RunResult.FAILED_VERIFICATION });
      const metrics = aggregateRunMetrics([createMockIterationMetrics(1)], run);
      expect(metrics.result).toBe('failed');
    });

    it('should map canceled result', () => {
      const run = createMockRun({ result: RunResult.CANCELED });
      const metrics = aggregateRunMetrics([createMockIterationMetrics(1)], run);
      expect(metrics.result).toBe('canceled');
    });

    it('should map error result', () => {
      const run = createMockRun({ result: RunResult.FAILED_ERROR });
      const metrics = aggregateRunMetrics([createMockIterationMetrics(1)], run);
      expect(metrics.result).toBe('error');
    });
  });
});

describe('computeInProgressMetrics', () => {
  it('should compute metrics for in-progress run', () => {
    const run = createMockRun({ completedAt: null });
    const iterations = [createMockIterationMetrics(1)];

    const metrics = computeInProgressMetrics(iterations, run);

    expect(metrics.runId).toBe('run-1');
    expect(metrics.completedAt).toBeInstanceOf(Date);
    expect(metrics.totalDurationMs).toBeGreaterThan(0);
  });

  it('should use actual completedAt for completed run', () => {
    const completedAt = new Date('2025-01-01T10:10:00Z');
    const run = createMockRun({ completedAt });
    const iterations = [createMockIterationMetrics(1)];

    const metrics = computeInProgressMetrics(iterations, run);

    expect(metrics.completedAt).toEqual(completedAt);
  });
});
