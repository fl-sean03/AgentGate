/**
 * SDK Hooks Utilities
 *
 * Hook builders for gate integration and tool tracking.
 */

import type {
  HookCallback,
  HookCallbackMatcher,
  PreToolUseHookInput,
  PostToolUseHookInput,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * Tool use event for logging
 */
export interface ToolUseEvent {
  toolName: string;
  toolInput: unknown;
  timestamp: Date;
  phase: 'pre' | 'post';
  result?: unknown;
  error?: string;
}

/**
 * Hook event handler type
 */
export type ToolEventHandler = (event: ToolUseEvent) => void;

/**
 * Creates a tool logging hook that calls a handler for each tool use
 */
export function createToolLoggingHook(handler: ToolEventHandler): {
  preHook: HookCallback;
  postHook: HookCallback;
} {
  // eslint-disable-next-line @typescript-eslint/require-await -- SDK callback signature requires async
  const preHook: HookCallback = async (input, _toolUseId) => {
    const preInput = input as PreToolUseHookInput;
    handler({
      toolName: preInput.tool_name,
      toolInput: preInput.tool_input,
      timestamp: new Date(),
      phase: 'pre',
    });
    return {};
  };

  // eslint-disable-next-line @typescript-eslint/require-await -- SDK callback signature requires async
  const postHook: HookCallback = async (input, _toolUseId) => {
    const postInput = input as PostToolUseHookInput;
    handler({
      toolName: postInput.tool_name,
      toolInput: postInput.tool_input,
      timestamp: new Date(),
      phase: 'post',
      result: postInput.tool_response,
    });
    return {};
  };

  return { preHook, postHook };
}

/**
 * Creates a file change tracking hook
 */
export function createFileChangeHook(
  onFileChange: (filePath: string, action: 'edit' | 'write') => void
): HookCallbackMatcher {
  // eslint-disable-next-line @typescript-eslint/require-await -- SDK callback signature requires async
  const hook: HookCallback = async (input, _toolUseId) => {
    const postInput = input as PostToolUseHookInput;
    const filePath = (postInput.tool_input as { file_path?: string })?.file_path;

    if (filePath) {
      const action = postInput.tool_name === 'Edit' ? 'edit' : 'write';
      onFileChange(filePath, action);
    }

    return {};
  };

  return {
    matcher: 'Edit|Write',
    hooks: [hook],
  };
}

/**
 * Creates a blocking hook for specific patterns
 */
export function createBlockingHook(
  patterns: Array<{ tool: string; pattern: RegExp; reason: string }>
): HookCallbackMatcher {
  // eslint-disable-next-line @typescript-eslint/require-await -- SDK callback signature requires async
  const hook: HookCallback = async (input, _toolUseId) => {
    const preInput = input as PreToolUseHookInput;
    const toolName = preInput.tool_name;
    const toolInput = preInput.tool_input;

    for (const { tool, pattern, reason } of patterns) {
      if (tool === toolName || tool === '*') {
        const inputStr = JSON.stringify(toolInput);
        if (pattern.test(inputStr)) {
          return {
            hookSpecificOutput: {
              hookEventName: 'PreToolUse' as const,
              permissionDecision: 'deny' as const,
              permissionDecisionReason: reason,
            },
          };
        }
      }
    }

    return {};
  };

  // Build matcher from all unique tools
  const uniqueTools = new Set(patterns.map((p) => p.tool));
  const matcher = Array.from(uniqueTools).join('|').replace('*', '.*');

  return {
    matcher,
    hooks: [hook],
  };
}

/**
 * Default dangerous command patterns to block
 */
export const DEFAULT_BLOCKED_PATTERNS = [
  { tool: 'Bash', pattern: /rm\s+-rf\s+\//, reason: 'Destructive command: rm -rf /' },
  { tool: 'Bash', pattern: /curl.*\|\s*sh/, reason: 'Pipe to shell not allowed' },
  { tool: 'Bash', pattern: /wget.*\|\s*sh/, reason: 'Pipe to shell not allowed' },
];

/**
 * Creates the default blocking hook with common dangerous patterns
 */
export function createDefaultBlockingHook(): HookCallbackMatcher {
  return createBlockingHook(DEFAULT_BLOCKED_PATTERNS);
}

/**
 * Combines multiple hook matchers for the same event
 */
export function combineHookMatchers(
  matchers: HookCallbackMatcher[]
): HookCallbackMatcher[] {
  // Group by matcher pattern
  const grouped = new Map<string, HookCallback[]>();

  for (const matcher of matchers) {
    const key = matcher.matcher ?? '*';
    const existing = grouped.get(key) ?? [];
    existing.push(...matcher.hooks);
    grouped.set(key, existing);
  }

  // Convert back to array
  const result: HookCallbackMatcher[] = [];
  for (const [matcher, hooks] of grouped.entries()) {
    if (matcher === '*') {
      result.push({ hooks });
    } else {
      result.push({ matcher, hooks });
    }
  }
  return result;
}
