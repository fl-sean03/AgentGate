/**
 * Metrics aggregator.
 * Computes run-level metrics from iteration metrics.
 */

import {
  type IterationMetrics,
  type RunMetrics,
  type LevelMetrics,
  type Run,
  type MetricsResult,
  RunResult,
} from '../types/index.js';
import { Phase } from '../types/metrics.js';

/**
 * Map RunResult to MetricsResult
 */
function mapRunResult(result: Run['result']): MetricsResult {
  switch (result) {
    case RunResult.PASSED:
      return 'passed';
    case RunResult.FAILED_VERIFICATION:
    case RunResult.FAILED_BUILD:
    case RunResult.FAILED_TIMEOUT:
      return 'failed';
    case RunResult.FAILED_ERROR:
      return 'error';
    case RunResult.CANCELED:
      return 'canceled';
    default:
      return 'error';
  }
}

/**
 * Sum phase durations from an iteration's phases array
 */
function sumPhaseDuration(phases: IterationMetrics['phases'], targetPhase: string): number {
  return phases
    .filter(p => p.phase === targetPhase)
    .reduce((sum, p) => sum + p.durationMs, 0);
}

/**
 * Aggregate iteration metrics into run metrics
 */
export function aggregateRunMetrics(
  iterations: IterationMetrics[],
  run: Run
): RunMetrics {
  if (iterations.length === 0) {
    // No iterations - return empty metrics
    return createEmptyRunMetrics(run);
  }

  // Sort iterations by number
  const sortedIterations = [...iterations].sort((a, b) => a.iteration - b.iteration);

  // We know these exist because we checked iterations.length > 0 above
  const firstIteration = sortedIterations[0]!;
  const lastIteration = sortedIterations[sortedIterations.length - 1]!;

  // Count successful and failed iterations
  const successfulIterations = sortedIterations.filter(i => i.verificationPassed).length;
  const failedIterations = sortedIterations.filter(i => !i.verificationPassed).length;

  // Sum phase durations across all iterations
  const totalBuildDurationMs = sortedIterations.reduce(
    (sum, iter) => sum + sumPhaseDuration(iter.phases, Phase.BUILD),
    0
  );
  const totalSnapshotDurationMs = sortedIterations.reduce(
    (sum, iter) => sum + sumPhaseDuration(iter.phases, Phase.SNAPSHOT),
    0
  );
  const totalVerifyDurationMs = sortedIterations.reduce(
    (sum, iter) => sum + sumPhaseDuration(iter.phases, Phase.VERIFY),
    0
  );
  const totalFeedbackDurationMs = sortedIterations.reduce(
    (sum, iter) => sum + sumPhaseDuration(iter.phases, Phase.FEEDBACK),
    0
  );

  // Sum token usage (only from iterations that have it)
  const totalTokensInput = sortedIterations.reduce(
    (sum, iter) => sum + (iter.agentTokensInput ?? 0),
    0
  );
  const totalTokensOutput = sortedIterations.reduce(
    (sum, iter) => sum + (iter.agentTokensOutput ?? 0),
    0
  );

  // Sum code changes (cumulative)
  const totalFilesChanged = sortedIterations.reduce(
    (sum, iter) => sum + iter.filesChanged,
    0
  );
  const totalInsertions = sortedIterations.reduce(
    (sum, iter) => sum + iter.insertions,
    0
  );
  const totalDeletions = sortedIterations.reduce(
    (sum, iter) => sum + iter.deletions,
    0
  );

  // Calculate total duration
  const totalDurationMs = lastIteration.completedAt.getTime() - firstIteration.startedAt.getTime();

  return {
    runId: run.id,
    workOrderId: run.workOrderId,
    totalDurationMs,
    iterationCount: sortedIterations.length,
    successfulIterations,
    failedIterations,
    result: mapRunResult(run.result),
    totalBuildDurationMs,
    totalSnapshotDurationMs,
    totalVerifyDurationMs,
    totalFeedbackDurationMs,
    totalTokensInput,
    totalTokensOutput,
    totalFilesChanged,
    totalInsertions,
    totalDeletions,
    finalVerificationPassed: lastIteration.verificationPassed,
    finalVerificationLevels: lastIteration.verificationLevels,
    startedAt: firstIteration.startedAt,
    completedAt: lastIteration.completedAt,
    collectedAt: new Date(),
  };
}

/**
 * Create empty run metrics for runs with no iterations
 */
function createEmptyRunMetrics(run: Run): RunMetrics {
  const emptyLevels: LevelMetrics[] = [
    { level: 'L0', passed: false, durationMs: 0, checksRun: 0, checksPassed: 0 },
    { level: 'L1', passed: false, durationMs: 0, checksRun: 0, checksPassed: 0 },
    { level: 'L2', passed: false, durationMs: 0, checksRun: 0, checksPassed: 0 },
    { level: 'L3', passed: false, durationMs: 0, checksRun: 0, checksPassed: 0 },
  ];

  const now = new Date();

  return {
    runId: run.id,
    workOrderId: run.workOrderId,
    totalDurationMs: run.completedAt
      ? run.completedAt.getTime() - run.startedAt.getTime()
      : 0,
    iterationCount: 0,
    successfulIterations: 0,
    failedIterations: 0,
    result: mapRunResult(run.result),
    totalBuildDurationMs: 0,
    totalSnapshotDurationMs: 0,
    totalVerifyDurationMs: 0,
    totalFeedbackDurationMs: 0,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    totalFilesChanged: 0,
    totalInsertions: 0,
    totalDeletions: 0,
    finalVerificationPassed: false,
    finalVerificationLevels: emptyLevels,
    startedAt: run.startedAt,
    completedAt: run.completedAt ?? now,
    collectedAt: now,
  };
}

/**
 * Compute on-demand run metrics for in-progress runs
 * This doesn't require the run to be complete
 */
export function computeInProgressMetrics(
  iterations: IterationMetrics[],
  run: Run
): RunMetrics {
  // Same logic as aggregateRunMetrics but handles incomplete data
  const metrics = aggregateRunMetrics(iterations, run);

  // For in-progress runs, use current time for completed
  if (!run.completedAt) {
    const now = new Date();
    metrics.completedAt = now;
    metrics.totalDurationMs = now.getTime() - run.startedAt.getTime();
  }

  return metrics;
}
