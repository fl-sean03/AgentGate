/**
 * File Pattern Detector
 *
 * Detects sensitive files by their filenames/paths using glob patterns.
 * Fast detection that doesn't require reading file contents.
 */

import fg from 'fast-glob';
const { glob } = fg;

import type { SensitivityLevel } from '../types.js';
import type {
  Detector,
  DetectorContext,
  DetectorFinding,
  ValidationResult,
} from './types.js';

// ============================================================================
// Default Sensitive Patterns
// ============================================================================

/**
 * Default patterns for sensitive files that should be detected.
 */
export const DEFAULT_SENSITIVE_PATTERNS: string[] = [
  '**/.env',
  '**/.env.*',
  '**/credentials.json',
  '**/credentials.yaml',
  '**/service-account*.json',
  '**/*.pem',
  '**/*.key',
  '**/id_rsa*',
  '**/id_ed25519*',
  '**/id_dsa*',
  '**/.npmrc',
  '**/.pypirc',
  '**/secrets.*',
  '**/private.*',
];

// ============================================================================
// Options Interface
// ============================================================================

/**
 * Options for the pattern detector.
 */
export interface PatternDetectorOptions {
  /** Glob patterns to match (e.g., ".env", "credentials.json") */
  patterns?: string[];
  /** Patterns to exclude from matching */
  excludePatterns?: string[];
}

// ============================================================================
// Pattern Detector Class
// ============================================================================

/**
 * File pattern detector that identifies sensitive files by their names/paths.
 */
export class PatternDetector implements Detector {
  readonly type = 'pattern';
  readonly name = 'File Pattern Detector';
  readonly description = 'Detects sensitive files by filename patterns';

  /**
   * Detect sensitive files matching glob patterns.
   */
  async detect(
    ctx: DetectorContext,
    options: Record<string, unknown>
  ): Promise<DetectorFinding[]> {
    const opts = this.parseOptions(options);
    const findings: DetectorFinding[] = [];

    const patterns = opts.patterns ?? DEFAULT_SENSITIVE_PATTERNS;
    if (patterns.length === 0) {
      return findings;
    }

    // Combine exclude patterns from options and policy
    const ignorePatterns = [
      ...(opts.excludePatterns ?? []),
      ...ctx.policy.excludes,
    ];

    // Get detector sensitivity from policy
    const detectorConfig = ctx.policy.detectors.find(
      (d) => d.type === this.type
    );
    const sensitivity: SensitivityLevel =
      detectorConfig?.sensitivity ?? 'sensitive';

    try {
      // Check for cancellation before glob
      if (ctx.signal?.aborted) {
        return findings;
      }

      // Use fast-glob to find matching files
      const matchedFiles = await glob(patterns, {
        cwd: ctx.workspaceDir,
        ignore: ignorePatterns,
        dot: true,
        onlyFiles: true,
        absolute: false,
      });

      // Create findings for each matched file
      for (const file of matchedFiles) {
        // Skip if allowlisted
        if (ctx.allowlist.has(file)) {
          continue;
        }

        // Determine which pattern matched
        const matchedPattern = this.findMatchingPattern(file, patterns);

        findings.push({
          ruleId: 'sensitive-file-pattern',
          message: `Sensitive file detected: ${file}`,
          file,
          sensitivity,
          detector: this.type,
          metadata: {
            matchedPattern,
          },
        });
      }
    } catch (error) {
      // Handle cancellation gracefully
      if (error instanceof Error && error.name === 'AbortError') {
        return findings;
      }
      throw error;
    }

    return findings;
  }

  /**
   * Validate pattern detector options.
   */
  validateOptions(options: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];

    // Validate patterns
    if (options.patterns !== undefined) {
      if (!Array.isArray(options.patterns)) {
        errors.push('patterns must be an array');
      } else if (options.patterns.length === 0) {
        errors.push('patterns must not be empty');
      } else if (!options.patterns.every((p) => typeof p === 'string' && p.length > 0)) {
        errors.push('patterns must contain non-empty strings');
      }
    }

    // Validate excludePatterns
    if (options.excludePatterns !== undefined) {
      if (!Array.isArray(options.excludePatterns)) {
        errors.push('excludePatterns must be an array');
      } else if (
        !options.excludePatterns.every((p) => typeof p === 'string')
      ) {
        errors.push('excludePatterns must contain only strings');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Parse and type options from unknown input.
   */
  private parseOptions(options: Record<string, unknown>): PatternDetectorOptions {
    const result: PatternDetectorOptions = {};
    if (options.patterns !== undefined) {
      result.patterns = options.patterns as string[];
    }
    if (options.excludePatterns !== undefined) {
      result.excludePatterns = options.excludePatterns as string[];
    }
    return result;
  }

  /**
   * Find which pattern matched a given file.
   * Returns the first matching pattern or undefined.
   */
  private findMatchingPattern(
    file: string,
    patterns: string[]
  ): string | undefined {
    // Simple heuristic: find patterns that could match
    for (const pattern of patterns) {
      if (this.patternCouldMatch(file, pattern)) {
        return pattern;
      }
    }
    return patterns[0]; // Fallback to first pattern
  }

  /**
   * Quick check if a pattern could match a file.
   * This is a simplified check - actual matching is done by fast-glob.
   */
  private patternCouldMatch(file: string, pattern: string): boolean {
    // Extract the non-glob part for quick comparison
    const parts = pattern.split('/').filter((p) => !p.includes('*'));
    return parts.some((part) => file.includes(part));
  }
}
