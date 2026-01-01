/**
 * Harness Module
 *
 * The harness module provides loop control and strategy management
 * for agent execution. It supports multiple iteration strategies
 * (fixed, ralph, hybrid) and provides facilities for:
 *
 * - Progress tracking
 * - Loop detection
 * - Early termination
 * - Strategy switching
 *
 * @module harness
 */

// Strategy Registry
export {
  StrategyRegistry,
  StrategyNotFoundError,
  DuplicateStrategyError,
  getStrategyRegistry,
  createStrategy,
} from './strategy-registry.js';

// Strategies
export {
  BaseStrategy,
  FixedStrategy,
  createFixedStrategy,
  HybridStrategy,
  createHybridStrategy,
  RalphStrategy,
  createRalphStrategy,
  CustomStrategy,
  createCustomStrategy,
  CustomStrategyLoadError,
  CustomStrategyNotFoundError,
  CustomStrategyInvalidError,
} from './strategies/index.js';

// Config Loader
export {
  listProfiles,
  loadProfile,
  profileExists,
  saveProfile,
  ensureHarnessDir,
  HARNESS_DIR,
  DEFAULT_PROFILE_NAME,
  PROFILE_EXTENSION,
  ProfileNotFoundError,
  ProfileParseError,
  ProfileValidationError,
  type HarnessProfileInfo,
} from './config-loader.js';

// Config Resolver
export {
  resolveHarnessConfig,
  resolveInheritance,
  mergeConfigs,
  applyDefaults,
  applyCLIOverrides,
  cliOptionsToOverrides,
  computeConfigHash,
  createDefaultConfig,
  CircularInheritanceError,
  InheritanceDepthError,
  type ResolveOptions,
  type CLIOptions,
} from './config-resolver.js';

// Audit Trail (v0.2.16 - Thrust 11)
export {
  AuditTrail,
  createAuditTrail,
  loadAuditRecord,
  listAuditRecords,
  deleteAuditRecord,
  type ConfigChange,
  type ConfigSnapshot,
  type ConfigAuditRecord,
} from './audit-trail.js';
