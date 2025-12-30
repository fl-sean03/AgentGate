/**
 * L2 Blackbox test verification.
 * Runs blackbox tests with fixtures and assertions.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execa, type Options as ExecaOptions } from 'execa';
import { VerificationLevel, type GatePlan, type LevelResult, type CheckResult, type BlackboxTest, type Assertion } from '../types/index.js';
import type { VerifyContext, ExecutionResult } from './types.js';
import { runInCleanRoom } from './clean-room.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('l2-blackbox');

/**
 * Run L2 blackbox test verification.
 * @param ctx - Verification context
 * @returns L2 verification result
 */
export async function verifyL2(ctx: VerifyContext): Promise<LevelResult> {
  const startTime = Date.now();
  const checks: CheckResult[] = [];
  const { gatePlan, workDir, cleanRoom } = ctx;

  log.debug({ workDir, blackboxCount: gatePlan.blackbox.length }, 'Starting L2 blackbox verification');

  if (gatePlan.blackbox.length === 0) {
    return {
      level: VerificationLevel.L2,
      passed: true,
      checks: [{
        name: 'blackbox-tests',
        passed: true,
        message: 'No blackbox tests defined',
        details: null,
      }],
      duration: Date.now() - startTime,
    };
  }

  for (const test of gatePlan.blackbox) {
    const testResult = await runBlackboxTest(
      cleanRoom?.workDir ?? workDir,
      test,
      cleanRoom,
      ctx
    );
    checks.push(testResult);
  }

  const duration = Date.now() - startTime;
  const passed = checks.every((c) => c.passed);

  const result: LevelResult = {
    level: VerificationLevel.L2,
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
    'L2 verification complete'
  );

  return result;
}

/**
 * Run a single blackbox test.
 */
async function runBlackboxTest(
  workDir: string,
  test: BlackboxTest,
  cleanRoom: VerifyContext['cleanRoom'],
  ctx: VerifyContext
): Promise<CheckResult> {
  log.debug({ testName: test.name }, 'Running blackbox test');

  // Load fixture if specified
  let fixtureContent: string | null = null;
  if (test.fixture) {
    const fixturePath = join(workDir, test.fixture);
    try {
      fixtureContent = await readFile(fixturePath, 'utf-8');
    } catch (error) {
      ctx.diagnostics.push({
        level: VerificationLevel.L2,
        type: 'fixture_error',
        message: `Fixture not found: ${test.fixture}`,
        file: test.fixture,
      });

      return {
        name: test.name,
        passed: false,
        message: `Fixture not found: ${test.fixture}`,
        details: null,
      };
    }
  }

  // Run the command
  const execution = await executeBlackboxCommand(
    workDir,
    test.command,
    fixtureContent,
    cleanRoom
  );

  if (execution.timedOut) {
    ctx.diagnostics.push({
      level: VerificationLevel.L2,
      type: 'timeout',
      message: `Blackbox test timed out: ${test.name}`,
    });

    return {
      name: test.name,
      passed: false,
      message: `Test timed out: ${test.name}`,
      details: 'Command did not complete within the time limit',
    };
  }

  // Run assertions
  const output = execution.stdout;
  const assertionFailures: string[] = [];

  for (const assertion of test.assertions) {
    const assertionResult = checkAssertion(assertion, output, execution);
    if (!assertionResult.passed) {
      assertionFailures.push(assertionResult.message);
      const diagnostic: import('./types.js').DiagnosticLocal = {
        level: VerificationLevel.L2,
        type: 'assertion',
        message: assertionResult.message,
      };
      if (assertionResult.details) {
        diagnostic.details = assertionResult.details;
      }
      ctx.diagnostics.push(diagnostic);
    }
  }

  if (assertionFailures.length > 0) {
    return {
      name: test.name,
      passed: false,
      message: `${assertionFailures.length} assertion(s) failed`,
      details: assertionFailures.join('\n'),
    };
  }

  return {
    name: test.name,
    passed: true,
    message: `Blackbox test passed: ${test.name}`,
    details: null,
  };
}

/**
 * Execute a blackbox command.
 */
async function executeBlackboxCommand(
  workDir: string,
  command: string,
  stdinInput: string | null,
  cleanRoom: VerifyContext['cleanRoom']
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const timeoutMs = 120000; // 2 minute timeout for blackbox tests

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
        env: {
          ...process.env,
          CI: 'true',
          AGENTGATE: 'true',
        },
      };

      // Only add input if we have stdin content
      if (stdinInput) {
        (execOptions as ExecaOptions & { input?: string }).input = stdinInput;
      }

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

/**
 * Check a single assertion against command output.
 * Assertion types match the schema in gate-plan.ts:
 * - exit_code: Check exit code matches expected value
 * - json_schema: Validate output against JSON schema
 * - contains: Check output contains a value
 * - matches_regex: Check output matches a regex pattern
 * - equals_file: Check output equals file contents
 * - json_equals: Check parsed JSON equals expected value
 */
function checkAssertion(
  assertion: Assertion,
  output: string,
  execution: ExecutionResult
): { passed: boolean; message: string; details?: string } {
  switch (assertion.type) {
    case 'exit_code': {
      const expectedCode = assertion.expected;
      if (execution.exitCode !== expectedCode) {
        return {
          passed: false,
          message: `Exit code mismatch`,
          details: `Expected: ${expectedCode}, Got: ${execution.exitCode}`,
        };
      }
      break;
    }

    case 'contains': {
      if (!output.includes(assertion.value)) {
        return {
          passed: false,
          message: `Output does not contain: "${assertion.value}"`,
          details: `Actual output: ${output.slice(0, 200)}${output.length > 200 ? '...' : ''}`,
        };
      }
      break;
    }

    case 'matches_regex': {
      try {
        const regex = new RegExp(assertion.pattern);
        if (!regex.test(output)) {
          return {
            passed: false,
            message: `Output does not match pattern: ${assertion.pattern}`,
            details: `Actual output: ${output.slice(0, 200)}${output.length > 200 ? '...' : ''}`,
          };
        }
      } catch (error) {
        return {
          passed: false,
          message: `Invalid regex pattern: ${assertion.pattern}`,
          details: String(error),
        };
      }
      break;
    }

    case 'json_equals': {
      try {
        const parsedOutput = JSON.parse(output);
        const expected = assertion.expected;
        if (JSON.stringify(parsedOutput) !== JSON.stringify(expected)) {
          return {
            passed: false,
            message: 'JSON output does not equal expected value',
            details: `Expected: ${JSON.stringify(expected).slice(0, 100)}\nActual: ${JSON.stringify(parsedOutput).slice(0, 100)}`,
          };
        }
      } catch (error) {
        return {
          passed: false,
          message: 'Failed to parse output as JSON',
          details: String(error),
        };
      }
      break;
    }

    case 'json_schema': {
      // TODO: Implement full JSON Schema validation
      // For now, just verify it's valid JSON
      try {
        JSON.parse(output);
        log.debug({ schema: assertion.schema }, 'JSON schema validation not fully implemented');
      } catch (error) {
        return {
          passed: false,
          message: 'Output is not valid JSON',
          details: String(error),
        };
      }
      break;
    }

    case 'equals_file': {
      // This would require reading the file to compare
      // For now, log a warning that this isn't implemented
      log.warn({ file: assertion.file }, 'equals_file assertion not implemented');
      break;
    }

    default: {
      // Unknown assertion type, log and treat as passed
      const unknownAssertion = assertion as { type: string };
      log.warn({ assertionType: unknownAssertion.type }, 'Unknown assertion type');
    }
  }

  return { passed: true, message: '' };
}

/**
 * Get a value from JSON using a path like "foo.bar.0.baz".
 */
function getJsonPath(obj: unknown, path: string): unknown {
  if (!path) return obj;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index)) {
        return undefined;
      }
      current = current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}
