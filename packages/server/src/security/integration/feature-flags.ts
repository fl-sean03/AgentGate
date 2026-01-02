/**
 * Security Engine Feature Flags
 *
 * Feature flags for gradual rollout of the new Security Policy Engine.
 */

// ============================================================================
// Environment Variables
// ============================================================================

/**
 * Check if the new security engine is enabled.
 * Reads from AGENTGATE_NEW_SECURITY environment variable.
 * Default: false (use legacy during rollout)
 */
export function isSecurityEngineEnabled(override?: boolean): boolean {
  if (override !== undefined) {
    return override;
  }

  const envValue = process.env.AGENTGATE_NEW_SECURITY;
  return envValue === 'true' || envValue === '1';
}

/**
 * Check if security audit logging is enabled.
 * Reads from AGENTGATE_SECURITY_AUDIT environment variable.
 * Default: true when new security engine is enabled
 */
export function isSecurityAuditEnabled(override?: boolean): boolean {
  if (override !== undefined) {
    return override;
  }

  const envValue = process.env.AGENTGATE_SECURITY_AUDIT;
  if (envValue === 'false' || envValue === '0') {
    return false;
  }
  if (envValue === 'true' || envValue === '1') {
    return true;
  }

  // Default to enabled when security engine is enabled
  return isSecurityEngineEnabled();
}

/**
 * Check if strict mode is enabled.
 * In strict mode, warnings become blocking errors.
 * Reads from AGENTGATE_SECURITY_STRICT environment variable.
 * Default: false
 */
export function isStrictModeEnabled(override?: boolean): boolean {
  if (override !== undefined) {
    return override;
  }

  const envValue = process.env.AGENTGATE_SECURITY_STRICT;
  return envValue === 'true' || envValue === '1';
}

// ============================================================================
// Feature Flag Constants
// ============================================================================

/**
 * Current security engine version.
 */
export const SECURITY_ENGINE_VERSION = '1.0.0';

/**
 * Environment variable names for security configuration.
 */
export const SECURITY_ENV_VARS = {
  /** Enable new security engine */
  NEW_SECURITY: 'AGENTGATE_NEW_SECURITY',
  /** Enable security audit logging */
  SECURITY_AUDIT: 'AGENTGATE_SECURITY_AUDIT',
  /** Enable strict mode */
  SECURITY_STRICT: 'AGENTGATE_SECURITY_STRICT',
  /** Audit log destination */
  AUDIT_DESTINATION: 'AGENTGATE_AUDIT_DESTINATION',
  /** Audit log path */
  AUDIT_PATH: 'AGENTGATE_AUDIT_PATH',
  /** Include content in audit logs */
  AUDIT_CONTENT: 'AGENTGATE_AUDIT_CONTENT',
} as const;
