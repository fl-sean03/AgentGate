import { z } from 'zod';

// =============================================================================
// Client Messages (sent from client to server)
// =============================================================================

/**
 * Subscription filter options for granular event filtering
 */
export const subscriptionFiltersSchema = z.object({
  includeToolCalls: z.boolean().optional().default(true),
  includeToolResults: z.boolean().optional().default(true),
  includeOutput: z.boolean().optional().default(true),
  includeFileChanges: z.boolean().optional().default(true),
  includeProgress: z.boolean().optional().default(true),
});

export type SubscriptionFilters = z.infer<typeof subscriptionFiltersSchema>;

/**
 * Subscribe to updates for a specific work order
 */
export const subscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  workOrderId: z.string().min(1),
  filters: subscriptionFiltersSchema.optional(),
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

// =============================================================================
// Agent Activity Events
// =============================================================================

/**
 * Tool names that can be invoked by the agent
 */
export type AgentToolName =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Bash'
  | 'Grep'
  | 'Glob'
  | 'WebFetch'
  | 'WebSearch'
  | 'Other';

/**
 * Event emitted when the agent invokes a tool
 */
export interface AgentToolCallEvent extends BaseEvent {
  type: 'agent_tool_call';
  workOrderId: string;
  runId: string;
  toolUseId: string;
  tool: AgentToolName;
  input: Record<string, unknown>;
}

/**
 * Event emitted when a tool execution completes
 */
export interface AgentToolResultEvent extends BaseEvent {
  type: 'agent_tool_result';
  workOrderId: string;
  runId: string;
  toolUseId: string;
  success: boolean;
  contentPreview: string;
  contentLength: number;
  durationMs: number;
}

/**
 * Event emitted when the agent produces text output
 */
export interface AgentOutputEvent extends BaseEvent {
  type: 'agent_output';
  workOrderId: string;
  runId: string;
  content: string;
}

/**
 * File change action types
 */
export type FileChangeAction = 'created' | 'modified' | 'deleted';

/**
 * Event emitted when a file is changed in the workspace
 */
export interface FileChangedEvent extends BaseEvent {
  type: 'file_changed';
  workOrderId: string;
  runId: string;
  path: string;
  action: FileChangeAction;
  sizeBytes?: number;
}

/**
 * Event emitted for progress updates during agent execution
 */
export interface ProgressUpdateEvent extends BaseEvent {
  type: 'progress_update';
  workOrderId: string;
  runId: string;
  percentage: number;
  currentPhase: string;
  toolCallCount: number;
  elapsedSeconds: number;
  estimatedRemainingSeconds?: number;
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
  | UnsubscriptionConfirmedEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentOutputEvent
  | FileChangedEvent
  | ProgressUpdateEvent;

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
