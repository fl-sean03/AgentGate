/**
 * Fixed Convergence Strategy (v0.2.24)
 *
 * Run exactly N iterations, stopping early only if converged.
 *
 * @module convergence/strategies/fixed
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import type { ConvergenceConfig, ConvergenceState, ConvergenceDecision } from '../../types/index.js';
import { BaseConvergenceStrategy } from '../strategy.js';

/**
 * Fixed strategy - runs a fixed number of iterations
 */
export class FixedStrategy extends BaseConvergenceStrategy {
  readonly name = 'fixed';
  readonly type = 'fixed' as const;

  private iterations = 3;

  async initialize(config: ConvergenceConfig): Promise<void> {
    this.iterations = config.iterations ?? 3;
  }

  async shouldContinue(state: ConvergenceState): Promise<ConvergenceDecision> {
    // Check if all gates passed (converged)
    if (this.allGatesPassed(state)) {
      return this.stopDecision('All gates passed', 1.0);
    }

    // Check iteration limit
    if (state.iteration >= this.iterations) {
      return this.stopDecision(`Reached ${this.iterations} iterations`, 1.0);
    }

    return this.continueDecision(
      `Iteration ${state.iteration}/${this.iterations}`,
      1.0
    );
  }

  reset(): void {
    // No state to reset for fixed strategy
  }
}

/**
 * Create a fixed strategy instance
 */
export function createFixedStrategy(): FixedStrategy {
  return new FixedStrategy();
}
