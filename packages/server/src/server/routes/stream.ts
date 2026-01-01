/**
 * Stream Routes
 *
 * Server-Sent Events (SSE) endpoints for real-time run monitoring.
 * v0.2.17 - Thrust 4
 *
 * @module server/routes/stream
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nanoid } from 'nanoid';
import { createErrorResponse, ErrorCode } from '../types.js';
import { streamRunIdParamsSchema, type StreamEvent, type StreamRunIdParams } from '../types/stream.js';
import { loadRun } from '../../orchestrator/run-store.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('routes:stream');

// Active SSE connections by run ID
const activeConnections = new Map<string, Set<FastifyReply>>();

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

/**
 * Send an SSE event to a client
 */
function sendSSEEvent(reply: FastifyReply, event: StreamEvent): void {
  const data = JSON.stringify(event);
  reply.raw.write(`event: ${event.type}\n`);
  reply.raw.write(`data: ${data}\n\n`);
}

/**
 * Broadcast an event to all clients watching a run
 */
export function broadcastToRun(runId: string, event: StreamEvent): void {
  const connections = activeConnections.get(runId);
  if (!connections || connections.size === 0) {
    return;
  }

  for (const reply of connections) {
    try {
      sendSSEEvent(reply, event);
    } catch (err) {
      logger.warn({ err, runId }, 'Failed to send SSE event to client');
      connections.delete(reply);
    }
  }
}

/**
 * Register stream API routes
 */
export function registerStreamRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/runs/:id/stream - Stream run events via SSE
   */
  app.get<{ Params: StreamRunIdParams }>(
    '/api/v1/runs/:id/stream',
    async (request: FastifyRequest<{ Params: StreamRunIdParams }>, reply: FastifyReply) => {
      const paramsResult = streamRunIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send(
          createErrorResponse(
            ErrorCode.BAD_REQUEST,
            'Invalid run ID',
            { errors: paramsResult.error.errors },
            request.id
          )
        );
      }

      const { id: runId } = paramsResult.data;

      // Verify run exists
      const run = await loadRun(runId);
      if (!run) {
        return reply.status(404).send(
          createErrorResponse(ErrorCode.NOT_FOUND, `Run not found: ${runId}`, undefined, request.id)
        );
      }

      // Set SSE headers
      void reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      });

      // Generate client ID
      const clientId = nanoid(8);

      // Track this connection
      if (!activeConnections.has(runId)) {
        activeConnections.set(runId, new Set());
      }
      activeConnections.get(runId)!.add(reply);

      logger.info({ runId, clientId }, 'SSE client connected');

      // Send connected event
      const connectedEvent: StreamEvent = {
        type: 'connected',
        runId,
        timestamp: new Date().toISOString(),
        data: {
          clientId,
          runStatus: run.state,
          currentIteration: run.iteration,
        },
      };
      sendSSEEvent(reply, connectedEvent);

      // Set up heartbeat
      const heartbeatInterval = setInterval(() => {
        try {
          const heartbeatEvent: StreamEvent = {
            type: 'heartbeat',
            runId,
            timestamp: new Date().toISOString(),
            data: {
              serverTime: new Date().toISOString(),
            },
          };
          sendSSEEvent(reply, heartbeatEvent);
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, HEARTBEAT_INTERVAL);

      // Clean up on client disconnect
      request.raw.on('close', () => {
        clearInterval(heartbeatInterval);
        const connections = activeConnections.get(runId);
        if (connections) {
          connections.delete(reply);
          if (connections.size === 0) {
            activeConnections.delete(runId);
          }
        }
        logger.info({ runId, clientId }, 'SSE client disconnected');
      });

      // Keep the connection open - don't return/send anything else
      // The response will be handled by the SSE events
    }
  );

  /**
   * GET /api/v1/runs/:id/config - Get current run configuration
   */
  app.get<{ Params: StreamRunIdParams }>(
    '/api/v1/runs/:id/config',
    async (request, reply) => {
      try {
        const paramsResult = streamRunIdParamsSchema.safeParse(request.params);
        if (!paramsResult.success) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              'Invalid run ID',
              { errors: paramsResult.error.errors },
              request.id
            )
          );
        }

        const { id: runId } = paramsResult.data;

        const run = await loadRun(runId);
        if (!run) {
          return reply.status(404).send(
            createErrorResponse(ErrorCode.NOT_FOUND, `Run not found: ${runId}`, undefined, request.id)
          );
        }

        // Return run configuration summary
        return reply.send({
          success: true,
          data: {
            runId,
            workOrderId: run.workOrderId,
            state: run.state,
            iteration: run.iteration,
            startedAt: run.startedAt.toISOString(),
            completedAt: run.completedAt?.toISOString() ?? null,
          },
          requestId: request.id,
        });
      } catch (error) {
        logger.error({ err: error, requestId: request.id }, 'Failed to get run config');
        return reply.status(500).send(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to get run config', undefined, request.id)
        );
      }
    }
  );
}

/**
 * Get the number of active connections for a run
 */
export function getActiveConnectionCount(runId: string): number {
  return activeConnections.get(runId)?.size ?? 0;
}

/**
 * Get total number of active SSE connections
 */
export function getTotalConnectionCount(): number {
  let total = 0;
  for (const connections of activeConnections.values()) {
    total += connections.size;
  }
  return total;
}
