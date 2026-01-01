/**
 * Test Custom Strategy Fixture
 *
 * A test implementation of a custom loop strategy for testing the CustomStrategy loader.
 * This strategy provides controllable behavior for testing delegation and lifecycle hooks.
 */

import type {
  LoopStrategy,
  LoopDecision,
  LoopProgress,
  LoopDetectionData,
  LoopContext,
  SnapshotFingerprint,
} from '../../../src/types/loop-strategy.js';
import type { LoopStrategyConfig, LoopStrategyMode } from '../../../src/types/harness-config.js';

/**
 * Test custom strategy configuration.
 */
export interface TestCustomStrategyConfig {
  maxIterations?: number;
  shouldContinueUntilIteration?: number;
  throwOnMethod?: string;
  onMethodCalled?: (method: string, args: unknown[]) => void;
}

/**
 * A test custom strategy implementation.
 *
 * Features:
 * - Configurable behavior via constructor params
 * - Tracks all method calls for testing
 * - Can be configured to throw errors for error handling tests
 */
export class TestCustomStrategy implements LoopStrategy {
  readonly name = 'test-custom';
  readonly mode = 'custom' as LoopStrategyMode;

  private config: LoopStrategyConfig | null = null;
  private params: TestCustomStrategyConfig;
  private initialized = false;
  private fingerprints: SnapshotFingerprint[] = [];

  // Track method calls for testing
  public methodCalls: Array<{ method: string; args: unknown[] }> = [];

  constructor(params: TestCustomStrategyConfig = {}) {
    this.params = {
      maxIterations: 3,
      shouldContinueUntilIteration: 2,
      ...params,
    };
  }

  private recordCall(method: string, args: unknown[]): void {
    this.methodCalls.push({ method, args: [...args] });
    if (this.params.onMethodCalled) {
      this.params.onMethodCalled(method, args);
    }
    if (this.params.throwOnMethod === method) {
      throw new Error(`Test error from ${method}`);
    }
  }

  async initialize(config: LoopStrategyConfig): Promise<void> {
    this.recordCall('initialize', [config]);
    this.config = config;
    this.initialized = true;
  }

  async onLoopStart(context: LoopContext): Promise<void> {
    this.recordCall('onLoopStart', [context]);
  }

  async onIterationStart(context: LoopContext): Promise<void> {
    this.recordCall('onIterationStart', [context]);
  }

  async shouldContinue(context: LoopContext): Promise<LoopDecision> {
    this.recordCall('shouldContinue', [context]);

    const maxIterations = this.params.maxIterations ?? 3;
    const continueUntil = this.params.shouldContinueUntilIteration ?? 2;

    // Stop if max iterations reached
    if (context.state.iteration >= maxIterations) {
      return {
        shouldContinue: false,
        reason: 'Max iterations reached',
        action: 'stop',
        metadata: { iteration: context.state.iteration, maxIterations },
      };
    }

    // Continue until specified iteration
    if (context.state.iteration < continueUntil) {
      return {
        shouldContinue: true,
        reason: 'Iterations remaining',
        action: 'continue',
        metadata: { iteration: context.state.iteration },
      };
    }

    // Stop after reaching continue-until iteration
    return {
      shouldContinue: false,
      reason: 'Target iteration reached',
      action: 'stop',
      metadata: { iteration: context.state.iteration, targetIteration: continueUntil },
    };
  }

  async onIterationEnd(context: LoopContext, decision: LoopDecision): Promise<void> {
    this.recordCall('onIterationEnd', [context, decision]);

    // Track fingerprints for loop detection
    if (context.currentSnapshot) {
      this.fingerprints.push({
        iteration: context.state.iteration,
        sha: context.currentSnapshot.afterSha,
        fileHashes: {},
        errorSignature: null,
        createdAt: new Date(),
      });
    }
  }

  async onLoopEnd(context: LoopContext, finalDecision: LoopDecision): Promise<void> {
    this.recordCall('onLoopEnd', [context, finalDecision]);
  }

  getProgress(context: LoopContext): LoopProgress {
    this.recordCall('getProgress', [context]);

    const maxIterations = this.params.maxIterations ?? 3;
    const progressPercent = (context.state.iteration / maxIterations) * 100;

    return {
      iteration: context.state.iteration,
      totalIterations: maxIterations,
      startedAt: context.state.startedAt,
      lastIterationAt: null,
      estimatedCompletion: null,
      progressPercent,
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
    };
  }

  detectLoop(context: LoopContext): LoopDetectionData {
    this.recordCall('detectLoop', [context]);

    return {
      recentSnapshots: [...this.fingerprints],
      repeatPatterns: [],
      loopDetected: false,
      loopType: null,
      confidence: 0,
      detectedAt: null,
    };
  }

  reset(): void {
    this.recordCall('reset', []);
    this.fingerprints = [];
    this.methodCalls = [];
  }

  // Helper methods for testing
  getMethodCalls(): Array<{ method: string; args: unknown[] }> {
    return [...this.methodCalls];
  }

  wasMethodCalled(method: string): boolean {
    return this.methodCalls.some(call => call.method === method);
  }

  getCallCount(method: string): number {
    return this.methodCalls.filter(call => call.method === method).length;
  }
}

/**
 * Factory function to create a TestCustomStrategy.
 */
export function createTestCustomStrategy(params?: TestCustomStrategyConfig): TestCustomStrategy {
  return new TestCustomStrategy(params);
}

/**
 * Default export for dynamic import testing.
 */
export default TestCustomStrategy;

/**
 * Alternative named export for testing named export resolution.
 */
export const Strategy = TestCustomStrategy;

/**
 * A broken strategy that doesn't implement the full interface (for error testing).
 */
export class BrokenStrategy {
  readonly name = 'broken';
  readonly mode = 'custom';

  // Missing most LoopStrategy methods intentionally
  shouldContinue(): LoopDecision {
    return {
      shouldContinue: false,
      reason: 'Broken',
      action: 'stop',
      metadata: {},
    };
  }
}
