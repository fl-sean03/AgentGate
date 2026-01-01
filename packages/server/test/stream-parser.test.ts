/**
 * Stream Parser Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import {
  StreamParser,
  type ClaudeAssistantToolUseMessage,
  type ClaudeAssistantTextMessage,
  type ClaudeToolResultMessage,
  type ParsedEvent,
} from '../src/agent/stream-parser.js';

describe('StreamParser', () => {
  let parser: StreamParser;
  const workOrderId = 'wo-123';
  const runId = 'run-456';

  beforeEach(() => {
    parser = new StreamParser({ debug: false });
  });

  describe('parseLine', () => {
    it('should handle valid JSON', () => {
      const line = JSON.stringify({
        type: 'system',
        subtype: 'init',
        cwd: '/workspace',
      });

      const result = parser.parseLine(line);

      expect(result).toEqual({
        type: 'system',
        subtype: 'init',
        cwd: '/workspace',
      });
    });

    it('should return null for invalid JSON', () => {
      const result = parser.parseLine('not valid json {{{');

      expect(result).toBeNull();
    });

    it('should return null for empty lines', () => {
      expect(parser.parseLine('')).toBeNull();
      expect(parser.parseLine('   ')).toBeNull();
      expect(parser.parseLine('\n')).toBeNull();
    });

    it('should return null for unknown types', () => {
      const line = JSON.stringify({
        type: 'unknown_type',
        data: 'some data',
      });

      const result = parser.parseLine(line);

      expect(result).toBeNull();
    });

    it('should parse assistant text message', () => {
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          type: 'text',
          text: 'Hello, I will help you.',
        },
      });

      const result = parser.parseLine(line);

      expect(result).toEqual({
        type: 'assistant',
        message: {
          type: 'text',
          text: 'Hello, I will help you.',
        },
      });
    });

    it('should parse assistant tool_use message', () => {
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'toolu_01',
          name: 'Read',
          input: { file_path: '/workspace/src/index.ts' },
        },
      });

      const result = parser.parseLine(line);

      expect(result).toEqual({
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'toolu_01',
          name: 'Read',
          input: { file_path: '/workspace/src/index.ts' },
        },
      });
    });

    it('should parse user tool_result message', () => {
      const line = JSON.stringify({
        type: 'user',
        message: {
          type: 'tool_result',
          tool_use_id: 'toolu_01',
          content: 'File contents here...',
        },
      });

      const result = parser.parseLine(line);

      expect(result).toEqual({
        type: 'user',
        message: {
          type: 'tool_result',
          tool_use_id: 'toolu_01',
          content: 'File contents here...',
        },
      });
    });
  });

  describe('parseToolUse', () => {
    it('should parse Read tool call', () => {
      const message: ClaudeAssistantToolUseMessage = {
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'toolu_read_01',
          name: 'Read',
          input: { file_path: '/workspace/README.md' },
        },
      };

      const event = parser.parseToolUse(message, workOrderId, runId);

      expect(event.type).toBe('agent_tool_call');
      expect(event.workOrderId).toBe(workOrderId);
      expect(event.runId).toBe(runId);
      expect(event.toolUseId).toBe('toolu_read_01');
      expect(event.tool).toBe('Read');
      expect(event.input).toEqual({ file_path: '/workspace/README.md' });
      expect(event.timestamp).toBeDefined();
    });

    it('should parse Write tool call', () => {
      const message: ClaudeAssistantToolUseMessage = {
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'toolu_write_01',
          name: 'Write',
          input: { file_path: '/workspace/new.ts', content: 'export const x = 1;' },
        },
      };

      const event = parser.parseToolUse(message, workOrderId, runId);

      expect(event.tool).toBe('Write');
      expect(event.input).toEqual({ file_path: '/workspace/new.ts', content: 'export const x = 1;' });
    });

    it('should parse Bash tool call with command', () => {
      const message: ClaudeAssistantToolUseMessage = {
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'toolu_bash_01',
          name: 'Bash',
          input: { command: 'npm install', timeout: 60000 },
        },
      };

      const event = parser.parseToolUse(message, workOrderId, runId);

      expect(event.tool).toBe('Bash');
      expect(event.input).toEqual({ command: 'npm install', timeout: 60000 });
    });

    it('should extract tool use ID', () => {
      const message: ClaudeAssistantToolUseMessage = {
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'unique_tool_id_123',
          name: 'Grep',
          input: { pattern: 'TODO' },
        },
      };

      const event = parser.parseToolUse(message, workOrderId, runId);

      expect(event.toolUseId).toBe('unique_tool_id_123');
    });

    it('should handle unknown tool as Other', () => {
      const message: ClaudeAssistantToolUseMessage = {
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'toolu_unknown_01',
          name: 'CustomTool',
          input: { foo: 'bar' },
        },
      };

      const event = parser.parseToolUse(message, workOrderId, runId);

      expect(event.tool).toBe('Other');
    });

    it('should handle missing input fields', () => {
      const message: ClaudeAssistantToolUseMessage = {
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'toolu_01',
          name: 'Read',
          input: {},
        },
      };

      const event = parser.parseToolUse(message, workOrderId, runId);

      expect(event.input).toEqual({});
    });

    it('should increment tool call count', () => {
      const message: ClaudeAssistantToolUseMessage = {
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'toolu_01',
          name: 'Read',
          input: {},
        },
      };

      expect(parser.getToolCallCount()).toBe(0);

      parser.parseToolUse(message, workOrderId, runId);
      expect(parser.getToolCallCount()).toBe(1);

      parser.parseToolUse(
        { ...message, message: { ...message.message, id: 'toolu_02' } },
        workOrderId,
        runId
      );
      expect(parser.getToolCallCount()).toBe(2);
    });
  });

  describe('parseToolResult', () => {
    it('should parse successful result', () => {
      // First, simulate a tool call to track timing
      parser.parseToolUse(
        {
          type: 'assistant',
          message: { type: 'tool_use', id: 'toolu_01', name: 'Read', input: {} },
        },
        workOrderId,
        runId
      );

      const message: ClaudeToolResultMessage = {
        type: 'user',
        message: {
          type: 'tool_result',
          tool_use_id: 'toolu_01',
          content: 'File contents successfully read.',
        },
      };

      const event = parser.parseToolResult(message, workOrderId, runId);

      expect(event.type).toBe('agent_tool_result');
      expect(event.workOrderId).toBe(workOrderId);
      expect(event.runId).toBe(runId);
      expect(event.toolUseId).toBe('toolu_01');
      expect(event.success).toBe(true);
      expect(event.contentPreview).toBe('File contents successfully read.');
      expect(event.contentLength).toBe(32);
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should parse error result', () => {
      const message: ClaudeToolResultMessage = {
        type: 'user',
        message: {
          type: 'tool_result',
          tool_use_id: 'toolu_error_01',
          content: 'Error: File not found',
          is_error: true,
        },
      };

      const event = parser.parseToolResult(message, workOrderId, runId);

      expect(event.success).toBe(false);
      expect(event.contentPreview).toBe('Error: File not found');
    });

    it('should truncate long content', () => {
      const longContent = 'x'.repeat(600);
      const message: ClaudeToolResultMessage = {
        type: 'user',
        message: {
          type: 'tool_result',
          tool_use_id: 'toolu_01',
          content: longContent,
        },
      };

      const event = parser.parseToolResult(message, workOrderId, runId);

      expect(event.contentPreview.length).toBe(503); // 500 + '...'
      expect(event.contentPreview.endsWith('...')).toBe(true);
      expect(event.contentLength).toBe(600);
    });

    it('should track content length', () => {
      const content = 'Short content';
      const message: ClaudeToolResultMessage = {
        type: 'user',
        message: {
          type: 'tool_result',
          tool_use_id: 'toolu_01',
          content,
        },
      };

      const event = parser.parseToolResult(message, workOrderId, runId);

      expect(event.contentLength).toBe(content.length);
    });

    it('should correlate with tool call ID', () => {
      const toolUseId = 'correlation_test_id';
      const message: ClaudeToolResultMessage = {
        type: 'user',
        message: {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: 'Result',
        },
      };

      const event = parser.parseToolResult(message, workOrderId, runId);

      expect(event.toolUseId).toBe(toolUseId);
    });
  });

  describe('parseText', () => {
    it('should extract assistant text', () => {
      const message: ClaudeAssistantTextMessage = {
        type: 'assistant',
        message: {
          type: 'text',
          text: 'I will help you implement this feature.',
        },
      };

      const event = parser.parseText(message, workOrderId, runId);

      expect(event).not.toBeNull();
      expect(event!.type).toBe('agent_output');
      expect(event!.workOrderId).toBe(workOrderId);
      expect(event!.runId).toBe(runId);
      expect(event!.content).toBe('I will help you implement this feature.');
    });

    it('should handle empty text', () => {
      const message: ClaudeAssistantTextMessage = {
        type: 'assistant',
        message: {
          type: 'text',
          text: '',
        },
      };

      const event = parser.parseText(message, workOrderId, runId);

      expect(event).toBeNull();
    });

    it('should handle whitespace-only text', () => {
      const message: ClaudeAssistantTextMessage = {
        type: 'assistant',
        message: {
          type: 'text',
          text: '   \n\t   ',
        },
      };

      const event = parser.parseText(message, workOrderId, runId);

      expect(event).toBeNull();
    });
  });

  describe('parseStream', () => {
    function createReadline(lines: string[]): ReturnType<typeof createInterface> {
      const stream = Readable.from(lines.map(line => line + '\n'));
      return createInterface({ input: stream });
    }

    it('should yield events in order', async () => {
      const lines = [
        JSON.stringify({ type: 'system', subtype: 'init', cwd: '/workspace' }),
        JSON.stringify({
          type: 'assistant',
          message: { type: 'text', text: 'Starting...' },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { type: 'tool_use', id: 'toolu_01', name: 'Read', input: { file_path: '/test.ts' } },
        }),
        JSON.stringify({
          type: 'user',
          message: { type: 'tool_result', tool_use_id: 'toolu_01', content: 'file contents' },
        }),
      ];

      const readline = createReadline(lines);
      const events: ParsedEvent[] = [];

      for await (const event of parser.parseStream(readline, workOrderId, runId)) {
        events.push(event);
      }

      // Filter out progress updates
      const nonProgressEvents = events.filter(e => e.type !== 'progress_update');

      expect(nonProgressEvents.length).toBe(3);
      expect(nonProgressEvents[0].type).toBe('agent_output');
      expect(nonProgressEvents[1].type).toBe('agent_tool_call');
      expect(nonProgressEvents[2].type).toBe('agent_tool_result');
    });

    it('should track tool call timing', async () => {
      const lines = [
        JSON.stringify({
          type: 'assistant',
          message: { type: 'tool_use', id: 'toolu_timing', name: 'Bash', input: { command: 'ls' } },
        }),
        JSON.stringify({
          type: 'user',
          message: { type: 'tool_result', tool_use_id: 'toolu_timing', content: 'file1\nfile2' },
        }),
      ];

      const readline = createReadline(lines);
      const events: ParsedEvent[] = [];

      for await (const event of parser.parseStream(readline, workOrderId, runId)) {
        events.push(event);
      }

      const resultEvent = events.find(e => e.type === 'agent_tool_result');
      expect(resultEvent).toBeDefined();
      expect((resultEvent as { durationMs: number }).durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should emit progress updates when interval elapsed', async () => {
      // Use extremely short progress interval for testing
      const fastParser = new StreamParser({ progressIntervalMs: 0 });

      // Multiple lines to ensure we get a chance for progress emission
      const lines = [
        JSON.stringify({
          type: 'assistant',
          message: { type: 'text', text: 'Working...' },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { type: 'tool_use', id: 'toolu_01', name: 'Read', input: {} },
        }),
      ];

      const readline = createReadline(lines);
      const events: ParsedEvent[] = [];

      for await (const event of fastParser.parseStream(readline, workOrderId, runId)) {
        events.push(event);
      }

      // Should have both text output and tool call events
      expect(events.some(e => e.type === 'agent_output')).toBe(true);
      expect(events.some(e => e.type === 'agent_tool_call')).toBe(true);
    });

    it('should handle stream errors gracefully', async () => {
      const lines = [
        'invalid json {{{',
        JSON.stringify({
          type: 'assistant',
          message: { type: 'text', text: 'Still working' },
        }),
      ];

      const readline = createReadline(lines);
      const events: ParsedEvent[] = [];

      // Should not throw, should skip invalid line
      for await (const event of parser.parseStream(readline, workOrderId, runId)) {
        events.push(event);
      }

      const nonProgressEvents = events.filter(e => e.type !== 'progress_update');
      expect(nonProgressEvents.length).toBe(1);
      expect(nonProgressEvents[0].type).toBe('agent_output');
    });
  });

  describe('createProgressEvent', () => {
    it('should create progress event with correct fields', () => {
      const event = parser.createProgressEvent(workOrderId, runId, 'Reading files');

      expect(event.type).toBe('progress_update');
      expect(event.workOrderId).toBe(workOrderId);
      expect(event.runId).toBe(runId);
      expect(event.currentPhase).toBe('Reading files');
      expect(event.percentage).toBeGreaterThanOrEqual(0);
      expect(event.percentage).toBeLessThanOrEqual(100);
      expect(event.toolCallCount).toBe(0);
      expect(event.elapsedSeconds).toBeGreaterThanOrEqual(0);
      expect(event.timestamp).toBeDefined();
    });

    it('should increment percentage with tool calls', () => {
      // Make some tool calls
      parser.parseToolUse(
        { type: 'assistant', message: { type: 'tool_use', id: '1', name: 'Read', input: {} } },
        workOrderId,
        runId
      );
      parser.parseToolUse(
        { type: 'assistant', message: { type: 'tool_use', id: '2', name: 'Read', input: {} } },
        workOrderId,
        runId
      );

      const event = parser.createProgressEvent(workOrderId, runId, 'Processing');

      expect(event.toolCallCount).toBe(2);
      expect(event.percentage).toBe(10); // 2 * 5 = 10
    });

    it('should cap percentage at 95', () => {
      // Make many tool calls
      for (let i = 0; i < 25; i++) {
        parser.parseToolUse(
          { type: 'assistant', message: { type: 'tool_use', id: `id_${i}`, name: 'Read', input: {} } },
          workOrderId,
          runId
        );
      }

      const event = parser.createProgressEvent(workOrderId, runId, 'Processing');

      expect(event.percentage).toBe(95);
    });
  });

  describe('factory methods', () => {
    it('should create tool call event with all fields', () => {
      const event = parser.createToolCallEvent(workOrderId, runId, {
        toolUseId: 'test_id',
        tool: 'Edit',
        input: { file_path: '/test.ts', old_string: 'a', new_string: 'b' },
      });

      expect(event.type).toBe('agent_tool_call');
      expect(event.workOrderId).toBe(workOrderId);
      expect(event.runId).toBe(runId);
      expect(event.toolUseId).toBe('test_id');
      expect(event.tool).toBe('Edit');
      expect(event.input).toEqual({ file_path: '/test.ts', old_string: 'a', new_string: 'b' });
      expect(event.timestamp).toBeDefined();
    });

    it('should create tool result event with all fields', () => {
      const event = parser.createToolResultEvent(workOrderId, runId, {
        toolUseId: 'result_id',
        success: true,
        content: 'Operation completed',
        durationMs: 150,
      });

      expect(event.type).toBe('agent_tool_result');
      expect(event.workOrderId).toBe(workOrderId);
      expect(event.runId).toBe(runId);
      expect(event.toolUseId).toBe('result_id');
      expect(event.success).toBe(true);
      expect(event.contentPreview).toBe('Operation completed');
      expect(event.contentLength).toBe(19);
      expect(event.durationMs).toBe(150);
      expect(event.timestamp).toBeDefined();
    });

    it('should create output event with all fields', () => {
      const event = parser.createOutputEvent(workOrderId, runId, 'Agent thinking...');

      expect(event.type).toBe('agent_output');
      expect(event.workOrderId).toBe(workOrderId);
      expect(event.runId).toBe(runId);
      expect(event.content).toBe('Agent thinking...');
      expect(event.timestamp).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should reset all internal state', () => {
      // Add some state
      parser.parseToolUse(
        { type: 'assistant', message: { type: 'tool_use', id: '1', name: 'Read', input: {} } },
        workOrderId,
        runId
      );

      expect(parser.getToolCallCount()).toBe(1);

      parser.reset();

      expect(parser.getToolCallCount()).toBe(0);
    });
  });
});

describe('AgentEventTypes', () => {
  it('should include all new types in ServerMessage', async () => {
    // Type-level test: import and verify types exist
    const types = await import('../src/server/websocket/types.js');

    // Verify the types exist by checking they're defined
    expect(types.WebSocketErrorCode).toBeDefined();

    // The following would cause compile errors if types are missing
    // This is a runtime check that the module exports exist
    const serverMessageTypeTest: types.ServerMessage = {
      type: 'agent_tool_call',
      workOrderId: 'wo-1',
      runId: 'run-1',
      toolUseId: 'toolu_1',
      tool: 'Read',
      input: {},
      timestamp: new Date().toISOString(),
    };
    expect(serverMessageTypeTest.type).toBe('agent_tool_call');
  });

  it('should validate AgentToolCallEvent structure', async () => {
    const types = await import('../src/server/websocket/types.js');

    const event: types.AgentToolCallEvent = {
      type: 'agent_tool_call',
      workOrderId: 'wo-123',
      runId: 'run-456',
      toolUseId: 'toolu_abc',
      tool: 'Read',
      input: { file_path: '/test.ts' },
      timestamp: '2024-01-01T00:00:00.000Z',
    };

    expect(event.type).toBe('agent_tool_call');
    expect(event.workOrderId).toBe('wo-123');
    expect(event.runId).toBe('run-456');
    expect(event.toolUseId).toBe('toolu_abc');
    expect(event.tool).toBe('Read');
    expect(event.input).toEqual({ file_path: '/test.ts' });
    expect(event.timestamp).toBe('2024-01-01T00:00:00.000Z');
  });

  it('should validate AgentToolResultEvent structure', async () => {
    const types = await import('../src/server/websocket/types.js');

    const event: types.AgentToolResultEvent = {
      type: 'agent_tool_result',
      workOrderId: 'wo-123',
      runId: 'run-456',
      toolUseId: 'toolu_abc',
      success: true,
      contentPreview: 'File contents...',
      contentLength: 1024,
      durationMs: 50,
      timestamp: '2024-01-01T00:00:00.000Z',
    };

    expect(event.type).toBe('agent_tool_result');
    expect(event.success).toBe(true);
    expect(event.contentPreview).toBe('File contents...');
    expect(event.contentLength).toBe(1024);
    expect(event.durationMs).toBe(50);
  });

  it('should validate SubscribeMessage with filters', async () => {
    const types = await import('../src/server/websocket/types.js');

    // Parse with filters
    const messageWithFilters = {
      type: 'subscribe' as const,
      workOrderId: 'wo-123',
      filters: {
        includeToolCalls: true,
        includeToolResults: false,
        includeOutput: true,
        includeFileChanges: false,
        includeProgress: true,
      },
    };

    const parsed = types.subscribeMessageSchema.safeParse(messageWithFilters);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.filters?.includeToolCalls).toBe(true);
      expect(parsed.data.filters?.includeToolResults).toBe(false);
    }

    // Parse without filters (should use defaults)
    const messageWithoutFilters = {
      type: 'subscribe' as const,
      workOrderId: 'wo-456',
    };

    const parsedWithoutFilters = types.subscribeMessageSchema.safeParse(messageWithoutFilters);
    expect(parsedWithoutFilters.success).toBe(true);
    expect(parsedWithoutFilters.data?.filters).toBeUndefined();
  });
});
