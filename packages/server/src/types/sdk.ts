/**
 * Claude Agent SDK Types
 *
 * These types define the interface for the Claude Agent SDK integration.
 * They bridge SDK types to AgentGate types and provide type safety for
 * SDK-based agent execution.
 *
 * Note: Once @anthropic-ai/claude-agent-sdk is published, these types
 * should be updated to re-export from the SDK package directly.
 */

// ============================================================================
// SDK Message Types
// ============================================================================

/**
 * Base message interface with common fields
 */
interface SDKMessageBase {
  timestamp?: string;
}

/**
 * System message - contains session info and configuration
 */
export interface SDKSystemMessage extends SDKMessageBase {
  type: 'system';
  session_id: string;
  tools: string[];
  model: string;
}

/**
 * Assistant message - Claude's response
 */
export interface SDKAssistantMessage extends SDKMessageBase {
  type: 'assistant';
  content: string;
  tool_use?: SDKToolCall[];
}

/**
 * User message - user prompt
 */
export interface SDKUserMessage extends SDKMessageBase {
  type: 'user';
  content: string;
}

/**
 * Tool use message - tool invocation
 */
export interface SDKToolUseMessage extends SDKMessageBase {
  type: 'tool_use';
  tool: string;
  input: unknown;
  id: string;
}

/**
 * Tool result message - tool execution result
 */
export interface SDKToolResultMessage extends SDKMessageBase {
  type: 'tool_result';
  tool: string;
  output: unknown;
  id: string;
  is_error?: boolean;
}

/**
 * Result message - final execution result
 */
export interface SDKResultMessage extends SDKMessageBase {
  type: 'result';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  cost: number;
  result: 'success' | 'error' | 'interrupted';
  session_id: string;
}

/**
 * Union of all SDK message types
 */
export type SDKMessage =
  | SDKSystemMessage
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKToolUseMessage
  | SDKToolResultMessage
  | SDKResultMessage;

/**
 * Tool call within an assistant message
 */
export interface SDKToolCall {
  id: string;
  tool: string;
  input: unknown;
}

// ============================================================================
// SDK Options & Configuration
// ============================================================================

/**
 * Hook matcher for PreToolUse/PostToolUse hooks
 */
export interface SDKHookMatcher {
  tool?: string;
  tools?: string[];
  pattern?: string;
}

/**
 * SDK query options
 */
export interface SDKQueryOptions {
  /** Tools to allow (whitelist) */
  allowedTools?: string[];
  /** Tools to disallow (blacklist) */
  disallowedTools?: string[];
  /** Maximum conversation turns */
  maxTurns?: number;
  /** Model to use */
  model?: string;
  /** Custom system prompt */
  systemPrompt?: string;
  /** Session ID to resume */
  resume?: string;
  /** Working directory */
  cwd?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Hook configuration */
  hooks?: {
    PreToolUse?: SDKHookMatcher[];
    PostToolUse?: SDKHookMatcher[];
  };
}

/**
 * SDK query result
 */
export interface SDKQueryResult {
  /** All messages from the session */
  messages: SDKMessage[];
  /** Session ID for resume */
  sessionId: string;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Total cost in USD */
  costUsd: number;
  /** Result status */
  result: 'success' | 'error' | 'interrupted';
}

// ============================================================================
// AgentGate SDK Driver Types
// ============================================================================

/**
 * PreToolUse validator function
 */
export type PreToolValidator = (
  tool: string,
  input: unknown
) => Promise<{ allow: boolean; reason?: string }>;

/**
 * PostToolUse handler function
 */
export type PostToolHandler = (
  tool: string,
  input: unknown,
  output: unknown,
  durationMs: number
) => Promise<void>;

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
 * SDK driver configuration
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
}

/**
 * Tool call record from SDK execution
 */
export interface ToolCallRecord {
  tool: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  timestamp: Date;
}

/**
 * SDK-specific execution result
 */
export interface SDKExecutionResult {
  sessionId: string;
  model: string;
  turns: number;
  totalCostUsd: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  toolCalls: ToolCallRecord[];
  messages: SDKMessage[];
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for SDKSystemMessage
 */
export function isSDKSystemMessage(msg: SDKMessage): msg is SDKSystemMessage {
  return msg.type === 'system';
}

/**
 * Type guard for SDKAssistantMessage
 */
export function isSDKAssistantMessage(msg: SDKMessage): msg is SDKAssistantMessage {
  return msg.type === 'assistant';
}

/**
 * Type guard for SDKUserMessage
 */
export function isSDKUserMessage(msg: SDKMessage): msg is SDKUserMessage {
  return msg.type === 'user';
}

/**
 * Type guard for SDKToolUseMessage
 */
export function isSDKToolUseMessage(msg: SDKMessage): msg is SDKToolUseMessage {
  return msg.type === 'tool_use';
}

/**
 * Type guard for SDKToolResultMessage
 */
export function isSDKToolResultMessage(msg: SDKMessage): msg is SDKToolResultMessage {
  return msg.type === 'tool_result';
}

/**
 * Type guard for SDKResultMessage
 */
export function isSDKResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return msg.type === 'result';
}
