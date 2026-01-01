/**
 * Agent event types for streaming display
 */

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
 * Base event interface with common fields
 */
export interface BaseAgentEvent {
  timestamp: string;
  workOrderId: string;
  runId: string;
}

/**
 * Tool call event - when agent invokes a tool
 */
export interface AgentToolCallEvent extends BaseAgentEvent {
  type: 'agent_tool_call';
  toolUseId: string;
  tool: AgentToolName;
  input: Record<string, unknown>;
}

/**
 * Tool result event - when tool execution completes
 */
export interface AgentToolResultEvent extends BaseAgentEvent {
  type: 'agent_tool_result';
  toolUseId: string;
  success: boolean;
  contentPreview: string;
  contentLength: number;
  durationMs: number;
}

/**
 * Agent output event - text output from the agent
 */
export interface AgentOutputEvent extends BaseAgentEvent {
  type: 'agent_output';
  content: string;
}

/**
 * File change action types
 */
export type FileChangeAction = 'created' | 'modified' | 'deleted';

/**
 * File changed event
 */
export interface FileChangedEvent extends BaseAgentEvent {
  type: 'file_changed';
  path: string;
  action: FileChangeAction;
  sizeBytes?: number;
}

/**
 * Progress update event
 */
export interface ProgressUpdateEvent extends BaseAgentEvent {
  type: 'progress_update';
  percentage: number;
  currentPhase: string;
  toolCallCount: number;
  elapsedSeconds: number;
  estimatedRemainingSeconds?: number;
}

/**
 * Error event
 */
export interface AgentErrorEvent extends BaseAgentEvent {
  type: 'agent_error';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Run started event
 */
export interface RunStartedEvent extends BaseAgentEvent {
  type: 'run_started';
  runNumber: number;
}

/**
 * Run completed event
 */
export interface RunCompletedEvent extends BaseAgentEvent {
  type: 'run_completed';
  prUrl?: string;
  branchName?: string;
}

/**
 * Run failed event
 */
export interface RunFailedEvent extends BaseAgentEvent {
  type: 'run_failed';
  error: string;
  iterationNumber?: number;
}

/**
 * Union of all agent events
 */
export type AgentEvent =
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentOutputEvent
  | FileChangedEvent
  | ProgressUpdateEvent
  | AgentErrorEvent
  | RunStartedEvent
  | RunCompletedEvent
  | RunFailedEvent;

/**
 * Event type discriminator
 */
export type AgentEventType = AgentEvent['type'];

/**
 * Tool call with its result paired together
 */
export interface ToolCallWithResult {
  call: AgentToolCallEvent;
  result?: AgentToolResultEvent;
}

/**
 * File change entry for file tracking
 */
export interface FileChange {
  path: string;
  action: FileChangeAction;
  sizeBytes?: number;
  timestamp: string;
}

/**
 * Progress state for tracking execution
 */
export interface ProgressState {
  percentage: number;
  currentPhase: string;
  toolCallCount: number;
  elapsedSeconds: number;
  estimatedRemainingSeconds?: number;
}

/**
 * Event store state for managing streaming events
 */
export interface EventStoreState {
  events: AgentEvent[];
  toolCalls: Map<string, ToolCallWithResult>;
  files: Map<string, FileChange>;
  errors: AgentErrorEvent[];
  progress: ProgressState | null;
  outputs: AgentOutputEvent[];
}

/**
 * Event store actions
 */
export type EventStoreAction =
  | { type: 'ADD_EVENT'; event: AgentEvent }
  | { type: 'SET_PROGRESS'; progress: ProgressState }
  | { type: 'CLEAR' };

/**
 * Subscription filters for granular event filtering
 */
export interface SubscriptionFilters {
  includeToolCalls?: boolean;
  includeToolResults?: boolean;
  includeOutput?: boolean;
  includeFileChanges?: boolean;
  includeProgress?: boolean;
}

/**
 * Default subscription filters
 */
export const DEFAULT_SUBSCRIPTION_FILTERS: Required<SubscriptionFilters> = {
  includeToolCalls: true,
  includeToolResults: true,
  includeOutput: true,
  includeFileChanges: true,
  includeProgress: true,
};
