/**
 * Build Phase Handler
 * v0.2.25: Executes agent to perform code changes
 *
 * Responsibilities:
 * - Construct agent request from context and input
 * - Execute agent via driver
 * - Handle agent success/failure
 * - Persist agent result
 * - Return structured result with session ID for continuation
 */

import {
  type PhaseHandler,
  type PhaseContext,
  type BuildPhaseInput,
  type BuildPhaseResult,
  type BuildError,
  type AgentRequest,
  type ValidationResult,
  Phase,
} from './types.js';

/**
 * Build phase handler options
 */
export interface BuildPhaseOptions {
  /** Default timeout for agent execution in ms */
  defaultTimeoutMs?: number;
}

/**
 * Build Phase Handler
 *
 * Executes the agent to make code changes based on the task prompt
 * and optional feedback from previous iterations.
 */
export class BuildPhaseHandler
  implements PhaseHandler<BuildPhaseInput, BuildPhaseResult>
{
  readonly name = 'build';
  readonly phase = Phase.BUILD;

  private readonly defaultTimeoutMs: number;

  constructor(options: BuildPhaseOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 300000; // 5 minutes
  }

  /**
   * Validate build phase inputs
   */
  validate(context: PhaseContext, input: BuildPhaseInput): ValidationResult {
    const errors: string[] = [];

    if (!input.taskPrompt || input.taskPrompt.trim().length === 0) {
      errors.push('Task prompt is required');
    }

    if (!context.workspace?.rootPath) {
      errors.push('Workspace path is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Execute the build phase
   */
  async execute(
    context: PhaseContext,
    input: BuildPhaseInput
  ): Promise<BuildPhaseResult> {
    const startTime = Date.now();
    const { services, logger } = context;

    logger.info(
      {
        runId: context.runId,
        iteration: context.iteration,
        hasFeedback: !!input.feedback,
        hasSessionId: !!input.sessionId,
      },
      'Build phase started'
    );

    try {
      // Validate inputs
      const validation = this.validate(context, input);
      if (!validation.valid) {
        return this.createErrorResult(
          startTime,
          input.sessionId,
          'agent_failure',
          `Validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Construct agent request
      const request = this.buildAgentRequest(context, input);

      // Execute agent
      const agentResult = await services.agentDriver.execute(
        request,
        context.streamingCallback
      );

      // Persist agent result
      await context.services.resultPersister.saveAgentResult(
        context.runId,
        context.iteration,
        agentResult
      );

      // Log completion
      logger.info(
        {
          runId: context.runId,
          iteration: context.iteration,
          success: agentResult.success,
          sessionId: agentResult.sessionId,
          duration: Date.now() - startTime,
        },
        'Build phase completed'
      );

      // Check for failure
      if (!agentResult.success) {
        const buildError = this.createBuildError(agentResult);

        return {
          success: false,
          sessionId: agentResult.sessionId ?? input.sessionId ?? 'unknown',
          agentResult,
          buildError,
          duration: Date.now() - startTime,
        };
      }

      // Success
      return {
        success: true,
        sessionId: agentResult.sessionId ?? input.sessionId ?? 'unknown',
        agentResult,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(
        {
          runId: context.runId,
          iteration: context.iteration,
          error,
        },
        'Build phase failed with exception'
      );

      return this.createErrorResult(
        startTime,
        input.sessionId,
        'exception',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Build the agent request from context and input
   */
  private buildAgentRequest(
    context: PhaseContext,
    input: BuildPhaseInput
  ): AgentRequest {
    const { workspace, taskSpec } = context;

    // Get timeout from task spec or use default
    // Parse maxWallClock string (e.g., "2h", "30m") if provided
    const timeoutMs = this.parseWallClockTimeout(taskSpec) ?? this.defaultTimeoutMs;

    // Build request without optional constraints
    const request: AgentRequest = {
      workspacePath: workspace.rootPath,
      taskPrompt: input.taskPrompt,
      feedback: input.feedback,
      sessionId: input.sessionId,
      iteration: context.iteration,
      timeoutMs,
    };

    // Add constraints only if agent spec has maxTokens
    const agentSpec = taskSpec.spec.execution?.agent;
    if (agentSpec?.maxTokens) {
      request.constraints = {
        maxTokens: agentSpec.maxTokens,
      };
    }

    return request;
  }

  /**
   * Parse wall clock timeout from TaskSpec
   */
  private parseWallClockTimeout(taskSpec: import('../../types/index.js').ResolvedTaskSpec): number | null {
    const wallClock = taskSpec.spec.convergence?.limits?.maxWallClock;
    if (!wallClock) return null;

    const match = wallClock.match(/^(\d+)([smhd])$/);
    if (!match?.[1] || !match[2]) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return null;
    }
  }

  /**
   * Create a build error from agent result
   */
  private createBuildError(agentResult: import('../../types/index.js').AgentResult): BuildError {
    // Determine error type
    let errorType: BuildError['type'] = 'agent_failure';
    const errorStr = agentResult.stderr ?? '';

    if (errorStr.includes('timeout')) {
      errorType = 'agent_timeout';
    } else if (errorStr.includes('crash')) {
      errorType = 'agent_crash';
    }

    return {
      type: errorType,
      message: agentResult.stderr || 'Agent execution failed',
      agentOutput: agentResult.stdout,
      recoverable: errorType !== 'agent_crash',
    };
  }

  /**
   * Create an error result
   */
  private createErrorResult(
    startTime: number,
    sessionId: string | null,
    errorType: BuildError['type'],
    message: string
  ): BuildPhaseResult {
    return {
      success: false,
      sessionId: sessionId ?? 'unknown',
      buildError: {
        type: errorType,
        message,
        recoverable: errorType !== 'agent_crash',
      },
      duration: Date.now() - startTime,
      error: {
        type: errorType,
        message,
      },
    };
  }
}
