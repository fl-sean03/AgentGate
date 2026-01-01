/**
 * Base Strategy
 *
 * Abstract base class implementing the LoopStrategy interface.
 * Provides common functionality for all loop strategies.
 */

import type {
  LoopStrategy,
  LoopDecision,
  LoopProgress,
  LoopDetectionData,
  LoopContext,
  SnapshotFingerprint,
  RepeatPattern,
  ProgressMetrics,
} from '../../types/loop-strategy.js';
import type { LoopStrategyConfig, LoopStrategyMode } from '../../types/harness-config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('base-strategy');

/**
 * Abstract base class for all loop strategies.
 *
 * Provides common implementations for:
 * - Configuration management
 * - Progress tracking
 * - Loop detection (fingerprinting and pattern matching)
 * - Lifecycle hooks with logging
 */
export abstract class BaseStrategy implements LoopStrategy {
  abstract readonly name: string;
  abstract readonly mode: LoopStrategyMode;

  protected config: LoopStrategyConfig | null = null;
  protected initialized = false;

  // Loop detection state
  protected snapshotFingerprints: SnapshotFingerprint[] = [];
  protected repeatPatterns: RepeatPattern[] = [];
  protected loopDetected = false;
  protected loopDetectedAt: Date | null = null;

  /**
   * Initialize the strategy with configuration.
   */
  initialize(config: LoopStrategyConfig): Promise<void> {
    if (this.initialized) {
      logger.warn({ strategy: this.name }, 'Strategy already initialized, reinitializing');
    }

    this.config = config;
    this.initialized = true;
    this.reset();

    logger.debug({ strategy: this.name, config }, 'Strategy initialized');

    return Promise.resolve();
  }

  /**
   * Called before the first iteration.
   * Override in subclasses for custom behavior.
   */
  onLoopStart(context: LoopContext): Promise<void> {
    logger.info(
      { strategy: this.name, workOrderId: context.workOrderId, runId: context.runId },
      'Loop starting'
    );
    return Promise.resolve();
  }

  /**
   * Called before each iteration.
   * Override in subclasses for custom behavior.
   */
  onIterationStart(context: LoopContext): Promise<void> {
    logger.debug(
      {
        strategy: this.name,
        workOrderId: context.workOrderId,
        iteration: context.state.iteration,
      },
      'Iteration starting'
    );
    return Promise.resolve();
  }

  /**
   * Determine whether to continue the loop.
   * Must be implemented by subclasses.
   */
  abstract shouldContinue(context: LoopContext): Promise<LoopDecision>;

  /**
   * Called after each iteration completes.
   * Updates loop detection state.
   */
  onIterationEnd(context: LoopContext, decision: LoopDecision): Promise<void> {
    // Update fingerprints for loop detection
    if (context.currentSnapshot) {
      const fingerprint = this.createFingerprint(context);
      this.snapshotFingerprints.push(fingerprint);

      // Keep only recent fingerprints (last 10)
      if (this.snapshotFingerprints.length > 10) {
        this.snapshotFingerprints.shift();
      }
    }

    logger.debug(
      {
        strategy: this.name,
        workOrderId: context.workOrderId,
        iteration: context.state.iteration,
        decision: decision.action,
      },
      'Iteration ended'
    );

    return Promise.resolve();
  }

  /**
   * Called when the loop terminates.
   * Override in subclasses for custom cleanup.
   */
  onLoopEnd(context: LoopContext, finalDecision: LoopDecision): Promise<void> {
    logger.info(
      {
        strategy: this.name,
        workOrderId: context.workOrderId,
        runId: context.runId,
        iteration: context.state.iteration,
        reason: finalDecision.reason,
      },
      'Loop ended'
    );
    return Promise.resolve();
  }

  /**
   * Get current progress estimate.
   */
  getProgress(context: LoopContext): LoopProgress {
    const { state } = context;
    const now = new Date();

    // Calculate estimated completion based on iterations
    const elapsedMs = now.getTime() - state.startedAt.getTime();
    const avgIterationMs =
      state.iteration > 0 ? elapsedMs / state.iteration : elapsedMs;
    const remainingIterations = state.maxIterations - state.iteration;
    const estimatedRemainingMs = remainingIterations * avgIterationMs;
    const estimatedCompletion = new Date(now.getTime() + estimatedRemainingMs);

    // Calculate progress percentage
    const progressPercent =
      state.maxIterations > 0
        ? Math.min(100, (state.iteration / state.maxIterations) * 100)
        : 0;

    // Determine trend from history
    const trend = this.calculateTrend(state.history);

    // Calculate metrics from history
    const metrics = this.calculateMetrics(context);

    const lastHistoryEntry = state.history.length > 0
      ? state.history[state.history.length - 1]
      : null;

    return {
      iteration: state.iteration,
      totalIterations: state.maxIterations,
      startedAt: state.startedAt,
      lastIterationAt: lastHistoryEntry?.completedAt ?? null,
      estimatedCompletion,
      progressPercent,
      trend,
      metrics,
    };
  }

  /**
   * Detect if the loop is stuck in a cycle.
   */
  detectLoop(context: LoopContext): LoopDetectionData {
    const patterns = this.detectRepeatPatterns();
    const hasLoop = patterns.length > 0;

    if (hasLoop && !this.loopDetected) {
      this.loopDetected = true;
      this.loopDetectedAt = new Date();
      this.repeatPatterns = patterns;

      logger.warn(
        {
          strategy: this.name,
          workOrderId: context.workOrderId,
          patterns,
        },
        'Loop detected'
      );
    }

    const highestConfidence = patterns.reduce(
      (max, p) => Math.max(max, p.confidence),
      0
    );
    const primaryPattern = patterns.length > 0 ? patterns[0] : null;

    return {
      recentSnapshots: [...this.snapshotFingerprints],
      repeatPatterns: patterns,
      loopDetected: this.loopDetected,
      loopType: primaryPattern?.patternType ?? null,
      confidence: highestConfidence,
      detectedAt: this.loopDetectedAt,
    };
  }

  /**
   * Reset strategy state for reuse.
   */
  reset(): void {
    this.snapshotFingerprints = [];
    this.repeatPatterns = [];
    this.loopDetected = false;
    this.loopDetectedAt = null;
  }

  /**
   * Ensure the strategy is initialized.
   */
  protected ensureInitialized(): void {
    if (!this.initialized || !this.config) {
      throw new Error(`Strategy '${this.name}' not initialized. Call initialize() first.`);
    }
  }

  /**
   * Create a decision to continue the loop.
   */
  protected continueDecision(reason: string, metadata: Record<string, unknown> = {}): LoopDecision {
    return {
      shouldContinue: true,
      reason,
      action: 'continue',
      metadata,
    };
  }

  /**
   * Create a decision to stop the loop.
   */
  protected stopDecision(reason: string, metadata: Record<string, unknown> = {}): LoopDecision {
    return {
      shouldContinue: false,
      reason,
      action: 'stop',
      metadata,
    };
  }

  /**
   * Create a decision to retry the current iteration.
   */
  protected retryDecision(reason: string, metadata: Record<string, unknown> = {}): LoopDecision {
    return {
      shouldContinue: true,
      reason,
      action: 'retry',
      metadata,
    };
  }

  /**
   * Create a decision to escalate (e.g., to human).
   */
  protected escalateDecision(reason: string, metadata: Record<string, unknown> = {}): LoopDecision {
    return {
      shouldContinue: false,
      reason,
      action: 'escalate',
      metadata,
    };
  }

  /**
   * Create a fingerprint from the current context.
   */
  protected createFingerprint(context: LoopContext): SnapshotFingerprint {
    const snapshot = context.currentSnapshot;
    const verification = context.currentVerification;

    // Create file hashes from snapshot
    const fileHashes: Record<string, string> = {};
    if (snapshot) {
      fileHashes['_commit'] = snapshot.afterSha;
    }

    // Create error signature from verification
    let errorSignature: string | null = null;
    if (verification && !verification.passed) {
      const diagnostics = verification.diagnostics;
      if (diagnostics.length > 0) {
        // Create a stable signature from error types and locations
        errorSignature = diagnostics
          .slice(0, 5)
          .map(d => `${d.level}:${d.type}:${d.file ?? 'unknown'}`)
          .join('|');
      }
    }

    return {
      iteration: context.state.iteration,
      sha: snapshot?.afterSha ?? '',
      fileHashes,
      errorSignature,
      createdAt: new Date(),
    };
  }

  /**
   * Detect repeat patterns in recent snapshots.
   */
  protected detectRepeatPatterns(): RepeatPattern[] {
    const patterns: RepeatPattern[] = [];
    const fingerprints = this.snapshotFingerprints;

    if (fingerprints.length < 2) {
      return patterns;
    }

    // Detect exact SHA matches
    const shaGroups = new Map<string, number[]>();
    for (const fp of fingerprints) {
      if (fp.sha) {
        const existing = shaGroups.get(fp.sha) ?? [];
        existing.push(fp.iteration);
        shaGroups.set(fp.sha, existing);
      }
    }

    for (const [sha, iterations] of shaGroups) {
      if (iterations.length >= 2) {
        patterns.push({
          patternType: 'exact',
          iterations,
          confidence: Math.min(1, iterations.length / 3),
          description: `Exact commit match at SHA ${sha.slice(0, 8)}`,
        });
      }
    }

    // Detect error signature patterns (semantic loops)
    const errorGroups = new Map<string, number[]>();
    for (const fp of fingerprints) {
      if (fp.errorSignature) {
        const existing = errorGroups.get(fp.errorSignature) ?? [];
        existing.push(fp.iteration);
        errorGroups.set(fp.errorSignature, existing);
      }
    }

    for (const [, iterations] of errorGroups) {
      if (iterations.length >= 2) {
        patterns.push({
          patternType: 'semantic',
          iterations,
          confidence: Math.min(1, iterations.length / 3),
          description: 'Same error pattern recurring',
        });
      }
    }

    // Detect oscillating patterns (A -> B -> A -> B)
    if (fingerprints.length >= 4) {
      const recent = fingerprints.slice(-4);
      const r0 = recent[0];
      const r1 = recent[1];
      const r2 = recent[2];
      const r3 = recent[3];
      if (
        r0 && r1 && r2 && r3 &&
        r0.sha === r2.sha &&
        r1.sha === r3.sha &&
        r0.sha !== r1.sha
      ) {
        patterns.push({
          patternType: 'oscillating',
          iterations: recent.map(f => f.iteration),
          confidence: 0.9,
          description: 'Oscillating between two states',
        });
      }
    }

    return patterns;
  }

  /**
   * Calculate trend from iteration history.
   */
  protected calculateTrend(
    history: LoopContext['state']['history']
  ): 'improving' | 'stagnant' | 'regressing' | 'unknown' {
    if (history.length < 2) {
      return 'unknown';
    }

    // Compare recent errors
    const recent = history.slice(-3);
    const errorCounts = recent.map(h => h.errorsCount);

    if (errorCounts.length < 2) {
      return 'unknown';
    }

    const first = errorCounts[0];
    const last = errorCounts[errorCounts.length - 1];

    if (first === undefined || last === undefined) {
      return 'unknown';
    }

    if (last < first) {
      return 'improving';
    } else if (last > first) {
      return 'regressing';
    } else {
      // Check if all are the same
      const allSame = errorCounts.every(c => c === first);
      return allSame ? 'stagnant' : 'unknown';
    }
  }

  /**
   * Calculate progress metrics from context.
   */
  protected calculateMetrics(context: LoopContext): ProgressMetrics {
    const history = context.state.history;
    const current = context.currentVerification;
    const previous = context.previousVerifications;

    // Default metrics
    const metrics: ProgressMetrics = {
      testsPassingPrevious: 0,
      testsPassingCurrent: 0,
      testsTotal: 0,
      linesChanged: 0,
      filesChanged: 0,
      errorsFixed: 0,
      errorsRemaining: 0,
      customMetrics: {},
    };

    // Calculate from verification reports
    if (current) {
      metrics.errorsRemaining = current.diagnostics.length;
    }

    if (previous.length > 0) {
      const lastPrevious = previous[previous.length - 1];
      if (lastPrevious) {
        metrics.errorsFixed = Math.max(
          0,
          lastPrevious.diagnostics.length - (current?.diagnostics.length ?? 0)
        );
      }
    }

    // Calculate from history
    if (history.length > 0) {
      const latest = history[history.length - 1];
      if (latest) {
        metrics.errorsRemaining = latest.errorsCount;
      }
    }

    // Calculate from snapshots
    if (context.currentSnapshot) {
      metrics.linesChanged =
        context.currentSnapshot.insertions + context.currentSnapshot.deletions;
      metrics.filesChanged = context.currentSnapshot.filesChanged;
    }

    return metrics;
  }
}
