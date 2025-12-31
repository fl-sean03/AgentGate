import type { FastifyInstance } from 'fastify';
import { createApp, type AppConfig } from './app.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('server');

/**
 * Start the HTTP server
 */
export async function startServer(
  config: AppConfig = {}
): Promise<FastifyInstance> {
  const app = await createApp(config);

  const port = config.port ?? 3001;
  const host = config.host ?? '0.0.0.0';

  try {
    await app.listen({ port, host });
    logger.info({ port, host }, 'Server started');
    return app;
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    throw error;
  }
}

/**
 * Stop the HTTP server gracefully
 */
export async function stopServer(server: FastifyInstance): Promise<void> {
  try {
    await server.close();
    logger.info('Server stopped');
  } catch (error) {
    logger.error({ err: error }, 'Error stopping server');
    throw error;
  }
}

// Re-export types and utilities
export { createApp, type AppConfig } from './app.js';
export {
  serverConfigSchema,
  apiResponseSchema,
  apiErrorSchema,
  healthStatusSchema,
  componentCheckSchema,
  readinessResponseSchema,
  livenessResponseSchema,
  ErrorCode,
  createSuccessResponse,
  createErrorResponse,
  type ServerConfig,
  type ApiResponse,
  type ApiError,
  type HealthStatus,
  type ComponentCheck,
  type ReadinessResponse,
  type LivenessResponse,
} from './types.js';
export { registerHealthRoutes } from './routes/health.js';
export {
  EventBroadcaster,
  registerWebSocketRoutes,
  WebSocketErrorCode,
  type SubscribeMessage,
  type UnsubscribeMessage,
  type PingMessage,
  type ClientMessage,
  type WorkOrderCreatedEvent,
  type WorkOrderUpdatedEvent,
  type RunStartedEvent,
  type RunIterationEvent,
  type RunCompletedEvent,
  type RunFailedEvent,
  type PongMessage,
  type ErrorMessage,
  type ServerMessage,
  type WebSocketConnection,
} from './websocket/index.js';
