/**
 * Types for persisted run results (v0.2.19 - Observability & Reliability).
 * Defines interfaces for structured storage of verification reports and other results.
 */

import type { VerificationReport, LevelResult } from './verification.js';

/**
 * Full verification report persisted to disk.
 * Extends the in-memory VerificationReport with metadata for persistence.
 */
export interface PersistedVerificationReport extends VerificationReport {
  /** When this report was captured */
  capturedAt: string;
  /** Levels that were skipped (not just not-run) */
  skippedLevels: string[];
  /** Harness config that affected verification */
  harnessConfig: {
    waitForCI: boolean;
    skipLevels: string[];
  };
}

/**
 * Harness config options relevant to verification persistence.
 */
export interface VerificationHarnessConfig {
  waitForCI?: boolean | undefined;
  skipLevels?: string[] | undefined;
}
