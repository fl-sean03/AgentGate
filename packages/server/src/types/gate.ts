/**
 * Gate Types (v0.2.24)
 *
 * Gates are unified verification checkpoints. All verification mechanisms
 * (L0-L3 levels, CI checks, custom commands, human approvals) are implemented
 * as gates with a consistent interface.
 *
 * @module types/gate
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// GATE CHECK TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check that runs L0-L3 verification levels
 */
export interface VerificationLevelsCheck {
  type: 'verification-levels';
  /** Which verification levels to run */
  levels: Array<'L0' | 'L1' | 'L2' | 'L3'>;
  /** Timeout per level in milliseconds */
  timeout?: number;
}

/**
 * Check that polls GitHub Actions workflows
 */
export interface GitHubActionsCheck {
  type: 'github-actions';
  /** Specific workflows to check (empty = all) */
  workflows?: string[];
  /** Poll interval (e.g., "30s") */
  pollInterval?: string;
  /** Timeout for CI completion (e.g., "30m") */
  timeout?: string;
}

/**
 * Check that runs a custom shell command
 */
export interface CustomCommandCheck {
  type: 'custom';
  /** Shell command to execute */
  command: string;
  /** Expected exit code (default: 0) */
  expectedExit?: number;
  /** Timeout (e.g., "5m") */
  timeout?: string;
}

/**
 * Check that requires human approval
 */
export interface ApprovalCheck {
  type: 'approval';
  /** GitHub usernames who can approve */
  approvers: string[];
  /** Minimum number of approvals required */
  minApprovals?: number;
  /** Approval message template */
  message?: string;
}

/**
 * Check for similarity-based convergence
 */
export interface ConvergenceCheckType {
  type: 'convergence';
  /** Detection strategy */
  strategy: 'similarity' | 'fingerprint';
  /** Threshold for detection */
  threshold?: number;
}

/**
 * Union of all gate check types
 */
export type GateCheck =
  | VerificationLevelsCheck
  | GitHubActionsCheck
  | CustomCommandCheck
  | ApprovalCheck
  | ConvergenceCheckType;

/**
 * String literal type for gate check types
 */
export type GateCheckType =
  | 'verification-levels'
  | 'github-actions'
  | 'custom'
  | 'approval'
  | 'convergence';

// ═══════════════════════════════════════════════════════════════════════════
// GATE CHECK SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const verificationLevelsCheckSchema = z.object({
  type: z.literal('verification-levels'),
  levels: z.array(z.enum(['L0', 'L1', 'L2', 'L3'])).min(1),
  timeout: z.number().int().positive().optional(),
});

export const githubActionsCheckSchema = z.object({
  type: z.literal('github-actions'),
  workflows: z.array(z.string()).optional(),
  pollInterval: z.string().regex(/^\d+[smh]$/).optional(),
  timeout: z.string().regex(/^\d+[smh]$/).optional(),
});

export const customCommandCheckSchema = z.object({
  type: z.literal('custom'),
  command: z.string().min(1),
  expectedExit: z.number().int().min(0).max(255).optional(),
  timeout: z.string().regex(/^\d+[smh]$/).optional(),
});

export const approvalCheckSchema = z.object({
  type: z.literal('approval'),
  approvers: z.array(z.string()).min(1),
  minApprovals: z.number().int().min(1).optional(),
  message: z.string().optional(),
});

export const convergenceCheckSchema = z.object({
  type: z.literal('convergence'),
  strategy: z.enum(['similarity', 'fingerprint']),
  threshold: z.number().min(0).max(1).optional(),
});

export const gateCheckSchema = z.discriminatedUnion('type', [
  verificationLevelsCheckSchema,
  githubActionsCheckSchema,
  customCommandCheckSchema,
  approvalCheckSchema,
  convergenceCheckSchema,
]);

// ═══════════════════════════════════════════════════════════════════════════
// FAILURE POLICY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Backoff configuration for retries
 */
export interface BackoffConfig {
  /** Initial delay (e.g., "1s") */
  initial?: string;
  /** Maximum delay (e.g., "1m") */
  max?: string;
  /** Multiplier for exponential backoff */
  multiplier?: number;
}

/**
 * Feedback configuration
 */
export type FeedbackConfig =
  | 'auto'           // Use built-in feedback generator
  | 'manual'         // No automatic feedback
  | { generator: string };  // Custom generator

/**
 * Policy for handling gate failures
 */
export interface FailurePolicy {
  /** Action to take on failure */
  action: 'iterate' | 'stop' | 'escalate';
  /** Maximum retry attempts for this gate */
  maxAttempts?: number;
  /** How to generate feedback */
  feedback?: FeedbackConfig;
  /** Backoff configuration for retries */
  backoff?: BackoffConfig;
}

export const backoffConfigSchema = z.object({
  initial: z.string().regex(/^\d+[smh]$/).optional(),
  max: z.string().regex(/^\d+[smh]$/).optional(),
  multiplier: z.number().min(1).max(10).optional(),
});

export const feedbackConfigSchema = z.union([
  z.literal('auto'),
  z.literal('manual'),
  z.object({ generator: z.string() }),
]);

export const failurePolicySchema = z.object({
  action: z.enum(['iterate', 'stop', 'escalate']),
  maxAttempts: z.number().int().min(1).max(100).optional(),
  feedback: feedbackConfigSchema.optional(),
  backoff: backoffConfigSchema.optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// SUCCESS POLICY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Policy for handling gate success
 */
export interface SuccessPolicy {
  /** Action to take on success */
  action: 'continue' | 'skip-remaining';
}

export const successPolicySchema = z.object({
  action: z.enum(['continue', 'skip-remaining']),
});

// ═══════════════════════════════════════════════════════════════════════════
// GATE CONDITION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Condition for when to run a gate
 */
export interface GateCondition {
  /** When to run the gate */
  when?: 'always' | 'on-change' | 'manual';
  /** Condition expression to skip the gate */
  skipIf?: string;
}

export const gateConditionSchema = z.object({
  when: z.enum(['always', 'on-change', 'manual']).optional(),
  skipIf: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// GATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A Gate is a verification checkpoint in the convergence pipeline
 */
export interface Gate {
  /** Unique name within the TaskSpec */
  name: string;
  /** What to check */
  check: GateCheck;
  /** What to do on failure */
  onFailure: FailurePolicy;
  /** What to do on success (optional) */
  onSuccess?: SuccessPolicy;
  /** Condition for running the gate (optional) */
  condition?: GateCondition;
}

export const gateSchema = z.object({
  name: z.string().min(1).max(64),
  check: gateCheckSchema,
  onFailure: failurePolicySchema,
  onSuccess: successPolicySchema.optional(),
  condition: gateConditionSchema.optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// GATE FEEDBACK
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

/**
 * Feedback generated from a gate failure
 */
export interface GateFeedback {
  /** Summary of the failure */
  summary: string;
  /** List of individual failures */
  failures: FormattedFailure[];
  /** Suggested fixes */
  suggestions: string[];
  /** Formatted string ready for agent consumption */
  formatted: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE PIPELINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result from executing the gate pipeline
 */
export interface GatePipelineResult {
  /** Whether all gates passed */
  passed: boolean;
  /** Results from each gate */
  results: import('./convergence.js').GateResult[];
  /** Gate that caused pipeline to stop (if any) */
  stoppedAt?: string;
  /** Collected feedback from failed gates */
  feedback?: GateFeedback[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type guard for VerificationLevelsCheck
 */
export function isVerificationLevelsCheck(
  check: GateCheck
): check is VerificationLevelsCheck {
  return check.type === 'verification-levels';
}

/**
 * Type guard for GitHubActionsCheck
 */
export function isGitHubActionsCheck(
  check: GateCheck
): check is GitHubActionsCheck {
  return check.type === 'github-actions';
}

/**
 * Type guard for CustomCommandCheck
 */
export function isCustomCommandCheck(
  check: GateCheck
): check is CustomCommandCheck {
  return check.type === 'custom';
}

/**
 * Type guard for ApprovalCheck
 */
export function isApprovalCheck(check: GateCheck): check is ApprovalCheck {
  return check.type === 'approval';
}

/**
 * Type guard for ConvergenceCheckType
 */
export function isConvergenceCheck(
  check: GateCheck
): check is ConvergenceCheckType {
  return check.type === 'convergence';
}
