/**
 * Stream Parser for Claude Code JSON output
 *
 * Parses line-by-line JSON output from Claude Code and converts
 * to typed events for WebSocket broadcasting.
 */

import type { Interface as ReadlineInterface } from 'node:readline';
import { createLogger } from '../utils/index.js';
import type {
  AgentToolCallEvent,
  AgentToolResultEvent,
  AgentOutputEvent,
  ProgressUpdateEvent,
  AgentToolName,
} from '../server/websocket/types.js';

const logger = createLogger('agent:stream-parser');

/**
 * Maximum length for content preview in tool results
 */
const CONTENT_PREVIEW_MAX_LENGTH = 500;

/**
 * Default interval for progress updates (in milliseconds)
 */
const DEFAULT_PROGRESS_INTERVAL_MS = 5000;

/**
 * Raw Claude Code JSON line types
 */
export interface ClaudeSystemMessage {
  type: 'system';
  subtype: string;
  cwd?: string;
  session_id?: string;
}

export interface ClaudeAssistantTextMessage {
  type: 'assistant';
  message: {
    type: 'text';
    text: string;
  };
}

export interface ClaudeAssistantToolUseMessage {
  type: 'assistant';
  message: {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
}

export interface ClaudeToolResultMessage {
  type: 'user';
  message: {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
  };
}

export type ClaudeMessage =
  | ClaudeSystemMessage
  | ClaudeAssistantTextMessage
  | ClaudeAssistantToolUseMessage
  | ClaudeToolResultMessage;

/**
 * Union of all parsed event types
 */
export type ParsedEvent =
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentOutputEvent
  | ProgressUpdateEvent;

/**
 * Options for the StreamParser
 */
export interface ParserOptions {
  /** Interval for progress updates in milliseconds (default: 5000) */
  progressIntervalMs?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Internal tracking for tool call timing
 */
interface ToolCallTiming {
  toolUseId: string;
  startTime: number;
}

/**
 * StreamParser parses Claude Code JSON output into typed events
 */
export class StreamParser {
  private readonly progressIntervalMs: number;
  private readonly debug: boolean;

  /** Tracks active tool calls for duration calculation */
  private activeToolCalls: Map<string, ToolCallTiming> = new Map();

  /** Total tool calls made */
  private toolCallCount = 0;

  /** Start time for elapsed calculation */
  private startTime: number | null = null;

  /** Last progress update time */
  private lastProgressTime = 0;

  constructor(options: ParserOptions = {}) {
    this.progressIntervalMs = options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
    this.debug = options.debug ?? false;
  }

  /**
   * Parses a single JSON line from Claude Code output
   *
   * @param line - The JSON line to parse
   * @returns The parsed Claude message or null if invalid/unrecognized
   */
  parseLine(line: string): ClaudeMessage | null {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(trimmed);

      if (!this.isClaudeMessage(parsed)) {
        if (this.debug) {
          logger.debug({ line: trimmed.substring(0, 100) }, 'Unrecognized message structure');
        }
        return null;
      }

      return parsed;
    } catch (error) {
      logger.warn({ line: trimmed.substring(0, 100), error }, 'Failed to parse JSON line');
      return null;
    }
  }

  /**
   * Parses a tool_use message into an AgentToolCallEvent
   */
  parseToolUse(
    message: ClaudeAssistantToolUseMessage,
    workOrderId: string,
    runId: string
  ): AgentToolCallEvent {
    const toolData = message.message;
    const toolName = this.normalizeToolName(toolData.name);

    // Track the tool call for duration calculation
    const now = Date.now();
    this.activeToolCalls.set(toolData.id, {
      toolUseId: toolData.id,
      startTime: now,
    });

    this.toolCallCount++;

    return this.createToolCallEvent(workOrderId, runId, {
      toolUseId: toolData.id,
      tool: toolName,
      input: toolData.input,
    });
  }

  /**
   * Parses a tool_result message into an AgentToolResultEvent
   */
  parseToolResult(
    message: ClaudeToolResultMessage,
    workOrderId: string,
    runId: string
  ): AgentToolResultEvent {
    const resultData = message.message;
    const toolUseId = resultData.tool_use_id;
    const content = resultData.content;
    const isError = resultData.is_error ?? false;

    // Calculate duration from tracked tool call
    let durationMs = 0;
    const timing = this.activeToolCalls.get(toolUseId);
    if (timing) {
      durationMs = Date.now() - timing.startTime;
      this.activeToolCalls.delete(toolUseId);
    }

    return this.createToolResultEvent(workOrderId, runId, {
      toolUseId,
      success: !isError,
      content,
      durationMs,
    });
  }

  /**
   * Parses a text message into an AgentOutputEvent
   */
  parseText(
    message: ClaudeAssistantTextMessage,
    workOrderId: string,
    runId: string
  ): AgentOutputEvent | null {
    const text = message.message.text;

    // Filter out empty or purely whitespace text
    if (!text.trim()) {
      return null;
    }

    return this.createOutputEvent(workOrderId, runId, text);
  }

  /**
   * Async generator that parses a readline stream and yields events
   */
  async *parseStream(
    readline: ReadlineInterface,
    workOrderId: string,
    runId: string
  ): AsyncGenerator<ParsedEvent> {
    this.startTime = Date.now();
    this.lastProgressTime = this.startTime;
    this.toolCallCount = 0;
    this.activeToolCalls.clear();

    for await (const line of readline) {
      const message = this.parseLine(line);
      if (!message) {
        continue;
      }

      const event = this.messageToEvent(message, workOrderId, runId);
      if (event) {
        yield event;
      }

      // Check if we should emit a progress update
      const progressEvent = this.maybeEmitProgress(workOrderId, runId);
      if (progressEvent) {
        yield progressEvent;
      }
    }
  }

  /**
   * Creates a ProgressUpdateEvent based on current state
   */
  createProgressEvent(
    workOrderId: string,
    runId: string,
    phase: string
  ): ProgressUpdateEvent {
    const now = Date.now();
    const elapsedMs = this.startTime ? now - this.startTime : 0;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    // Simple heuristic for percentage (can be improved)
    // Based on tool call count, estimate progress
    const percentage = Math.min(95, this.toolCallCount * 5);

    return {
      type: 'progress_update',
      workOrderId,
      runId,
      percentage,
      currentPhase: phase,
      toolCallCount: this.toolCallCount,
      elapsedSeconds,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Factory method: Creates an AgentToolCallEvent
   */
  createToolCallEvent(
    workOrderId: string,
    runId: string,
    toolData: { toolUseId: string; tool: AgentToolName; input: Record<string, unknown> }
  ): AgentToolCallEvent {
    return {
      type: 'agent_tool_call',
      workOrderId,
      runId,
      toolUseId: toolData.toolUseId,
      tool: toolData.tool,
      input: toolData.input,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Factory method: Creates an AgentToolResultEvent
   */
  createToolResultEvent(
    workOrderId: string,
    runId: string,
    resultData: { toolUseId: string; success: boolean; content: string; durationMs: number }
  ): AgentToolResultEvent {
    const contentPreview = this.truncateContent(resultData.content);

    return {
      type: 'agent_tool_result',
      workOrderId,
      runId,
      toolUseId: resultData.toolUseId,
      success: resultData.success,
      contentPreview,
      contentLength: resultData.content.length,
      durationMs: resultData.durationMs,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Factory method: Creates an AgentOutputEvent
   */
  createOutputEvent(
    workOrderId: string,
    runId: string,
    text: string
  ): AgentOutputEvent {
    return {
      type: 'agent_output',
      workOrderId,
      runId,
      content: text,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Normalizes a tool name from Claude Code to our AgentToolName type
   */
  private normalizeToolName(name: string): AgentToolName {
    const knownTools: AgentToolName[] = [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Grep',
      'Glob',
      'WebFetch',
      'WebSearch',
    ];

    // Case-insensitive match
    const normalized = knownTools.find(
      (tool) => tool.toLowerCase() === name.toLowerCase()
    );

    return normalized ?? 'Other';
  }

  /**
   * Type guard for ClaudeMessage
   */
  private isClaudeMessage(value: unknown): value is ClaudeMessage {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const obj = value as Record<string, unknown>;
    const type = obj['type'];

    if (type === 'system') {
      return typeof obj['subtype'] === 'string';
    }

    if (type === 'assistant') {
      const message = obj['message'];
      if (typeof message !== 'object' || message === null) {
        return false;
      }
      const msgObj = message as Record<string, unknown>;
      return msgObj['type'] === 'text' || msgObj['type'] === 'tool_use';
    }

    if (type === 'user') {
      const message = obj['message'];
      if (typeof message !== 'object' || message === null) {
        return false;
      }
      const msgObj = message as Record<string, unknown>;
      return msgObj['type'] === 'tool_result';
    }

    return false;
  }

  /**
   * Converts a ClaudeMessage to a ParsedEvent
   */
  private messageToEvent(
    message: ClaudeMessage,
    workOrderId: string,
    runId: string
  ): ParsedEvent | null {
    if (message.type === 'system') {
      // System messages are informational, don't emit events
      return null;
    }

    if (message.type === 'assistant') {
      if (message.message.type === 'tool_use') {
        return this.parseToolUse(
          message as ClaudeAssistantToolUseMessage,
          workOrderId,
          runId
        );
      }

      if (message.message.type === 'text') {
        return this.parseText(
          message as ClaudeAssistantTextMessage,
          workOrderId,
          runId
        );
      }
    }

    if (message.type === 'user' && message.message.type === 'tool_result') {
      return this.parseToolResult(message, workOrderId, runId);
    }

    return null;
  }

  /**
   * Truncates content to the preview max length
   */
  private truncateContent(content: string): string {
    if (content.length <= CONTENT_PREVIEW_MAX_LENGTH) {
      return content;
    }

    return content.substring(0, CONTENT_PREVIEW_MAX_LENGTH) + '...';
  }

  /**
   * Checks if we should emit a progress update and returns it
   */
  private maybeEmitProgress(
    workOrderId: string,
    runId: string
  ): ProgressUpdateEvent | null {
    const now = Date.now();

    if (now - this.lastProgressTime >= this.progressIntervalMs) {
      this.lastProgressTime = now;

      // Determine current phase based on state
      const phase = this.activeToolCalls.size > 0
        ? 'Executing tools'
        : 'Processing';

      return this.createProgressEvent(workOrderId, runId, phase);
    }

    return null;
  }

  /**
   * Gets the current tool call count
   */
  getToolCallCount(): number {
    return this.toolCallCount;
  }

  /**
   * Resets the parser state
   */
  reset(): void {
    this.activeToolCalls.clear();
    this.toolCallCount = 0;
    this.startTime = null;
    this.lastProgressTime = 0;
  }
}
