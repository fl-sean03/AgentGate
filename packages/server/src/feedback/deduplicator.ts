/**
 * Failure Deduplication System
 * Groups failures by likely root cause.
 *
 * (v0.2.27 - Thrust 17: Enhanced Feedback Generator)
 */

import { createLogger } from '../utils/logger.js';
import { FailureType, type Failure } from '../types/index.js';
import type { PrioritizedFailure } from './prioritizer.js';

const log = createLogger('feedback-deduplicator');

/**
 * Group of related failures
 */
export interface FailureGroup {
  /** Group identifier */
  id: string;
  /** Primary failure (representative) */
  primary: PrioritizedFailure;
  /** All failures in this group */
  failures: PrioritizedFailure[];
  /** Number of failures in group */
  count: number;
  /** Group category */
  category: GroupCategory;
  /** Common file (if all same file) */
  commonFile?: string;
  /** Common pattern/error type */
  pattern?: string;
}

/**
 * Group category types
 */
export enum GroupCategory {
  SAME_FILE = 'same-file',
  SAME_ERROR_TYPE = 'same-error-type',
  IMPORT_CASCADE = 'import-cascade',
  TEST_SUITE = 'test-suite',
  BUILD_CHAIN = 'build-chain',
  UNIQUE = 'unique',
}

/**
 * Deduplication result
 */
export interface DeduplicationResult {
  /** Grouped failures */
  groups: FailureGroup[];
  /** Total original failures */
  originalCount: number;
  /** Number of unique groups */
  groupCount: number;
  /** Reduction percentage */
  reductionPercent: number;
}

/**
 * Generate a grouping key for a failure
 */
function getGroupingKey(failure: PrioritizedFailure): string {
  // Try to group by file + error type
  const file = failure.file || 'unknown';
  const type = failure.type;

  // For import errors, group by the missing module
  if (isImportError(failure.message)) {
    const module = extractModuleName(failure.message);
    return `import:${module}`;
  }

  // For TypeScript errors, group by error code
  const tsError = extractTsErrorCode(failure.message);
  if (tsError) {
    return `ts:${tsError}:${file}`;
  }

  // For test failures, group by test file
  if (failure.type === FailureType.TEST_FAILED) {
    return `test:${file}`;
  }

  // Default: group by file and error type
  return `${type}:${file}`;
}

/**
 * Check if message is an import/module error
 */
function isImportError(message: string): boolean {
  return /cannot find module|module not found|import.*failed/i.test(message);
}

/**
 * Extract module name from import error
 */
function extractModuleName(message: string): string {
  const match = message.match(/(?:cannot find module|module not found)[:\s]*['"]?([^'")\s]+)/i);
  return match?.[1] || 'unknown';
}

/**
 * Extract TypeScript error code
 */
function extractTsErrorCode(message: string): string | null {
  const match = message.match(/TS(\d+)/);
  return match?.[0] || null;
}

/**
 * Determine the category for a group
 */
function determineCategory(failures: PrioritizedFailure[]): GroupCategory {
  if (failures.length === 1) {
    return GroupCategory.UNIQUE;
  }

  // Check if all same file
  const files = new Set(failures.map(f => f.file).filter(Boolean));
  if (files.size === 1) {
    return GroupCategory.SAME_FILE;
  }

  // Check if import cascade
  if (failures.every(f => isImportError(f.message))) {
    return GroupCategory.IMPORT_CASCADE;
  }

  // Check if all same type
  const types = new Set(failures.map(f => f.type));
  if (types.size === 1) {
    if (types.has(FailureType.TEST_FAILED)) {
      return GroupCategory.TEST_SUITE;
    }
    if (types.has(FailureType.BUILD_ERROR)) {
      return GroupCategory.BUILD_CHAIN;
    }
    return GroupCategory.SAME_ERROR_TYPE;
  }

  return GroupCategory.UNIQUE;
}

/**
 * Select the primary (most representative) failure from a group
 */
function selectPrimary(failures: PrioritizedFailure[]): PrioritizedFailure {
  // Sort by weight (highest first), then by most information
  const sorted = [...failures].sort((a, b) => {
    // Highest priority first
    if (a.weight !== b.weight) return b.weight - a.weight;
    // Most details first
    const aInfo = (a.file ? 1 : 0) + (a.line ? 1 : 0) + (a.details ? 1 : 0);
    const bInfo = (b.file ? 1 : 0) + (b.line ? 1 : 0) + (b.details ? 1 : 0);
    return bInfo - aInfo;
  });

  return sorted[0]!;
}

/**
 * Create a group from failures
 */
function createGroup(
  id: string,
  failures: PrioritizedFailure[]
): FailureGroup {
  const primary = selectPrimary(failures);
  const category = determineCategory(failures);

  // Find common file
  const files = failures.map(f => f.file).filter((f): f is string => !!f);
  const uniqueFiles = new Set(files);
  const commonFile = uniqueFiles.size === 1 ? files[0] : undefined;

  // Extract common pattern if applicable
  let pattern: string | undefined;
  if (category === GroupCategory.IMPORT_CASCADE) {
    pattern = extractModuleName(primary.message);
  } else if (category === GroupCategory.SAME_ERROR_TYPE) {
    pattern = primary.type;
  }

  return {
    id,
    primary,
    failures,
    count: failures.length,
    category,
    commonFile,
    pattern,
  };
}

/**
 * Deduplicate failures by grouping related ones
 */
export function deduplicateFailures(
  failures: PrioritizedFailure[]
): DeduplicationResult {
  const groups = new Map<string, PrioritizedFailure[]>();

  // Group failures by key
  for (const failure of failures) {
    const key = getGroupingKey(failure);
    const existing = groups.get(key) || [];
    existing.push(failure);
    groups.set(key, existing);
  }

  // Create FailureGroup objects
  const failureGroups: FailureGroup[] = [];
  let groupId = 0;

  for (const [key, groupFailures] of groups) {
    failureGroups.push(createGroup(`group-${groupId++}`, groupFailures));
  }

  // Sort groups by primary failure weight
  failureGroups.sort((a, b) => b.primary.weight - a.primary.weight);

  const result: DeduplicationResult = {
    groups: failureGroups,
    originalCount: failures.length,
    groupCount: failureGroups.length,
    reductionPercent:
      failures.length > 0
        ? Math.round((1 - failureGroups.length / failures.length) * 100)
        : 0,
  };

  log.debug(
    {
      original: result.originalCount,
      groups: result.groupCount,
      reduction: `${result.reductionPercent}%`,
    },
    'Failures deduplicated'
  );

  return result;
}

/**
 * Get the primary failures from deduplicated groups
 */
export function getPrimaryFailures(result: DeduplicationResult): PrioritizedFailure[] {
  return result.groups.map(g => g.primary);
}

/**
 * Format a group for display
 */
export function formatGroup(group: FailureGroup): string {
  const lines: string[] = [];

  // Header with count
  const countSuffix = group.count > 1 ? ` (${group.count} related)` : '';
  lines.push(`${group.primary.message}${countSuffix}`);

  // Location
  if (group.primary.file) {
    const loc = group.primary.line
      ? `${group.primary.file}:${group.primary.line}`
      : group.primary.file;
    lines.push(`  at ${loc}`);
  }

  // Category info for multi-failure groups
  if (group.count > 1) {
    switch (group.category) {
      case GroupCategory.IMPORT_CASCADE:
        lines.push(`  → Import cascade from: ${group.pattern}`);
        break;
      case GroupCategory.SAME_FILE:
        lines.push(`  → Multiple errors in: ${group.commonFile}`);
        break;
      case GroupCategory.TEST_SUITE:
        lines.push(`  → Test suite failures`);
        break;
    }
  }

  return lines.join('\n');
}

/**
 * Get groups by category
 */
export function getGroupsByCategory(
  result: DeduplicationResult,
  category: GroupCategory
): FailureGroup[] {
  return result.groups.filter(g => g.category === category);
}
