/**
 * Custom Strategy Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  CustomStrategy,
  createCustomStrategy,
  CustomStrategyLoadError,
  CustomStrategyNotFoundError,
  CustomStrategyInvalidError,
} from '../../../src/harness/strategies/custom-strategy.js';
import {
  LoopStrategyMode,
  CompletionDetection,
  type CustomStrategyConfig,
} from '../../../src/types/harness-config.js';
import type {
  LoopContext,
  LoopState,
  LoopDecision,
} from '../../../src/types/loop-strategy.js';
import type { Snapshot } from '../../../src/types/snapshot.js';
import type { VerificationReport } from '../../../src/types/verification.js';

// Get the path to test fixtures
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesPath = resolve(__dirname, '../../fixtures/harness');

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
function createTestContext(
  config: CustomStrategyConfig,
  overrides: Partial<LoopContext> = {}
): LoopContext {
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
 * Create a test custom strategy config.
 */
function createTestConfig(overrides: Partial<CustomStrategyConfig> = {}): CustomStrategyConfig {
  const testStrategyPath = resolve(fixturesPath, 'test-custom-strategy.js');
  return {
    mode: LoopStrategyMode.CUSTOM,
    strategyName: testStrategyPath,
    params: {},
    completionDetection: [CompletionDetection.VERIFICATION_PASS],
    ...overrides,
  };
}

describe('CustomStrategy', () => {
  let strategy: CustomStrategy;

  beforeEach(() => {
    strategy = new CustomStrategy();
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(strategy.name).toBe('custom');
    });

    it('should have correct mode', () => {
      expect(strategy.mode).toBe(LoopStrategyMode.CUSTOM);
    });
  });

  describe('initialize', () => {
    it('should throw if mode is not custom', async () => {
      const invalidConfig = {
        mode: LoopStrategyMode.FIXED,
        maxIterations: 3,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
      };

      await expect(strategy.initialize(invalidConfig as CustomStrategyConfig)).rejects.toThrow(
        /requires 'custom' mode/
      );
    });

    it('should throw CustomStrategyLoadError for non-existent module', async () => {
      const config = createTestConfig({
        strategyName: '/non/existent/path/to/strategy.js',
      });

      await expect(strategy.initialize(config)).rejects.toThrow(CustomStrategyLoadError);
    });

    it('should load and initialize a valid custom strategy', async () => {
      const config = createTestConfig();

      await strategy.initialize(config);

      const delegate = strategy.getDelegateStrategy();
      expect(delegate).not.toBeNull();
      expect(delegate?.name).toBe('test-custom');
    });

    it('should pass params to the delegate strategy', async () => {
      const config = createTestConfig({
        params: {
          maxIterations: 5,
          shouldContinueUntilIteration: 3,
        },
      });

      await strategy.initialize(config);

      const delegate = strategy.getDelegateStrategy();
      expect(delegate).not.toBeNull();
    });
  });

  describe('shouldContinue', () => {
    it('should throw if not initialized', async () => {
      const config = createTestConfig();
      const context = createTestContext(config);

      await expect(strategy.shouldContinue(context)).rejects.toThrow(/delegate not loaded/);
    });

    it('should delegate to loaded strategy', async () => {
      const config = createTestConfig();
      await strategy.initialize(config);

      const context = createTestContext(config, {
        state: createTestLoopState({ iteration: 1 }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision).toBeDefined();
      expect(decision.action).toBe('continue');
    });

    it('should stop when delegate strategy says stop', async () => {
      const config = createTestConfig({
        params: { shouldContinueUntilIteration: 1 },
      });
      await strategy.initialize(config);

      const context = createTestContext(config, {
        state: createTestLoopState({ iteration: 2 }),
      });

      const decision = await strategy.shouldContinue(context);

      expect(decision.shouldContinue).toBe(false);
      expect(decision.action).toBe('stop');
    });
  });

  describe('lifecycle hooks', () => {
    let config: CustomStrategyConfig;

    beforeEach(async () => {
      config = createTestConfig();
      await strategy.initialize(config);
    });

    it('should delegate onLoopStart', async () => {
      const context = createTestContext(config);

      await expect(strategy.onLoopStart(context)).resolves.toBeUndefined();
    });

    it('should delegate onIterationStart', async () => {
      const context = createTestContext(config);

      await expect(strategy.onIterationStart(context)).resolves.toBeUndefined();
    });

    it('should delegate onIterationEnd', async () => {
      const context = createTestContext(config, {
        currentSnapshot: createTestSnapshot(),
      });
      const decision: LoopDecision = {
        shouldContinue: true,
        reason: 'Test',
        action: 'continue',
        metadata: {},
      };

      await expect(strategy.onIterationEnd(context, decision)).resolves.toBeUndefined();
    });

    it('should delegate onLoopEnd', async () => {
      const context = createTestContext(config);
      const decision: LoopDecision = {
        shouldContinue: false,
        reason: 'Test',
        action: 'stop',
        metadata: {},
      };

      await expect(strategy.onLoopEnd(context, decision)).resolves.toBeUndefined();
    });
  });

  describe('getProgress', () => {
    it('should throw if not initialized', () => {
      const config = createTestConfig();
      const context = createTestContext(config);

      expect(() => strategy.getProgress(context)).toThrow(/delegate not loaded/);
    });

    it('should delegate to loaded strategy', async () => {
      const config = createTestConfig({
        params: { maxIterations: 5 },
      });
      await strategy.initialize(config);

      const context = createTestContext(config, {
        state: createTestLoopState({ iteration: 2 }),
      });

      const progress = strategy.getProgress(context);

      expect(progress.iteration).toBe(2);
      expect(progress.totalIterations).toBe(5);
    });
  });

  describe('detectLoop', () => {
    it('should throw if not initialized', () => {
      const config = createTestConfig();
      const context = createTestContext(config);

      expect(() => strategy.detectLoop(context)).toThrow(/delegate not loaded/);
    });

    it('should delegate to loaded strategy', async () => {
      const config = createTestConfig();
      await strategy.initialize(config);

      const context = createTestContext(config);

      const loopData = strategy.detectLoop(context);

      expect(loopData.loopDetected).toBe(false);
      expect(loopData.repeatPatterns).toEqual([]);
    });
  });

  describe('reset', () => {
    it('should reset both custom strategy and delegate', async () => {
      const config = createTestConfig();
      await strategy.initialize(config);

      const context = createTestContext(config, {
        currentSnapshot: createTestSnapshot(),
      });
      const decision = await strategy.shouldContinue(context);
      await strategy.onIterationEnd(context, decision);

      strategy.reset();

      // Delegate should be reset (method calls cleared in test strategy)
      const delegate = strategy.getDelegateStrategy() as { getMethodCalls?: () => unknown[] } | null;
      if (delegate && typeof delegate.getMethodCalls === 'function') {
        // After reset, method calls should be empty
        expect(delegate.getMethodCalls()).toEqual([]);
      }
    });
  });

  describe('error handling', () => {
    it('should wrap delegate errors with context', async () => {
      const config = createTestConfig({
        params: { throwOnMethod: 'shouldContinue' },
      });
      await strategy.initialize(config);

      const context = createTestContext(config);

      await expect(strategy.shouldContinue(context)).rejects.toThrow(CustomStrategyLoadError);
    });
  });

  describe('getDelegateStrategy', () => {
    it('should return null before initialization', () => {
      expect(strategy.getDelegateStrategy()).toBeNull();
    });

    it('should return delegate after initialization', async () => {
      const config = createTestConfig();
      await strategy.initialize(config);

      const delegate = strategy.getDelegateStrategy();
      expect(delegate).not.toBeNull();
      expect(delegate?.name).toBe('test-custom');
    });
  });

  describe('createCustomStrategy factory', () => {
    it('should create a CustomStrategy instance', () => {
      const strategy = createCustomStrategy();

      expect(strategy).toBeInstanceOf(CustomStrategy);
      expect(strategy.name).toBe('custom');
      expect(strategy.mode).toBe(LoopStrategyMode.CUSTOM);
    });
  });
});

describe('CustomStrategy error classes', () => {
  describe('CustomStrategyLoadError', () => {
    it('should include module path in message', () => {
      const error = new CustomStrategyLoadError('/path/to/module.js', 'Module not found');

      expect(error.message).toContain('/path/to/module.js');
      expect(error.message).toContain('Module not found');
      expect(error.modulePath).toBe('/path/to/module.js');
      expect(error.name).toBe('CustomStrategyLoadError');
    });

    it('should accept Error as cause', () => {
      const cause = new Error('Original error');
      const error = new CustomStrategyLoadError('/path/to/module.js', cause);

      expect(error.message).toContain('Original error');
      expect(error.cause).toBe(cause);
    });
  });

  describe('CustomStrategyNotFoundError', () => {
    it('should include strategy name and available exports', () => {
      const error = new CustomStrategyNotFoundError(
        '/path/to/module.js',
        'MyStrategy',
        ['Foo', 'Bar']
      );

      expect(error.message).toContain('MyStrategy');
      expect(error.message).toContain('Foo, Bar');
      expect(error.modulePath).toBe('/path/to/module.js');
      expect(error.strategyName).toBe('MyStrategy');
      expect(error.availableExports).toEqual(['Foo', 'Bar']);
      expect(error.name).toBe('CustomStrategyNotFoundError');
    });

    it('should handle empty exports list', () => {
      const error = new CustomStrategyNotFoundError('/path/to/module.js', 'MyStrategy', []);

      expect(error.message).toContain('none');
    });
  });

  describe('CustomStrategyInvalidError', () => {
    it('should include missing methods', () => {
      const error = new CustomStrategyInvalidError(
        '/path/to/module.js',
        'MyStrategy',
        ['initialize', 'shouldContinue']
      );

      expect(error.message).toContain('initialize, shouldContinue');
      expect(error.modulePath).toBe('/path/to/module.js');
      expect(error.strategyName).toBe('MyStrategy');
      expect(error.missingMethods).toEqual(['initialize', 'shouldContinue']);
      expect(error.name).toBe('CustomStrategyInvalidError');
    });
  });
});
