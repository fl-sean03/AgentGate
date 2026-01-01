import { spawn, execSync, type ChildProcess } from 'node:child_process';
import type {
  AgentDriver,
  AgentRequest,
  AgentResult,
  DriverCapabilities,
} from '../types/index.js';
import { createLogger } from '../utils/index.js';
import { buildClaudeCommand, buildCommandString } from './command-builder.js';
import { CLAUDE_CODE_CAPABILITIES, DEFAULT_TIMEOUT_MS } from './defaults.js';
import { extractSessionId, extractTokenUsage, parseOutput } from './output-parser.js';
import {
  StreamingExecutor,
  type StreamingEventCallback,
  type StreamingOptions,
} from './streaming-executor.js';

const logger = createLogger('agent:claude-code');

/**
 * Claude Code CLI driver configuration
 */
export interface ClaudeCodeDriverConfig {
  /** Path to claude CLI binary (default: 'claude') */
  binaryPath?: string;
  /** Default timeout in ms (default: 5 minutes) */
  defaultTimeoutMs?: number;
  /** Additional environment variables */
  env?: Record<string, string>;
}

/**
 * Options for execute method
 */
export interface ClaudeCodeExecuteOptions {
  /** Callback for streaming events */
  eventCallback?: StreamingEventCallback;
  /** Streaming options */
  streamingOptions?: StreamingOptions;
  /** Work order ID for event tagging (required for streaming) */
  workOrderId?: string;
  /** Run ID for event tagging (required for streaming) */
  runId?: string;
}

/**
 * Claude Code CLI driver implementation
 */
export class ClaudeCodeDriver implements AgentDriver {
  readonly name = 'claude-code-api';
  readonly version = '1.0.0';

  private readonly config: Required<ClaudeCodeDriverConfig>;

  constructor(config: ClaudeCodeDriverConfig = {}) {
    this.config = {
      binaryPath: config.binaryPath ?? 'claude',
      defaultTimeoutMs: config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      env: config.env ?? {},
    };
  }

  /**
   * Checks if the Claude CLI is available
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Interface requires Promise, execSync is sync
  async isAvailable(): Promise<boolean> {
    try {
      const output = execSync(`${this.config.binaryPath} --version`, {
        timeout: 5000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      logger.debug(
        { available: true, version: output?.trim() },
        'Claude CLI availability check'
      );

      return true;
    } catch (error) {
      logger.debug({ error }, 'Claude CLI not available');
      return false;
    }
  }

  /**
   * Returns the capabilities of this driver
   */
  getCapabilities(): DriverCapabilities {
    return { ...CLAUDE_CODE_CAPABILITIES };
  }

  /**
   * Executes an agent request using the Claude CLI
   * Uses child_process.spawn for reliable subprocess handling
   *
   * @param request - The agent request to execute
   * @param options - Optional streaming options
   */
  async execute(
    request: AgentRequest,
    options?: ClaudeCodeExecuteOptions
  ): Promise<AgentResult> {
    // Use streaming executor if callback is provided
    if (options?.eventCallback && options?.workOrderId && options?.runId) {
      return this.executeWithStreaming(request, options);
    }

    return this.executeWithoutStreaming(request);
  }

  /**
   * Execute with streaming support
   */
  private async executeWithStreaming(
    request: AgentRequest,
    options: ClaudeCodeExecuteOptions
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const args = buildClaudeCommand(request);
    const timeout = request.timeoutMs || this.config.defaultTimeoutMs;

    logger.info(
      {
        workspace: request.workspacePath,
        maxTurns: request.constraints.maxTurns,
        hasSession: !!request.sessionId,
        timeout,
        streaming: true,
      },
      'Executing Claude Code request with streaming'
    );

    logger.debug({ command: buildCommandString(request) }, 'Full command');

    const executor = new StreamingExecutor({
      workOrderId: options.workOrderId!,
      runId: options.runId!,
      eventCallback: options.eventCallback,
      options: options.streamingOptions,
    });

    const result = await executor.execute(this.config.binaryPath, args, {
      cwd: request.workspacePath,
      env: {
        ...this.config.env,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
      timeout,
    });

    const durationMs = Date.now() - startTime;

    logger.info(
      {
        exitCode: result.exitCode,
        durationMs,
        hasOutput: !!result.structuredOutput,
        eventsEmitted: result.events.length,
        cancelled: result.cancelled,
      },
      'Claude Code streaming execution completed'
    );

    return {
      success: result.success,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      structuredOutput: result.structuredOutput,
      sessionId: result.sessionId,
      tokensUsed: result.tokensUsed,
      durationMs,
    };
  }

  /**
   * Execute without streaming (original implementation)
   */
  private async executeWithoutStreaming(request: AgentRequest): Promise<AgentResult> {
    const startTime = Date.now();
    const args = buildClaudeCommand(request);
    const timeout = request.timeoutMs || this.config.defaultTimeoutMs;

    logger.info(
      {
        workspace: request.workspacePath,
        maxTurns: request.constraints.maxTurns,
        hasSession: !!request.sessionId,
        timeout,
      },
      'Executing Claude Code request'
    );

    logger.debug({ command: buildCommandString(request) }, 'Full command');

    return new Promise<AgentResult>((resolve) => {
      const env = {
        ...process.env,
        ...this.config.env,
        // Ensure we get clean JSON output
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      };

      const proc: ChildProcess = spawn(this.config.binaryPath, args, {
        cwd: request.workspacePath,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Close stdin immediately to signal no more input
      // This is required for Claude CLI to start processing
      proc.stdin?.end();

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Set up timeout handler
      const timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        // Give it a moment to terminate gracefully, then force kill
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      // Buffer stdout
      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      // Buffer stderr
      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Handle process errors (e.g., binary not found)
      proc.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        logger.error({ error: error.message }, 'Claude Code process error');

        resolve({
          success: false,
          exitCode: 1,
          stdout,
          stderr: stderr || error.message,
          structuredOutput: null,
          sessionId: null,
          tokensUsed: null,
          durationMs,
        });
      });

      // Handle process exit
      proc.on('close', (exitCode: number | null, signal: string | null) => {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        if (timedOut) {
          logger.warn({ timeout, durationMs }, 'Claude Code execution timed out');

          resolve({
            success: false,
            exitCode: 124, // Standard timeout exit code
            stdout,
            stderr: stderr || `Execution timed out after ${timeout}ms`,
            structuredOutput: null,
            sessionId: null,
            tokensUsed: null,
            durationMs,
          });
          return;
        }

        if (signal) {
          logger.warn({ signal }, 'Claude Code process was killed');

          resolve({
            success: false,
            exitCode: exitCode ?? 137,
            stdout,
            stderr: stderr || `Process killed with signal ${signal}`,
            structuredOutput: null,
            sessionId: null,
            tokensUsed: null,
            durationMs,
          });
          return;
        }

        const structuredOutput = parseOutput(stdout);
        const actualExitCode = exitCode ?? 1;

        logger.info(
          {
            exitCode: actualExitCode,
            durationMs,
            hasOutput: !!structuredOutput,
          },
          'Claude Code execution completed'
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
        });
      });
    });
  }
}

/**
 * Creates a new Claude Code driver instance
 */
export function createClaudeCodeDriver(
  config?: ClaudeCodeDriverConfig
): ClaudeCodeDriver {
  return new ClaudeCodeDriver(config);
}
