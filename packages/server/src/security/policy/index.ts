/**
 * Security Policy Engine - Policy Module
 *
 * Public API for policy loading, resolution, and defaults.
 */

// Defaults
export {
  DEFAULT_POLICY,
  DEFAULT_SECRET_PATTERNS,
  DEFAULT_FORBIDDEN_PATTERNS,
  DEFAULT_EXCLUDES,
  STRICT_POLICY,
  RELAXED_POLICY,
  BUILTIN_PROFILE_NAMES,
  type BuiltinProfileName,
  isBuiltinProfile,
  getBuiltinPolicy,
} from './defaults.js';

// Loader
export {
  getSecurityProfileDir,
  getProjectPolicyPath,
  getProfilePolicyPath,
  loadPolicyFromFile,
  loadPartialPolicyFromFile,
  loadProjectPolicy,
  loadProfilePolicy,
  listAvailableProfiles,
} from './loader.js';

// Resolver
export {
  mergeDetectors,
  mergeEnforcement,
  mergeAllowlist,
  mergeExcludes,
  mergeRuntimeConfig,
  mergeAuditConfig,
  mergePolicies,
  handleInheritance,
  computePolicyHash,
  resolveSecurityPolicy,
} from './resolver.js';
