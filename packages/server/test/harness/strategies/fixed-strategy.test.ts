/**
 * Fixed Strategy Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FixedStrategy, createFixedStrategy } from '../../../src/harness/strategies/fixed-strategy.js';
import {
  LoopStrategyMode,
  CompletionDetection,
  type FixedStrategyConfig,
} from '../../../src/types/harness-config.js';
import type {
  LoopContext,
  LoopState,
  LoopProgress,
  LoopDetectionData,
} from '../../../src/types/loop-strategy.js';
import type { Snapshot } from '../../../src/types/snapshot.js';
import type { VerificationReport } from '../../../src/types/verification.js';

/**
 * Create a minimal LoopState for testing.
 */
function createTestLoopState(overrides: Partial<LoopState> = {}): LoopState {
  return {
    iteration: 1,
    maxIterations: 3,
    startedAt: new Date(),
    lastDecision: null,
    progress: {
      iteration: 1,
      totalIterations: 3,
      startedAt: new Date(),
      lastIterationAt: null,
      estimatedCompletion: null,
      progressPercent: 33,
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
  const config: FixedStrategyConfig = {
    mode: LoopStrategyMode.FIXED,
    maxIterations: 3,
    completionDetection: [CompletionDetection.VERIFICATION_PASS],
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
    diagnostics: passed ? [] : [
      { level: 'L1', type: 'error', message: 'Test error', file: 'test.ts', line: 10, column: 5 },
    ],
    totalDuration: 300,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('FixedStrategy', () => {
  let strategy: FixedStrategy;

  beforeEach(() => {
    strategy = new FixedStrategy();
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(strategy.name).toBe('fixed');
    });

    it('should have correct mode', () => {
      expect(strategy.mode).toBe(LoopStrategyMode.FIXED);
    });
  });

  describe('initialize', () => {
    it('should initialize with fixed config', async () => {
      const config: FixedStrategyConfig = {
        mode: LoopStrategyMode.FIXED,
        maxIterations: 5,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
      };

      await strategy.initialize(config);

      // Strategy should be usable after initialization
      const context = createTestContext({ config });
      const decision = await strategy.shouldContinue(context);
      expect(decision).toBeDefined();
    });

    it('should allow reinitialization', async () => {
      const config1: FixedStrategyConfig = {
        mode: LoopStrategyMode.FIXED,
        maxIterations: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
      };

      const config2: FixedStrategyConfig = {
        mode: LoopStrategyMode.FIXED,
        maxIterations: 5,
        completionDetection: [CompletionDetection.NO_CHANGES],
      };

      await strategy.initialize(config1);
      await strategy.initialize(config2);

      // Should use second config
      const context = createTestContext({
        config: config2,
        state: createTestLoopState({ maxIterations: 5 }),
      });
      const decision = await strategy.shouldContinue(context);
      expect(decision).toBeDefined();
    });
  });

  describe('shouldContinue', () => {
    beforeEach(async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.FIXED,
        maxIterations: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
      });
    });

    it('should throw if not initialized', () => {
      const uninitializedStrategy = new FixedStrategy();
      const context = createTestContext();

      // shouldContinue is synchronous now, so it throws directly (wrapped in Promise.resolve)
      expect(() => uninitializedStrategy.shouldContinue(context)).toThrow(
        /not initialized/
      );
    });

    it('should stop when max iterations reached', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 3, maxIterations: 3 }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.action).toBe('stop');
      expect(decision.reason).toBe('Max iterations reached');
      expect(decision.metadata.iteration).toBe(3);
      expect(decision.metadata.maxIterations).toBe(3);
    });

    it('should continue when iterations remaining', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1, maxIterations: 3 }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
      expect(decision.reason).toBe('Iterations remaining');
      expect(decision.metadata.remainingIterations).toBe(2);
    });

    it('should stop when verification passes', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1, maxIterations: 3 }),
        currentVerification: createTestVerification(true),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.action).toBe('stop');
      expect(decision.reason).toBe('Verification passed');
    });

    it('should continue when verification fails', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1, maxIterations: 3 }),
        currentVerification: createTestVerification(false),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
    });
  });

  describe('shouldContinue with NO_CHANGES detection', () => {
    beforeEach(async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.FIXED,
        maxIterations: 5,
        completionDetection: [CompletionDetection.NO_CHANGES],
      });
    });

    it('should stop when no files changed', async () => {
      const context = createTestContext({
        config: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 5,
          completionDetection: [CompletionDetection.NO_CHANGES],
        },
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentSnapshot: createTestSnapshot({ filesChanged: 0 }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.action).toBe('stop');
      expect(decision.reason).toBe('No changes detected');
    });

    it('should continue when files changed', async () => {
      const context = createTestContext({
        config: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 5,
          completionDetection: [CompletionDetection.NO_CHANGES],
        },
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentSnapshot: createTestSnapshot({ filesChanged: 3 }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
    });
  });

  describe('shouldContinue with LOOP_DETECTION', () => {
    beforeEach(async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.FIXED,
        maxIterations: 10,
        completionDetection: [CompletionDetection.LOOP_DETECTION],
      });
    });

    it('should continue when no loop detected', async () => {
      const context = createTestContext({
        config: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 10,
          completionDetection: [CompletionDetection.LOOP_DETECTION],
        },
        state: createTestLoopState({ iteration: 1, maxIterations: 10 }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
    });
  });

  describe('shouldContinue with multiple detection methods', () => {
    beforeEach(async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.FIXED,
        maxIterations: 5,
        completionDetection: [
          CompletionDetection.VERIFICATION_PASS,
          CompletionDetection.NO_CHANGES,
        ],
      });
    });

    it('should stop on verification pass even if files changed', async () => {
      const context = createTestContext({
        config: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 5,
          completionDetection: [
            CompletionDetection.VERIFICATION_PASS,
            CompletionDetection.NO_CHANGES,
          ],
        },
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentSnapshot: createTestSnapshot({ filesChanged: 5 }),
        currentVerification: createTestVerification(true),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Verification passed');
    });

    it('should stop on no changes even if verification fails', async () => {
      const context = createTestContext({
        config: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 5,
          completionDetection: [
            CompletionDetection.VERIFICATION_PASS,
            CompletionDetection.NO_CHANGES,
          ],
        },
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentSnapshot: createTestSnapshot({ filesChanged: 0 }),
        currentVerification: createTestVerification(false),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('No changes detected');
    });
  });

  describe('onLoopStart', () => {
    it('should complete without error', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.FIXED,
        maxIterations: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
      });

      const context = createTestContext();
      await expect(strategy.onLoopStart(context)).resolves.toBeUndefined();
    });
  });

  describe('onIterationStart', () => {
    it('should complete without error', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.FIXED,
        maxIterations: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
      });

      const context = createTestContext();
      await expect(strategy.onIterationStart(context)).resolves.toBeUndefined();
    });
  });

  describe('onIterationEnd', () => {
    it('should track snapshot fingerprints', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.FIXED,
        maxIterations: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
      });

      const context = createTestContext({
        currentSnapshot: createTestSnapshot({ afterSha: 'sha123' }),
      });

      const decision = await strategy.shouldContinue(context);
      await strategy.onIterationEnd(context, decision);

      // Fingerprints are tracked internally, verify via loop detection
      const loopData = strategy.detectLoop(context);
      expect(loopData.recentSnapshots.length).toBe(1);
      expect(loopData.recentSnapshots[0].sha).toBe('sha123');
    });
  });

  describe('onLoopEnd', () => {
    it('should complete without error', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.FIXED,
        maxIterations: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
      });

      const context = createTestContext();
      const decision = await strategy.shouldContinue(context);

      await expect(strategy.onLoopEnd(context, decision)).resolves.toBeUndefined();
    });
  });

  describe('getProgress', () => {
    it('should return progress information', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.FIXED,
        maxIterations: 5,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
      });

      const context = createTestContext({
        state: createTestLoopState({ iteration: 2, maxIterations: 5 }),
      });

      const progress = strategy.getProgress(context);

      expect(progress.iteration).toBe(2);
      expect(progress.totalIterations).toBe(5);
      expect(progress.progressPercent).toBe(40);
      expect(progress.startedAt).toBeDefined();
    });

    it('should calculate metrics from context', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.FIXED,
        maxIterations: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
      });

      const context = createTestContext({
        currentSnapshot: createTestSnapshot({
          filesChanged: 5,
          insertions: 100,
          deletions: 20,
        }),
        currentVerification: createTestVerification(false),
      });

      const progress = strategy.getProgress(context);

      expect(progress.metrics.filesChanged).toBe(5);
      expect(progress.metrics.linesChanged).toBe(120);
      expect(progress.metrics.errorsRemaining).toBe(1);
    });
  });

  describe('detectLoop', () => {
    it('should return no loop initially', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.FIXED,
        maxIterations: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
      });

      const context = createTestContext();
      const loopData = strategy.detectLoop(context);

      expect(loopData.loopDetected).toBe(false);
      expect(loopData.repeatPatterns.length).toBe(0);
    });

    it('should detect exact SHA matches', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.FIXED,
        maxIterations: 10,
        completionDetection: [CompletionDetection.LOOP_DETECTION],
      });

      // Simulate multiple iterations with same SHA
      const sha = 'repeated-sha-123';

      for (let i = 1; i <= 3; i++) {
        const context = createTestContext({
          state: createTestLoopState({ iteration: i, maxIterations: 10 }),
          currentSnapshot: createTestSnapshot({ afterSha: sha }),
        });

        const decision = await strategy.shouldContinue(context);
        await strategy.onIterationEnd(context, decision);
      }

      const context = createTestContext({
        state: createTestLoopState({ iteration: 4, maxIterations: 10 }),
      });
      const loopData = strategy.detectLoop(context);

      expect(loopData.repeatPatterns.length).toBeGreaterThan(0);
      expect(loopData.repeatPatterns[0].patternType).toBe('exact');
    });
  });

  describe('reset', () => {
    it('should clear internal state', async () => {
      await strategy.initialize({
        mode: LoopStrategyMode.FIXED,
        maxIterations: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
      });

      // Add some state
      const context = createTestContext({
        currentSnapshot: createTestSnapshot(),
      });
      const decision = await strategy.shouldContinue(context);
      await strategy.onIterationEnd(context, decision);

      // Verify state exists
      let loopData = strategy.detectLoop(context);
      expect(loopData.recentSnapshots.length).toBe(1);

      // Reset
      strategy.reset();

      // Verify state cleared
      loopData = strategy.detectLoop(context);
      expect(loopData.recentSnapshots.length).toBe(0);
    });
  });

  describe('createFixedStrategy factory', () => {
    it('should create a FixedStrategy instance', () => {
      const strategy = createFixedStrategy();

      expect(strategy).toBeInstanceOf(FixedStrategy);
      expect(strategy.name).toBe('fixed');
      expect(strategy.mode).toBe(LoopStrategyMode.FIXED);
    });
  });
});
