/**
 * React hook for streaming run events
 */

import { useEffect, useState, useCallback, useRef, useReducer } from 'react';
import {
  getWebSocketClient,
  type WebSocketMessage,
  type ConnectionState,
} from '../api/websocket';
import type {
  AgentEvent,
  ToolCallWithResult,
  FileChange,
  ProgressState,
  AgentErrorEvent,
  AgentOutputEvent,
  SubscriptionFilters,
} from '../types/agent-events';

export interface UseRunStreamOptions {
  maxEvents?: number;
  filters?: SubscriptionFilters;
  autoConnect?: boolean;
}

export interface UseRunStreamResult {
  events: AgentEvent[];
  toolCalls: ToolCallWithResult[];
  files: FileChange[];
  errors: AgentErrorEvent[];
  outputs: AgentOutputEvent[];
  progress: ProgressState | null;
  isSubscribed: boolean;
  isConnected: boolean;
  connectionState: ConnectionState;
  subscribe: (workOrderId: string) => void;
  unsubscribe: () => void;
  clearEvents: () => void;
}

interface StreamState {
  events: AgentEvent[];
  toolCalls: Map<string, ToolCallWithResult>;
  files: Map<string, FileChange>;
  errors: AgentErrorEvent[];
  outputs: AgentOutputEvent[];
  progress: ProgressState | null;
}

type StreamAction =
  | { type: 'ADD_EVENT'; event: AgentEvent; maxEvents: number }
  | { type: 'SET_PROGRESS'; progress: ProgressState }
  | { type: 'CLEAR' };

function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case 'ADD_EVENT': {
      const event = action.event;
      const newEvents = [...state.events, event];

      // Limit events array size
      if (newEvents.length > action.maxEvents) {
        newEvents.splice(0, newEvents.length - action.maxEvents);
      }

      const newState: StreamState = {
        ...state,
        events: newEvents,
      };

      // Process event by type
      switch (event.type) {
        case 'agent_tool_call': {
          const newToolCalls = new Map(state.toolCalls);
          newToolCalls.set(event.toolUseId, { call: event });
          newState.toolCalls = newToolCalls;
          break;
        }
        case 'agent_tool_result': {
          const newToolCalls = new Map(state.toolCalls);
          const existing = newToolCalls.get(event.toolUseId);
          if (existing) {
            newToolCalls.set(event.toolUseId, { ...existing, result: event });
          } else {
            // Result without a matching call - create a placeholder
            newToolCalls.set(event.toolUseId, {
              call: {
                type: 'agent_tool_call',
                workOrderId: event.workOrderId,
                runId: event.runId,
                toolUseId: event.toolUseId,
                tool: 'Other',
                input: {},
                timestamp: event.timestamp,
              },
              result: event,
            });
          }
          newState.toolCalls = newToolCalls;
          break;
        }
        case 'file_changed': {
          const newFiles = new Map(state.files);
          newFiles.set(event.path, {
            path: event.path,
            action: event.action,
            sizeBytes: event.sizeBytes,
            timestamp: event.timestamp,
          });
          newState.files = newFiles;
          break;
        }
        case 'agent_error': {
          newState.errors = [...state.errors, event];
          break;
        }
        case 'agent_output': {
          newState.outputs = [...state.outputs, event];
          break;
        }
        case 'progress_update': {
          newState.progress = {
            percentage: event.percentage,
            currentPhase: event.currentPhase,
            toolCallCount: event.toolCallCount,
            elapsedSeconds: event.elapsedSeconds,
            estimatedRemainingSeconds: event.estimatedRemainingSeconds,
          };
          break;
        }
      }

      return newState;
    }
    case 'SET_PROGRESS':
      return { ...state, progress: action.progress };
    case 'CLEAR':
      return {
        events: [],
        toolCalls: new Map(),
        files: new Map(),
        errors: [],
        outputs: [],
        progress: null,
      };
    default:
      return state;
  }
}

const initialState: StreamState = {
  events: [],
  toolCalls: new Map(),
  files: new Map(),
  errors: [],
  outputs: [],
  progress: null,
};

/**
 * Hook to subscribe to run streaming events for a work order
 */
export function useRunStream(options: UseRunStreamOptions = {}): UseRunStreamResult {
  const { maxEvents = 500, filters, autoConnect = true } = options;

  const [state, dispatch] = useReducer(streamReducer, initialState);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [subscribedWorkOrderId, setSubscribedWorkOrderId] = useState<string | null>(null);

  const wsClient = getWebSocketClient();
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Handle incoming WebSocket messages
  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      // Check if message is for our subscribed work order
      if ('workOrderId' in message && message.workOrderId !== subscribedWorkOrderId) {
        return;
      }

      // Handle subscription confirmations
      if (message.type === 'subscription_confirmed') {
        return;
      }

      if (message.type === 'unsubscription_confirmed') {
        setSubscribedWorkOrderId(null);
        return;
      }

      // Handle run lifecycle events
      if (message.type === 'run_started') {
        const event: AgentEvent = {
          type: 'run_started',
          workOrderId: message.workOrderId,
          runId: message.runId,
          runNumber: message.runNumber,
          timestamp: message.timestamp,
        };
        dispatch({ type: 'ADD_EVENT', event, maxEvents });
        return;
      }

      if (message.type === 'run_completed') {
        const event: AgentEvent = {
          type: 'run_completed',
          workOrderId: message.workOrderId,
          runId: message.runId,
          prUrl: message.prUrl,
          branchName: message.branchName,
          timestamp: message.timestamp,
        };
        dispatch({ type: 'ADD_EVENT', event, maxEvents });
        return;
      }

      if (message.type === 'run_failed') {
        const event: AgentEvent = {
          type: 'run_failed',
          workOrderId: message.workOrderId,
          runId: message.runId,
          error: message.error,
          iterationNumber: message.iterationNumber,
          timestamp: message.timestamp,
        };
        dispatch({ type: 'ADD_EVENT', event, maxEvents });
        return;
      }

      // Handle agent events
      if (
        message.type === 'agent_tool_call' ||
        message.type === 'agent_tool_result' ||
        message.type === 'agent_output' ||
        message.type === 'file_changed' ||
        message.type === 'progress_update'
      ) {
        dispatch({ type: 'ADD_EVENT', event: message, maxEvents });
        return;
      }

      // Handle errors
      if (message.type === 'error') {
        const errorEvent: AgentErrorEvent = {
          type: 'agent_error',
          workOrderId: subscribedWorkOrderId || 'unknown',
          runId: 'unknown',
          message: message.message,
          details: message.details,
          timestamp: message.timestamp,
        };
        dispatch({ type: 'ADD_EVENT', event: errorEvent, maxEvents });
      }
    },
    [subscribedWorkOrderId, maxEvents]
  );

  // Subscribe to a work order
  const subscribe = useCallback(
    (workOrderId: string) => {
      if (!wsClient.isConnected()) {
        wsClient.connect();
      }

      const subscribeMessage = {
        type: 'subscribe' as const,
        workOrderId,
        filters: filtersRef.current,
      };

      if (wsClient.send(subscribeMessage)) {
        setSubscribedWorkOrderId(workOrderId);
      }
    },
    [wsClient]
  );

  // Unsubscribe from current work order
  const unsubscribe = useCallback(() => {
    if (subscribedWorkOrderId) {
      wsClient.send({
        type: 'unsubscribe',
        workOrderId: subscribedWorkOrderId,
      });
      setSubscribedWorkOrderId(null);
    }
  }, [wsClient, subscribedWorkOrderId]);

  // Clear all events
  const clearEvents = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  // Set up WebSocket connection and message handling
  useEffect(() => {
    // Subscribe to connection state changes
    const originalOnChange = (wsClient as unknown as { onConnectionStateChange?: (state: ConnectionState) => void })['onConnectionStateChange'];
    (wsClient as unknown as { onConnectionStateChange?: (state: ConnectionState) => void })['onConnectionStateChange'] = (state: ConnectionState) => {
      setConnectionState(state);
      originalOnChange?.(state);
    };

    // Subscribe to messages
    const unsubscribeFromMessages = wsClient.subscribe(handleMessage);

    // Auto-connect if enabled
    if (autoConnect) {
      wsClient.connect();
    } else {
      setConnectionState(wsClient.getConnectionState());
    }

    // Cleanup
    return () => {
      unsubscribeFromMessages();
      if (subscribedWorkOrderId) {
        wsClient.send({
          type: 'unsubscribe',
          workOrderId: subscribedWorkOrderId,
        });
      }
    };
  }, [wsClient, handleMessage, autoConnect, subscribedWorkOrderId]);

  return {
    events: state.events,
    toolCalls: Array.from(state.toolCalls.values()),
    files: Array.from(state.files.values()),
    errors: state.errors,
    outputs: state.outputs,
    progress: state.progress,
    isSubscribed: subscribedWorkOrderId !== null,
    isConnected: connectionState === 'connected',
    connectionState,
    subscribe,
    unsubscribe,
    clearEvents,
  };
}
