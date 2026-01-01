/**
 * Mock for Claude Agent SDK
 *
 * Provides mock implementations of SDK query() for testing.
 */

import { vi } from 'vitest';
import type { SDKMessage } from '../../src/agent/sdk-message-parser.js';

/**
 * Mock query result with default messages
 */
export interface MockQueryResult {
  systemMessage: {
    type: 'system';
    session_id: string;
    model: string;
    tools: string[];
  };
  assistantMessage: {
    type: 'assistant';
    content: string;
  };
  resultMessage: {
    type: 'result';
    usage: { input_tokens: number; output_tokens: number };
    cost: number;
    result: string;
  };
}

/**
 * Default mock query result
 */
export const DEFAULT_MOCK_RESULT: MockQueryResult = {
  systemMessage: {
    type: 'system',
    session_id: 'mock-session-123',
    model: 'claude-sonnet-4-5-20250929',
    tools: ['Read', 'Write', 'Edit', 'Bash'],
  },
  assistantMessage: {
    type: 'assistant',
    content: 'I will help you with that task.',
  },
  resultMessage: {
    type: 'result',
    usage: { input_tokens: 100, output_tokens: 50 },
    cost: 0.01,
    result: 'success',
  },
};

/**
 * Create a mock query function that yields predefined messages
 */
export function createMockQuery(messages?: SDKMessage[]) {
  return vi.fn().mockImplementation(async function* ({
    prompt: _prompt,
    options: _options,
  }: {
    prompt: string;
    options?: Record<string, unknown>;
  }) {
    if (messages) {
      for (const message of messages) {
        yield message;
      }
    } else {
      // Default message sequence
      yield DEFAULT_MOCK_RESULT.systemMessage;
      yield DEFAULT_MOCK_RESULT.assistantMessage;
      yield DEFAULT_MOCK_RESULT.resultMessage;
    }
  });
}

/**
 * Create a mock query that yields messages with tool use
 */
export function createMockQueryWithToolUse() {
  return vi.fn().mockImplementation(async function* ({
    prompt: _prompt,
    options: _options,
  }: {
    prompt: string;
    options?: Record<string, unknown>;
  }) {
    yield DEFAULT_MOCK_RESULT.systemMessage;

    // Tool use message
    yield {
      type: 'tool_use',
      tool: 'Write',
      input: { file_path: '/tmp/test.txt', content: 'hello' },
    };

    // Tool result message
    yield {
      type: 'tool_result',
      tool: 'Write',
      output: 'File written successfully',
      error: false,
    };

    yield DEFAULT_MOCK_RESULT.assistantMessage;
    yield DEFAULT_MOCK_RESULT.resultMessage;
  });
}

/**
 * Create a mock query that throws an error
 */
export function createMockQueryWithError(errorMessage: string) {
  return vi.fn().mockImplementation(async function* () {
    throw new Error(errorMessage);
  });
}

/**
 * Create a mock query that times out (never yields result)
 */
export function createMockQueryWithTimeout() {
  return vi.fn().mockImplementation(async function* () {
    yield DEFAULT_MOCK_RESULT.systemMessage;
    // Never yield result, simulating timeout
    await new Promise((resolve) => setTimeout(resolve, 10000));
  });
}

/**
 * Create a mock SDK module
 */
export function createMockSDKModule(queryFn?: ReturnType<typeof createMockQuery>) {
  return {
    query: queryFn ?? createMockQuery(),
  };
}
