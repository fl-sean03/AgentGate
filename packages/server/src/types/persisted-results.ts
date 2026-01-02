/**
 * Types for persisted run results (v0.2.19 - Observability & Reliability).
 * Enables post-mortem debugging of failed runs by storing complete results to disk.
 * - Thrust 1: PersistedAgentResult
 * - Thrust 2: PersistedVerificationReport
 */

import type { AgentStructuredOutput, TokenUsage } from './agent.js';
import type { ToolCallRecord } from './sdk.js';
import type { VerificationReport } from './verification.js';

/**
 * Full agent result persisted to disk for debugging.
 */
export interface PersistedAgentResult {
  // Metadata
  runId: string;
  iteration: number;
  capturedAt: string;

  // Agent identification
  sessionId: string;
  model: string | null;

  // Execution result
  success: boolean;
  exitCode: number;

  // Full output
  stdout: string;
  stderr: string;

  // Structured data
  structuredOutput: AgentStructuredOutput | null;
  toolCalls: ToolCallRecord[];

  // Metrics
  durationMs: number;
  tokensUsed: TokenUsage | null;
  totalCostUsd: number | null;
}

/**
 * Options for saving agent results.
 */
export interface SaveAgentResultOptions {
  /** Maximum stdout size in bytes (default: 1MB) */
  maxStdoutBytes?: number;
  /** Maximum stderr size in bytes (default: 1MB) */
  maxStderrBytes?: number;
  /** Whether to include tool calls (default: true) */
  includeToolCalls?: boolean;
}

export const DEFAULT_SAVE_OPTIONS: SaveAgentResultOptions = {
  maxStdoutBytes: 1024 * 1024, // 1MB
  maxStderrBytes: 1024 * 1024, // 1MB
  includeToolCalls: true,
};

/**
 * Full verification report persisted to disk.
 * Extends the in-memory VerificationReport with metadata for persistence.
 * (v0.2.19 - Thrust 2)
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
