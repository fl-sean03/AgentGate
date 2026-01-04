/**
 * Tests for Enhanced Feedback Generator.
 * (v0.2.27 - Thrust 17: Enhanced Feedback Generator)
 */

import { describe, it, expect } from 'vitest';
import { FailureType, type Failure } from '../../src/types/index.js';
import {
  prioritizeFailures,
  FailurePriority,
  getFailurePriority,
  getPriorityDistribution,
  hasCriticalFailures,
  createPrioritySummary,
} from '../../src/feedback/prioritizer.js';
import {
  deduplicateFailures,
  GroupCategory,
  formatGroup,
  getPrimaryFailures,
} from '../../src/feedback/deduplicator.js';
import {
  truncateFailures,
  truncateString,
  estimateSize,
  needsTruncation,
  DEFAULT_SIZE_LIMIT,
} from '../../src/feedback/truncator.js';
import {
  matchPatterns,
  findBestMatch,
  categorizeError,
  extractErrorCode,
} from '../../src/feedback/patterns.js';

// Helper to create test failures
function createFailure(overrides: Partial<Failure> = {}): Failure {
  return {
    level: 'L0' as unknown as import('../../src/types/verification.js').VerificationLevel,
    type: FailureType.TEST_FAILED,
    message: 'Test failure',
    details: null,
    command: null,
    exitCode: null,
    file: null,
    line: null,
    expected: null,
    actual: null,
    ...overrides,
  };
}

describe('Prioritizer', () => {
  describe('getFailurePriority', () => {
    it('should return critical for build errors', () => {
      expect(getFailurePriority(FailureType.BUILD_ERROR)).toBe(FailurePriority.CRITICAL);
    });

    it('should return high for test failures', () => {
      expect(getFailurePriority(FailureType.TEST_FAILED)).toBe(FailurePriority.HIGH);
    });

    it('should return medium for lint errors', () => {
      expect(getFailurePriority(FailureType.LINT_ERROR)).toBe(FailurePriority.MEDIUM);
    });

    it('should return low for style issues', () => {
      expect(getFailurePriority(FailureType.STYLE)).toBe(FailurePriority.LOW);
    });
  });

  describe('prioritizeFailures', () => {
    it('should sort failures by priority', () => {
      const failures = [
        createFailure({ type: FailureType.STYLE }),
        createFailure({ type: FailureType.BUILD_ERROR }),
        createFailure({ type: FailureType.TEST_FAILED }),
      ];

      const prioritized = prioritizeFailures(failures);

      expect(prioritized[0].priority).toBe(FailurePriority.CRITICAL);
      expect(prioritized[1].priority).toBe(FailurePriority.HIGH);
      expect(prioritized[2].priority).toBe(FailurePriority.LOW);
    });

    it('should add priority and weight', () => {
      const failures = [createFailure({ type: FailureType.BUILD_ERROR })];
      const prioritized = prioritizeFailures(failures);

      expect(prioritized[0].priority).toBe(FailurePriority.CRITICAL);
      expect(prioritized[0].weight).toBe(100);
    });
  });

  describe('getPriorityDistribution', () => {
    it('should count by priority', () => {
      const prioritized = prioritizeFailures([
        createFailure({ type: FailureType.BUILD_ERROR }),
        createFailure({ type: FailureType.BUILD_ERROR }),
        createFailure({ type: FailureType.TEST_FAILED }),
        createFailure({ type: FailureType.STYLE }),
      ]);

      const dist = getPriorityDistribution(prioritized);

      expect(dist.critical).toBe(2);
      expect(dist.high).toBe(1);
      expect(dist.low).toBe(1);
      expect(dist.total).toBe(4);
    });
  });

  describe('hasCriticalFailures', () => {
    it('should detect critical failures', () => {
      const prioritized = prioritizeFailures([
        createFailure({ type: FailureType.BUILD_ERROR }),
      ]);

      expect(hasCriticalFailures(prioritized)).toBe(true);
    });

    it('should return false when no critical', () => {
      const prioritized = prioritizeFailures([
        createFailure({ type: FailureType.TEST_FAILED }),
      ]);

      expect(hasCriticalFailures(prioritized)).toBe(false);
    });
  });

  describe('createPrioritySummary', () => {
    it('should create summary string', () => {
      const prioritized = prioritizeFailures([
        createFailure({ type: FailureType.BUILD_ERROR }),
        createFailure({ type: FailureType.TEST_FAILED }),
      ]);

      const summary = createPrioritySummary(prioritized);

      expect(summary).toContain('1 critical');
      expect(summary).toContain('1 high');
    });
  });
});

describe('Deduplicator', () => {
  describe('deduplicateFailures', () => {
    it('should group same-file failures', () => {
      const prioritized = prioritizeFailures([
        createFailure({ file: 'foo.ts', message: 'Error 1' }),
        createFailure({ file: 'foo.ts', message: 'Error 2' }),
        createFailure({ file: 'bar.ts', message: 'Error 3' }),
      ]);

      const result = deduplicateFailures(prioritized);

      expect(result.groupCount).toBeLessThan(result.originalCount);
    });

    it('should group import cascade errors', () => {
      const prioritized = prioritizeFailures([
        createFailure({ type: FailureType.BUILD_ERROR, message: "Cannot find module 'lodash'" }),
        createFailure({ type: FailureType.BUILD_ERROR, message: "Cannot find module 'lodash'" }),
      ]);

      const result = deduplicateFailures(prioritized);

      expect(result.groups[0].category).toBe(GroupCategory.IMPORT_CASCADE);
    });

    it('should calculate reduction percentage', () => {
      const prioritized = prioritizeFailures([
        createFailure({ file: 'a.ts', type: FailureType.TEST_FAILED }),
        createFailure({ file: 'a.ts', type: FailureType.TEST_FAILED }),
        createFailure({ file: 'a.ts', type: FailureType.TEST_FAILED }),
      ]);

      const result = deduplicateFailures(prioritized);

      expect(result.reductionPercent).toBeGreaterThan(0);
    });
  });

  describe('getPrimaryFailures', () => {
    it('should extract primary from each group', () => {
      const prioritized = prioritizeFailures([
        createFailure({ file: 'a.ts' }),
        createFailure({ file: 'a.ts' }),
        createFailure({ file: 'b.ts' }),
      ]);

      const result = deduplicateFailures(prioritized);
      const primaries = getPrimaryFailures(result);

      expect(primaries.length).toBe(result.groupCount);
    });
  });

  describe('formatGroup', () => {
    it('should format single failure group', () => {
      const prioritized = prioritizeFailures([
        createFailure({ message: 'Test error', file: 'test.ts', line: 10 }),
      ]);

      const result = deduplicateFailures(prioritized);
      const formatted = formatGroup(result.groups[0]);

      expect(formatted).toContain('Test error');
      expect(formatted).toContain('test.ts:10');
    });

    it('should format multi-failure group', () => {
      const prioritized = prioritizeFailures([
        createFailure({ file: 'a.ts', type: FailureType.TEST_FAILED }),
        createFailure({ file: 'a.ts', type: FailureType.TEST_FAILED }),
      ]);

      const result = deduplicateFailures(prioritized);
      const formatted = formatGroup(result.groups[0]);

      expect(formatted).toContain('2 related');
    });
  });
});

describe('Truncator', () => {
  describe('truncateString', () => {
    it('should not truncate short strings', () => {
      const short = 'hello';
      expect(truncateString(short, 100)).toBe(short);
    });

    it('should truncate long strings', () => {
      const long = 'a'.repeat(1000);
      const truncated = truncateString(long, 100);

      expect(truncated.length).toBeLessThanOrEqual(100);
      expect(truncated).toContain('...');
    });
  });

  describe('truncateFailures', () => {
    it('should truncate to size limit', () => {
      const failures = Array.from({ length: 100 }, (_, i) =>
        createFailure({ message: `Error ${i}: ${'x'.repeat(100)}` })
      );
      const prioritized = prioritizeFailures(failures);

      const result = truncateFailures(
        prioritized,
        (f) => f.message,
        { maxSize: 1000 }
      );

      expect(result.finalSize).toBeLessThanOrEqual(1000);
      expect(result.wasTruncated).toBe(true);
    });

    it('should include at least one per priority', () => {
      const failures = [
        createFailure({ type: FailureType.BUILD_ERROR, message: 'Critical' }),
        createFailure({ type: FailureType.TEST_FAILED, message: 'High' }),
        createFailure({ type: FailureType.LINT_ERROR, message: 'Medium' }),
        createFailure({ type: FailureType.STYLE, message: 'Low' }),
      ];
      const prioritized = prioritizeFailures(failures);

      const result = truncateFailures(
        prioritized,
        (f) => f.message,
        { maxSize: 500, minPerPriority: 1 }
      );

      expect(result.includedCount).toBeGreaterThanOrEqual(4);
    });

    it('should generate summary when truncated', () => {
      const failures = Array.from({ length: 50 }, () =>
        createFailure({ message: 'x'.repeat(100) })
      );
      const prioritized = prioritizeFailures(failures);

      const result = truncateFailures(
        prioritized,
        (f) => f.message,
        { maxSize: 1000, includeSummary: true }
      );

      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('Showing');
    });
  });

  describe('estimateSize', () => {
    it('should estimate byte size', () => {
      const failures = [
        createFailure({ message: 'Hello' }),
        createFailure({ message: 'World' }),
      ];
      const prioritized = prioritizeFailures(failures);

      const size = estimateSize(prioritized, (f) => f.message);

      expect(size).toBeGreaterThan(0);
    });
  });

  describe('needsTruncation', () => {
    it('should detect when truncation needed', () => {
      const failures = Array.from({ length: 100 }, () =>
        createFailure({ message: 'x'.repeat(200) })
      );
      const prioritized = prioritizeFailures(failures);

      expect(needsTruncation(prioritized, (f) => f.message, 1000)).toBe(true);
    });

    it('should detect when truncation not needed', () => {
      const failures = [createFailure({ message: 'short' })];
      const prioritized = prioritizeFailures(failures);

      expect(needsTruncation(prioritized, (f) => f.message, 1000)).toBe(false);
    });
  });
});

describe('Patterns', () => {
  describe('matchPatterns', () => {
    it('should match TypeScript errors', () => {
      const text = 'src/foo.ts(10,5): error TS2345: Argument of type...';
      const matches = matchPatterns(text);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.name).toContain('ts');
    });

    it('should match ESLint errors', () => {
      const text = '  10:5  error  Unexpected any  @typescript-eslint/no-explicit-any';
      const matches = matchPatterns(text);

      expect(matches.length).toBeGreaterThan(0);
    });

    it('should extract file and line', () => {
      const text = 'src/foo.ts(10,5): error TS2345: Type mismatch';
      const matches = matchPatterns(text);

      const tsMatch = matches.find(m => m.pattern.name === 'ts-type-error');
      expect(tsMatch?.file).toBe('src/foo.ts');
      expect(tsMatch?.line).toBe(10);
      expect(tsMatch?.column).toBe(5);
    });
  });

  describe('findBestMatch', () => {
    it('should find best matching pattern', () => {
      const text = 'src/foo.ts(10,5): error TS2345: Argument type';
      const match = findBestMatch(text);

      expect(match).not.toBeNull();
      expect(match?.file).toBeDefined();
    });

    it('should return null for no match', () => {
      const text = 'Some random text with no error pattern';
      const match = findBestMatch(text);

      expect(match).toBeNull();
    });
  });

  describe('categorizeError', () => {
    it('should categorize TypeScript errors', () => {
      const category = categorizeError('error TS2345: Argument type');
      expect(category).toBe(FailureType.BUILD_ERROR);
    });

    it('should categorize test errors', () => {
      const category = categorizeError('expect(foo).toBe(bar) failed');
      expect(category).toBe(FailureType.ASSERTION_FAILED);
    });

    it('should categorize lint errors', () => {
      const category = categorizeError('10:5 error Unexpected any');
      expect(category).toBe(FailureType.LINT_ERROR);
    });

    it('should return unknown for unrecognized', () => {
      const category = categorizeError('some random text');
      expect(category).toBe(FailureType.UNKNOWN);
    });
  });

  describe('extractErrorCode', () => {
    it('should extract TypeScript error codes', () => {
      const code = extractErrorCode('error TS2345: blah blah');
      expect(code).toBe('TS2345');
    });

    it('should return null for no code', () => {
      const code = extractErrorCode('some error message');
      expect(code).toBeNull();
    });
  });
});
