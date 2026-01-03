/**
 * Manual Convergence Strategy (v0.2.24)
 *
 * Human decides each iteration - always continues until external stop.
 *
 * @module convergence/strategies/manual
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


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
