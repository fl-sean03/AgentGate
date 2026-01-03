/**
 * Log Parser Module
 *
 * Parses GitHub Actions workflow logs to extract:
 * - Step boundaries and content
 * - Error messages and locations
 * - Failure patterns (test, lint, typecheck, build)
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('log-parser');

// ============================================================================
// Types
// ============================================================================

/** Parsed step information */
export interface ParsedStep {
  name: string;
  startLine: number;
  endLine: number;
  content: string;
  status: 'success' | 'failure' | 'skipped';
  exitCode: number | null;
  duration: string | null;
}

/** Parsed log structure */
export interface ParsedLog {
  steps: ParsedStep[];
  totalLines: number;
  duration: number | null;
}

/** Error category */
export type ErrorCategory = 'test' | 'lint' | 'typecheck' | 'build' | 'runtime' | 'security' | 'other';

/** Parsed error information */
export interface ParsedError {
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
  code: string | null;
  category: ErrorCategory;
  context: string | null;
}

/** Failed step with errors */
export interface FailedStep {
  step: ParsedStep;
  errors: ParsedError[];
}

// ============================================================================
// Patterns
// ============================================================================

/** GitHub Actions log patterns */
const PATTERNS = {
  /** Step group start: ##[group]Step Name */
  GROUP_START: /^##\[group\](.+)$/,
  /** Step group end: ##[endgroup] */
  GROUP_END: /^##\[endgroup\]$/,
  /** Error marker: ##[error]message */
  ERROR_MARKER: /^##\[error\](.+)$/,
  /** Exit code: Process completed with exit code N. */
  EXIT_CODE: /Process completed with exit code (\d+)\./,
  /** Timestamp: 2024-01-01T00:00:00.0000000Z */
  TIMESTAMP: /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)/,
};

/** Error detection patterns */
const ERROR_PATTERNS = {
  /** Vitest/Jest test failure */
  VITEST_FAIL: /^\s*FAIL\s+(.+?)(?:\s+>\s+.+)?$/,
  /** Vitest test name with path */
  VITEST_TEST: /^\s*FAIL\s+(.+?)\s+>\s+(.+)$/,
  /** Vitest error location */
  VITEST_LOCATION: /^\s*❯\s+(.+?):(\d+):(\d+)$/,
  /** TypeScript error (parenthesis format): file.ts(10,5): error TS2322: message */
  TS_ERROR_PAREN: /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/,
  /** TypeScript error (colon format): file.ts:10:5 - error TS2322: message */
  TS_ERROR_COLON: /^(.+?):(\d+):(\d+)\s*-\s*error\s+(TS\d+):\s*(.+)$/,
  /** ESLint error: 10:5 error message rule-name */
  ESLINT_ERROR: /^\s*(\d+):(\d+)\s+error\s+(.+?)\s{2,}(.+)$/,
  /** ESLint file header: /path/to/file.ts */
  ESLINT_FILE: /^(\/[^\s]+\.(?:ts|tsx|js|jsx|mjs|cjs))$/,
  /** Build error: error: message, Error: message, or "error during build:" */
  BUILD_ERROR: /^(?:error|Error)(?:\s*:\s*|\s+during\s+build:\s*)(.*)?$/i,
  /** GitHub error marker content */
  GH_ERROR: /^##\[error\](.+)$/,
  /** Assertion error */
  ASSERTION_ERROR: /^(?:Assertion)?Error:\s*(.+)$/,
  /** Dependency Review vulnerability */
  DEPENDENCY_VULN: /(?:vulnerability|vulnerable|CVE-\d{4}-\d+|GHSA-[a-z0-9-]+)/i,
  /** Security/dependency failure indicators */
  SECURITY_FAIL: /(?:fail-on-severity|security\s+advisory|vulnerable\s+versions?|patched\s+versions?)/i,
  /** pnpm/npm audit failure */
  AUDIT_FAIL: /^\s*(\d+)\s+(?:vulnerabilities?|moderate|high|critical)/i,
};

// ============================================================================
// Log Parser
// ============================================================================

/**
 * Parser for GitHub Actions workflow logs
 */
export class LogParser {
  /**
   * Parse raw log content into structured form
   */
  parse(logContent: string): ParsedLog {
    const lines = logContent.split('\n');
    const steps: ParsedStep[] = [];
    let currentStep: Partial<ParsedStep> | null = null;
    let currentContent: string[] = [];
    let startLine = 1;

    // Track timestamps for duration calculation
    let firstTimestamp: Date | null = null;
    let lastTimestamp: Date | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const lineNumber = i + 1;

      // Extract timestamp if present
      const timestampMatch = PATTERNS.TIMESTAMP.exec(line);
      if (timestampMatch?.[1]) {
        const timestamp = new Date(timestampMatch[1]);
        if (!firstTimestamp) firstTimestamp = timestamp;
        lastTimestamp = timestamp;
      }

      // Check for step start
      const groupStart = PATTERNS.GROUP_START.exec(line);
      if (groupStart) {
        // Close previous step if exists
        if (currentStep) {
          this.finalizeStep(currentStep, currentContent, startLine, lineNumber - 1, steps);
        }

        currentStep = {
          name: groupStart[1]?.trim() ?? '',
          status: 'success',
          exitCode: null,
          duration: null,
        };
        currentContent = [];
        startLine = lineNumber;
        continue;
      }

      // Check for step end
      if (PATTERNS.GROUP_END.test(line)) {
        if (currentStep) {
          this.finalizeStep(currentStep, currentContent, startLine, lineNumber, steps);
          currentStep = null;
          currentContent = [];
        }
        continue;
      }

      // Accumulate content for current step
      if (currentStep) {
        currentContent.push(line);

        // Check for exit code
        const exitMatch = PATTERNS.EXIT_CODE.exec(line);
        if (exitMatch?.[1]) {
          currentStep.exitCode = parseInt(exitMatch[1], 10);
          if (currentStep.exitCode !== 0) {
            currentStep.status = 'failure';
          }
        }

        // Check for error marker
        if (PATTERNS.ERROR_MARKER.test(line)) {
          currentStep.status = 'failure';
        }
      }
    }

    // Handle unclosed step
    if (currentStep) {
      this.finalizeStep(currentStep, currentContent, startLine, lines.length, steps);
    }

    // Calculate duration
    let duration: number | null = null;
    if (firstTimestamp && lastTimestamp) {
      duration = lastTimestamp.getTime() - firstTimestamp.getTime();
    }

    return {
      steps,
      totalLines: lines.length,
      duration,
    };
  }

  /**
   * Find all failed steps with extracted errors
   */
  findFailures(parsedLog: ParsedLog): FailedStep[] {
    const failures: FailedStep[] = [];

    for (const step of parsedLog.steps) {
      if (step.status === 'failure') {
        const errors = this.extractErrors(step.content);
        failures.push({ step, errors });
      }
    }

    return failures;
  }

  /**
   * Extract context lines around a specific line number
   */
  extractErrorContext(logContent: string, errorLine: number, contextLines: number): string {
    const lines = logContent.split('\n');
    const start = Math.max(0, errorLine - contextLines - 1);
    const end = Math.min(lines.length, errorLine + contextLines);

    return lines.slice(start, end).join('\n');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private finalizeStep(
    step: Partial<ParsedStep>,
    content: string[],
    startLine: number,
    endLine: number,
    steps: ParsedStep[]
  ): void {
    const finalStep: ParsedStep = {
      name: step.name ?? 'Unknown',
      startLine,
      endLine,
      content: content.join('\n'),
      status: step.status ?? 'success',
      exitCode: step.exitCode ?? null,
      duration: step.duration ?? null,
    };

    steps.push(finalStep);
  }

  private extractErrors(content: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = content.split('\n');
    let currentFile: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';

      // Check for TypeScript errors (parenthesis format)
      const tsParenMatch = ERROR_PATTERNS.TS_ERROR_PAREN.exec(line);
      if (tsParenMatch) {
        errors.push({
          message: tsParenMatch[5] ?? '',
          file: tsParenMatch[1] ?? null,
          line: parseInt(tsParenMatch[2] ?? '0', 10),
          column: parseInt(tsParenMatch[3] ?? '0', 10),
          code: tsParenMatch[4] ?? null,
          category: 'typecheck',
          context: this.getLineContext(lines, i, 2),
        });
        continue;
      }

      // Check for TypeScript errors (colon format)
      const tsColonMatch = ERROR_PATTERNS.TS_ERROR_COLON.exec(line);
      if (tsColonMatch) {
        errors.push({
          message: tsColonMatch[5] ?? '',
          file: tsColonMatch[1] ?? null,
          line: parseInt(tsColonMatch[2] ?? '0', 10),
          column: parseInt(tsColonMatch[3] ?? '0', 10),
          code: tsColonMatch[4] ?? null,
          category: 'typecheck',
          context: this.getLineContext(lines, i, 2),
        });
        continue;
      }

      // Check for ESLint file header
      const eslintFileMatch = ERROR_PATTERNS.ESLINT_FILE.exec(line);
      if (eslintFileMatch) {
        currentFile = eslintFileMatch[1] ?? null;
        continue;
      }

      // Check for ESLint errors
      const eslintMatch = ERROR_PATTERNS.ESLINT_ERROR.exec(line);
      if (eslintMatch && currentFile) {
        errors.push({
          message: eslintMatch[3] ?? '',
          file: currentFile,
          line: parseInt(eslintMatch[1] ?? '0', 10),
          column: parseInt(eslintMatch[2] ?? '0', 10),
          code: eslintMatch[4] ?? null,
          category: 'lint',
          context: null,
        });
        continue;
      }

      // Check for Vitest test failures
      const vitestMatch = ERROR_PATTERNS.VITEST_TEST.exec(line);
      if (vitestMatch) {
        // Look ahead for location info
        let errorFile: string | null = vitestMatch[1] ?? null;
        let errorLine: number | null = null;
        let errorColumn: number | null = null;

        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const locationMatch = ERROR_PATTERNS.VITEST_LOCATION.exec(lines[j] ?? '');
          if (locationMatch) {
            errorFile = locationMatch[1] ?? null;
            errorLine = parseInt(locationMatch[2] ?? '0', 10);
            errorColumn = parseInt(locationMatch[3] ?? '0', 10);
            break;
          }
        }

        errors.push({
          message: `Test failed: ${vitestMatch[2] ?? ''}`,
          file: errorFile,
          line: errorLine,
          column: errorColumn,
          code: null,
          category: 'test',
          context: this.getLineContext(lines, i, 5),
        });
        continue;
      }

      // Check for simple FAIL line (vitest)
      const simpleFail = ERROR_PATTERNS.VITEST_FAIL.exec(line);
      if (simpleFail && !vitestMatch) {
        errors.push({
          message: `Test file failed: ${simpleFail[1] ?? ''}`,
          file: simpleFail[1] ?? null,
          line: null,
          column: null,
          code: null,
          category: 'test',
          context: this.getLineContext(lines, i, 3),
        });
        continue;
      }

      // Check for build errors
      const buildMatch = ERROR_PATTERNS.BUILD_ERROR.exec(line);
      if (buildMatch) {
        // If message is empty, use the next line as context
        let message = buildMatch[1]?.trim() ?? '';
        if (!message && i + 1 < lines.length) {
          message = lines[i + 1]?.trim() ?? '';
        }
        errors.push({
          message: message || 'Build failed',
          file: null,
          line: null,
          column: null,
          code: null,
          category: 'build',
          context: this.getLineContext(lines, i, 3),
        });
        continue;
      }

      // Check for security/dependency vulnerabilities
      if (ERROR_PATTERNS.DEPENDENCY_VULN.test(line) || ERROR_PATTERNS.SECURITY_FAIL.test(line)) {
        errors.push({
          message: line.trim(),
          file: null,
          line: null,
          column: null,
          code: null,
          category: 'security',
          context: this.getLineContext(lines, i, 3),
        });
        continue;
      }

      // Check for audit failures (pnpm audit, npm audit)
      const auditMatch = ERROR_PATTERNS.AUDIT_FAIL.exec(line);
      if (auditMatch) {
        errors.push({
          message: `Security audit found ${auditMatch[1]} vulnerabilities`,
          file: null,
          line: null,
          column: null,
          code: null,
          category: 'security',
          context: this.getLineContext(lines, i, 5),
        });
        continue;
      }

      // Check for GitHub error markers
      const ghErrorMatch = ERROR_PATTERNS.GH_ERROR.exec(line);
      if (ghErrorMatch) {
        // Check if this is a security-related error
        const errorContent = ghErrorMatch[1] ?? '';
        const isSecurityError = ERROR_PATTERNS.DEPENDENCY_VULN.test(errorContent) ||
                                ERROR_PATTERNS.SECURITY_FAIL.test(errorContent);
        errors.push({
          message: errorContent,
          file: null,
          line: null,
          column: null,
          code: null,
          category: isSecurityError ? 'security' : 'other',
          context: null,
        });
        continue;
      }
    }

    // If no specific errors found but step failed, add generic error
    if (errors.length === 0 && content.includes('exit code')) {
      const exitMatch = PATTERNS.EXIT_CODE.exec(content);
      if (exitMatch && exitMatch[1] !== '0') {
        errors.push({
          message: `Step failed with exit code ${exitMatch[1]}`,
          file: null,
          line: null,
          column: null,
          code: null,
          category: 'other',
          context: this.getLastLines(content, 10),
        });
      }
    }

    logger.debug({ errorCount: errors.length }, 'Extracted errors from step');
    return errors;
  }

  private getLineContext(lines: string[], index: number, contextSize: number): string {
    const start = Math.max(0, index - contextSize);
    const end = Math.min(lines.length, index + contextSize + 1);
    return lines.slice(start, end).join('\n');
  }

  private getLastLines(content: string, count: number): string {
    const lines = content.split('\n');
    return lines.slice(-count).join('\n');
  }
}
