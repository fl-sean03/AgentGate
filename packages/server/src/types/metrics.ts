import { z } from 'zod';

// ============================================================================
// Phase Type
// ============================================================================

/**
 * Execution phases during a run iteration
 */
export const Phase = {
  BUILD: 'build',
  SNAPSHOT: 'snapshot',
  VERIFY: 'verify',
  FEEDBACK: 'feedback',
} as const;

export type Phase = (typeof Phase)[keyof typeof Phase];

export const phaseSchema = z.enum(['build', 'snapshot', 'verify', 'feedback']);

// ============================================================================
// Phase Metrics
// ============================================================================

/**
 * Timing metrics for a single execution phase
 */
export const phaseMetricsSchema = z.object({
  /** The phase that was measured */
  phase: phaseSchema,
  /** When the phase started */
  startedAt: z.coerce.date(),
  /** When the phase completed */
  completedAt: z.coerce.date(),
  /** Duration in milliseconds */
  durationMs: z.number().nonnegative(),
});

export type PhaseMetrics = z.infer<typeof phaseMetricsSchema>;

// ============================================================================
// Level Metrics
// ============================================================================

/**
 * Metrics for a verification level
 */
export const levelMetricsSchema = z.object({
  /** Verification level (L0-L3) */
  level: z.enum(['L0', 'L1', 'L2', 'L3']),
  /** Whether the level passed */
  passed: z.boolean(),
  /** Duration in milliseconds */
  durationMs: z.number().nonnegative(),
  /** Number of checks that ran */
  checksRun: z.number().nonnegative(),
  /** Number of checks that passed */
  checksPassed: z.number().nonnegative(),
});

export type LevelMetrics = z.infer<typeof levelMetricsSchema>;

// ============================================================================
// Iteration Metrics
// ============================================================================

/**
 * Comprehensive metrics for a single iteration
 */
export const iterationMetricsSchema = z.object({
  /** Iteration number (1-based) */
  iteration: z.number().positive(),
  /** Run ID this iteration belongs to */
  runId: z.string(),

  // Phase timings
  /** Metrics for each phase in this iteration */
  phases: z.array(phaseMetricsSchema),
  /** Total iteration duration in milliseconds */
  totalDurationMs: z.number().nonnegative(),

  // Agent execution
  /** Input tokens used by agent (null if not available) */
  agentTokensInput: z.number().nonnegative().nullable(),
  /** Output tokens used by agent (null if not available) */
  agentTokensOutput: z.number().nonnegative().nullable(),
  /** Agent process exit code (null if not available) */
  agentExitCode: z.number().nullable(),
  /** Agent execution duration in milliseconds */
  agentDurationMs: z.number().nonnegative().nullable(),

  // Code changes
  /** Number of files changed */
  filesChanged: z.number().nonnegative(),
  /** Lines inserted */
  insertions: z.number().nonnegative(),
  /** Lines deleted */
  deletions: z.number().nonnegative(),

  // Verification
  /** Whether verification passed */
  verificationPassed: z.boolean(),
  /** Verification duration in milliseconds */
  verificationDurationMs: z.number().nonnegative(),
  /** Per-level verification metrics */
  verificationLevels: z.array(levelMetricsSchema),

  // Timestamps
  /** When the iteration started */
  startedAt: z.coerce.date(),
  /** When the iteration completed */
  completedAt: z.coerce.date(),
});

export type IterationMetrics = z.infer<typeof iterationMetricsSchema>;

// ============================================================================
// Run Metrics Result Type
// ============================================================================

/**
 * Possible run results for metrics
 */
export const MetricsResult = {
  PASSED: 'passed',
  FAILED: 'failed',
  CANCELED: 'canceled',
  ERROR: 'error',
} as const;

export type MetricsResult = (typeof MetricsResult)[keyof typeof MetricsResult];

export const metricsResultSchema = z.enum(['passed', 'failed', 'canceled', 'error']);

// ============================================================================
// Run Metrics
// ============================================================================

/**
 * Aggregated metrics for an entire run
 */
export const runMetricsSchema = z.object({
  /** Run ID */
  runId: z.string(),
  /** Work order ID */
  workOrderId: z.string(),

  // Summary
  /** Total run duration in milliseconds */
  totalDurationMs: z.number().nonnegative(),
  /** Number of iterations executed */
  iterationCount: z.number().nonnegative(),
  /** Number of iterations that passed verification */
  successfulIterations: z.number().nonnegative(),
  /** Number of iterations that failed verification */
  failedIterations: z.number().nonnegative(),
  /** Final run result */
  result: metricsResultSchema,

  // Phase totals (sum across all iterations)
  /** Total build phase duration across all iterations */
  totalBuildDurationMs: z.number().nonnegative(),
  /** Total snapshot phase duration across all iterations */
  totalSnapshotDurationMs: z.number().nonnegative(),
  /** Total verify phase duration across all iterations */
  totalVerifyDurationMs: z.number().nonnegative(),
  /** Total feedback phase duration across all iterations */
  totalFeedbackDurationMs: z.number().nonnegative(),

  // Token usage
  /** Total input tokens across all iterations */
  totalTokensInput: z.number().nonnegative(),
  /** Total output tokens across all iterations */
  totalTokensOutput: z.number().nonnegative(),

  // Code changes (cumulative)
  /** Total files changed (sum across iterations) */
  totalFilesChanged: z.number().nonnegative(),
  /** Total lines inserted */
  totalInsertions: z.number().nonnegative(),
  /** Total lines deleted */
  totalDeletions: z.number().nonnegative(),

  // Final verification state
  /** Whether the final iteration passed verification */
  finalVerificationPassed: z.boolean(),
  /** Per-level metrics from the final iteration */
  finalVerificationLevels: z.array(levelMetricsSchema),

  // Timestamps
  /** When the run started */
  startedAt: z.coerce.date(),
  /** When the run completed */
  completedAt: z.coerce.date(),
  /** When metrics were collected/computed */
  collectedAt: z.coerce.date(),
});

export type RunMetrics = z.infer<typeof runMetricsSchema>;

// ============================================================================
// Metrics Display Options
// ============================================================================

/**
 * Options for displaying metrics
 */
export interface MetricsDisplayOptions {
  /** Show per-iteration breakdown */
  detailed?: boolean;
  /** Output as JSON */
  json?: boolean;
  /** Show only specific iteration */
  iteration?: number;
}
