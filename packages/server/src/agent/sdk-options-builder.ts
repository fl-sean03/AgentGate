/**
 * SDK Options Builder
 *
 * Utilities for building Claude Agent SDK options from AgentRequest.
 */

import type { AgentRequest } from '../types/index.js';
import { buildSystemPromptAppend } from './command-builder.js';

// ============================================================================
// SDK Options Types
// ============================================================================

/**
 * Pre/Post tool use hook result
 */
export interface HookResult {
  allow: boolean;
  reason?: string;
}

/**
 * Filter for which tools a hook applies to
 */
export interface HookFilter {
  tools?: string[];
}

/**
 * Pre-tool use hook
 */
export interface PreToolUseHook {
  filter?: HookFilter;
  callback: (
    tool: string,
    input: Record<string, unknown>
  ) => Promise<HookResult>;
}

/**
 * Post-tool use hook
 */
export interface PostToolUseHook {
  filter?: HookFilter;
  callback: (
    tool: string,
    input: Record<string, unknown>,
    output: string
  ) => Promise<void>;
}

/**
 * Hooks configuration for SDK
 */
export interface SDKHooksConfig {
  logToolUse?: boolean;
  trackFileChanges?: boolean;
  blockedPatterns?: RegExp[];
  preToolValidators?: Array<
    (tool: string, input: Record<string, unknown>) => Promise<HookResult>
  >;
  postToolHandlers?: Array<
    (tool: string, input: Record<string, unknown>, output: string) => Promise<void>
  >;
}

/**
 * SDK hooks configuration for query()
 */
export interface HooksConfig {
  PreToolUse?: PreToolUseHook[];
  PostToolUse?: PostToolUseHook[];
}

/**
 * SDK query options
 */
export interface SDKQueryOptions {
  maxTurns?: number;
  resume?: string;
  systemPrompt?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  hooks?: HooksConfig;
  dangerouslySkipPermissions?: boolean;
}

// ============================================================================
// SDK Driver Configuration
// ============================================================================

/**
 * Configuration for ClaudeAgentSDKDriver
 */
export interface ClaudeAgentSDKDriverConfig {
  /** Query timeout in ms (default: 300000 = 5 minutes) */
  timeoutMs?: number;
  /** Enable SDK built-in sandboxing (default: true) */
  enableSandbox?: boolean;
  /** Hooks configuration */
  hooks?: SDKHooksConfig;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Maximum turns (default: 100) */
  maxTurns?: number;
}

// ============================================================================
// Options Builder
// ============================================================================

/**
 * Build SDK query options from AgentRequest
 */
export function buildSDKOptions(
  request: AgentRequest,
  config: ClaudeAgentSDKDriverConfig,
  hooksConfig?: HooksConfig
): SDKQueryOptions {
  const options: SDKQueryOptions = {};

  // Max turns - from request constraints or config
  const maxTurns = request.constraints?.maxTurns ?? config.maxTurns ?? 100;
  if (maxTurns) {
    options.maxTurns = maxTurns;
  }

  // Session resume
  if (request.sessionId) {
    options.resume = request.sessionId;
  }

  // System prompt (gate plan, engineering standards, feedback)
  const systemPrompt = buildSystemPromptAppend(request);
  if (systemPrompt) {
    options.systemPrompt = systemPrompt;
  }

  // Tool restrictions
  if (request.constraints?.allowedTools && request.constraints.allowedTools.length > 0) {
    options.allowedTools = request.constraints.allowedTools;
  }
  if (request.constraints?.disallowedTools && request.constraints.disallowedTools.length > 0) {
    options.disallowedTools = request.constraints.disallowedTools;
  }

  // Permission mode
  if (request.constraints?.permissionMode === 'bypassPermissions') {
    options.dangerouslySkipPermissions = true;
  }

  // Hooks
  if (hooksConfig) {
    options.hooks = hooksConfig;
  }

  return options;
}

/**
 * Get required config with defaults applied
 */
export function getRequiredConfig(
  config: ClaudeAgentSDKDriverConfig = {}
): Required<ClaudeAgentSDKDriverConfig> {
  return {
    timeoutMs: config.timeoutMs ?? 300000,
    enableSandbox: config.enableSandbox ?? true,
    hooks: config.hooks ?? {},
    env: config.env ?? {},
    maxTurns: config.maxTurns ?? 100,
  };
}
