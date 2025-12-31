/**
 * SDK Options Builder
 *
 * Builds Claude Agent SDK Options from AgentRequest.
 */

import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { AgentRequest } from '../types/index.js';
import { buildGatePlanSystemPrompt, buildFeedbackSystemPrompt } from './defaults.js';

/**
 * Build SDK Options from AgentRequest
 */
export function buildSDKOptions(request: AgentRequest): Options {
  const { constraints } = request;

  // Build system prompt additions
  const promptParts: string[] = [];

  // Add gate plan if provided
  if (request.gatePlanSummary) {
    const gatePlanPrompt = buildGatePlanSystemPrompt(request.gatePlanSummary);
    if (gatePlanPrompt) {
      promptParts.push(gatePlanPrompt);
    }
  }

  // Add prior feedback if provided
  if (request.priorFeedback) {
    const feedbackPrompt = buildFeedbackSystemPrompt(request.priorFeedback);
    if (feedbackPrompt) {
      promptParts.push(feedbackPrompt);
    }
  }

  // Add additional system prompt from constraints
  if (constraints.additionalSystemPrompt) {
    promptParts.push(constraints.additionalSystemPrompt);
  }

  // Build the options object
  const options: Options = {
    cwd: request.workspacePath,
    maxTurns: constraints.maxTurns,
    allowedTools: constraints.allowedTools,
    disallowedTools: constraints.disallowedTools,
  };

  // Handle permission mode
  if (constraints.permissionMode === 'bypassPermissions') {
    options.permissionMode = 'bypassPermissions';
    options.allowDangerouslySkipPermissions = true;
  } else if (constraints.permissionMode === 'acceptEdits') {
    options.permissionMode = 'acceptEdits';
  } else if (constraints.permissionMode === 'plan') {
    options.permissionMode = 'plan';
  }

  // Handle system prompt
  if (promptParts.length > 0) {
    options.systemPrompt = {
      type: 'preset',
      preset: 'claude_code',
      append: promptParts.join('\n\n'),
    };
  } else {
    // Use Claude Code's default system prompt
    options.systemPrompt = {
      type: 'preset',
      preset: 'claude_code',
    };
  }

  // Load project settings to respect CLAUDE.md files
  options.settingSources = ['project'];

  // Handle session resume
  if (request.sessionId) {
    options.resume = request.sessionId;
  }

  return options;
}

/**
 * Create an AbortController with timeout
 */
export function createTimeoutController(timeoutMs: number): AbortController {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  // Store timeout ID for cleanup
  (controller as AbortController & { timeoutId: NodeJS.Timeout }).timeoutId = timeoutId;

  return controller;
}

/**
 * Clear timeout from controller
 */
export function clearControllerTimeout(controller: AbortController): void {
  const extendedController = controller as AbortController & { timeoutId?: NodeJS.Timeout };
  if (extendedController.timeoutId) {
    clearTimeout(extendedController.timeoutId);
  }
}
