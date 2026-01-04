/**
 * Smart Truncation System
 * Intelligently truncates feedback to fit size limits.
 *
 * (v0.2.27 - Thrust 17: Enhanced Feedback Generator)
 */

import { createLogger } from '../utils/logger.js';
import { FailurePriority, type PrioritizedFailure } from './prioritizer.js';
import type { FailureGroup, DeduplicationResult } from './deduplicator.js';

const log = createLogger('feedback-truncator');

/**
 * Default size limit (8KB)
 */
export const DEFAULT_SIZE_LIMIT = 8 * 1024;

/**
 * Truncation options
 */
export interface TruncationOptions {
  /** Maximum size in bytes */
  maxSize?: number;
  /** Minimum failures per priority level */
  minPerPriority?: number;
  /** Include truncation summary */
  includeSummary?: boolean;
  /** Reserve bytes for summary */
  summaryReserve?: number;
}

/**
 * Truncation result
 */
export interface TruncationResult {
  /** Truncated content */
  content: string;
  /** Original size */
  originalSize: number;
  /** Final size */
  finalSize: number;
  /** Was truncated */
  wasTruncated: boolean;
  /** Number of items included */
  includedCount: number;
  /** Number of items truncated */
  truncatedCount: number;
  /** Truncation summary */
  summary?: string;
}

/**
 * Get byte size of a string
 */
function getByteSize(str: string): number {
  return Buffer.byteLength(str, 'utf8');
}

/**
 * Truncate a single string to fit size
 */
export function truncateString(
  str: string,
  maxBytes: number,
  suffix = '...'
): string {
  const size = getByteSize(str);
  if (size <= maxBytes) return str;

  // Binary search for the right length
  let low = 0;
  let high = str.length;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const truncated = str.slice(0, mid) + suffix;
    if (getByteSize(truncated) <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return str.slice(0, low) + suffix;
}

/**
 * Truncate failures to fit size limit
 */
export function truncateFailures(
  failures: PrioritizedFailure[],
  formatFailure: (f: PrioritizedFailure) => string,
  options: TruncationOptions = {}
): TruncationResult {
  const {
    maxSize = DEFAULT_SIZE_LIMIT,
    minPerPriority = 1,
    includeSummary = true,
    summaryReserve = 200,
  } = options;

  // Reserve space for summary
  const effectiveMax = includeSummary ? maxSize - summaryReserve : maxSize;

  // Group by priority
  const byPriority = new Map<FailurePriority, PrioritizedFailure[]>();
  for (const f of failures) {
    const list = byPriority.get(f.priority) || [];
    list.push(f);
    byPriority.set(f.priority, list);
  }

  // Select failures to include
  const included: PrioritizedFailure[] = [];
  const formatted: string[] = [];
  let currentSize = 0;

  // First pass: ensure minimum per priority
  const priorities: FailurePriority[] = [
    FailurePriority.CRITICAL,
    FailurePriority.HIGH,
    FailurePriority.MEDIUM,
    FailurePriority.LOW,
  ];

  for (const priority of priorities) {
    const prioFailures = byPriority.get(priority) || [];
    const toInclude = prioFailures.slice(0, minPerPriority);

    for (const failure of toInclude) {
      const text = formatFailure(failure);
      const size = getByteSize(text + '\n');

      if (currentSize + size <= effectiveMax) {
        included.push(failure);
        formatted.push(text);
        currentSize += size;
      }
    }
  }

  // Second pass: fill remaining space
  for (const priority of priorities) {
    const prioFailures = byPriority.get(priority) || [];

    for (const failure of prioFailures) {
      if (included.includes(failure)) continue;

      const text = formatFailure(failure);
      const size = getByteSize(text + '\n');

      if (currentSize + size <= effectiveMax) {
        included.push(failure);
        formatted.push(text);
        currentSize += size;
      }
    }
  }

  // Generate summary
  let summary: string | undefined;
  const truncatedCount = failures.length - included.length;

  if (includeSummary && truncatedCount > 0) {
    summary = generateTruncationSummary(failures, included, truncatedCount);
  }

  const content = formatted.join('\n') + (summary ? '\n\n' + summary : '');

  const result: TruncationResult = {
    content,
    originalSize: failures.reduce((sum, f) => sum + getByteSize(formatFailure(f)), 0),
    finalSize: getByteSize(content),
    wasTruncated: truncatedCount > 0,
    includedCount: included.length,
    truncatedCount,
    summary,
  };

  log.debug(
    {
      original: failures.length,
      included: included.length,
      truncated: truncatedCount,
      size: result.finalSize,
    },
    'Failures truncated'
  );

  return result;
}

/**
 * Truncate groups to fit size limit
 */
export function truncateGroups(
  result: DeduplicationResult,
  formatGroup: (g: FailureGroup) => string,
  options: TruncationOptions = {}
): TruncationResult {
  const {
    maxSize = DEFAULT_SIZE_LIMIT,
    minPerPriority = 1,
    includeSummary = true,
    summaryReserve = 200,
  } = options;

  const effectiveMax = includeSummary ? maxSize - summaryReserve : maxSize;

  const included: FailureGroup[] = [];
  const formatted: string[] = [];
  let currentSize = 0;

  // Sort groups by primary weight
  const sortedGroups = [...result.groups].sort(
    (a, b) => b.primary.weight - a.primary.weight
  );

  for (const group of sortedGroups) {
    const text = formatGroup(group);
    const size = getByteSize(text + '\n');

    if (currentSize + size <= effectiveMax) {
      included.push(group);
      formatted.push(text);
      currentSize += size;
    }
  }

  // Generate summary
  let summary: string | undefined;
  const truncatedGroups = result.groups.length - included.length;
  const truncatedFailures = result.originalCount - included.reduce((sum, g) => sum + g.count, 0);

  if (includeSummary && truncatedGroups > 0) {
    summary = `\n---\n*Showing ${included.length} of ${result.groups.length} error groups (${truncatedFailures} additional failures not shown)*`;
  }

  const content = formatted.join('\n\n') + (summary || '');

  return {
    content,
    originalSize: result.groups.reduce((sum, g) => sum + getByteSize(formatGroup(g)), 0),
    finalSize: getByteSize(content),
    wasTruncated: truncatedGroups > 0,
    includedCount: included.length,
    truncatedCount: truncatedGroups,
    summary,
  };
}

/**
 * Generate truncation summary
 */
function generateTruncationSummary(
  all: PrioritizedFailure[],
  included: PrioritizedFailure[],
  truncatedCount: number
): string {
  const lines = ['---'];
  lines.push(`*Showing ${included.length} of ${all.length} failures*`);

  // Count truncated by priority
  const truncated = all.filter(f => !included.includes(f));
  const byPriority = new Map<FailurePriority, number>();

  for (const f of truncated) {
    byPriority.set(f.priority, (byPriority.get(f.priority) || 0) + 1);
  }

  const parts: string[] = [];
  if (byPriority.get(FailurePriority.CRITICAL)) {
    parts.push(`${byPriority.get(FailurePriority.CRITICAL)} critical`);
  }
  if (byPriority.get(FailurePriority.HIGH)) {
    parts.push(`${byPriority.get(FailurePriority.HIGH)} high`);
  }
  if (byPriority.get(FailurePriority.MEDIUM)) {
    parts.push(`${byPriority.get(FailurePriority.MEDIUM)} medium`);
  }
  if (byPriority.get(FailurePriority.LOW)) {
    parts.push(`${byPriority.get(FailurePriority.LOW)} low`);
  }

  if (parts.length > 0) {
    lines.push(`*Not shown: ${parts.join(', ')} priority*`);
  }

  return lines.join('\n');
}

/**
 * Estimate final size for planning
 */
export function estimateSize(
  failures: PrioritizedFailure[],
  formatFailure: (f: PrioritizedFailure) => string
): number {
  return failures.reduce((sum, f) => sum + getByteSize(formatFailure(f) + '\n'), 0);
}

/**
 * Check if truncation is needed
 */
export function needsTruncation(
  failures: PrioritizedFailure[],
  formatFailure: (f: PrioritizedFailure) => string,
  maxSize: number = DEFAULT_SIZE_LIMIT
): boolean {
  return estimateSize(failures, formatFailure) > maxSize;
}
