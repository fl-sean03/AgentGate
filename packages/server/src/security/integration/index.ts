/**
 * Security Integration Module
 *
 * Public API for integrating the Security Policy Engine with L0 verification.
 */

// Feature Flags
export {
  isSecurityEngineEnabled,
  isSecurityAuditEnabled,
  isStrictModeEnabled,
  SECURITY_ENGINE_VERSION,
  SECURITY_ENV_VARS,
} from './feature-flags.js';

// L0 Bridge
export {
  runSecurityVerification,
  mapEnforcementToCheckResult,
  addSecurityDiagnostics,
  convertForbiddenPatternsToPolicy,
  type SecurityCheckResult,
} from './l0-bridge.js';
