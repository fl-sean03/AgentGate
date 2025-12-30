/**
 * L1 Test command verification.
 * Runs test commands defined in the gate plan.
 */

import { execa, type Options as ExecaOptions } from 'execa';
import { VerificationLevel, type GatePlan, type LevelResult, type CheckResult, type CommandResult } from '../types/index.js';
import type { VerifyContext, ExecutionResult } from './types.js';
import { runInCleanRoom } from './clean-room.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('l1-tests');

/**
 * Run L1 test verification.
 * Executes all test commands from the gate plan.
 * @param ctx - Verification context
 * @returns L1 verification result
 */
export async function verifyL1(ctx: VerifyContext): Promise<LevelResult> {
  const startTime = Date.now();
  const checks: CheckResult[] = [];
  const { gatePlan, workDir, cleanRoom } = ctx;

  log.debug({ workDir, testCount: gatePlan.tests.length }, 'Starting L1 test verification');

  // Run setup commands first
  if (gatePlan.environment.setupCommands.length > 0 && !cleanRoom) {
    log.debug('Running setup commands');
    for (const setupCmd of gatePlan.environment.setupCommands) {
      const setupResult = await runCommand(
        workDir,
        setupCmd.command,
        setupCmd.timeout * 1000,
        cleanRoom,
        ctx
      );

      if (setupResult.exitCode !== setupCmd.expectedExit) {
        checks.push({
          name: `setup:${setupCmd.name}`,
          passed: false,
          message: `Setup command failed: ${setupCmd.name}`,
          details: `Exit code: ${setupResult.exitCode}, expected: ${setupCmd.expectedExit}\n${setupResult.stderr}`,
        });

        // Setup failure stops all tests
        return {
          level: VerificationLevel.L1,
          passed: false,
          checks,
          duration: Date.now() - startTime,
        };
      }

      checks.push({
        name: `setup:${setupCmd.name}`,
        passed: true,
        message: `Setup completed: ${setupCmd.name}`,
        details: null,
      });
    }
  }

  // Run test commands
  for (const test of gatePlan.tests) {
    const timeoutMs = test.timeout * 1000;
    const result = await runCommand(workDir, test.command, timeoutMs, cleanRoom, ctx);

    const passed = result.exitCode === test.expectedExit && !result.timedOut;

    if (!passed) {
      let message: string;
      let details: string;

      if (result.timedOut) {
        message = `Test timed out after ${test.timeout}s: ${test.name}`;
        details = `Command: ${test.command}`;
        ctx.diagnostics.push({
          level: VerificationLevel.L1,
          type: 'timeout',
          message,
          details: result.stderr || result.stdout,
        });
      } else {
        message = `Test failed: ${test.name}`;
        details = `Exit code: ${result.exitCode}, expected: ${test.expectedExit}\n${result.stderr || result.stdout}`;
        ctx.diagnostics.push({
          level: VerificationLevel.L1,
          type: 'test_failure',
          message,
          details: result.stderr || result.stdout,
        });
      }

      checks.push({
        name: test.name,
        passed: false,
        message,
        details,
      });
    } else {
      checks.push({
        name: test.name,
        passed: true,
        message: `Test passed: ${test.name}`,
        details: null,
      });
    }
  }

  const duration = Date.now() - startTime;
  const passed = checks.every((c) => c.passed);

  const result: LevelResult = {
    level: VerificationLevel.L1,
    passed,
    checks,
    duration,
  };

  log.info(
    {
      passed,
      passedCount: checks.filter((c) => c.passed).length,
      failedCount: checks.filter((c) => !c.passed).length,
      duration,
    },
    'L1 verification complete'
  );

  return result;
}

/**
 * Run a command and return the result.
 */
async function runCommand(
  workDir: string,
  command: string,
  timeoutMs: number,
  cleanRoom: VerifyContext['cleanRoom'],
  ctx: VerifyContext
): Promise<ExecutionResult> {
  const startTime = Date.now();

  log.debug({ command, timeoutMs }, 'Running test command');

  try {
    if (cleanRoom) {
      // Use clean-room execution
      const result = await runInCleanRoom(cleanRoom, command, {
        timeout: timeoutMs,
        cwd: cleanRoom.workDir,
      });

      return {
        command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: Date.now() - startTime,
        timedOut: result.timedOut,
      };
    } else {
      // Direct execution
      const execOptions: ExecaOptions = {
        cwd: workDir,
        timeout: timeoutMs,
        shell: true,
        reject: false,
        all: true,
        env: {
          ...process.env,
          CI: 'true',
          AGENTGATE: 'true',
        },
      };

      const result = await execa(command, execOptions);

      return {
        command,
        exitCode: result.exitCode ?? 1,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        durationMs: Date.now() - startTime,
        timedOut: result.timedOut ?? false,
      };
    }
  } catch (error) {
    log.error({ command, error }, 'Command execution failed');

    return {
      command,
      exitCode: 1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
      timedOut: false,
    };
  }
}
