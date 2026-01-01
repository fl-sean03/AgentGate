/**
 * WebSocket Streaming Tests
 *
 * Tests for agent activity event streaming via WebSocket.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBroadcaster } from '../src/server/websocket/broadcaster.js';
import {
  DEFAULT_SUBSCRIPTION_PREFERENCES,
  type SubscriptionPreferences,
  type AgentToolCallEvent,
  type AgentToolResultEvent,
  type AgentOutputEvent,
  type ProgressUpdateEvent,
  type FileChangedEvent,
} from '../src/server/websocket/types.js';

describe('WebSocket Streaming', () => {
  let broadcaster: EventBroadcaster;
  let mockSocket: { send: ReturnType<typeof vi.fn>; readyState: number };
  let connectionId: string;
  const workOrderId = 'wo-streaming-test';
  const runId = 'run-streaming-test';

  beforeEach(() => {
    broadcaster = new EventBroadcaster();
    mockSocket = { send: vi.fn(), readyState: 1 }; // 1 = OPEN
    connectionId = broadcaster.addConnection(mockSocket as unknown as WebSocket);
  });

  describe('subscription preferences', () => {
    it('should store default preferences when subscribing without filters', () => {
      broadcaster.subscribe(connectionId, workOrderId);

      const preferences = broadcaster.getSubscriptionPreferences(connectionId, workOrderId);

      expect(preferences).toEqual(DEFAULT_SUBSCRIPTION_PREFERENCES);
    });

    it('should store custom preferences when subscribing with filters', () => {
      broadcaster.subscribe(connectionId, workOrderId, {
        includeToolCalls: true,
        includeToolResults: false,
        includeOutput: true,
        includeFileChanges: false,
        includeProgress: true,
      });

      const preferences = broadcaster.getSubscriptionPreferences(connectionId, workOrderId);

      expect(preferences).toEqual({
        includeToolCalls: true,
        includeToolResults: false,
        includeOutput: true,
        includeFileChanges: false,
        includeProgress: true,
      });
    });

    it('should merge partial filters with defaults', () => {
      broadcaster.subscribe(connectionId, workOrderId, {
        includeToolCalls: false,
      });

      const preferences = broadcaster.getSubscriptionPreferences(connectionId, workOrderId);

      expect(preferences).toEqual({
        includeToolCalls: false,
        includeToolResults: true,
        includeOutput: true,
        includeFileChanges: true,
        includeProgress: true,
      });
    });

    it('should remove preferences when unsubscribing', () => {
      broadcaster.subscribe(connectionId, workOrderId);
      expect(broadcaster.getSubscriptionPreferences(connectionId, workOrderId)).not.toBeNull();

      broadcaster.unsubscribe(connectionId, workOrderId);
      expect(broadcaster.getSubscriptionPreferences(connectionId, workOrderId)).toBeNull();
    });

    it('should return null for unknown connection', () => {
      const preferences = broadcaster.getSubscriptionPreferences('unknown', workOrderId);
      expect(preferences).toBeNull();
    });
  });

  describe('emitAgentToolCall', () => {
    it('should emit tool call to subscribed connections', () => {
      broadcaster.subscribe(connectionId, workOrderId);

      broadcaster.emitAgentToolCall(
        workOrderId,
        runId,
        'toolu_123',
        'Read',
        { file_path: '/test/file.ts' }
      );

      expect(mockSocket.send).toHaveBeenCalledTimes(1);
      const message = JSON.parse(mockSocket.send.mock.calls[0][0]);
      expect(message.type).toBe('agent_tool_call');
      expect(message.workOrderId).toBe(workOrderId);
      expect(message.runId).toBe(runId);
      expect(message.toolUseId).toBe('toolu_123');
      expect(message.tool).toBe('Read');
      expect(message.input).toEqual({ file_path: '/test/file.ts' });
      expect(message.timestamp).toBeDefined();
    });

    it('should not emit when includeToolCalls is false', () => {
      broadcaster.subscribe(connectionId, workOrderId, { includeToolCalls: false });

      broadcaster.emitAgentToolCall(workOrderId, runId, 'toolu_123', 'Read', {});

      expect(mockSocket.send).not.toHaveBeenCalled();
    });

    it('should not emit to unsubscribed connections', () => {
      // Don't subscribe
      broadcaster.emitAgentToolCall(workOrderId, runId, 'toolu_123', 'Read', {});

      expect(mockSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('emitAgentToolResult', () => {
    it('should emit tool result to subscribed connections', () => {
      broadcaster.subscribe(connectionId, workOrderId);

      broadcaster.emitAgentToolResult(
        workOrderId,
        runId,
        'toolu_456',
        true,
        'File contents...',
        1024,
        50
      );

      expect(mockSocket.send).toHaveBeenCalledTimes(1);
      const message = JSON.parse(mockSocket.send.mock.calls[0][0]);
      expect(message.type).toBe('agent_tool_result');
      expect(message.workOrderId).toBe(workOrderId);
      expect(message.runId).toBe(runId);
      expect(message.toolUseId).toBe('toolu_456');
      expect(message.success).toBe(true);
      expect(message.contentPreview).toBe('File contents...');
      expect(message.contentLength).toBe(1024);
      expect(message.durationMs).toBe(50);
    });

    it('should emit failure result', () => {
      broadcaster.subscribe(connectionId, workOrderId);

      broadcaster.emitAgentToolResult(
        workOrderId,
        runId,
        'toolu_789',
        false,
        'Error: File not found',
        20,
        10
      );

      const message = JSON.parse(mockSocket.send.mock.calls[0][0]);
      expect(message.success).toBe(false);
      expect(message.contentPreview).toBe('Error: File not found');
    });

    it('should not emit when includeToolResults is false', () => {
      broadcaster.subscribe(connectionId, workOrderId, { includeToolResults: false });

      broadcaster.emitAgentToolResult(workOrderId, runId, 'toolu_123', true, 'content', 7, 10);

      expect(mockSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('emitAgentOutput', () => {
    it('should emit output to subscribed connections', () => {
      broadcaster.subscribe(connectionId, workOrderId);

      broadcaster.emitAgentOutput(
        workOrderId,
        runId,
        'I will now implement this feature.'
      );

      expect(mockSocket.send).toHaveBeenCalledTimes(1);
      const message = JSON.parse(mockSocket.send.mock.calls[0][0]);
      expect(message.type).toBe('agent_output');
      expect(message.workOrderId).toBe(workOrderId);
      expect(message.runId).toBe(runId);
      expect(message.content).toBe('I will now implement this feature.');
    });

    it('should not emit when includeOutput is false', () => {
      broadcaster.subscribe(connectionId, workOrderId, { includeOutput: false });

      broadcaster.emitAgentOutput(workOrderId, runId, 'Should not be sent');

      expect(mockSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('emitFileChanged', () => {
    it('should emit file change events', () => {
      broadcaster.subscribe(connectionId, workOrderId);

      broadcaster.emitFileChanged(
        workOrderId,
        runId,
        'src/index.ts',
        'modified',
        2048
      );

      expect(mockSocket.send).toHaveBeenCalledTimes(1);
      const message = JSON.parse(mockSocket.send.mock.calls[0][0]);
      expect(message.type).toBe('file_changed');
      expect(message.path).toBe('src/index.ts');
      expect(message.action).toBe('modified');
      expect(message.sizeBytes).toBe(2048);
    });

    it('should emit without sizeBytes when undefined', () => {
      broadcaster.subscribe(connectionId, workOrderId);

      broadcaster.emitFileChanged(
        workOrderId,
        runId,
        'deleted/file.ts',
        'deleted'
      );

      const message = JSON.parse(mockSocket.send.mock.calls[0][0]);
      expect(message.sizeBytes).toBeUndefined();
    });

    it('should not emit when includeFileChanges is false', () => {
      broadcaster.subscribe(connectionId, workOrderId, { includeFileChanges: false });

      broadcaster.emitFileChanged(workOrderId, runId, 'file.ts', 'created');

      expect(mockSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('emitProgressUpdate', () => {
    it('should emit progress updates', () => {
      broadcaster.subscribe(connectionId, workOrderId);

      broadcaster.emitProgressUpdate(
        workOrderId,
        runId,
        50,
        'Executing tools',
        10,
        120,
        60
      );

      expect(mockSocket.send).toHaveBeenCalledTimes(1);
      const message = JSON.parse(mockSocket.send.mock.calls[0][0]);
      expect(message.type).toBe('progress_update');
      expect(message.percentage).toBe(50);
      expect(message.currentPhase).toBe('Executing tools');
      expect(message.toolCallCount).toBe(10);
      expect(message.elapsedSeconds).toBe(120);
      expect(message.estimatedRemainingSeconds).toBe(60);
    });

    it('should emit without estimatedRemainingSeconds when undefined', () => {
      broadcaster.subscribe(connectionId, workOrderId);

      broadcaster.emitProgressUpdate(
        workOrderId,
        runId,
        25,
        'Processing',
        5,
        30
      );

      const message = JSON.parse(mockSocket.send.mock.calls[0][0]);
      expect(message.estimatedRemainingSeconds).toBeUndefined();
    });

    it('should not emit when includeProgress is false', () => {
      broadcaster.subscribe(connectionId, workOrderId, { includeProgress: false });

      broadcaster.emitProgressUpdate(workOrderId, runId, 50, 'Phase', 5, 60);

      expect(mockSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('multiple connections', () => {
    it('should send to all subscribed connections', () => {
      const mockSocket2 = { send: vi.fn(), readyState: 1 };
      const connectionId2 = broadcaster.addConnection(mockSocket2 as unknown as WebSocket);

      broadcaster.subscribe(connectionId, workOrderId);
      broadcaster.subscribe(connectionId2, workOrderId);

      broadcaster.emitAgentToolCall(workOrderId, runId, 'toolu_multi', 'Bash', {});

      expect(mockSocket.send).toHaveBeenCalledTimes(1);
      expect(mockSocket2.send).toHaveBeenCalledTimes(1);

      // Both should receive the same message
      const msg1 = JSON.parse(mockSocket.send.mock.calls[0][0]);
      const msg2 = JSON.parse(mockSocket2.send.mock.calls[0][0]);
      expect(msg1.toolUseId).toBe(msg2.toolUseId);
    });

    it('should respect different preferences per connection', () => {
      const mockSocket2 = { send: vi.fn(), readyState: 1 };
      const connectionId2 = broadcaster.addConnection(mockSocket2 as unknown as WebSocket);

      // First connection wants tool calls
      broadcaster.subscribe(connectionId, workOrderId, { includeToolCalls: true });
      // Second connection doesn't want tool calls
      broadcaster.subscribe(connectionId2, workOrderId, { includeToolCalls: false });

      broadcaster.emitAgentToolCall(workOrderId, runId, 'toolu_pref', 'Read', {});

      expect(mockSocket.send).toHaveBeenCalledTimes(1);
      expect(mockSocket2.send).not.toHaveBeenCalled();
    });

    it('should only send to connections subscribed to the correct work order', () => {
      const mockSocket2 = { send: vi.fn(), readyState: 1 };
      const connectionId2 = broadcaster.addConnection(mockSocket2 as unknown as WebSocket);

      broadcaster.subscribe(connectionId, workOrderId);
      broadcaster.subscribe(connectionId2, 'other-work-order');

      broadcaster.emitAgentToolCall(workOrderId, runId, 'toolu_wo', 'Read', {});

      expect(mockSocket.send).toHaveBeenCalledTimes(1);
      expect(mockSocket2.send).not.toHaveBeenCalled();
    });
  });

  describe('connection cleanup', () => {
    it('should clean up preferences when connection is removed', () => {
      broadcaster.subscribe(connectionId, workOrderId);
      expect(broadcaster.getSubscriptionPreferences(connectionId, workOrderId)).not.toBeNull();

      broadcaster.removeConnection(connectionId);

      // After removal, getting preferences should return null
      // Note: getSubscriptionPreferences will return null for unknown connections
      expect(broadcaster.getSubscriptionPreferences(connectionId, workOrderId)).toBeNull();
    });
  });

  describe('event timestamps', () => {
    it('should include ISO timestamp in all events', () => {
      broadcaster.subscribe(connectionId, workOrderId);

      // Test various event types
      broadcaster.emitAgentToolCall(workOrderId, runId, 'toolu_ts1', 'Read', {});
      broadcaster.emitAgentToolResult(workOrderId, runId, 'toolu_ts2', true, 'content', 7, 10);
      broadcaster.emitAgentOutput(workOrderId, runId, 'text');
      broadcaster.emitProgressUpdate(workOrderId, runId, 50, 'phase', 5, 60);
      broadcaster.emitFileChanged(workOrderId, runId, 'file.ts', 'created');

      // All 5 events should have valid ISO timestamps
      expect(mockSocket.send).toHaveBeenCalledTimes(5);

      for (let i = 0; i < 5; i++) {
        const message = JSON.parse(mockSocket.send.mock.calls[i][0]);
        expect(message.timestamp).toBeDefined();
        // Verify it's a valid ISO string
        expect(() => new Date(message.timestamp)).not.toThrow();
        expect(new Date(message.timestamp).toISOString()).toBe(message.timestamp);
      }
    });
  });
});

describe('Agent Activity Event Types', () => {
  it('AgentToolCallEvent should have correct structure', () => {
    const event: AgentToolCallEvent = {
      type: 'agent_tool_call',
      workOrderId: 'wo-123',
      runId: 'run-456',
      toolUseId: 'toolu_abc',
      tool: 'Read',
      input: { file_path: '/test.ts' },
      timestamp: new Date().toISOString(),
    };

    expect(event.type).toBe('agent_tool_call');
    expect(event.tool).toBe('Read');
  });

  it('AgentToolResultEvent should have correct structure', () => {
    const event: AgentToolResultEvent = {
      type: 'agent_tool_result',
      workOrderId: 'wo-123',
      runId: 'run-456',
      toolUseId: 'toolu_abc',
      success: true,
      contentPreview: 'File contents...',
      contentLength: 1024,
      durationMs: 50,
      timestamp: new Date().toISOString(),
    };

    expect(event.type).toBe('agent_tool_result');
    expect(event.success).toBe(true);
  });

  it('AgentOutputEvent should have correct structure', () => {
    const event: AgentOutputEvent = {
      type: 'agent_output',
      workOrderId: 'wo-123',
      runId: 'run-456',
      content: 'Agent thinking...',
      timestamp: new Date().toISOString(),
    };

    expect(event.type).toBe('agent_output');
    expect(event.content).toBe('Agent thinking...');
  });

  it('ProgressUpdateEvent should have correct structure', () => {
    const event: ProgressUpdateEvent = {
      type: 'progress_update',
      workOrderId: 'wo-123',
      runId: 'run-456',
      percentage: 75,
      currentPhase: 'Executing tools',
      toolCallCount: 15,
      elapsedSeconds: 180,
      estimatedRemainingSeconds: 60,
      timestamp: new Date().toISOString(),
    };

    expect(event.type).toBe('progress_update');
    expect(event.percentage).toBe(75);
  });

  it('FileChangedEvent should have correct structure', () => {
    const event: FileChangedEvent = {
      type: 'file_changed',
      workOrderId: 'wo-123',
      runId: 'run-456',
      path: 'src/new-feature.ts',
      action: 'created',
      sizeBytes: 512,
      timestamp: new Date().toISOString(),
    };

    expect(event.type).toBe('file_changed');
    expect(event.action).toBe('created');
  });
});

describe('SubscriptionPreferences defaults', () => {
  it('DEFAULT_SUBSCRIPTION_PREFERENCES should enable all event types', () => {
    expect(DEFAULT_SUBSCRIPTION_PREFERENCES.includeToolCalls).toBe(true);
    expect(DEFAULT_SUBSCRIPTION_PREFERENCES.includeToolResults).toBe(true);
    expect(DEFAULT_SUBSCRIPTION_PREFERENCES.includeOutput).toBe(true);
    expect(DEFAULT_SUBSCRIPTION_PREFERENCES.includeFileChanges).toBe(true);
    expect(DEFAULT_SUBSCRIPTION_PREFERENCES.includeProgress).toBe(true);
  });
});
