/**
 * Manual Convergence Strategy (v0.2.24)
 *
 * Human decides each iteration - always continues until external stop.
 *
 * @module convergence/strategies/manual
 */

import type { ConvergenceConfig, ConvergenceState, ConvergenceDecision } from '../../types/index.js';
import { BaseConvergenceStrategy } from '../strategy.js';

/**
 * Manual strategy - always continues, human decides when to stop
 */
export class ManualStrategy extends BaseConvergenceStrategy {
  readonly name = 'manual';
  readonly type = 'manual' as const;

  async initialize(_config: ConvergenceConfig): Promise<void> {
    // No configuration for manual strategy
  }

  async shouldContinue(state: ConvergenceState): Promise<ConvergenceDecision> {
    // Check if all gates passed (converged)
    if (this.allGatesPassed(state)) {
      return this.stopDecision('All gates passed', 1.0);
    }

    // Manual strategy always continues - human uses external stop
    return this.continueDecision(
      `Manual mode - iteration ${state.iteration} (use stop command to halt)`,
      0.5
    );
  }

  reset(): void {
    // No state to reset
  }
}

/**
 * Create a manual strategy instance
 */
export function createManualStrategy(): ManualStrategy {
  return new ManualStrategy();
}
