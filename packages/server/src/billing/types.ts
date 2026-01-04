/**
 * Billing & Usage Types
 * v0.2.31 - Token tracking for SaaS credit-based billing
 */

/**
 * Model pricing tiers (cost per 1M tokens in USD)
 */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  /** Optional cached input pricing */
  cachedInputPer1M?: number;
}

/**
 * Supported models with pricing
 */
export type SupportedModel =
  | 'claude-opus-4-5-20251101'
  | 'claude-sonnet-4-20250514'
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-opus-20240229'
  | 'claude-3-sonnet-20240229'
  | 'claude-3-haiku-20240307';

/**
 * Usage record for a single agent execution
 */
export interface UsageRecord {
  /** Unique record ID */
  id: string;
  /** Work order ID */
  workOrderId: string;
  /** Run ID */
  runId: string;
  /** Iteration number */
  iteration: number;
  /** User/Organization ID (for multi-tenant) */
  userId?: string;
  /** Model used */
  model: string;
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Cached input tokens (if applicable) */
  cachedInputTokens?: number;
  /** Calculated cost in USD */
  costUsd: number;
  /** Billing method */
  billingMethod: 'api-key' | 'subscription';
  /** Duration of execution in ms */
  durationMs: number;
  /** Timestamp */
  timestamp: Date;
  /** Session ID for tracking conversation continuity */
  sessionId?: string;
}

/**
 * Aggregated usage for a time period
 */
export interface UsageAggregate {
  /** Total input tokens */
  totalInputTokens: number;
  /** Total output tokens */
  totalOutputTokens: number;
  /** Total cached input tokens */
  totalCachedInputTokens: number;
  /** Total cost in USD */
  totalCostUsd: number;
  /** Number of executions */
  executionCount: number;
  /** Number of work orders */
  workOrderCount: number;
  /** Total duration in ms */
  totalDurationMs: number;
  /** Breakdown by model */
  byModel: Record<string, {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    count: number;
  }>;
  /** Period start */
  periodStart: Date;
  /** Period end */
  periodEnd: Date;
}

/**
 * User/Organization credit balance
 */
export interface CreditBalance {
  /** User/Organization ID */
  userId: string;
  /** Current credit balance in USD */
  balanceUsd: number;
  /** Lifetime credits purchased */
  lifetimePurchasedUsd: number;
  /** Lifetime credits used */
  lifetimeUsedUsd: number;
  /** Credit limit (0 = unlimited) */
  limitUsd: number;
  /** Alert threshold percentage (e.g., 0.2 = alert at 20% remaining) */
  alertThreshold: number;
  /** Last updated */
  updatedAt: Date;
}

/**
 * Budget alert
 */
export interface BudgetAlert {
  id: string;
  userId: string;
  type: 'low_balance' | 'limit_reached' | 'unusual_usage';
  message: string;
  balanceUsd: number;
  thresholdUsd: number;
  timestamp: Date;
  acknowledged: boolean;
}

/**
 * Usage query filters
 */
export interface UsageQueryFilters {
  userId?: string;
  workOrderId?: string;
  runId?: string;
  model?: string;
  billingMethod?: 'api-key' | 'subscription';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Cost estimate for a planned execution
 */
export interface CostEstimate {
  /** Estimated input tokens */
  estimatedInputTokens: number;
  /** Estimated output tokens */
  estimatedOutputTokens: number;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Model used for estimate */
  model: string;
  /** Confidence level (0-1) */
  confidence: number;
  /** Basis for estimate */
  basis: 'historical_average' | 'task_complexity' | 'default';
}
