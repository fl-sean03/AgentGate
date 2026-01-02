/**
 * Gitignore-Aware Detector
 *
 * Detects gitignore status of sensitive files. Can warn when sensitive files
 * are tracked by git (not in .gitignore) or provide informational findings
 * for gitignored files.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ignore, { type Ignore } from 'ignore';

import type { SensitivityLevel } from '../types.js';
import type {
  Detector,
  DetectorContext,
  DetectorFinding,
  ValidationResult,
} from './types.js';
import { DEFAULT_SENSITIVE_PATTERNS } from './pattern-detector.js';

// ============================================================================
// Options Interface
// ============================================================================

/**
 * How to treat gitignored sensitive files.
 */
export type GitignoreTreatment = 'info' | 'warning' | 'sensitive';

/**
 * Options for the gitignore detector.
 */
export interface GitignoreDetectorOptions {
  /** How to treat gitignored files */
  treatAs?: GitignoreTreatment;
  /** Warn if sensitive file is NOT gitignored (tracked by git) */
  warnIfTracked?: boolean;
  /** Patterns considered sensitive */
  sensitivePatterns?: string[];
}

// ============================================================================
// Gitignore Detector Class
// ============================================================================

/**
 * Gitignore-aware detector that checks if sensitive files are properly ignored.
 */
export class GitignoreDetector implements Detector {
  readonly type = 'gitignore';
  readonly name = 'Gitignore-Aware Detector';
  readonly description = 'Detects gitignore status of sensitive files';

  /**
   * Detect gitignore status of sensitive files.
   */
  async detect(
    ctx: DetectorContext,
    options: Record<string, unknown>
  ): Promise<DetectorFinding[]> {
    const opts = this.parseOptions(options);
    const findings: DetectorFinding[] = [];

    const sensitivePatterns = opts.sensitivePatterns ?? DEFAULT_SENSITIVE_PATTERNS;
    const warnIfTracked = opts.warnIfTracked ?? true;
    const treatAs = opts.treatAs ?? 'info';

    // Parse .gitignore
    const ignoreChecker = await this.parseGitignore(ctx.workspaceDir);

    // Get detector sensitivity from policy
    const detectorConfig = ctx.policy.detectors.find(
      (d) => d.type === this.type
    );
    const baseSensitivity: SensitivityLevel =
      detectorConfig?.sensitivity ?? 'info';

    // Check each file in the scan list
    for (const file of ctx.files) {
      // Check for cancellation
      if (ctx.signal?.aborted) {
        break;
      }

      // Skip if allowlisted
      if (ctx.allowlist.has(file)) {
        continue;
      }

      // Check if file matches any sensitive pattern
      if (!this.matchesSensitivePattern(file, sensitivePatterns)) {
        continue;
      }

      // Check if file is gitignored
      const isIgnored = ignoreChecker.ignores(file);

      if (isIgnored) {
        // File is gitignored - create informational finding based on treatAs
        const sensitivity = this.treatmentToSensitivity(treatAs, baseSensitivity);
        findings.push({
          ruleId: 'gitignored-sensitive-file',
          message: `Sensitive file is gitignored: ${file}`,
          file,
          sensitivity,
          detector: this.type,
          metadata: {
            gitignored: true,
            treatAs,
          },
        });
      } else if (warnIfTracked) {
        // File is NOT gitignored (tracked by git) - this is a warning
        findings.push({
          ruleId: 'tracked-sensitive-file',
          message: `Sensitive file is tracked by git (not in .gitignore): ${file}`,
          file,
          sensitivity: 'warning',
          detector: this.type,
          metadata: {
            gitignored: false,
            warnIfTracked: true,
          },
        });
      }
    }

    return findings;
  }

  /**
   * Validate gitignore detector options.
   */
  validateOptions(options: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];

    // Validate treatAs
    if (options.treatAs !== undefined) {
      const validValues: GitignoreTreatment[] = ['info', 'warning', 'sensitive'];
      if (!validValues.includes(options.treatAs as GitignoreTreatment)) {
        errors.push(`treatAs must be one of: ${validValues.join(', ')}`);
      }
    }

    // Validate warnIfTracked
    if (
      options.warnIfTracked !== undefined &&
      typeof options.warnIfTracked !== 'boolean'
    ) {
      errors.push('warnIfTracked must be a boolean');
    }

    // Validate sensitivePatterns
    if (options.sensitivePatterns !== undefined) {
      if (!Array.isArray(options.sensitivePatterns)) {
        errors.push('sensitivePatterns must be an array');
      } else if (
        !options.sensitivePatterns.every((p) => typeof p === 'string')
      ) {
        errors.push('sensitivePatterns must contain only strings');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Parse .gitignore file from workspace root.
   * Returns an ignore instance for checking paths.
   */
  async parseGitignore(workspaceDir: string): Promise<Ignore> {
    const ig = ignore();

    const gitignorePath = path.join(workspaceDir, '.gitignore');

    try {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      ig.add(content);
    } catch {
      // No .gitignore file - return empty ignore instance
    }

    // Also check for nested .gitignore files could be added here
    // For now, we only check the root .gitignore

    return ig;
  }

  /**
   * Parse and type options from unknown input.
   */
  private parseOptions(
    options: Record<string, unknown>
  ): GitignoreDetectorOptions {
    const result: GitignoreDetectorOptions = {};
    if (options.treatAs !== undefined) {
      result.treatAs = options.treatAs as GitignoreTreatment;
    }
    if (options.warnIfTracked !== undefined) {
      result.warnIfTracked = options.warnIfTracked as boolean;
    }
    if (options.sensitivePatterns !== undefined) {
      result.sensitivePatterns = options.sensitivePatterns as string[];
    }
    return result;
  }

  /**
   * Check if a file matches any sensitive pattern.
   */
  private matchesSensitivePattern(file: string, patterns: string[]): boolean {
    // Simple matching - check if file path contains pattern indicators
    for (const pattern of patterns) {
      if (this.simplePatternMatch(file, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple pattern matching for sensitive file detection.
   * This is a simplified matcher for common patterns.
   */
  private simplePatternMatch(file: string, pattern: string): boolean {
    // Remove ** prefix for simpler matching
    const cleanPattern = pattern.replace(/^\*\*\//, '');

    // Handle wildcard patterns
    if (cleanPattern.includes('*')) {
      // Convert glob to regex
      const regexPattern = cleanPattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      const regex = new RegExp(regexPattern);
      return regex.test(file) || regex.test(path.basename(file));
    }

    // Exact match on filename or path
    return file === cleanPattern || file.endsWith('/' + cleanPattern) || file.endsWith(cleanPattern);
  }

  /**
   * Convert treatment type to sensitivity level.
   */
  private treatmentToSensitivity(
    treatment: GitignoreTreatment,
    baseSensitivity: SensitivityLevel
  ): SensitivityLevel {
    switch (treatment) {
      case 'info':
        return 'info';
      case 'warning':
        return 'warning';
      case 'sensitive':
        return 'sensitive';
      default:
        return baseSensitivity;
    }
  }
}
