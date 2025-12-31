// WebSocket module exports
export { EventBroadcaster } from './broadcaster.js';
export { registerWebSocketRoutes } from './handler.js';
export {
  // Client message types
  subscribeMessageSchema,
  unsubscribeMessageSchema,
  pingMessageSchema,
  clientMessageSchema,
  type SubscribeMessage,
  type UnsubscribeMessage,
  type PingMessage,
  type ClientMessage,
  // Server message types
  type BaseEvent,
  type WorkOrderCreatedEvent,
  type WorkOrderUpdatedEvent,
  type RunStartedEvent,
  type RunIterationEvent,
  type RunCompletedEvent,
  type RunFailedEvent,
  type PongMessage,
  type ErrorMessage,
  type SubscriptionConfirmedEvent,
  type UnsubscriptionConfirmedEvent,
  type ServerMessage,
  // Connection types
  type WebSocketConnection,
  // Error codes
  WebSocketErrorCode,
} from './types.js';
