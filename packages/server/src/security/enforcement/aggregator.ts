/**
 * Security Finding Aggregator
 *
 * Aggregates findings from detectors, applies allowlist filtering,
 * categorizes by enforcement action, and builds summary statistics.
 */

import { logger } from '../../utils/logger.js';
import {
  type Finding,
  type AllowlistEntry,
  type ResolvedSecurityPolicy,
  type EnforcementMap,
  SensitivityLevel,
  EnforcementAction,
} from '../types.js';
import type { EnforcementSummary, CategorizedFindings } from './types.js';

// ============================================================================
// Finding Aggregator
// ============================================================================

/**
 * Aggregates and processes security findings.
 */
export class FindingAggregator {
  /**
   * Aggregate and process findings according to policy.
   * Applies allowlist filtering, categorizes by action, and builds summary.
   */
  aggregate(
    findings: Finding[],
    policy: ResolvedSecurityPolicy,
    scanDuration: number,
    filesScanned: number
  ): {
    filteredFindings: Finding[];
    categorized: CategorizedFindings;
    summary: EnforcementSummary;
  } {
    // Apply allowlist filtering
    const filteredFindings = this.filterByAllowlist(findings, policy.allowlist);

    // Categorize by enforcement action
    const categorized = this.categorizeByAction(filteredFindings, policy.enforcement);

    // Build summary statistics
    const summary = this.buildSummary(filteredFindings, scanDuration, filesScanned);

    return {
      filteredFindings,
      categorized,
      summary,
    };
  }

  /**
   * Filter findings against allowlist entries.
   * Removes findings that match non-expired allowlist patterns.
   */
  filterByAllowlist(findings: Finding[], allowlist: AllowlistEntry[]): Finding[] {
    if (allowlist.length === 0) {
      return findings;
    }

    return findings.filter((finding) => {
      for (const entry of allowlist) {
        if (this.matchesAllowlistEntry(finding, entry)) {
          if (this.isAllowlistExpired(entry)) {
            logger.debug(
              { pattern: entry.pattern, file: finding.file },
              'Allowlist entry expired, not applying'
            );
            continue;
          }

          logger.debug(
            {
              pattern: entry.pattern,
              file: finding.file,
              reason: entry.reason,
              detector: finding.detector,
            },
            'Finding filtered by allowlist'
          );

          return false; // Filter out this finding
        }
      }
      return true; // Keep this finding
    });
  }

  /**
   * Check if a finding matches an allowlist entry.
   */
  matchesAllowlistEntry(finding: Finding, entry: AllowlistEntry): boolean {
    // Check if file pattern matches
    if (!this.matchesPattern(finding.file, entry.pattern)) {
      return false;
    }

    // If detectors array is empty or not specified, matches all detectors
    if (!entry.detectors || entry.detectors.length === 0) {
      return true;
    }

    // Check if detector is in the allowlist entry's detector list
    return entry.detectors.includes(finding.detector);
  }

  /**
   * Check if a file path matches a glob pattern.
   * Supports basic glob patterns: *, **, ?
   */
  matchesPattern(file: string, pattern: string): boolean {
    // Convert glob pattern to regex
    // Escape regex special chars except * and ?
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      // Replace ** with a placeholder
      .replace(/\*\*/g, '<<DOUBLE_STAR>>')
      // Replace * with [^/]* (match within segment)
      .replace(/\*/g, '[^/]*')
      // Replace ? with single char
      .replace(/\?/g, '.')
      // Replace ** placeholder with .* (match across segments)
      .replace(/<<DOUBLE_STAR>>/g, '.*');

    // Allow pattern to match from end of path (matchBase behavior)
    regexPattern = `(^|/)${regexPattern}$`;

    try {
      const regex = new RegExp(regexPattern);
      return regex.test(file);
    } catch {
      // Invalid regex, fall back to exact match
      return file === pattern;
    }
  }

  /**
   * Check if an allowlist entry has expired.
   */
  isAllowlistExpired(entry: AllowlistEntry): boolean {
    if (!entry.expiresAt) {
      return false;
    }

    const expirationDate = new Date(entry.expiresAt);
    const now = new Date();

    return now > expirationDate;
  }

  /**
   * Categorize findings by their enforcement action.
   */
  categorizeByAction(
    findings: Finding[],
    enforcement: EnforcementMap
  ): CategorizedFindings {
    const categorized: CategorizedFindings = {
      blocked: [],
      warned: [],
      logged: [],
    };

    for (const finding of findings) {
      const action = enforcement[finding.sensitivity];

      switch (action) {
        case EnforcementAction.DENY:
        case EnforcementAction.BLOCK:
          categorized.blocked.push(finding);
          break;
        case EnforcementAction.WARN:
          categorized.warned.push(finding);
          break;
        case EnforcementAction.LOG:
        default:
          categorized.logged.push(finding);
          break;
      }
    }

    return categorized;
  }

  /**
   * Build summary statistics from findings.
   */
  buildSummary(
    findings: Finding[],
    scanDuration: number,
    filesScanned: number
  ): EnforcementSummary {
    // Initialize counts by level
    const byLevel: Record<SensitivityLevel, number> = {
      [SensitivityLevel.INFO]: 0,
      [SensitivityLevel.WARNING]: 0,
      [SensitivityLevel.SENSITIVE]: 0,
      [SensitivityLevel.RESTRICTED]: 0,
    };

    // Initialize counts by detector
    const byDetector: Record<string, number> = {};

    // Count findings
    for (const finding of findings) {
      // Count by level
      byLevel[finding.sensitivity]++;

      // Count by detector
      const currentCount = byDetector[finding.detector];
      byDetector[finding.detector] = (currentCount ?? 0) + 1;
    }

    return {
      total: findings.length,
      byLevel,
      byDetector,
      scanDuration,
      filesScanned,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default FindingAggregator instance.
 */
export const findingAggregator = new FindingAggregator();
