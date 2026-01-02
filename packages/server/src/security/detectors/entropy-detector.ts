/**
 * Entropy-Based Secret Detector
 *
 * Detects high-entropy strings that may be secrets by calculating
 * Shannon entropy. Complements regex-based detection by catching
 * secrets that don't match known patterns.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { SensitivityLevel } from '../types.js';
import type {
  Detector,
  DetectorContext,
  DetectorFinding,
  ValidationResult,
} from './types.js';
import { DEFAULT_BINARY_EXTENSIONS } from './content-detector.js';

// ============================================================================
// Constants
// ============================================================================

/** Default entropy threshold (4.5 bits is a good balance) */
const DEFAULT_THRESHOLD = 4.5;

/** Default minimum string length to check */
const DEFAULT_MIN_LENGTH = 20;

/** Default maximum string length to check */
const DEFAULT_MAX_LENGTH = 200;

/** Maximum file size to scan (1MB) */
const DEFAULT_MAX_FILE_SIZE = 1024 * 1024;

/** UUID pattern for false positive detection */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// Options Interface
// ============================================================================

/**
 * Character set filters for entropy detection.
 */
export type CharsetType = 'base64' | 'hex' | 'alphanumeric' | 'any';

/**
 * Options for the entropy detector.
 */
export interface EntropyDetectorOptions {
  /** Minimum entropy to flag (default: 4.5) */
  threshold?: number;
  /** Minimum string length to check (default: 20) */
  minLength?: number;
  /** Maximum string length to check (default: 200) */
  maxLength?: number;
  /** Character set filter */
  charset?: CharsetType;
}

// ============================================================================
// Entropy Detector Class
// ============================================================================

/**
 * High-entropy string detector that identifies potential secrets
 * based on Shannon entropy calculations.
 */
export class EntropyDetector implements Detector {
  readonly type = 'entropy';
  readonly name = 'High-Entropy String Detector';
  readonly description = 'Detects high-entropy strings that may be secrets';

  /**
   * Detect high-entropy strings in files.
   */
  async detect(
    ctx: DetectorContext,
    options: Record<string, unknown>
  ): Promise<DetectorFinding[]> {
    const opts = this.parseOptions(options);
    const findings: DetectorFinding[] = [];

    const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
    const minLength = opts.minLength ?? DEFAULT_MIN_LENGTH;
    const maxLength = opts.maxLength ?? DEFAULT_MAX_LENGTH;
    const charset = opts.charset ?? 'any';

    const binaryExts = new Set(DEFAULT_BINARY_EXTENSIONS);

    // Pattern to find potential secrets (alphanumeric + common secret chars)
    const potentialSecretPattern = new RegExp(
      `[A-Za-z0-9+/=_-]{${minLength},${maxLength}}`,
      'g'
    );

    for (const file of ctx.files) {
      // Check for cancellation
      if (ctx.signal?.aborted) {
        break;
      }

      // Skip binary files
      const ext = path.extname(file).toLowerCase();
      if (binaryExts.has(ext)) {
        continue;
      }

      const fullPath = path.join(ctx.workspaceDir, file);

      // Read file content
      const content = await this.readFileContent(fullPath, DEFAULT_MAX_FILE_SIZE);
      if (content === null) {
        continue;
      }

      // Get detector sensitivity from policy
      const detectorConfig = ctx.policy.detectors.find(
        (d) => d.type === this.type
      );
      const sensitivity: SensitivityLevel =
        detectorConfig?.sensitivity ?? 'warning';

      // Scan each line
      const lines = content.split('\n');
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex] ?? '';
        potentialSecretPattern.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = potentialSecretPattern.exec(line)) !== null) {
          const candidate = match[0];

          // Skip if doesn't match charset filter
          if (!this.matchesCharset(candidate, charset)) {
            continue;
          }

          // Skip likely false positives
          if (this.isLikelyFalsePositive(candidate, line)) {
            continue;
          }

          // Skip if allowlisted
          if (ctx.allowlist.has(candidate)) {
            continue;
          }

          // Calculate entropy
          const entropy = this.calculateEntropy(candidate);

          if (entropy >= threshold) {
            findings.push({
              ruleId: 'high-entropy-string',
              message: `High-entropy string detected (entropy: ${entropy.toFixed(2)} bits)`,
              file,
              line: lineIndex + 1,
              column: match.index + 1,
              match: this.maskString(candidate),
              sensitivity,
              detector: this.type,
              metadata: {
                entropy,
                length: candidate.length,
                charset,
              },
            });
          }
        }
      }
    }

    return findings;
  }

  /**
   * Validate entropy detector options.
   */
  validateOptions(options: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];

    // Validate threshold
    if (options.threshold !== undefined) {
      if (typeof options.threshold !== 'number') {
        errors.push('threshold must be a number');
      } else if (options.threshold < 0 || options.threshold > 8) {
        errors.push('threshold must be between 0 and 8');
      }
    }

    // Validate minLength
    if (options.minLength !== undefined) {
      if (typeof options.minLength !== 'number') {
        errors.push('minLength must be a number');
      } else if (options.minLength < 1 || !Number.isInteger(options.minLength)) {
        errors.push('minLength must be a positive integer');
      }
    }

    // Validate maxLength
    if (options.maxLength !== undefined) {
      if (typeof options.maxLength !== 'number') {
        errors.push('maxLength must be a number');
      } else if (options.maxLength < 1 || !Number.isInteger(options.maxLength)) {
        errors.push('maxLength must be a positive integer');
      }
    }

    // Validate maxLength >= minLength
    const minLen =
      typeof options.minLength === 'number'
        ? options.minLength
        : DEFAULT_MIN_LENGTH;
    const maxLen =
      typeof options.maxLength === 'number'
        ? options.maxLength
        : DEFAULT_MAX_LENGTH;
    if (maxLen < minLen) {
      errors.push('maxLength must be greater than or equal to minLength');
    }

    // Validate charset
    if (options.charset !== undefined) {
      const validCharsets: CharsetType[] = [
        'base64',
        'hex',
        'alphanumeric',
        'any',
      ];
      if (!validCharsets.includes(options.charset as CharsetType)) {
        errors.push(
          `charset must be one of: ${validCharsets.join(', ')}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate Shannon entropy of a string.
   * Returns entropy in bits.
   */
  calculateEntropy(str: string): number {
    if (str.length === 0) {
      return 0;
    }

    // Count character frequencies
    const freq = new Map<string, number>();
    for (const char of str) {
      freq.set(char, (freq.get(char) ?? 0) + 1);
    }

    // Calculate entropy: H = -Σ p(x) * log2(p(x))
    let entropy = 0;
    const len = str.length;
    for (const count of freq.values()) {
      const probability = count / len;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }

  /**
   * Parse and type options from unknown input.
   */
  private parseOptions(
    options: Record<string, unknown>
  ): EntropyDetectorOptions {
    const result: EntropyDetectorOptions = {};
    if (options.threshold !== undefined) {
      result.threshold = options.threshold as number;
    }
    if (options.minLength !== undefined) {
      result.minLength = options.minLength as number;
    }
    if (options.maxLength !== undefined) {
      result.maxLength = options.maxLength as number;
    }
    if (options.charset !== undefined) {
      result.charset = options.charset as CharsetType;
    }
    return result;
  }

  /**
   * Read file content if it's within size limits.
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
   * Check if a string matches the specified charset filter.
   */
  private matchesCharset(str: string, charset: CharsetType): boolean {
    switch (charset) {
      case 'base64':
        return /^[A-Za-z0-9+/=]+$/.test(str);
      case 'hex':
        return /^[0-9a-fA-F]+$/.test(str);
      case 'alphanumeric':
        return /^[A-Za-z0-9]+$/.test(str);
      case 'any':
      default:
        return true;
    }
  }

  /**
   * Check if a string is likely a false positive.
   */
  private isLikelyFalsePositive(str: string, context: string): boolean {
    // UUID pattern (8-4-4-4-12)
    if (UUID_PATTERN.test(str)) {
      return true;
    }

    // Check for repeated characters (e.g., "aaaaaaaaaa")
    if (this.hasRepeatedPattern(str)) {
      return true;
    }

    // Check if it's part of an import/require statement
    if (this.isPartOfImport(context)) {
      return true;
    }

    // Check if it's a URL path segment
    if (this.isUrlPath(context, str)) {
      return true;
    }

    // Check if context suggests a hash comment
    if (this.isHashComment(context)) {
      return true;
    }

    return false;
  }

  /**
   * Check if string has a repeated pattern (low actual entropy).
   */
  private hasRepeatedPattern(str: string): boolean {
    // Check for single character repeated
    if (new Set(str).size === 1) {
      return true;
    }

    // Check for alternating patterns like "ababab"
    if (str.length >= 4) {
      const half = Math.floor(str.length / 2);
      const first = str.slice(0, half);
      const second = str.slice(half, half * 2);
      if (first === second) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if context is an import/require statement.
   */
  private isPartOfImport(context: string): boolean {
    const importPatterns = [
      /\bimport\s+/,
      /\brequire\s*\(/,
      /\bfrom\s+['"][^'"]+['"]/,
    ];
    return importPatterns.some((p) => p.test(context));
  }

  /**
   * Check if string is part of a URL.
   */
  private isUrlPath(context: string, str: string): boolean {
    // Check if context contains http:// or https:// near the string
    const urlPattern = /https?:\/\/[^\s]*/;
    const urlMatch = context.match(urlPattern);
    if (urlMatch && urlMatch[0].includes(str)) {
      return true;
    }
    return false;
  }

  /**
   * Check if context suggests a hash comment (SHA, MD5, etc).
   */
  private isHashComment(context: string): boolean {
    const hashIndicators = [
      /\bSHA256\s*:/i,
      /\bSHA1\s*:/i,
      /\bMD5\s*:/i,
      /\bhash\s*:/i,
      /\bchecksum\s*:/i,
    ];
    return hashIndicators.some((p) => p.test(context));
  }

  /**
   * Mask a string for safe display.
   */
  private maskString(str: string): string {
    if (str.length <= 8) {
      return '*'.repeat(str.length);
    }
    const first = str.slice(0, 4);
    const last = str.slice(-4);
    return `${first}...${last}`;
  }
}
