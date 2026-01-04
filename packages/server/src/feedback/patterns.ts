/**
 * Error Pattern Database
 * Recognizes and categorizes common error patterns.
 *
 * (v0.2.27 - Thrust 17: Enhanced Feedback Generator)
 */

import { createLogger } from '../utils/logger.js';
import { FailureType } from '../types/index.js';

const log = createLogger('feedback-patterns');

/**
 * Error pattern definition
 */
export interface ErrorPattern {
  /** Pattern name */
  name: string;
  /** Regex to match */
  regex: RegExp;
  /** Failure type to assign */
  failureType: FailureType;
  /** Extract file from match */
  fileExtractor?: (match: RegExpMatchArray) => string | undefined;
  /** Extract line from match */
  lineExtractor?: (match: RegExpMatchArray) => number | undefined;
  /** Extract column from match */
  columnExtractor?: (match: RegExpMatchArray) => number | undefined;
  /** Suggested fix template */
  suggestionTemplate?: string;
  /** Is this a common pattern (affects grouping) */
  isCommon?: boolean;
}

/**
 * Matched pattern result
 */
export interface PatternMatch {
  /** Pattern that matched */
  pattern: ErrorPattern;
  /** Full match */
  match: RegExpMatchArray;
  /** Extracted file */
  file?: string;
  /** Extracted line */
  line?: number;
  /** Extracted column */
  column?: number;
  /** Generated suggestion */
  suggestion?: string;
}

/**
 * TypeScript error patterns
 */
const TS_PATTERNS: ErrorPattern[] = [
  {
    name: 'ts-type-error',
    regex: /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/m,
    failureType: FailureType.BUILD_ERROR,
    fileExtractor: (m) => m[1],
    lineExtractor: (m) => parseInt(m[2]!, 10),
    columnExtractor: (m) => parseInt(m[3]!, 10),
    suggestionTemplate: 'Fix TypeScript error {errorCode} in {file}:{line}',
    isCommon: true,
  },
  {
    name: 'ts-cannot-find-module',
    regex: /Cannot find module ['"](.+?)['"]/,
    failureType: FailureType.BUILD_ERROR,
    suggestionTemplate: "Install or create the missing module '{module}'",
    isCommon: true,
  },
  {
    name: 'ts-property-not-exist',
    regex: /Property ['"](.+?)['"] does not exist on type ['"](.+?)['"]/,
    failureType: FailureType.BUILD_ERROR,
    suggestionTemplate: "Add property '{property}' to type '{type}' or fix the access",
  },
  {
    name: 'ts-argument-type',
    regex: /Argument of type ['"](.+?)['"] is not assignable to parameter of type ['"](.+?)['"]/,
    failureType: FailureType.BUILD_ERROR,
    suggestionTemplate: 'Convert from {from} to {to} or update the function signature',
  },
];

/**
 * Test failure patterns
 */
const TEST_PATTERNS: ErrorPattern[] = [
  {
    name: 'jest-assertion',
    regex: /expect\((.+?)\)\.(\w+)\((.+?)\)/,
    failureType: FailureType.ASSERTION_FAILED,
    suggestionTemplate: 'Update the test or fix the code to match expected value',
  },
  {
    name: 'vitest-assertion',
    regex: /AssertionError: expected (.+) to (.+)/,
    failureType: FailureType.ASSERTION_FAILED,
    suggestionTemplate: 'Check the assertion: expected {actual} to {expected}',
  },
  {
    name: 'test-timeout',
    regex: /Timeout - Async callback was not invoked within (\d+)ms/,
    failureType: FailureType.TEST_TIMEOUT,
    suggestionTemplate: 'Increase timeout or fix the async operation',
  },
  {
    name: 'test-file-location',
    regex: /at (.+?):(\d+):(\d+)/,
    failureType: FailureType.TEST_FAILED,
    fileExtractor: (m) => m[1],
    lineExtractor: (m) => parseInt(m[2]!, 10),
    columnExtractor: (m) => parseInt(m[3]!, 10),
  },
];

/**
 * ESLint patterns
 */
const ESLINT_PATTERNS: ErrorPattern[] = [
  {
    name: 'eslint-error',
    regex: /^\s*(\d+):(\d+)\s+error\s+(.+?)\s+(@?[\w\/-]+)$/m,
    failureType: FailureType.LINT_ERROR,
    lineExtractor: (m) => parseInt(m[1]!, 10),
    columnExtractor: (m) => parseInt(m[2]!, 10),
    suggestionTemplate: 'Fix ESLint rule {rule}: {message}',
  },
  {
    name: 'eslint-warning',
    regex: /^\s*(\d+):(\d+)\s+warning\s+(.+?)\s+(@?[\w\/-]+)$/m,
    failureType: FailureType.WARNING,
    lineExtractor: (m) => parseInt(m[1]!, 10),
    columnExtractor: (m) => parseInt(m[2]!, 10),
  },
];

/**
 * Build tool patterns
 */
const BUILD_PATTERNS: ErrorPattern[] = [
  {
    name: 'webpack-error',
    regex: /Module build failed.*:\s*(.+)/,
    failureType: FailureType.BUILD_ERROR,
    suggestionTemplate: 'Fix the webpack build error',
  },
  {
    name: 'vite-error',
    regex: /\[vite\] (?:Internal server error|Pre-transform error): (.+)/,
    failureType: FailureType.BUILD_ERROR,
    suggestionTemplate: 'Fix the Vite build error',
  },
  {
    name: 'esbuild-error',
    regex: /✘ \[ERROR\] (.+)/,
    failureType: FailureType.BUILD_ERROR,
  },
  {
    name: 'npm-install-error',
    regex: /npm ERR! (.+)/,
    failureType: FailureType.BUILD_ERROR,
    suggestionTemplate: 'Run `npm install` or fix package.json',
  },
  {
    name: 'pnpm-error',
    regex: /ERR_PNPM_(.+)/,
    failureType: FailureType.BUILD_ERROR,
    suggestionTemplate: 'Run `pnpm install` or fix package.json',
  },
];

/**
 * Runtime error patterns
 */
const RUNTIME_PATTERNS: ErrorPattern[] = [
  {
    name: 'node-error',
    regex: /^(\w+Error): (.+)$/m,
    failureType: FailureType.RUNTIME_ERROR,
  },
  {
    name: 'stack-trace-location',
    regex: /at .+? \((.+?):(\d+):(\d+)\)/,
    failureType: FailureType.RUNTIME_ERROR,
    fileExtractor: (m) => m[1],
    lineExtractor: (m) => parseInt(m[2]!, 10),
    columnExtractor: (m) => parseInt(m[3]!, 10),
  },
  {
    name: 'segfault',
    regex: /Segmentation fault|SIGSEGV/,
    failureType: FailureType.RUNTIME_ERROR,
    suggestionTemplate: 'Check for memory corruption or invalid pointer access',
  },
];

/**
 * All patterns combined
 */
export const ALL_PATTERNS: ErrorPattern[] = [
  ...TS_PATTERNS,
  ...TEST_PATTERNS,
  ...ESLINT_PATTERNS,
  ...BUILD_PATTERNS,
  ...RUNTIME_PATTERNS,
];

/**
 * Match text against all patterns
 */
export function matchPatterns(text: string): PatternMatch[] {
  const matches: PatternMatch[] = [];

  for (const pattern of ALL_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      const result: PatternMatch = {
        pattern,
        match,
        file: pattern.fileExtractor?.(match),
        line: pattern.lineExtractor?.(match),
        column: pattern.columnExtractor?.(match),
      };

      // Generate suggestion
      if (pattern.suggestionTemplate) {
        result.suggestion = interpolateSuggestion(pattern.suggestionTemplate, result, match);
      }

      matches.push(result);
    }
  }

  return matches;
}

/**
 * Find the best matching pattern
 */
export function findBestMatch(text: string): PatternMatch | null {
  const matches = matchPatterns(text);
  if (matches.length === 0) return null;

  // Prefer patterns that extract more information
  matches.sort((a, b) => {
    const aScore = (a.file ? 2 : 0) + (a.line ? 1 : 0) + (a.suggestion ? 1 : 0);
    const bScore = (b.file ? 2 : 0) + (b.line ? 1 : 0) + (b.suggestion ? 1 : 0);
    return bScore - aScore;
  });

  return matches[0]!;
}

/**
 * Extract error code if present
 */
export function extractErrorCode(text: string): string | null {
  // TypeScript errors
  const tsMatch = text.match(/TS(\d+)/);
  if (tsMatch) return tsMatch[0];

  // ESLint rules
  const eslintMatch = text.match(/(@?[\w\/-]+)$/);
  if (eslintMatch && eslintMatch[1]?.includes('/')) {
    return eslintMatch[1];
  }

  return null;
}

/**
 * Categorize error message
 */
export function categorizeError(text: string): FailureType {
  const match = findBestMatch(text);
  if (match) {
    return match.pattern.failureType;
  }

  // Fallback heuristics
  if (/error/i.test(text)) {
    if (/type|typescript|TS\d+/i.test(text)) return FailureType.BUILD_ERROR;
    if (/test|expect|assert/i.test(text)) return FailureType.TEST_FAILED;
    if (/lint|eslint/i.test(text)) return FailureType.LINT_ERROR;
    return FailureType.RUNTIME_ERROR;
  }

  if (/warning/i.test(text)) return FailureType.WARNING;
  if (/timeout/i.test(text)) return FailureType.TEST_TIMEOUT;

  return FailureType.UNKNOWN;
}

/**
 * Get patterns by failure type
 */
export function getPatternsByType(type: FailureType): ErrorPattern[] {
  return ALL_PATTERNS.filter(p => p.failureType === type);
}

/**
 * Interpolate suggestion template
 */
function interpolateSuggestion(
  template: string,
  match: PatternMatch,
  regexMatch: RegExpMatchArray
): string {
  let result = template;

  // Replace from pattern match
  if (match.file) result = result.replace('{file}', match.file);
  if (match.line) result = result.replace('{line}', match.line.toString());

  // Replace from regex groups
  for (let i = 1; i < regexMatch.length; i++) {
    const value = regexMatch[i];
    if (value) {
      result = result.replace(`{${i}}`, value);
      // Also try common names
      result = result.replace('{module}', value);
      result = result.replace('{property}', value);
      result = result.replace('{type}', value);
      result = result.replace('{from}', value);
      result = result.replace('{to}', value);
      result = result.replace('{errorCode}', value);
      result = result.replace('{rule}', value);
      result = result.replace('{message}', value);
      result = result.replace('{actual}', value);
      result = result.replace('{expected}', value);
    }
  }

  return result;
}

/**
 * Log pattern statistics
 */
export function logPatternStats(): void {
  const byType = new Map<FailureType, number>();
  for (const pattern of ALL_PATTERNS) {
    byType.set(pattern.failureType, (byType.get(pattern.failureType) || 0) + 1);
  }

  log.info(
    { totalPatterns: ALL_PATTERNS.length, byType: Object.fromEntries(byType) },
    'Error patterns loaded'
  );
}
