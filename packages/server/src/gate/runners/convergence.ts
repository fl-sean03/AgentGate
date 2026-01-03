/**
 * Convergence Gate Runner (v0.2.24)
 *
 * Checks for convergence using similarity or fingerprint detection.
 *
 * @module gate/runners/convergence
 */

import type {
  GateResult,
  GateFailure,
  ConvergenceCheckType,
} from '../../types/index.js';
import type { GateContext, ValidationResult, ConvergenceDetails } from '../runner-types.js';
import { BaseGateRunner } from '../base-runner.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('convergence-gate-runner');

/**
 * Gate runner for convergence detection
 */
export class ConvergenceGateRunner extends BaseGateRunner {
  readonly name = 'convergence';
  readonly type = 'convergence' as const;

  // Store previous snapshots for comparison
  private previousSnapshots: Map<string, string> = new Map();

  /**
   * Run convergence gate check
   */
  async run(context: GateContext): Promise<GateResult> {
    const startTime = Date.now();
    const gateName = context.currentGate || 'convergence';

    // Get check configuration
    const gate = context.taskSpec.spec.convergence.gates.find(
      (g) => g.name === gateName
    );
    if (!gate || gate.check.type !== 'convergence') {
      return this.failedResult(
        gateName,
        { error: 'Gate configuration not found' },
        [{ message: 'Gate configuration not found or invalid type' }],
        Date.now() - startTime
      );
    }

    const check = gate.check as ConvergenceCheckType;
    const strategy = check.strategy;
    const threshold = check.threshold ?? 0.95;

    log.info(
      { gateName, strategy, threshold, iteration: context.iteration },
      'Running convergence gate'
    );

    const workOrderKey = context.workOrderId;
    const duration = Date.now() - startTime;

    try {
      if (strategy === 'fingerprint') {
        return this.checkFingerprint(context, workOrderKey, threshold, gateName, duration);
      } else {
        return this.checkSimilarity(context, workOrderKey, threshold, gateName, duration);
      }
    } catch (error) {
      log.error({ error, gateName }, 'Convergence gate failed with error');
      return this.failedResult(
        gateName,
        { error: error instanceof Error ? error.message : String(error) },
        [{ message: `Convergence check error: ${error instanceof Error ? error.message : String(error)}` }],
        Date.now() - startTime
      );
    }
  }

  /**
   * Check convergence using fingerprint comparison
   */
  private checkFingerprint(
    context: GateContext,
    workOrderKey: string,
    threshold: number,
    gateName: string,
    duration: number
  ): GateResult {
    // Get current snapshot fingerprint (commit SHA)
    const currentFingerprint = context.snapshot.afterSha || '';

    // Get previous fingerprint
    const previousFingerprint = this.previousSnapshots.get(workOrderKey) || '';

    // Store current for next iteration
    this.previousSnapshots.set(workOrderKey, currentFingerprint);

    // First iteration - no convergence yet
    if (!previousFingerprint) {
      const details: ConvergenceDetails = {
        type: 'convergence',
        strategy: 'fingerprint',
        similarity: 0,
        threshold,
      };

      return this.failedResult(
        gateName,
        details as unknown as Record<string, unknown>,
        [{ message: 'First iteration - no previous state to compare' }],
        duration
      );
    }

    // Check if fingerprints match
    const match = currentFingerprint === previousFingerprint;
    const similarity = match ? 1.0 : 0.0;

    const details: ConvergenceDetails = {
      type: 'convergence',
      strategy: 'fingerprint',
      similarity,
      threshold,
    };

    if (similarity >= threshold) {
      log.info(
        { gateName, similarity, threshold },
        'Convergence detected (fingerprint match)'
      );
      return this.passedResult(gateName, details as unknown as Record<string, unknown>, duration);
    }

    return this.failedResult(
      gateName,
      details as unknown as Record<string, unknown>,
      [{ message: `Fingerprints differ (similarity: ${similarity.toFixed(2)}, threshold: ${threshold})` }],
      duration
    );
  }

  /**
   * Check convergence using content similarity
   */
  private async checkSimilarity(
    context: GateContext,
    workOrderKey: string,
    threshold: number,
    gateName: string,
    duration: number
  ): Promise<GateResult> {
    // Use diff summary or changed files as content fingerprint
    const currentContent = this.getContentFingerprint(context);

    // Get previous content
    const previousContent = this.previousSnapshots.get(workOrderKey) || '';

    // Store current for next iteration
    this.previousSnapshots.set(workOrderKey, currentContent);

    // First iteration - no convergence yet
    if (!previousContent) {
      const details: ConvergenceDetails = {
        type: 'convergence',
        strategy: 'similarity',
        similarity: 0,
        threshold,
      };

      return this.failedResult(
        gateName,
        details as unknown as Record<string, unknown>,
        [{ message: 'First iteration - no previous state to compare' }],
        duration
      );
    }

    // Calculate Jaccard similarity
    const similarity = this.jaccardSimilarity(previousContent, currentContent);

    const details: ConvergenceDetails = {
      type: 'convergence',
      strategy: 'similarity',
      similarity,
      threshold,
    };

    if (similarity >= threshold) {
      log.info(
        { gateName, similarity, threshold },
        'Convergence detected (content similarity)'
      );
      return this.passedResult(gateName, details as unknown as Record<string, unknown>, duration);
    }

    return this.failedResult(
      gateName,
      details as unknown as Record<string, unknown>,
      [{ message: `Content similarity ${(similarity * 100).toFixed(1)}% below threshold ${(threshold * 100).toFixed(1)}%` }],
      duration
    );
  }

  /**
   * Get content fingerprint from context
   * Uses combination of afterSha and filesChanged count as a simple fingerprint
   */
  private getContentFingerprint(context: GateContext): string {
    // Use afterSha and filesChanged as a simple fingerprint
    return `${context.snapshot.afterSha}:${context.snapshot.filesChanged}`;
  }

  /**
   * Calculate Jaccard similarity between two strings
   */
  private jaccardSimilarity(a: string, b: string): number {
    const tokensA = new Set(a.split(/\s+/).filter((t) => t.length > 0));
    const tokensB = new Set(b.split(/\s+/).filter((t) => t.length > 0));

    if (tokensA.size === 0 && tokensB.size === 0) {
      return 1.0;
    }

    const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);

    return intersection.size / union.size;
  }

  /**
   * Reset state for new work order
   */
  reset(): void {
    this.previousSnapshots.clear();
  }

  /**
   * Validate convergence gate configuration
   */
  validate(config: ConvergenceCheckType): ValidationResult {
    if (config.type !== 'convergence') {
      return { valid: false, error: 'Invalid check type' };
    }

    if (!['similarity', 'fingerprint'].includes(config.strategy)) {
      return { valid: false, error: 'Strategy must be "similarity" or "fingerprint"' };
    }

    if (config.threshold !== undefined) {
      if (typeof config.threshold !== 'number' || config.threshold < 0 || config.threshold > 1) {
        return { valid: false, error: 'Threshold must be a number between 0 and 1' };
      }
    }

    return { valid: true };
  }

  /**
   * Generate suggestions for convergence failures
   */
  protected generateSuggestions(result: GateResult): string[] {
    return [
      'Continue iterating - convergence not yet reached',
      'The agent is still making meaningful changes',
    ];
  }
}

/**
 * Create a convergence gate runner instance
 */
export function createConvergenceGateRunner(): ConvergenceGateRunner {
  return new ConvergenceGateRunner();
}
