import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { nanoid } from 'nanoid';
import {
  serverConfigSchema,
  createErrorResponse,
  ErrorCode,
  type ServerConfig,
} from './types.js';
import { registerOpenAPI } from './openapi.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerWorkOrderRoutes } from './routes/work-orders.js';
import { registerRunRoutes } from './routes/runs.js';
import { registerProfileRoutes } from './routes/profiles.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerStreamRoutes } from './routes/stream.js';
import { registerAuthPlugin } from './middleware/auth.js';
import { registerWebSocketRoutes } from './websocket/handler.js';
import { EventBroadcaster } from './websocket/broadcaster.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('server');

/**
 * Extended server configuration with API key and broadcaster
 */
export interface AppConfig extends Partial<ServerConfig> {
  apiKey?: string;
  broadcaster?: EventBroadcaster;
}

/**
 * Create and configure a Fastify application instance
 */
export async function createApp(
  config: AppConfig = {}
): Promise<FastifyInstance> {
  // Extract apiKey and broadcaster before validation (not part of ServerConfig schema)
  const { apiKey, broadcaster: providedBroadcaster, ...serverConfig } = config;

  // Create broadcaster instance if not provided
  const broadcaster = providedBroadcaster ?? new EventBroadcaster();

  // Validate and apply defaults
  const validatedConfig = serverConfigSchema.parse(serverConfig);

  // Create Fastify instance with logging
  const app = Fastify({
    logger: validatedConfig.enableLogging
      ? {
          level: 'info',
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
            },
          },
        }
      : false,
    requestTimeout: validatedConfig.requestTimeout,
    genReqId: () => nanoid(12),
  });

  // Register CORS plugin
  await app.register(cors, {
    origin: validatedConfig.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  // Register WebSocket plugin
  await app.register(websocket);

  // Add request ID to response headers
  app.addHook('onRequest', (request: FastifyRequest, reply, done) => {
    void reply.header('X-Request-ID', request.id);
    done();
  });

  // Global error handler
  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    logger.error({ err: error, requestId: request.id }, 'Request error');

    // Handle validation errors
    if (error.validation) {
      return reply.status(400).send(
        createErrorResponse(
          ErrorCode.BAD_REQUEST,
          'Validation error',
          { errors: error.validation },
          request.id
        )
      );
    }

    // Handle specific HTTP status codes
    if (error.statusCode) {
      const code = mapStatusToErrorCode(error.statusCode);
      return reply.status(error.statusCode).send(
        createErrorResponse(code, error.message, undefined, request.id)
      );
    }

    // Generic internal error
    return reply.status(500).send(
      createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'An unexpected error occurred',
        undefined,
        request.id
      )
    );
  });

  // Not found handler
  app.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send(
      createErrorResponse(
        ErrorCode.NOT_FOUND,
        `Route ${request.method} ${request.url} not found`,
        undefined,
        request.id
      )
    );
  });

  // Register auth plugin with API key
  registerAuthPlugin(app, apiKey);

  // Register OpenAPI/Swagger documentation (v0.2.17 - Thrust 5)
  // Must be registered before routes to capture all route schemas
  await registerOpenAPI(app);

  // Register health routes
  registerHealthRoutes(app);

  // Register API routes
  registerWorkOrderRoutes(app);
  registerRunRoutes(app);
  registerProfileRoutes(app);
  registerAuditRoutes(app);
  registerStreamRoutes(app);

  // Register WebSocket routes
  registerWebSocketRoutes(app, broadcaster);

  return app;
}

/**
 * Map HTTP status code to error code
 */
function mapStatusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.BAD_REQUEST;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
}
