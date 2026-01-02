/**
 * Error Builder (v0.2.19 - Thrust 4)
 *
 * Provides static methods for creating structured BuildError objects
 * from various error sources (agent results, verification reports, system errors).
 */

import {
  type BuildError,
  type AgentResult,
  type VerificationReport,
  BuildErrorType,
  createBuildError,
} from '../types/index.js';
import { getRunDir } from '../artifacts/paths.js';
import { join } from 'node:path';

/** Number of lines to include in stdout/stderr tail */
const TAIL_LINES = 50;

/**
 * ErrorBuilder provides static methods for creating structured BuildError objects.
 */
export class ErrorBuilder {
  /**
   * Create a BuildError from an AgentResult.
   *
   * @param result - The agent result to analyze
   * @param runId - The run ID for file path construction
   * @param iteration - The iteration number
   * @returns A structured BuildError
   */
  static fromAgentResult(
    result: AgentResult,
    runId: string,
    iteration: number
  ): BuildError {
    const errorType = this.classifyAgentError(result);
    const message = this.extractAgentErrorMessage(result, errorType);

    const error = createBuildError(errorType, message, 'build');

    error.exitCode = result.exitCode;
    error.stdoutTail = this.getTail(result.stdout, TAIL_LINES);
    error.stderrTail = this.getTail(result.stderr, TAIL_LINES);
    error.agentResultFile = join(getRunDir(runId), `agent-${iteration}.json`);

    error.context = {
      sessionId: result.sessionId,
      model: result.model,
      durationMs: result.durationMs,
      tokensUsed: result.tokensUsed,
      success: result.success,
    };

    return error;
  }

  /**
   * Create a BuildError from a VerificationReport.
   *
   * @param report - The verification report to analyze
   * @param runId - The run ID for file path construction
   * @param iteration - The iteration number
   * @returns A structured BuildError
   */
  static fromVerificationReport(
    report: VerificationReport,
    runId: string,
    iteration: number
  ): BuildError {
    const errorType = this.classifyVerificationError(report);
    const message = this.extractVerificationErrorMessage(report, errorType);

    const error = createBuildError(errorType, message, 'verification');

    error.verificationFile = join(getRunDir(runId), `verification-${iteration}.json`);

    // Include details about which levels failed
    const failedLevels: string[] = [];
    if (report.l0Result && !report.l0Result.passed) failedLevels.push('L0');
    if (report.l1Result && !report.l1Result.passed) failedLevels.push('L1');
    if (report.l2Result && !report.l2Result.passed) failedLevels.push('L2');
    if (report.l3Result && !report.l3Result.passed) failedLevels.push('L3');

    error.context = {
      snapshotId: report.snapshotId,
      iteration: report.iteration,
      totalDuration: report.totalDuration,
      failedLevels,
      diagnosticCount: report.diagnostics?.length ?? 0,
    };

    // Extract first few diagnostics for quick reference
    if (report.diagnostics && report.diagnostics.length > 0) {
      error.context.topDiagnostics = report.diagnostics.slice(0, 5).map((d) => ({
        level: d.level,
        type: d.type,
        message: d.message,
        file: d.file,
      }));
    }

    return error;
  }

  /**
   * Create a BuildError from a system error.
   *
   * @param error - The error that occurred
   * @param context - Additional context about where the error occurred
   * @returns A structured BuildError
   */
  static fromSystemError(
    error: Error | unknown,
    context: { runId?: string; iteration?: number; phase?: string; [key: string]: unknown }
  ): BuildError {
    const errorType = this.classifySystemError(error);
    const message = error instanceof Error ? error.message : String(error);

    const buildError = createBuildError(
      errorType,
      message,
      context.phase ?? 'unknown'
    );

    buildError.context = {
      ...context,
      errorName: error instanceof Error ? error.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
    };

    return buildError;
  }

  /**
   * Classify an agent error based on the result.
   */
  private static classifyAgentError(result: AgentResult): BuildErrorType {
    // Non-zero exit code indicates crash
    if (result.exitCode !== 0) {
      return BuildErrorType.AGENT_CRASH;
    }

    // Check for timeout indicators in output
    if (
      result.stderr?.includes('timeout') ||
      result.stderr?.includes('SIGTERM') ||
      result.stdout?.includes('timeout')
    ) {
      return BuildErrorType.AGENT_TIMEOUT;
    }

    // If success is false but exit code is 0, task failure
    if (!result.success) {
      return BuildErrorType.AGENT_TASK_FAILURE;
    }

    return BuildErrorType.UNKNOWN;
  }

  /**
   * Extract a meaningful error message from an agent result.
   */
  private static extractAgentErrorMessage(
    result: AgentResult,
    errorType: BuildErrorType
  ): string {
    // Check stderr for error messages
    if (result.stderr && result.stderr.length > 0) {
      const lastLine = this.getLastMeaningfulLine(result.stderr);
      if (lastLine) {
        return `${this.getErrorTypePrefix(errorType)}: ${lastLine}`;
      }
    }

    // Check stdout for error indicators
    if (result.stdout) {
      const errorLine = this.findErrorLine(result.stdout);
      if (errorLine) {
        return `${this.getErrorTypePrefix(errorType)}: ${errorLine}`;
      }
    }

    // Default messages based on type
    switch (errorType) {
      case BuildErrorType.AGENT_CRASH:
        return `Agent crashed with exit code ${result.exitCode}`;
      case BuildErrorType.AGENT_TIMEOUT:
        return 'Agent execution timed out';
      case BuildErrorType.AGENT_TASK_FAILURE:
        return 'Agent failed to complete the task';
      default:
        return 'Agent execution failed';
    }
  }

  /**
   * Classify a verification error based on the report.
   */
  private static classifyVerificationError(report: VerificationReport): BuildErrorType {
    // Check levels in order of specificity
    if (report.l0Result && !report.l0Result.passed) {
      // L0 is contracts - could be typecheck or lint
      const failedChecks = report.l0Result.checks.filter((c) => !c.passed);
      for (const check of failedChecks) {
        const name = check.name.toLowerCase();
        if (name.includes('type') || name.includes('tsc')) {
          return BuildErrorType.TYPECHECK_FAILED;
        }
        if (name.includes('lint') || name.includes('eslint')) {
          return BuildErrorType.LINT_FAILED;
        }
      }
    }

    if (report.l1Result && !report.l1Result.passed) {
      return BuildErrorType.TEST_FAILED;
    }

    if (report.l2Result && !report.l2Result.passed) {
      return BuildErrorType.BLACKBOX_FAILED;
    }

    if (report.l3Result && !report.l3Result.passed) {
      // L3 is CI-related checks
      return BuildErrorType.CI_FAILED;
    }

    return BuildErrorType.UNKNOWN;
  }

  /**
   * Extract a meaningful error message from a verification report.
   */
  private static extractVerificationErrorMessage(
    report: VerificationReport,
    errorType: BuildErrorType
  ): string {
    // Find the first failed check and use its message
    const allChecks = [
      ...(report.l0Result?.checks ?? []),
      ...(report.l1Result?.checks ?? []),
      ...(report.l2Result?.checks ?? []),
      ...(report.l3Result?.checks ?? []),
    ];

    const failedCheck = allChecks.find((c) => !c.passed);
    if (failedCheck?.message) {
      return `${this.getErrorTypePrefix(errorType)}: ${failedCheck.message}`;
    }

    // Use first diagnostic if available
    if (report.diagnostics && report.diagnostics.length > 0) {
      const firstDiag = report.diagnostics[0];
      if (firstDiag) {
        return `${this.getErrorTypePrefix(errorType)}: ${firstDiag.message}`;
      }
    }

    // Default messages
    switch (errorType) {
      case BuildErrorType.TYPECHECK_FAILED:
        return 'TypeScript type checking failed';
      case BuildErrorType.LINT_FAILED:
        return 'Code linting failed';
      case BuildErrorType.TEST_FAILED:
        return 'One or more tests failed';
      case BuildErrorType.BLACKBOX_FAILED:
        return 'Blackbox tests failed';
      case BuildErrorType.CI_FAILED:
        return 'CI checks failed';
      default:
        return 'Verification failed';
    }
  }

  /**
   * Classify a system error.
   */
  private static classifySystemError(error: Error | unknown): BuildErrorType {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const name = error instanceof Error ? error.name.toLowerCase() : '';

    if (message.includes('workspace') || message.includes('directory')) {
      return BuildErrorType.WORKSPACE_ERROR;
    }

    if (message.includes('snapshot') || message.includes('git')) {
      return BuildErrorType.SNAPSHOT_ERROR;
    }

    if (message.includes('github') || message.includes('octokit') || name.includes('github')) {
      return BuildErrorType.GITHUB_ERROR;
    }

    return BuildErrorType.SYSTEM_ERROR;
  }

  /**
   * Get a prefix string for the error type.
   */
  private static getErrorTypePrefix(type: BuildErrorType): string {
    switch (type) {
      case BuildErrorType.AGENT_CRASH:
        return 'Agent crash';
      case BuildErrorType.AGENT_TIMEOUT:
        return 'Timeout';
      case BuildErrorType.AGENT_TASK_FAILURE:
        return 'Task failure';
      case BuildErrorType.TYPECHECK_FAILED:
        return 'Type error';
      case BuildErrorType.LINT_FAILED:
        return 'Lint error';
      case BuildErrorType.TEST_FAILED:
        return 'Test failure';
      case BuildErrorType.BLACKBOX_FAILED:
        return 'Blackbox failure';
      case BuildErrorType.CI_FAILED:
        return 'CI failure';
      case BuildErrorType.WORKSPACE_ERROR:
        return 'Workspace error';
      case BuildErrorType.SNAPSHOT_ERROR:
        return 'Snapshot error';
      case BuildErrorType.GITHUB_ERROR:
        return 'GitHub error';
      case BuildErrorType.SYSTEM_ERROR:
        return 'System error';
      default:
        return 'Error';
    }
  }

  /**
   * Get the last N lines of a string.
   */
  private static getTail(text: string | null | undefined, lines: number): string | null {
    if (!text) return null;
    const allLines = text.split('\n');
    if (allLines.length <= lines) return text;
    return allLines.slice(-lines).join('\n');
  }

  /**
   * Get the last meaningful (non-empty) line from text.
   */
  private static getLastMeaningfulLine(text: string): string | null {
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;
    const lastLineRaw = lines[lines.length - 1];
    if (!lastLineRaw) return null;
    const lastLine = lastLineRaw.trim();
    // Limit length
    return lastLine.length > 200 ? lastLine.substring(0, 200) + '...' : lastLine;
  }

  /**
   * Find an error-related line in text.
   */
  private static findErrorLine(text: string): string | null {
    const lines = text.split('\n');
    const errorKeywords = ['error', 'failed', 'exception', 'fatal'];

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (errorKeywords.some((kw) => lower.includes(kw))) {
        const trimmed = line.trim();
        return trimmed.length > 200 ? trimmed.substring(0, 200) + '...' : trimmed;
      }
    }

    return null;
  }
}
