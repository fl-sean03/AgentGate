/**
 * Usage Routes
 * v0.2.31 - API endpoints for token usage tracking
 *
 * Provides endpoints to query usage data for local cost tracking.
 * Note: This is for personal usage tracking, not SaaS billing.
 */

import type { FastifyInstance } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../types.js';
import {
  usageQuerySchema,
  workOrderUsageParamsSchema,
  type UsageQuery,
  type WorkOrderUsageParams,
  type UsageSummaryResponse,
  type UsageRecordResponse,
} from './schemas/usage.schema.js';
import { getUsageService } from '../../billing/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('routes:usage');

/**
 * Register usage routes
 */
export async function registerUsageRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/usage - Get usage records with optional filters
   */
  fastify.get<{
    Querystring: UsageQuery;
  }>('/api/v1/usage', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          workOrderId: { type: 'string' },
          runId: { type: 'string' },
          model: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  workOrderId: { type: 'string' },
                  runId: { type: 'string' },
                  iteration: { type: 'number' },
                  model: { type: 'string' },
                  inputTokens: { type: 'number' },
                  outputTokens: { type: 'number' },
                  cachedInputTokens: { type: 'number' },
                  costUsd: { type: 'number' },
                  durationMs: { type: 'number' },
                  timestamp: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const query = usageQuerySchema.parse(request.query);
      const usageService = getUsageService();

      const records = await usageService.getRecentUsage(query.limit);

      // Filter manually since queryUsage doesn't support all filters yet
      const filtered = records.filter(r => {
        if (query.workOrderId && r.workOrderId !== query.workOrderId) return false;
        if (query.runId && r.runId !== query.runId) return false;
        if (query.model && r.model !== query.model) return false;
        if (query.startDate && r.timestamp < query.startDate) return false;
        if (query.endDate && r.timestamp > query.endDate) return false;
        return true;
      });

      const response: UsageRecordResponse[] = filtered.slice(query.offset, query.offset + query.limit).map(r => ({
        id: r.id,
        workOrderId: r.workOrderId,
        runId: r.runId,
        iteration: r.iteration,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cachedInputTokens: r.cachedInputTokens,
        costUsd: r.costUsd,
        durationMs: r.durationMs,
        timestamp: r.timestamp.toISOString(),
      }));

      return createSuccessResponse(response);
    } catch (error) {
      logger.error({ error }, 'Failed to get usage records');
      return reply.status(500).send(
        createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to get usage records')
      );
    }
  });

  /**
   * GET /api/v1/usage/summary - Get aggregated usage summary
   */
  fastify.get<{
    Querystring: UsageQuery;
  }>('/api/v1/usage/summary', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          workOrderId: { type: 'string' },
          runId: { type: 'string' },
          model: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const query = usageQuerySchema.parse(request.query);
      const usageService = getUsageService();

      const summary = await usageService.getUsageSummary({
        workOrderId: query.workOrderId,
        runId: query.runId,
        model: query.model,
        startDate: query.startDate,
        endDate: query.endDate,
      });

      const response: UsageSummaryResponse = {
        totalInputTokens: summary.totalInputTokens,
        totalOutputTokens: summary.totalOutputTokens,
        totalCachedInputTokens: summary.totalCachedInputTokens,
        totalCostUsd: summary.totalCostUsd,
        executionCount: summary.executionCount,
        workOrderCount: summary.workOrderCount,
        totalDurationMs: summary.totalDurationMs,
        byModel: summary.byModel,
        periodStart: summary.periodStart.toISOString(),
        periodEnd: summary.periodEnd.toISOString(),
      };

      return createSuccessResponse(response);
    } catch (error) {
      logger.error({ error }, 'Failed to get usage summary');
      return reply.status(500).send(
        createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to get usage summary')
      );
    }
  });

  /**
   * GET /api/v1/usage/work-orders/:workOrderId - Get usage for a specific work order
   */
  fastify.get<{
    Params: WorkOrderUsageParams;
  }>('/api/v1/usage/work-orders/:workOrderId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          workOrderId: { type: 'string' },
        },
        required: ['workOrderId'],
      },
    },
  }, async (request, reply) => {
    try {
      const { workOrderId } = workOrderUsageParamsSchema.parse(request.params);
      const usageService = getUsageService();

      const summary = await usageService.getWorkOrderUsage(workOrderId);

      const response: UsageSummaryResponse = {
        totalInputTokens: summary.totalInputTokens,
        totalOutputTokens: summary.totalOutputTokens,
        totalCachedInputTokens: summary.totalCachedInputTokens,
        totalCostUsd: summary.totalCostUsd,
        executionCount: summary.executionCount,
        workOrderCount: summary.workOrderCount,
        totalDurationMs: summary.totalDurationMs,
        byModel: summary.byModel,
        periodStart: summary.periodStart.toISOString(),
        periodEnd: summary.periodEnd.toISOString(),
      };

      return createSuccessResponse(response);
    } catch (error) {
      logger.error({ error }, 'Failed to get work order usage');
      return reply.status(500).send(
        createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to get work order usage')
      );
    }
  });

  logger.info('Usage routes registered');
}
