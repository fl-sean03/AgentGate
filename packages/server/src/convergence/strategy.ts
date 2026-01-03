/**
 * Convergence Strategy Interface (v0.2.24)
 *
 * Defines the interface that all convergence strategies must implement.
 * Strategies determine when the agent has converged to the desired state.
 *
 * @module convergence/strategy
 */

import type {
  ConvergenceStrategyType,
  ConvergenceConfig,
  ConvergenceState,
  ConvergenceDecision,
  ConvergenceProgressMetrics,
} from '../types/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convergence strategy interface
 *
 * Strategies are responsible for deciding when to continue or stop iterating.
 * This is a simplified interface focused on the core decision.
 */
export interface ConvergenceStrategy {
  /** Strategy name for identification */
  readonly name: string;

  /** Strategy type */
  readonly type: ConvergenceStrategyType;

  /**
   * Initialize the strategy with configuration
   * @param config Strategy-specific configuration
   */
  initialize(config: ConvergenceConfig): Promise<void>;

  /**
   * Core decision: should we continue iterating?
   * @param state Current convergence state
   * @returns Decision to continue or stop
   */
  shouldContinue(state: ConvergenceState): Promise<ConvergenceDecision>;

  /**
   * Get progress metrics (optional)
   * @param state Current convergence state
   * @returns Progress metrics
   */
  getProgress?(state: ConvergenceState): ConvergenceProgressMetrics;

  /**
   * Reset strategy state for a new run
   */
  reset(): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Factory function type for creating strategy instances
 */
export type StrategyFactory = () => ConvergenceStrategy;

// ═══════════════════════════════════════════════════════════════════════════
// BASE STRATEGY CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base class for convergence strategies with common functionality
 */
export abstract class BaseConvergenceStrategy implements ConvergenceStrategy {
  abstract readonly name: string;
  abstract readonly type: ConvergenceStrategyType;

  /**
   * Default initialization - can be overridden
   */
  async initialize(_config: ConvergenceConfig): Promise<void> {
    // Default: no initialization needed
  }

  /**
   * Core decision logic - must be implemented by subclasses
   */
  abstract shouldContinue(state: ConvergenceState): Promise<ConvergenceDecision>;

  /**
   * Default reset - can be overridden
   */
  reset(): void {
    // Default: no state to reset
  }

  /**
   * Helper: Check if all gates passed
   */
  protected allGatesPassed(state: ConvergenceState): boolean {
    return state.gateResults.length > 0 && state.gateResults.every((r) => r.passed);
  }

  /**
   * Helper: Create a "continue" decision
   */
  protected continueDecision(reason: string, confidence = 1.0): ConvergenceDecision {
    return { continue: true, reason, confidence };
  }

  /**
   * Helper: Create a "stop" decision
   */
  protected stopDecision(reason: string, confidence = 1.0): ConvergenceDecision {
    return { continue: false, reason, confidence };
  }
}
