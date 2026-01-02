/**
 * Security Enforcement Module
 *
 * Public API for security enforcement including the engine,
 * aggregator, and result types.
 */

// Types
export type { EnforcementResult, EnforcementSummary, CategorizedFindings } from './types.js';

// Aggregator
export { FindingAggregator, findingAggregator } from './aggregator.js';

// Engine
export { SecurityEnforcementEngine, securityEngine } from './engine.js';
