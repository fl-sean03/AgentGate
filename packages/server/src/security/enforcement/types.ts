/**
 * Security Enforcement Engine - Types
 *
 * Type definitions for enforcement results, summaries, and categorization.
 */

import type { Finding, ResolvedSecurityPolicy, SensitivityLevel } from '../types.js';

// ============================================================================
// Enforcement Summary
// ============================================================================

/**
 * Aggregate statistics from a security scan.
 */
export interface EnforcementSummary {
  /** Total number of findings */
  total: number;
  /** Count of findings by sensitivity level */
  byLevel: Record<SensitivityLevel, number>;
  /** Count of findings by detector type */
  byDetector: Record<string, number>;
  /** Time taken for scan in milliseconds */
  scanDuration: number;
  /** Number of files scanned */
  filesScanned: number;
}

// ============================================================================
// Enforcement Result
// ============================================================================

/**
 * Complete result from security enforcement.
 */
export interface EnforcementResult {
  /** Whether execution should proceed (no blocking findings) */
  allowed: boolean;
  /** All findings from detection */
  findings: Finding[];
  /** Findings that caused blocking (BLOCK/DENY actions) */
  blockedFindings: Finding[];
  /** Findings that were warnings (WARN action) */
  warnedFindings: Finding[];
  /** Aggregate statistics */
  summary: EnforcementSummary;
  /** The resolved policy that was applied */
  policy: ResolvedSecurityPolicy;
}

// ============================================================================
// Categorized Findings
// ============================================================================

/**
 * Findings categorized by enforcement action.
 */
export interface CategorizedFindings {
  /** Findings to block execution */
  blocked: Finding[];
  /** Findings to warn about */
  warned: Finding[];
  /** Findings to log only */
  logged: Finding[];
}
