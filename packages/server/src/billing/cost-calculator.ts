/**
 * Cost Calculator
 * v0.2.31 - Calculate costs from token usage
 *
 * Pricing source: https://www.anthropic.com/pricing
 */

import type { ModelPricing, SupportedModel, CostEstimate } from './types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('cost-calculator');

/**
 * Model pricing table (USD per 1M tokens)
 * Updated: January 2025
 */
const MODEL_PRICING: Record<SupportedModel, ModelPricing> = {
  // Claude 4.5 (Opus)
  'claude-opus-4-5-20251101': {
    inputPer1M: 15.00,
    outputPer1M: 75.00,
    cachedInputPer1M: 1.50,
  },
  // Claude 4 (Sonnet)
  'claude-sonnet-4-20250514': {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cachedInputPer1M: 0.30,
  },
  // Claude 3.5 Sonnet
  'claude-3-5-sonnet-20241022': {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cachedInputPer1M: 0.30,
  },
  // Claude 3.5 Haiku
  'claude-3-5-haiku-20241022': {
    inputPer1M: 0.80,
    outputPer1M: 4.00,
    cachedInputPer1M: 0.08,
  },
  // Claude 3 Opus (legacy)
  'claude-3-opus-20240229': {
    inputPer1M: 15.00,
    outputPer1M: 75.00,
    cachedInputPer1M: 1.50,
  },
  // Claude 3 Sonnet (legacy)
  'claude-3-sonnet-20240229': {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cachedInputPer1M: 0.30,
  },
  // Claude 3 Haiku (legacy)
  'claude-3-haiku-20240307': {
    inputPer1M: 0.25,
    outputPer1M: 1.25,
    cachedInputPer1M: 0.03,
  },
};

/**
 * Default pricing for unknown models (use Sonnet pricing as baseline)
 */
const DEFAULT_PRICING: ModelPricing = {
  inputPer1M: 3.00,
  outputPer1M: 15.00,
  cachedInputPer1M: 0.30,
};

/**
 * Get pricing for a model
 */
export function getModelPricing(model: string): ModelPricing {
  // Check for exact match
  if (model in MODEL_PRICING) {
    return MODEL_PRICING[model as SupportedModel];
  }

  // Check for partial match (e.g., "claude-3-5-sonnet" matches "claude-3-5-sonnet-20241022")
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.includes(key.split('-').slice(0, -1).join('-'))) {
      return pricing;
    }
  }

  // Infer from model name
  if (model.includes('opus')) {
    return MODEL_PRICING['claude-opus-4-5-20251101'];
  }
  if (model.includes('haiku')) {
    return MODEL_PRICING['claude-3-5-haiku-20241022'];
  }

  logger.warn({ model }, 'Unknown model, using default pricing');
  return DEFAULT_PRICING;
}

/**
 * Calculate cost from token usage
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
  cachedInputTokens: number = 0
): number {
  const pricing = getModelPricing(model);

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  const cachedCost = cachedInputTokens > 0 && pricing.cachedInputPer1M
    ? (cachedInputTokens / 1_000_000) * pricing.cachedInputPer1M
    : 0;

  const totalCost = inputCost + outputCost + cachedCost;

  // Round to 6 decimal places to avoid floating point issues
  return Math.round(totalCost * 1_000_000) / 1_000_000;
}

/**
 * Format cost for display
 */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.01) {
    return `$${costUsd.toFixed(4)}`;
  }
  if (costUsd < 1) {
    return `$${costUsd.toFixed(3)}`;
  }
  return `$${costUsd.toFixed(2)}`;
}

/**
 * Format tokens for display
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Estimate cost for a task based on complexity
 */
export function estimateCost(
  taskPrompt: string,
  model: string,
  options: {
    expectedIterations?: number;
    taskComplexity?: 'simple' | 'medium' | 'complex';
    historicalAverage?: { inputTokens: number; outputTokens: number };
  } = {}
): CostEstimate {
  const { expectedIterations = 1, taskComplexity = 'medium', historicalAverage } = options;

  let estimatedInputTokens: number;
  let estimatedOutputTokens: number;
  let confidence: number;
  let basis: CostEstimate['basis'];

  if (historicalAverage) {
    // Use historical data
    estimatedInputTokens = historicalAverage.inputTokens * expectedIterations;
    estimatedOutputTokens = historicalAverage.outputTokens * expectedIterations;
    confidence = 0.8;
    basis = 'historical_average';
  } else {
    // Estimate based on task complexity
    const promptTokens = Math.ceil(taskPrompt.length / 4); // Rough estimate

    switch (taskComplexity) {
      case 'simple':
        estimatedInputTokens = promptTokens + 5000;
        estimatedOutputTokens = 2000;
        break;
      case 'complex':
        estimatedInputTokens = promptTokens + 50000;
        estimatedOutputTokens = 20000;
        break;
      case 'medium':
      default:
        estimatedInputTokens = promptTokens + 20000;
        estimatedOutputTokens = 8000;
    }

    estimatedInputTokens *= expectedIterations;
    estimatedOutputTokens *= expectedIterations;
    confidence = 0.5;
    basis = 'task_complexity';
  }

  const estimatedCostUsd = calculateCost(estimatedInputTokens, estimatedOutputTokens, model);

  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUsd,
    model,
    confidence,
    basis,
  };
}

/**
 * Get all supported models
 */
export function getSupportedModels(): SupportedModel[] {
  return Object.keys(MODEL_PRICING) as SupportedModel[];
}

/**
 * Check if a model is supported
 */
export function isModelSupported(model: string): model is SupportedModel {
  return model in MODEL_PRICING;
}
