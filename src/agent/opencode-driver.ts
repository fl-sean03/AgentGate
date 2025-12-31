/**
 * OpenCode SDK Driver
 *
 * Agent driver implementation using the SST OpenCode SDK.
 * OpenCode is an open source AI coding agent that supports multiple LLM providers.
 *
 * @see https://opencode.ai/docs/sdk/
 */

import { createOpencode, type OpencodeClient } from '@opencode-ai/sdk';
import type {
  AgentDriver,
  AgentRequest,
  AgentResult,
  DriverCapabilities,
} from '../types/index.js';
import { createLogger } from '../utils/index.js';
import { DEFAULT_TIMEOUT_MS } from './defaults.js';

const logger = createLogger('agent:opencode-driver');

/**
 * OpenCode driver configuration
 */
export interface OpenCodeDriverConfig {
  /** Default timeout in ms (default: 5 minutes) */
  defaultTimeoutMs?: number;
  /** Enable debug logging */
  debugMode?: boolean;
  /** Server hostname (default: 127.0.0.1) */
  hostname?: string;
  /** Server port (default: 4096) */
  port?: number;
}

/**
 * Extended agent result with OpenCode-specific data
 */
export interface OpenCodeResult extends AgentResult {
  /** Session ID for potential resume */
  openCodeSessionId?: string;
  /** Number of messages in the session */
  messageCount?: number;
}

/**
 * OpenCode driver capabilities
 */
const OPENCODE_CAPABILITIES: DriverCapabilities = {
  supportsSessionResume: true,
  supportsStructuredOutput: false,
  supportsToolRestriction: false, // OpenCode manages its own tools
  supportsTimeout: true,
  maxTurns: 50,
};

/**
 * OpenCode SDK driver implementation
 *
 * This driver starts a local OpenCode server and interacts with it via the SDK.
 * OpenCode is provider-agnostic and can use Claude, OpenAI, Google, or local models.
 */
export class OpenCodeDriver implements AgentDriver {
  readonly name = 'opencode';
  readonly version = '1.0.0';

  private readonly config: Required<OpenCodeDriverConfig>;
  private client: OpencodeClient | null = null;
  private server: { url: string; close(): void } | null = null;

  constructor(config: OpenCodeDriverConfig = {}) {
    this.config = {
      defaultTimeoutMs: config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      debugMode: config.debugMode ?? false,
      hostname: config.hostname ?? '127.0.0.1',
      port: config.port ?? 4096,
    };
  }

  /**
   * Checks if OpenCode is available
   *
   * OpenCode requires either:
   * - The `opencode` CLI to be installed, OR
   * - An existing OpenCode server running
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try to import the SDK - if it fails, SDK isn't available
      const sdk = await import('@opencode-ai/sdk');
      if (!sdk.createOpencode) {
        logger.debug('OpenCode SDK createOpencode not found');
        return false;
      }
      logger.debug('OpenCode SDK availability check: succeeded');
      return true;
    } catch (error) {
      logger.debug({ error }, 'OpenCode SDK not available');
      return false;
    }
  }

  /**
   * Returns the capabilities of this driver
   */
  getCapabilities(): DriverCapabilities {
    return { ...OPENCODE_CAPABILITIES };
  }

  /**
   * Executes an agent request using OpenCode
   */
  async execute(request: AgentRequest): Promise<OpenCodeResult> {
    const startTime = Date.now();
    const timeout = request.timeoutMs || this.config.defaultTimeoutMs;

    logger.info(
      {
        workspace: request.workspacePath,
        maxTurns: request.constraints.maxTurns,
        hasSession: !!request.sessionId,
        timeout,
      },
      'Executing OpenCode agent request'
    );

    try {
      // Initialize OpenCode server and client if not already done
      if (!this.client || !this.server) {
        logger.debug('Starting OpenCode server...');
        const { client, server } = await createOpencode({
          hostname: this.config.hostname,
          port: this.config.port,
        });
        this.client = client;
        this.server = server;
        logger.debug({ url: server.url }, 'OpenCode server started');

        // Configure authentication based on OPENCODE_PROVIDER
        // Note: OpenCode has internal model routing bugs with OpenAI (tries to use gpt-5-nano)
        // Anthropic works correctly with OpenCode's internal agents
        const provider = process.env.OPENCODE_PROVIDER || 'anthropic';
        if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
          logger.debug('Setting up Anthropic authentication for OpenCode');
          await this.client.auth.set({
            path: { id: 'anthropic' },
            body: { type: 'api', key: process.env.ANTHROPIC_API_KEY },
          });
        } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
          logger.debug('Setting up OpenAI authentication for OpenCode');
          await this.client.auth.set({
            path: { id: 'openai' },
            body: { type: 'api', key: process.env.OPENAI_API_KEY },
          });
        } else if (process.env.ANTHROPIC_API_KEY) {
          // Fallback to Anthropic (more reliable with OpenCode)
          logger.debug('Falling back to Anthropic authentication');
          await this.client.auth.set({
            path: { id: 'anthropic' },
            body: { type: 'api', key: process.env.ANTHROPIC_API_KEY },
          });
        }
      }

      // Create a new session
      logger.debug({ workspacePath: request.workspacePath }, 'Creating OpenCode session');

      const sessionResponse = await this.client.session.create({
        query: {
          directory: request.workspacePath,
        },
      });

      if (!sessionResponse.data) {
        throw new Error('Failed to create OpenCode session: no data returned');
      }

      const sessionId = sessionResponse.data.id;
      logger.debug({ sessionId }, 'OpenCode session created');

      // Initialize the session (analyze the project)
      try {
        logger.debug('Initializing session with project analysis...');
        await this.client.session.init({
          path: { id: sessionId },
        });
        logger.debug('Session initialized');
      } catch (initError) {
        logger.debug({ error: initError }, 'Session init failed (may not be required)');
      }

      // Build the prompt
      const prompt = this.buildPrompt(request);

      logger.debug(
        {
          promptLength: prompt.length,
          hasGatePlan: !!request.gatePlanSummary,
          hasFeedback: !!request.priorFeedback,
        },
        'OpenCode prompt built'
      );

      // Determine the model to use from OPENCODE_* env vars, falling back to provider defaults
      const providerID = process.env.OPENCODE_PROVIDER || 'openai';
      let modelID: string;
      if (process.env.OPENCODE_MODEL) {
        modelID = process.env.OPENCODE_MODEL;
      } else if (providerID === 'openai') {
        modelID = process.env.OPENAI_API_MODEL || 'gpt-4o';
      } else {
        modelID = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
      }
      const model = { providerID, modelID };

      logger.debug({ model }, 'Using model for OpenCode');

      // Send the prompt to the session
      const promptResponse = await this.client.session.prompt({
        path: { id: sessionId },
        query: { directory: request.workspacePath },
        body: {
          model,
          parts: [{ type: 'text' as const, text: prompt }],
        },
      });

      logger.debug(
        {
          hasData: !!promptResponse.data,
          response: promptResponse.data ? JSON.stringify(promptResponse.data).slice(0, 500) : null,
          error: promptResponse.error ? JSON.stringify(promptResponse.error) : null,
        },
        'OpenCode prompt response'
      );

      if (!promptResponse.data) {
        const errorMsg = promptResponse.error
          ? JSON.stringify(promptResponse.error)
          : 'no response data';
        throw new Error(`Failed to send prompt to OpenCode: ${errorMsg}`);
      }

      // Wait for the response (polling for completion)
      // NOTE: session.status() is unreliable - it returns {} when idle instead of { type: "idle" }
      // Workaround: Check if last message is from assistant and has completion timestamp
      // See: https://github.com/sst/opencode/issues/3815
      let finalResponse = '';
      let messageCount = 0;
      const pollStartTime = Date.now();
      let pollCount = 0;

      while (Date.now() - pollStartTime < timeout) {
        pollCount++;

        // Check messages to determine completion (workaround for status API bug)
        const messagesCheck = await this.client.session.messages({
          path: { id: sessionId },
          query: { directory: request.workspacePath },
        });

        const messages = messagesCheck.data || [];
        const lastMessage = messages[messages.length - 1];

        // Session is complete if:
        // 1. Last message is from assistant
        // 2. Last message has a completion timestamp (info.time.completed)
        const isComplete =
          lastMessage?.info?.role === 'assistant' &&
          lastMessage?.info?.time?.completed != null;

        // Log status every 5 polls
        if (pollCount % 5 === 1) {
          logger.debug(
            {
              pollCount,
              elapsed: Date.now() - pollStartTime,
              messageCount: messages.length,
              lastRole: lastMessage?.info?.role,
              hasCompleted: lastMessage?.info?.time?.completed != null,
              isComplete,
            },
            'Polling session completion'
          );
        }

        if (isComplete) {
          logger.debug({ pollCount }, 'Session complete (assistant message with completion timestamp)');
          break;
        }

        // Wait a bit before polling again
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      logger.debug({ pollCount, totalTime: Date.now() - pollStartTime }, 'Polling completed');

      // Get all messages from the session
      const messagesResponse = await this.client.session.messages({
        path: { id: sessionId },
        query: { directory: request.workspacePath },
      });

      if (messagesResponse.data) {
        const messages = messagesResponse.data;
        messageCount = messages.length;

        // Extract the assistant's response (last assistant message)
        // Messages have { info: Message, parts: Part[] } structure
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (msg && msg.info.role === 'assistant' && msg.parts) {
            // Collect text parts from the message
            const textParts = msg.parts
              .filter((part) => part.type === 'text')
              .map((part) => (part as { type: 'text'; text: string }).text);
            if (textParts.length > 0) {
              finalResponse = textParts.join('\n');
              break;
            }
          }
        }
      }

      const durationMs = Date.now() - startTime;

      // Build result
      const result: OpenCodeResult = {
        success: !!finalResponse,
        exitCode: finalResponse ? 0 : 1,
        stdout: finalResponse,
        stderr: '',
        structuredOutput: finalResponse ? { result: finalResponse } : null,
        sessionId: sessionId,
        tokensUsed: null, // OpenCode SDK doesn't expose token counts directly
        durationMs,
        openCodeSessionId: sessionId,
        messageCount,
      };

      logger.info(
        {
          success: result.success,
          sessionId: result.openCodeSessionId,
          durationMs,
          messageCount,
        },
        'OpenCode execution completed'
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'OpenCode execution failed');

      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: errorMessage,
        structuredOutput: null,
        sessionId: null,
        tokensUsed: null,
        durationMs,
      };
    }
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

  /**
   * Cleanup method to close the server
   */
  async dispose(): Promise<void> {
    if (this.server) {
      logger.debug('Closing OpenCode server');
      this.server.close();
      this.server = null;
      this.client = null;
    }
  }
}

/**
 * Creates a new OpenCode driver instance
 */
export function createOpenCodeDriver(config?: OpenCodeDriverConfig): OpenCodeDriver {
  return new OpenCodeDriver(config);
}
