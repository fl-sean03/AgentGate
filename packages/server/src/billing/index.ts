/**
 * Billing Module
 * v0.2.31 - Token tracking and usage billing for SaaS
 *
 * Provides:
 * - Token usage tracking per execution
 * - Cost calculation based on model pricing
 * - Credit balance management
 * - Usage aggregation and reporting
 */

// Types
export type {
  ModelPricing,
  SupportedModel,
  UsageRecord,
  UsageAggregate,
  CreditBalance,
  BudgetAlert,
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
