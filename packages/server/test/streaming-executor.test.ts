/**
 * StreamingExecutor Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StreamingExecutor,
  createStreamingExecutor,
  type StreamingEventCallback,
  type ExecutionResult,
  type ParsedEvent,
} from '../src/agent/streaming-executor.js';

describe('StreamingExecutor', () => {
  const workOrderId = 'wo-test-123';
  const runId = 'run-test-456';

  describe('constructor', () => {
    it('should create executor with default options', () => {
      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      expect(executor).toBeDefined();
      expect(executor.getToolCallCount()).toBe(0);
    });

    it('should create executor with custom options', () => {
      const callback: StreamingEventCallback = vi.fn();
      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        eventCallback: callback,
        options: {
          emitToolCalls: false,
          emitToolResults: true,
          emitOutput: true,
          progressIntervalMs: 10000,
        },
      });

      expect(executor).toBeDefined();
    });

    it('should use factory function', () => {
      const executor = createStreamingExecutor({
        workOrderId,
        runId,
      });

      expect(executor).toBeInstanceOf(StreamingExecutor);
    });
  });

  describe('execute', () => {
    it('should execute simple echo command', async () => {
      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const result = await executor.execute('echo', ['hello']);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello');
      expect(result.cancelled).toBe(false);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should handle command failure', async () => {
      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const result = await executor.execute('false', []);

      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
      expect(result.cancelled).toBe(false);
    });

    it('should collect events for JSON lines', async () => {
      const events: ParsedEvent[] = [];
      const callback: StreamingEventCallback = (event) => {
        events.push(event);
      };

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        eventCallback: callback,
      });

      // Echo a valid Claude message
      const message = JSON.stringify({
        type: 'assistant',
        message: { type: 'text', text: 'Hello from test' },
      });

      const result = await executor.execute('echo', [message]);

      expect(result.success).toBe(true);
      expect(events.length).toBeGreaterThanOrEqual(1);

      const outputEvent = events.find((e) => e.type === 'agent_output');
      expect(outputEvent).toBeDefined();
      if (outputEvent && outputEvent.type === 'agent_output') {
        expect(outputEvent.content).toBe('Hello from test');
        expect(outputEvent.workOrderId).toBe(workOrderId);
        expect(outputEvent.runId).toBe(runId);
      }
    });

    it('should emit tool call events', async () => {
      const events: ParsedEvent[] = [];
      const callback: StreamingEventCallback = (event) => {
        events.push(event);
      };

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        eventCallback: callback,
      });

      const message = JSON.stringify({
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'toolu_test_01',
          name: 'Read',
          input: { file_path: '/test.ts' },
        },
      });

      await executor.execute('echo', [message]);

      const toolCallEvent = events.find((e) => e.type === 'agent_tool_call');
      expect(toolCallEvent).toBeDefined();
      if (toolCallEvent && toolCallEvent.type === 'agent_tool_call') {
        expect(toolCallEvent.toolUseId).toBe('toolu_test_01');
        expect(toolCallEvent.tool).toBe('Read');
        expect(toolCallEvent.input).toEqual({ file_path: '/test.ts' });
      }

      expect(executor.getToolCallCount()).toBe(1);
    });

    it('should emit tool result events', async () => {
      const events: ParsedEvent[] = [];
      const callback: StreamingEventCallback = (event) => {
        events.push(event);
      };

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        eventCallback: callback,
      });

      // Emit both tool call and result
      const toolUse = JSON.stringify({
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'toolu_result_01',
          name: 'Read',
          input: {},
        },
      });
      const toolResult = JSON.stringify({
        type: 'user',
        message: {
          type: 'tool_result',
          tool_use_id: 'toolu_result_01',
          content: 'File contents here',
        },
      });

      // Use printf to emit multiple lines
      await executor.execute('sh', ['-c', `echo '${toolUse}'; echo '${toolResult}'`]);

      const resultEvent = events.find((e) => e.type === 'agent_tool_result');
      expect(resultEvent).toBeDefined();
      if (resultEvent && resultEvent.type === 'agent_tool_result') {
        expect(resultEvent.toolUseId).toBe('toolu_result_01');
        expect(resultEvent.success).toBe(true);
        expect(resultEvent.contentPreview).toBe('File contents here');
      }
    });

    it('should respect emitToolCalls option', async () => {
      const events: ParsedEvent[] = [];
      const callback: StreamingEventCallback = (event) => {
        events.push(event);
      };

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        eventCallback: callback,
        options: {
          emitToolCalls: false,
        },
      });

      const message = JSON.stringify({
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'toolu_skip_01',
          name: 'Read',
          input: {},
        },
      });

      await executor.execute('echo', [message]);

      const toolCallEvent = events.find((e) => e.type === 'agent_tool_call');
      expect(toolCallEvent).toBeUndefined();
    });

    it('should respect emitOutput option', async () => {
      const events: ParsedEvent[] = [];
      const callback: StreamingEventCallback = (event) => {
        events.push(event);
      };

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        eventCallback: callback,
        options: {
          emitOutput: false,
        },
      });

      const message = JSON.stringify({
        type: 'assistant',
        message: { type: 'text', text: 'Should be skipped' },
      });

      await executor.execute('echo', [message]);

      const outputEvent = events.find((e) => e.type === 'agent_output');
      expect(outputEvent).toBeUndefined();
    });

    it('should handle timeout', async () => {
      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const result = await executor.execute('sleep', ['10'], {
        timeout: 100,
      });

      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(false);
      // Process should be killed
      expect(result.exitCode).not.toBe(0);
    });

    it('should support cancellation via AbortSignal', async () => {
      const controller = new AbortController();
      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      // Start execution
      const resultPromise = executor.execute('sleep', ['10'], {
        signal: controller.signal,
      });

      // Cancel after 50ms
      setTimeout(() => controller.abort(), 50);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(result.stderr).toContain('cancelled');
    });

    it('should handle working directory option', async () => {
      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const result = await executor.execute('pwd', [], {
        cwd: '/tmp',
      });

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('/tmp');
    });

    it('should handle environment variables', async () => {
      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const result = await executor.execute('sh', ['-c', 'echo $TEST_VAR'], {
        env: { TEST_VAR: 'test_value' },
      });

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('test_value');
    });

    it('should capture stderr', async () => {
      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const result = await executor.execute('sh', ['-c', 'echo error >&2']);

      expect(result.stderr).toContain('error');
    });

    it('should handle command not found', async () => {
      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const result = await executor.execute('nonexistent_command_12345', []);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset tool call count', async () => {
      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const message = JSON.stringify({
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'toolu_count_01',
          name: 'Read',
          input: {},
        },
      });

      await executor.execute('echo', [message]);
      expect(executor.getToolCallCount()).toBe(1);

      executor.reset();
      expect(executor.getToolCallCount()).toBe(0);
    });
  });

  describe('event callback error handling', () => {
    it('should handle errors in event callback gracefully', async () => {
      const callback: StreamingEventCallback = () => {
        throw new Error('Callback error');
      };

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        eventCallback: callback,
      });

      const message = JSON.stringify({
        type: 'assistant',
        message: { type: 'text', text: 'Test' },
      });

      // Should not throw
      const result = await executor.execute('echo', [message]);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid JSON handling', () => {
    it('should skip invalid JSON lines', async () => {
      const events: ParsedEvent[] = [];
      const callback: StreamingEventCallback = (event) => {
        events.push(event);
      };

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        eventCallback: callback,
      });

      // Mix of invalid and valid JSON
      const validMessage = JSON.stringify({
        type: 'assistant',
        message: { type: 'text', text: 'Valid' },
      });

      await executor.execute('sh', [
        '-c',
        `echo 'invalid json {{{'; echo '${validMessage}'`,
      ]);

      // Should only get the valid message
      const outputEvents = events.filter((e) => e.type === 'agent_output');
      expect(outputEvents.length).toBe(1);
    });

    it('should skip non-Claude message JSON', async () => {
      const events: ParsedEvent[] = [];
      const callback: StreamingEventCallback = (event) => {
        events.push(event);
      };

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        eventCallback: callback,
      });

      await executor.execute('echo', ['{"random": "json"}']);

      expect(events.length).toBe(0);
    });
  });
});
