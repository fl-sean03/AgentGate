/**
 * Claude Agent SDK Driver
 *
 * Agent driver implementation using the official Claude Agent SDK.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentDriver,
  AgentRequest,
  AgentResult,
  DriverCapabilities,
} from '../types/index.js';
import { createLogger } from '../utils/index.js';
import { CLAUDE_CODE_CAPABILITIES, DEFAULT_TIMEOUT_MS } from './defaults.js';
import { MessageCollector, type ToolCallRecord } from './sdk-message-parser.js';
import {
  buildSDKOptions,
  createTimeoutController,
  clearControllerTimeout,
} from './sdk-options-builder.js';

const logger = createLogger('agent:sdk-driver');

/**
 * Claude Agent SDK driver configuration
 */
export interface ClaudeAgentSDKDriverConfig {
  /** Default timeout in ms (default: 5 minutes) */
  defaultTimeoutMs?: number;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Enable debug logging of all messages */
  debugMessages?: boolean;
}

/**
 * Extended agent result with SDK-specific data
 */
export interface SDKAgentResult extends AgentResult {
  /** Tool calls made during execution */
  toolCalls?: ToolCallRecord[];
  /** Total cost in USD */
  totalCostUsd?: number;
  /** Number of turns taken */
  numTurns?: number;
  /** Model used for execution */
  model?: string;
}

/**
 * Claude Agent SDK driver implementation
 */
export class ClaudeAgentSDKDriver implements AgentDriver {
  readonly name = 'claude-agent-sdk';
  readonly version = '1.0.0';

  private readonly config: Required<ClaudeAgentSDKDriverConfig>;

  constructor(config: ClaudeAgentSDKDriverConfig = {}) {
    this.config = {
      defaultTimeoutMs: config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      env: config.env ?? {},
      debugMessages: config.debugMessages ?? false,
    };
  }

  /**
   * Checks if the SDK is available
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Interface requires Promise, check is sync
  async isAvailable(): Promise<boolean> {
    try {
      // Try a simple query to check availability
      // The SDK bundles the CLI, so if import worked, it should be available
      logger.debug('SDK availability check: import succeeded');
      return true;
    } catch (error) {
      logger.debug({ error }, 'SDK not available');
      return false;
    }
  }

  /**
   * Returns the capabilities of this driver
   */
  getCapabilities(): DriverCapabilities {
    return {
      ...CLAUDE_CODE_CAPABILITIES,
      supportsHooks: true,
    };
  }

  /**
   * Executes an agent request using the SDK
   */
  async execute(request: AgentRequest): Promise<SDKAgentResult> {
    const startTime = Date.now();
    const timeout = request.timeoutMs || this.config.defaultTimeoutMs;

    logger.info(
      {
        workspace: request.workspacePath,
        maxTurns: request.constraints.maxTurns,
        hasSession: !!request.sessionId,
        timeout,
      },
      'Executing SDK agent request'
    );

    // Build SDK options from request
    const options = buildSDKOptions(request);

    // Create abort controller for timeout
    const abortController = createTimeoutController(timeout);
    options.abortController = abortController;

    // Set up environment
    if (Object.keys(this.config.env).length > 0) {
      options.env = {
        ...process.env,
        ...this.config.env,
      };
    }

    logger.debug(
      {
        cwd: options.cwd,
        maxTurns: options.maxTurns,
        permissionMode: options.permissionMode,
        allowedTools: options.allowedTools,
      },
      'SDK options'
    );

    const collector = new MessageCollector();
    let lastError: Error | null = null;

    try {
      // Execute query and collect messages
      for await (const message of query({
        prompt: request.taskPrompt,
        options,
      })) {
        if (this.config.debugMessages) {
          logger.debug({ messageType: message.type }, 'SDK message received');
        }

        collector.process(message);
      }

      // Clear timeout since we completed successfully
      clearControllerTimeout(abortController);
    } catch (error) {
      clearControllerTimeout(abortController);
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it was an abort (timeout)
      if (abortController.signal.aborted) {
        logger.warn({ timeout }, 'SDK execution timed out');

        const durationMs = Date.now() - startTime;
        return {
          success: false,
          exitCode: 124, // Standard timeout exit code
          stdout: '',
          stderr: `Execution timed out after ${timeout}ms`,
          structuredOutput: null,
          sessionId: collector.getSessionId(),
          tokensUsed: null,
          durationMs,
        };
      }

      logger.error({ error: lastError.message }, 'SDK execution failed');
    }

    const durationMs = Date.now() - startTime;
    const extracted = collector.getResult();

    // Build the result
    const result: SDKAgentResult = {
      success: extracted.success,
      exitCode: extracted.success ? 0 : 1,
      stdout: extracted.result ?? '',
      stderr: extracted.errors.join('\n'),
      structuredOutput: extracted.result ? { result: extracted.result } : null,
      sessionId: extracted.sessionId,
      tokensUsed: extracted.tokensUsed
        ? {
            input: extracted.tokensUsed.input,
            output: extracted.tokensUsed.output,
          }
        : null,
      durationMs,
      toolCalls: extracted.toolCalls,
      totalCostUsd: extracted.totalCostUsd,
      numTurns: extracted.numTurns,
      model: extracted.model ?? '',
    };

    logger.info(
      {
        success: result.success,
        sessionId: result.sessionId,
        durationMs,
        numTurns: extracted.numTurns,
        toolCallCount: extracted.toolCalls.length,
        costUsd: extracted.totalCostUsd,
      },
      'SDK execution completed'
    );

    return result;
  }
}

/**
 * Creates a new Claude Agent SDK driver instance
 */
export function createClaudeAgentSDKDriver(
  config?: ClaudeAgentSDKDriverConfig
): ClaudeAgentSDKDriver {
  return new ClaudeAgentSDKDriver(config);
}
