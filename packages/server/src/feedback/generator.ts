import {
  VerificationLevel,
  FailureType,
  type VerificationReport,
  type LevelResult,
  type StructuredFeedback,
  type Failure,
  type FileReference,
} from '../types/index.js';
import { generateSuggestions } from './suggestions.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('feedback-generator');

export function generateFeedback(
  report: VerificationReport,
  iteration: number
): StructuredFeedback {
  const failedLevel = findFirstFailedLevel(report);
  const failures = extractFailures(report, failedLevel);
  const fileReferences = extractFileReferences(failures);
  const suggestions = generateSuggestions(failures);
  const summary = generateSummary(report, failedLevel, failures);

  const feedback: StructuredFeedback = {
    iteration,
    overallStatus: 'failed',
    summary,
    failedLevel,
    failures,
    suggestions,
    fileReferences,
  };

  log.info(
    { iteration, failedLevel, failureCount: failures.length },
    'Generated feedback'
  );

  return feedback;
}

function findFirstFailedLevel(report: VerificationReport): VerificationLevel {
  if (!report.l0Result.passed) return VerificationLevel.L0;
  if (!report.l1Result.passed) return VerificationLevel.L1;
  if (!report.l2Result.passed) return VerificationLevel.L2;
  return VerificationLevel.L3;
}

function extractFailures(
  report: VerificationReport,
  failedLevel: VerificationLevel
): Failure[] {
  const failures: Failure[] = [];

  const levelResult = getLevelResult(report, failedLevel);

  for (const check of levelResult.checks) {
    if (check.passed) continue;

    const failure = parseCheckToFailure(check, failedLevel);
    failures.push(failure);
  }

  // Also extract from diagnostics
  for (const diagnostic of report.diagnostics) {
    if (diagnostic.level !== failedLevel) continue;

    failures.push({
      level: diagnostic.level,
      type: mapDiagnosticType(diagnostic.type),
      message: diagnostic.message,
      details: null,
      command: null,
      exitCode: null,
      file: diagnostic.file,
      line: diagnostic.line,
      expected: null,
      actual: null,
    });
  }

  return failures.slice(0, 10); // Limit to 10 failures
}

function getLevelResult(
  report: VerificationReport,
  level: VerificationLevel
): LevelResult {
  switch (level) {
    case VerificationLevel.L0:
      return report.l0Result;
    case VerificationLevel.L1:
      return report.l1Result;
    case VerificationLevel.L2:
      return report.l2Result;
    case VerificationLevel.L3:
      return report.l3Result;
  }
}

function parseCheckToFailure(
  check: { name: string; passed: boolean; message: string | null; details: string | null },
  level: VerificationLevel
): Failure {
  const failureType = inferFailureType(check.name, check.message ?? '', level);
  const { file, line } = extractFileLocation(check.message ?? '', check.details ?? '');
  const { expected, actual } = extractExpectedActual(check.details ?? '');

  return {
    level,
    type: failureType,
    message: check.message ?? check.name,
    details: truncate(check.details, 500),
    command: extractCommand(check.name),
    exitCode: extractExitCode(check.details ?? ''),
    file,
    line,
    expected,
    actual,
  };
}

function inferFailureType(
  name: string,
  message: string,
  level: VerificationLevel
): FailureType {
  const combined = `${name} ${message}`.toLowerCase();

  if (combined.includes('missing') || combined.includes('not found')) {
    return FailureType.MISSING_FILE;
  }
  if (combined.includes('forbidden')) {
    return FailureType.FORBIDDEN_FILE;
  }
  if (combined.includes('schema') || combined.includes('validation')) {
    return FailureType.SCHEMA_VIOLATION;
  }
  if (combined.includes('timeout')) {
    return FailureType.TEST_TIMEOUT;
  }
  if (combined.includes('assertion')) {
    return FailureType.ASSERTION_FAILED;
  }

  // Default by level
  switch (level) {
    case VerificationLevel.L0:
      return FailureType.SCHEMA_VIOLATION;
    case VerificationLevel.L1:
      return FailureType.TEST_FAILED;
    case VerificationLevel.L2:
      return FailureType.ASSERTION_FAILED;
    case VerificationLevel.L3:
      return FailureType.RUNTIME_ERROR;
  }
}

function mapDiagnosticType(type: string): FailureType {
  const mapping: Record<string, FailureType> = {
    missing_file: FailureType.MISSING_FILE,
    forbidden_file: FailureType.FORBIDDEN_FILE,
    schema_error: FailureType.SCHEMA_VIOLATION,
    test_failure: FailureType.TEST_FAILED,
    timeout: FailureType.TEST_TIMEOUT,
    assertion: FailureType.ASSERTION_FAILED,
    build_error: FailureType.BUILD_ERROR,
    runtime_error: FailureType.RUNTIME_ERROR,
    resource: FailureType.RESOURCE_EXCEEDED,
  };

  return mapping[type] ?? FailureType.RUNTIME_ERROR;
}

function extractFileLocation(
  message: string,
  details: string
): { file: string | null; line: number | null } {
  const combined = `${message}\n${details}`;

  // Match patterns like "file.ts:123" or "at file.ts:123:45"
  const match = combined.match(/(?:at\s+)?([^\s:]+\.[a-z]+):(\d+)/i);

  if (match) {
    return {
      file: match[1] ?? null,
      line: parseInt(match[2] ?? '0', 10),
    };
  }

  return { file: null, line: null };
}

function extractExpectedActual(
  details: string
): { expected: string | null; actual: string | null } {
  // Match "expected X, got Y" or "Expected: X\nActual: Y"
  const match1 = details.match(/expected\s+['""]?(.+?)['""]?,?\s+(?:but\s+)?(?:got|received)\s+['""]?(.+?)['""]?(?:\s|$)/i);
  if (match1) {
    return {
      expected: truncate(match1[1], 100),
      actual: truncate(match1[2], 100),
    };
  }

  const match2 = details.match(/Expected:\s*(.+?)(?:\n|$).*?Actual:\s*(.+?)(?:\n|$)/is);
  if (match2) {
    return {
      expected: truncate(match2[1], 100),
      actual: truncate(match2[2], 100),
    };
  }

  return { expected: null, actual: null };
}

function extractCommand(name: string): string | null {
  // If name looks like a command, return it
  if (name.includes(' ') || name.includes('pnpm') || name.includes('npm')) {
    return name;
  }
  return null;
}

function extractExitCode(details: string): number | null {
  const match = details.match(/exit(?:ed with)?\s+(?:code\s+)?(\d+)/i);
  if (match) {
    return parseInt(match[1] ?? '0', 10);
  }
  return null;
}

function extractFileReferences(failures: Failure[]): FileReference[] {
  const refs: Map<string, FileReference> = new Map();

  for (const failure of failures) {
    if (!failure.file) continue;

    if (!refs.has(failure.file)) {
      refs.set(failure.file, {
        path: failure.file,
        reason: failure.message,
        suggestion: null,
      });
    }
  }

  return Array.from(refs.values()).slice(0, 5);
}

function generateSummary(
  report: VerificationReport,
  failedLevel: VerificationLevel,
  failures: Failure[]
): string {
  const failureCount = failures.length;
  const levelName = getLevelName(failedLevel);

  const parts = [
    `Verification failed at ${levelName} with ${failureCount} failure${failureCount !== 1 ? 's' : ''}.`,
  ];

  if (failures.length > 0) {
    const firstFailure = failures[0];
    if (firstFailure) {
      parts.push(`Primary issue: ${firstFailure.message}.`);
    }
  }

  if (!report.l0Result.passed) {
    parts.push('Contract checks must pass before tests can run.');
  } else if (!report.l1Result.passed) {
    parts.push('Fix the failing tests and ensure all pass before proceeding.');
  } else if (!report.l2Result.passed) {
    parts.push('Black-box tests failed. Check output format and schema compliance.');
  }

  return parts.join(' ');
}

function getLevelName(level: VerificationLevel): string {
  switch (level) {
    case VerificationLevel.L0:
      return 'L0 (Contract Checks)';
    case VerificationLevel.L1:
      return 'L1 (Test Commands)';
    case VerificationLevel.L2:
      return 'L2 (Black-box Tests)';
    case VerificationLevel.L3:
      return 'L3 (Sanity Checks)';
  }
}

function truncate(str: string | null | undefined, maxLen: number): string | null {
  if (!str) return null;
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
