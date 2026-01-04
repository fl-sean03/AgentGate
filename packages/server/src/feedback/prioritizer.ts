/**
 * Failure Prioritization System
 * Prioritizes failures for feedback generation.
 *
 * (v0.2.27 - Thrust 17: Enhanced Feedback Generator)
 */

import { createLogger } from '../utils/logger.js';
import { FailureType, type Failure } from '../types/index.js';

const log = createLogger('feedback-prioritizer');

/**
 * Priority levels for failures
 */
export enum FailurePriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/**
 * Priority weight (higher = more important)
 */
const PRIORITY_WEIGHTS: Record<FailurePriority, number> = {
  [FailurePriority.CRITICAL]: 100,
  [FailurePriority.HIGH]: 75,
  [FailurePriority.MEDIUM]: 50,
  [FailurePriority.LOW]: 25,
};

/**
 * Failure type to priority mapping
 */
const TYPE_PRIORITY: Record<FailureType, FailurePriority> = {
  [FailureType.BUILD_ERROR]: FailurePriority.CRITICAL,
  [FailureType.RUNTIME_ERROR]: FailurePriority.CRITICAL,
  [FailureType.RESOURCE_EXCEEDED]: FailurePriority.CRITICAL,
  [FailureType.TEST_FAILED]: FailurePriority.HIGH,
  [FailureType.ASSERTION_FAILED]: FailurePriority.HIGH,
  [FailureType.MISSING_FILE]: FailurePriority.HIGH,
  [FailureType.FORBIDDEN_FILE]: FailurePriority.HIGH,
  [FailureType.LINT_ERROR]: FailurePriority.MEDIUM,
  [FailureType.SCHEMA_VIOLATION]: FailurePriority.MEDIUM,
  [FailureType.WARNING]: FailurePriority.LOW,
  [FailureType.STYLE]: FailurePriority.LOW,
  [FailureType.TEST_TIMEOUT]: FailurePriority.MEDIUM,
  [FailureType.UNKNOWN]: FailurePriority.MEDIUM,
};

/**
 * Prioritized failure with priority info
 */
export interface PrioritizedFailure extends Failure {
  priority: FailurePriority;
  weight: number;
}

/**
 * Priority distribution info
 */
export interface PriorityDistribution {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

/**
 * Get priority for a failure type
 */
export function getFailurePriority(type: FailureType): FailurePriority {
  return TYPE_PRIORITY[type] || FailurePriority.MEDIUM;
}

/**
 * Get priority weight
 */
export function getPriorityWeight(priority: FailurePriority): number {
  return PRIORITY_WEIGHTS[priority];
}

/**
 * Add priority information to a failure
 */
export function prioritizeFailure(failure: Failure): PrioritizedFailure {
  const priority = getFailurePriority(failure.type);
  return {
    ...failure,
    priority,
    weight: getPriorityWeight(priority),
  };
}

/**
 * Prioritize and sort failures
 */
export function prioritizeFailures(failures: Failure[]): PrioritizedFailure[] {
  const prioritized = failures.map(prioritizeFailure);

  // Sort by weight (highest first), then by file/line for stability
  prioritized.sort((a, b) => {
    if (a.weight !== b.weight) {
      return b.weight - a.weight;
    }
    // Secondary sort by file name
    const fileCompare = (a.file || '').localeCompare(b.file || '');
    if (fileCompare !== 0) return fileCompare;
    // Tertiary sort by line number
    return (a.line || 0) - (b.line || 0);
  });

  log.debug(
    { total: failures.length, prioritized: prioritized.length },
    'Failures prioritized'
  );

  return prioritized;
}

/**
 * Get priority distribution
 */
export function getPriorityDistribution(failures: PrioritizedFailure[]): PriorityDistribution {
  const dist: PriorityDistribution = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: failures.length,
  };

  for (const failure of failures) {
    switch (failure.priority) {
      case FailurePriority.CRITICAL:
        dist.critical++;
        break;
      case FailurePriority.HIGH:
        dist.high++;
        break;
      case FailurePriority.MEDIUM:
        dist.medium++;
        break;
      case FailurePriority.LOW:
        dist.low++;
        break;
    }
  }

  return dist;
}

/**
 * Filter failures by minimum priority
 */
export function filterByPriority(
  failures: PrioritizedFailure[],
  minPriority: FailurePriority
): PrioritizedFailure[] {
  const minWeight = getPriorityWeight(minPriority);
  return failures.filter(f => f.weight >= minWeight);
}

/**
 * Check if failure is critical
 */
export function isCritical(failure: PrioritizedFailure): boolean {
  return failure.priority === FailurePriority.CRITICAL;
}

/**
 * Check if there are any critical failures
 */
export function hasCriticalFailures(failures: PrioritizedFailure[]): boolean {
  return failures.some(isCritical);
}

/**
 * Get critical failures only
 */
export function getCriticalFailures(failures: PrioritizedFailure[]): PrioritizedFailure[] {
  return failures.filter(isCritical);
}

/**
 * Create priority summary for logging
 */
export function createPrioritySummary(failures: PrioritizedFailure[]): string {
  const dist = getPriorityDistribution(failures);
  const parts: string[] = [];

  if (dist.critical > 0) parts.push(`${dist.critical} critical`);
  if (dist.high > 0) parts.push(`${dist.high} high`);
  if (dist.medium > 0) parts.push(`${dist.medium} medium`);
  if (dist.low > 0) parts.push(`${dist.low} low`);

  return parts.length > 0 ? parts.join(', ') : 'no failures';
}
