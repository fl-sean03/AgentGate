/**
 * Sensitive Data Redaction
 * Redacts sensitive information from log output.
 *
 * (v0.2.27 - Thrust 18: Structured Logging Overhaul)
 */

/**
 * Placeholder for redacted values
 */
export const REDACTED = '[REDACTED]';

/**
 * Keys that should always be redacted (stored lowercase for comparison)
 */
export const DEFAULT_REDACT_KEYS = new Set([
  // Authentication
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authorization',
  'auth',
  'bearer',
  'jwt',
  'sessionid',
  'session_id',
  'cookie',
  'cookies',

  // Credentials - NOTE: 'credential' and 'credentials' are NOT included
  // because they are often used for legitimate object names
  'privatekey',
  'private_key',
  'publickey',
  'public_key',
  'passphrase',

  // Personal data
  'ssn',
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'cvv',
  'pin',

  // GitHub specific
  'github_token',
  'gh_token',
  'githubtoken',
]);

/**
 * Patterns to redact (for string values)
 */
const REDACT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // GitHub tokens
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, replacement: 'ghp_[REDACTED]' },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, replacement: 'gho_[REDACTED]' },
  { pattern: /ghu_[a-zA-Z0-9]{36}/g, replacement: 'ghu_[REDACTED]' },
  { pattern: /ghs_[a-zA-Z0-9]{36}/g, replacement: 'ghs_[REDACTED]' },
  { pattern: /ghr_[a-zA-Z0-9]{36}/g, replacement: 'ghr_[REDACTED]' },

  // JWT tokens
  { pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, replacement: '[JWT_REDACTED]' },

  // API keys (generic patterns)
  { pattern: /[a-zA-Z0-9]{32,}/g, replacement: '[KEY_REDACTED]' },

  // Emails (basic pattern)
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL_REDACTED]' },
];

/**
 * Redaction options
 */
export interface RedactionOptions {
  /** Additional keys to redact */
  additionalKeys?: string[];
  /** Additional patterns to redact */
  additionalPatterns?: Array<{ pattern: RegExp; replacement: string }>;
  /** Depth limit for nested objects */
  maxDepth?: number;
  /** Redact patterns in string values */
  redactPatterns?: boolean;
}

/**
 * Redact sensitive keys from an object
 */
export function redactObject<T extends Record<string, unknown>>(
  obj: T,
  options: RedactionOptions = {}
): T {
  const {
    additionalKeys = [],
    additionalPatterns = [],
    maxDepth = 10,
    redactPatterns = true,
  } = options;

  const keysToRedact = new Set([...DEFAULT_REDACT_KEYS, ...additionalKeys.map(k => k.toLowerCase())]);
  const patterns = redactPatterns ? [...REDACT_PATTERNS, ...additionalPatterns] : additionalPatterns;

  function redactValue(value: unknown, depth: number): unknown {
    if (depth > maxDepth) {
      return '[MAX_DEPTH_EXCEEDED]';
    }

    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      let result = value;
      for (const { pattern, replacement } of patterns) {
        result = result.replace(pattern, replacement);
      }
      return result;
    }

    if (Array.isArray(value)) {
      return value.map(item => redactValue(item, depth + 1));
    }

    if (typeof value === 'object') {
      const redacted: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        if (keysToRedact.has(key.toLowerCase())) {
          redacted[key] = REDACTED;
        } else {
          redacted[key] = redactValue(val, depth + 1);
        }
      }
      return redacted;
    }

    return value;
  }

  return redactValue(obj, 0) as T;
}

/**
 * Redact a single string value
 */
export function redactString(
  value: string,
  options: Pick<RedactionOptions, 'additionalPatterns'> = {}
): string {
  const patterns = [...REDACT_PATTERNS, ...(options.additionalPatterns ?? [])];

  let result = value;
  for (const { pattern, replacement } of patterns) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Check if a key should be redacted
 */
export function shouldRedactKey(key: string, additionalKeys: string[] = []): boolean {
  const allKeys = new Set([...DEFAULT_REDACT_KEYS, ...additionalKeys.map(k => k.toLowerCase())]);
  return allKeys.has(key.toLowerCase());
}

/**
 * Create a Pino redact configuration
 */
export function createPinoRedactConfig(additionalPaths: string[] = []): { paths: string[]; censor: string } {
  const basePaths = Array.from(DEFAULT_REDACT_KEYS).flatMap(key => [
    key,
    `*.${key}`,
    `*.*.${key}`,
  ]);

  return {
    paths: [...basePaths, ...additionalPaths],
    censor: REDACTED,
  };
}

/**
 * Redact environment variables for safe logging
 */
export function redactEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(env)) {
    if (shouldRedactKey(key)) {
      result[key] = value ? REDACTED : value;
    } else if (value) {
      result[key] = redactString(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}
