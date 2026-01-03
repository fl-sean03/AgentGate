/**
 * Gate Runner Types (v0.2.24)
 *
 * Defines interfaces for gate runners and results.
 *
 * @module gate/runner-types
 */

import type {
  GateCheck,
  GateCheckType,
  GateResult,
  GateFeedback,
  GateFailure,
  ResolvedTaskSpec,
} from '../types/index.js';
import type { Snapshot } from '../types/snapshot.js';

// ═══════════════════════════════════════════════════════════════════════════
// GATE CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Context passed to gate runners
 */
export interface GateContext {
  /** Resolved task specification */
  taskSpec: ResolvedTaskSpec;
  /** Work order ID */
  workOrderId: string;
  /** Run ID */
  runId: string;
  /** Current iteration number */
  iteration: number;
  /** Current snapshot */
  snapshot: Snapshot;
  /** Workspace path */
  workspacePath: string;
  /** Name of the current gate being checked */
  currentGate?: string;
  /** Previous gate results */
  previousResults?: GateResult[];
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result of gate configuration validation
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE RUNNER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Interface for gate runner implementations
 */
export interface GateRunner {
  /** Gate runner name */
  readonly name: string;

  /** Gate check type this runner handles */
  readonly type: GateCheckType;

  /**
   * Execute the gate check
   * @param context Gate context
   * @returns Gate result
   */
  run(context: GateContext): Promise<GateResult>;

  /**
   * Generate feedback for failures
   * @param result Gate result
   * @returns Formatted feedback
   */
  generateFeedback(result: GateResult): Promise<GateFeedback>;

  /**
   * Validate gate configuration
   * @param config Gate check configuration
   * @returns Validation result
   */
  validate(config: GateCheck): ValidationResult;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE-SPECIFIC DETAILS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Details for verification levels gate
 */
export interface VerificationDetails {
  type: 'verification-levels';
  levels: Array<{
    level: 'L0' | 'L1' | 'L2' | 'L3';
    passed: boolean;
    checks: Array<{
      name: string;
      passed: boolean;
      message?: string;
    }>;
    duration: number;
  }>;
}

/**
 * Details for GitHub Actions gate
 */
export interface GitHubActionsDetails {
  type: 'github-actions';
  workflows: Array<{
    name: string;
    status: 'success' | 'failure' | 'pending' | 'skipped';
    url?: string;
  }>;
  pollDuration: number;
}

/**
 * Details for custom command gate
 */
export interface CustomCommandDetails {
  type: 'custom';
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Details for approval gate
 */
export interface ApprovalDetails {
  type: 'approval';
  approvers: string[];
  approvals: Array<{
    user: string;
    approved: boolean;
    timestamp: Date;
  }>;
}

/**
 * Details for convergence gate
 */
export interface ConvergenceDetails {
  type: 'convergence';
  strategy: 'similarity' | 'fingerprint';
  similarity: number;
  threshold: number;
}

/**
 * Union of all detail types
 */
export type GateDetails =
  | VerificationDetails
  | GitHubActionsDetails
  | CustomCommandDetails
  | ApprovalDetails
  | ConvergenceDetails;

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTED FAILURE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Formatted failure for display
 */
export interface FormattedFailure {
  type: string;
  message: string;
  file?: string;
  line?: number;
  command?: string;
  url?: string;
  details?: string;
}
