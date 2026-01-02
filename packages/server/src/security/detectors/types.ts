/**
 * Security Detector Types
 *
 * Core interfaces for security detectors including Finding, DetectorContext,
 * Detector interface, and validation types.
 */

import type { ResolvedSecurityPolicy, SensitivityLevel } from '../types.js';

// ============================================================================
// Detector Context
// ============================================================================

/**
 * Context passed to detectors during scanning.
 */
export interface DetectorContext {
  /** Workspace directory being scanned */
  workspaceDir: string;
  /** Files to scan (pre-filtered by excludes) */
  files: string[];
  /** Security policy in effect */
  policy: ResolvedSecurityPolicy;
  /** Allowlisted patterns for quick lookup */
  allowlist: Set<string>;
  /** Optional signal for cancellation */
  signal?: AbortSignal;
}

// ============================================================================
// Validation Result
// ============================================================================

/**
 * Result of validating detector options.
 */
export interface ValidationResult {
  /** Whether the options are valid */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
}

// ============================================================================
// Detector Interface
// ============================================================================

/**
 * Interface that all security detectors must implement.
 */
export interface Detector {
  /** Unique identifier for this detector type */
  readonly type: string;
  /** Human-readable name */
  readonly name: string;
  /** Description of what this detector finds */
  readonly description: string;

  /**
   * Scan files for security issues.
   * @param ctx - Detection context with files and policy
   * @param options - Detector-specific options
   * @returns Array of findings
   */
  detect(
    ctx: DetectorContext,
    options: Record<string, unknown>
  ): Promise<DetectorFinding[]>;

  /**
   * Validate detector options before scanning.
   * @param options - Options to validate
   * @returns Validation result
   */
  validateOptions(options: Record<string, unknown>): ValidationResult;
}

// ============================================================================
// Detector Finding
// ============================================================================

/**
 * A security finding from a detector.
 * Extends the base Finding type with required detector field.
 */
export interface DetectorFinding {
  /** Rule ID (e.g., "aws-access-key") */
  ruleId: string;
  /** Human-readable description */
  message: string;
  /** Relative file path */
  file: string;
  /** Line number (1-indexed) */
  line?: number;
  /** Column number (1-indexed) */
  column?: number;
  /** Masked match value */
  match?: string;
  /** Sensitivity level of this finding */
  sensitivity: SensitivityLevel;
  /** Detector type that produced this finding */
  detector: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}
