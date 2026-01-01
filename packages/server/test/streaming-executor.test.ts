/**
 * Streaming Executor Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import {
  StreamingExecutor,
  createStreamingExecutor,
  type StreamingEventCallback,
  type StreamingExecutionResult,
} from '../src/agent/streaming-executor.js';
import type { ParsedEvent } from '../src/agent/stream-parser.js';

describe('StreamingExecutor', () => {
  const workOrderId = 'wo-test-123';
  const runId = 'run-test-456';

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
      const onEvent = vi.fn();
      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        onEvent,
        options: {
          emitToolCalls: false,
          emitOutput: true,
          progressIntervalMs: 1000,
        },
      });

      expect(executor).toBeDefined();
    });

    it('should create executor via factory function', () => {
      const executor = createStreamingExecutor({
        workOrderId,
        runId,
      });

      expect(executor).toBeInstanceOf(StreamingExecutor);
    });
  });

  describe('execute', () => {
    it('should execute simple echo command', async () => {
      vi.useRealTimers(); // Need real timers for actual execution

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const result = await executor.execute('echo', ['hello']);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello');
      expect(result.cancelled).toBe(false);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle failing command', async () => {
      vi.useRealTimers();

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      // Use a command that will fail
      const result = await executor.execute('node', ['-e', 'process.exit(1)']);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.cancelled).toBe(false);
    });

    it('should emit events for JSON output lines', async () => {
      vi.useRealTimers();

      const events: ParsedEvent[] = [];
      const onEvent: StreamingEventCallback = (event) => events.push(event);

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        onEvent,
        options: {
          emitToolCalls: true,
          emitToolResults: true,
          emitOutput: true,
        },
      });

      // Create a simple script that outputs JSON lines
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: { type: 'text', text: 'Hello from test' },
      });
      const result = await executor.execute('node', ['-e', `console.log('${jsonLine}')`]);

      expect(result.success).toBe(true);

      // Check that agent_output event was emitted
      const outputEvents = events.filter(e => e.type === 'agent_output');
      expect(outputEvents.length).toBe(1);
      expect(outputEvents[0].type).toBe('agent_output');
      expect((outputEvents[0] as { content: string }).content).toBe('Hello from test');
    });

    it('should emit tool call events', async () => {
      vi.useRealTimers();

      const events: ParsedEvent[] = [];
      const onEvent: StreamingEventCallback = (event) => events.push(event);

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        onEvent,
        options: { emitToolCalls: true },
      });

      const toolCallLine = JSON.stringify({
        type: 'assistant',
        message: {
          type: 'tool_use',
          id: 'toolu_test_01',
          name: 'Read',
          input: { file_path: '/test/file.txt' },
        },
      });
      await executor.execute('node', ['-e', `console.log('${toolCallLine}')`]);

      const toolCallEvents = events.filter(e => e.type === 'agent_tool_call');
      expect(toolCallEvents.length).toBe(1);
      expect((toolCallEvents[0] as { tool: string }).tool).toBe('Read');
      expect((toolCallEvents[0] as { toolUseId: string }).toolUseId).toBe('toolu_test_01');
    });

    it('should emit tool result events', async () => {
      vi.useRealTimers();

      const events: ParsedEvent[] = [];
      const onEvent: StreamingEventCallback = (event) => events.push(event);

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        onEvent,
        options: { emitToolCalls: true, emitToolResults: true },
      });

      // First emit a tool call, then a tool result
      const toolCallLine = JSON.stringify({
        type: 'assistant',
        message: { type: 'tool_use', id: 'toolu_test_02', name: 'Bash', input: {} },
      });
      const toolResultLine = JSON.stringify({
        type: 'user',
        message: { type: 'tool_result', tool_use_id: 'toolu_test_02', content: 'Success!' },
      });

      await executor.execute('node', [
        '-e',
        `console.log('${toolCallLine}'); console.log('${toolResultLine}')`,
      ]);

      const toolResultEvents = events.filter(e => e.type === 'agent_tool_result');
      expect(toolResultEvents.length).toBe(1);
      expect((toolResultEvents[0] as { success: boolean }).success).toBe(true);
      expect((toolResultEvents[0] as { toolUseId: string }).toolUseId).toBe('toolu_test_02');
    });

    it('should respect emitToolCalls: false', async () => {
      vi.useRealTimers();

      const events: ParsedEvent[] = [];
      const onEvent: StreamingEventCallback = (event) => events.push(event);

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        onEvent,
        options: { emitToolCalls: false },
      });

      const toolCallLine = JSON.stringify({
        type: 'assistant',
        message: { type: 'tool_use', id: 'toolu_test', name: 'Read', input: {} },
      });
      await executor.execute('node', ['-e', `console.log('${toolCallLine}')`]);

      const toolCallEvents = events.filter(e => e.type === 'agent_tool_call');
      expect(toolCallEvents.length).toBe(0);
    });

    it('should respect emitOutput: false', async () => {
      vi.useRealTimers();

      const events: ParsedEvent[] = [];
      const onEvent: StreamingEventCallback = (event) => events.push(event);

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        onEvent,
        options: { emitOutput: false },
      });

      const textLine = JSON.stringify({
        type: 'assistant',
        message: { type: 'text', text: 'Should not emit' },
      });
      await executor.execute('node', ['-e', `console.log('${textLine}')`]);

      const outputEvents = events.filter(e => e.type === 'agent_output');
      expect(outputEvents.length).toBe(0);
    });

    it('should handle timeout', async () => {
      vi.useRealTimers();

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const result = await executor.execute('node', ['-e', 'setTimeout(() => {}, 10000)'], {
        timeout: 100,
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(124); // Standard timeout exit code
      expect(result.cancelled).toBe(false);
    });

    it('should support cancellation via AbortSignal', async () => {
      vi.useRealTimers();

      const controller = new AbortController();
      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      // Start a long-running command and cancel it
      const promise = executor.execute('node', ['-e', 'setTimeout(() => {}, 10000)'], {
        signal: controller.signal,
      });

      // Cancel after a short delay
      setTimeout(() => controller.abort(), 50);

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(result.exitCode).toBe(130); // Standard interrupt exit code
    });

    it('should collect stdout for result', async () => {
      vi.useRealTimers();

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const result = await executor.execute('node', [
        '-e',
        'console.log("line1"); console.log("line2")',
      ]);

      expect(result.stdout).toContain('line1');
      expect(result.stdout).toContain('line2');
    });

    it('should collect stderr for result', async () => {
      vi.useRealTimers();

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const result = await executor.execute('node', [
        '-e',
        'console.error("error message")',
      ]);

      expect(result.stderr).toContain('error message');
    });

    it('should pass environment variables', async () => {
      vi.useRealTimers();

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const result = await executor.execute('node', ['-e', 'console.log(process.env.TEST_VAR)'], {
        env: { TEST_VAR: 'test_value' },
      });

      expect(result.stdout).toContain('test_value');
    });

    it('should use working directory', async () => {
      vi.useRealTimers();

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      // Use os.tmpdir() for cross-platform temp directory
      const os = await import('node:os');
      const tmpDir = os.tmpdir();

      // Use Node.js to print cwd instead of pwd (cross-platform)
      const result = await executor.execute('node', ['-e', 'console.log(process.cwd())'], {
        cwd: tmpDir,
      });

      expect(result.success).toBe(true);
      // Normalize path to handle symlinks (e.g., /tmp -> /private/tmp on macOS)
      const expectedPath = await fs.realpath(tmpDir);
      expect(result.stdout.trim()).toBe(expectedPath);
    });
  });

  describe('reset', () => {
    it('should reset internal state', async () => {
      vi.useRealTimers();

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        onEvent: () => {},
        options: { emitToolCalls: true },
      });

      // Execute something that creates tool calls
      const toolCallLine = JSON.stringify({
        type: 'assistant',
        message: { type: 'tool_use', id: 'toolu_01', name: 'Read', input: {} },
      });
      await executor.execute('node', ['-e', `console.log('${toolCallLine}')`]);

      expect(executor.getToolCallCount()).toBe(1);

      executor.reset();

      expect(executor.getToolCallCount()).toBe(0);
    });
  });

  describe('getToolCallCount', () => {
    it('should track tool call count', async () => {
      vi.useRealTimers();

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        onEvent: () => {},
        options: { emitToolCalls: true },
      });

      expect(executor.getToolCallCount()).toBe(0);

      const toolCall1 = JSON.stringify({
        type: 'assistant',
        message: { type: 'tool_use', id: 'toolu_01', name: 'Read', input: {} },
      });
      const toolCall2 = JSON.stringify({
        type: 'assistant',
        message: { type: 'tool_use', id: 'toolu_02', name: 'Write', input: {} },
      });

      await executor.execute('node', [
        '-e',
        `console.log('${toolCall1}'); console.log('${toolCall2}')`,
      ]);

      expect(executor.getToolCallCount()).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should handle command not found', async () => {
      vi.useRealTimers();

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
      });

      const result = await executor.execute(
        'nonexistent_command_that_does_not_exist_12345',
        []
      );

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle invalid JSON lines gracefully', async () => {
      vi.useRealTimers();

      const events: ParsedEvent[] = [];
      const onEvent: StreamingEventCallback = (event) => events.push(event);

      const executor = new StreamingExecutor({
        workOrderId,
        runId,
        onEvent,
      });

      // Mix valid and invalid JSON
      const validLine = JSON.stringify({
        type: 'assistant',
        message: { type: 'text', text: 'Valid' },
      });

      await executor.execute('node', [
        '-e',
        `console.log('invalid json {{{'); console.log('${validLine}')`,
      ]);

      // Should still capture the valid event
      const outputEvents = events.filter(e => e.type === 'agent_output');
      expect(outputEvents.length).toBe(1);
      expect((outputEvents[0] as { content: string }).content).toBe('Valid');
    });
  });
});

describe('createStreamingExecutor', () => {
  it('should create an executor instance', () => {
    const executor = createStreamingExecutor({
      workOrderId: 'wo-123',
      runId: 'run-456',
    });

    expect(executor).toBeInstanceOf(StreamingExecutor);
  });
});
