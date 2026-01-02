/**
 * Security Policy Engine - Core Types
 *
 * Type definitions for the Security Policy Engine supporting sensitivity levels,
 * enforcement actions, detector configuration, allowlist entries, and audit types.
 */

// ============================================================================
// Sensitivity Level
// ============================================================================

/**
 * Sensitivity levels for security findings.
 * - INFO: Informational only, logged but not blocked
 * - WARNING: Warning level, logged, blocks in strict mode
 * - SENSITIVE: Requires explicit allowlist to proceed
 * - RESTRICTED: Always blocked, no override possible
 */
export const SensitivityLevel = {
  INFO: 'info',
  WARNING: 'warning',
  SENSITIVE: 'sensitive',
  RESTRICTED: 'restricted',
} as const;

export type SensitivityLevel = (typeof SensitivityLevel)[keyof typeof SensitivityLevel];

// ============================================================================
// Enforcement Action
// ============================================================================

/**
 * Actions to take when a security finding is detected.
 * - LOG: Log only, don't block
 * - WARN: Warn user, continue execution
 * - BLOCK: Block execution, require explicit override
 * - DENY: Always block, no override possible
 */
export const EnforcementAction = {
  LOG: 'log',
  WARN: 'warn',
  BLOCK: 'block',
  DENY: 'deny',
} as const;

export type EnforcementAction = (typeof EnforcementAction)[keyof typeof EnforcementAction];

// ============================================================================
// Detector Config
// ============================================================================

/**
 * Configuration for a security detector.
 */
export interface DetectorConfig {
  /** Detector type identifier (content, entropy, pattern, gitignore) */
  type: string;
  /** Whether detector is active */
  enabled: boolean;
  /** Default sensitivity for findings from this detector */
  sensitivity: SensitivityLevel;
  /** Detector-specific options */
  options?: Record<string, unknown>;
}

// ============================================================================
// Allowlist Entry
// ============================================================================

/**
 * Entry in the security allowlist for exempting specific files/patterns.
 */
export interface AllowlistEntry {
  /** Glob pattern or exact path to allow */
  pattern: string;
  /** Required justification for allowlisting */
  reason: string;
  /** Who approved this entry */
  approvedBy?: string;
  /** ISO date for expiration (optional) */
  expiresAt?: string;
  /** Which detectors this applies to (empty = all) */
  detectors?: string[];
}

// ============================================================================
// Runtime Config
// ============================================================================

/**
 * Runtime file access monitoring configuration.
 */
export interface RuntimeConfig {
  /** Enable runtime file access monitoring */
  enabled: boolean;
  /** Block access to sensitive files during execution */
  blockAccess: boolean;
  /** Log all file access attempts */
  logAccess: boolean;
}

// ============================================================================
// Audit Config
// ============================================================================

/**
 * Audit destination types.
 */
export const AuditDestination = {
  FILE: 'file',
  STDOUT: 'stdout',
  SYSLOG: 'syslog',
  CUSTOM: 'custom',
} as const;

export type AuditDestination = (typeof AuditDestination)[keyof typeof AuditDestination];

/**
 * Audit logging configuration.
 */
export interface AuditConfig {
  /** Enable audit logging */
  enabled: boolean;
  /** Where to write logs */
  destination: AuditDestination;
  /** Log file path (if destination is 'file') */
  path?: string;
  /** Include file contents in audit (careful!) */
  includeContent: boolean;
  /** Retention period for audit logs in days */
  retentionDays: number;
}

// ============================================================================
// Enforcement Map
// ============================================================================

/**
 * Mapping from sensitivity levels to enforcement actions.
 */
export type EnforcementMap = Record<SensitivityLevel, EnforcementAction>;

// ============================================================================
// Security Policy
// ============================================================================

/**
 * Main security policy configuration.
 */
export interface SecurityPolicy {
  /** Policy version for compatibility */
  version: '1.0';
  /** Human-readable policy name */
  name: string;
  /** Parent policy to inherit from */
  extends?: string;
  /** Detector configurations */
  detectors: DetectorConfig[];
  /** Sensitivity level to enforcement action mapping */
  enforcement: EnforcementMap;
  /** Explicit allowlist entries */
  allowlist: AllowlistEntry[];
  /** Files/directories to exclude from scanning */
  excludes: string[];
  /** Runtime enforcement settings */
  runtime: RuntimeConfig;
  /** Audit settings */
  audit: AuditConfig;
}

// ============================================================================
// Resolved Security Policy
// ============================================================================

/**
 * Fully-resolved security policy (after inheritance).
 * Contains all fields from SecurityPolicy plus resolution metadata.
 */
export interface ResolvedSecurityPolicy extends SecurityPolicy {
  /** Policy name or 'default' or 'inline' */
  source: string;
  /** Chain of extended policies */
  inheritanceChain: string[];
  /** When policy was resolved */
  resolvedAt: Date;
  /** Hash for audit comparison */
  hash: string;
}

// ============================================================================
// Secret Pattern
// ============================================================================

/**
 * A pattern for detecting secrets in content.
 */
export interface SecretPattern {
  /** Unique identifier for this pattern */
  id: string;
  /** Regular expression pattern */
  pattern: string;
  /** Human-readable description */
  description: string;
}

// ============================================================================
// Finding
// ============================================================================

/**
 * A security finding from a detector.
 */
export interface Finding {
  /** Rule ID (e.g., "aws-access-key") */
  ruleId: string;
  /** Human-readable description */
  message: string;
  /** Relative file path */
  file: string;
  /** Line number (1-indexed) */
  line?: number;
  /** Column number (1-indexed) */
  column?: number;
  /** Masked match value */
  match?: string;
  /** Sensitivity level of this finding */
  sensitivity: SensitivityLevel;
  /** Detector type that produced this finding */
  detector: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Enforcement Result
// ============================================================================

/**
 * Result of security enforcement.
 */
export interface EnforcementResult {
  /** Whether execution should proceed */
  allowed: boolean;
  /** All findings from detectors */
  findings: Finding[];
  /** Findings that were blocked */
  blocked: Finding[];
  /** Findings that were warned */
  warned: Finding[];
  /** Findings that were logged only */
  logged: Finding[];
  /** The resolved policy that was applied */
  policy: ResolvedSecurityPolicy;
}
