/**
 * Gate Resolver module.
 * Provides functionality to resolve and generate verification gate plans.
 */

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
