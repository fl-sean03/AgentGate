/**
 * Hybrid Strategy
 *
 * A loop strategy that combines progress tracking with multiple completion criteria.
 * This is the DEFAULT and recommended strategy for most tasks.
 *
 * Key features:
 * 1. Track progress via verification levels (L0-L3)
 * 2. Support multiple completion criteria (any can trigger completion)
 * 3. Detect loops via output hash comparison
 * 4. Accept partial results after N iterations if making progress
 */

import * as crypto from 'crypto';
import type { LoopDecision, LoopContext } from '../../types/loop-strategy.js';
import {
  LoopStrategyMode,
  CompletionDetection,
  type HybridStrategyConfig,
} from '../../types/harness-config.js';
import type { VerificationReport, VerificationLevel } from '../../types/verification.js';
import { VerificationLevel as VL } from '../../types/verification.js';
import { BaseStrategy } from './base-strategy.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('hybrid-strategy');

/**
 * Result of checking a completion criterion.
 */
interface CriterionResult {
  met: boolean;
  reason: string;
  metadata: Record<string, unknown>;
}

/**
 * Content hash entry for loop detection.
 */
interface ContentHashEntry {
  iteration: number;
  hash: string;
  createdAt: Date;
}

/**
 * Verification level order for comparison.
 */
const LEVEL_ORDER: VerificationLevel[] = [VL.L0, VL.L1, VL.L2, VL.L3];

/**
 * Hybrid loop strategy.
 *
 * Combines progress tracking with multiple completion criteria to determine
 * when to stop iterating. This is the recommended default strategy.
 */
export class HybridStrategy extends BaseStrategy {
  readonly name = 'hybrid';
  readonly mode = LoopStrategyMode.HYBRID;

  // Loop detection state
  private contentHashes: ContentHashEntry[] = [];
  private loopCount = 0;

  // Progress tracking state
  private highestVerificationLevel: VerificationLevel | null = null;
  private progressHistory: Array<{ iteration: number; level: VerificationLevel | null }> = [];

  /**
   * Get the typed configuration.
   */
  protected getHybridConfig(): HybridStrategyConfig {
    this.ensureInitialized();
    return this.config as HybridStrategyConfig;
  }

  /**
   * Reset strategy state.
   */
  override reset(): void {
    super.reset();
    this.contentHashes = [];
    this.loopCount = 0;
    this.highestVerificationLevel = null;
    this.progressHistory = [];
  }

  /**
   * Determine whether to continue the loop.
   *
   * Hybrid strategy logic:
   * 1. Check if max iterations reached -> stop (with possible partial accept)
   * 2. Check completion criteria in order -> stop if any met
   * 3. Check loop detection -> stop if loop detected
   * 4. Otherwise continue
   */
  shouldContinue(context: LoopContext): Promise<LoopDecision> {
    const config = this.getHybridConfig();
    const { state } = context;
    const maxIterations = config.baseIterations + config.maxBonusIterations;

    // Update progress tracking
    this.updateProgressTracking(context);

    // 1. Check max iterations
    if (state.iteration >= maxIterations) {
      const partialAccept = this.shouldAcceptPartial(context);
      const reason = partialAccept
        ? 'Max iterations reached with progress'
        : 'Max iterations reached';

      logger.info(
        {
          workOrderId: context.workOrderId,
          iteration: state.iteration,
          maxIterations,
          progressMade: this.isProgressMade(),
          partialAccept,
        },
        reason
      );

      return Promise.resolve(
        this.stopDecision(reason, {
          iteration: state.iteration,
          maxIterations,
          partialAccept,
          highestLevel: this.highestVerificationLevel,
        })
      );
    }

    // 2. Check completion criteria
    const completionDetection = config.completionDetection;
    for (const criterion of completionDetection) {
      const result = this.checkCriterion(criterion, context);
      if (result.met) {
        logger.info(
          {
            workOrderId: context.workOrderId,
            iteration: state.iteration,
            criterion,
            ...result.metadata,
          },
          `Completion criterion met: ${result.reason}`
        );
        return Promise.resolve(
          this.stopDecision(result.reason, {
            iteration: state.iteration,
            criterion,
            ...result.metadata,
          })
        );
      }
    }

    // 3. Check loop detection
    const loopDetected = this.detectContentLoop(context);
    if (loopDetected) {
      const partialAccept = this.shouldAcceptPartial(context);
      logger.warn(
        {
          workOrderId: context.workOrderId,
          iteration: state.iteration,
          loopCount: this.loopCount,
          partialAccept,
        },
        'Loop detected via hash comparison'
      );
      return Promise.resolve(
        this.stopDecision('Loop detected', {
          iteration: state.iteration,
          loopCount: this.loopCount,
          partialAccept,
        })
      );
    }

    // 4. Continue with optional bonus iterations
    const baseIterationsRemaining = Math.max(0, config.baseIterations - state.iteration);
    const bonusAvailable = baseIterationsRemaining === 0 && this.isProgressMade();

    logger.debug(
      {
        workOrderId: context.workOrderId,
        iteration: state.iteration,
        baseIterationsRemaining,
        bonusAvailable,
        highestLevel: this.highestVerificationLevel,
      },
      'Continuing to next iteration'
    );

    return Promise.resolve(
      this.continueDecision('Iterations remaining with progress potential', {
        iteration: state.iteration,
        baseIterationsRemaining,
        bonusAvailable,
        highestLevel: this.highestVerificationLevel,
      })
    );
  }

  /**
   * Check a specific completion criterion.
   */
  private checkCriterion(
    criterion: CompletionDetection,
    context: LoopContext
  ): CriterionResult {
    switch (criterion) {
      case CompletionDetection.VERIFICATION_PASS:
        return this.checkVerificationPass(context);

      case CompletionDetection.NO_CHANGES:
        return this.checkNoChanges(context);

      case CompletionDetection.CI_PASS:
        return this.checkCIPass(context);

      case CompletionDetection.AGENT_SIGNAL:
        return this.checkAgentSignal(context);

      case CompletionDetection.LOOP_DETECTION:
        // Loop detection is handled separately for better control
        return { met: false, reason: '', metadata: {} };

      default:
        logger.warn({ criterion }, 'Unknown completion criterion');
        return { met: false, reason: '', metadata: {} };
    }
  }

  /**
   * Check VERIFICATION_PASS criterion.
   * Returns true if verification passed and meets minimum level.
   */
  private checkVerificationPass(context: LoopContext): CriterionResult {
    const { currentVerification } = context;

    if (!currentVerification?.passed) {
      return { met: false, reason: '', metadata: {} };
    }

    const highestLevel = this.getHighestPassingLevel(currentVerification);
    if (!highestLevel) {
      return { met: false, reason: '', metadata: {} };
    }

    return {
      met: true,
      reason: 'Verification passed',
      metadata: {
        verificationId: currentVerification.id,
        highestLevel,
      },
    };
  }

  /**
   * Check NO_CHANGES criterion.
   * Returns true if no files were changed in current iteration.
   */
  private checkNoChanges(context: LoopContext): CriterionResult {
    const { currentSnapshot } = context;

    if (!currentSnapshot) {
      return { met: false, reason: '', metadata: {} };
    }

    if (currentSnapshot.filesChanged === 0) {
      return {
        met: true,
        reason: 'No changes detected',
        metadata: {
          snapshotId: currentSnapshot.id,
        },
      };
    }

    return { met: false, reason: '', metadata: {} };
  }

  /**
   * Check CI_PASS criterion.
   * Returns true if CI status indicates pass.
   * Currently uses verification pass as equivalent.
   */
  private checkCIPass(context: LoopContext): CriterionResult {
    // CI status would be checked via GitHub integration
    // For now, we treat verification pass as equivalent
    const { currentVerification } = context;

    if (currentVerification?.passed) {
      return {
        met: true,
        reason: 'CI passed',
        metadata: {
          verificationId: currentVerification.id,
        },
      };
    }

    return { met: false, reason: '', metadata: {} };
  }

  /**
   * Check AGENT_SIGNAL criterion.
   * Returns true if agent output contains completion signal.
   */
  private checkAgentSignal(context: LoopContext): CriterionResult {
    // Agent signals would be detected from iteration output
    // Check metadata for agent output containing completion signals
    const state = context.state;
    const lastHistory = state.history.length > 0 ? state.history[state.history.length - 1] : null;

    if (!lastHistory) {
      return { met: false, reason: '', metadata: {} };
    }

    // Check decision metadata for agent completion signal
    const decision = lastHistory.decision;
    const agentOutput = (decision.metadata.agentOutput as string) ?? '';

    // Check for known completion signals
    const signals = ['TASK_COMPLETE', 'TASK_COMPLETED', '[COMPLETE]', 'DONE'];
    for (const signal of signals) {
      if (agentOutput.includes(signal)) {
        return {
          met: true,
          reason: 'Agent signaled completion',
          metadata: {
            signal,
            iteration: lastHistory.iteration,
          },
        };
      }
    }

    return { met: false, reason: '', metadata: {} };
  }

  /**
   * Detect loops via content hash comparison.
   * Returns true if last 3 hashes are identical.
   */
  private detectContentLoop(context: LoopContext): boolean {
    const hash = this.computeContentHash(context);
    const entry: ContentHashEntry = {
      iteration: context.state.iteration,
      hash,
      createdAt: new Date(),
    };

    // Add to hash history
    this.contentHashes.push(entry);

    // Keep only last 5 hashes
    if (this.contentHashes.length > 5) {
      this.contentHashes.shift();
    }

    // Need at least 3 hashes to detect a loop
    if (this.contentHashes.length < 3) {
      return false;
    }

    // Check if last 3 hashes are identical
    const last3 = this.contentHashes.slice(-3);
    const firstHash = last3[0]?.hash;
    const allSame = last3.every(e => e.hash === firstHash);

    if (allSame) {
      this.loopCount++;
      return true;
    }

    return false;
  }

  /**
   * Compute content hash from verification results and snapshot SHA.
   * Uses SHA256, returns first 16 characters.
   */
  private computeContentHash(context: LoopContext): string {
    const { currentVerification, currentSnapshot } = context;

    // Build content string for hashing
    const parts: string[] = [];

    // Add snapshot SHA
    if (currentSnapshot) {
      parts.push(`sha:${currentSnapshot.afterSha}`);
    }

    // Add verification level results
    if (currentVerification) {
      parts.push(`l0:${currentVerification.l0Result.passed}`);
      parts.push(`l1:${currentVerification.l1Result.passed}`);
      parts.push(`l2:${currentVerification.l2Result.passed}`);
      parts.push(`l3:${currentVerification.l3Result.passed}`);

      // Add diagnostic count for more granularity
      parts.push(`diag:${currentVerification.diagnostics.length}`);
    }

    const content = parts.join('|');

    // Compute SHA256 hash and return first 16 chars
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * Update progress tracking from verification results.
   */
  private updateProgressTracking(context: LoopContext): void {
    const { currentVerification, state } = context;

    let currentLevel: VerificationLevel | null = null;

    if (currentVerification) {
      currentLevel = this.getHighestPassingLevel(currentVerification);

      // Update highest level if improved
      if (currentLevel && this.levelIsHigher(currentLevel, this.highestVerificationLevel)) {
        this.highestVerificationLevel = currentLevel;
      }
    }

    // Track progress history
    this.progressHistory.push({
      iteration: state.iteration,
      level: currentLevel,
    });

    // Keep only last 10 entries
    if (this.progressHistory.length > 10) {
      this.progressHistory.shift();
    }
  }

  /**
   * Get the highest passing verification level from a report.
   */
  private getHighestPassingLevel(report: VerificationReport): VerificationLevel | null {
    // Check levels from highest to lowest
    if (report.l3Result.passed) return VL.L3;
    if (report.l2Result.passed) return VL.L2;
    if (report.l1Result.passed) return VL.L1;
    if (report.l0Result.passed) return VL.L0;
    return null;
  }

  /**
   * Check if levelA is higher than levelB.
   */
  private levelIsHigher(
    levelA: VerificationLevel,
    levelB: VerificationLevel | null
  ): boolean {
    if (!levelB) return true;
    const indexA = LEVEL_ORDER.indexOf(levelA);
    const indexB = LEVEL_ORDER.indexOf(levelB);
    return indexA > indexB;
  }

  /**
   * Check if progress has been made based on verification levels.
   */
  private isProgressMade(): boolean {
    return this.highestVerificationLevel !== null;
  }

  /**
   * Determine if partial results should be accepted.
   * Returns true if we've exceeded base iterations and made progress.
   */
  private shouldAcceptPartial(context: LoopContext): boolean {
    const config = this.getHybridConfig();
    const { state } = context;

    // If we've used base iterations and made progress, accept partial
    return state.iteration >= config.baseIterations && this.isProgressMade();
  }

  /**
   * Called before the first iteration.
   */
  override async onLoopStart(context: LoopContext): Promise<void> {
    await super.onLoopStart(context);

    const config = this.getHybridConfig();
    logger.info(
      {
        workOrderId: context.workOrderId,
        runId: context.runId,
        baseIterations: config.baseIterations,
        maxBonusIterations: config.maxBonusIterations,
        completionDetection: config.completionDetection,
        progressTracking: config.progressTracking,
      },
      'Hybrid strategy starting loop'
    );
  }

  /**
   * Called when the loop terminates.
   */
  override async onLoopEnd(context: LoopContext, finalDecision: LoopDecision): Promise<void> {
    await super.onLoopEnd(context, finalDecision);

    const config = this.getHybridConfig();
    const iterationsUsed = context.state.iteration;
    const maxIterations = config.baseIterations + config.maxBonusIterations;

    logger.info(
      {
        workOrderId: context.workOrderId,
        runId: context.runId,
        iterationsUsed,
        baseIterations: config.baseIterations,
        maxBonusIterations: config.maxBonusIterations,
        maxIterations,
        finalAction: finalDecision.action,
        finalReason: finalDecision.reason,
        highestVerificationLevel: this.highestVerificationLevel,
        progressMade: this.isProgressMade(),
        loopCount: this.loopCount,
      },
      'Hybrid strategy loop ended'
    );
  }
}

/**
 * Factory function to create a HybridStrategy instance.
 */
export function createHybridStrategy(): HybridStrategy {
  return new HybridStrategy();
}
