/**
 * Claude Agent SDK Driver
 *
 * AgentDriver implementation using the Claude Agent SDK's query() function
 * for direct API-based agent execution.
 */

import { execSync } from 'node:child_process';
import type {
  AgentDriver,
  AgentRequest,
  AgentResult,
  DriverCapabilities,
} from '../types/index.js';
import { createLogger } from '../utils/index.js';
import { buildPrompt } from './command-builder.js';
import { DEFAULT_TIMEOUT_MS } from './defaults.js';
import {
  MessageCollector,
  buildAgentResult,
  type SDKMessage,
} from './sdk-message-parser.js';
import {
  buildSDKOptions,
  getRequiredConfig,
  type ClaudeAgentSDKDriverConfig,
  type HooksConfig,
} from './sdk-options-builder.js';
import { buildHooksConfig } from './sdk-hooks.js';

const logger = createLogger('agent:sdk');

// ============================================================================
// SDK Driver Capabilities
// ============================================================================

/**
 * Capabilities specific to the SDK driver
 */
export const SDK_DRIVER_CAPABILITIES: DriverCapabilities = {
  supportsSessionResume: true,
  supportsStructuredOutput: true,
  supportsToolRestriction: true,
  supportsTimeout: true,
  supportsHooks: true,
  maxTurns: 100,
};

// ============================================================================
// SDK Driver Implementation
// ============================================================================

/**
 * Claude Agent SDK driver implementation.
 * Uses the SDK's query() function for agent execution.
 */
export class ClaudeAgentSDKDriver implements AgentDriver {
  readonly name = 'claude-agent-sdk';
  readonly version = '1.0.0';

  private readonly config: Required<ClaudeAgentSDKDriverConfig>;
  private sdkAvailable: boolean | null = null;

  constructor(config: ClaudeAgentSDKDriverConfig = {}) {
    this.config = getRequiredConfig(config);
  }

  /**
   * Check if the SDK is available
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Interface requires Promise, execSync is sync
  async isAvailable(): Promise<boolean> {
    // Use cached result if available
    if (this.sdkAvailable !== null) {
      return this.sdkAvailable;
    }

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      logger.debug('ANTHROPIC_API_KEY not set');
      this.sdkAvailable = false;
      return false;
    }

    // Check if Claude CLI is installed (SDK requires it)
    try {
      execSync('claude --version', {
        timeout: 5000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.sdkAvailable = true;
      logger.debug('Claude Agent SDK available');
      return true;
    } catch {
      logger.debug('Claude CLI not available');
      this.sdkAvailable = false;
      return false;
    }
  }

  /**
   * Get driver capabilities
   */
  getCapabilities(): DriverCapabilities {
    return { ...SDK_DRIVER_CAPABILITIES };
  }

  /**
   * Execute an agent request using the SDK
   */
  async execute(request: AgentRequest): Promise<AgentResult> {
    const startTime = Date.now();
    const collector = new MessageCollector();

    // Build hooks config
    const hooksConfig: HooksConfig | undefined = this.config.hooks
      ? buildHooksConfig(this.config.hooks)
      : undefined;

    // Build SDK options
    const options = buildSDKOptions(request, this.config, hooksConfig);

    // Build the prompt
    const prompt = buildPrompt(request);

    // Set up timeout with AbortController
    const timeout = request.timeoutMs ?? this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    logger.info(
      {
        workspace: request.workspacePath,
        maxTurns: options.maxTurns,
        hasSession: !!request.sessionId,
        timeout,
      },
      'Executing Claude Agent SDK request'
    );

    try {
      // Store original working directory and environment
      const originalCwd = process.cwd();
      const originalEnv = { ...process.env };

      // Change to workspace directory
      process.chdir(request.workspacePath);

      // Set up environment
      Object.assign(process.env, this.config.env);

      try {
        // Dynamically import the SDK to avoid issues if not installed
        // The SDK exports a query function that returns an async generator
        const sdk = await this.importSDK();

        if (!sdk) {
          clearTimeout(timeoutId);
          return buildAgentResult(
            collector,
            false,
            Date.now() - startTime,
            'Claude Agent SDK not available'
          );
        }

        // Execute query and iterate through messages
        // Convert options to Record<string, unknown> for SDK compatibility
        const result = sdk.query({
          prompt,
          options: options as Record<string, unknown>,
        });

        // Process messages from the async generator
        for await (const message of result) {
          // Check for abort
          if (controller.signal.aborted) {
            break;
          }

          // Add message to collector
          collector.add(message as SDKMessage);
        }

        clearTimeout(timeoutId);

        const durationMs = Date.now() - startTime;
        logger.info(
          {
            durationMs,
            turns: collector.getTurnCount(),
            toolCalls: collector.getToolCalls().length,
            sessionId: collector.getSessionId(),
          },
          'Claude Agent SDK execution completed'
        );

        return buildAgentResult(collector, true, durationMs);
      } finally {
        // Restore original working directory and environment
        process.chdir(originalCwd);
        // Restore environment (only remove keys we added)
        for (const key of Object.keys(this.config.env)) {
          if (originalEnv[key] === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = originalEnv[key];
          }
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;

      if (controller.signal.aborted) {
        logger.warn({ timeout, durationMs }, 'Claude Agent SDK execution timed out');
        return buildAgentResult(
          collector,
          false,
          durationMs,
          `Execution timed out after ${timeout}ms`
        );
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, durationMs }, 'Claude Agent SDK execution failed');

      return buildAgentResult(collector, false, durationMs, errorMessage);
    }
  }

  /**
   * Dynamically import the Claude Agent SDK
   *
   * The SDK module '@anthropic-ai/claude-code' provides a query() function
   * that returns an async generator of messages. If the SDK is not installed,
   * this returns null and the driver reports as unavailable.
   */
  private async importSDK(): Promise<{
    query: (params: {
      prompt: string;
      options?: Record<string, unknown>;
    }) => AsyncIterable<unknown>;
  } | null> {
    try {
      // Try to import the SDK dynamically
      // Note: The actual import path is '@anthropic-ai/claude-code'
      // but we use dynamic import to handle cases where it's not installed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const modulePath = '@anthropic-ai/claude-code';
      const sdk = (await import(/* webpackIgnore: true */ modulePath)) as {
        query: (params: {
          prompt: string;
          options?: Record<string, unknown>;
        }) => AsyncIterable<unknown>;
      };
      return sdk;
    } catch {
      logger.debug('Claude Agent SDK not installed');
      return null;
    }
  }

  /**
   * Reset cached availability status (for testing)
   */
  resetAvailabilityCache(): void {
    this.sdkAvailable = null;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new ClaudeAgentSDKDriver instance
 * @throws Error if SDK is not available
 */
export async function createClaudeAgentSDKDriver(
  config?: ClaudeAgentSDKDriverConfig
): Promise<ClaudeAgentSDKDriver> {
  const driver = new ClaudeAgentSDKDriver(config);

  if (!(await driver.isAvailable())) {
    throw new Error(
      'Claude Agent SDK not available. Ensure ANTHROPIC_API_KEY is set and Claude CLI is installed.'
    );
  }

  return driver;
}

/**
 * Try to create a ClaudeAgentSDKDriver, returning null if unavailable
 */
export async function tryCreateSDKDriver(
  config?: ClaudeAgentSDKDriverConfig
): Promise<ClaudeAgentSDKDriver | null> {
  const driver = new ClaudeAgentSDKDriver(config);

  if (await driver.isAvailable()) {
    return driver;
  }

  return null;
}

// Re-export config type
export type { ClaudeAgentSDKDriverConfig };
