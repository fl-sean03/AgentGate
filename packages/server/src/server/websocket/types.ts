import { z } from 'zod';

// =============================================================================
// Client Messages (sent from client to server)
// =============================================================================

/**
 * Subscribe to updates for a specific work order
 */
export const subscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  workOrderId: z.string().min(1),
});

export type SubscribeMessage = z.infer<typeof subscribeMessageSchema>;

/**
 * Unsubscribe from updates for a specific work order
 */
export const unsubscribeMessageSchema = z.object({
  type: z.literal('unsubscribe'),
  workOrderId: z.string().min(1),
});

export type UnsubscribeMessage = z.infer<typeof unsubscribeMessageSchema>;

/**
 * Ping message for keep-alive
 */
export const pingMessageSchema = z.object({
  type: z.literal('ping'),
});

export type PingMessage = z.infer<typeof pingMessageSchema>;

/**
 * Union of all client message types
 */
export const clientMessageSchema = z.discriminatedUnion('type', [
  subscribeMessageSchema,
  unsubscribeMessageSchema,
  pingMessageSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

// =============================================================================
// Server Messages (sent from server to client)
// =============================================================================

/**
 * Base event with common fields
 */
export interface BaseEvent {
  timestamp: string;
}

/**
 * Work order created event
 */
export interface WorkOrderCreatedEvent extends BaseEvent {
  type: 'work_order_created';
  workOrderId: string;
  taskPrompt: string;
  status: string;
}

/**
 * Work order updated event
 */
export interface WorkOrderUpdatedEvent extends BaseEvent {
  type: 'work_order_updated';
  workOrderId: string;
  status: string;
  previousStatus?: string;
}

/**
 * Run started event
 */
export interface RunStartedEvent extends BaseEvent {
  type: 'run_started';
  workOrderId: string;
  runId: string;
  runNumber: number;
}

/**
 * Run iteration event - sent after each iteration completes
 */
export interface RunIterationEvent extends BaseEvent {
  type: 'run_iteration';
  workOrderId: string;
  runId: string;
  iterationNumber: number;
  totalIterations: number;
  verificationPassed: boolean;
  verificationDetails?: {
    l0Passed: boolean;
    l1Passed: boolean;
    l2Passed?: boolean;
    l3Passed?: boolean;
  };
}

/**
 * Run completed successfully event
 */
export interface RunCompletedEvent extends BaseEvent {
  type: 'run_completed';
  workOrderId: string;
  runId: string;
  prUrl?: string;
  branchName?: string;
}

/**
 * Run failed event
 */
export interface RunFailedEvent extends BaseEvent {
  type: 'run_failed';
  workOrderId: string;
  runId: string;
  error: string;
  iterationNumber?: number;
}

/**
 * Pong response to ping
 */
export interface PongMessage extends BaseEvent {
  type: 'pong';
}

/**
 * Error message for invalid requests
 */
export interface ErrorMessage extends BaseEvent {
  type: 'error';
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Subscription confirmed message
 */
export interface SubscriptionConfirmedEvent extends BaseEvent {
  type: 'subscription_confirmed';
  workOrderId: string;
}

/**
 * Unsubscription confirmed message
 */
export interface UnsubscriptionConfirmedEvent extends BaseEvent {
  type: 'unsubscription_confirmed';
  workOrderId: string;
}

/**
 * Union of all server message types
 */
export type ServerMessage =
  | WorkOrderCreatedEvent
  | WorkOrderUpdatedEvent
  | RunStartedEvent
  | RunIterationEvent
  | RunCompletedEvent
  | RunFailedEvent
  | PongMessage
  | ErrorMessage
  | SubscriptionConfirmedEvent
  | UnsubscriptionConfirmedEvent;

// =============================================================================
// Connection Types
// =============================================================================

/**
 * WebSocket connection with metadata
 */
export interface WebSocketConnection {
  id: string;
  socket: WebSocket;
  subscriptions: Set<string>;
  connectedAt: Date;
  lastPingAt?: Date;
}

// =============================================================================
// Event Error Codes
// =============================================================================

export const WebSocketErrorCode = {
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  PARSE_ERROR: 'PARSE_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type WebSocketErrorCode = (typeof WebSocketErrorCode)[keyof typeof WebSocketErrorCode];
