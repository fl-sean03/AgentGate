/**
 * Queue Health Dashboard Routes (v0.2.23 - Wave 1.7)
 *
 * Provides endpoints for monitoring queue health, statistics,
 * and individual work order positions.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../types.js';
import {
  getQueueManager,
  type QueueStats,
} from '../../control-plane/queue-manager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('routes:queue');

/**
 * Queue health response type
 */
export interface QueueHealthResponse {
  /** Overall queue health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Current queue statistics */
  stats: QueueStats;
  /** Queue capacity utilization (0-1) */
  utilization: number;
  /** Timestamp of the response */
  timestamp: string;
  /** Health indicators */
  indicators: {
    /** Whether queue is accepting new work orders */
    accepting: boolean;
    /** Whether queue has capacity to start immediately */
    canStartImmediately: boolean;
    /** Queue depth (waiting count) */
    queueDepth: number;
    /** Running count */
    runningCount: number;
  };
}

/**
 * Work order position request params schema
 */
const workOrderIdParamsSchema = z.object({
  workOrderId: z.string().min(1, 'Work order ID is required'),
});

type WorkOrderIdParams = z.infer<typeof workOrderIdParamsSchema>;

/**
 * Calculate queue health status based on statistics
 */
function calculateHealthStatus(stats: QueueStats): 'healthy' | 'degraded' | 'unhealthy' {
  // Unhealthy: queue is full and not accepting
  if (!stats.accepting) {
    return 'unhealthy';
  }

  // Degraded: queue is more than 80% full
  const utilization = stats.waiting / stats.maxQueueSize;
  if (utilization > 0.8) {
    return 'degraded';
  }

  // Healthy: normal operation
  return 'healthy';
}

/**
 * Register queue health dashboard routes
 */
export function registerQueueRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/queue/health - Queue health dashboard
   *
   * Returns comprehensive queue health information including
   * statistics, utilization, and health indicators.
   */
  app.get('/api/v1/queue/health', async (request, reply) => {
    try {
      const queueManager = getQueueManager();
      const stats = queueManager.getStats();

      const utilization = stats.maxQueueSize > 0 ? stats.waiting / stats.maxQueueSize : 0;
      const status = calculateHealthStatus(stats);

      const response: QueueHealthResponse = {
        status,
        stats,
        utilization,
        timestamp: new Date().toISOString(),
        indicators: {
          accepting: stats.accepting,
          canStartImmediately: queueManager.canStartImmediately(),
          queueDepth: stats.waiting,
          runningCount: stats.running,
        },
      };

      // Return 503 if queue is unhealthy
      if (status === 'unhealthy') {
        return reply.status(503).send(createSuccessResponse(response, request.id));
      }

      return reply.send(createSuccessResponse(response, request.id));
    } catch (error) {
      logger.error({ err: error, requestId: request.id }, 'Failed to get queue health');
      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Failed to get queue health',
          undefined,
          request.id
        )
      );
    }
  });

  /**
   * GET /api/v1/queue/stats - Queue statistics
   *
   * Returns raw queue statistics.
   */
  app.get('/api/v1/queue/stats', async (request, reply) => {
    try {
      const queueManager = getQueueManager();
      const stats = queueManager.getStats();

      return reply.send(createSuccessResponse(stats, request.id));
    } catch (error) {
      logger.error({ err: error, requestId: request.id }, 'Failed to get queue stats');
      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Failed to get queue stats',
          undefined,
          request.id
        )
      );
    }
  });

  /**
   * GET /api/v1/queue/position/:workOrderId - Get work order position
   *
   * Returns the position of a specific work order in the queue.
   */
  app.get<{
    Params: WorkOrderIdParams;
  }>('/api/v1/queue/position/:workOrderId', async (request, reply) => {
    try {
      // Validate params
      const paramsResult = workOrderIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send(
          createErrorResponse(
            ErrorCode.BAD_REQUEST,
            'Invalid work order ID',
            { errors: paramsResult.error.errors },
            request.id
          )
        );
      }

      const { workOrderId } = paramsResult.data;
      const queueManager = getQueueManager();
      const position = queueManager.getPosition(workOrderId);

      if (!position) {
        return reply.status(404).send(
          createErrorResponse(
            ErrorCode.NOT_FOUND,
            `Work order not found in queue: ${workOrderId}`,
            undefined,
            request.id
          )
        );
      }

      // Convert Date to ISO string for API response
      const responsePosition = {
        ...position,
        enqueuedAt: position.enqueuedAt.toISOString(),
      };

      return reply.send(createSuccessResponse(responsePosition, request.id));
    } catch (error) {
      logger.error({ err: error, requestId: request.id }, 'Failed to get queue position');
      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Failed to get queue position',
          undefined,
          request.id
        )
      );
    }
  });
}
