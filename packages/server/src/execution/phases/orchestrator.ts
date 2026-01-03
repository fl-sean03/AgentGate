/**
 * Phase Orchestrator
 * v0.2.25: Coordinates phase execution sequence
 *
 * Responsibilities:
 * - Execute phases in correct sequence (build → snapshot → verify → feedback)
 * - Handle phase failures and determine state transitions
 * - Aggregate phase results into iteration result
 * - Track phase timings for observability
 */

import {
  type PhaseContext,
  type IterationInput,
  type IterationResult,
  Phase,
} from './types.js';
import { BuildPhaseHandler } from './build-handler.js';
import { SnapshotPhaseHandler } from './snapshot-handler.js';
import { VerifyPhaseHandler } from './verify-handler.js';
import { FeedbackPhaseHandler } from './feedback-handler.js';
import { RunEvent } from '../../types/index.js';

/**
 * Phase orchestrator configuration
 */
export interface PhaseOrchestratorConfig {
  handlers?: {
    build?: BuildPhaseHandler;
    snapshot?: SnapshotPhaseHandler;
    verify?: VerifyPhaseHandler;
    feedback?: FeedbackPhaseHandler;
  };
}

/**
 * Phase Orchestrator
 *
 * Coordinates the execution of phases within a single iteration.
 * Handles phase sequencing, error handling, and result aggregation.
 */
export class PhaseOrchestrator {
  private readonly buildHandler: BuildPhaseHandler;
  private readonly snapshotHandler: SnapshotPhaseHandler;
  private readonly verifyHandler: VerifyPhaseHandler;
  private readonly feedbackHandler: FeedbackPhaseHandler;

  constructor(config: PhaseOrchestratorConfig = {}) {
    this.buildHandler = config.handlers?.build ?? new BuildPhaseHandler();
    this.snapshotHandler = config.handlers?.snapshot ?? new SnapshotPhaseHandler();
    this.verifyHandler = config.handlers?.verify ?? new VerifyPhaseHandler();
    this.feedbackHandler = config.handlers?.feedback ?? new FeedbackPhaseHandler();
  }

  /**
   * Execute a full iteration through all phases
   *
   * Phase sequence:
   * 1. BUILD - Execute agent to make changes
   * 2. SNAPSHOT - Capture workspace state
   * 3. VERIFY - Run verification gates
   * 4. FEEDBACK - Generate feedback if verification failed
   */
  async executeIteration(
    context: PhaseContext,
    input: IterationInput
  ): Promise<IterationResult> {
    const phaseTimings: Record<Phase, number> = {
      [Phase.BUILD]: 0,
      [Phase.SNAPSHOT]: 0,
      [Phase.VERIFY]: 0,
      [Phase.FEEDBACK]: 0,
    };

    const result: IterationResult = {
      success: false,
      phases: {},
      nextSessionId: null,
      nextFeedback: null,
      shouldContinue: false,
      stateTransition: RunEvent.SYSTEM_ERROR,
      phaseTimings,
    };

    // ========================================
    // BUILD PHASE
    // ========================================
    context.logger.info(
      { runId: context.runId, iteration: context.iteration },
      'Starting BUILD phase'
    );

    const buildResult = await this.buildHandler.execute(context, {
      taskPrompt: input.taskPrompt,
      feedback: input.feedback,
      sessionId: input.sessionId,
    });

    result.phases.build = buildResult;
    result.nextSessionId = buildResult.sessionId;
    phaseTimings[Phase.BUILD] = buildResult.duration;

    if (!buildResult.success) {
      context.logger.info(
        { runId: context.runId, iteration: context.iteration },
        'BUILD phase failed, ending iteration'
      );
      result.stateTransition = RunEvent.BUILD_FAILED;
      return result;
    }

    // ========================================
    // SNAPSHOT PHASE
    // ========================================
    context.logger.info(
      { runId: context.runId, iteration: context.iteration },
      'Starting SNAPSHOT phase'
    );

    const snapshotResult = await this.snapshotHandler.execute(context, {
      beforeState: input.beforeState,
    });

    result.phases.snapshot = snapshotResult;
    phaseTimings[Phase.SNAPSHOT] = snapshotResult.duration;

    if (!snapshotResult.success || !snapshotResult.snapshot) {
      context.logger.info(
        { runId: context.runId, iteration: context.iteration },
        'SNAPSHOT phase failed, ending iteration'
      );
      result.stateTransition = RunEvent.SNAPSHOT_FAILED;
      return result;
    }

    // ========================================
    // VERIFY PHASE
    // ========================================
    context.logger.info(
      { runId: context.runId, iteration: context.iteration },
      'Starting VERIFY phase'
    );

    const verifyResult = await this.verifyHandler.execute(context, {
      snapshot: snapshotResult.snapshot,
      gatePlan: input.gatePlan,
    });

    result.phases.verify = verifyResult;
    phaseTimings[Phase.VERIFY] = verifyResult.duration;

    // Check if verification passed
    if (verifyResult.allPassed) {
      context.logger.info(
        { runId: context.runId, iteration: context.iteration },
        'VERIFY phase passed, iteration succeeded'
      );
      result.success = true;
      result.stateTransition = RunEvent.VERIFY_PASSED;
      return result;
    }

    // ========================================
    // FEEDBACK PHASE (only if verification failed)
    // ========================================
    context.logger.info(
      { runId: context.runId, iteration: context.iteration },
      'Starting FEEDBACK phase (verification failed)'
    );

    const feedbackResult = await this.feedbackHandler.execute(context, {
      snapshot: snapshotResult.snapshot,
      verificationReport: verifyResult.report!,
      gatePlan: input.gatePlan,
    });

    result.phases.feedback = feedbackResult;
    result.nextFeedback = feedbackResult.feedback ?? null;
    result.shouldContinue = true;
    result.stateTransition = RunEvent.VERIFY_FAILED_RETRYABLE;
    phaseTimings[Phase.FEEDBACK] = feedbackResult.duration;

    context.logger.info(
      {
        runId: context.runId,
        iteration: context.iteration,
        feedbackLength: result.nextFeedback?.length ?? 0,
      },
      'FEEDBACK phase completed, iteration will retry'
    );

    return result;
  }

  /**
   * Get the handlers for testing/inspection
   */
  getHandlers(): {
    build: BuildPhaseHandler;
    snapshot: SnapshotPhaseHandler;
    verify: VerifyPhaseHandler;
    feedback: FeedbackPhaseHandler;
  } {
    return {
      build: this.buildHandler,
      snapshot: this.snapshotHandler,
      verify: this.verifyHandler,
      feedback: this.feedbackHandler,
    };
  }
}

/**
 * Create a phase orchestrator with default configuration
 */
export function createPhaseOrchestrator(
  config?: PhaseOrchestratorConfig
): PhaseOrchestrator {
  return new PhaseOrchestrator(config);
}
