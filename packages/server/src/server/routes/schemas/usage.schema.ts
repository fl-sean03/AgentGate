/**
 * Usage API Schemas
 * v0.2.31 - Schema definitions for usage tracking endpoints
 */

import { z } from 'zod';

/**
 * Query parameters for usage listing
 */
export const usageQuerySchema = z.object({
  workOrderId: z.string().optional(),
  runId: z.string().optional(),
  model: z.string().optional(),
  startDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  endDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
});

export type UsageQuery = z.input<typeof usageQuerySchema>;

/**
 * Work order usage params
 */
export const workOrderUsageParamsSchema = z.object({
  workOrderId: z.string().min(1),
});

export type WorkOrderUsageParams = z.infer<typeof workOrderUsageParamsSchema>;

/**
 * Usage summary response
 */
export const usageSummaryResponseSchema = z.object({
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCachedInputTokens: z.number(),
  totalCostUsd: z.number(),
  executionCount: z.number(),
  workOrderCount: z.number(),
  totalDurationMs: z.number(),
  byModel: z.record(z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number(),
    count: z.number(),
  })),
  periodStart: z.string(),
  periodEnd: z.string(),
});

export type UsageSummaryResponse = z.infer<typeof usageSummaryResponseSchema>;

/**
 * Usage record response
 */
export const usageRecordResponseSchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  runId: z.string(),
  iteration: z.number(),
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cachedInputTokens: z.number().optional(),
  costUsd: z.number(),
  durationMs: z.number(),
  timestamp: z.string(),
});

export type UsageRecordResponse = z.infer<typeof usageRecordResponseSchema>;
