/**
 * Convergence Types (v0.2.24)
 *
 * Defines convergence policies that replace "loop strategies".
 * Convergence determines when the agent has reached the desired state.
 *
 * @module types/convergence
 */

import { z } from 'zod';
import type { Gate } from './gate.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONVERGENCE STRATEGY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Available convergence strategy types
 */
export type ConvergenceStrategyType =
  | 'fixed'    // Run exactly N iterations
  | 'hybrid'   // Base + bonus iterations if progress detected
  | 'ralph'    // Continue until agent signals done or loop detected
  | 'adaptive' // ML-based (future)
  | 'manual';  // Human decides each iteration

/**
 * Zod schema for convergence strategy type
 */
export const convergenceStrategyTypeSchema = z.enum([
  'fixed',
  'hybrid',
  'ralph',
  'adaptive',
  'manual',
]);

// ═══════════════════════════════════════════════════════════════════════════
// CONVERGENCE CONFIG
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Strategy-specific configuration options
 */
export interface ConvergenceConfig {
  // Fixed strategy options
  /** Number of iterations for fixed strategy */
  iterations?: number;

  // Hybrid strategy options
  /** Base number of iterations before checking progress */
  baseIterations?: number;
  /** Maximum bonus iterations if progress is detected */
  bonusIterations?: number;
  /** Progress threshold (0-1) to earn bonus iterations */
  progressThreshold?: number;

  // Ralph strategy options
  /** Similarity threshold (0-1) for loop detection (lower = more sensitive) */
  convergenceThreshold?: number;
  /** Number of recent outputs to compare for similarity */
  windowSize?: number;
  /** Minimum iterations before allowing termination */
  minIterations?: number;
  /** Enable hot reloading of prompts */
  promptHotReload?: boolean;
  /** Path to tuning signs for Ralph */
  tuningSignsPath?: string;
}

/**
 * Zod schema for convergence config
 */
export const convergenceConfigSchema = z.object({
  iterations: z.number().int().min(1).max(1000).optional(),
  baseIterations: z.number().int().min(1).max(100).optional(),
  bonusIterations: z.number().int().min(0).max(100).optional(),
  progressThreshold: z.number().min(0).max(1).optional(),
  convergenceThreshold: z.number().min(0).max(1).optional(),
  windowSize: z.number().int().min(2).max(20).optional(),
  minIterations: z.number().int().min(1).max(100).optional(),
  promptHotReload: z.boolean().optional(),
  tuningSignsPath: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// CONVERGENCE LIMITS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resource limits for convergence
 */
export interface ConvergenceLimits {
  /** Hard cap on iterations */
  maxIterations?: number;
  /** Maximum wall clock time (e.g., "2h", "30m", "1d") */
  maxWallClock?: string;
  /** Maximum cost budget (e.g., "$50", "$100") */
  maxCost?: string;
  /** Total token budget */
  maxTokens?: number;
}

/**
 * Zod schema for convergence limits
 */
export const convergenceLimitsSchema = z.object({
  maxIterations: z.number().int().min(1).max(10000).optional(),
  maxWallClock: z.string().regex(/^\d+[smhd]$/).optional(),
  maxCost: z.string().regex(/^\$\d+(\.\d{2})?$/).optional(),
  maxTokens: z.number().int().min(1).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// CONVERGENCE SPEC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Complete convergence specification
 */
export interface ConvergenceSpec {
  /** Convergence strategy type */
  strategy: ConvergenceStrategyType;
  /** Strategy-specific configuration */
  config?: ConvergenceConfig;
  /** Gates that must pass for convergence */
  gates: Gate[];
  /** Resource limits */
  limits: ConvergenceLimits;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERGENCE STATE (Runtime)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Runtime state passed to convergence strategies
 */
export interface ConvergenceState {
  /** Current iteration number (1-based) */
  iteration: number;
  /** Elapsed time in milliseconds */
  elapsed: number;
  /** Gate results from current iteration */
  gateResults: GateResult[];
  /** History of previous iterations */
  history: ConvergenceIterationHistory[];
  /** Current snapshot (if available) */
  snapshot?: unknown;
  /** Latest agent output (for similarity detection) */
  agentOutput?: string;
}

/**
 * Result from a gate check
 */
export interface GateResult {
  /** Gate name */
  gate: string;
  /** Gate check type */
  type: string;
  /** Whether the gate passed */
  passed: boolean;
  /** Timestamp of the check */
  timestamp: Date;
  /** Duration in milliseconds */
  duration: number;
  /** Type-specific details */
  details?: Record<string, unknown>;
  /** Failures (if any) */
  failures?: GateFailure[];
  /** Level results for verification gates */
  levelResults?: Array<{ level: string; passed: boolean }>;
}

/**
 * Failure information from a gate
 */
export interface GateFailure {
  /** Verification level (if applicable) */
  level?: string;
  /** Workflow name (for CI) */
  workflow?: string;
  /** Command (for custom gates) */
  command?: string;
  /** Human-readable message */
  message: string;
  /** File path (if applicable) */
  file?: string;
  /** Line number (if applicable) */
  line?: number;
  /** Additional details */
  details?: string;
}

/**
 * History entry for a convergence iteration
 */
export interface ConvergenceIterationHistory {
  /** Iteration number */
  iteration: number;
  /** Timestamp */
  timestamp: Date;
  /** Gate results for this iteration */
  gateResults: GateResult[];
  /** Decision made for this iteration */
  decision: ConvergenceDecision;
  /** Snapshot hash (for loop detection) */
  snapshotHash?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERGENCE DECISION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Decision returned by convergence strategy
 */
export interface ConvergenceDecision {
  /** Whether to continue iterating */
  continue: boolean;
  /** Human-readable reason for the decision */
  reason: string;
  /** Confidence in the decision (0-1) */
  confidence?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESS METRICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Progress metrics for convergence monitoring
 */
export interface ConvergenceProgressMetrics {
  /** Overall progress score (0-1) */
  overall: number;
  /** Progress by gate */
  byGate: Record<string, GateProgress>;
  /** Trend direction */
  trend: 'improving' | 'stagnant' | 'regressing';
  /** Progress velocity (per iteration) */
  velocity: number;
}

/**
 * Progress for a single gate
 */
export interface GateProgress {
  /** Current progress level (0-1) */
  currentLevel: number;
  /** Previous iteration level */
  previousLevel: number;
  /** Trend for this gate */
  trend: 'improving' | 'stagnant' | 'regressing';
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERGENCE RESULT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Final result of convergence
 */
export interface ConvergenceResult {
  /** Final status */
  status: 'converged' | 'diverged' | 'stopped' | 'error';
  /** Total iterations executed */
  iterations: number;
  /** Final convergence state */
  finalState: ConvergenceState;
  /** Final gate results */
  gateResults: Record<string, GateResult>;
  /** Reason for termination */
  reason: string;
  /** Total duration in milliseconds */
  duration: number;
}

/**
 * Progress for monitoring active convergence
 */
export interface ConvergenceProgress {
  /** Current iteration */
  iteration: number;
  /** Maximum iterations configured */
  maxIterations: number;
  /** Elapsed time in milliseconds */
  elapsed: number;
  /** Maximum wall clock time in milliseconds */
  maxWallClock: number;
  /** Number of gates that have passed */
  gatesPassed: number;
  /** Total number of gates */
  gatesTotal: number;
  /** Current trend */
  trend: 'improving' | 'stagnant' | 'regressing';
  /** Estimated remaining iterations */
  estimatedRemaining?: number;
}
