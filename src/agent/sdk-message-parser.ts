/**
 * SDK Message Parser
 *
 * Type guards and parsing utilities for Claude Agent SDK messages.
 */

import type {
  SDKMessage,
  SDKSystemMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * Content block types from the SDK (not fully typed in SDK)
 */
interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

interface TextBlock {
  type: 'text';
  text: string;
}

type ContentBlock = ToolUseBlock | ToolResultBlock | TextBlock | { type: string };

/**
 * Type guard for tool_use block
 */
function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use' && 'id' in block && 'name' in block;
}

/**
 * Type guard for tool_result block
 */
function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === 'tool_result' && 'tool_use_id' in block;
}

/**
 * Type guard for system init message
 */
export function isSystemMessage(msg: SDKMessage): msg is SDKSystemMessage {
  return msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init';
}

/**
 * Type guard for assistant message
 */
export function isAssistantMessage(msg: SDKMessage): msg is SDKAssistantMessage {
  return msg.type === 'assistant';
}

/**
 * Type guard for user message (tool results)
 */
export function isUserMessage(msg: SDKMessage): msg is SDKUserMessage {
  return msg.type === 'user';
}

/**
 * Type guard for result message
 */
export function isResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return msg.type === 'result';
}

/**
 * Type guard for successful result
 */
export function isSuccessResult(
  msg: SDKResultMessage
): msg is SDKResultMessage & { subtype: 'success' } {
  return msg.subtype === 'success';
}

/**
 * Type guard for error result
 */
export function isErrorResult(msg: SDKResultMessage): boolean {
  return (
    msg.subtype === 'error_max_turns' ||
    msg.subtype === 'error_during_execution' ||
    msg.subtype === 'error_max_budget_usd' ||
    msg.subtype === 'error_max_structured_output_retries'
  );
}

/**
 * Tool call record for tracking
 */
export interface ToolCallRecord {
  toolName: string;
  toolUseId: string;
  input: unknown;
  output?: unknown;
  error?: string;
}

/**
 * Extracted result from SDK messages
 */
export interface ExtractedResult {
  success: boolean;
  sessionId: string | null;
  result: string | null;
  numTurns: number;
  durationMs: number;
  durationApiMs: number;
  tokensUsed: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  } | null;
  totalCostUsd: number;
  toolCalls: ToolCallRecord[];
  errors: string[];
  model: string | null;
  tools: string[];
}

/**
 * Extract tool use blocks from assistant message
 */
export function extractToolUses(
  msg: SDKAssistantMessage
): Array<{ id: string; name: string; input: unknown }> {
  const toolUses: Array<{ id: string; name: string; input: unknown }> = [];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SDK type is not fully typed
  if (msg.message?.content) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SDK type is not fully typed
    const content = msg.message.content as ContentBlock[];
    for (const block of content) {
      if (isToolUseBlock(block)) {
        toolUses.push({
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }
  }

  return toolUses;
}

/**
 * Message collector for aggregating SDK messages
 */
export class MessageCollector {
  private sessionId: string | null = null;
  private model: string | null = null;
  private tools: string[] = [];
  private toolCalls: Map<string, ToolCallRecord> = new Map();
  private result: SDKResultMessage | null = null;

  /**
   * Process a message from the SDK
   */
  process(msg: SDKMessage): void {
    if (isSystemMessage(msg)) {
      this.sessionId = msg.session_id;
      this.model = msg.model;
      this.tools = msg.tools;
    } else if (isAssistantMessage(msg)) {
      // Track tool uses
      const toolUses = extractToolUses(msg);
      for (const toolUse of toolUses) {
        this.toolCalls.set(toolUse.id, {
          toolName: toolUse.name,
          toolUseId: toolUse.id,
          input: toolUse.input,
        });
      }
    } else if (isUserMessage(msg)) {
      // Match tool results to tool uses
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SDK type is not fully typed
      if (msg.message?.content) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SDK type is not fully typed
        const content = msg.message.content as ContentBlock[];
        for (const block of content) {
          if (isToolResultBlock(block)) {
            const existing = this.toolCalls.get(block.tool_use_id);
            if (existing) {
              existing.output = block.content;
              if (block.is_error) {
                existing.error = String(block.content);
              }
            }
          }
        }
      }
    } else if (isResultMessage(msg)) {
      this.result = msg;
      // Update session ID from result if not already set
      if (!this.sessionId) {
        this.sessionId = msg.session_id;
      }
    }
  }

  /**
   * Get the extracted result
   */
  getResult(): ExtractedResult {
    const result = this.result;

    if (!result) {
      return {
        success: false,
        sessionId: this.sessionId,
        result: null,
        numTurns: 0,
        durationMs: 0,
        durationApiMs: 0,
        tokensUsed: null,
        totalCostUsd: 0,
        toolCalls: Array.from(this.toolCalls.values()),
        errors: ['No result message received'],
        model: this.model,
        tools: this.tools,
      };
    }

    const isSuccess = isSuccessResult(result);

    return {
      success: isSuccess,
      sessionId: result.session_id,
      result: isSuccess && 'result' in result ? result.result : null,
      numTurns: result.num_turns,
      durationMs: result.duration_ms,
      durationApiMs: result.duration_api_ms,
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- SDK usage type is not fully typed */
      tokensUsed: result.usage
        ? {
            input: result.usage.input_tokens ?? 0,
            output: result.usage.output_tokens ?? 0,
            cacheCreation: result.usage.cache_creation_input_tokens ?? 0,
            cacheRead: result.usage.cache_read_input_tokens ?? 0,
          }
        : null,
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      totalCostUsd: result.total_cost_usd ?? 0,
      toolCalls: Array.from(this.toolCalls.values()),
      errors: 'errors' in result ? result.errors : [],
      model: this.model,
      tools: this.tools,
    };
  }

  /**
   * Get the session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
}
