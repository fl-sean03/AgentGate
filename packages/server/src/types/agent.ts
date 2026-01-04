// Import SDK types for AgentResult
import type { ToolCallRecord } from './sdk.js';

// Agent Request
export interface AgentRequest {
  workspacePath: string;
  taskPrompt: string;
  gatePlanSummary: string;
  constraints: AgentConstraints;
  priorFeedback: string | null;
  contextPointers: ContextPointers;
  timeoutMs: number;
  sessionId: string | null;
  // Optional spawn configuration for recursive agent spawning
  spawnLimits?: {
    maxDepth: number;
    maxChildren: number;
    maxTotalDescendants: number;
  } | null;
  workOrderId?: string | null;
  /** Run ID for process tracking (used by AgentProcessManager) */
  runId?: string | null;
}

/**
 * Sandbox execution information
 */
export interface SandboxInfo {
  /** Provider used (docker, subprocess) */
  provider: string;
  /** Container ID (if using Docker) */
  containerId?: string;
  /** Resource usage during execution */
  resourceUsage?: {
    cpuPercent: number;
    memoryMB: number;
  };
  /** Sandbox execution duration in ms */
  durationMs: number;
}

// Agent Result
export interface AgentResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  structuredOutput: AgentStructuredOutput | null;
  sessionId: string | null;
  tokensUsed: TokenUsage | null;
  durationMs: number;
  /** Total cost in USD (SDK-specific) */
  totalCostUsd?: number;
  /** Record of all tool calls made (SDK-specific) */
  toolCalls?: ToolCallRecord[];
  /** Model used for execution (SDK-specific) */
  model?: string;
  /** Number of conversation turns (SDK-specific) */
  turns?: number;
  /** Sandbox execution info (if sandbox was used) */
  sandboxInfo?: SandboxInfo;
}

/**
 * Per-model usage breakdown from Claude Code
 */
export interface ModelUsageBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
  contextWindow: number;
}

/**
 * Full usage data from Claude Code JSON output
 */
export interface ClaudeCodeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  server_tool_use?: {
    web_search_requests: number;
    web_fetch_requests: number;
  };
  service_tier?: string;
  cache_creation?: {
    ephemeral_1h_input_tokens?: number;
    ephemeral_5m_input_tokens?: number;
  };
}

// Agent Structured Output (matches Claude Code --output-format json)
export interface AgentStructuredOutput {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  result: string;
  session_id?: string;
  total_cost_usd?: number;
  usage?: ClaudeCodeUsage;
  /** Per-model usage breakdown */
  modelUsage?: Record<string, ModelUsageBreakdown>;
  permission_denials?: string[];
  uuid?: string;
}

// Token Usage (extended with cache support)
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheCreation?: number;
}

// Agent Constraints
export interface AgentConstraints {
  allowedTools: string[];
  disallowedTools: string[];
  maxTurns: number;
  permissionMode: 'plan' | 'acceptEdits' | 'bypassPermissions';
  additionalSystemPrompt: string | null;
}

// Context Pointers
export interface ContextPointers {
  manifestPath: string | null;
  testsPath: string | null;
  docsPath: string | null;
  gatePlanPath: string | null;
  srcPath: string | null;
}

// Driver Capabilities
export interface DriverCapabilities {
  supportsSessionResume: boolean;
  supportsStructuredOutput: boolean;
  supportsToolRestriction: boolean;
  supportsTimeout: boolean;
  supportsHooks?: boolean;
  /** Whether the driver supports sandbox execution */
  supportsSandbox?: boolean;
  /** Whether the driver supports real-time streaming */
  supportsStreaming?: boolean;
  /** Whether the driver supports cost tracking */
  supportsCostTracking?: boolean;
  /** Billing method used by this driver */
  billingMethod?: 'api-key' | 'subscription';
  maxTurns: number;
}

// Driver Interface
export interface AgentDriver {
  readonly name: string;
  readonly version: string;
  execute(request: AgentRequest): Promise<AgentResult>;
  isAvailable(): Promise<boolean>;
  getCapabilities(): DriverCapabilities;
}
