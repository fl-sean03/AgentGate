import type { VerificationLevel } from './verification.js';

// Failure Type
export const FailureType = {
  MISSING_FILE: 'missing_file',
  FORBIDDEN_FILE: 'forbidden_file',
  SCHEMA_VIOLATION: 'schema_violation',
  TEST_FAILED: 'test_failed',
  TEST_TIMEOUT: 'test_timeout',
  ASSERTION_FAILED: 'assertion_failed',
  BUILD_ERROR: 'build_error',
  RUNTIME_ERROR: 'runtime_error',
  RESOURCE_EXCEEDED: 'resource_exceeded',
} as const;

export type FailureType = (typeof FailureType)[keyof typeof FailureType];

// Failure
export interface Failure {
  level: VerificationLevel;
  type: FailureType;
  message: string;
  details: string | null;
  command: string | null;
  exitCode: number | null;
  file: string | null;
  line: number | null;
  expected: string | null;
  actual: string | null;
}

// File Reference
export interface FileReference {
  path: string;
  reason: string;
  suggestion: string | null;
}

// Structured Feedback
export interface StructuredFeedback {
  iteration: number;
  overallStatus: 'failed';
  summary: string;
  failedLevel: VerificationLevel;
  failures: Failure[];
  suggestions: string[];
  fileReferences: FileReference[];
}

// Suggestion Pattern
export interface SuggestionPattern {
  pattern: RegExp;
  failureType: FailureType;
  template: string;
}
