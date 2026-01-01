/**
 * Ralph Strategy Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RalphStrategy,
  createRalphStrategy,
} from '../../../src/harness/strategies/ralph-strategy.js';
import {
  LoopStrategyMode,
  CompletionDetection,
  type RalphStrategyConfig,
} from '../../../src/types/harness-config.js';
import type {
  LoopContext,
  LoopState,
} from '../../../src/types/loop-strategy.js';
import type { Snapshot } from '../../../src/types/snapshot.js';
import type { VerificationReport } from '../../../src/types/verification.js';

/**
 * Create a minimal LoopState for testing.
 */
function createTestLoopState(overrides: Partial<LoopState> = {}): LoopState {
  return {
    iteration: 1,
    maxIterations: 10,
    startedAt: new Date(),
    lastDecision: null,
    progress: {
      iteration: 1,
      totalIterations: 10,
      startedAt: new Date(),
      lastIterationAt: null,
      estimatedCompletion: null,
      progressPercent: 10,
      trend: 'unknown',
      metrics: {
        testsPassingPrevious: 0,
        testsPassingCurrent: 0,
        testsTotal: 0,
        linesChanged: 0,
        filesChanged: 0,
        errorsFixed: 0,
        errorsRemaining: 0,
        customMetrics: {},
      },
    },
    loopDetection: {
      recentSnapshots: [],
      repeatPatterns: [],
      loopDetected: false,
      loopType: null,
      confidence: 0,
      detectedAt: null,
    },
    history: [],
    isTerminal: false,
    terminationReason: null,
    ...overrides,
  };
}

/**
 * Create a minimal LoopContext for testing.
 */
function createTestContext(overrides: Partial<LoopContext> = {}): LoopContext {
  const config: RalphStrategyConfig = {
    mode: LoopStrategyMode.RALPH,
    minIterations: 1,
    maxIterations: 10,
    convergenceThreshold: 0.05,
    windowSize: 3,
    completionDetection: [
      CompletionDetection.VERIFICATION_PASS,
      CompletionDetection.LOOP_DETECTION,
    ],
    progressTracking: 'verification_levels',
  };

  return {
    workOrderId: 'wo-test-123',
    runId: 'run-test-456',
    taskPrompt: 'Test task prompt',
    config,
    state: createTestLoopState(),
    currentSnapshot: null,
    currentVerification: null,
    previousSnapshots: [],
    previousVerifications: [],
    ...overrides,
  };
}

/**
 * Create a minimal Snapshot for testing.
 */
function createTestSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    id: 'snap-test-123',
    runId: 'run-test-456',
    iteration: 1,
    beforeSha: 'abc123',
    afterSha: 'def456',
    branch: 'main',
    commitMessage: 'Test commit',
    patchPath: null,
    filesChanged: 2,
    insertions: 10,
    deletions: 5,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a minimal VerificationReport for testing.
 */
function createTestVerification(
  passed: boolean,
  overrides: Partial<VerificationReport> = {}
): VerificationReport {
  return {
    id: 'ver-test-123',
    snapshotId: 'snap-test-123',
    runId: 'run-test-456',
    iteration: 1,
    passed,
    l0Result: { level: 'L0', passed: true, checks: [], duration: 100 },
    l1Result: { level: 'L1', passed, checks: [], duration: 200 },
    l2Result: { level: 'L2', passed: true, checks: [], duration: 0 },
    l3Result: { level: 'L3', passed: true, checks: [], duration: 0 },
    logs: '',
    diagnostics: passed
      ? []
      : [
          {
            level: 'L1',
            type: 'error',
            message: 'Test error',
            file: 'test.ts',
            line: 10,
            column: 5,
          },
        ],
    totalDuration: 300,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('RalphStrategy', () => {
  let strategy: RalphStrategy;

  beforeEach(() => {
    strategy = new RalphStrategy();
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(strategy.name).toBe('ralph');
    });

    it('should have correct mode', () => {
      expect(strategy.mode).toBe(LoopStrategyMode.RALPH);
    });
  });

  describe('initialize', () => {
    it('should initialize with ralph config', async () => {
      const config: RalphStrategyConfig = {
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 10,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
        progressTracking: 'verification_levels',
      };

      await strategy.initialize(config);

      // Strategy should be usable after initialization
      const context = createTestContext({ config });
      const decision = await strategy.shouldContinue(context);
      expect(decision).toBeDefined();
    });

    it('should allow reinitialization', async () => {
      const config1: RalphStrategyConfig = {
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 5,
        convergenceThreshold: 0.1,
        windowSize: 2,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
        progressTracking: 'verification_levels',
      };

      const config2: RalphStrategyConfig = {
        mode: LoopStrategyMode.RALPH,
        minIterations: 2,
        maxIterations: 10,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [CompletionDetection.LOOP_DETECTION],
        progressTracking: 'verification_levels',
      };

      await strategy.initialize(config1);
      await strategy.initialize(config2);

      // Should use second config
      const context = createTestContext({
        config: config2,
        state: createTestLoopState({ maxIterations: 10 }),
      });
      const decision = await strategy.shouldContinue(context);
      expect(decision).toBeDefined();
    });
  });

  describe('shouldContinue', () => {
    beforeEach(async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 10,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [
          CompletionDetection.VERIFICATION_PASS,
          CompletionDetection.LOOP_DETECTION,
        ],
        progressTracking: 'verification_levels',
      });
    });

    it('should throw if not initialized', () => {
      const uninitializedStrategy = new RalphStrategy();
      const context = createTestContext();

      expect(() => uninitializedStrategy.shouldContinue(context)).toThrow(/not initialized/);
    });

    it('should stop when max iterations reached', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 10, maxIterations: 10 }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.action).toBe('stop');
      expect(decision.reason).toBe('Max iterations reached');
      expect(decision.metadata.iteration).toBe(10);
      expect(decision.metadata.maxIterations).toBe(10);
    });

    it('should continue when iterations remaining and no completion signal', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1, maxIterations: 10 }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
      expect(decision.reason).toBe('Waiting for completion signal');
    });

    it('should stop when verification passes', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1, maxIterations: 10 }),
        currentVerification: createTestVerification(true),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.action).toBe('stop');
      expect(decision.reason).toBe('Verification passed');
    });

    it('should continue when verification fails', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1, maxIterations: 10 }),
        currentVerification: createTestVerification(false),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
    });

    it('should continue when minimum iterations not reached', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.RALPH,
        minIterations: 5,
        maxIterations: 10,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
        progressTracking: 'verification_levels',
      });

      const context = createTestContext({
        config: {
          mode: LoopStrategyMode.RALPH,
          minIterations: 5,
          maxIterations: 10,
          convergenceThreshold: 0.05,
          windowSize: 3,
          completionDetection: [CompletionDetection.VERIFICATION_PASS],
          progressTracking: 'verification_levels',
        },
        state: createTestLoopState({ iteration: 2, maxIterations: 10 }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.reason).toBe('Minimum iterations not reached');
      expect(decision.metadata.remainingMin).toBe(3);
    });
  });

  describe('completion signal detection', () => {
    beforeEach(async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 10,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
        progressTracking: 'verification_levels',
      });
    });

    it('should detect TASK_COMPLETE signal in verification logs', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1 }),
        currentVerification: createTestVerification(false, {
          logs: 'Some output...\nTASK_COMPLETE\nMore output...',
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Agent signaled completion');
      expect(decision.metadata.signal).toBe('TASK_COMPLETE');
    });

    it('should detect TASK_COMPLETED signal', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1 }),
        currentVerification: createTestVerification(false, {
          logs: 'Work done! TASK_COMPLETED.',
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Agent signaled completion');
    });

    it('should detect DONE signal', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1 }),
        currentVerification: createTestVerification(false, {
          logs: 'All tasks finished. DONE',
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Agent signaled completion');
    });

    it('should detect [COMPLETE] signal', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1 }),
        currentVerification: createTestVerification(false, {
          logs: 'Everything is [COMPLETE]!',
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Agent signaled completion');
    });

    it('should detect signal in commit message if no logs', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1 }),
        currentSnapshot: createTestSnapshot({
          commitMessage: 'Fixed the bug. TASK_COMPLETE.',
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Agent signaled completion');
    });

    it('should be case insensitive for completion signals', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1 }),
        currentVerification: createTestVerification(false, {
          logs: 'All tasks done. task_complete.',
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Agent signaled completion');
    });

    it('should continue when no completion signal present', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1 }),
        currentVerification: createTestVerification(false, {
          logs: 'Still working on the task...',
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
    });
  });

  describe('similarity-based loop detection', () => {
    beforeEach(async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 10,
        convergenceThreshold: 0.05, // 95% similarity threshold
        windowSize: 3,
        completionDetection: [CompletionDetection.LOOP_DETECTION],
        progressTracking: 'verification_levels',
      });
    });

    it('should not detect loop with too few iterations', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1 }),
        currentVerification: createTestVerification(false, {
          logs: 'Working on the task...',
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
    });

    it('should detect loop when outputs are identical', async () => {
      // Simulate multiple iterations with identical output
      const identicalOutput = 'Trying to fix the issue. Same approach.';

      for (let i = 1; i <= 3; i++) {
        const context = createTestContext({
          config: {
            mode: LoopStrategyMode.RALPH,
            minIterations: 1,
            maxIterations: 10,
            convergenceThreshold: 0.05,
            windowSize: 3,
            completionDetection: [CompletionDetection.LOOP_DETECTION],
            progressTracking: 'verification_levels',
          },
          state: createTestLoopState({ iteration: i }),
          currentVerification: createTestVerification(false, {
            logs: identicalOutput,
          }),
        });

        const decision = await strategy.shouldContinue(context);
        await strategy.onIterationEnd(context, decision);
      }

      // Fourth iteration with same output should detect loop
      const context = createTestContext({
        config: {
          mode: LoopStrategyMode.RALPH,
          minIterations: 1,
          maxIterations: 10,
          convergenceThreshold: 0.05,
          windowSize: 3,
          completionDetection: [CompletionDetection.LOOP_DETECTION],
          progressTracking: 'verification_levels',
        },
        state: createTestLoopState({ iteration: 4 }),
        currentVerification: createTestVerification(false, {
          logs: identicalOutput,
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Loop detected via output similarity');
    });

    it('should not detect loop when outputs are different', async () => {
      const outputs = [
        'First attempt at fixing the bug',
        'Second approach with different solution',
        'Third try using another method',
        'Fourth iteration with new strategy',
      ];

      for (let i = 0; i < 3; i++) {
        const context = createTestContext({
          config: {
            mode: LoopStrategyMode.RALPH,
            minIterations: 1,
            maxIterations: 10,
            convergenceThreshold: 0.05,
            windowSize: 3,
            completionDetection: [CompletionDetection.LOOP_DETECTION],
            progressTracking: 'verification_levels',
          },
          state: createTestLoopState({ iteration: i + 1 }),
          currentVerification: createTestVerification(false, {
            logs: outputs[i],
          }),
        });

        const decision = await strategy.shouldContinue(context);
        await strategy.onIterationEnd(context, decision);

        expect(decision.shouldContinue).toBe(true);
      }

      // Fourth iteration with different output should continue
      const context = createTestContext({
        config: {
          mode: LoopStrategyMode.RALPH,
          minIterations: 1,
          maxIterations: 10,
          convergenceThreshold: 0.05,
          windowSize: 3,
          completionDetection: [CompletionDetection.LOOP_DETECTION],
          progressTracking: 'verification_levels',
        },
        state: createTestLoopState({ iteration: 4 }),
        currentVerification: createTestVerification(false, {
          logs: outputs[3],
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
    });

    it('should detect loop when outputs are highly similar but not identical', async () => {
      // Outputs that are very similar (>95% Jaccard similarity)
      const similarOutputs = [
        'Attempting to fix the authentication bug in the login module',
        'Attempting to fix the authentication bug in the login module today',
        'Attempting to fix the authentication bug in the login module now',
        'Attempting to fix the authentication bug in the login module again',
      ];

      for (let i = 0; i < 3; i++) {
        const context = createTestContext({
          config: {
            mode: LoopStrategyMode.RALPH,
            minIterations: 1,
            maxIterations: 10,
            convergenceThreshold: 0.05,
            windowSize: 3,
            completionDetection: [CompletionDetection.LOOP_DETECTION],
            progressTracking: 'verification_levels',
          },
          state: createTestLoopState({ iteration: i + 1 }),
          currentVerification: createTestVerification(false, {
            logs: similarOutputs[i],
          }),
        });

        const decision = await strategy.shouldContinue(context);
        await strategy.onIterationEnd(context, decision);
      }

      const context = createTestContext({
        config: {
          mode: LoopStrategyMode.RALPH,
          minIterations: 1,
          maxIterations: 10,
          convergenceThreshold: 0.05,
          windowSize: 3,
          completionDetection: [CompletionDetection.LOOP_DETECTION],
          progressTracking: 'verification_levels',
        },
        state: createTestLoopState({ iteration: 4 }),
        currentVerification: createTestVerification(false, {
          logs: similarOutputs[3],
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Loop detected via output similarity');
    });
  });

  describe('onLoopStart', () => {
    it('should complete without error', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 10,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
        progressTracking: 'verification_levels',
      });

      const context = createTestContext();
      await expect(strategy.onLoopStart(context)).resolves.toBeUndefined();
    });
  });

  describe('onIterationStart', () => {
    it('should complete without error', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 10,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
        progressTracking: 'verification_levels',
      });

      const context = createTestContext();
      await expect(strategy.onIterationStart(context)).resolves.toBeUndefined();
    });
  });

  describe('onIterationEnd', () => {
    it('should track agent outputs for loop detection', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 10,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [CompletionDetection.LOOP_DETECTION],
        progressTracking: 'verification_levels',
      });

      const context = createTestContext({
        currentVerification: createTestVerification(false, {
          logs: 'Some output text',
        }),
      });

      const decision = await strategy.shouldContinue(context);
      await strategy.onIterationEnd(context, decision);

      // Internal state should be updated (verified indirectly via loop detection)
      // The next iteration with same output will be compared
    });

    it('should limit stored outputs to window size', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 20,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [CompletionDetection.LOOP_DETECTION],
        progressTracking: 'verification_levels',
      });

      // Simulate many iterations
      for (let i = 1; i <= 10; i++) {
        const context = createTestContext({
          config: {
            mode: LoopStrategyMode.RALPH,
            minIterations: 1,
            maxIterations: 20,
            convergenceThreshold: 0.05,
            windowSize: 3,
            completionDetection: [CompletionDetection.LOOP_DETECTION],
            progressTracking: 'verification_levels',
          },
          state: createTestLoopState({ iteration: i }),
          currentVerification: createTestVerification(false, {
            logs: `Unique output for iteration ${i}`,
          }),
        });

        const decision = await strategy.shouldContinue(context);
        await strategy.onIterationEnd(context, decision);

        // Should not run out of memory or cause issues
        expect(decision.shouldContinue).toBe(true);
      }
    });
  });

  describe('onLoopEnd', () => {
    it('should complete without error', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 10,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
        progressTracking: 'verification_levels',
      });

      const context = createTestContext();
      const decision = await strategy.shouldContinue(context);

      await expect(strategy.onLoopEnd(context, decision)).resolves.toBeUndefined();
    });
  });

  describe('getProgress', () => {
    it('should return progress information', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 10,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
        progressTracking: 'verification_levels',
      });

      const context = createTestContext({
        state: createTestLoopState({ iteration: 3, maxIterations: 10 }),
      });

      const progress = strategy.getProgress(context);

      expect(progress.iteration).toBe(3);
      expect(progress.totalIterations).toBe(10);
      expect(progress.progressPercent).toBe(30);
      expect(progress.startedAt).toBeDefined();
    });
  });

  describe('detectLoop', () => {
    it('should return no loop initially', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 10,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
        progressTracking: 'verification_levels',
      });

      const context = createTestContext();
      const loopData = strategy.detectLoop(context);

      expect(loopData.loopDetected).toBe(false);
      expect(loopData.repeatPatterns.length).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear internal state', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 10,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [CompletionDetection.LOOP_DETECTION],
        progressTracking: 'verification_levels',
      });

      // Add some state by simulating iterations
      const identicalOutput = 'Same output';
      for (let i = 1; i <= 3; i++) {
        const context = createTestContext({
          config: {
            mode: LoopStrategyMode.RALPH,
            minIterations: 1,
            maxIterations: 10,
            convergenceThreshold: 0.05,
            windowSize: 3,
            completionDetection: [CompletionDetection.LOOP_DETECTION],
            progressTracking: 'verification_levels',
          },
          state: createTestLoopState({ iteration: i }),
          currentVerification: createTestVerification(false, {
            logs: identicalOutput,
          }),
        });

        const decision = await strategy.shouldContinue(context);
        await strategy.onIterationEnd(context, decision);
      }

      // Reset
      strategy.reset();

      // After reset, same output should not trigger loop (history cleared)
      const context = createTestContext({
        config: {
          mode: LoopStrategyMode.RALPH,
          minIterations: 1,
          maxIterations: 10,
          convergenceThreshold: 0.05,
          windowSize: 3,
          completionDetection: [CompletionDetection.LOOP_DETECTION],
          progressTracking: 'verification_levels',
        },
        state: createTestLoopState({ iteration: 1 }),
        currentVerification: createTestVerification(false, {
          logs: identicalOutput,
        }),
      });

      const decision = await strategy.shouldContinue(context);
      expect(decision.shouldContinue).toBe(true);
    });
  });

  describe('createRalphStrategy factory', () => {
    it('should create a RalphStrategy instance', () => {
      const newStrategy = createRalphStrategy();

      expect(newStrategy).toBeInstanceOf(RalphStrategy);
      expect(newStrategy.name).toBe('ralph');
      expect(newStrategy.mode).toBe(LoopStrategyMode.RALPH);
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.RALPH,
        minIterations: 1,
        maxIterations: 10,
        convergenceThreshold: 0.05,
        windowSize: 3,
        completionDetection: [
          CompletionDetection.VERIFICATION_PASS,
          CompletionDetection.LOOP_DETECTION,
        ],
        progressTracking: 'verification_levels',
      });
    });

    it('should handle empty agent output gracefully', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1 }),
        currentVerification: createTestVerification(false, { logs: '' }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
    });

    it('should handle null verification and snapshot', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1 }),
        currentVerification: null,
        currentSnapshot: null,
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
    });

    it('should prioritize completion signal over verification status', async () => {
      // Even if verification fails, completion signal should stop
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1 }),
        currentVerification: createTestVerification(false, {
          logs: 'TASK_COMPLETE - all work done!',
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Agent signaled completion');
    });

    it('should handle iteration at max correctly', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 10, maxIterations: 10 }),
        currentVerification: createTestVerification(false, {
          logs: 'TASK_COMPLETE',
        }),
      });

      const decision = await strategy.shouldContinue(context);

      // Max iterations check happens first
      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Max iterations reached');
    });
  });
});
