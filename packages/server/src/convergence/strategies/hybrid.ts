/**
 * Hybrid Convergence Strategy (v0.2.24)
 *
 * Base iterations plus bonus iterations if progress detected.
 *
 * @module convergence/strategies/hybrid
 */

import type {
  ConvergenceConfig,
  ConvergenceState,
  ConvergenceDecision,
  ConvergenceProgressMetrics,
} from '../../types/index.js';
import { BaseConvergenceStrategy } from '../strategy.js';
import { createProgressTracker, type ProgressTracker } from '../progress.js';

/**
 * Hybrid strategy - base iterations with bonus for progress
 */
export class HybridStrategy extends BaseConvergenceStrategy {
  readonly name = 'hybrid';
  readonly type = 'hybrid' as const;

  private baseIterations = 3;
  private bonusIterations = 2;
  private progressThreshold = 0.1;
  private progressTracker: ProgressTracker;

  constructor() {
    super();
    this.progressTracker = createProgressTracker();
  }

  async initialize(config: ConvergenceConfig): Promise<void> {
    this.baseIterations = config.baseIterations ?? 3;
    this.bonusIterations = config.bonusIterations ?? 2;
    this.progressThreshold = config.progressThreshold ?? 0.1;
    this.progressTracker.reset();
  }

  async shouldContinue(state: ConvergenceState): Promise<ConvergenceDecision> {
    // Update progress tracker
    this.progressTracker.update(state);

    // Check if all gates passed (converged)
    if (this.allGatesPassed(state)) {
      return this.stopDecision('All gates passed', 1.0);
    }

    // Check for loop detection
    if (this.detectLoop(state)) {
      return this.stopDecision('Loop detected', 0.9);
    }

    // Check base iterations
    if (state.iteration < this.baseIterations) {
      return this.continueDecision(
        `Base iteration ${state.iteration}/${this.baseIterations}`,
        1.0
      );
    }

    // Check bonus iterations (if progress made)
    const bonusUsed = state.iteration - this.baseIterations;
    if (bonusUsed < this.bonusIterations) {
      const progress = this.progressTracker.calculate(state);
      if (progress >= this.progressThreshold) {
        return this.continueDecision(
          `Bonus iteration (progress: ${(progress * 100).toFixed(1)}%)`,
          0.8
        );
      }
    }

    // Max iterations reached
    return this.stopDecision('Max iterations with no sufficient progress', 0.7);
  }

  getProgress(state: ConvergenceState): ConvergenceProgressMetrics {
    return this.progressTracker.getMetrics(state);
  }

  reset(): void {
    this.progressTracker.reset();
  }

  /**
   * Detect if we're stuck in a loop
   */
  private detectLoop(state: ConvergenceState): boolean {
    if (state.history.length < 3) {
      return false;
    }

    // Check for identical snapshot hashes in recent iterations
    const recent = state.history.slice(-3);
    const hashes = recent
      .map((h) => h.snapshotHash)
      .filter((h): h is string => h !== undefined);

    if (hashes.length === 3 && new Set(hashes).size === 1) {
      return true;
    }

    return false;
  }
}

/**
 * Create a hybrid strategy instance
 */
export function createHybridStrategy(): HybridStrategy {
  return new HybridStrategy();
}
