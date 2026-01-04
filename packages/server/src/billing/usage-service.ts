/**
 * Usage Service
 * v0.2.31 - Integrates token tracking with agent execution
 *
 * Records usage after each agent execution and provides
 * aggregated views for billing purposes.
 */

import { createLogger } from '../utils/logger.js';
import { getUsageStore } from './usage-store.js';
import { calculateCost } from './cost-calculator.js';
import type { AgentResult, AgentStructuredOutput } from '../types/index.js';
import type { UsageRecord, UsageAggregate, UsageQueryFilters } from './types.js';

const logger = createLogger('usage-service');

/**
 * Usage Service for recording and querying agent usage
 */
export class UsageService {
  private static instance: UsageService | null = null;

  private constructor() {}

  static getInstance(): UsageService {
    if (!UsageService.instance) {
      UsageService.instance = new UsageService();
    }
    return UsageService.instance;
  }

  static resetInstance(): void {
    UsageService.instance = null;
  }

  /**
   * Record usage from an agent execution result
   */
  async recordExecution(
    workOrderId: string,
    runId: string,
    iteration: number,
    result: AgentResult,
    options: {
      billingMethod?: 'api-key' | 'subscription';
      userId?: string;
      sessionId?: string;
    } = {}
  ): Promise<UsageRecord | null> {
    const store = getUsageStore();
    const output = result.structuredOutput;

    // Determine primary model from modelUsage or fallback to result.model
    const model = this.getPrimaryModel(output) ?? result.model ?? 'unknown';

    // Get token counts
    const inputTokens = this.getTotalInputTokens(output, result);
    const outputTokens = this.getTotalOutputTokens(output, result);
    const cachedInputTokens = this.getCachedInputTokens(output, result);

    // Calculate or use provided cost
    const costUsd = output?.total_cost_usd ?? calculateCost(
      inputTokens,
      outputTokens,
      model,
      cachedInputTokens
    );

    // Skip recording if no meaningful usage
    if (inputTokens === 0 && outputTokens === 0) {
      logger.debug({ workOrderId, runId, iteration }, 'Skipping usage recording - no tokens used');
      return null;
    }

    try {
      const record = await store.recordUsage(workOrderId, runId, iteration, {
        model,
        inputTokens,
        outputTokens,
        cachedInputTokens: cachedInputTokens > 0 ? cachedInputTokens : undefined,
        costUsd,
        billingMethod: options.billingMethod ?? 'api-key',
        durationMs: result.durationMs,
        sessionId: options.sessionId ?? result.sessionId ?? undefined,
        userId: options.userId,
      });

      logger.info(
        {
          recordId: record.id,
          workOrderId,
          runId,
          iteration,
          model,
          inputTokens,
          outputTokens,
          cachedInputTokens,
          costUsd,
        },
        'Usage recorded for execution'
      );

      return record;
    } catch (error) {
      logger.error({ error, workOrderId, runId, iteration }, 'Failed to record usage');
      return null;
    }
  }

  /**
   * Record usage from per-model breakdown (for multi-model executions)
   */
  async recordMultiModelExecution(
    workOrderId: string,
    runId: string,
    iteration: number,
    output: AgentStructuredOutput,
    options: {
      billingMethod?: 'api-key' | 'subscription';
      userId?: string;
      sessionId?: string;
      durationMs: number;
    }
  ): Promise<UsageRecord[]> {
    const store = getUsageStore();
    const records: UsageRecord[] = [];

    if (!output.modelUsage) {
      logger.debug({ workOrderId, runId }, 'No per-model usage data available');
      return records;
    }

    for (const [model, usage] of Object.entries(output.modelUsage)) {
      const cachedInputTokens = usage.cacheReadInputTokens + usage.cacheCreationInputTokens;

      try {
        const record = await store.recordUsage(workOrderId, runId, iteration, {
          model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedInputTokens: cachedInputTokens > 0 ? cachedInputTokens : undefined,
          costUsd: usage.costUSD,
          billingMethod: options.billingMethod ?? 'api-key',
          durationMs: options.durationMs,
          sessionId: options.sessionId,
          userId: options.userId,
        });

        records.push(record);
      } catch (error) {
        logger.error({ error, workOrderId, runId, model }, 'Failed to record model usage');
      }
    }

    logger.info(
      {
        workOrderId,
        runId,
        iteration,
        modelCount: records.length,
        totalCost: records.reduce((sum, r) => sum + r.costUsd, 0),
      },
      'Multi-model usage recorded'
    );

    return records;
  }

  /**
   * Get usage summary for a work order
   */
  async getWorkOrderUsage(workOrderId: string): Promise<UsageAggregate> {
    const store = getUsageStore();
    return store.getWorkOrderUsage(workOrderId);
  }

  /**
   * Get usage summary for a time period
   */
  async getUsageSummary(filters: UsageQueryFilters = {}): Promise<UsageAggregate> {
    const store = getUsageStore();
    return store.getUsageAggregate(filters);
  }

  /**
   * Get recent usage records
   */
  async getRecentUsage(limit = 100): Promise<UsageRecord[]> {
    const store = getUsageStore();
    return store.queryUsage({ limit });
  }

  /**
   * Get usage records for a specific user
   */
  async getUserUsage(userId: string, filters: UsageQueryFilters = {}): Promise<UsageRecord[]> {
    const store = getUsageStore();
    return store.queryUsage({ ...filters, userId });
  }

  // Private helper methods

  private getPrimaryModel(output: AgentStructuredOutput | null): string | null {
    if (!output?.modelUsage) {
      return null;
    }

    // Find the model with highest cost (primary model)
    let primaryModel: string | null = null;
    let maxCost = 0;

    for (const [model, usage] of Object.entries(output.modelUsage)) {
      if (usage.costUSD > maxCost) {
        maxCost = usage.costUSD;
        primaryModel = model;
      }
    }

    return primaryModel;
  }

  private getTotalInputTokens(output: AgentStructuredOutput | null, result: AgentResult): number {
    // Prefer modelUsage aggregate
    if (output?.modelUsage) {
      let total = 0;
      for (const usage of Object.values(output.modelUsage)) {
        total += usage.inputTokens;
      }
      return total;
    }

    // Fall back to usage.input_tokens
    if (output?.usage?.input_tokens) {
      return output.usage.input_tokens;
    }

    // Fall back to result.tokensUsed
    return result.tokensUsed?.input ?? 0;
  }

  private getTotalOutputTokens(output: AgentStructuredOutput | null, result: AgentResult): number {
    // Prefer modelUsage aggregate
    if (output?.modelUsage) {
      let total = 0;
      for (const usage of Object.values(output.modelUsage)) {
        total += usage.outputTokens;
      }
      return total;
    }

    // Fall back to usage.output_tokens
    if (output?.usage?.output_tokens) {
      return output.usage.output_tokens;
    }

    // Fall back to result.tokensUsed
    return result.tokensUsed?.output ?? 0;
  }

  private getCachedInputTokens(
    output: AgentStructuredOutput | null,
    result: AgentResult
  ): number {
    // Prefer modelUsage aggregate
    if (output?.modelUsage) {
      let total = 0;
      for (const usage of Object.values(output.modelUsage)) {
        total += usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
      }
      return total;
    }

    // Fall back to usage cache tokens
    if (output?.usage) {
      return (
        (output.usage.cache_read_input_tokens ?? 0) +
        (output.usage.cache_creation_input_tokens ?? 0)
      );
    }

    // Fall back to result.tokensUsed
    return (result.tokensUsed?.cacheRead ?? 0) + (result.tokensUsed?.cacheCreation ?? 0);
  }
}

/**
 * Get the usage service instance
 */
export function getUsageService(): UsageService {
  return UsageService.getInstance();
}
