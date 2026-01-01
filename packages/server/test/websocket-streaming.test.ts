/**
 * WebSocket Streaming Integration Tests
 *
 * Tests the EventBroadcaster emit methods and subscription filtering
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBroadcaster } from '../src/server/websocket/broadcaster.js';
import type { SubscriptionFilters } from '../src/server/websocket/types.js';
import { createStreamingCallback } from '../src/orchestrator/run-executor.js';

// Mock WebSocket
function createMockSocket(): WebSocket {
  return {
    readyState: 1, // WebSocket.OPEN
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as WebSocket;
}

describe('EventBroadcaster Streaming Events', () => {
  let broadcaster: EventBroadcaster;

  beforeEach(() => {
    broadcaster = new EventBroadcaster();
  });

  describe('subscription with filters', () => {
    it('should subscribe with default filters', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);

      const result = broadcaster.subscribe(connectionId, 'wo-123');

      expect(result).toBe(true);

      // Verify default filters
      const filters = broadcaster.getFilters(connectionId, 'wo-123');
      expect(filters.includeToolCalls).toBe(true);
      expect(filters.includeToolResults).toBe(true);
      expect(filters.includeOutput).toBe(true);
      expect(filters.includeFileChanges).toBe(true);
      expect(filters.includeProgress).toBe(true);
    });

    it('should subscribe with custom filters', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);

      const customFilters: SubscriptionFilters = {
        includeToolCalls: true,
        includeToolResults: false,
        includeOutput: false,
        includeFileChanges: true,
        includeProgress: true,
      };

      broadcaster.subscribe(connectionId, 'wo-456', customFilters);

      const filters = broadcaster.getFilters(connectionId, 'wo-456');
      expect(filters.includeToolResults).toBe(false);
      expect(filters.includeOutput).toBe(false);
    });

    it('should remove filters on unsubscribe', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);

      broadcaster.subscribe(connectionId, 'wo-789', { includeOutput: false });
      broadcaster.unsubscribe(connectionId, 'wo-789');

      // Should return defaults after unsubscribe
      const filters = broadcaster.getFilters(connectionId, 'wo-789');
      expect(filters.includeOutput).toBe(true);
    });
  });

  describe('emitAgentToolCall', () => {
    it('should emit tool call to subscribed connections', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);
      broadcaster.subscribe(connectionId, 'wo-123');

      broadcaster.emitAgentToolCall(
        'wo-123',
        'run-456',
        'toolu_01',
        'Read',
        { file_path: '/test.ts' }
      );

      expect(socket.send).toHaveBeenCalledTimes(1);
      const message = JSON.parse((socket.send as vi.Mock).mock.calls[0][0]);
      expect(message.type).toBe('agent_tool_call');
      expect(message.workOrderId).toBe('wo-123');
      expect(message.runId).toBe('run-456');
      expect(message.toolUseId).toBe('toolu_01');
      expect(message.tool).toBe('Read');
      expect(message.input).toEqual({ file_path: '/test.ts' });
      expect(message.timestamp).toBeDefined();
    });

    it('should not emit to connections with includeToolCalls=false', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);
      broadcaster.subscribe(connectionId, 'wo-123', { includeToolCalls: false });

      broadcaster.emitAgentToolCall(
        'wo-123',
        'run-456',
        'toolu_01',
        'Read',
        {}
      );

      expect(socket.send).not.toHaveBeenCalled();
    });
  });

  describe('emitAgentToolResult', () => {
    it('should emit tool result to subscribed connections', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);
      broadcaster.subscribe(connectionId, 'wo-123');

      broadcaster.emitAgentToolResult(
        'wo-123',
        'run-456',
        'toolu_01',
        true,
        'File contents...',
        1024,
        150
      );

      expect(socket.send).toHaveBeenCalledTimes(1);
      const message = JSON.parse((socket.send as vi.Mock).mock.calls[0][0]);
      expect(message.type).toBe('agent_tool_result');
      expect(message.success).toBe(true);
      expect(message.contentPreview).toBe('File contents...');
      expect(message.contentLength).toBe(1024);
      expect(message.durationMs).toBe(150);
    });

    it('should not emit to connections with includeToolResults=false', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);
      broadcaster.subscribe(connectionId, 'wo-123', { includeToolResults: false });

      broadcaster.emitAgentToolResult(
        'wo-123',
        'run-456',
        'toolu_01',
        true,
        'content',
        100,
        50
      );

      expect(socket.send).not.toHaveBeenCalled();
    });
  });

  describe('emitAgentOutput', () => {
    it('should emit output to subscribed connections', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);
      broadcaster.subscribe(connectionId, 'wo-123');

      broadcaster.emitAgentOutput('wo-123', 'run-456', 'Agent thinking...');

      expect(socket.send).toHaveBeenCalledTimes(1);
      const message = JSON.parse((socket.send as vi.Mock).mock.calls[0][0]);
      expect(message.type).toBe('agent_output');
      expect(message.content).toBe('Agent thinking...');
    });

    it('should not emit to connections with includeOutput=false', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);
      broadcaster.subscribe(connectionId, 'wo-123', { includeOutput: false });

      broadcaster.emitAgentOutput('wo-123', 'run-456', 'Agent thinking...');

      expect(socket.send).not.toHaveBeenCalled();
    });

    it('should debounce rapid output events', async () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);
      broadcaster.subscribe(connectionId, 'wo-123');

      // Emit multiple outputs rapidly
      broadcaster.emitAgentOutput('wo-123', 'run-456', 'Output 1');
      broadcaster.emitAgentOutput('wo-123', 'run-456', 'Output 2');
      broadcaster.emitAgentOutput('wo-123', 'run-456', 'Output 3');

      // Only first should be sent due to debouncing
      expect(socket.send).toHaveBeenCalledTimes(1);
      const message = JSON.parse((socket.send as vi.Mock).mock.calls[0][0]);
      expect(message.content).toBe('Output 1');

      // Wait for debounce to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be able to emit again
      broadcaster.emitAgentOutput('wo-123', 'run-456', 'Output 4');
      expect(socket.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('emitFileChanged', () => {
    it('should emit file changed events', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);
      broadcaster.subscribe(connectionId, 'wo-123');

      broadcaster.emitFileChanged('wo-123', 'run-456', '/src/index.ts', 'modified', 2048);

      expect(socket.send).toHaveBeenCalledTimes(1);
      const message = JSON.parse((socket.send as vi.Mock).mock.calls[0][0]);
      expect(message.type).toBe('file_changed');
      expect(message.path).toBe('/src/index.ts');
      expect(message.action).toBe('modified');
      expect(message.sizeBytes).toBe(2048);
    });

    it('should not emit to connections with includeFileChanges=false', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);
      broadcaster.subscribe(connectionId, 'wo-123', { includeFileChanges: false });

      broadcaster.emitFileChanged('wo-123', 'run-456', '/src/index.ts', 'created');

      expect(socket.send).not.toHaveBeenCalled();
    });
  });

  describe('emitProgressUpdate', () => {
    it('should emit progress updates', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);
      broadcaster.subscribe(connectionId, 'wo-123');

      broadcaster.emitProgressUpdate(
        'wo-123',
        'run-456',
        45,
        'Building',
        10,
        120,
        60
      );

      expect(socket.send).toHaveBeenCalledTimes(1);
      const message = JSON.parse((socket.send as vi.Mock).mock.calls[0][0]);
      expect(message.type).toBe('progress_update');
      expect(message.percentage).toBe(45);
      expect(message.currentPhase).toBe('Building');
      expect(message.toolCallCount).toBe(10);
      expect(message.elapsedSeconds).toBe(120);
      expect(message.estimatedRemainingSeconds).toBe(60);
    });

    it('should not emit to connections with includeProgress=false', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);
      broadcaster.subscribe(connectionId, 'wo-123', { includeProgress: false });

      broadcaster.emitProgressUpdate('wo-123', 'run-456', 50, 'Testing', 5, 60);

      expect(socket.send).not.toHaveBeenCalled();
    });
  });

  describe('multiple subscriptions', () => {
    it('should handle multiple work order subscriptions per connection', () => {
      const socket = createMockSocket();
      const connectionId = broadcaster.addConnection(socket);

      broadcaster.subscribe(connectionId, 'wo-1', { includeOutput: false });
      broadcaster.subscribe(connectionId, 'wo-2', { includeOutput: true });

      // Should not receive output for wo-1
      broadcaster.emitAgentOutput('wo-1', 'run-1', 'Test 1');
      expect(socket.send).not.toHaveBeenCalled();

      // Should receive output for wo-2
      broadcaster.emitAgentOutput('wo-2', 'run-2', 'Test 2');
      expect(socket.send).toHaveBeenCalledTimes(1);
    });

    it('should broadcast to multiple connections with different filters', () => {
      const socket1 = createMockSocket();
      const socket2 = createMockSocket();

      const conn1 = broadcaster.addConnection(socket1);
      const conn2 = broadcaster.addConnection(socket2);

      broadcaster.subscribe(conn1, 'wo-123', { includeToolCalls: true });
      broadcaster.subscribe(conn2, 'wo-123', { includeToolCalls: false });

      broadcaster.emitAgentToolCall('wo-123', 'run-456', 'toolu_01', 'Read', {});

      // Only socket1 should receive the event
      expect(socket1.send).toHaveBeenCalledTimes(1);
      expect(socket2.send).not.toHaveBeenCalled();
    });
  });
});

describe('createStreamingCallback', () => {
  it('should create callback that emits tool call events', () => {
    const broadcaster = new EventBroadcaster();
    const socket = createMockSocket();
    const connectionId = broadcaster.addConnection(socket);
    broadcaster.subscribe(connectionId, 'wo-123');

    const callback = createStreamingCallback(broadcaster, 'wo-123', 'run-456');

    callback({
      type: 'agent_tool_call',
      workOrderId: 'wo-123',
      runId: 'run-456',
      toolUseId: 'toolu_01',
      tool: 'Read',
      input: { file_path: '/test.ts' },
      timestamp: new Date().toISOString(),
    });

    expect(socket.send).toHaveBeenCalledTimes(1);
    const message = JSON.parse((socket.send as vi.Mock).mock.calls[0][0]);
    expect(message.type).toBe('agent_tool_call');
  });

  it('should create callback that emits tool result events', () => {
    const broadcaster = new EventBroadcaster();
    const socket = createMockSocket();
    const connectionId = broadcaster.addConnection(socket);
    broadcaster.subscribe(connectionId, 'wo-123');

    const callback = createStreamingCallback(broadcaster, 'wo-123', 'run-456');

    callback({
      type: 'agent_tool_result',
      workOrderId: 'wo-123',
      runId: 'run-456',
      toolUseId: 'toolu_01',
      success: true,
      contentPreview: 'Content',
      contentLength: 100,
      durationMs: 50,
      timestamp: new Date().toISOString(),
    });

    expect(socket.send).toHaveBeenCalledTimes(1);
    const message = JSON.parse((socket.send as vi.Mock).mock.calls[0][0]);
    expect(message.type).toBe('agent_tool_result');
  });

  it('should create callback that emits output events', () => {
    const broadcaster = new EventBroadcaster();
    const socket = createMockSocket();
    const connectionId = broadcaster.addConnection(socket);
    broadcaster.subscribe(connectionId, 'wo-123');

    const callback = createStreamingCallback(broadcaster, 'wo-123', 'run-456');

    callback({
      type: 'agent_output',
      workOrderId: 'wo-123',
      runId: 'run-456',
      content: 'Agent output text',
      timestamp: new Date().toISOString(),
    });

    expect(socket.send).toHaveBeenCalledTimes(1);
    const message = JSON.parse((socket.send as vi.Mock).mock.calls[0][0]);
    expect(message.type).toBe('agent_output');
    expect(message.content).toBe('Agent output text');
  });

  it('should create callback that emits progress events', () => {
    const broadcaster = new EventBroadcaster();
    const socket = createMockSocket();
    const connectionId = broadcaster.addConnection(socket);
    broadcaster.subscribe(connectionId, 'wo-123');

    const callback = createStreamingCallback(broadcaster, 'wo-123', 'run-456');

    callback({
      type: 'progress_update',
      workOrderId: 'wo-123',
      runId: 'run-456',
      percentage: 75,
      currentPhase: 'Verifying',
      toolCallCount: 15,
      elapsedSeconds: 180,
      timestamp: new Date().toISOString(),
    });

    expect(socket.send).toHaveBeenCalledTimes(1);
    const message = JSON.parse((socket.send as vi.Mock).mock.calls[0][0]);
    expect(message.type).toBe('progress_update');
    expect(message.percentage).toBe(75);
  });
});

describe('WebSocketConnection preferences', () => {
  it('should initialize connection with empty preferences map', () => {
    const broadcaster = new EventBroadcaster();
    const socket = createMockSocket();
    const connectionId = broadcaster.addConnection(socket);

    const connection = broadcaster.getConnection(connectionId);
    expect(connection).toBeDefined();
    expect(connection?.preferences).toBeInstanceOf(Map);
    expect(connection?.preferences.size).toBe(0);
  });

  it('should store preferences per work order', () => {
    const broadcaster = new EventBroadcaster();
    const socket = createMockSocket();
    const connectionId = broadcaster.addConnection(socket);

    broadcaster.subscribe(connectionId, 'wo-1', { includeToolCalls: false });
    broadcaster.subscribe(connectionId, 'wo-2', { includeOutput: false });

    const connection = broadcaster.getConnection(connectionId);
    expect(connection?.preferences.size).toBe(2);
    expect(connection?.preferences.get('wo-1')?.includeToolCalls).toBe(false);
    expect(connection?.preferences.get('wo-2')?.includeOutput).toBe(false);
  });
});
