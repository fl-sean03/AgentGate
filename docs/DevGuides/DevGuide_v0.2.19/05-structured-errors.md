# 05: Thrust 4 - Structured Error Types

## Overview

Replace generic error strings like "Build failed" with structured, typed errors that include classification, context, and references to diagnostic files.

---

## Current State

### Error Handling Today

**Location:** `packages/server/src/orchestrator/run-executor.ts:407-414`

```typescript
if (!buildResult.success) {
  log.warn({ runId, iteration, error: buildResult.error }, 'Build failed');
  run = applyTransition(run, RunEvent.BUILD_FAILED);
  run.result = RunResult.FAILED_BUILD;
  run.error = buildResult.error ?? 'Build failed';  // GENERIC STRING
  await saveRun(run);
  break;
}
```

### Problems

1. **No classification** - All failures are just "Build failed"
2. **No context** - Can't distinguish agent crash from test failure
3. **No references** - Don't know where to find more info
4. **No actionability** - User doesn't know what to investigate

### Current Error Examples

```
"Build failed"
"Verification failed"
"Agent execution failed"
```

None of these tell us:
- What specific step failed
- Why it failed
- Where to find the full output
- What to try next

---

## Target State

### BuildErrorType Enum

**Location:** `packages/server/src/types/build-error.ts`

```typescript
/**
 * Classification of build/execution errors.
 */
export enum BuildErrorType {
  // Agent execution errors
  AGENT_CRASH = 'agent_crash',              // Agent process died unexpectedly
  AGENT_TIMEOUT = 'agent_timeout',          // Agent exceeded time limit
  AGENT_TASK_FAILURE = 'agent_task_failure', // Agent reported it couldn't complete

  // Verification errors
  TYPECHECK_FAILED = 'typecheck_failed',    // TypeScript compilation failed
  LINT_FAILED = 'lint_failed',              // Linting failed
  TEST_FAILED = 'test_failed',              // Tests failed
  BLACKBOX_FAILED = 'blackbox_failed',      // Blackbox tests failed
  CI_FAILED = 'ci_failed',                  // CI checks failed

  // System errors
  WORKSPACE_ERROR = 'workspace_error',      // Workspace setup failed
  SNAPSHOT_ERROR = 'snapshot_error',        // Snapshot creation failed
  GITHUB_ERROR = 'github_error',            // GitHub operation failed
  SYSTEM_ERROR = 'system_error',            // Other infrastructure error

  // Unknown
  UNKNOWN = 'unknown',                      // Couldn't classify
}
```

### BuildError Interface

```typescript
/**
 * Structured error with classification and context.
 */
export interface BuildError {
  /** Error classification */
  type: BuildErrorType;

  /** Human-readable summary */
  message: string;

  /** Exit code if applicable */
  exitCode: number | null;

  /** Last N lines of stdout (for quick diagnosis) */
  stdoutTail: string;

  /** Last N lines of stderr (for quick diagnosis) */
  stderrTail: string;

  /** Reference to full agent output file */
  agentResultFile: string | null;

  /** Reference to verification report file */
  verificationFile: string | null;

  /** Additional context */
  context: Record<string, unknown>;

  /** Timestamp of failure */
  failedAt: string;
}

/**
 * Configuration for error construction.
 */
export interface BuildErrorOptions {
  /** Max lines of stdout/stderr to include */
  tailLines?: number;
}

export const DEFAULT_ERROR_OPTIONS: BuildErrorOptions = {
  tailLines: 50,
};
```

### Example Structured Error

```json
{
  "type": "typecheck_failed",
  "message": "TypeScript compilation failed with 3 errors in 2 files",
  "exitCode": 1,
  "stdoutTail": "...(last 50 lines)...",
  "stderrTail": "src/foo.ts(45,3): error TS2304: Cannot find name 'bar'\nsrc/foo.ts(67,5): error TS2339: Property 'baz' does not exist",
  "agentResultFile": "agent-1.json",
  "verificationFile": "verification-1.json",
  "context": {
    "errorCount": 3,
    "fileCount": 2,
    "files": ["src/foo.ts", "src/bar.ts"]
  },
  "failedAt": "2026-01-02T15:35:30.000Z"
}
```

---

## Implementation

### Step 1: Create Type Definitions

**File:** `packages/server/src/types/build-error.ts`

```typescript
/**
 * Classification of build/execution errors.
 */
export enum BuildErrorType {
  // Agent execution errors
  AGENT_CRASH = 'agent_crash',
  AGENT_TIMEOUT = 'agent_timeout',
  AGENT_TASK_FAILURE = 'agent_task_failure',

  // Verification errors
  TYPECHECK_FAILED = 'typecheck_failed',
  LINT_FAILED = 'lint_failed',
  TEST_FAILED = 'test_failed',
  BLACKBOX_FAILED = 'blackbox_failed',
  CI_FAILED = 'ci_failed',

  // System errors
  WORKSPACE_ERROR = 'workspace_error',
  SNAPSHOT_ERROR = 'snapshot_error',
  GITHUB_ERROR = 'github_error',
  SYSTEM_ERROR = 'system_error',

  // Unknown
  UNKNOWN = 'unknown',
}

/**
 * Human-readable descriptions for error types.
 */
export const BUILD_ERROR_DESCRIPTIONS: Record<BuildErrorType, string> = {
  [BuildErrorType.AGENT_CRASH]: 'Agent process crashed unexpectedly',
  [BuildErrorType.AGENT_TIMEOUT]: 'Agent exceeded maximum execution time',
  [BuildErrorType.AGENT_TASK_FAILURE]: 'Agent reported inability to complete task',
  [BuildErrorType.TYPECHECK_FAILED]: 'TypeScript compilation failed',
  [BuildErrorType.LINT_FAILED]: 'Code linting failed',
  [BuildErrorType.TEST_FAILED]: 'Test execution failed',
  [BuildErrorType.BLACKBOX_FAILED]: 'Blackbox verification failed',
  [BuildErrorType.CI_FAILED]: 'CI pipeline checks failed',
  [BuildErrorType.WORKSPACE_ERROR]: 'Workspace setup or operation failed',
  [BuildErrorType.SNAPSHOT_ERROR]: 'Snapshot creation or restoration failed',
  [BuildErrorType.GITHUB_ERROR]: 'GitHub API operation failed',
  [BuildErrorType.SYSTEM_ERROR]: 'Internal system error occurred',
  [BuildErrorType.UNKNOWN]: 'Unknown error occurred',
};

/**
 * Structured error with classification and context.
 */
export interface BuildError {
  type: BuildErrorType;
  message: string;
  exitCode: number | null;
  stdoutTail: string;
  stderrTail: string;
  agentResultFile: string | null;
  verificationFile: string | null;
  context: Record<string, unknown>;
  failedAt: string;
}

export interface BuildErrorOptions {
  tailLines?: number;
}

export const DEFAULT_ERROR_OPTIONS: BuildErrorOptions = {
  tailLines: 50,
};
```

### Step 2: Create Error Builder

**File:** `packages/server/src/orchestrator/error-builder.ts`

```typescript
import {
  BuildError,
  BuildErrorType,
  BuildErrorOptions,
  DEFAULT_ERROR_OPTIONS,
  BUILD_ERROR_DESCRIPTIONS,
} from '../types/build-error.js';
import { AgentResult } from '../types/agent.js';
import { VerificationReport } from '../verifier/types.js';

/**
 * Builds structured errors from various failure scenarios.
 */
export class ErrorBuilder {
  private options: Required<BuildErrorOptions>;

  constructor(options: BuildErrorOptions = {}) {
    this.options = { ...DEFAULT_ERROR_OPTIONS, ...options } as Required<BuildErrorOptions>;
  }

  /**
   * Build error from agent failure.
   */
  fromAgentResult(
    result: AgentResult,
    agentResultFile: string
  ): BuildError {
    const type = this.classifyAgentError(result);

    return {
      type,
      message: this.buildAgentErrorMessage(result, type),
      exitCode: result.exitCode,
      stdoutTail: this.tail(result.stdout),
      stderrTail: this.tail(result.stderr),
      agentResultFile,
      verificationFile: null,
      context: this.extractAgentContext(result),
      failedAt: new Date().toISOString(),
    };
  }

  /**
   * Build error from verification failure.
   */
  fromVerificationReport(
    report: VerificationReport,
    verificationFile: string,
    agentResultFile?: string
  ): BuildError {
    const type = this.classifyVerificationError(report);
    const failedCheck = this.findFirstFailedCheck(report);

    return {
      type,
      message: this.buildVerificationErrorMessage(report, type),
      exitCode: null,
      stdoutTail: failedCheck?.output ? this.tail(failedCheck.output) : '',
      stderrTail: '',
      agentResultFile: agentResultFile ?? null,
      verificationFile,
      context: this.extractVerificationContext(report),
      failedAt: new Date().toISOString(),
    };
  }

  /**
   * Build error from system failure.
   */
  fromSystemError(
    error: Error,
    type: BuildErrorType = BuildErrorType.SYSTEM_ERROR
  ): BuildError {
    return {
      type,
      message: error.message,
      exitCode: null,
      stdoutTail: '',
      stderrTail: error.stack ?? '',
      agentResultFile: null,
      verificationFile: null,
      context: {
        errorName: error.name,
        errorStack: error.stack,
      },
      failedAt: new Date().toISOString(),
    };
  }

  private classifyAgentError(result: AgentResult): BuildErrorType {
    // Timeout (usually exit code 137 = SIGKILL)
    if (result.exitCode === 137) {
      return BuildErrorType.AGENT_TIMEOUT;
    }

    // Crash (non-zero exit, no structured output)
    if (result.exitCode !== 0 && !result.structuredOutput) {
      return BuildErrorType.AGENT_CRASH;
    }

    // Task failure (agent reported failure)
    if (!result.success) {
      return BuildErrorType.AGENT_TASK_FAILURE;
    }

    return BuildErrorType.UNKNOWN;
  }

  private classifyVerificationError(report: VerificationReport): BuildErrorType {
    for (const [level, result] of Object.entries(report.levels)) {
      if (result && !result.passed) {
        for (const check of result.checks) {
          if (!check.passed) {
            switch (check.name) {
              case 'typecheck':
                return BuildErrorType.TYPECHECK_FAILED;
              case 'lint':
              case 'eslint':
                return BuildErrorType.LINT_FAILED;
              case 'test':
              case 'vitest':
              case 'jest':
                return BuildErrorType.TEST_FAILED;
              case 'blackbox':
                return BuildErrorType.BLACKBOX_FAILED;
              case 'ci':
                return BuildErrorType.CI_FAILED;
            }
          }
        }
      }
    }
    return BuildErrorType.UNKNOWN;
  }

  private buildAgentErrorMessage(result: AgentResult, type: BuildErrorType): string {
    const base = BUILD_ERROR_DESCRIPTIONS[type];

    switch (type) {
      case BuildErrorType.AGENT_TIMEOUT:
        return `${base} after ${Math.round(result.durationMs / 1000)}s`;
      case BuildErrorType.AGENT_CRASH:
        return `${base} with exit code ${result.exitCode}`;
      case BuildErrorType.AGENT_TASK_FAILURE:
        // Extract first line of stderr as context
        const firstLine = result.stderr.split('\n')[0] || '';
        return firstLine ? `${base}: ${firstLine}` : base;
      default:
        return base;
    }
  }

  private buildVerificationErrorMessage(
    report: VerificationReport,
    type: BuildErrorType
  ): string {
    const base = BUILD_ERROR_DESCRIPTIONS[type];
    const context = this.extractVerificationContext(report);

    if (context.errorCount) {
      return `${base} (${context.errorCount} errors in ${context.fileCount} files)`;
    }

    return base;
  }

  private extractAgentContext(result: AgentResult): Record<string, unknown> {
    return {
      sessionId: result.sessionId,
      model: result.model,
      durationMs: result.durationMs,
      tokensUsed: result.tokensUsed,
      toolCallCount: result.toolCalls?.length ?? 0,
    };
  }

  private extractVerificationContext(report: VerificationReport): Record<string, unknown> {
    const failedCheck = this.findFirstFailedCheck(report);
    const context: Record<string, unknown> = {
      duration: report.duration,
    };

    if (failedCheck?.output) {
      // Try to extract error count from TypeScript output
      const tsErrors = failedCheck.output.match(/error TS\d+/g);
      if (tsErrors) {
        context.errorCount = tsErrors.length;
        context.fileCount = new Set(
          failedCheck.output.match(/^\S+\.tsx?/gm) ?? []
        ).size;
      }

      // Try to extract test failure count
      const testFails = failedCheck.output.match(/(\d+) failed/);
      if (testFails) {
        context.failedTests = parseInt(testFails[1], 10);
      }
    }

    return context;
  }

  private findFirstFailedCheck(report: VerificationReport) {
    for (const levelResult of Object.values(report.levels)) {
      if (levelResult && !levelResult.passed) {
        for (const check of levelResult.checks) {
          if (!check.passed) {
            return check;
          }
        }
      }
    }
    return null;
  }

  private tail(text: string): string {
    const lines = text.split('\n');
    if (lines.length <= this.options.tailLines) {
      return text;
    }
    return lines.slice(-this.options.tailLines).join('\n');
  }
}

// Singleton instance
export const errorBuilder = new ErrorBuilder();
```

### Step 3: Integrate with RunExecutor

**File:** `packages/server/src/orchestrator/run-executor.ts`

```typescript
import { errorBuilder } from './error-builder.js';
import { BuildError } from '../types/build-error.js';

// Update run type to include structured error
interface RunWithError extends Run {
  error?: string;
  buildError?: BuildError;
}

// After agent failure:
if (!buildResult.success) {
  const buildError = errorBuilder.fromAgentResult(
    agentResult,
    agentResultFile
  );

  run = applyTransition(run, RunEvent.BUILD_FAILED);
  run.result = RunResult.FAILED_BUILD;
  run.error = buildError.message;  // Keep string for backwards compat
  (run as RunWithError).buildError = buildError;  // Add structured error

  await saveRun(run);
  break;
}

// After verification failure:
if (!verificationReport.overall.passed) {
  const buildError = errorBuilder.fromVerificationReport(
    verificationReport,
    verificationFile,
    agentResultFile
  );

  // Include in feedback or final error
  run.buildError = buildError;
}
```

---

## Testing

### Unit Tests

**File:** `packages/server/test/error-builder.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { errorBuilder } from '../src/orchestrator/error-builder.js';
import { BuildErrorType } from '../src/types/build-error.js';

describe('ErrorBuilder', () => {
  describe('fromAgentResult', () => {
    it('should classify timeout errors', () => {
      const result = {
        success: false,
        exitCode: 137,
        stdout: '',
        stderr: 'Killed',
        durationMs: 300000,
        sessionId: 'test',
        model: null,
        tokensUsed: null,
        structuredOutput: null,
      };

      const error = errorBuilder.fromAgentResult(result, 'agent-1.json');

      expect(error.type).toBe(BuildErrorType.AGENT_TIMEOUT);
      expect(error.message).toContain('300s');
      expect(error.agentResultFile).toBe('agent-1.json');
    });

    it('should classify crash errors', () => {
      const result = {
        success: false,
        exitCode: 1,
        stdout: 'Starting...',
        stderr: 'Segmentation fault',
        durationMs: 5000,
        sessionId: 'test',
        model: null,
        tokensUsed: null,
        structuredOutput: null,
      };

      const error = errorBuilder.fromAgentResult(result, 'agent-1.json');

      expect(error.type).toBe(BuildErrorType.AGENT_CRASH);
      expect(error.exitCode).toBe(1);
    });

    it('should include context from agent result', () => {
      const result = {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Error occurred',
        durationMs: 5000,
        sessionId: 'session-123',
        model: 'claude-3-opus',
        tokensUsed: { input: 1000, output: 500, total: 1500 },
        structuredOutput: null,
        toolCalls: [{ tool: 'Write', input: {}, output: 'ok', durationMs: 100 }],
      };

      const error = errorBuilder.fromAgentResult(result, 'agent-1.json');

      expect(error.context.sessionId).toBe('session-123');
      expect(error.context.model).toBe('claude-3-opus');
      expect(error.context.toolCallCount).toBe(1);
    });
  });

  describe('fromVerificationReport', () => {
    it('should classify typecheck errors', () => {
      const report = {
        runId: 'run-1',
        iteration: 1,
        overall: { passed: false, summary: 'L0 failed' },
        levels: {
          L0: {
            level: 'L0',
            passed: false,
            checks: [
              {
                name: 'typecheck',
                passed: false,
                output: "src/foo.ts(1,1): error TS2304: Cannot find name 'x'",
                duration: 5000,
              },
            ],
            duration: 5000,
          },
        },
        duration: 5000,
        completedAt: new Date(),
      };

      const error = errorBuilder.fromVerificationReport(report, 'verification-1.json');

      expect(error.type).toBe(BuildErrorType.TYPECHECK_FAILED);
      expect(error.verificationFile).toBe('verification-1.json');
      expect(error.context.errorCount).toBe(1);
    });

    it('should classify test errors', () => {
      const report = {
        runId: 'run-1',
        iteration: 1,
        overall: { passed: false, summary: 'L1 failed' },
        levels: {
          L0: { level: 'L0', passed: true, checks: [], duration: 1000 },
          L1: {
            level: 'L1',
            passed: false,
            checks: [
              {
                name: 'test',
                passed: false,
                output: '3 failed, 10 passed',
                duration: 10000,
              },
            ],
            duration: 10000,
          },
        },
        duration: 11000,
        completedAt: new Date(),
      };

      const error = errorBuilder.fromVerificationReport(report, 'verification-1.json');

      expect(error.type).toBe(BuildErrorType.TEST_FAILED);
      expect(error.context.failedTests).toBe(3);
    });
  });

  describe('fromSystemError', () => {
    it('should create system error with stack trace', () => {
      const error = new Error('Connection refused');
      error.stack = 'Error: Connection refused\n    at connect()';

      const buildError = errorBuilder.fromSystemError(error);

      expect(buildError.type).toBe(BuildErrorType.SYSTEM_ERROR);
      expect(buildError.message).toBe('Connection refused');
      expect(buildError.stderrTail).toContain('at connect()');
    });
  });
});
```

---

## Verification Checklist

- [ ] `BuildErrorType` enum defined with all error types
- [ ] `BUILD_ERROR_DESCRIPTIONS` provides human-readable messages
- [ ] `BuildError` interface captures all diagnostic info
- [ ] `ErrorBuilder` class created with classification logic
- [ ] `fromAgentResult` classifies agent errors correctly
- [ ] `fromVerificationReport` classifies verification errors correctly
- [ ] `fromSystemError` handles infrastructure errors
- [ ] Error messages include specific context (counts, durations)
- [ ] RunExecutor uses ErrorBuilder for all failures
- [ ] Run type includes optional `buildError` field
- [ ] Backwards compatibility maintained (string `error` still present)
- [ ] Unit tests pass for ErrorBuilder

---

## Benefits

1. **Quick diagnosis** - Error type tells you where to look
2. **Context included** - Error counts, file names, durations
3. **File references** - Know exactly which files have details
4. **Actionable errors** - Clear next steps for investigation
5. **Machine-readable** - Easy to aggregate and analyze errors
