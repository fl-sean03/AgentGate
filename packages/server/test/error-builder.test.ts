/**
 * ErrorBuilder Tests (v0.2.19 - Thrust 4)
 *
 * Tests for structured BuildError creation from various error sources.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ErrorBuilder } from '../src/orchestrator/error-builder.js';
import {
  BuildErrorType,
  BUILD_ERROR_DESCRIPTIONS,
  createBuildError,
  type BuildError,
  type AgentResult,
  type VerificationReport,
  VerificationLevel,
} from '../src/types/index.js';
import { setAgentGateRoot } from '../src/artifacts/paths.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';

describe('BuildErrorType', () => {
  it('should have all expected error types', () => {
    expect(BuildErrorType.AGENT_CRASH).toBe('agent_crash');
    expect(BuildErrorType.AGENT_TIMEOUT).toBe('agent_timeout');
    expect(BuildErrorType.AGENT_TASK_FAILURE).toBe('agent_task_failure');
    expect(BuildErrorType.TYPECHECK_FAILED).toBe('typecheck_failed');
    expect(BuildErrorType.LINT_FAILED).toBe('lint_failed');
    expect(BuildErrorType.TEST_FAILED).toBe('test_failed');
    expect(BuildErrorType.BLACKBOX_FAILED).toBe('blackbox_failed');
    expect(BuildErrorType.CI_FAILED).toBe('ci_failed');
    expect(BuildErrorType.WORKSPACE_ERROR).toBe('workspace_error');
    expect(BuildErrorType.SNAPSHOT_ERROR).toBe('snapshot_error');
    expect(BuildErrorType.GITHUB_ERROR).toBe('github_error');
    expect(BuildErrorType.SYSTEM_ERROR).toBe('system_error');
    expect(BuildErrorType.UNKNOWN).toBe('unknown');
  });
});

describe('BUILD_ERROR_DESCRIPTIONS', () => {
  it('should have descriptions for all error types', () => {
    for (const type of Object.values(BuildErrorType)) {
      expect(BUILD_ERROR_DESCRIPTIONS[type]).toBeDefined();
      expect(typeof BUILD_ERROR_DESCRIPTIONS[type]).toBe('string');
      expect(BUILD_ERROR_DESCRIPTIONS[type].length).toBeGreaterThan(0);
    }
  });
});

describe('createBuildError', () => {
  it('should create an error with required fields', () => {
    const error = createBuildError(
      BuildErrorType.AGENT_CRASH,
      'Agent crashed with exit code 1',
      'build'
    );

    expect(error.type).toBe(BuildErrorType.AGENT_CRASH);
    expect(error.message).toBe('Agent crashed with exit code 1');
    expect(error.failedAt).toBe('build');
  });

  it('should initialize optional fields to null', () => {
    const error = createBuildError(
      BuildErrorType.TEST_FAILED,
      'Tests failed',
      'verification'
    );

    expect(error.exitCode).toBeNull();
    expect(error.stdoutTail).toBeNull();
    expect(error.stderrTail).toBeNull();
    expect(error.agentResultFile).toBeNull();
    expect(error.verificationFile).toBeNull();
    expect(error.context).toEqual({});
  });
});

describe('ErrorBuilder', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `agentgate-test-${Date.now()}`);
    setAgentGateRoot(testRoot);
  });

  afterEach(async () => {
    try {
      await rm(testRoot, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('fromAgentResult', () => {
    it('should classify non-zero exit code as AGENT_CRASH', () => {
      const result: AgentResult = {
        success: false,
        exitCode: 1,
        stdout: 'Some output',
        stderr: 'Error: Something went wrong',
        sessionId: 'test-session',
        model: 'claude-3-opus',
        durationMs: 5000,
        tokensUsed: { input: 100, output: 50 },
        structuredOutput: null,
      };

      const error = ErrorBuilder.fromAgentResult(result, 'run-123', 1);

      expect(error.type).toBe(BuildErrorType.AGENT_CRASH);
      expect(error.exitCode).toBe(1);
      expect(error.failedAt).toBe('build');
      expect(error.context.sessionId).toBe('test-session');
      expect(error.context.model).toBe('claude-3-opus');
    });

    it('should classify timeout indicators as AGENT_TIMEOUT', () => {
      const result: AgentResult = {
        success: false,
        exitCode: 0,
        stdout: '',
        stderr: 'Process terminated due to timeout',
        sessionId: 'test-session',
        model: null,
        durationMs: 60000,
        tokensUsed: null,
        structuredOutput: null,
      };

      const error = ErrorBuilder.fromAgentResult(result, 'run-123', 1);

      expect(error.type).toBe(BuildErrorType.AGENT_TIMEOUT);
    });

    it('should classify success=false with exit=0 as AGENT_TASK_FAILURE', () => {
      const result: AgentResult = {
        success: false,
        exitCode: 0,
        stdout: 'Could not complete task',
        stderr: '',
        sessionId: 'test-session',
        model: null,
        durationMs: 5000,
        tokensUsed: null,
        structuredOutput: null,
      };

      const error = ErrorBuilder.fromAgentResult(result, 'run-123', 1);

      expect(error.type).toBe(BuildErrorType.AGENT_TASK_FAILURE);
    });

    it('should include stdout and stderr tail', () => {
      const longOutput = 'Line\n'.repeat(100);
      const result: AgentResult = {
        success: false,
        exitCode: 1,
        stdout: longOutput,
        stderr: 'Error on line 1\nError on line 2',
        sessionId: 'test-session',
        model: null,
        durationMs: 5000,
        tokensUsed: null,
        structuredOutput: null,
      };

      const error = ErrorBuilder.fromAgentResult(result, 'run-123', 1);

      expect(error.stdoutTail).not.toBeNull();
      expect(error.stderrTail).toBe('Error on line 1\nError on line 2');
    });

    it('should set agent result file path', () => {
      const result: AgentResult = {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Error',
        sessionId: 'test-session',
        model: null,
        durationMs: 5000,
        tokensUsed: null,
        structuredOutput: null,
      };

      const error = ErrorBuilder.fromAgentResult(result, 'run-123', 2);

      expect(error.agentResultFile).toContain('agent-2.json');
    });

    it('should extract error message from stderr', () => {
      const result: AgentResult = {
        success: false,
        exitCode: 1,
        stdout: 'Normal output',
        stderr: 'Error: Module not found',
        sessionId: 'test-session',
        model: null,
        durationMs: 5000,
        tokensUsed: null,
        structuredOutput: null,
      };

      const error = ErrorBuilder.fromAgentResult(result, 'run-123', 1);

      expect(error.message).toContain('Module not found');
    });
  });

  describe('fromVerificationReport', () => {
    const createBaseReport = (overrides: Partial<VerificationReport> = {}): VerificationReport => ({
      id: 'verify-123',
      snapshotId: 'snap-123',
      runId: 'run-123',
      iteration: 1,
      passed: false,
      l0Result: {
        level: VerificationLevel.L0,
        passed: true,
        checks: [],
        duration: 100,
      },
      l1Result: {
        level: VerificationLevel.L1,
        passed: true,
        checks: [],
        duration: 100,
      },
      l2Result: {
        level: VerificationLevel.L2,
        passed: true,
        checks: [],
        duration: 100,
      },
      l3Result: {
        level: VerificationLevel.L3,
        passed: true,
        checks: [],
        duration: 100,
      },
      logs: '',
      diagnostics: [],
      totalDuration: 400,
      createdAt: new Date(),
      ...overrides,
    });

    it('should classify L0 typecheck failure', () => {
      const report = createBaseReport({
        l0Result: {
          level: VerificationLevel.L0,
          passed: false,
          checks: [
            { name: 'typecheck', passed: false, message: 'Type error', details: null },
          ],
          duration: 100,
        },
      });

      const error = ErrorBuilder.fromVerificationReport(report, 'run-123', 1);

      expect(error.type).toBe(BuildErrorType.TYPECHECK_FAILED);
      expect(error.failedAt).toBe('verification');
    });

    it('should classify L0 lint failure', () => {
      const report = createBaseReport({
        l0Result: {
          level: VerificationLevel.L0,
          passed: false,
          checks: [
            { name: 'eslint', passed: false, message: 'Lint error', details: null },
          ],
          duration: 100,
        },
      });

      const error = ErrorBuilder.fromVerificationReport(report, 'run-123', 1);

      expect(error.type).toBe(BuildErrorType.LINT_FAILED);
    });

    it('should classify L1 test failure', () => {
      const report = createBaseReport({
        l1Result: {
          level: VerificationLevel.L1,
          passed: false,
          checks: [
            { name: 'unit-tests', passed: false, message: '3 tests failed', details: null },
          ],
          duration: 5000,
        },
      });

      const error = ErrorBuilder.fromVerificationReport(report, 'run-123', 1);

      expect(error.type).toBe(BuildErrorType.TEST_FAILED);
    });

    it('should classify L2 blackbox failure', () => {
      const report = createBaseReport({
        l2Result: {
          level: VerificationLevel.L2,
          passed: false,
          checks: [
            { name: 'blackbox-test', passed: false, message: 'Assertion failed', details: null },
          ],
          duration: 2000,
        },
      });

      const error = ErrorBuilder.fromVerificationReport(report, 'run-123', 1);

      expect(error.type).toBe(BuildErrorType.BLACKBOX_FAILED);
    });

    it('should classify L3 CI failure', () => {
      const report = createBaseReport({
        l3Result: {
          level: VerificationLevel.L3,
          passed: false,
          checks: [
            { name: 'ci-checks', passed: false, message: 'CI pipeline failed', details: null },
          ],
          duration: 3000,
        },
      });

      const error = ErrorBuilder.fromVerificationReport(report, 'run-123', 1);

      expect(error.type).toBe(BuildErrorType.CI_FAILED);
    });

    it('should set verification file path', () => {
      const report = createBaseReport({
        l1Result: {
          level: VerificationLevel.L1,
          passed: false,
          checks: [{ name: 'tests', passed: false, message: 'Failed', details: null }],
          duration: 100,
        },
      });

      const error = ErrorBuilder.fromVerificationReport(report, 'run-123', 3);

      expect(error.verificationFile).toContain('verification-3.json');
    });

    it('should include failed levels in context', () => {
      const report = createBaseReport({
        l0Result: {
          level: VerificationLevel.L0,
          passed: false,
          checks: [{ name: 'typecheck', passed: false, message: 'Error', details: null }],
          duration: 100,
        },
        l1Result: {
          level: VerificationLevel.L1,
          passed: false,
          checks: [{ name: 'tests', passed: false, message: 'Error', details: null }],
          duration: 100,
        },
      });

      const error = ErrorBuilder.fromVerificationReport(report, 'run-123', 1);

      expect(error.context.failedLevels).toContain('L0');
      expect(error.context.failedLevels).toContain('L1');
    });

    it('should include diagnostics in context', () => {
      const report = createBaseReport({
        diagnostics: [
          { level: VerificationLevel.L1, type: 'test-failure', message: 'Test 1 failed', file: 'test.ts', line: 10, column: 5 },
          { level: VerificationLevel.L1, type: 'test-failure', message: 'Test 2 failed', file: 'test.ts', line: 20, column: 5 },
        ],
        l1Result: {
          level: VerificationLevel.L1,
          passed: false,
          checks: [{ name: 'tests', passed: false, message: 'Failed', details: null }],
          duration: 100,
        },
      });

      const error = ErrorBuilder.fromVerificationReport(report, 'run-123', 1);

      expect(error.context.diagnosticCount).toBe(2);
      expect(error.context.topDiagnostics).toHaveLength(2);
    });
  });

  describe('fromSystemError', () => {
    it('should classify workspace errors', () => {
      const err = new Error('Failed to create workspace directory');

      const error = ErrorBuilder.fromSystemError(err, { runId: 'run-123' });

      expect(error.type).toBe(BuildErrorType.WORKSPACE_ERROR);
      expect(error.message).toContain('workspace');
    });

    it('should classify snapshot errors', () => {
      const err = new Error('Git snapshot failed');

      const error = ErrorBuilder.fromSystemError(err, { runId: 'run-123' });

      expect(error.type).toBe(BuildErrorType.SNAPSHOT_ERROR);
    });

    it('should classify GitHub errors', () => {
      const err = new Error('GitHub API rate limit exceeded');

      const error = ErrorBuilder.fromSystemError(err, { runId: 'run-123' });

      expect(error.type).toBe(BuildErrorType.GITHUB_ERROR);
    });

    it('should classify unknown errors as SYSTEM_ERROR', () => {
      const err = new Error('Something unexpected happened');

      const error = ErrorBuilder.fromSystemError(err, { runId: 'run-123' });

      expect(error.type).toBe(BuildErrorType.SYSTEM_ERROR);
    });

    it('should handle non-Error objects', () => {
      const error = ErrorBuilder.fromSystemError('String error', { phase: 'build' });

      expect(error.type).toBe(BuildErrorType.SYSTEM_ERROR);
      expect(error.message).toBe('String error');
    });

    it('should include context in error', () => {
      const err = new Error('Test error');

      const error = ErrorBuilder.fromSystemError(err, {
        runId: 'run-123',
        iteration: 2,
        phase: 'verification',
        customData: 'test',
      });

      expect(error.context.runId).toBe('run-123');
      expect(error.context.iteration).toBe(2);
      expect(error.context.phase).toBe('verification');
      expect(error.context.customData).toBe('test');
      expect(error.context.errorName).toBe('Error');
      expect(error.context.stack).toBeDefined();
    });

    it('should set failedAt from phase context', () => {
      const err = new Error('Error during snapshot');

      const error = ErrorBuilder.fromSystemError(err, { phase: 'snapshot' });

      expect(error.failedAt).toBe('snapshot');
    });

    it('should default failedAt to unknown', () => {
      const err = new Error('Random error');

      const error = ErrorBuilder.fromSystemError(err, {});

      expect(error.failedAt).toBe('unknown');
    });
  });
});
