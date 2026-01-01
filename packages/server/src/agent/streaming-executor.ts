/**
 * Streaming Executor for Claude Code subprocess execution.
 *
 * Wraps subprocess execution to provide real-time stdout parsing
 * and event emission via callbacks. Supports cancellation.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import { createLogger } from '../utils/index.js';
import { StreamParser, type ParsedEvent } from './stream-parser.js';
import { parseOutput, extractSessionId, extractTokenUsage } from './output-parser.js';
import type { AgentResult } from './driver.js';

const logger = createLogger('agent:streaming-executor');

/**
 * Options for streaming execution
 */
export interface StreamingOptions {
  /** Whether to emit tool call events (default: true) */
  emitToolCalls?: boolean;
  /** Whether to emit tool result events (default: true) */
  emitToolResults?: boolean;
  /** Whether to emit output events (default: true) */
  emitOutput?: boolean;
  /** Interval for progress updates in milliseconds (default: 5000) */
  progressIntervalMs?: number;
}

/**
 * Callback for streaming events
 */
export type StreamingEventCallback = (event: ParsedEvent) => void;

/**
 * Options passed to the execute method
 */
export interface ExecuteOptions {
  /** Working directory for the subprocess */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Result of streaming execution
 */
export interface ExecutionResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** Exit code from subprocess */
  exitCode: number;
  /** Collected stdout */
  stdout: string;
  /** Collected stderr */
  stderr: string;
  /** Parsed structured output */
  structuredOutput: AgentResult['structuredOutput'];
  /** Session ID for continuation */
  sessionId: string | null;
  /** Token usage if available */
  tokensUsed: AgentResult['tokensUsed'];
  /** Duration in milliseconds */
  durationMs: number;
  /** All parsed events */
  events: ParsedEvent[];
  /** Whether execution was cancelled */
  cancelled: boolean;
}

/**
 * Configuration for StreamingExecutor
 */
export interface StreamingExecutorConfig {
  /** Work order ID for event tagging */
  workOrderId: string;
  /** Run ID for event tagging */
  runId: string;
  /** Callback for streaming events (optional) */
  eventCallback?: StreamingEventCallback | undefined;
  /** Streaming options (optional) */
  options?: StreamingOptions | undefined;
}

/**
 * StreamingExecutor wraps subprocess execution with real-time
 * stdout parsing and event emission.
 */
export class StreamingExecutor {
  private readonly workOrderId: string;
  private readonly runId: string;
  private readonly eventCallback: StreamingEventCallback | undefined;
  private readonly options: Required<StreamingOptions>;
  private readonly parser: StreamParser;

  constructor(config: StreamingExecutorConfig) {
    this.workOrderId = config.workOrderId;
    this.runId = config.runId;
    this.eventCallback = config.eventCallback;
    this.options = {
      emitToolCalls: config.options?.emitToolCalls ?? true,
      emitToolResults: config.options?.emitToolResults ?? true,
      emitOutput: config.options?.emitOutput ?? true,
      progressIntervalMs: config.options?.progressIntervalMs ?? 5000,
    };
    this.parser = new StreamParser({
      progressIntervalMs: this.options.progressIntervalMs,
    });
  }

  /**
   * Execute a command with streaming output parsing
   */
  async execute(
    command: string,
    args: string[],
    options: ExecuteOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const events: ParsedEvent[] = [];
    let stdout = '';
    let stderr = '';
    let cancelled = false;
    let readline: ReadlineInterface | null = null;

    logger.info(
      {
        workOrderId: this.workOrderId,
        runId: this.runId,
        command,
        argsCount: args.length,
        timeout: options.timeout,
      },
      'Starting streaming execution'
    );

    return new Promise<ExecutionResult>((resolve) => {
      const env = {
        ...process.env,
        ...options.env,
        // Ensure clean JSON output
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      };

      const proc: ChildProcess = spawn(command, args, {
        cwd: options.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Close stdin immediately to signal no more input
      proc.stdin?.end();

      // Set up timeout handler
      let timeoutId: NodeJS.Timeout | undefined;
      if (options.timeout) {
        timeoutId = setTimeout(() => {
          logger.warn(
            { workOrderId: this.workOrderId, runId: this.runId, timeout: options.timeout },
            'Streaming execution timed out'
          );
          proc.kill('SIGTERM');
          // Force kill after 5 seconds
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 5000);
        }, options.timeout);
      }

      // Set up abort signal handler
      const abortHandler = (): void => {
        cancelled = true;
        logger.info(
          { workOrderId: this.workOrderId, runId: this.runId },
          'Streaming execution cancelled'
        );
        proc.kill('SIGTERM');
        // Force kill after 2 seconds for cancellation
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 2000);
      };

      if (options.signal) {
        options.signal.addEventListener('abort', abortHandler, { once: true });
      }

      // Set up readline for real-time stdout parsing
      if (proc.stdout) {
        readline = createInterface({ input: proc.stdout });

        // Process lines as they come in
        readline.on('line', (line: string) => {
          stdout += line + '\n';

          const message = this.parser.parseLine(line);
          if (!message) {
            return;
          }

          // Convert message to event
          const event = this.messageToEvent(message);
          if (event) {
            // Check if we should emit this event type
            if (this.shouldEmitEvent(event)) {
              events.push(event);
              this.emitEvent(event);
            }
          }

          // Check for progress update
          const progressEvent = this.maybeEmitProgress();
          if (progressEvent) {
            events.push(progressEvent);
            this.emitEvent(progressEvent);
          }
        });
      }

      // Buffer stderr
      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Handle process errors
      proc.on('error', (error: Error) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (options.signal) {
          options.signal.removeEventListener('abort', abortHandler);
        }
        readline?.close();

        const durationMs = Date.now() - startTime;
        logger.error(
          { error: error.message, workOrderId: this.workOrderId, runId: this.runId },
          'Streaming execution process error'
        );

        resolve({
          success: false,
          exitCode: 1,
          stdout,
          stderr: stderr || error.message,
          structuredOutput: null,
          sessionId: null,
          tokensUsed: null,
          durationMs,
          events,
          cancelled,
        });
      });

      // Handle process exit
      proc.on('close', (exitCode: number | null, signal: string | null) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (options.signal) {
          options.signal.removeEventListener('abort', abortHandler);
        }
        readline?.close();

        const durationMs = Date.now() - startTime;

        // Check if process was killed
        if (signal) {
          logger.warn(
            { signal, workOrderId: this.workOrderId, runId: this.runId },
            'Streaming execution process killed'
          );

          resolve({
            success: false,
            exitCode: exitCode ?? 137,
            stdout,
            stderr: cancelled
              ? 'Execution cancelled'
              : stderr || `Process killed with signal ${signal}`,
            structuredOutput: null,
            sessionId: null,
            tokensUsed: null,
            durationMs,
            events,
            cancelled,
          });
          return;
        }

        const structuredOutput = parseOutput(stdout);
        const actualExitCode = exitCode ?? 1;

        logger.info(
          {
            exitCode: actualExitCode,
            durationMs,
            eventsEmitted: events.length,
            workOrderId: this.workOrderId,
            runId: this.runId,
          },
          'Streaming execution completed'
        );

        resolve({
          success: actualExitCode === 0,
          exitCode: actualExitCode,
          stdout,
          stderr,
          structuredOutput,
          sessionId: structuredOutput ? extractSessionId(structuredOutput) : null,
          tokensUsed: structuredOutput ? extractTokenUsage(structuredOutput) : null,
          durationMs,
          events,
          cancelled,
        });
      });
    });
  }

  /**
   * Convert a parsed Claude message to an event
   */
  private messageToEvent(message: ReturnType<StreamParser['parseLine']>): ParsedEvent | null {
    if (!message) return null;

    if (message.type === 'system') {
      // System messages are informational, don't emit events
      return null;
    }

    if (message.type === 'assistant') {
      if (message.message.type === 'tool_use') {
        // Type narrowing ensures message has the correct shape
        return this.parser.parseToolUse(message, this.workOrderId, this.runId);
      }

      if (message.message.type === 'text') {
        // Type narrowing ensures message has the correct shape
        return this.parser.parseText(message, this.workOrderId, this.runId);
      }
    }

    if (message.type === 'user' && message.message.type === 'tool_result') {
      // Type narrowing ensures message has the correct shape
      return this.parser.parseToolResult(message, this.workOrderId, this.runId);
    }

    return null;
  }

  /**
   * Check if an event should be emitted based on options
   */
  private shouldEmitEvent(event: ParsedEvent): boolean {
    switch (event.type) {
      case 'agent_tool_call':
        return this.options.emitToolCalls;
      case 'agent_tool_result':
        return this.options.emitToolResults;
      case 'agent_output':
        return this.options.emitOutput;
      case 'progress_update':
        return true; // Always emit progress
      default:
        return true;
    }
  }

  /**
   * Emit an event via callback
   */
  private emitEvent(event: ParsedEvent): void {
    if (this.eventCallback) {
      try {
        this.eventCallback(event);
      } catch (error) {
        logger.error(
          { error, eventType: event.type, workOrderId: this.workOrderId },
          'Error in event callback'
        );
      }
    }
  }

  /**
   * Check if we should emit a progress update
   */
  private maybeEmitProgress(): ParsedEvent | null {
    // Use the parser's progress tracking
    // This is a simple wrapper that defers to the parser
    return null; // Progress is handled internally by parseStream in parser
  }

  /**
   * Get the current tool call count
   */
  getToolCallCount(): number {
    return this.parser.getToolCallCount();
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.parser.reset();
  }
}

/**
 * Create a new StreamingExecutor instance
 */
export function createStreamingExecutor(
  config: StreamingExecutorConfig
): StreamingExecutor {
  return new StreamingExecutor(config);
}
