/**
 * Built-in Secret Patterns
 *
 * Comprehensive library of regex patterns for detecting common secrets
 * including API keys, tokens, private keys, and connection strings.
 */

import type { SecretPattern } from '../types.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Built-in Secret Patterns
// ============================================================================

/**
 * Comprehensive list of built-in secret patterns covering:
 * - Cloud providers (AWS, GCP)
 * - VCS platforms (GitHub)
 * - Payment processors (Stripe)
 * - Communication platforms (Slack)
 * - Private keys (RSA, EC, OpenSSH, PGP, DSA)
 * - Databases (PostgreSQL, MongoDB, Redis, MySQL)
 * - Authentication (JWT)
 * - Package managers (NPM)
 * - Generic patterns (API keys, secrets)
 */
export const BUILTIN_SECRET_PATTERNS: SecretPattern[] = [
  // AWS
  {
    id: 'aws-access-key-id',
    pattern: 'AKIA[0-9A-Z]{16}',
    description: 'AWS Access Key ID',
  },
  {
    id: 'aws-secret-key',
    pattern: '(?<![A-Za-z0-9/+])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])',
    description: 'AWS Secret Access Key',
  },

  // GitHub
  {
    id: 'github-pat',
    pattern: 'ghp_[A-Za-z0-9]{36}',
    description: 'GitHub Personal Access Token',
  },
  {
    id: 'github-oauth',
    pattern: 'gho_[A-Za-z0-9]{36}',
    description: 'GitHub OAuth Token',
  },
  {
    id: 'github-user-to-server',
    pattern: 'ghu_[A-Za-z0-9]{36}',
    description: 'GitHub User-to-Server Token',
  },
  {
    id: 'github-refresh',
    pattern: 'ghr_[A-Za-z0-9]{36}',
    description: 'GitHub Refresh Token',
  },
  {
    id: 'github-fine-grained',
    pattern: 'github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}',
    description: 'GitHub Fine-Grained Personal Access Token',
  },

  // Stripe
  {
    id: 'stripe-publishable',
    pattern: 'pk_(?:live|test)_[A-Za-z0-9]{24,}',
    description: 'Stripe Publishable Key',
  },
  {
    id: 'stripe-secret',
    pattern: 'sk_(?:live|test)_[A-Za-z0-9]{24,}',
    description: 'Stripe Secret Key',
  },
  {
    id: 'stripe-restricted',
    pattern: 'rk_(?:live|test)_[A-Za-z0-9]{24,}',
    description: 'Stripe Restricted Key',
  },

  // Slack
  {
    id: 'slack-token',
    pattern: 'xox[baprs]-[0-9a-zA-Z-]{10,}',
    description: 'Slack Token',
  },
  {
    id: 'slack-webhook',
    pattern:
      'https://hooks\\.slack\\.com/services/T[A-Z0-9]{8}/B[A-Z0-9]{8,}/[a-zA-Z0-9]{24}',
    description: 'Slack Webhook URL',
  },

  // Private Keys
  {
    id: 'rsa-private-key',
    pattern: '-----BEGIN RSA PRIVATE KEY-----',
    description: 'RSA Private Key',
  },
  {
    id: 'ec-private-key',
    pattern: '-----BEGIN EC PRIVATE KEY-----',
    description: 'EC Private Key',
  },
  {
    id: 'openssh-private-key',
    pattern: '-----BEGIN OPENSSH PRIVATE KEY-----',
    description: 'OpenSSH Private Key',
  },
  {
    id: 'pgp-private-key',
    pattern: '-----BEGIN PGP PRIVATE KEY BLOCK-----',
    description: 'PGP Private Key Block',
  },
  {
    id: 'dsa-private-key',
    pattern: '-----BEGIN DSA PRIVATE KEY-----',
    description: 'DSA Private Key',
  },

  // Google
  {
    id: 'google-api-key',
    pattern: 'AIza[0-9A-Za-z\\-_]{35}',
    description: 'Google API Key',
  },
  {
    id: 'google-oauth-client',
    pattern: '[0-9]+-[0-9A-Za-z_]{32}\\.apps\\.googleusercontent\\.com',
    description: 'Google OAuth Client ID',
  },

  // Database URLs
  {
    id: 'postgres-url',
    pattern: 'postgres(?:ql)?://[^:]+:[^@]+@[^/]+/\\w+',
    description: 'PostgreSQL Connection URL',
  },
  {
    id: 'mongodb-url',
    pattern: 'mongodb(?:\\+srv)?://[^:]+:[^@]+@[^/]+',
    description: 'MongoDB Connection URL',
  },
  {
    id: 'redis-url',
    pattern: 'redis://[^:]+:[^@]+@[^/]+',
    description: 'Redis Connection URL',
  },
  {
    id: 'mysql-url',
    pattern: 'mysql://[^:]+:[^@]+@[^/]+',
    description: 'MySQL Connection URL',
  },

  // JWT
  {
    id: 'jwt',
    pattern: 'eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+',
    description: 'JSON Web Token',
  },

  // NPM
  {
    id: 'npm-token',
    pattern: 'npm_[A-Za-z0-9]{36}',
    description: 'NPM Access Token',
  },

  // Generic patterns (lower priority, more false positives)
  {
    id: 'generic-api-key',
    pattern:
      '(?:api[_-]?key|apikey|auth[_-]?token)\\s*[=:]\\s*["\']?[A-Za-z0-9_-]{20,}["\']?',
    description: 'Generic API Key Assignment',
  },
  {
    id: 'generic-secret',
    pattern: '(?:secret|password|passwd|pwd)\\s*[=:]\\s*["\'][^"\']{8,}["\']',
    description: 'Generic Secret Assignment',
  },
];

// ============================================================================
// Compiled Pattern
// ============================================================================

/**
 * A secret pattern with compiled RegExp for efficient matching.
 */
export interface CompiledPattern {
  /** Original pattern definition */
  pattern: SecretPattern;
  /** Compiled RegExp object */
  regex: RegExp;
}

// ============================================================================
// Pattern Compilation
// ============================================================================

/**
 * Compile an array of secret patterns into RegExp objects.
 * Invalid patterns are logged and skipped.
 *
 * @param patterns - Array of secret patterns to compile
 * @returns Array of compiled patterns with RegExp objects
 */
export function compilePatterns(patterns: SecretPattern[]): CompiledPattern[] {
  const compiled: CompiledPattern[] = [];

  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern.pattern, 'g');
      compiled.push({ pattern, regex });
    } catch (error) {
      logger.warn(
        { patternId: pattern.id, error },
        `Invalid regex pattern for ${pattern.id}, skipping`
      );
    }
  }

  return compiled;
}

/**
 * Get compiled built-in patterns.
 * Caches the compilation result for efficiency.
 */
let cachedBuiltinPatterns: CompiledPattern[] | null = null;

export function getCompiledBuiltinPatterns(): CompiledPattern[] {
  if (!cachedBuiltinPatterns) {
    cachedBuiltinPatterns = compilePatterns(BUILTIN_SECRET_PATTERNS);
  }
  return cachedBuiltinPatterns;
}
