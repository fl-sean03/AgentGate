/**
 * Security Policy Engine
 *
 * Public API for the Security Policy Engine module.
 */

// Types
export {
  SensitivityLevel,
  EnforcementAction,
  AuditDestination,
  type DetectorConfig,
  type AllowlistEntry,
  type RuntimeConfig,
  type AuditConfig,
  type EnforcementMap,
  type SecurityPolicy,
  type ResolvedSecurityPolicy,
  type SecretPattern,
  type Finding,
  type EnforcementResult,
} from './types.js';

// Schemas
export {
  sensitivityLevelSchema,
  enforcementActionSchema,
  auditDestinationSchema,
  detectorConfigSchema,
  allowlistEntrySchema,
  runtimeConfigSchema,
  auditConfigSchema,
  enforcementMapSchema,
  securityPolicySchema,
  partialSecurityPolicySchema,
  secretPatternSchema,
  findingSchema,
  type DetectorConfigInput,
  type AllowlistEntryInput,
  type SecurityPolicyInput,
  type PartialSecurityPolicyInput,
} from './schemas.js';

// Policy module
export * from './policy/index.js';

// Detectors module
export * from './detectors/index.js';
