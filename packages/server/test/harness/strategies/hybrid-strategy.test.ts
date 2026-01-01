/**
 * Hybrid Strategy Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HybridStrategy, createHybridStrategy } from '../../../src/harness/strategies/hybrid-strategy.js';
import {
  LoopStrategyMode,
  CompletionDetection,
  ProgressTrackingMode,
  type HybridStrategyConfig,
} from '../../../src/types/harness-config.js';
import type {
  LoopContext,
  LoopState,
  LoopDecision,
} from '../../../src/types/loop-strategy.js';
import type { Snapshot } from '../../../src/types/snapshot.js';
import type { VerificationReport } from '../../../src/types/verification.js';

/**
 * Create a minimal LoopState for testing.
 */
function createTestLoopState(overrides: Partial<LoopState> = {}): LoopState {
  return {
    iteration: 1,
    maxIterations: 5,
    startedAt: new Date(),
    lastDecision: null,
    progress: {
      iteration: 1,
      totalIterations: 5,
      startedAt: new Date(),
      lastIterationAt: null,
      estimatedCompletion: null,
      progressPercent: 20,
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
 * Create a default HybridStrategyConfig for testing.
 */
function createDefaultHybridConfig(
  overrides: Partial<HybridStrategyConfig> = {}
): HybridStrategyConfig {
  return {
    mode: LoopStrategyMode.HYBRID,
    baseIterations: 3,
    maxBonusIterations: 2,
    progressThreshold: 0.1,
    completionDetection: [
      CompletionDetection.VERIFICATION_PASS,
      CompletionDetection.NO_CHANGES,
    ],
    progressTracking: ProgressTrackingMode.VERIFICATION_LEVELS,
    ...overrides,
  };
}

/**
 * Create a minimal LoopContext for testing.
 */
function createTestContext(overrides: Partial<LoopContext> = {}): LoopContext {
  const config = createDefaultHybridConfig();

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

describe('HybridStrategy', () => {
  let strategy: HybridStrategy;

  beforeEach(() => {
    strategy = new HybridStrategy();
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(strategy.name).toBe('hybrid');
    });

    it('should have correct mode', () => {
      expect(strategy.mode).toBe(LoopStrategyMode.HYBRID);
    });
  });

  describe('initialize', () => {
    it('should initialize with hybrid config', async () => {
      const config = createDefaultHybridConfig();

      await strategy.initialize(config);

      // Strategy should be usable after initialization
      const context = createTestContext({ config });
      const decision = await strategy.shouldContinue(context);
      expect(decision).toBeDefined();
    });

    it('should allow reinitialization', async () => {
      const config1 = createDefaultHybridConfig({ baseIterations: 3 });
      const config2 = createDefaultHybridConfig({ baseIterations: 5 });

      await strategy.initialize(config1);
      await strategy.initialize(config2);

      // Should use second config
      const context = createTestContext({
        config: config2,
        state: createTestLoopState({ maxIterations: 7 }),
      });
      const decision = await strategy.shouldContinue(context);
      expect(decision).toBeDefined();
    });
  });

  describe('shouldContinue - max iterations', () => {
    beforeEach(async () => {
      await strategy.initialize(createDefaultHybridConfig());
    });

    it('should throw if not initialized', () => {
      const uninitializedStrategy = new HybridStrategy();
      const context = createTestContext();

      expect(() => uninitializedStrategy.shouldContinue(context)).toThrow(
        /not initialized/
      );
    });

    it('should stop when max iterations reached (base + bonus)', async () => {
      const config = createDefaultHybridConfig({
        baseIterations: 3,
        maxBonusIterations: 2,
      });
      await strategy.initialize(config);

      const context = createTestContext({
        config,
        state: createTestLoopState({ iteration: 5, maxIterations: 5 }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.action).toBe('stop');
      expect(decision.reason).toContain('Max iterations reached');
      expect(decision.metadata.maxIterations).toBe(5);
    });

    it('should continue when iterations remaining', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
    });
  });

  describe('shouldContinue - VERIFICATION_PASS criterion', () => {
    beforeEach(async () => {
      await strategy.initialize(
        createDefaultHybridConfig({
          completionDetection: [CompletionDetection.VERIFICATION_PASS],
        })
      );
    });

    it('should stop when verification passes', async () => {
      const context = createTestContext({
        config: createDefaultHybridConfig({
          completionDetection: [CompletionDetection.VERIFICATION_PASS],
        }),
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentVerification: createTestVerification(true),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.action).toBe('stop');
      expect(decision.reason).toBe('Verification passed');
      expect(decision.metadata.criterion).toBe(CompletionDetection.VERIFICATION_PASS);
    });

    it('should continue when verification fails', async () => {
      const context = createTestContext({
        config: createDefaultHybridConfig({
          completionDetection: [CompletionDetection.VERIFICATION_PASS],
        }),
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentVerification: createTestVerification(false),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
    });

    it('should continue when no verification available', async () => {
      const context = createTestContext({
        config: createDefaultHybridConfig({
          completionDetection: [CompletionDetection.VERIFICATION_PASS],
        }),
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentVerification: null,
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
    });
  });

  describe('shouldContinue - NO_CHANGES criterion', () => {
    beforeEach(async () => {
      await strategy.initialize(
        createDefaultHybridConfig({
          completionDetection: [CompletionDetection.NO_CHANGES],
        })
      );
    });

    it('should stop when no files changed', async () => {
      const context = createTestContext({
        config: createDefaultHybridConfig({
          completionDetection: [CompletionDetection.NO_CHANGES],
        }),
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
        config: createDefaultHybridConfig({
          completionDetection: [CompletionDetection.NO_CHANGES],
        }),
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentSnapshot: createTestSnapshot({ filesChanged: 3 }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
    });

    it('should continue when no snapshot available', async () => {
      const context = createTestContext({
        config: createDefaultHybridConfig({
          completionDetection: [CompletionDetection.NO_CHANGES],
        }),
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentSnapshot: null,
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
    });
  });

  describe('shouldContinue - CI_PASS criterion', () => {
    beforeEach(async () => {
      await strategy.initialize(
        createDefaultHybridConfig({
          completionDetection: [CompletionDetection.CI_PASS],
        })
      );
    });

    it('should stop when CI (verification) passes', async () => {
      const context = createTestContext({
        config: createDefaultHybridConfig({
          completionDetection: [CompletionDetection.CI_PASS],
        }),
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentVerification: createTestVerification(true),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.action).toBe('stop');
      expect(decision.reason).toBe('CI passed');
    });
  });

  describe('shouldContinue - AGENT_SIGNAL criterion', () => {
    beforeEach(async () => {
      await strategy.initialize(
        createDefaultHybridConfig({
          completionDetection: [CompletionDetection.AGENT_SIGNAL],
        })
      );
    });

    it('should stop when agent signals TASK_COMPLETE', async () => {
      const context = createTestContext({
        config: createDefaultHybridConfig({
          completionDetection: [CompletionDetection.AGENT_SIGNAL],
        }),
        state: createTestLoopState({
          iteration: 2,
          maxIterations: 5,
          history: [
            {
              iteration: 1,
              startedAt: new Date(),
              completedAt: new Date(),
              durationMs: 1000,
              decision: {
                shouldContinue: true,
                reason: 'test',
                action: 'continue',
                metadata: { agentOutput: 'Work done. TASK_COMPLETE' },
              },
              snapshotSha: 'sha123',
              verificationPassed: false,
              errorsCount: 1,
              tokensUsed: 1000,
            },
          ],
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.action).toBe('stop');
      expect(decision.reason).toBe('Agent signaled completion');
    });

    it('should continue when no agent signal found', async () => {
      const context = createTestContext({
        config: createDefaultHybridConfig({
          completionDetection: [CompletionDetection.AGENT_SIGNAL],
        }),
        state: createTestLoopState({
          iteration: 2,
          maxIterations: 5,
          history: [
            {
              iteration: 1,
              startedAt: new Date(),
              completedAt: new Date(),
              durationMs: 1000,
              decision: {
                shouldContinue: true,
                reason: 'test',
                action: 'continue',
                metadata: { agentOutput: 'Still working on it...' },
              },
              snapshotSha: 'sha123',
              verificationPassed: false,
              errorsCount: 1,
              tokensUsed: 1000,
            },
          ],
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
    });
  });

  describe('shouldContinue - loop detection', () => {
    beforeEach(async () => {
      await strategy.initialize(
        createDefaultHybridConfig({
          completionDetection: [CompletionDetection.LOOP_DETECTION],
        })
      );
    });

    it('should continue when no loop detected', async () => {
      const context = createTestContext({
        config: createDefaultHybridConfig({
          completionDetection: [CompletionDetection.LOOP_DETECTION],
        }),
        state: createTestLoopState({ iteration: 1, maxIterations: 10 }),
        currentSnapshot: createTestSnapshot({ afterSha: 'sha1' }),
        currentVerification: createTestVerification(false),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
    });

    it('should detect loop when same hash appears 3 times', async () => {
      const config = createDefaultHybridConfig({
        completionDetection: [],
        baseIterations: 10,
        maxBonusIterations: 0,
      });
      await strategy.initialize(config);

      // Run 3 iterations with identical content
      for (let i = 1; i <= 3; i++) {
        const context = createTestContext({
          config,
          state: createTestLoopState({ iteration: i, maxIterations: 10 }),
          currentSnapshot: createTestSnapshot({ afterSha: 'same-sha' }),
          currentVerification: createTestVerification(false, {
            diagnostics: [
              { level: 'L1', type: 'error', message: 'same error', file: 'test.ts', line: 1, column: 1 },
            ],
          }),
        });

        const decision = await strategy.shouldContinue(context);

        if (i < 3) {
          expect(decision.shouldContinue).toBe(true);
        } else {
          // Third time should detect loop
          expect(decision.shouldContinue).toBe(false);
          expect(decision.reason).toBe('Loop detected');
          expect(decision.metadata.loopCount).toBe(1);
        }
      }
    });

    it('should not detect loop with different hashes', async () => {
      const config = createDefaultHybridConfig({
        completionDetection: [],
        baseIterations: 10,
        maxBonusIterations: 0,
      });
      await strategy.initialize(config);

      // Run 3 iterations with different content
      for (let i = 1; i <= 3; i++) {
        const context = createTestContext({
          config,
          state: createTestLoopState({ iteration: i, maxIterations: 10 }),
          currentSnapshot: createTestSnapshot({ afterSha: `sha-${i}` }),
          currentVerification: createTestVerification(false, {
            diagnostics: [
              { level: 'L1', type: 'error', message: `error ${i}`, file: 'test.ts', line: i, column: 1 },
            ],
          }),
        });

        const decision = await strategy.shouldContinue(context);
        expect(decision.shouldContinue).toBe(true);
      }
    });
  });

  describe('shouldContinue - multiple criteria', () => {
    beforeEach(async () => {
      await strategy.initialize(
        createDefaultHybridConfig({
          completionDetection: [
            CompletionDetection.VERIFICATION_PASS,
            CompletionDetection.NO_CHANGES,
          ],
        })
      );
    });

    it('should stop on first matching criterion (verification)', async () => {
      const context = createTestContext({
        config: createDefaultHybridConfig({
          completionDetection: [
            CompletionDetection.VERIFICATION_PASS,
            CompletionDetection.NO_CHANGES,
          ],
        }),
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentSnapshot: createTestSnapshot({ filesChanged: 5 }),
        currentVerification: createTestVerification(true),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Verification passed');
    });

    it('should stop on second criterion if first not met', async () => {
      const context = createTestContext({
        config: createDefaultHybridConfig({
          completionDetection: [
            CompletionDetection.VERIFICATION_PASS,
            CompletionDetection.NO_CHANGES,
          ],
        }),
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentSnapshot: createTestSnapshot({ filesChanged: 0 }),
        currentVerification: createTestVerification(false),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('No changes detected');
    });

    it('should continue if no criteria met', async () => {
      const context = createTestContext({
        config: createDefaultHybridConfig({
          completionDetection: [
            CompletionDetection.VERIFICATION_PASS,
            CompletionDetection.NO_CHANGES,
          ],
        }),
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentSnapshot: createTestSnapshot({ filesChanged: 3 }),
        currentVerification: createTestVerification(false),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.action).toBe('continue');
    });
  });

  describe('progress tracking', () => {
    beforeEach(async () => {
      await strategy.initialize(createDefaultHybridConfig());
    });

    it('should track highest verification level', async () => {
      // First iteration - L0 only
      let context = createTestContext({
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentVerification: createTestVerification(false, {
          l0Result: { level: 'L0', passed: true, checks: [], duration: 100 },
          l1Result: { level: 'L1', passed: false, checks: [], duration: 200 },
          l2Result: { level: 'L2', passed: false, checks: [], duration: 0 },
          l3Result: { level: 'L3', passed: false, checks: [], duration: 0 },
        }),
      });
      let decision = await strategy.shouldContinue(context);
      expect(decision.metadata.highestLevel).toBe('L0');

      // Second iteration - L1 (improved)
      context = createTestContext({
        state: createTestLoopState({ iteration: 2, maxIterations: 5 }),
        currentVerification: createTestVerification(false, {
          l0Result: { level: 'L0', passed: true, checks: [], duration: 100 },
          l1Result: { level: 'L1', passed: true, checks: [], duration: 200 },
          l2Result: { level: 'L2', passed: false, checks: [], duration: 0 },
          l3Result: { level: 'L3', passed: false, checks: [], duration: 0 },
        }),
      });
      decision = await strategy.shouldContinue(context);
      expect(decision.metadata.highestLevel).toBe('L1');
    });

    it('should indicate progress made when verification improves', async () => {
      const context = createTestContext({
        state: createTestLoopState({ iteration: 1, maxIterations: 5 }),
        currentVerification: createTestVerification(false, {
          l0Result: { level: 'L0', passed: true, checks: [], duration: 100 },
          l1Result: { level: 'L1', passed: false, checks: [], duration: 200 },
          l2Result: { level: 'L2', passed: false, checks: [], duration: 0 },
          l3Result: { level: 'L3', passed: false, checks: [], duration: 0 },
        }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.metadata.highestLevel).toBe('L0');
    });
  });

  describe('partial acceptance', () => {
    it('should accept partial results after base iterations with progress', async () => {
      const config = createDefaultHybridConfig({
        baseIterations: 2,
        maxBonusIterations: 1,
        completionDetection: [],
      });
      await strategy.initialize(config);

      // First iteration - make progress (L0)
      let context = createTestContext({
        config,
        state: createTestLoopState({ iteration: 1, maxIterations: 3 }),
        currentVerification: createTestVerification(false, {
          l0Result: { level: 'L0', passed: true, checks: [], duration: 100 },
          l1Result: { level: 'L1', passed: false, checks: [], duration: 200 },
          l2Result: { level: 'L2', passed: false, checks: [], duration: 0 },
          l3Result: { level: 'L3', passed: false, checks: [], duration: 0 },
        }),
        currentSnapshot: createTestSnapshot({ afterSha: 'sha1' }),
      });
      await strategy.shouldContinue(context);

      // Second iteration
      context = createTestContext({
        config,
        state: createTestLoopState({ iteration: 2, maxIterations: 3 }),
        currentVerification: createTestVerification(false, {
          l0Result: { level: 'L0', passed: true, checks: [], duration: 100 },
          l1Result: { level: 'L1', passed: false, checks: [], duration: 200 },
          l2Result: { level: 'L2', passed: false, checks: [], duration: 0 },
          l3Result: { level: 'L3', passed: false, checks: [], duration: 0 },
        }),
        currentSnapshot: createTestSnapshot({ afterSha: 'sha2' }),
      });
      await strategy.shouldContinue(context);

      // Third iteration (max reached with progress)
      context = createTestContext({
        config,
        state: createTestLoopState({ iteration: 3, maxIterations: 3 }),
        currentVerification: createTestVerification(false, {
          l0Result: { level: 'L0', passed: true, checks: [], duration: 100 },
          l1Result: { level: 'L1', passed: false, checks: [], duration: 200 },
          l2Result: { level: 'L2', passed: false, checks: [], duration: 0 },
          l3Result: { level: 'L3', passed: false, checks: [], duration: 0 },
        }),
        currentSnapshot: createTestSnapshot({ afterSha: 'sha3' }),
      });
      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Max iterations reached with progress');
      expect(decision.metadata.partialAccept).toBe(true);
    });

    it('should fail after max iterations without progress', async () => {
      const config = createDefaultHybridConfig({
        baseIterations: 2,
        maxBonusIterations: 1,
        completionDetection: [],
      });
      await strategy.initialize(config);

      // Run iterations without any verification passing
      for (let i = 1; i <= 2; i++) {
        const context = createTestContext({
          config,
          state: createTestLoopState({ iteration: i, maxIterations: 3 }),
          currentVerification: null,
          currentSnapshot: createTestSnapshot({ afterSha: `sha${i}` }),
        });
        await strategy.shouldContinue(context);
      }

      // Final iteration at max (no progress made)
      const context = createTestContext({
        config,
        state: createTestLoopState({ iteration: 3, maxIterations: 3 }),
        currentVerification: null,
        currentSnapshot: createTestSnapshot({ afterSha: 'sha3' }),
      });
      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('Max iterations reached');
      expect(decision.metadata.partialAccept).toBeFalsy();
    });
  });

  describe('onLoopStart', () => {
    it('should complete without error', async () => {
      await strategy.initialize(createDefaultHybridConfig());

      const context = createTestContext();
      await expect(strategy.onLoopStart(context)).resolves.toBeUndefined();
    });
  });

  describe('onIterationStart', () => {
    it('should complete without error', async () => {
      await strategy.initialize(createDefaultHybridConfig());

      const context = createTestContext();
      await expect(strategy.onIterationStart(context)).resolves.toBeUndefined();
    });
  });

  describe('onIterationEnd', () => {
    it('should complete without error', async () => {
      await strategy.initialize(createDefaultHybridConfig());

      const context = createTestContext({
        currentSnapshot: createTestSnapshot(),
      });
      const decision = await strategy.shouldContinue(context);

      await expect(strategy.onIterationEnd(context, decision)).resolves.toBeUndefined();
    });
  });

  describe('onLoopEnd', () => {
    it('should complete without error', async () => {
      await strategy.initialize(createDefaultHybridConfig());

      const context = createTestContext();
      const decision = await strategy.shouldContinue(context);

      await expect(strategy.onLoopEnd(context, decision)).resolves.toBeUndefined();
    });
  });

  describe('getProgress', () => {
    it('should return progress information', async () => {
      await strategy.initialize(createDefaultHybridConfig());

      const context = createTestContext({
        state: createTestLoopState({ iteration: 2, maxIterations: 5 }),
      });

      const progress = strategy.getProgress(context);

      expect(progress.iteration).toBe(2);
      expect(progress.totalIterations).toBe(5);
      expect(progress.progressPercent).toBe(40);
      expect(progress.startedAt).toBeDefined();
    });
  });

  describe('detectLoop', () => {
    it('should return no loop initially', async () => {
      await strategy.initialize(createDefaultHybridConfig());

      const context = createTestContext();
      const loopData = strategy.detectLoop(context);

      expect(loopData.loopDetected).toBe(false);
    });
  });

  describe('reset', () => {
    it('should clear internal state', async () => {
      await strategy.initialize(createDefaultHybridConfig());

      // Run an iteration to accumulate state
      const context = createTestContext({
        currentSnapshot: createTestSnapshot(),
        currentVerification: createTestVerification(false),
      });
      await strategy.shouldContinue(context);
      await strategy.onIterationEnd(context, await strategy.shouldContinue(context));

      // Reset
      strategy.reset();

      // Verify state cleared
      const loopData = strategy.detectLoop(context);
      expect(loopData.recentSnapshots.length).toBe(0);
    });
  });

  describe('createHybridStrategy factory', () => {
    it('should create a HybridStrategy instance', () => {
      const strategy = createHybridStrategy();

      expect(strategy).toBeInstanceOf(HybridStrategy);
      expect(strategy.name).toBe('hybrid');
      expect(strategy.mode).toBe(LoopStrategyMode.HYBRID);
    });
  });
});
