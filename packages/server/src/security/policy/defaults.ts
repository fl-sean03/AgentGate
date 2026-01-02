/**
 * Security Policy Engine - Default Policy
 *
 * Built-in default security policy and patterns shipped with AgentGate.
 */

import {
  SecurityPolicy,
  SecretPattern,
  SensitivityLevel,
  EnforcementAction,
  AuditDestination,
} from '../types.js';

// ============================================================================
// Default Secret Patterns
// ============================================================================

/**
 * Default patterns for detecting secrets in content.
 * Each pattern includes an ID, regex pattern, and description.
 */
export const DEFAULT_SECRET_PATTERNS: SecretPattern[] = [
  {
    id: 'aws-access-key-id',
    pattern: 'AKIA[0-9A-Z]{16}',
    description: 'AWS Access Key ID',
  },
  {
    id: 'aws-secret-access-key',
    pattern: '[A-Za-z0-9/+=]{40}',
    description: 'AWS Secret Access Key (40-char base64-like)',
  },
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
    id: 'stripe-secret-key',
    pattern: 'sk_live_[A-Za-z0-9]{24,}',
    description: 'Stripe Secret Key',
  },
  {
    id: 'stripe-publishable-key',
    pattern: 'pk_live_[A-Za-z0-9]{24,}',
    description: 'Stripe Publishable Key',
  },
  {
    id: 'private-key',
    pattern: '-----BEGIN .*PRIVATE KEY-----',
    description: 'Private Key (PEM format)',
  },
  {
    id: 'slack-token',
    pattern: 'xox[baprs]-[0-9a-zA-Z-]{10,}',
    description: 'Slack Token',
  },
  {
    id: 'google-api-key',
    pattern: 'AIza[0-9A-Za-z\\-_]{35}',
    description: 'Google API Key',
  },
  {
    id: 'postgresql-url',
    pattern: 'postgres(?:ql)?://[^:]+:[^@]+@',
    description: 'PostgreSQL Connection URL with credentials',
  },
  {
    id: 'mongodb-url',
    pattern: 'mongodb(?:\\+srv)?://[^:]+:[^@]+@',
    description: 'MongoDB Connection URL with credentials',
  },
  {
    id: 'redis-url',
    pattern: 'redis://[^:]+:[^@]+@',
    description: 'Redis Connection URL with credentials',
  },
  {
    id: 'jwt-token',
    pattern: 'eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+',
    description: 'JWT Token',
  },
  {
    id: 'npm-token',
    pattern: 'npm_[A-Za-z0-9]{36}',
    description: 'NPM Access Token',
  },
];

// ============================================================================
// Default Forbidden Patterns
// ============================================================================

/**
 * Default glob patterns for files that should never be committed.
 */
export const DEFAULT_FORBIDDEN_PATTERNS: string[] = [
  '**/.env',
  '**/.env.*',
  '**/credentials.json',
  '**/service-account*.json',
  '**/*.pem',
  '**/*.key',
  '**/id_rsa*',
  '**/id_ed25519*',
  '**/.npmrc',
];

// ============================================================================
// Default Excludes
// ============================================================================

/**
 * Default patterns for directories/files to exclude from scanning.
 */
export const DEFAULT_EXCLUDES: string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.git/**',
  '**/vendor/**',
  '**/__pycache__/**',
  '**/venv/**',
  '**/.venv/**',
];

// ============================================================================
// Default Policy
// ============================================================================

/**
 * The built-in default security policy.
 * This policy is always used as the base and can be extended/overridden.
 */
export const DEFAULT_POLICY: SecurityPolicy = {
  version: '1.0',
  name: 'default',

  detectors: [
    {
      type: 'pattern',
      enabled: true,
      sensitivity: SensitivityLevel.SENSITIVE,
      options: {
        patterns: DEFAULT_FORBIDDEN_PATTERNS,
      },
    },
    {
      type: 'content',
      enabled: true,
      sensitivity: SensitivityLevel.RESTRICTED,
      options: {
        patterns: DEFAULT_SECRET_PATTERNS,
      },
    },
    {
      type: 'entropy',
      enabled: true,
      sensitivity: SensitivityLevel.WARNING,
      options: {
        threshold: 4.5,
      },
    },
    {
      type: 'gitignore',
      enabled: true,
      sensitivity: SensitivityLevel.INFO,
      options: {},
    },
  ],

  enforcement: {
    [SensitivityLevel.INFO]: EnforcementAction.LOG,
    [SensitivityLevel.WARNING]: EnforcementAction.WARN,
    [SensitivityLevel.SENSITIVE]: EnforcementAction.BLOCK,
    [SensitivityLevel.RESTRICTED]: EnforcementAction.DENY,
  },

  allowlist: [],

  excludes: DEFAULT_EXCLUDES,

  runtime: {
    enabled: true,
    blockAccess: true,
    logAccess: true,
  },

  audit: {
    enabled: true,
    destination: AuditDestination.FILE,
    includeContent: false,
    retentionDays: 90,
  },
};

// ============================================================================
// Built-in Profiles
// ============================================================================

/**
 * Reserved built-in profile names.
 */
export const BUILTIN_PROFILE_NAMES = ['default', 'strict', 'relaxed'] as const;

export type BuiltinProfileName = (typeof BUILTIN_PROFILE_NAMES)[number];

/**
 * Check if a profile name is a built-in profile.
 */
export function isBuiltinProfile(name: string): name is BuiltinProfileName {
  return BUILTIN_PROFILE_NAMES.includes(name as BuiltinProfileName);
}

/**
 * Strict profile - Maximum security (all detectors, no allowlist, deny by default).
 */
export const STRICT_POLICY: SecurityPolicy = {
  ...DEFAULT_POLICY,
  name: 'strict',
  enforcement: {
    [SensitivityLevel.INFO]: EnforcementAction.WARN,
    [SensitivityLevel.WARNING]: EnforcementAction.BLOCK,
    [SensitivityLevel.SENSITIVE]: EnforcementAction.DENY,
    [SensitivityLevel.RESTRICTED]: EnforcementAction.DENY,
  },
};

/**
 * Relaxed profile - Minimum security (warnings only).
 */
export const RELAXED_POLICY: SecurityPolicy = {
  ...DEFAULT_POLICY,
  name: 'relaxed',
  enforcement: {
    [SensitivityLevel.INFO]: EnforcementAction.LOG,
    [SensitivityLevel.WARNING]: EnforcementAction.LOG,
    [SensitivityLevel.SENSITIVE]: EnforcementAction.WARN,
    [SensitivityLevel.RESTRICTED]: EnforcementAction.BLOCK,
  },
};

/**
 * Get a built-in policy by name.
 */
export function getBuiltinPolicy(name: BuiltinProfileName): SecurityPolicy {
  switch (name) {
    case 'default':
      return DEFAULT_POLICY;
    case 'strict':
      return STRICT_POLICY;
    case 'relaxed':
      return RELAXED_POLICY;
  }
}
