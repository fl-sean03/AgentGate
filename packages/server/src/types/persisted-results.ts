/**
 * Types for persisted agent results.
 * Enables post-mortem debugging of failed runs by storing complete AgentResult to disk.
 * (v0.2.19 - Thrust 1)
 */

import type { AgentStructuredOutput, TokenUsage } from './agent.js';
import type { ToolCallRecord } from './sdk.js';

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
