import { nanoid } from 'nanoid';
import { createLogger } from '../../utils/logger.js';
import type {
  ServerMessage,
  WebSocketConnection,
  WorkOrderCreatedEvent,
  WorkOrderUpdatedEvent,
  RunStartedEvent,
  RunIterationEvent,
  RunCompletedEvent,
  RunFailedEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
  AgentOutputEvent,
  FileChangedEvent,
  ProgressUpdateEvent,
  SubscriptionFilters,
  AgentToolName,
  FileChangeAction,
} from './types.js';

const logger = createLogger('websocket:broadcaster');

/**
 * Default subscription filters - all enabled
 */
const DEFAULT_FILTERS: SubscriptionFilters = {
  includeToolCalls: true,
  includeToolResults: true,
  includeOutput: true,
  includeFileChanges: true,
  includeProgress: true,
};

/**
 * Throttle configuration for high-frequency events
 */
interface ThrottleState {
  lastEmitTime: Map<string, number>;
}

/**
 * EventBroadcaster manages WebSocket connections and broadcasts events
 * to subscribed clients.
 */
export class EventBroadcaster {
  private connections: Map<string, WebSocketConnection> = new Map();
  private throttleState: ThrottleState = {
    lastEmitTime: new Map(),
  };

  /** Debounce interval for output events in milliseconds */
  private readonly outputDebounceMs = 100;

  /**
   * Add a new WebSocket connection
   */
  addConnection(socket: WebSocket): string {
    const id = nanoid(12);
    const connection: WebSocketConnection = {
      id,
      socket,
      subscriptions: new Set(),
      preferences: new Map(),
      connectedAt: new Date(),
    };
    this.connections.set(id, connection);
    logger.debug({ connectionId: id }, 'Connection added');
    return id;
  }

  /**
   * Remove a WebSocket connection
   */
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.connections.delete(connectionId);
      logger.debug(
        { connectionId, subscriptions: Array.from(connection.subscriptions) },
        'Connection removed'
      );
    }
  }

  /**
   * Subscribe a connection to a work order's updates
   *
   * @param connectionId - The connection ID
   * @param workOrderId - The work order ID to subscribe to
   * @param filters - Optional subscription filters (defaults to all enabled)
   */
  subscribe(
    connectionId: string,
    workOrderId: string,
    filters?: SubscriptionFilters
  ): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn({ connectionId }, 'Subscribe failed: connection not found');
      return false;
    }
    connection.subscriptions.add(workOrderId);
    connection.preferences.set(workOrderId, {
      ...DEFAULT_FILTERS,
      ...filters,
    });
    logger.debug({ connectionId, workOrderId, filters }, 'Subscribed to work order');
    return true;
  }

  /**
   * Unsubscribe a connection from a work order's updates
   */
  unsubscribe(connectionId: string, workOrderId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn({ connectionId }, 'Unsubscribe failed: connection not found');
      return false;
    }
    const removed = connection.subscriptions.delete(workOrderId);
    if (removed) {
      connection.preferences.delete(workOrderId);
      logger.debug({ connectionId, workOrderId }, 'Unsubscribed from work order');
    }
    return removed;
  }

  /**
   * Get subscription filters for a connection and work order
   */
  getFilters(connectionId: string, workOrderId: string): SubscriptionFilters {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return DEFAULT_FILTERS;
    }
    return connection.preferences.get(workOrderId) ?? DEFAULT_FILTERS;
  }

  /**
   * Update the last ping timestamp for a connection
   */
  updateLastPing(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastPingAt = new Date();
    }
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): WebSocketConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all active connection IDs
   */
  getConnectionIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get count of active connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Broadcast an event to all connections subscribed to the work order
   */
  broadcast(event: ServerMessage, workOrderId: string): void {
    const message = JSON.stringify(event);
    let sentCount = 0;

    for (const connection of this.connections.values()) {
      if (connection.subscriptions.has(workOrderId)) {
        this.sendToConnection(connection, message);
        sentCount++;
      }
    }

    logger.debug(
      { workOrderId, eventType: event.type, sentCount },
      'Broadcast to subscribers'
    );
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcastToAll(event: ServerMessage): void {
    const message = JSON.stringify(event);
    let sentCount = 0;

    for (const connection of this.connections.values()) {
      this.sendToConnection(connection, message);
      sentCount++;
    }

    logger.debug({ eventType: event.type, sentCount }, 'Broadcast to all');
  }

  /**
   * Send a message to a specific connection by ID
   */
  sendToConnection(connectionOrId: WebSocketConnection | string, message: string): boolean {
    const connection =
      typeof connectionOrId === 'string'
        ? this.connections.get(connectionOrId)
        : connectionOrId;

    if (!connection) {
      return false;
    }

    try {
      if (connection.socket.readyState === 1) {
        // WebSocket.OPEN
        connection.socket.send(message);
        return true;
      } else {
        logger.warn(
          { connectionId: connection.id, readyState: connection.socket.readyState },
          'Socket not open, removing connection'
        );
        this.removeConnection(connection.id);
        return false;
      }
    } catch (error) {
      logger.error(
        { err: error, connectionId: connection.id },
        'Failed to send message'
      );
      this.removeConnection(connection.id);
      return false;
    }
  }

  // ==========================================================================
  // Convenience methods for emitting specific events
  // ==========================================================================

  /**
   * Emit a work order created event to all clients
   */
  emitWorkOrderCreated(workOrderId: string, taskPrompt: string, status: string): void {
    const event: WorkOrderCreatedEvent = {
      type: 'work_order_created',
      workOrderId,
      taskPrompt,
      status,
      timestamp: new Date().toISOString(),
    };
    this.broadcastToAll(event);
  }

  /**
   * Emit a work order updated event to subscribers
   */
  emitWorkOrderUpdated(
    workOrderId: string,
    status: string,
    previousStatus?: string
  ): void {
    const event: WorkOrderUpdatedEvent = {
      type: 'work_order_updated',
      workOrderId,
      status,
      ...(previousStatus !== undefined && { previousStatus }),
      timestamp: new Date().toISOString(),
    };
    this.broadcast(event, workOrderId);
  }

  /**
   * Emit a run started event to subscribers
   */
  emitRunStarted(workOrderId: string, runId: string, runNumber: number): void {
    const event: RunStartedEvent = {
      type: 'run_started',
      workOrderId,
      runId,
      runNumber,
      timestamp: new Date().toISOString(),
    };
    this.broadcast(event, workOrderId);
  }

  /**
   * Emit a run iteration event to subscribers
   */
  emitRunIteration(
    workOrderId: string,
    runId: string,
    iterationNumber: number,
    totalIterations: number,
    verificationPassed: boolean,
    verificationDetails?: {
      l0Passed: boolean;
      l1Passed: boolean;
      l2Passed?: boolean;
      l3Passed?: boolean;
    }
  ): void {
    const event: RunIterationEvent = {
      type: 'run_iteration',
      workOrderId,
      runId,
      iterationNumber,
      totalIterations,
      verificationPassed,
      ...(verificationDetails !== undefined && { verificationDetails }),
      timestamp: new Date().toISOString(),
    };
    this.broadcast(event, workOrderId);
  }

  /**
   * Emit a run completed event to subscribers
   */
  emitRunCompleted(
    workOrderId: string,
    runId: string,
    prUrl?: string,
    branchName?: string
  ): void {
    const event: RunCompletedEvent = {
      type: 'run_completed',
      workOrderId,
      runId,
      ...(prUrl !== undefined && { prUrl }),
      ...(branchName !== undefined && { branchName }),
      timestamp: new Date().toISOString(),
    };
    this.broadcast(event, workOrderId);
  }

  /**
   * Emit a run failed event to subscribers
   */
  emitRunFailed(
    workOrderId: string,
    runId: string,
    error: string,
    iterationNumber?: number
  ): void {
    const event: RunFailedEvent = {
      type: 'run_failed',
      workOrderId,
      runId,
      error,
      ...(iterationNumber !== undefined && { iterationNumber }),
      timestamp: new Date().toISOString(),
    };
    this.broadcast(event, workOrderId);
  }

  // ==========================================================================
  // Agent Streaming Events (Thrust 4)
  // ==========================================================================

  /**
   * Emit an agent tool call event to subscribers
   * Respects per-connection subscription preferences
   */
  emitAgentToolCall(
    workOrderId: string,
    runId: string,
    toolUseId: string,
    tool: AgentToolName,
    input: Record<string, unknown>
  ): void {
    const event: AgentToolCallEvent = {
      type: 'agent_tool_call',
      workOrderId,
      runId,
      toolUseId,
      tool,
      input,
      timestamp: new Date().toISOString(),
    };
    this.broadcastWithFilter(event, workOrderId, 'includeToolCalls');
  }

  /**
   * Emit an agent tool result event to subscribers
   * Respects per-connection subscription preferences
   */
  emitAgentToolResult(
    workOrderId: string,
    runId: string,
    toolUseId: string,
    success: boolean,
    contentPreview: string,
    contentLength: number,
    durationMs: number
  ): void {
    const event: AgentToolResultEvent = {
      type: 'agent_tool_result',
      workOrderId,
      runId,
      toolUseId,
      success,
      contentPreview,
      contentLength,
      durationMs,
      timestamp: new Date().toISOString(),
    };
    this.broadcastWithFilter(event, workOrderId, 'includeToolResults');
  }

  /**
   * Emit an agent output event to subscribers
   * Respects per-connection subscription preferences
   * Debounced to avoid flooding with rapid text output
   */
  emitAgentOutput(workOrderId: string, runId: string, content: string): void {
    // Apply debouncing
    const throttleKey = `output:${workOrderId}:${runId}`;
    const now = Date.now();
    const lastEmit = this.throttleState.lastEmitTime.get(throttleKey) ?? 0;

    if (now - lastEmit < this.outputDebounceMs) {
      // Skip this event due to throttling
      return;
    }

    this.throttleState.lastEmitTime.set(throttleKey, now);

    const event: AgentOutputEvent = {
      type: 'agent_output',
      workOrderId,
      runId,
      content,
      timestamp: new Date().toISOString(),
    };
    this.broadcastWithFilter(event, workOrderId, 'includeOutput');
  }

  /**
   * Emit a file changed event to subscribers
   * Respects per-connection subscription preferences
   */
  emitFileChanged(
    workOrderId: string,
    runId: string,
    path: string,
    action: FileChangeAction,
    sizeBytes?: number
  ): void {
    const event: FileChangedEvent = {
      type: 'file_changed',
      workOrderId,
      runId,
      path,
      action,
      ...(sizeBytes !== undefined && { sizeBytes }),
      timestamp: new Date().toISOString(),
    };
    this.broadcastWithFilter(event, workOrderId, 'includeFileChanges');
  }

  /**
   * Emit a progress update event to subscribers
   * Respects per-connection subscription preferences
   * Never throttled for error visibility
   */
  emitProgressUpdate(
    workOrderId: string,
    runId: string,
    percentage: number,
    currentPhase: string,
    toolCallCount: number,
    elapsedSeconds: number,
    estimatedRemainingSeconds?: number
  ): void {
    const event: ProgressUpdateEvent = {
      type: 'progress_update',
      workOrderId,
      runId,
      percentage,
      currentPhase,
      toolCallCount,
      elapsedSeconds,
      ...(estimatedRemainingSeconds !== undefined && { estimatedRemainingSeconds }),
      timestamp: new Date().toISOString(),
    };
    this.broadcastWithFilter(event, workOrderId, 'includeProgress');
  }

  /**
   * Broadcast an event with filter checking
   * Only sends to connections whose preferences allow this event type
   */
  private broadcastWithFilter(
    event: ServerMessage,
    workOrderId: string,
    filterKey: keyof SubscriptionFilters
  ): void {
    const message = JSON.stringify(event);
    let sentCount = 0;

    for (const connection of this.connections.values()) {
      if (!connection.subscriptions.has(workOrderId)) {
        continue;
      }

      // Check subscription filter preferences
      const filters = connection.preferences.get(workOrderId) ?? DEFAULT_FILTERS;
      if (!filters[filterKey]) {
        continue;
      }

      this.sendToConnection(connection, message);
      sentCount++;
    }

    logger.debug(
      { workOrderId, eventType: event.type, filterKey, sentCount },
      'Broadcast with filter to subscribers'
    );
  }
}
