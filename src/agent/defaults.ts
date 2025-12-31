import type {
  AgentConstraints,
  AgentRequest,
  ContextPointers,
  DriverCapabilities,
} from '../types/index.js';
import { DEFAULT_ALLOWED_TOOLS, DEFAULT_DISALLOWED_TOOLS } from './constraints.js';

/**
 * Default timeout for agent execution (5 minutes)
 */
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Maximum timeout allowed (30 minutes)
 */
export const MAX_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Default max turns for agent execution
 * Set high to allow complex implementation tasks
 */
export const DEFAULT_MAX_TURNS = 100;

/**
 * Maximum max turns allowed
 */
export const MAX_TURNS_LIMIT = 100;

/**
 * Default constraints for agent execution.
 * Uses bypassPermissions for headless/automated execution.
 */
export const DEFAULT_AGENT_CONSTRAINTS: AgentConstraints = {
  allowedTools: [...DEFAULT_ALLOWED_TOOLS],
  disallowedTools: [...DEFAULT_DISALLOWED_TOOLS],
  maxTurns: DEFAULT_MAX_TURNS,
  permissionMode: 'bypassPermissions', // Required for headless execution
  additionalSystemPrompt: null,
};

/**
 * Empty context pointers
 */
export const EMPTY_CONTEXT_POINTERS: ContextPointers = {
  manifestPath: null,
  testsPath: null,
  docsPath: null,
  gatePlanPath: null,
  srcPath: null,
};

/**
 * Default driver capabilities for Claude Code
 */
export const CLAUDE_CODE_CAPABILITIES: DriverCapabilities = {
  supportsSessionResume: true,
  supportsStructuredOutput: true,
  supportsToolRestriction: true,
  supportsTimeout: true,
  maxTurns: MAX_TURNS_LIMIT,
};

/**
 * Creates a default AgentRequest with required fields
 */
export function createDefaultRequest(
  workspacePath: string,
  taskPrompt: string
): AgentRequest {
  return {
    workspacePath,
    taskPrompt,
    gatePlanSummary: '',
    constraints: { ...DEFAULT_AGENT_CONSTRAINTS },
    priorFeedback: null,
    contextPointers: { ...EMPTY_CONTEXT_POINTERS },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    sessionId: null,
  };
}

/**
 * Builds a system prompt suffix for gate plan enforcement
 */
export function buildGatePlanSystemPrompt(gatePlanSummary: string): string {
  if (!gatePlanSummary.trim()) {
    return '';
  }

  return `
## Gate Plan Requirements

You must ensure your changes satisfy the following verification requirements:

${gatePlanSummary}

Before completing, verify that:
1. All changes follow the specified patterns and conventions
2. Required tests are present and passing
3. No disallowed patterns are introduced
`.trim();
}

/**
 * Builds a feedback system prompt for iteration
 */
export function buildFeedbackSystemPrompt(feedback: string): string {
  if (!feedback.trim()) {
    return '';
  }

  return `
## Prior Feedback

Your previous attempt had the following issues that must be addressed:

${feedback}

Focus on fixing these issues before proceeding with other changes.
`.trim();
}
