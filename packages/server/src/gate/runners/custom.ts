/**
 * Custom Command Gate Runner (v0.2.24)
 *
 * Runs arbitrary shell commands as gate checks.
 *
 * @module gate/runners/custom
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import { spawn } from 'node:child_process';
import type {
  GateResult,
  GateFailure,
  CustomCommandCheck,
} from '../../types/index.js';
import type { GateContext, ValidationResult, CustomCommandDetails } from '../runner-types.js';
import { BaseGateRunner } from '../base-runner.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('custom-gate-runner');

/**
 * Result from command execution
 */
interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Gate runner for custom shell commands
 */
export class CustomCommandGateRunner extends BaseGateRunner {
  readonly name = 'custom';
  readonly type = 'custom' as const;

  /**
   * Run custom command gate check
   */
  async run(context: GateContext): Promise<GateResult> {
    const startTime = Date.now();
    const gateName = context.currentGate || 'custom';

    // Get check configuration
    const gate = context.taskSpec.spec.convergence.gates.find(
      (g) => g.name === gateName
    );
    if (!gate || gate.check.type !== 'custom') {
      return this.failedResult(
        gateName,
        { error: 'Gate configuration not found' },
        [{ message: 'Gate configuration not found or invalid type' }],
        Date.now() - startTime
      );
    }

    const check = gate.check as CustomCommandCheck;
    const command = check.command;
    const expectedExit = check.expectedExit ?? 0;
    const timeoutMs = this.parseTimeout(check.timeout || '5m');

    log.info(
      { gateName, command, expectedExit, timeoutMs },
      'Running custom command gate'
    );

    try {
      // Execute the command
      const result = await this.executeCommand(
        command,
        context.workspacePath,
        timeoutMs
      );

      const duration = Date.now() - startTime;

      // Build details
      const details: CustomCommandDetails = {
        type: 'custom',
        command,
        exitCode: result.exitCode,
        stdout: this.truncateOutput(result.stdout),
        stderr: this.truncateOutput(result.stderr),
      };

      // Check exit code
      if (result.timedOut) {
        const timeoutFailure: GateFailure = {
          message: `Command timed out after ${timeoutMs}ms`,
          command,
        };
        if (result.stderr || result.stdout) {
          timeoutFailure.details = result.stderr || result.stdout;
        }
        return this.failedResult(
          gateName,
          details as unknown as Record<string, unknown>,
          [timeoutFailure],
          duration
        );
      }

      if (result.exitCode === expectedExit) {
        return this.passedResult(gateName, details as unknown as Record<string, unknown>, duration);
      }

      // Command failed
      const failure: GateFailure = {
        message: `Command exited with code ${result.exitCode} (expected ${expectedExit})`,
        command,
      };
      if (result.stderr || result.stdout) {
        failure.details = result.stderr || result.stdout;
      }

      return this.failedResult(gateName, details as unknown as Record<string, unknown>, [failure], duration);
    } catch (error) {
      log.error({ error, gateName }, 'Custom command gate failed with error');
      return this.failedResult(
        gateName,
        { error: error instanceof Error ? error.message : String(error) },
        [{
          message: `Command execution error: ${error instanceof Error ? error.message : String(error)}`,
          command,
        }],
        Date.now() - startTime
      );
    }
  }

  /**
   * Execute a shell command
   */
  private executeCommand(
    command: string,
    cwd: string,
    timeout: number
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let timedOut = false;

      // Use shell execution
      const child = spawn(command, {
        shell: true,
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // Force kill after grace period
        setTimeout(() => child.kill('SIGKILL'), 5000);
      }, timeout);

      // Collect stdout
      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      // Collect stderr
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      // Handle completion
      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        resolve({
          exitCode: code ?? 1,
          stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderr: Buffer.concat(stderrChunks).toString('utf-8'),
          timedOut,
        });
      });

      // Handle errors
      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        resolve({
          exitCode: 1,
          stdout: '',
          stderr: error.message,
          timedOut: false,
        });
      });
    });
  }

  /**
   * Truncate output to reasonable length
   */
  private truncateOutput(output: string, maxLength = 10000): string {
    if (output.length <= maxLength) {
      return output;
    }
    return output.slice(0, maxLength) + '\n... (truncated)';
  }

  /**
   * Validate custom command gate configuration
   */
  validate(config: CustomCommandCheck): ValidationResult {
    if (config.type !== 'custom') {
      return { valid: false, error: 'Invalid check type' };
    }

    if (!config.command || typeof config.command !== 'string') {
      return { valid: false, error: 'Command is required and must be a string' };
    }

    if (config.command.trim().length === 0) {
      return { valid: false, error: 'Command cannot be empty' };
    }

    return { valid: true };
  }

  /**
   * Generate suggestions for custom command failures
   */
  protected generateSuggestions(result: GateResult): string[] {
    const suggestions = [
      'Review the command output for specific errors',
      'Ensure the command works in your local environment',
    ];

    // Check if there's stderr output
    const details = result.details as CustomCommandDetails | undefined;
    if (details?.stderr) {
      suggestions.push('Check stderr output for error details');
    }

    return suggestions;
  }
}

/**
 * Create a custom command gate runner instance
 */
export function createCustomCommandGateRunner(): CustomCommandGateRunner {
  return new CustomCommandGateRunner();
}
