/**
 * OpenAI Codex SDK Driver
 *
 * Agent driver implementation using the OpenAI Codex SDK.
 * Codex is OpenAI's coding agent that can read, change, and run code.
 */

import { Codex, type ThreadEvent, type RunResult, type Usage } from '@openai/codex-sdk';
import type {
  AgentDriver,
  AgentRequest,
  AgentResult,
  DriverCapabilities,
} from '../types/index.js';
import { createLogger } from '../utils/index.js';
import { DEFAULT_TIMEOUT_MS } from './defaults.js';

const logger = createLogger('agent:codex-driver');

/**
 * OpenAI Codex driver configuration
 */
export interface OpenAICodexDriverConfig {
  /** Default timeout in ms (default: 5 minutes) */
  defaultTimeoutMs?: number;
  /** Enable debug logging of events */
  debugEvents?: boolean;
  /** Skip git repo check (default: true for workspace isolation) */
  skipGitRepoCheck?: boolean;
}

/**
 * Extended agent result with Codex-specific data
 */
export interface CodexAgentResult extends AgentResult {
  /** Thread ID for session resumption */
  threadId?: string;
  /** Number of items in the turn */
  itemCount?: number;
}

/**
 * Codex driver capabilities
 */
const CODEX_CAPABILITIES: DriverCapabilities = {
  supportsSessionResume: true,
  supportsStructuredOutput: true,
  supportsToolRestriction: false, // Codex manages its own tools
  supportsTimeout: true,
  maxTurns: 100,
};

/**
 * OpenAI Codex SDK driver implementation
 */
export class OpenAICodexDriver implements AgentDriver {
  readonly name = 'openai-codex';
  readonly version = '1.0.0';

  private readonly config: Required<OpenAICodexDriverConfig>;
  private codex: Codex | null = null;

  constructor(config: OpenAICodexDriverConfig = {}) {
    this.config = {
      defaultTimeoutMs: config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      debugEvents: config.debugEvents ?? false,
      skipGitRepoCheck: config.skipGitRepoCheck ?? true,
    };
  }

  /**
   * Checks if the Codex SDK is available
   */
  async isAvailable(): Promise<boolean> {
    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      logger.debug('OPENAI_API_KEY not set, Codex driver not available');
      return false;
    }

    try {
      // Try to instantiate Codex to verify SDK is available
      if (!this.codex) {
        this.codex = new Codex();
      }
      logger.debug('Codex SDK availability check: succeeded');
      return true;
    } catch (error) {
      logger.debug({ error }, 'Codex SDK not available');
      return false;
    }
  }

  /**
   * Returns the capabilities of this driver
   */
  getCapabilities(): DriverCapabilities {
    return { ...CODEX_CAPABILITIES };
  }

  /**
   * Executes an agent request using the Codex SDK
   */
  async execute(request: AgentRequest): Promise<CodexAgentResult> {
    const startTime = Date.now();
    const timeout = request.timeoutMs || this.config.defaultTimeoutMs;

    logger.info(
      {
        workspace: request.workspacePath,
        maxTurns: request.constraints.maxTurns,
        hasSession: !!request.sessionId,
        timeout,
      },
      'Executing Codex agent request'
    );

    // Ensure Codex is initialized
    if (!this.codex) {
      this.codex = new Codex();
    }

    // Start or resume thread
    let thread;
    let threadId: string | undefined;

    try {
      if (request.sessionId) {
        // Resume existing thread
        logger.debug({ sessionId: request.sessionId }, 'Resuming Codex thread');
        thread = this.codex.resumeThread(request.sessionId);
        threadId = request.sessionId;
      } else {
        // Start new thread with workspace as working directory
        logger.debug({ workspacePath: request.workspacePath }, 'Starting new Codex thread');
        thread = this.codex.startThread({
          workingDirectory: request.workspacePath,
          skipGitRepoCheck: this.config.skipGitRepoCheck,
          sandboxMode: 'workspace-write', // Allow writing files in workspace
        });
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Failed to create Codex thread');

      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: `Failed to create Codex thread: ${errorMessage}`,
        structuredOutput: null,
        sessionId: null,
        tokensUsed: null,
        durationMs,
      };
    }

    // Build the prompt with context
    const prompt = this.buildPrompt(request);

    logger.debug(
      {
        promptLength: prompt.length,
        hasGatePlan: !!request.gatePlanSummary,
        hasFeedback: !!request.priorFeedback,
      },
      'Codex prompt built'
    );

    // Execute with streaming to capture events
    let finalResponse = '';
    let itemCount = 0;
    let lastError: Error | null = null;

    try {
      if (this.config.debugEvents) {
        // Use streaming to capture events for debugging
        const { events } = await thread.runStreamed(prompt);
        const responseItems: string[] = [];

        for await (const event of events) {
          if (this.config.debugEvents) {
            logger.debug({ eventType: event.type }, 'Codex event received');
          }

          if (event.type === 'item.completed') {
            itemCount++;
            // Extract agent messages as the final response
            if (event.item.type === 'agent_message') {
              responseItems.push(event.item.text);
            }
          } else if (event.type === 'turn.completed') {
            // Extract usage info if available
            logger.debug({ usage: event.usage }, 'Turn completed');
          }
        }

        // Combine all agent messages as the final response
        finalResponse = responseItems.join('\n');
      } else {
        // Simple run without streaming
        const turn: RunResult = await thread.run(prompt);
        finalResponse = turn.finalResponse;
        itemCount = turn.items?.length ?? 0;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.error({ error: lastError.message }, 'Codex execution failed');
    }

    const durationMs = Date.now() - startTime;

    // Build result
    const result: CodexAgentResult = {
      success: !lastError && !!finalResponse,
      exitCode: lastError ? 1 : 0,
      stdout: finalResponse,
      stderr: lastError?.message ?? '',
      structuredOutput: finalResponse ? { result: finalResponse } : null,
      sessionId: threadId ?? null,
      tokensUsed: null, // Codex SDK doesn't expose token counts directly
      durationMs,
    };

    // Add optional properties
    if (threadId) {
      result.threadId = threadId;
    }
    if (itemCount > 0) {
      result.itemCount = itemCount;
    }

    logger.info(
      {
        success: result.success,
        threadId: result.threadId,
        durationMs,
        itemCount,
      },
      'Codex execution completed'
    );

    return result;
  }

  /**
   * Builds the full prompt with context
   */
  private buildPrompt(request: AgentRequest): string {
    const parts: string[] = [];

    // Add gate plan context if present
    if (request.gatePlanSummary) {
      parts.push(`## Requirements\n\n${request.gatePlanSummary}\n`);
    }

    // Add prior feedback if present
    if (request.priorFeedback) {
      parts.push(`## Prior Feedback\n\nPlease address these issues:\n${request.priorFeedback}\n`);
    }

    // Add additional system prompt if present
    if (request.constraints.additionalSystemPrompt) {
      parts.push(`## Guidelines\n\n${request.constraints.additionalSystemPrompt}\n`);
    }

    // Add the main task
    parts.push(`## Task\n\n${request.taskPrompt}`);

    return parts.join('\n');
  }
}

/**
 * Creates a new OpenAI Codex driver instance
 */
export function createOpenAICodexDriver(
  config?: OpenAICodexDriverConfig
): OpenAICodexDriver {
  return new OpenAICodexDriver(config);
}
