/**
 * Fixed Strategy
 *
 * A loop strategy that runs a fixed number of iterations.
 * This is the default strategy and represents the current AgentGate behavior.
 *
 * The strategy continues until:
 * - Max iterations reached
 * - Verification passes (if configured)
 * - No changes detected (if configured)
 * - Loop detection triggered (if configured)
 */

import type { LoopDecision, LoopContext } from '../../types/loop-strategy.js';
import {
  LoopStrategyMode,
  CompletionDetection,
  type FixedStrategyConfig,
} from '../../types/harness-config.js';
import { BaseStrategy } from './base-strategy.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('fixed-strategy');

/**
 * Fixed iteration loop strategy.
 *
 * Runs exactly N iterations unless early termination conditions are met.
 * This strategy implements the current AgentGate iteration model.
 */
export class FixedStrategy extends BaseStrategy {
  readonly name = 'fixed';
  readonly mode = LoopStrategyMode.FIXED;

  /**
   * Get the typed configuration.
   */
  protected getConfig(): FixedStrategyConfig {
    this.ensureInitialized();
    return this.config as FixedStrategyConfig;
  }

  /**
   * Determine whether to continue the loop.
   *
   * Fixed strategy logic:
   * 1. Check if max iterations reached -> stop
   * 2. Check completion detection conditions:
   *    - VERIFICATION_PASS: stop if verification passed
   *    - NO_CHANGES: stop if no files changed
   *    - LOOP_DETECTION: stop if loop detected
   *    - AGENT_SIGNAL: stop if agent signaled completion
   * 3. Otherwise continue
   */
  shouldContinue(context: LoopContext): Promise<LoopDecision> {
    const config = this.getConfig();
    const { state, currentVerification, currentSnapshot } = context;

    // Check max iterations
    if (state.iteration >= config.maxIterations) {
      logger.info(
        {
          workOrderId: context.workOrderId,
          iteration: state.iteration,
          maxIterations: config.maxIterations,
        },
        'Max iterations reached'
      );
      return Promise.resolve(this.stopDecision('Max iterations reached', {
        iteration: state.iteration,
        maxIterations: config.maxIterations,
      }));
    }

    // Check completion detection conditions
    const completionDetection = config.completionDetection;

    // Check verification pass
    if (
      completionDetection.includes(CompletionDetection.VERIFICATION_PASS) &&
      currentVerification?.passed
    ) {
      logger.info(
        { workOrderId: context.workOrderId, iteration: state.iteration },
        'Verification passed, stopping'
      );
      return Promise.resolve(this.stopDecision('Verification passed', {
        iteration: state.iteration,
        verificationId: currentVerification.id,
      }));
    }

    // Check no changes
    if (completionDetection.includes(CompletionDetection.NO_CHANGES)) {
      if (currentSnapshot && currentSnapshot.filesChanged === 0) {
        logger.info(
          { workOrderId: context.workOrderId, iteration: state.iteration },
          'No changes detected, stopping'
        );
        return Promise.resolve(this.stopDecision('No changes detected', {
          iteration: state.iteration,
        }));
      }
    }

    // Check loop detection
    if (completionDetection.includes(CompletionDetection.LOOP_DETECTION)) {
      const loopData = this.detectLoop(context);
      if (loopData.loopDetected && loopData.confidence > 0.8) {
        logger.warn(
          {
            workOrderId: context.workOrderId,
            iteration: state.iteration,
            loopType: loopData.loopType,
            confidence: loopData.confidence,
          },
          'Loop detected, stopping'
        );
        return Promise.resolve(this.stopDecision('Loop detected', {
          iteration: state.iteration,
          loopType: loopData.loopType,
          confidence: loopData.confidence,
          patterns: loopData.repeatPatterns,
        }));
      }
    }

    // Check CI pass (if configured)
    if (completionDetection.includes(CompletionDetection.CI_PASS)) {
      // CI status would be checked via GitHub integration
      // For now, we treat verification pass as equivalent
      if (currentVerification?.passed) {
        logger.info(
          { workOrderId: context.workOrderId, iteration: state.iteration },
          'CI equivalent (verification) passed, stopping'
        );
        return Promise.resolve(this.stopDecision('CI passed', {
          iteration: state.iteration,
        }));
      }
    }

    // Continue to next iteration
    const remainingIterations = config.maxIterations - state.iteration;
    logger.debug(
      {
        workOrderId: context.workOrderId,
        iteration: state.iteration,
        remainingIterations,
      },
      'Continuing to next iteration'
    );

    return Promise.resolve(this.continueDecision('Iterations remaining', {
      iteration: state.iteration,
      remainingIterations,
      maxIterations: config.maxIterations,
    }));
  }

  /**
   * Called before the first iteration.
   */
  override async onLoopStart(context: LoopContext): Promise<void> {
    await super.onLoopStart(context);

    const config = this.getConfig();
    logger.info(
      {
        workOrderId: context.workOrderId,
        runId: context.runId,
        maxIterations: config.maxIterations,
        completionDetection: config.completionDetection,
      },
      'Fixed strategy starting loop'
    );
  }

  /**
   * Called when the loop terminates.
   */
  override async onLoopEnd(context: LoopContext, finalDecision: LoopDecision): Promise<void> {
    await super.onLoopEnd(context, finalDecision);

    const config = this.getConfig();
    const iterationsUsed = context.state.iteration;
    const efficiency = config.maxIterations > 0
      ? (iterationsUsed / config.maxIterations) * 100
      : 100;

    logger.info(
      {
        workOrderId: context.workOrderId,
        runId: context.runId,
        iterationsUsed,
        maxIterations: config.maxIterations,
        efficiency: `${efficiency.toFixed(1)}%`,
        finalAction: finalDecision.action,
        finalReason: finalDecision.reason,
      },
      'Fixed strategy loop ended'
    );
  }
}

/**
 * Factory function to create a FixedStrategy instance.
 */
export function createFixedStrategy(): FixedStrategy {
  return new FixedStrategy();
}
