import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket as WsWebSocket } from 'ws';
import { createLogger } from '../../utils/logger.js';
import { EventBroadcaster } from './broadcaster.js';
import {
  clientMessageSchema,
  WebSocketErrorCode,
  type ClientMessage,
  type ErrorMessage,
  type PongMessage,
  type SubscriptionConfirmedEvent,
  type UnsubscriptionConfirmedEvent,
} from './types.js';

const logger = createLogger('websocket:handler');

/**
 * Context for WebSocket message handling
 */
interface HandlerContext {
  connectionId: string;
  broadcaster: EventBroadcaster;
  socket: WsWebSocket;
}

/**
 * Parse and validate an incoming client message
 */
function parseClientMessage(data: string): ClientMessage | null {
  try {
    const json: unknown = JSON.parse(data);
    const result = clientMessageSchema.safeParse(json);
    if (result.success) {
      return result.data;
    }
    logger.debug({ errors: result.error.errors }, 'Invalid message format');
    return null;
  } catch {
    logger.debug('Failed to parse JSON message');
    return null;
  }
}

/**
 * Create an error message
 */
function createErrorMessage(
  code: WebSocketErrorCode,
  message: string,
  details?: Record<string, unknown>
): ErrorMessage {
  return {
    type: 'error',
    code,
    message,
    ...(details !== undefined && { details }),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a pong message
 */
function createPongMessage(): PongMessage {
  return {
    type: 'pong',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a subscription confirmed message
 */
function createSubscriptionConfirmed(workOrderId: string): SubscriptionConfirmedEvent {
  return {
    type: 'subscription_confirmed',
    workOrderId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an unsubscription confirmed message
 */
function createUnsubscriptionConfirmed(
  workOrderId: string
): UnsubscriptionConfirmedEvent {
  return {
    type: 'unsubscription_confirmed',
    workOrderId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send a message through the WebSocket connection
 */
function sendMessage(socket: WsWebSocket, message: object): void {
  socket.send(JSON.stringify(message));
}

/**
 * Handle a subscribe message
 */
function handleSubscribe(ctx: HandlerContext, workOrderId: string): void {
  const success = ctx.broadcaster.subscribe(ctx.connectionId, workOrderId);
  if (success) {
    sendMessage(ctx.socket, createSubscriptionConfirmed(workOrderId));
    logger.debug({ connectionId: ctx.connectionId, workOrderId }, 'Client subscribed');
  } else {
    sendMessage(
      ctx.socket,
      createErrorMessage(
        WebSocketErrorCode.INTERNAL_ERROR,
        'Failed to subscribe',
        { workOrderId }
      )
    );
  }
}

/**
 * Handle an unsubscribe message
 */
function handleUnsubscribe(ctx: HandlerContext, workOrderId: string): void {
  ctx.broadcaster.unsubscribe(ctx.connectionId, workOrderId);
  sendMessage(ctx.socket, createUnsubscriptionConfirmed(workOrderId));
  logger.debug({ connectionId: ctx.connectionId, workOrderId }, 'Client unsubscribed');
}

/**
 * Handle a ping message
 */
function handlePing(ctx: HandlerContext): void {
  ctx.broadcaster.updateLastPing(ctx.connectionId);
  sendMessage(ctx.socket, createPongMessage());
}

/**
 * Handle an incoming WebSocket message
 */
function handleMessage(ctx: HandlerContext, data: string): void {
  const message = parseClientMessage(data);

  if (!message) {
    sendMessage(
      ctx.socket,
      createErrorMessage(
        WebSocketErrorCode.INVALID_MESSAGE,
        'Invalid message format. Expected JSON with "type" field.'
      )
    );
    return;
  }

  switch (message.type) {
    case 'subscribe':
      handleSubscribe(ctx, message.workOrderId);
      break;
    case 'unsubscribe':
      handleUnsubscribe(ctx, message.workOrderId);
      break;
    case 'ping':
      handlePing(ctx);
      break;
  }
}

/**
 * Register WebSocket routes on a Fastify instance
 */
export function registerWebSocketRoutes(
  app: FastifyInstance,
  broadcaster: EventBroadcaster
): void {
  app.get('/ws', { websocket: true }, (socket: WsWebSocket, _req: FastifyRequest) => {
    // Add connection to broadcaster
    const connectionId = broadcaster.addConnection(socket as unknown as WebSocket);

    logger.info(
      { connectionId, totalConnections: broadcaster.getConnectionCount() },
      'WebSocket client connected'
    );

    // Create handler context
    const ctx: HandlerContext = {
      connectionId,
      broadcaster,
      socket,
    };

    // Handle incoming messages
    socket.on('message', (rawData: Buffer) => {
      try {
        const data = rawData.toString('utf8');
        handleMessage(ctx, data);
      } catch (error) {
        logger.error({ err: error, connectionId }, 'Error handling message');
        sendMessage(
          socket,
          createErrorMessage(
            WebSocketErrorCode.INTERNAL_ERROR,
            'Internal server error'
          )
        );
      }
    });

    // Handle connection close
    socket.on('close', () => {
      broadcaster.removeConnection(connectionId);
      logger.info(
        { connectionId, totalConnections: broadcaster.getConnectionCount() },
        'WebSocket client disconnected'
      );
    });

    // Handle errors
    socket.on('error', (error: Error) => {
      logger.error({ err: error, connectionId }, 'WebSocket error');
      broadcaster.removeConnection(connectionId);
    });
  });
}
