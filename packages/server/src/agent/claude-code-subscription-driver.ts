/**
 * Claude Code Subscription Driver.
 * Uses Claude Pro/Max subscription instead of API credits.
 *
 * Key difference from claude-code-driver:
 * - Excludes ANTHROPIC_API_KEY from subprocess environment
 * - Uses OAuth credentials from ~/.claude/.credentials.json
 * - Validates subscription before execution
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process';
import type {
  AgentDriver,
  AgentRequest,
  AgentResult,
  DriverCapabilities,
  SubscriptionStatus,
  SandboxInfo,
} from '../types/index.js';
import { createLogger } from '../utils/index.js';
import { buildClaudeCommand, buildCommandString } from './command-builder.js';
import { DEFAULT_TIMEOUT_MS } from './defaults.js';
import { extractSessionId, extractTokenUsage, parseOutput } from './output-parser.js';
import { detectSubscription } from './subscription-detector.js';
import {
  StreamingExecutor,
  type StreamingEventCallback,
  type StreamingOptions,
} from './streaming-executor.js';
import { getSandboxManager, type SandboxConfig } from '../sandbox/index.js';
import { getAgentProcessManager } from '../control-plane/agent-process-manager.js';

const logger = createLogger('agent:claude-code-subscription');

/**
 * Environment variables to exclude when using subscription
 * These would cause Claude Code to use API billing instead
 */
const EXCLUDED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY',
  'ANTHROPIC_API_BASE',
  'ANTHROPIC_BASE_URL',
];

/**
 * Capabilities specific to subscription driver
 */
export const SUBSCRIPTION_CAPABILITIES: DriverCapabilities = {
  supportsSessionResume: true,
  supportsStructuredOutput: true,
  supportsToolRestriction: true,
  supportsTimeout: true,
  maxTurns: 100,
};

/**
 * Extended capabilities with subscription info
 */
export interface SubscriptionCapabilities extends DriverCapabilities {
  billingMethod: 'subscription';
  subscriptionType: string | null;
  rateLimitTier: string | null;
}

/**
 * Configuration for subscription driver
 */
export interface ClaudeCodeSubscriptionDriverConfig {
  /** Path to claude CLI binary (default: 'claude') */
  binaryPath?: string;
  /** Default timeout in ms (default: 5 minutes) */
  defaultTimeoutMs?: number;
  /** Additional environment variables to pass (API keys will still be excluded) */
  env?: Record<string, string>;
  /** Enable sandbox execution (default: false for backward compat) */
  useSandbox?: boolean;
  /** Sandbox configuration overrides */
  sandboxConfig?: Partial<SandboxConfig>;
}

/**
 * Options for execution with streaming
 */
export interface SubscriptionExecuteWithStreamingOptions {
  /** Work order ID for event context */
  workOrderId: string;
  /** Run ID for event context */
  runId: string;
  /** Callback for streaming events */
  onEvent?: StreamingEventCallback | undefined;
  /** Streaming options */
  streamingOptions?: StreamingOptions | undefined;
  /** AbortSignal for cancellation */
  signal?: AbortSignal | undefined;
}

/**
 * Claude Code driver that uses subscription billing.
 * Excludes API keys from environment to ensure subscription is used.
 */
export class ClaudeCodeSubscriptionDriver implements AgentDriver {
  readonly name = 'claude-code-subscription';
  readonly version = '1.0.0';

  private readonly config: {
    binaryPath: string;
    defaultTimeoutMs: number;
    env: Record<string, string>;
    useSandbox: boolean;
    sandboxConfig: Partial<SandboxConfig>;
  };
  private subscriptionStatus: SubscriptionStatus | null = null;

  constructor(config: ClaudeCodeSubscriptionDriverConfig = {}) {
    this.config = {
      binaryPath: config.binaryPath ?? 'claude',
      defaultTimeoutMs: config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      env: config.env ?? {},
      useSandbox: config.useSandbox ?? false,
      sandboxConfig: config.sandboxConfig ?? {},
    };
  }

  /**
   * Check if Claude CLI is available AND subscription is valid
   */
  async isAvailable(): Promise<boolean> {
    // Check CLI availability
    try {
      const output = execSync(`${this.config.binaryPath} --version`, {
        timeout: 5000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      logger.debug(
        { available: true, version: output?.trim() },
        'Claude CLI availability check'
      );
    } catch (error) {
      logger.debug({ error }, 'Claude CLI not available');
      return false;
    }

    // Check subscription
    this.subscriptionStatus = await detectSubscription();

    if (!this.subscriptionStatus.available) {
      logger.warn(
        { error: this.subscriptionStatus.error },
        'Subscription not available'
      );
      return false;
    }

    logger.info(
      {
        subscriptionType: this.subscriptionStatus.subscriptionType,
        rateLimitTier: this.subscriptionStatus.rateLimitTier,
      },
      'Subscription available'
    );

    return true;
  }

  /**
   * Get capabilities including subscription info
   */
  getCapabilities(): SubscriptionCapabilities {
    return {
      ...SUBSCRIPTION_CAPABILITIES,
      billingMethod: 'subscription',
      subscriptionType: this.subscriptionStatus?.subscriptionType ?? null,
      rateLimitTier: this.subscriptionStatus?.rateLimitTier ?? null,
    };
  }

  /**
   * Get subscription status
   */
  getSubscriptionStatus(): SubscriptionStatus | null {
    return this.subscriptionStatus;
  }

  /**
   * Create clean environment without API keys
   */
  private createCleanEnvironment(): Record<string, string> {
    const env: Record<string, string> = {};

    // Copy all environment variables except excluded ones
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !EXCLUDED_ENV_VARS.includes(key)) {
        env[key] = value;
      }
    }

    // Add custom environment variables (still excluding API keys)
    for (const [key, value] of Object.entries(this.config.env)) {
      if (!EXCLUDED_ENV_VARS.includes(key)) {
        env[key] = value;
      }
    }

    // Ensure clean JSON output
    env['NO_COLOR'] = '1';
    env['FORCE_COLOR'] = '0';

    return env;
  }

  /**
   * Execute agent request using subscription
   */
  async execute(request: AgentRequest): Promise<AgentResult> {
    const startTime = Date.now();

    // Validate subscription before execution
    if (!this.subscriptionStatus) {
      this.subscriptionStatus = await detectSubscription();
    }

    if (!this.subscriptionStatus.available) {
      const error = this.subscriptionStatus.error ?? 'Subscription not available';
      logger.error({ error }, 'Cannot execute: subscription not available');

      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: error,
        structuredOutput: null,
        sessionId: null,
        tokensUsed: null,
        durationMs: Date.now() - startTime,
      };
    }

    // Try sandbox execution if enabled
    if (this.config.useSandbox) {
      try {
        return await this.executeWithSandbox(request);
      } catch (error) {
        logger.warn(
          { err: error },
          'Sandbox execution failed, falling back to direct spawn'
        );
        // Fall through to direct spawn
      }
    }

    return this.executeDirectly(request);
  }

  /**
   * Execute using sandbox isolation (subscription mode).
   */
  private async executeWithSandbox(request: AgentRequest): Promise<AgentResult> {
    const startTime = Date.now();
    const args = buildClaudeCommand(request);
    const timeoutSeconds = Math.ceil((request.timeoutMs || this.config.defaultTimeoutMs) / 1000);

    logger.info(
      {
        workspace: request.workspacePath,
        maxTurns: request.constraints.maxTurns,
        hasSession: !!request.sessionId,
        timeoutSeconds,
        subscriptionType: this.subscriptionStatus?.subscriptionType,
        rateLimitTier: this.subscriptionStatus?.rateLimitTier,
        billingMethod: 'subscription',
        useSandbox: true,
      },
      'Executing Claude Code with subscription and sandbox'
    );

    logger.debug({ command: buildCommandString(request) }, 'Full command');

    // Create clean environment (exclude API keys)
    const cleanEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.config.env)) {
      if (!EXCLUDED_ENV_VARS.includes(key)) {
        cleanEnv[key] = value;
      }
    }
    cleanEnv['NO_COLOR'] = '1';
    cleanEnv['FORCE_COLOR'] = '0';

    const sandboxManager = getSandboxManager();
    const sandboxConfig: SandboxConfig = {
      workspacePath: request.workspacePath,
      env: cleanEnv,
      resourceLimits: {
        timeoutSeconds,
        ...this.config.sandboxConfig.resourceLimits,
      },
      ...this.config.sandboxConfig,
    };

    const sandbox = await sandboxManager.createSandbox(sandboxConfig);
    const sandboxStartTime = Date.now();

    try {
      const result = await sandbox.execute(this.config.binaryPath, args, {
        timeout: timeoutSeconds,
      });

      const durationMs = Date.now() - startTime;
      const structuredOutput = parseOutput(result.stdout);

      // Get sandbox stats for info
      const stats = await sandbox.getStats();
      const sandboxInfo: SandboxInfo = {
        provider: sandboxManager.getProviderName(),
        durationMs: Date.now() - sandboxStartTime,
      };
      // Add optional properties only if defined
      if (sandbox.containerId) {
        sandboxInfo.containerId = sandbox.containerId;
      }
      if (stats.cpuPercent !== undefined) {
        sandboxInfo.resourceUsage = {
          cpuPercent: stats.cpuPercent,
          memoryMB: (stats.memoryBytes ?? 0) / (1024 * 1024),
        };
      }

      logger.info(
        {
          exitCode: result.exitCode,
          durationMs,
          hasOutput: !!structuredOutput,
          billingMethod: 'subscription',
          sandboxProvider: sandboxInfo.provider,
        },
        'Claude Code subscription sandbox execution completed'
      );

      return {
        success: result.exitCode === 0 && !result.timedOut,
        exitCode: result.timedOut ? 124 : result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        structuredOutput,
        sessionId: structuredOutput ? extractSessionId(structuredOutput) : null,
        tokensUsed: structuredOutput ? extractTokenUsage(structuredOutput) : null,
        durationMs,
        sandboxInfo,
      };
    } finally {
      // Always clean up sandbox
      await sandbox.destroy().catch((err: unknown) => {
        logger.error({ err, sandboxId: sandbox.id }, 'Failed to destroy sandbox');
      });
    }
  }

  /**
   * Execute directly using child_process.spawn (no sandbox).
   */
  private async executeDirectly(request: AgentRequest): Promise<AgentResult> {
    const startTime = Date.now();
    const args = buildClaudeCommand(request);
    const timeout = request.timeoutMs || this.config.defaultTimeoutMs;

    logger.info(
      {
        workspace: request.workspacePath,
        maxTurns: request.constraints.maxTurns,
        hasSession: !!request.sessionId,
        timeout,
        subscriptionType: this.subscriptionStatus?.subscriptionType,
        rateLimitTier: this.subscriptionStatus?.rateLimitTier,
        billingMethod: 'subscription',
      },
      'Executing Claude Code with subscription'
    );

    logger.debug({ command: buildCommandString(request) }, 'Full command');

    // Create environment WITHOUT API keys
    const env = this.createCleanEnvironment();

    // Log that we're explicitly NOT using API keys
    logger.debug(
      {
        excludedVars: EXCLUDED_ENV_VARS.filter(v => process.env[v] !== undefined),
      },
      'Excluded API key variables from environment'
    );

    return new Promise<AgentResult>((resolve) => {
      const proc: ChildProcess = spawn(this.config.binaryPath, args, {
        cwd: request.workspacePath,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Register process with AgentProcessManager for tracking (v0.2.22 fix)
      // This enables the stale detector to properly track the process
      if (request.workOrderId && request.runId && proc.pid) {
        const processManager = getAgentProcessManager();
        processManager.register(request.workOrderId, request.runId, proc);
        logger.debug(
          { workOrderId: request.workOrderId, runId: request.runId, pid: proc.pid },
          'Registered process with AgentProcessManager'
        );
      }

      // Close stdin immediately
      proc.stdin?.end();

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Timeout handler
      const timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        logger.error({ error: error.message }, 'Claude Code process error');

        resolve({
          success: false,
          exitCode: 1,
          stdout,
          stderr: stderr || error.message,
          structuredOutput: null,
          sessionId: null,
          tokensUsed: null,
          durationMs,
        });
      });

      proc.on('close', (exitCode: number | null, signal: string | null) => {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        if (timedOut) {
          logger.warn({ timeout, durationMs }, 'Claude Code execution timed out');

          resolve({
            success: false,
            exitCode: 124,
            stdout,
            stderr: stderr || `Execution timed out after ${timeout}ms`,
            structuredOutput: null,
            sessionId: null,
            tokensUsed: null,
            durationMs,
          });
          return;
        }

        if (signal) {
          logger.warn({ signal }, 'Claude Code process was killed');

          resolve({
            success: false,
            exitCode: exitCode ?? 137,
            stdout,
            stderr: stderr || `Process killed with signal ${signal}`,
            structuredOutput: null,
            sessionId: null,
            tokensUsed: null,
            durationMs,
          });
          return;
        }

        const structuredOutput = parseOutput(stdout);
        const actualExitCode = exitCode ?? 1;

        logger.info(
          {
            exitCode: actualExitCode,
            durationMs,
            hasOutput: !!structuredOutput,
            billingMethod: 'subscription',
          },
          'Claude Code execution completed (subscription)'
        );

        resolve({
          success: actualExitCode === 0,
          exitCode: actualExitCode,
          stdout,
          stderr,
          structuredOutput,
          sessionId: structuredOutput ? extractSessionId(structuredOutput) : null,
          tokensUsed: structuredOutput ? extractTokenUsage(structuredOutput) : null,
          durationMs,
        });
      });
    });
  }

  /**
   * Execute agent request with streaming using subscription.
   * This method provides real-time events as the subprocess runs.
   */
  async executeWithStreaming(
    request: AgentRequest,
    options: SubscriptionExecuteWithStreamingOptions
  ): Promise<AgentResult> {
    const startTime = Date.now();

    // Validate subscription before execution
    if (!this.subscriptionStatus) {
      this.subscriptionStatus = await detectSubscription();
    }

    if (!this.subscriptionStatus.available) {
      const error = this.subscriptionStatus.error ?? 'Subscription not available';
      logger.error({ error }, 'Cannot execute with streaming: subscription not available');

      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: error,
        structuredOutput: null,
        sessionId: null,
        tokensUsed: null,
        durationMs: Date.now() - startTime,
      };
    }

    const args = buildClaudeCommand(request);
    const timeout = request.timeoutMs || this.config.defaultTimeoutMs;

    logger.info(
      {
        workspace: request.workspacePath,
        maxTurns: request.constraints.maxTurns,
        hasSession: !!request.sessionId,
        timeout,
        subscriptionType: this.subscriptionStatus.subscriptionType,
        rateLimitTier: this.subscriptionStatus.rateLimitTier,
        billingMethod: 'subscription',
        streaming: true,
        workOrderId: options.workOrderId,
        runId: options.runId,
      },
      'Executing Claude Code with subscription and streaming'
    );

    logger.debug({ command: buildCommandString(request) }, 'Full command');

    // Create clean environment WITHOUT API keys
    const env = this.createCleanEnvironment();

    // Log that we're explicitly NOT using API keys
    logger.debug(
      {
        excludedVars: EXCLUDED_ENV_VARS.filter(v => process.env[v] !== undefined),
      },
      'Excluded API key variables from environment'
    );

    // Create streaming executor
    const executor = new StreamingExecutor({
      workOrderId: options.workOrderId,
      runId: options.runId,
      onEvent: options.onEvent,
      options: options.streamingOptions,
    });

    // Execute with streaming
    const result = await executor.execute(this.config.binaryPath, args, {
      cwd: request.workspacePath,
      env,
      timeout,
      signal: options.signal,
    });

    // Convert to AgentResult
    return {
      success: result.success,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      structuredOutput: result.structuredOutput,
      sessionId: result.sessionId,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
    };
  }
}

/**
 * Create a subscription driver instance.
 * Validates subscription availability before returning.
 *
 * @throws Error if subscription is not available
 */
export async function createClaudeCodeSubscriptionDriver(
  config?: ClaudeCodeSubscriptionDriverConfig
): Promise<ClaudeCodeSubscriptionDriver> {
  const driver = new ClaudeCodeSubscriptionDriver(config);

  // Validate subscription is available
  const available = await driver.isAvailable();
  if (!available) {
    const status = driver.getSubscriptionStatus();
    const error = status?.error ?? 'Subscription not available';
    throw new Error(`Cannot create subscription driver: ${error}`);
  }

  return driver;
}

/**
 * Try to create a subscription driver, returning null if not available.
 * Use this when subscription is optional.
 */
export async function tryCreateSubscriptionDriver(
  config?: ClaudeCodeSubscriptionDriverConfig
): Promise<ClaudeCodeSubscriptionDriver | null> {
  try {
    return await createClaudeCodeSubscriptionDriver(config);
  } catch {
    return null;
  }
}
