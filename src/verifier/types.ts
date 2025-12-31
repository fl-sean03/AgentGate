/**
 * Types specific to the verifier module.
 */

import type {
  VerificationLevel,
  GatePlan,
  LevelResult,
  CheckResult,
  CleanRoom,
} from '../types/index.js';

/**
 * Options for running verification.
 */
export interface VerifyOptions {
  /**
   * Path to the snapshot/checkout to verify.
   */
  snapshotPath: string;

  /**
   * The gate plan to verify against.
   */
  gatePlan: GatePlan;

  /**
   * Run in clean-room mode (isolated environment).
   */
  cleanRoom?: boolean;

  /**
   * Maximum total time for verification in milliseconds.
   */
  timeoutMs?: number;

  /**
   * Skip specific verification levels.
   */
  skip?: VerificationLevel[];

  /**
   * Enable verbose logging.
   */
  verbose?: boolean;
}

/**
 * Context passed between verification phases.
 */
export interface VerifyContext {
  /**
   * Path being verified.
   */
  workDir: string;

  /**
   * The gate plan being used.
   */
  gatePlan: GatePlan;

  /**
   * Clean-room environment if created.
   */
  cleanRoom: CleanRoom | null;

  /**
   * Start time of verification.
   */
  startTime: Date;

  /**
   * Running time limit.
   */
  timeoutMs: number;

  /**
   * Accumulated results.
   */
  results: {
    l0: LevelResult | null;
    l1: LevelResult | null;
    l2: LevelResult | null;
    l3: LevelResult | null;
  };

  /**
   * Accumulated diagnostics.
   */
  diagnostics: DiagnosticLocal[];
}

/**
 * Diagnostic message from verification (local version for building).
 * Will be converted to the full Diagnostic type in the final report.
 */
export interface DiagnosticLocal {
  level: VerificationLevel;
  type: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  details?: string;
}

// Re-export the canonical Diagnostic type
export type { Diagnostic } from '../types/index.js';

/**
 * Result of L0 contract verification.
 */
export interface ContractCheckResult {
  requiredFilesCheck: CheckResult;
  forbiddenPatternsCheck: CheckResult;
  schemaChecks: CheckResult[];
  namingChecks: CheckResult[];
}

/**
 * Result of a single command execution.
 */
export interface ExecutionResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}
