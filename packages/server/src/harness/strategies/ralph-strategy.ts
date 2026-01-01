/**
 * Ralph Strategy
 *
 * A loop strategy based on Geoffrey Huntley's Ralph Wiggum technique.
 * Continues iterating until the agent signals completion or a loop is detected.
 *
 * The strategy continues until:
 * - Agent explicitly signals task completion (TASK_COMPLETE, DONE, etc.)
 * - Similarity-based loop detected in agent outputs
 * - Max iterations reached
 * - Verification passes (if not skipped)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LoopDecision, LoopContext } from '../../types/loop-strategy.js';
import {
  LoopStrategyMode,
  CompletionDetection,
  type RalphStrategyConfig,
} from '../../types/harness-config.js';
import { BaseStrategy } from './base-strategy.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ralph-strategy');

/**
 * Known completion signals that agents may output.
 */
const COMPLETION_SIGNALS = [
  'TASK_COMPLETE',
  'TASK_COMPLETED',
  'DONE',
  '[COMPLETE]',
  '[TASK COMPLETE]',
  '[DONE]',
] as const;

/**
 * State file names for persistence.
 */
const STATE_FILE = 'loop-state.json';
const METRICS_FILE = 'metrics.json';

/**
 * Internal state for Ralph strategy.
 */
interface RalphInternalState {
  recentOutputs: string[];
  loopCount: number;
  completionSignalFound: boolean;
  persistedAt: Date | null;
}

/**
 * Ralph loop strategy.
 *
 * Based on Geoffrey Huntley's Ralph Wiggum technique - loop until
 * the agent signals completion or gets stuck in a loop.
 */
export class RalphStrategy extends BaseStrategy {
  readonly name = 'ralph';
  readonly mode = LoopStrategyMode.RALPH;

  private internalState: RalphInternalState = {
    recentOutputs: [],
    loopCount: 0,
    completionSignalFound: false,
    persistedAt: null,
  };

  /**
   * Get the typed configuration.
   */
  protected getConfig(): RalphStrategyConfig {
    this.ensureInitialized();
    return this.config as RalphStrategyConfig;
  }

  /**
   * Reset internal state.
   */
  override reset(): void {
    super.reset();
    this.internalState = {
      recentOutputs: [],
      loopCount: 0,
      completionSignalFound: false,
      persistedAt: null,
    };
  }

  /**
   * Determine whether to continue the loop.
   *
   * Ralph strategy logic:
   * 1. Check if max iterations reached -> stop (timeout)
   * 2. Check for completion signal in agent output -> stop (complete)
   * 3. Check for similarity-based loop detection -> stop
   * 4. Check verification pass (if configured) -> stop (complete)
   * 5. Check if minimum iterations reached
   * 6. Otherwise continue
   */
  async shouldContinue(context: LoopContext): Promise<LoopDecision> {
    const config = this.getConfig();
    const { state, currentVerification } = context;

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
      return this.stopDecision('Max iterations reached', {
        iteration: state.iteration,
        maxIterations: config.maxIterations,
        action: 'timeout',
      });
    }

    // Check for completion signal in agent output
    const agentOutput = this.extractAgentOutput(context);
    if (this.checkCompletionSignal(agentOutput)) {
      logger.info(
        { workOrderId: context.workOrderId, iteration: state.iteration },
        'Agent signaled completion'
      );
      this.internalState.completionSignalFound = true;
      return this.stopDecision('Agent signaled completion', {
        iteration: state.iteration,
        signal: this.findCompletionSignal(agentOutput),
        action: 'complete',
      });
    }

    // Check for similarity-based loop detection (if enabled)
    if (config.completionDetection.includes(CompletionDetection.LOOP_DETECTION)) {
      if (agentOutput && this.checkSimilarityLoop(agentOutput, config)) {
        logger.warn(
          {
            workOrderId: context.workOrderId,
            iteration: state.iteration,
            loopCount: this.internalState.loopCount,
          },
          'Similarity-based loop detected'
        );
        return this.stopDecision('Loop detected via output similarity', {
          iteration: state.iteration,
          loopCount: this.internalState.loopCount,
          threshold: config.convergenceThreshold,
          action: 'loop_detected',
        });
      }
    }

    // Check verification pass (if configured)
    if (
      config.completionDetection.includes(CompletionDetection.VERIFICATION_PASS) &&
      currentVerification?.passed
    ) {
      logger.info(
        { workOrderId: context.workOrderId, iteration: state.iteration },
        'Verification passed, stopping'
      );
      return this.stopDecision('Verification passed', {
        iteration: state.iteration,
        verificationId: currentVerification.id,
        action: 'complete',
      });
    }

    // Check minimum iterations
    if (state.iteration < config.minIterations) {
      logger.debug(
        {
          workOrderId: context.workOrderId,
          iteration: state.iteration,
          minIterations: config.minIterations,
        },
        'Minimum iterations not reached, continuing'
      );
      return this.continueDecision('Minimum iterations not reached', {
        iteration: state.iteration,
        minIterations: config.minIterations,
        remainingMin: config.minIterations - state.iteration,
      });
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

    return this.continueDecision('Waiting for completion signal', {
      iteration: state.iteration,
      remainingIterations,
      maxIterations: config.maxIterations,
    });
  }

  /**
   * Called before the first iteration.
   */
  override async onLoopStart(context: LoopContext): Promise<void> {
    await super.onLoopStart(context);

    const config = this.getConfig();

    // Try to load persisted state if available
    await this.loadState(context);

    logger.info(
      {
        workOrderId: context.workOrderId,
        runId: context.runId,
        minIterations: config.minIterations,
        maxIterations: config.maxIterations,
        convergenceThreshold: config.convergenceThreshold,
        windowSize: config.windowSize,
      },
      'Ralph strategy starting loop'
    );
  }

  /**
   * Called after each iteration completes.
   */
  override async onIterationEnd(context: LoopContext, decision: LoopDecision): Promise<void> {
    await super.onIterationEnd(context, decision);

    // Store agent output for similarity checking
    const agentOutput = this.extractAgentOutput(context);
    if (agentOutput) {
      const config = this.getConfig();
      this.internalState.recentOutputs.push(agentOutput);

      // Keep only recent outputs within window size
      const maxOutputs = config.windowSize + 1;
      if (this.internalState.recentOutputs.length > maxOutputs) {
        this.internalState.recentOutputs = this.internalState.recentOutputs.slice(-maxOutputs);
      }
    }

    // Persist state if configured
    await this.persistState(context);
  }

  /**
   * Called when the loop terminates.
   */
  override async onLoopEnd(context: LoopContext, finalDecision: LoopDecision): Promise<void> {
    await super.onLoopEnd(context, finalDecision);

    const config = this.getConfig();
    const iterationsUsed = context.state.iteration;
    const efficiency =
      config.maxIterations > 0 ? (iterationsUsed / config.maxIterations) * 100 : 100;

    logger.info(
      {
        workOrderId: context.workOrderId,
        runId: context.runId,
        iterationsUsed,
        minIterations: config.minIterations,
        maxIterations: config.maxIterations,
        efficiency: `${efficiency.toFixed(1)}%`,
        completionSignalFound: this.internalState.completionSignalFound,
        loopCount: this.internalState.loopCount,
        finalAction: finalDecision.action,
        finalReason: finalDecision.reason,
      },
      'Ralph strategy loop ended'
    );
  }

  /**
   * Extract agent output from context.
   * In a real implementation, this would come from the agent's response.
   * For now, we extract from diagnostics or snapshot info.
   */
  private extractAgentOutput(context: LoopContext): string | null {
    // Try to get output from verification logs
    if (context.currentVerification?.logs) {
      return context.currentVerification.logs;
    }

    // Try to get from snapshot commit message
    if (context.currentSnapshot?.commitMessage) {
      return context.currentSnapshot.commitMessage;
    }

    // Could also extract from context.state history or other sources
    return null;
  }

  /**
   * Check if agent output contains a completion signal.
   */
  private checkCompletionSignal(output: string | null): boolean {
    if (!output) {
      return false;
    }

    const upperOutput = output.toUpperCase();
    return COMPLETION_SIGNALS.some((signal) => upperOutput.includes(signal));
  }

  /**
   * Find which completion signal was detected.
   */
  private findCompletionSignal(output: string | null): string | null {
    if (!output) {
      return null;
    }

    const upperOutput = output.toUpperCase();
    return COMPLETION_SIGNALS.find((signal) => upperOutput.includes(signal)) ?? null;
  }

  /**
   * Check for similarity-based loop in agent outputs.
   * Detects when recent outputs are too similar, indicating the agent is stuck.
   */
  private checkSimilarityLoop(currentOutput: string, config: RalphStrategyConfig): boolean {
    const { recentOutputs } = this.internalState;
    const { windowSize, convergenceThreshold } = config;

    // Need at least windowSize outputs to detect loop
    if (recentOutputs.length < windowSize) {
      return false;
    }

    // Get last N outputs (excluding current)
    const compareOutputs = recentOutputs.slice(-windowSize);

    // Check similarity between current and each recent output
    let highSimilarityCount = 0;
    const similarityThreshold = 1 - convergenceThreshold; // convergenceThreshold=0.05 means 95% similarity threshold

    for (const prevOutput of compareOutputs) {
      const similarity = this.computeSimilarity(currentOutput, prevOutput);
      if (similarity >= similarityThreshold) {
        highSimilarityCount++;
      }
    }

    // If all outputs in window are highly similar, we're in a loop
    if (highSimilarityCount >= windowSize) {
      this.internalState.loopCount++;
      return true;
    }

    return false;
  }

  /**
   * Compute Jaccard similarity between two text outputs.
   * Returns a value between 0 (completely different) and 1 (identical).
   */
  private computeSimilarity(output1: string, output2: string): number {
    // Handle edge cases
    if (!output1 && !output2) {
      return 1;
    }
    if (!output1 || !output2) {
      return 0;
    }
    if (output1 === output2) {
      return 1;
    }

    // Tokenize by splitting on whitespace and punctuation
    const tokenize = (text: string): Set<string> => {
      const tokens = text
        .toLowerCase()
        .split(/[\s\W]+/)
        .filter((t) => t.length > 0);
      return new Set(tokens);
    };

    const tokens1 = tokenize(output1);
    const tokens2 = tokenize(output2);

    // Handle empty token sets
    if (tokens1.size === 0 && tokens2.size === 0) {
      return 1;
    }
    if (tokens1.size === 0 || tokens2.size === 0) {
      return 0;
    }

    // Compute Jaccard similarity: |intersection| / |union|
    let intersectionSize = 0;
    for (const token of tokens1) {
      if (tokens2.has(token)) {
        intersectionSize++;
      }
    }

    const unionSize = tokens1.size + tokens2.size - intersectionSize;
    return unionSize > 0 ? intersectionSize / unionSize : 0;
  }

  /**
   * Persist state to disk for crash recovery.
   */
  private async persistState(context: LoopContext): Promise<void> {
    // State persistence is optional - only persist if we have a workspace
    // In the current implementation, we don't have direct access to stateDir
    // This is a placeholder for future enhancement

    try {
      // For now, just track that we would persist
      this.internalState.persistedAt = new Date();

      logger.debug(
        {
          workOrderId: context.workOrderId,
          iteration: context.state.iteration,
        },
        'State persistence checkpoint'
      );
    } catch (error) {
      logger.warn(
        { workOrderId: context.workOrderId, err: error },
        'Failed to persist state (non-fatal)'
      );
    }
  }

  /**
   * Load persisted state from disk.
   */
  private async loadState(context: LoopContext): Promise<void> {
    // State loading is optional - only load if we have persisted state
    // This is a placeholder for future enhancement

    try {
      logger.debug({ workOrderId: context.workOrderId }, 'Checking for persisted state');
      // In a full implementation, we would check for state files and restore
    } catch (error) {
      logger.debug(
        { workOrderId: context.workOrderId, err: error },
        'No persisted state found (normal on first run)'
      );
    }
  }
}

/**
 * Factory function to create a RalphStrategy instance.
 */
export function createRalphStrategy(): RalphStrategy {
  return new RalphStrategy();
}
