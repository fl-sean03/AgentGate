/**
 * Unit tests for SDK Message Parser
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MessageCollector,
  buildAgentResult,
  buildSDKStructuredOutput,
  isSystemMessage,
  isAssistantMessage,
  isToolUseMessage,
  isToolResultMessage,
  isResultMessage,
  type SDKMessage,
  type SDKSystemMessage,
  type SDKAssistantMessage,
  type SDKToolUseMessage,
  type SDKToolResultMessage,
  type SDKResultMessage,
} from '../src/agent/sdk-message-parser.js';

describe('SDK Message Parser', () => {
  describe('Type Guards', () => {
    it('should identify system message', () => {
      const msg: SDKSystemMessage = {
        type: 'system',
        session_id: 'test-123',
        model: 'claude-sonnet-4-5',
        tools: ['Read', 'Write'],
      };

      expect(isSystemMessage(msg)).toBe(true);
      expect(isAssistantMessage(msg)).toBe(false);
      expect(isToolUseMessage(msg)).toBe(false);
      expect(isToolResultMessage(msg)).toBe(false);
      expect(isResultMessage(msg)).toBe(false);
    });

    it('should identify assistant message', () => {
      const msg: SDKAssistantMessage = {
        type: 'assistant',
        content: 'Hello, I will help you.',
      };

      expect(isSystemMessage(msg)).toBe(false);
      expect(isAssistantMessage(msg)).toBe(true);
      expect(isToolUseMessage(msg)).toBe(false);
      expect(isToolResultMessage(msg)).toBe(false);
      expect(isResultMessage(msg)).toBe(false);
    });

    it('should identify tool use message', () => {
      const msg: SDKToolUseMessage = {
        type: 'tool_use',
        tool: 'Write',
        input: { file_path: '/tmp/test.txt', content: 'hello' },
      };

      expect(isSystemMessage(msg)).toBe(false);
      expect(isAssistantMessage(msg)).toBe(false);
      expect(isToolUseMessage(msg)).toBe(true);
      expect(isToolResultMessage(msg)).toBe(false);
      expect(isResultMessage(msg)).toBe(false);
    });

    it('should identify tool result message', () => {
      const msg: SDKToolResultMessage = {
        type: 'tool_result',
        tool: 'Write',
        output: 'File written successfully',
      };

      expect(isSystemMessage(msg)).toBe(false);
      expect(isAssistantMessage(msg)).toBe(false);
      expect(isToolUseMessage(msg)).toBe(false);
      expect(isToolResultMessage(msg)).toBe(true);
      expect(isResultMessage(msg)).toBe(false);
    });

    it('should identify result message', () => {
      const msg: SDKResultMessage = {
        type: 'result',
        usage: { input_tokens: 100, output_tokens: 50 },
        cost: 0.01,
        result: 'success',
      };

      expect(isSystemMessage(msg)).toBe(false);
      expect(isAssistantMessage(msg)).toBe(false);
      expect(isToolUseMessage(msg)).toBe(false);
      expect(isToolResultMessage(msg)).toBe(false);
      expect(isResultMessage(msg)).toBe(true);
    });
  });

  describe('MessageCollector', () => {
    let collector: MessageCollector;

    beforeEach(() => {
      collector = new MessageCollector();
    });

    it('should track all messages', () => {
      const systemMsg: SDKSystemMessage = {
        type: 'system',
        session_id: 'test-123',
        model: 'claude-sonnet-4-5',
      };
      const assistantMsg: SDKAssistantMessage = {
        type: 'assistant',
        content: 'Hello',
      };

      collector.add(systemMsg);
      collector.add(assistantMsg);

      expect(collector.getAllMessages()).toHaveLength(2);
    });

    it('should extract session ID from system message', () => {
      const systemMsg: SDKSystemMessage = {
        type: 'system',
        session_id: 'session-abc',
        model: 'claude-sonnet-4-5',
      };

      expect(collector.getSessionId()).toBeNull();
      collector.add(systemMsg);
      expect(collector.getSessionId()).toBe('session-abc');
    });

    it('should extract model from system message', () => {
      const systemMsg: SDKSystemMessage = {
        type: 'system',
        session_id: 'test',
        model: 'claude-opus-4-5',
      };

      expect(collector.getModel()).toBeNull();
      collector.add(systemMsg);
      expect(collector.getModel()).toBe('claude-opus-4-5');
    });

    it('should extract cost from result message', () => {
      const resultMsg: SDKResultMessage = {
        type: 'result',
        cost: 0.0245,
      };

      expect(collector.getCost()).toBeNull();
      collector.add(resultMsg);
      expect(collector.getCost()).toBe(0.0245);
    });

    it('should extract usage from result message', () => {
      const resultMsg: SDKResultMessage = {
        type: 'result',
        usage: { input_tokens: 1000, output_tokens: 500 },
      };

      expect(collector.getUsage()).toBeNull();
      collector.add(resultMsg);
      expect(collector.getUsage()).toEqual({
        input: 1000,
        output: 500,
      });
    });

    it('should count assistant turns', () => {
      const systemMsg: SDKSystemMessage = {
        type: 'system',
        session_id: 'test',
        model: 'test',
      };
      const assistantMsg1: SDKAssistantMessage = {
        type: 'assistant',
        content: 'First response',
      };
      const assistantMsg2: SDKAssistantMessage = {
        type: 'assistant',
        content: 'Second response',
      };

      collector.add(systemMsg);
      collector.add(assistantMsg1);
      collector.add(assistantMsg2);

      expect(collector.getTurnCount()).toBe(2);
    });

    it('should record tool calls with duration', async () => {
      const toolUseMsg: SDKToolUseMessage = {
        type: 'tool_use',
        tool: 'Write',
        input: { file_path: '/tmp/test.txt', content: 'hello' },
      };
      const toolResultMsg: SDKToolResultMessage = {
        type: 'tool_result',
        tool: 'Write',
        output: 'Success',
      };

      collector.add(toolUseMsg);
      // Small delay to ensure duration is non-zero
      await new Promise((resolve) => setTimeout(resolve, 10));
      collector.add(toolResultMsg);

      const toolCalls = collector.getToolCalls();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].tool).toBe('Write');
      expect(toolCalls[0].input).toEqual({
        file_path: '/tmp/test.txt',
        content: 'hello',
      });
      expect(toolCalls[0].output).toBe('Success');
      expect(toolCalls[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track tool errors', () => {
      const toolUseMsg: SDKToolUseMessage = {
        type: 'tool_use',
        tool: 'Bash',
        input: { command: 'exit 1' },
      };
      const toolResultMsg: SDKToolResultMessage = {
        type: 'tool_result',
        tool: 'Bash',
        output: 'Command failed',
        error: true,
      };

      collector.add(toolUseMsg);
      collector.add(toolResultMsg);

      expect(collector.hasToolErrors()).toBe(true);
      expect(collector.getToolCalls()[0].error).toBe(true);
    });

    it('should reset correctly', () => {
      const systemMsg: SDKSystemMessage = {
        type: 'system',
        session_id: 'test',
        model: 'test',
      };

      collector.add(systemMsg);
      expect(collector.getAllMessages()).toHaveLength(1);

      collector.reset();
      expect(collector.getAllMessages()).toHaveLength(0);
      expect(collector.getSessionId()).toBeNull();
    });

    it('should get result text', () => {
      const resultMsg: SDKResultMessage = {
        type: 'result',
        result: 'Task completed successfully',
      };

      expect(collector.getResultText()).toBeNull();
      collector.add(resultMsg);
      expect(collector.getResultText()).toBe('Task completed successfully');
    });

    it('should calculate total tool duration', () => {
      const toolUseMsg1: SDKToolUseMessage = {
        type: 'tool_use',
        tool: 'Read',
        input: { file_path: '/tmp/test.txt' },
      };
      const toolResultMsg1: SDKToolResultMessage = {
        type: 'tool_result',
        tool: 'Read',
        output: 'content',
      };

      collector.add(toolUseMsg1);
      collector.add(toolResultMsg1);

      expect(collector.getTotalToolDuration()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('buildSDKStructuredOutput', () => {
    it('should build structured output from collector', () => {
      const collector = new MessageCollector();

      const systemMsg: SDKSystemMessage = {
        type: 'system',
        session_id: 'session-xyz',
        model: 'claude-sonnet-4-5',
      };
      const assistantMsg: SDKAssistantMessage = {
        type: 'assistant',
        content: 'Hello',
      };
      const resultMsg: SDKResultMessage = {
        type: 'result',
        usage: { input_tokens: 100, output_tokens: 50 },
        cost: 0.01,
        result: 'completed',
      };

      collector.add(systemMsg);
      collector.add(assistantMsg);
      collector.add(resultMsg);

      const output = buildSDKStructuredOutput(collector);

      expect(output.sessionId).toBe('session-xyz');
      expect(output.model).toBe('claude-sonnet-4-5');
      expect(output.totalCostUsd).toBe(0.01);
      expect(output.turns).toBe(1);
      expect(output.result).toBe('completed');
      expect(output.messages).toHaveLength(3);
    });
  });

  describe('buildAgentResult', () => {
    it('should build success result', () => {
      const collector = new MessageCollector();

      const systemMsg: SDKSystemMessage = {
        type: 'system',
        session_id: 'session-123',
        model: 'claude-sonnet-4-5',
      };
      const resultMsg: SDKResultMessage = {
        type: 'result',
        usage: { input_tokens: 100, output_tokens: 50 },
        cost: 0.01,
        result: 'success',
      };

      collector.add(systemMsg);
      collector.add(resultMsg);

      const result = buildAgentResult(collector, true, 5000);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.sessionId).toBe('session-123');
      expect(result.tokensUsed).toEqual({ input: 100, output: 50 });
      expect(result.durationMs).toBe(5000);
      expect(result.stderr).toBe('');
      expect(result.structuredOutput).toBeDefined();
    });

    it('should build failure result with error', () => {
      const collector = new MessageCollector();

      const result = buildAgentResult(collector, false, 1000, 'Task failed');

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('Task failed');
      expect(result.structuredOutput?.result).toBe('failed');
    });

    it('should handle empty collector', () => {
      const collector = new MessageCollector();

      const result = buildAgentResult(collector, true, 100);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeNull();
      expect(result.tokensUsed).toBeNull();
      expect(result.structuredOutput?.result).toBe('completed');
    });
  });
});
