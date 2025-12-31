import { z } from 'zod';

// =============================================================================
// Client Messages (sent from client to server)
// =============================================================================

export const subscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  workOrderId: z.string().min(1),
});

export type SubscribeMessage = z.infer<typeof subscribeMessageSchema>;

export const unsubscribeMessageSchema = z.object({
  type: z.literal('unsubscribe'),
  workOrderId: z.string().min(1),
});

export type UnsubscribeMessage = z.infer<typeof unsubscribeMessageSchema>;

export const pingMessageSchema = z.object({
  type: z.literal('ping'),
});

export type PingMessage = z.infer<typeof pingMessageSchema>;

export const clientMessageSchema = z.discriminatedUnion('type', [
  subscribeMessageSchema,
  unsubscribeMessageSchema,
  pingMessageSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

// =============================================================================
// Server Messages (sent from server to client)
// =============================================================================

export interface BaseEvent {
  timestamp: string;
}

export interface WorkOrderCreatedEvent extends BaseEvent {
  type: 'work_order_created';
  workOrderId: string;
  taskPrompt: string;
  status: string;
}

export interface WorkOrderUpdatedEvent extends BaseEvent {
  type: 'work_order_updated';
  workOrderId: string;
  status: string;
  previousStatus?: string;
}

export interface RunStartedEvent extends BaseEvent {
  type: 'run_started';
  workOrderId: string;
  runId: string;
  runNumber: number;
}

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

export interface RunCompletedEvent extends BaseEvent {
  type: 'run_completed';
  workOrderId: string;
  runId: string;
  prUrl?: string;
  branchName?: string;
}

export interface RunFailedEvent extends BaseEvent {
  type: 'run_failed';
  workOrderId: string;
  runId: string;
  error: string;
  iterationNumber?: number;
}

export interface PongMessage extends BaseEvent {
  type: 'pong';
}

export interface ErrorMessage extends BaseEvent {
  type: 'error';
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SubscriptionConfirmedEvent extends BaseEvent {
  type: 'subscription_confirmed';
  workOrderId: string;
}

export interface UnsubscriptionConfirmedEvent extends BaseEvent {
  type: 'unsubscription_confirmed';
  workOrderId: string;
}

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
// Error Codes
// =============================================================================

export const WebSocketErrorCode = {
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  PARSE_ERROR: 'PARSE_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type WebSocketErrorCode = (typeof WebSocketErrorCode)[keyof typeof WebSocketErrorCode];
