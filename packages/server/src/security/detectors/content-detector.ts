/**
 * Content-Based Secret Detector
 *
 * Scans file contents for hardcoded secrets using regex patterns.
 * Supports binary file detection, file size limits, and pattern masking.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { SecretPattern, SensitivityLevel } from '../types.js';
import type {
  Detector,
  DetectorContext,
  DetectorFinding,
  ValidationResult,
} from './types.js';
import {
  BUILTIN_SECRET_PATTERNS,
  compilePatterns,
  type CompiledPattern,
} from './patterns.js';

// ============================================================================
// Constants
// ============================================================================

/** Default maximum file size to scan (1MB) */
const DEFAULT_MAX_FILE_SIZE = 1024 * 1024;

/** Binary file extensions to skip */
export const DEFAULT_BINARY_EXTENSIONS: string[] = [
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.svg',
  '.bmp',
  // Fonts
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  // Archives
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  // Executables
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  // Documents
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  // Media
  '.mp3',
  '.mp4',
  '.wav',
  '.avi',
  '.mov',
];

// ============================================================================
// Options Interface
// ============================================================================

/**
 * Options for the content detector.
 */
export interface ContentDetectorOptions {
  /** Patterns to scan for (defaults to BUILTIN_SECRET_PATTERNS) */
  rules?: SecretPattern[];
  /** Maximum file size to scan in bytes (default: 1MB) */
  maxFileSizeBytes?: number;
  /** Extensions to treat as binary (default: DEFAULT_BINARY_EXTENSIONS) */
  binaryExtensions?: string[];
}

// ============================================================================
// Content Detector Class
// ============================================================================

/**
 * Content-based secret detector that scans file contents for hardcoded secrets.
 */
export class ContentDetector implements Detector {
  readonly type = 'content';
  readonly name = 'Content-Based Secret Detector';
  readonly description = 'Scans file contents for hardcoded secrets';

  /**
   * Detect secrets in files by scanning content with regex patterns.
   */
  async detect(
    ctx: DetectorContext,
    options: Record<string, unknown>
  ): Promise<DetectorFinding[]> {
    const opts = this.parseOptions(options);
    const findings: DetectorFinding[] = [];

    const patterns = compilePatterns(opts.rules ?? BUILTIN_SECRET_PATTERNS);
    const binaryExts = new Set(
      opts.binaryExtensions ?? DEFAULT_BINARY_EXTENSIONS
    );
    const maxSize = opts.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE;

    for (const file of ctx.files) {
      // Check for cancellation
      if (ctx.signal?.aborted) {
        break;
      }

      // Skip binary files
      if (this.isBinaryFile(file, binaryExts)) {
        continue;
      }

      const fullPath = path.join(ctx.workspaceDir, file);

      // Read file content
      const content = await this.readFileContent(fullPath, maxSize);
      if (content === null) {
        continue; // File too large or couldn't be read
      }

      // Get detector sensitivity from policy
      const detectorConfig = ctx.policy.detectors.find(
        (d) => d.type === this.type
      );
      const sensitivity: SensitivityLevel =
        detectorConfig?.sensitivity ?? 'sensitive';

      // Scan with each pattern
      const fileFindings = this.scanContent(
        content,
        file,
        patterns,
        sensitivity,
        ctx.allowlist
      );
      findings.push(...fileFindings);
    }

    return findings;
  }

  /**
   * Validate content detector options.
   */
  validateOptions(options: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];

    // Validate rules
    if (options.rules !== undefined) {
      if (!Array.isArray(options.rules)) {
        errors.push('rules must be an array');
      } else {
        for (let i = 0; i < options.rules.length; i++) {
          const rule = options.rules[i] as Record<string, unknown>;
          if (!rule.id || typeof rule.id !== 'string') {
            errors.push(`rules[${i}].id must be a non-empty string`);
          }
          if (!rule.pattern || typeof rule.pattern !== 'string') {
            errors.push(`rules[${i}].pattern must be a non-empty string`);
          } else {
            // Validate regex
            try {
              new RegExp(rule.pattern);
            } catch {
              errors.push(`rules[${i}].pattern is not a valid regex`);
            }
          }
        }
      }
    }

    // Validate maxFileSizeBytes
    if (options.maxFileSizeBytes !== undefined) {
      if (
        typeof options.maxFileSizeBytes !== 'number' ||
        options.maxFileSizeBytes <= 0
      ) {
        errors.push('maxFileSizeBytes must be a positive number');
      }
    }

    // Validate binaryExtensions
    if (options.binaryExtensions !== undefined) {
      if (!Array.isArray(options.binaryExtensions)) {
        errors.push('binaryExtensions must be an array');
      } else if (
        !options.binaryExtensions.every((ext) => typeof ext === 'string')
      ) {
        errors.push('binaryExtensions must contain only strings');
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
  private parseOptions(options: Record<string, unknown>): ContentDetectorOptions {
    const result: ContentDetectorOptions = {};
    if (options.rules !== undefined) {
      result.rules = options.rules as SecretPattern[];
    }
    if (options.maxFileSizeBytes !== undefined) {
      result.maxFileSizeBytes = options.maxFileSizeBytes as number;
    }
    if (options.binaryExtensions !== undefined) {
      result.binaryExtensions = options.binaryExtensions as string[];
    }
    return result;
  }

  /**
   * Check if a file is binary based on its extension.
   */
  private isBinaryFile(file: string, binaryExts: Set<string>): boolean {
    const ext = path.extname(file).toLowerCase();
    return binaryExts.has(ext);
  }

  /**
   * Read file content if it's within size limits.
   * Returns null if file is too large or can't be read.
   */
  private async readFileContent(
    filePath: string,
    maxSize: number
  ): Promise<string | null> {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > maxSize) {
        return null;
      }
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Scan content with all patterns and return findings.
   */
  private scanContent(
    content: string,
    file: string,
    patterns: CompiledPattern[],
    sensitivity: SensitivityLevel,
    allowlist: Set<string>
  ): DetectorFinding[] {
    const findings: DetectorFinding[] = [];

    for (const { pattern, regex } of patterns) {
      // Reset regex lastIndex for global matching
      regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const matchValue = match[0];

        // Skip if allowlisted
        if (allowlist.has(matchValue)) {
          continue;
        }

        const line = this.getLineNumber(content, match.index);
        const column = this.getColumnNumber(content, match.index);

        findings.push({
          ruleId: pattern.id,
          message: `${pattern.description} detected`,
          file,
          line,
          column,
          match: this.maskSecret(matchValue),
          sensitivity,
          detector: this.type,
          metadata: {
            patternId: pattern.id,
            patternDescription: pattern.description,
          },
        });
      }
    }

    return findings;
  }

  /**
   * Mask a secret value for safe display.
   * Shows first 4 and last 4 characters for long strings.
   */
  private maskSecret(value: string): string {
    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }
    const first = value.slice(0, 4);
    const last = value.slice(-4);
    return `${first}****...****${last}`;
  }

  /**
   * Get line number (1-indexed) for a match index in content.
   */
  private getLineNumber(content: string, matchIndex: number): number {
    const beforeMatch = content.slice(0, matchIndex);
    const newlines = beforeMatch.split('\n').length;
    return newlines;
  }

  /**
   * Get column number (1-indexed) for a match index in content.
   */
  private getColumnNumber(content: string, matchIndex: number): number {
    const beforeMatch = content.slice(0, matchIndex);
    const lastNewline = beforeMatch.lastIndexOf('\n');
    return matchIndex - lastNewline;
  }
}
