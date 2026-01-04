/**
 * Billing Module
 * v0.2.31 - Local usage tracking for self-hosted AgentGate
 *
 * Provides:
 * - Token usage tracking per execution
 * - Cost calculation based on model pricing
 * - Usage aggregation and reporting
 */

// Types
export type {
  ModelPricing,
  SupportedModel,
  UsageRecord,
  UsageAggregate,
  UsageQueryFilters,
  CostEstimate,
} from './types.js';

// Cost Calculator
export {
  calculateCost,
  estimateCost,
  formatCost,
  formatTokens,
  getModelPricing,
  getSupportedModels,
  isModelSupported,
} from './cost-calculator.js';

// Usage Store
export { UsageStore, getUsageStore } from './usage-store.js';

// Usage Service
export { UsageService, getUsageService } from './usage-service.js';
