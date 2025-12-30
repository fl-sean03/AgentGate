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
 * Claude Code CLI driver implementation
 */
export class ClaudeCodeDriver implements AgentDriver {
  readonly name = 'claude-code';
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
   */
  async execute(request: AgentRequest): Promise<AgentResult> {
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
      let killed = false;

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
          killed = true;
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
