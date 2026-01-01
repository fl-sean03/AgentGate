/**
 * WebSocket client for real-time AgentGate updates
 */

import type { WorkOrder } from '../types/work-order';
import type { Run } from '../types/run';
import type {
  AgentToolCallEvent,
  AgentToolResultEvent,
  AgentOutputEvent,
  FileChangedEvent,
  ProgressUpdateEvent,
  SubscriptionFilters,
} from '../types/agent-events';

export type WebSocketEventType =
  | 'workorder:created'
  | 'workorder:updated'
  | 'run:updated';

export interface WebSocketEvent<T = unknown> {
  type: WebSocketEventType;
  data: T;
}

export interface WorkOrderCreatedEvent extends WebSocketEvent<WorkOrder> {
  type: 'workorder:created';
}

export interface WorkOrderUpdatedEvent extends WebSocketEvent<WorkOrder> {
  type: 'workorder:updated';
}

export interface RunUpdatedEvent extends WebSocketEvent<Run> {
  type: 'run:updated';
}

// Subscription messages
export interface SubscribeMessage {
  type: 'subscribe';
  workOrderId: string;
  filters?: SubscriptionFilters;
}

export interface UnsubscribeMessage {
  type: 'unsubscribe';
  workOrderId: string;
}

export interface PingMessage {
  type: 'ping';
}

export type ClientMessage = SubscribeMessage | UnsubscribeMessage | PingMessage;

// Server confirmation messages
export interface SubscriptionConfirmedEvent {
  type: 'subscription_confirmed';
  workOrderId: string;
  timestamp: string;
}

export interface UnsubscriptionConfirmedEvent {
  type: 'unsubscription_confirmed';
  workOrderId: string;
  timestamp: string;
}

export interface PongMessage {
  type: 'pong';
  timestamp: string;
}

export interface ServerErrorMessage {
  type: 'error';
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// Run lifecycle events
export interface RunStartedServerEvent {
  type: 'run_started';
  workOrderId: string;
  runId: string;
  runNumber: number;
  timestamp: string;
}

export interface RunCompletedServerEvent {
  type: 'run_completed';
  workOrderId: string;
  runId: string;
  prUrl?: string;
  branchName?: string;
  timestamp: string;
}

export interface RunFailedServerEvent {
  type: 'run_failed';
  workOrderId: string;
  runId: string;
  error: string;
  iterationNumber?: number;
  timestamp: string;
}

export type WebSocketMessage =
  | WorkOrderCreatedEvent
  | WorkOrderUpdatedEvent
  | RunUpdatedEvent
  | SubscriptionConfirmedEvent
  | UnsubscriptionConfirmedEvent
  | PongMessage
  | ServerErrorMessage
  | RunStartedServerEvent
  | RunCompletedServerEvent
  | RunFailedServerEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentOutputEvent
  | FileChangedEvent
  | ProgressUpdateEvent;

export type WebSocketEventHandler = (event: WebSocketMessage) => void;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketClientOptions {
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onConnectionStateChange?: (state: ConnectionState) => void;
}

/**
 * Get WebSocket URL from environment or build from API URL
 */
function getWebSocketUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const url = new URL(apiUrl);
  const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${url.host}/ws`;
}

/**
 * WebSocket client with automatic reconnection logic
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private eventHandlers: Set<WebSocketEventHandler> = new Set();
  private connectionState: ConnectionState = 'disconnected';
  private onConnectionStateChange?: (state: ConnectionState) => void;
  private intentionallyClosed = false;

  constructor(options: WebSocketClientOptions = {}) {
    this.url = options.url || getWebSocketUrl();
    this.reconnectInterval = options.reconnectInterval || 3000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.onConnectionStateChange = options.onConnectionStateChange;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.intentionallyClosed = false;
    this.setConnectionState('connecting');

    try {
      const apiKey = localStorage.getItem('agentgate_api_key');
      const wsUrl = apiKey ? `${this.url}?token=${encodeURIComponent(apiKey)}` : this.url;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setConnectionState('connected');
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (_error) => {
        this.setConnectionState('error');
      };

      this.ws.onclose = () => {
        if (!this.intentionallyClosed) {
          this.setConnectionState('disconnected');
          this.scheduleReconnect();
        }
      };
    } catch {
      this.setConnectionState('error');
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.intentionallyClosed = true;
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setConnectionState('disconnected');
  }

  /**
   * Subscribe to WebSocket events
   */
  subscribe(handler: WebSocketEventHandler): () => void {
    this.eventHandlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send a message to the WebSocket server
   */
  send(message: object): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as WebSocketMessage;

      // Validate message has required type field
      if (!message.type) {
        return;
      }

      // Notify all subscribers
      this.eventHandlers.forEach((handler) => {
        try {
          handler(message);
        } catch {
          // Silently catch handler errors to prevent breaking other handlers
        }
      });
    } catch {
      // Invalid JSON, ignore
    }
  }

  /**
   * Schedule automatic reconnection
   */
  private scheduleReconnect(): void {
    if (this.intentionallyClosed) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setConnectionState('error');
      return;
    }

    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * Clear reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Update connection state and notify listeners
   */
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.onConnectionStateChange?.(state);
    }
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

/**
 * Get or create the WebSocket client instance
 */
export function getWebSocketClient(): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient();
  }
  return wsClient;
}
