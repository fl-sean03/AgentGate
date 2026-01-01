/**
 * Streaming Executor for Claude Code subprocess execution.
 *
 * Wraps subprocess execution with real-time stdout parsing and event emission.
 * Supports cancellation via AbortSignal.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import { createLogger } from '../utils/index.js';
import {
  StreamParser,
  type ParsedEvent,
} from './stream-parser.js';
import type { AgentStructuredOutput } from '../types/agent.js';
import { parseOutput, extractSessionId, extractTokenUsage } from './output-parser.js';

const logger = createLogger('agent:streaming-executor');

/**
 * Streaming options for the executor
 */
export interface StreamingOptions {
  /** Emit tool call events (default: true) */
  emitToolCalls?: boolean;
  /** Emit tool result events (default: true) */
  emitToolResults?: boolean;
  /** Emit agent output events (default: true) */
  emitOutput?: boolean;
  /** Emit progress updates (default: true) */
  emitProgress?: boolean;
  /** Progress update interval in milliseconds (default: 5000) */
  progressIntervalMs?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Result from streaming execution
 */
export interface StreamingExecutionResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** Process exit code */
  exitCode: number;
  /** Collected stdout */
  stdout: string;
  /** Collected stderr */
  stderr: string;
  /** Parsed structured output */
  structuredOutput: AgentStructuredOutput | null;
  /** Session ID from output */
  sessionId: string | null;
  /** Token usage from output */
  tokensUsed: { input: number; output: number } | null;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Whether execution was cancelled */
  cancelled: boolean;
}

/**
 * Event callback type for streaming events
 */
export type StreamingEventCallback = (event: ParsedEvent) => void;

/**
 * Constructor options for StreamingExecutor
 */
export interface StreamingExecutorConfig {
  /** Work order ID for event context */
  workOrderId: string;
  /** Run ID for event context */
  runId: string;
  /** Callback function for streaming events (optional) */
  onEvent?: StreamingEventCallback | undefined;
  /** Streaming options */
  options?: StreamingOptions | undefined;
}

/**
 * Execa-like options for process execution
 */
export interface ExecuteOptions {
  /** Working directory */
  cwd?: string | undefined;
  /** Environment variables */
  env?: Record<string, string | undefined> | undefined;
  /** Timeout in milliseconds */
  timeout?: number | undefined;
  /** AbortSignal for cancellation */
  signal?: AbortSignal | undefined;
}

/**
 * StreamingExecutor wraps subprocess execution with real-time event streaming.
 *
 * Features:
 * - Real-time stdout parsing with readline
 * - Event emission via callback
 * - Support for cancellation via AbortSignal
 * - Collection of output for final result
 */
export class StreamingExecutor {
  private readonly workOrderId: string;
  private readonly runId: string;
  private readonly onEvent: StreamingEventCallback | undefined;
  private readonly options: Required<StreamingOptions>;
  private readonly parser: StreamParser;

  constructor(config: StreamingExecutorConfig) {
    this.workOrderId = config.workOrderId;
    this.runId = config.runId;
    this.onEvent = config.onEvent;

    // Apply default options
    this.options = {
      emitToolCalls: config.options?.emitToolCalls ?? true,
      emitToolResults: config.options?.emitToolResults ?? true,
      emitOutput: config.options?.emitOutput ?? true,
      emitProgress: config.options?.emitProgress ?? true,
      progressIntervalMs: config.options?.progressIntervalMs ?? 5000,
      debug: config.options?.debug ?? false,
    };

    // Create stream parser with matching options
    this.parser = new StreamParser({
      progressIntervalMs: this.options.progressIntervalMs,
      debug: this.options.debug,
    });

    logger.debug(
      { workOrderId: this.workOrderId, runId: this.runId, options: this.options },
      'StreamingExecutor initialized'
    );
  }

  /**
   * Execute a command with streaming output.
   *
   * @param command - The command to execute
   * @param args - Command arguments
   * @param execOptions - Execution options
   * @returns Promise resolving to the execution result
   */
  async execute(
    command: string,
    args: string[],
    execOptions?: ExecuteOptions
  ): Promise<StreamingExecutionResult> {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let cancelled = false;
    let timedOut = false;

    logger.info(
      {
        workOrderId: this.workOrderId,
        runId: this.runId,
        command,
        argsCount: args.length,
        cwd: execOptions?.cwd,
      },
      'Starting streaming execution'
    );

    return new Promise<StreamingExecutionResult>((resolve) => {
      const env: Record<string, string> = {};

      // Copy process.env to env, filtering undefined values
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }

      // Merge in any additional env vars
      if (execOptions?.env) {
        for (const [key, value] of Object.entries(execOptions.env)) {
          if (value !== undefined) {
            env[key] = value;
          }
        }
      }

      // Ensure clean output
      env['NO_COLOR'] = '1';
      env['FORCE_COLOR'] = '0';

      const proc: ChildProcess = spawn(command, args, {
        cwd: execOptions?.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Close stdin immediately
      proc.stdin?.end();

      // Set up timeout handler
      let timeoutId: NodeJS.Timeout | null = null;
      if (execOptions?.timeout) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          proc.kill('SIGTERM');
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 5000);
        }, execOptions.timeout);
      }

      // Set up abort signal handler
      const abortHandler = (): void => {
        cancelled = true;
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 1000);

        // Emit cancellation event if callback exists
        if (this.onEvent && this.options.emitProgress) {
          this.onEvent({
            type: 'progress_update',
            workOrderId: this.workOrderId,
            runId: this.runId,
            percentage: 0,
            currentPhase: 'Cancelled',
            toolCallCount: this.parser.getToolCallCount(),
            elapsedSeconds: Math.floor((Date.now() - startTime) / 1000),
            timestamp: new Date().toISOString(),
          });
        }
      };

      if (execOptions?.signal) {
        execOptions.signal.addEventListener('abort', abortHandler, { once: true });
      }

      // Set up readline for stdout streaming
      const readline: ReadlineInterface = createInterface({
        input: proc.stdout!,
        crlfDelay: Infinity,
      });

      // Process each line as it arrives
      readline.on('line', (line: string) => {
        // Accumulate stdout
        stdout += line + '\n';

        // Parse and emit events if callback exists
        if (this.onEvent) {
          const message = this.parser.parseLine(line);
          if (message) {
            const event = this.messageToEvent(message);
            if (event && this.shouldEmitEvent(event)) {
              this.onEvent(event);
            }
          }
        }
      });

      // Collect stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;

        // Emit stderr as error event if callback exists
        if (this.onEvent && this.options.emitOutput) {
          // Log but don't emit as regular output (it's error output)
          logger.debug({ stderr: text.substring(0, 200) }, 'Stderr received');
        }
      });

      // Handle process errors
      proc.on('error', (error: Error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        readline.close();

        if (execOptions?.signal) {
          execOptions.signal.removeEventListener('abort', abortHandler);
        }

        const durationMs = Date.now() - startTime;
        logger.error({ error: error.message }, 'Process error');

        resolve({
          success: false,
          exitCode: 1,
          stdout,
          stderr: stderr || error.message,
          structuredOutput: null,
          sessionId: null,
          tokensUsed: null,
          durationMs,
          cancelled: false,
        });
      });

      // Handle process exit
      proc.on('close', (exitCode: number | null, signal: string | null) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        readline.close();

        if (execOptions?.signal) {
          execOptions.signal.removeEventListener('abort', abortHandler);
        }

        const durationMs = Date.now() - startTime;

        // Handle cancellation
        if (cancelled) {
          logger.info({ durationMs }, 'Execution cancelled');
          resolve({
            success: false,
            exitCode: 130, // Standard interrupt exit code
            stdout,
            stderr: stderr || 'Execution cancelled',
            structuredOutput: null,
            sessionId: null,
            tokensUsed: null,
            durationMs,
            cancelled: true,
          });
          return;
        }

        // Handle timeout
        if (timedOut) {
          logger.warn({ durationMs }, 'Execution timed out');
          resolve({
            success: false,
            exitCode: 124, // Standard timeout exit code
            stdout,
            stderr: stderr || `Execution timed out after ${execOptions?.timeout}ms`,
            structuredOutput: null,
            sessionId: null,
            tokensUsed: null,
            durationMs,
            cancelled: false,
          });
          return;
        }

        // Handle kill signal
        if (signal) {
          logger.warn({ signal }, 'Process killed');
          resolve({
            success: false,
            exitCode: exitCode ?? 137,
            stdout,
            stderr: stderr || `Process killed with signal ${signal}`,
            structuredOutput: null,
            sessionId: null,
            tokensUsed: null,
            durationMs,
            cancelled: false,
          });
          return;
        }

        // Normal completion - parse structured output
        const structuredOutput = parseOutput(stdout);
        const actualExitCode = exitCode ?? 1;

        logger.info(
          {
            exitCode: actualExitCode,
            durationMs,
            hasOutput: !!structuredOutput,
            toolCalls: this.parser.getToolCallCount(),
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
          cancelled: false,
        });
      });
    });
  }

  /**
   * Convert a parsed Claude message to an event
   */
  private messageToEvent(message: ReturnType<StreamParser['parseLine']>): ParsedEvent | null {
    if (!message) {
      return null;
    }

    if (message.type === 'system') {
      // System messages are informational, don't emit events
      return null;
    }

    if (message.type === 'assistant') {
      if (message.message.type === 'tool_use') {
        return this.parser.parseToolUse(
          message as Parameters<StreamParser['parseToolUse']>[0],
          this.workOrderId,
          this.runId
        );
      }

      if (message.message.type === 'text') {
        return this.parser.parseText(
          message as Parameters<StreamParser['parseText']>[0],
          this.workOrderId,
          this.runId
        );
      }
    }

    if (message.type === 'user' && message.message.type === 'tool_result') {
      return this.parser.parseToolResult(
        message,
        this.workOrderId,
        this.runId
      );
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
        return this.options.emitProgress;
      default:
        return true;
    }
  }

  /**
   * Reset the internal parser state
   */
  reset(): void {
    this.parser.reset();
  }

  /**
   * Get the current tool call count
   */
  getToolCallCount(): number {
    return this.parser.getToolCallCount();
  }
}

/**
 * Create a streaming executor instance
 */
export function createStreamingExecutor(
  config: StreamingExecutorConfig
): StreamingExecutor {
  return new StreamingExecutor(config);
}
