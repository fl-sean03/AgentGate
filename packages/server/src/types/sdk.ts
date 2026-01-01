/**
 * SDK Types for Claude Agent SDK Integration
 *
 * This module provides type definitions for integrating with the Claude Agent SDK.
 * It re-exports SDK types and defines AgentGate-specific wrappers.
 */

// Re-export SDK types from @anthropic-ai/claude-agent-sdk
export type {
  // Core message types
  SDKMessage,
  SDKSystemMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKPartialAssistantMessage,
  SDKToolProgressMessage,

  // Query and options
  Query,
  Options as SDKOptions,

  // Hook types
  HookEvent,
  HookCallback,
  HookCallbackMatcher,
  HookInput,
  HookJSONOutput,
  PreToolUseHookInput,
  PostToolUseHookInput,
  PostToolUseFailureHookInput,

  // Permission types
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  CanUseTool,

  // Usage and cost tracking
  ModelUsage,
  NonNullableUsage,

  // MCP types
  McpServerConfig,
  McpServerStatus,

  // Agent definition
  AgentDefinition,

  // Sandbox types
  SandboxSettings,
  SandboxNetworkConfig,
  SandboxIgnoreViolations,

  // Transport types
  SpawnOptions,
  SpawnedProcess,
  Transport,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * SDK driver configuration for AgentGate
 */
export interface ClaudeAgentSDKDriverConfig {
  /** Timeout for queries in ms (default: 300000) */
  timeoutMs?: number;
  /** Enable SDK sandboxing (default: true) */
  enableSandbox?: boolean;
  /** Custom hooks configuration */
  hooks?: SDKHooksConfig;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Permission mode for the session */
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';
  /** Model to use for queries */
  model?: string;
  /** Maximum number of turns */
  maxTurns?: number;
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
  /** Additional directories Claude can access */
  additionalDirectories?: string[];
  /** Allowed tools (auto-approved without prompting) */
  allowedTools?: string[];
  /** Disallowed tools (removed from model's context) */
  disallowedTools?: string[];
}

/**
 * Hooks configuration for SDK driver
 */
export interface SDKHooksConfig {
  /** Enable tool logging hook */
  logToolUse?: boolean;
  /** Enable file change tracking hook */
  trackFileChanges?: boolean;
  /** Custom PreToolUse validators */
  preToolValidators?: PreToolValidator[];
  /** Custom PostToolUse handlers */
  postToolHandlers?: PostToolHandler[];
}

/**
 * PreToolUse validator function
 */
export type PreToolValidator = (
  tool: string,
  input: unknown,
) => Promise<{ allow: boolean; reason?: string }>;

/**
 * PostToolUse handler function
 */
export type PostToolHandler = (
  tool: string,
  input: unknown,
  output: unknown,
  durationMs: number,
) => Promise<void>;

/**
 * Tool call record from SDK execution
 */
export interface ToolCallRecord {
  /** Tool name */
  tool: string;
  /** Tool input parameters */
  input: unknown;
  /** Tool output/result */
  output: unknown;
  /** Duration of tool execution in milliseconds */
  durationMs: number;
  /** Timestamp when the tool was called */
  timestamp: Date;
  /** Tool use ID from SDK */
  toolUseId?: string;
}

/**
 * SDK-specific execution result
 */
export interface SDKExecutionResult {
  /** Session ID for this execution */
  sessionId: string;
  /** Model used for execution */
  model: string;
  /** Number of conversation turns */
  turns: number;
  /** Total cost in USD */
  totalCostUsd: number;
  /** Token usage statistics */
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
  /** Record of all tool calls made */
  toolCalls: ToolCallRecord[];
  /** Duration of execution in milliseconds */
  durationMs: number;
  /** Duration of API calls in milliseconds */
  durationApiMs: number;
  /** Whether the execution completed successfully */
  isSuccess: boolean;
  /** Final result text (if successful) */
  result?: string;
  /** Structured output (if configured) */
  structuredOutput?: unknown;
  /** Errors encountered during execution */
  errors?: string[];
}

/**
 * SDK query parameters for starting a new query
 */
export interface SDKQueryParams {
  /** The prompt to send to the agent */
  prompt: string;
  /** Query options */
  options?: ClaudeAgentSDKDriverConfig;
  /** Current working directory */
  cwd?: string;
  /** Session ID to resume */
  resumeSessionId?: string;
  /** System prompt override */
  systemPrompt?: string;
}

/**
 * SDK session state for tracking active sessions
 */
export interface SDKSessionState {
  /** Session ID */
  sessionId: string;
  /** Whether the session is active */
  isActive: boolean;
  /** Session start time */
  startedAt: Date;
  /** Last activity time */
  lastActivityAt: Date;
  /** Total tokens used in this session */
  totalTokens: {
    input: number;
    output: number;
  };
  /** Total cost in USD for this session */
  totalCostUsd: number;
  /** Number of turns completed */
  turnsCompleted: number;
}

/**
 * SDK streaming event types for real-time updates
 */
export type SDKStreamEvent =
  | { type: 'message_start'; sessionId: string }
  | { type: 'content_delta'; content: string }
  | { type: 'tool_use_start'; toolName: string; toolUseId: string }
  | { type: 'tool_use_end'; toolName: string; toolUseId: string; success: boolean }
  | { type: 'message_end'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'result'; result: SDKExecutionResult }
  | { type: 'error'; error: string };
