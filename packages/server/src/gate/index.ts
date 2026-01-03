/**
 * Gate Module (v0.2.24)
 *
 * Unified gate framework for verification checkpoints.
 * Also re-exports legacy gate resolver functionality.
 *
 * @module gate
 */

// ═══════════════════════════════════════════════════════════════════════════
// v0.2.24 GATE RUNNER FRAMEWORK
// ═══════════════════════════════════════════════════════════════════════════

// Runner types and base class
export type {
  GateRunner,
  GateContext,
  ValidationResult,
  FormattedFailure,
  VerificationDetails,
  GitHubActionsDetails,
  CustomCommandDetails,
  ApprovalDetails,
  ConvergenceDetails,
  GateDetails,
} from './runner-types.js';
export { BaseGateRunner } from './base-runner.js';

// Registry
export {
  GateRunnerRegistry,
  createGateRunnerRegistry,
  gateRunnerRegistry,
  type GateRunnerFactory,
} from './registry.js';

// Pipeline
export {
  GatePipeline,
  createGatePipeline,
  type PipelineContext,
  type PipelineOptions,
} from './pipeline.js';

// Runners
export {
  VerificationGateRunner,
  createVerificationGateRunner,
  GitHubActionsGateRunner,
  createGitHubActionsGateRunner,
  CustomCommandGateRunner,
  createCustomCommandGateRunner,
  ConvergenceGateRunner,
  createConvergenceGateRunner,
  ApprovalGateRunner,
  createApprovalGateRunner,
} from './runners/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY GATE RESOLVER (for backwards compatibility)
// ═══════════════════════════════════════════════════════════════════════════

// Error types
export {
  ProfileNotFoundError,
  ProfileParseError,
  ProfileValidationError,
} from './errors.js';

// Verify profile parser
export {
  parseVerifyProfile,
  loadVerifyProfile,
  validateProfile,
  findProfilePath,
  getSearchPaths,
} from './verify-profile-parser.js';

// GitHub Actions parser
export {
  parseGitHubActions,
  extractRunCommands,
  extractNodeVersion,
  isSimpleWorkflow,
  type CIPlan,
} from './github-actions-parser.js';

// CI ingestion
export {
  ingestCIWorkflows,
  findCIConfigs,
  hasCIConfig,
} from './ci-ingestion.js';

// Normalizer
export {
  normalizeFromProfile,
  normalizeFromCI,
  createDefaultPlan,
  mergePlans,
} from './normalizer.js';

// Resolver
export {
  resolveGatePlan,
  resolveGatePlanWithWarnings,
  detectGateConfig,
  type ResolveResult,
} from './resolver.js';

// Summary
export {
  generateGateSummary,
  generateCompactSummary,
  generateSummaryObject,
} from './summary.js';
