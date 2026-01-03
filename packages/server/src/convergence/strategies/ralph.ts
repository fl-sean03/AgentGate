/**
 * Ralph Convergence Strategy (v0.2.24)
 *
 * Continue until agent signals completion or similarity loop detected.
 * Named after the Ralph metaphor - iterating until the task is done.
 *
 * @module convergence/strategies/ralph
 */

import type { ConvergenceConfig, ConvergenceState, ConvergenceDecision } from '../../types/index.js';
import { BaseConvergenceStrategy } from '../strategy.js';

/**
 * Completion signals to detect in agent output
 */
const COMPLETION_SIGNALS = [
  'TASK_COMPLETE',
  'TASK_COMPLETED',
  'DONE',
  '[COMPLETE]',
  '[TASK COMPLETE]',
  '[DONE]',
  'All tasks completed',
  'Implementation complete',
];

/**
 * Ralph strategy - continue until agent signals done or loop detected
 */
export class RalphStrategy extends BaseConvergenceStrategy {
  readonly name = 'ralph';
  readonly type = 'ralph' as const;

  private convergenceThreshold = 0.05;
  private windowSize = 3;
  private minIterations = 1;
  private maxIterations = 10;
  private recentOutputs: string[] = [];

  async initialize(config: ConvergenceConfig): Promise<void> {
    this.convergenceThreshold = config.convergenceThreshold ?? 0.05;
    this.windowSize = config.windowSize ?? 3;
    this.minIterations = config.minIterations ?? 1;
    // Note: maxIterations comes from ConvergenceLimits, not config
    this.reset();
  }

  async shouldContinue(state: ConvergenceState): Promise<ConvergenceDecision> {
    // Check if all gates passed (converged)
    if (this.allGatesPassed(state)) {
      return this.stopDecision('All gates passed', 1.0);
    }

    // Check for completion signal in agent output
    if (state.agentOutput) {
      const signal = this.detectCompletionSignal(state.agentOutput);
      if (signal) {
        return this.stopDecision(`Agent signaled: ${signal}`, 0.95);
      }
    }

    // Check for similarity-based loop detection
    if (state.agentOutput && this.detectSimilarityLoop(state.agentOutput)) {
      return this.stopDecision('Similarity loop detected', 0.85);
    }

    // Check min iterations
    if (state.iteration < this.minIterations) {
      return this.continueDecision(
        `Min iterations not met (${state.iteration}/${this.minIterations})`,
        1.0
      );
    }

    // Continue by default
    return this.continueDecision('No termination condition met', 0.6);
  }

  reset(): void {
    this.recentOutputs = [];
  }

  /**
   * Detect completion signal in agent output
   */
  private detectCompletionSignal(output: string): string | null {
    const upperOutput = output.toUpperCase();
    for (const signal of COMPLETION_SIGNALS) {
      if (upperOutput.includes(signal.toUpperCase())) {
        return signal;
      }
    }
    return null;
  }

  /**
   * Detect similarity loop in recent outputs
   */
  private detectSimilarityLoop(output: string): boolean {
    // Track recent outputs
    this.recentOutputs.push(output);
    if (this.recentOutputs.length > this.windowSize) {
      this.recentOutputs.shift();
    }

    if (this.recentOutputs.length < this.windowSize) {
      return false;
    }

    // Calculate Jaccard similarity between consecutive outputs
    for (let i = 1; i < this.recentOutputs.length; i++) {
      const prev = this.recentOutputs[i - 1];
      const curr = this.recentOutputs[i];
      if (!prev || !curr) continue;

      const similarity = this.jaccardSimilarity(prev, curr);
      // If any pair is sufficiently different, no loop
      if (similarity < 1 - this.convergenceThreshold) {
        return false;
      }
    }

    // All recent outputs too similar - loop detected
    return true;
  }

  /**
   * Calculate Jaccard similarity between two strings
   */
  private jaccardSimilarity(a: string, b: string): number {
    const tokensA = new Set(a.toLowerCase().split(/\s+/).filter((t) => t.length > 2));
    const tokensB = new Set(b.toLowerCase().split(/\s+/).filter((t) => t.length > 2));

    if (tokensA.size === 0 && tokensB.size === 0) {
      return 1;
    }

    const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);

    return intersection.size / union.size;
  }
}

/**
 * Create a Ralph strategy instance
 */
export function createRalphStrategy(): RalphStrategy {
  return new RalphStrategy();
}
