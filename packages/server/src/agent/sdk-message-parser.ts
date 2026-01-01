/**
 * SDK Message Parser
 *
 * Utilities to parse and process Claude Agent SDK message streams
 * into AgentGate-compatible formats.
 */

import type { AgentResult, TokenUsage } from '../types/index.js';
import { createLogger } from '../utils/index.js';

const logger = createLogger('agent:sdk-parser');

// ============================================================================
// SDK Message Types
// ============================================================================

/**
 * Base SDK message interface
 */
export interface SDKMessageBase {
  type: string;
}

/**
 * System message - contains session info
 */
export interface SDKSystemMessage extends SDKMessageBase {
  type: 'system';
  session_id: string;
  model: string;
  tools?: string[];
}

/**
 * Assistant message - contains model response
 */
export interface SDKAssistantMessage extends SDKMessageBase {
  type: 'assistant';
  content: string;
  tool_use?: {
    name: string;
    input: Record<string, unknown>;
  };
}

/**
 * Tool use message - indicates tool invocation
 */
export interface SDKToolUseMessage extends SDKMessageBase {
  type: 'tool_use';
  tool: string;
  input: Record<string, unknown>;
}

/**
 * Tool result message - contains tool output
 */
export interface SDKToolResultMessage extends SDKMessageBase {
  type: 'tool_result';
  tool: string;
  output: string;
  error?: boolean;
}

/**
 * Result message - final result with usage/cost
 */
export interface SDKResultMessage extends SDKMessageBase {
  type: 'result';
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  cost?: number;
  result?: string;
}

/**
 * Union type for all SDK messages
 */
export type SDKMessage =
  | SDKSystemMessage
  | SDKAssistantMessage
  | SDKToolUseMessage
  | SDKToolResultMessage
  | SDKResultMessage;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if message is a system message
 */
export function isSystemMessage(msg: SDKMessageBase): msg is SDKSystemMessage {
  return msg.type === 'system';
}

/**
 * Check if message is an assistant message
 */
export function isAssistantMessage(msg: SDKMessageBase): msg is SDKAssistantMessage {
  return msg.type === 'assistant';
}

/**
 * Check if message is a tool use message
 */
export function isToolUseMessage(msg: SDKMessageBase): msg is SDKToolUseMessage {
  return msg.type === 'tool_use';
}

/**
 * Check if message is a tool result message
 */
export function isToolResultMessage(msg: SDKMessageBase): msg is SDKToolResultMessage {
  return msg.type === 'tool_result';
}

/**
 * Check if message is a result message
 */
export function isResultMessage(msg: SDKMessageBase): msg is SDKResultMessage {
  return msg.type === 'result';
}

// ============================================================================
// Tool Call Recording
// ============================================================================

/**
 * Record of a tool call with timing
 */
export interface ToolCallRecord {
  tool: string;
  input: Record<string, unknown>;
  output?: string;
  error?: boolean;
  durationMs: number;
  timestamp: Date;
}

// ============================================================================
// Message Collector
// ============================================================================

/**
 * Collects SDK messages during streaming and provides
 * utilities to extract session, cost, and usage information.
 */
export class MessageCollector {
  private messages: SDKMessage[] = [];
  private systemMessage: SDKSystemMessage | null = null;
  private resultMessage: SDKResultMessage | null = null;
  private toolCalls: ToolCallRecord[] = [];
  private currentToolStart: number | null = null;
  private currentTool: { tool: string; input: Record<string, unknown> } | null = null;

  /**
   * Add a message to the collector
   */
  add(message: SDKMessage): void {
    this.messages.push(message);

    if (isSystemMessage(message)) {
      this.systemMessage = message;
      logger.debug(
        { sessionId: message.session_id, model: message.model },
        'System message received'
      );
    } else if (isResultMessage(message)) {
      this.resultMessage = message;
      logger.debug(
        { usage: message.usage, cost: message.cost },
        'Result message received'
      );
    } else if (isToolUseMessage(message)) {
      this.currentToolStart = Date.now();
      this.currentTool = { tool: message.tool, input: message.input };
      logger.debug({ tool: message.tool }, 'Tool use started');
    } else if (isToolResultMessage(message)) {
      // Record tool call with duration
      if (this.currentToolStart !== null && this.currentTool !== null) {
        const durationMs = Date.now() - this.currentToolStart;
        const toolCallRecord: ToolCallRecord = {
          tool: this.currentTool.tool,
          input: this.currentTool.input,
          output: message.output,
          durationMs,
          timestamp: new Date(),
        };
        // Only set error if it's actually true (for exactOptionalPropertyTypes)
        if (message.error === true) {
          toolCallRecord.error = true;
        }
        this.toolCalls.push(toolCallRecord);
        logger.debug(
          { tool: this.currentTool.tool, durationMs, error: message.error },
          'Tool use completed'
        );
      }
      this.currentToolStart = null;
      this.currentTool = null;
    }
  }

  /**
   * Get the session ID from the system message
   */
  getSessionId(): string | null {
    return this.systemMessage?.session_id ?? null;
  }

  /**
   * Get the model name from the system message
   */
  getModel(): string | null {
    return this.systemMessage?.model ?? null;
  }

  /**
   * Get the cost from the result message
   */
  getCost(): number | null {
    return this.resultMessage?.cost ?? null;
  }

  /**
   * Get token usage from the result message
   */
  getUsage(): TokenUsage | null {
    if (!this.resultMessage?.usage) return null;
    return {
      input: this.resultMessage.usage.input_tokens,
      output: this.resultMessage.usage.output_tokens,
    };
  }

  /**
   * Get all recorded tool calls
   */
  getToolCalls(): ToolCallRecord[] {
    return [...this.toolCalls];
  }

  /**
   * Get all collected messages
   */
  getAllMessages(): SDKMessage[] {
    return [...this.messages];
  }

  /**
   * Get the count of assistant turns (responses)
   */
  getTurnCount(): number {
    return this.messages.filter(isAssistantMessage).length;
  }

  /**
   * Get the final result text
   */
  getResultText(): string | null {
    return this.resultMessage?.result ?? null;
  }

  /**
   * Check if any tool calls had errors
   */
  hasToolErrors(): boolean {
    return this.toolCalls.some((tc) => tc.error === true);
  }

  /**
   * Get total tool call duration
   */
  getTotalToolDuration(): number {
    return this.toolCalls.reduce((sum, tc) => sum + tc.durationMs, 0);
  }

  /**
   * Reset the collector for reuse
   */
  reset(): void {
    this.messages = [];
    this.systemMessage = null;
    this.resultMessage = null;
    this.toolCalls = [];
    this.currentToolStart = null;
    this.currentTool = null;
  }
}

// ============================================================================
// SDK Structured Output
// ============================================================================

/**
 * Extended structured output for SDK driver
 */
export interface SDKStructuredOutput {
  messages: SDKMessage[];
  sessionId: string | null;
  model: string | null;
  totalCostUsd: number | null;
  toolCalls: ToolCallRecord[];
  turns: number;
  result: string | null;
}

/**
 * Build SDK structured output from collected messages
 */
export function buildSDKStructuredOutput(collector: MessageCollector): SDKStructuredOutput {
  return {
    messages: collector.getAllMessages(),
    sessionId: collector.getSessionId(),
    model: collector.getModel(),
    totalCostUsd: collector.getCost(),
    toolCalls: collector.getToolCalls(),
    turns: collector.getTurnCount(),
    result: collector.getResultText(),
  };
}

// ============================================================================
// Result Builder
// ============================================================================

/**
 * Extended structured output for agent result
 * Includes SDK-specific fields beyond the base AgentStructuredOutput
 */
interface ExtendedAgentStructuredOutput {
  result: string;
  session_id?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  model?: string;
  totalCostUsd?: number;
  toolCalls?: ToolCallRecord[];
  turns?: number;
}

/**
 * Build an AgentResult from collected SDK messages
 */
export function buildAgentResult(
  collector: MessageCollector,
  success: boolean,
  durationMs: number,
  error?: string
): AgentResult {
  const structuredOutput = buildSDKStructuredOutput(collector);

  // Build a simplified structured output that matches the existing format
  const agentStructuredOutput: ExtendedAgentStructuredOutput = {
    result: structuredOutput.result ?? (success ? 'completed' : 'failed'),
  };

  // Only add optional fields if they have values (for exactOptionalPropertyTypes)
  const sessionId = structuredOutput.sessionId;
  if (sessionId !== null) {
    agentStructuredOutput.session_id = sessionId;
  }

  const usage = collector.getUsage();
  if (usage !== null) {
    agentStructuredOutput.usage = {
      input_tokens: usage.input,
      output_tokens: usage.output,
    };
  }

  const model = structuredOutput.model;
  if (model !== null) {
    agentStructuredOutput.model = model;
  }

  const cost = structuredOutput.totalCostUsd;
  if (cost !== null) {
    agentStructuredOutput.totalCostUsd = cost;
  }

  agentStructuredOutput.toolCalls = structuredOutput.toolCalls;
  agentStructuredOutput.turns = structuredOutput.turns;

  return {
    success,
    exitCode: success ? 0 : 1,
    stdout: '', // SDK doesn't use stdout
    stderr: error ?? '',
    structuredOutput: agentStructuredOutput,
    sessionId: collector.getSessionId(),
    tokensUsed: collector.getUsage(),
    durationMs,
  };
}
