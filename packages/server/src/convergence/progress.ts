/**
 * Progress Tracker (v0.2.24)
 *
 * Tracks progress across iterations using multiple signals.
 *
 * @module convergence/progress
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import type {
  ConvergenceState,
  ConvergenceProgressMetrics,
  GateProgress,
  GateResult,
} from '../types/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESS TRACKER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Progress tracker interface
 */
export interface ProgressTracker {
  /** Update with new iteration data */
  update(state: ConvergenceState): void;

  /** Calculate overall progress (0-1) */
  calculate(state: ConvergenceState): number;

  /** Get detailed metrics */
  getMetrics(state: ConvergenceState): ConvergenceProgressMetrics;

  /** Reset for new run */
  reset(): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default progress tracker implementation
 */
export class DefaultProgressTracker implements ProgressTracker {
  private history: ConvergenceProgressMetrics[] = [];

  /**
   * Update history with current state
   */
  update(state: ConvergenceState): void {
    this.history.push(this.getMetrics(state));
  }

  /**
   * Calculate overall progress score (0-1)
   */
  calculate(state: ConvergenceState): number {
    if (state.gateResults.length === 0) {
      return 0;
    }

    const gateScores = state.gateResults.map((r) => this.calculateGateProgress(r));
    return gateScores.reduce((a, b) => a + b, 0) / gateScores.length;
  }

  /**
   * Get detailed progress metrics
   */
  getMetrics(state: ConvergenceState): ConvergenceProgressMetrics {
    const current = this.calculate(state);
    const lastEntry = this.history.length > 0 ? this.history[this.history.length - 1] : undefined;
    const previous = lastEntry?.overall ?? 0;

    const trend = this.determineTrend(current, previous);
    const velocity = state.iteration > 0 ? current / state.iteration : 0;

    return {
      overall: current,
      byGate: this.calculateByGate(state),
      trend,
      velocity,
    };
  }

  /**
   * Reset tracker state
   */
  reset(): void {
    this.history = [];
  }

  /**
   * Calculate progress for a single gate
   */
  private calculateGateProgress(result: GateResult): number {
    if (result.passed) {
      return 1.0;
    }

    // Calculate partial progress for verification gates
    if (result.type === 'verification-levels' && result.levelResults) {
      const passed = result.levelResults.filter((l) => l.passed).length;
      const total = result.levelResults.length;
      return total > 0 ? passed / total : 0;
    }

    // Other gates: binary pass/fail
    return 0;
  }

  /**
   * Calculate per-gate progress metrics
   */
  private calculateByGate(state: ConvergenceState): Record<string, GateProgress> {
    const byGate: Record<string, GateProgress> = {};
    const lastMetrics = this.history.length > 0 ? this.history[this.history.length - 1] : undefined;

    for (const result of state.gateResults) {
      const currentLevel = this.calculateGateProgress(result);

      // Find previous level from history
      let previousLevel = 0;
      const prevGateProgress = lastMetrics?.byGate?.[result.gate];
      if (prevGateProgress) {
        previousLevel = prevGateProgress.currentLevel;
      }

      byGate[result.gate] = {
        currentLevel,
        previousLevel,
        trend: this.determineTrend(currentLevel, previousLevel),
      };
    }

    return byGate;
  }

  /**
   * Determine trend based on current vs previous
   */
  private determineTrend(
    current: number,
    previous: number
  ): 'improving' | 'stagnant' | 'regressing' {
    const threshold = 0.05;
    if (current > previous + threshold) {
      return 'improving';
    }
    if (current < previous - threshold) {
      return 'regressing';
    }
    return 'stagnant';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new progress tracker
 */
export function createProgressTracker(): ProgressTracker {
  return new DefaultProgressTracker();
}
