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

      // Send the prompt to the session
      const promptResponse = await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text' as const, text: prompt }],
        },
      });

      if (!promptResponse.data) {
        throw new Error('Failed to send prompt to OpenCode: no response');
      }

      // Wait for the response (polling for completion)
      let finalResponse = '';
      let messageCount = 0;
      const pollStartTime = Date.now();

      while (Date.now() - pollStartTime < timeout) {
        // Get session status - returns a map of session statuses
        const statusResponse = await this.client.session.status();

        // Check if our session is idle
        const sessionStatus = statusResponse.data?.[sessionId];
        if (sessionStatus?.type === 'idle') {
          // Session is done processing
          break;
        }

        // Wait a bit before polling again
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Get all messages from the session
      const messagesResponse = await this.client.session.messages({
        path: { id: sessionId },
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
