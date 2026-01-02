/**
 * Run executor.
 * Coordinates the build-snapshot-verify-feedback loop for a single run.
 */

import { randomUUID } from 'node:crypto';
import {
  type WorkOrder,
  type Run,
  type GatePlan,
  type Workspace,
  type BeforeState,
  type Snapshot,
  type VerificationReport,
  type IterationData,
  type AgentResult,
  type Phase,
  RunEvent,
  RunResult,
  RunState,
  IterationErrorType,
  createIterationData,
  BuildErrorType,
} from '../types/index.js';
import type { ResolvedHarnessConfig } from '../types/harness-config.js';
import type { LoopStrategy, LoopContext, LoopState, LoopDecision } from '../types/loop-strategy.js';
import {
  applyTransition,
  isTerminalState,
} from './state-machine.js';
import { saveRun, saveIterationData, createRun, type CreateRunOptions } from './run-store.js';
import { resultPersister } from './result-persister.js';
import { ErrorBuilder } from './error-builder.js';
import { getConfig } from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import type { EventBroadcaster } from '../server/websocket/broadcaster.js';
import type { ParsedEvent } from '../agent/stream-parser.js';
import type { StreamingEventCallback } from '../agent/streaming-executor.js';

const log = createLogger('run-executor');

/**
 * Build a LoopContext for the current iteration.
 * (v0.2.16 - Thrust 9)
 */
function buildLoopContext(
  workOrderId: string,
  runId: string,
  taskPrompt: string,
  config: ResolvedHarnessConfig,
  state: LoopState,
  currentSnapshot: Snapshot | null,
  currentVerification: VerificationReport | null,
  previousSnapshots: Snapshot[],
  previousVerifications: VerificationReport[]
): LoopContext {
  return {
    workOrderId,
    runId,
    taskPrompt,
    config: config.loopStrategy,
    state,
    currentSnapshot,
    currentVerification,
    previousSnapshots,
    previousVerifications,
  };
}

/**
 * Create initial loop state.
 * (v0.2.16 - Thrust 9)
 */
function createInitialLoopState(maxIterations: number): LoopState {
  const now = new Date();
  return {
    iteration: 1,
    maxIterations,
    startedAt: now,
    lastDecision: null,
    progress: {
      iteration: 1,
      totalIterations: maxIterations,
      startedAt: now,
      lastIterationAt: null,
      estimatedCompletion: null,
      progressPercent: 0,
      trend: 'unknown',
      metrics: {
        testsPassingPrevious: 0,
        testsPassingCurrent: 0,
        testsTotal: 0,
        linesChanged: 0,
        filesChanged: 0,
        errorsFixed: 0,
        errorsRemaining: 0,
        customMetrics: {},
      },
    },
    loopDetection: {
      recentSnapshots: [],
      repeatPatterns: [],
      loopDetected: false,
      loopType: null,
      confidence: 0,
      detectedAt: null,
    },
    history: [],
    isTerminal: false,
    terminationReason: null,
  };
}

/**
 * Build result including agent result for metrics
 */
export interface BuildResult {
  sessionId: string;
  success: boolean;
  error?: string;
  agentResult?: AgentResult;
}

/**
 * Options for run execution.
 */
export interface RunExecutorOptions {
  workOrder: WorkOrder;
  workspace: Workspace;
  gatePlan: GatePlan;
  harnessConfig?: ResolvedHarnessConfig; // v0.2.16 - Thrust 9
  loopStrategy?: LoopStrategy;           // v0.2.16 - Thrust 9
  leaseId?: string; // Lease ID for periodic renewal (v0.2.10 - Thrust 12)

  /**
   * Maximum wall clock time for the run in milliseconds.
   * If the run exceeds this duration, it will be terminated with a timeout error.
   * (v0.2.23 - Wave 1.4: Work Order Timeout Enforcement)
   */
  maxWallClockMs?: number;

  // Optional EventBroadcaster for streaming events (v0.2.11 - Thrust 4)
  broadcaster?: EventBroadcaster;

  // Callbacks for each phase
  onBuild: (
    workspace: Workspace,
    taskPrompt: string,
    feedback: string | null,
    iteration: number,
    sessionId: string | null,
    streamingCallback?: StreamingEventCallback
  ) => Promise<BuildResult>;

  onSnapshot: (
    workspace: Workspace,
    beforeState: BeforeState,
    runId: string,
    iteration: number,
    taskPrompt: string
  ) => Promise<Snapshot>;

  onVerify: (
    snapshot: Snapshot,
    gatePlan: GatePlan,
    runId: string,
    iteration: number
  ) => Promise<VerificationReport>;

  onFeedback: (
    snapshot: Snapshot,
    verificationReport: VerificationReport,
    gatePlan: GatePlan
  ) => Promise<string>;

  onCaptureBeforeState: (workspace: Workspace) => Promise<BeforeState>;

  // Optional callbacks for status updates
  onRunStarted?: (run: Run) => Promise<void>;
  onStateChange?: (run: Run) => void;
  onIterationComplete?: (run: Run, iteration: IterationData) => void;

  // Metrics callbacks (v0.2.5)
  onPhaseStart?: (phase: Phase, iteration: number) => void;
  onPhaseEnd?: (phase: Phase, iteration: number) => void;
  onAgentResult?: (result: AgentResult, iteration: number) => void;
  onSnapshotCaptured?: (snapshot: Snapshot, iteration: number) => void;
  onVerificationComplete?: (report: VerificationReport, iteration: number) => void;

  // GitHub integration callbacks (v0.2.4)
  onPushIteration?: (
    workspace: Workspace,
    run: Run,
    iteration: number,
    commitMessage: string
  ) => Promise<void>;
  onCreatePullRequest?: (
    workspace: Workspace,
    run: Run,
    verificationReport: VerificationReport
  ) => Promise<{ prUrl: string; prNumber: number } | null>;
  onPollCI?: (
    workspace: Workspace,
    run: Run,
    prUrl: string,
    branchRef: string
  ) => Promise<{ success: boolean; feedback?: string }>;
}

/**
 * Execute a run.
 * Returns when the run reaches a terminal state.
 */
export async function executeRun(options: RunExecutorOptions): Promise<Run> {
  const {
    workOrder,
    workspace,
    gatePlan,
    harnessConfig,   // v0.2.16 - Thrust 9
    loopStrategy,    // v0.2.16 - Thrust 9
    leaseId,
    maxWallClockMs,  // v0.2.23 - Wave 1.4: Work Order Timeout Enforcement
    broadcaster,
    onBuild,
    onSnapshot,
    onVerify,
    onFeedback,
    onCaptureBeforeState,
    onRunStarted,
    onStateChange,
    onIterationComplete,
    onPhaseStart,
    onPhaseEnd,
    onAgentResult,
    onSnapshotCaptured,
    onVerificationComplete,
    onPushIteration,
    onCreatePullRequest,
    onPollCI,
  } = options;

  const runId = randomUUID();
  const config = getConfig();
  const ciOptions: CreateRunOptions = {
    ciEnabled: workOrder.waitForCI ?? config.ci.waitByDefault,
    maxCiIterations: config.ci.maxIterations,
  };
  let run = createRun(runId, workOrder.id, workspace.id, workOrder.maxIterations, ciOptions);

  log.info(
    {
      runId,
      workOrderId: workOrder.id,
      workspaceId: workspace.id,
      maxIterations: workOrder.maxIterations,
      maxWallClockMs, // v0.2.23 - Wave 1.4
      ciEnabled: run.ciEnabled,
      maxCiIterations: run.maxCiIterations,
    },
    'Starting run execution'
  );

  // Track run start time for timeout enforcement (v0.2.23 - Wave 1.4)
  const runStartTime = Date.now();

  // Set up periodic lease renewal to prevent expiry during long-running operations (v0.2.10 - Thrust 12)
  let renewalInterval: NodeJS.Timeout | null = null;
  if (leaseId) {
    const { renewLease } = await import('../workspace/lease.js');
    // Renew lease every 10 minutes
    renewalInterval = setInterval(() => {
      void (async (): Promise<void> => {
        try {
          await renewLease(leaseId);
          log.debug({ runId, leaseId }, 'Lease renewed');
        } catch (error) {
          log.warn({ runId, leaseId, error }, 'Failed to renew lease');
        }
      })();
    }, 10 * 60 * 1000);
  }

  // Save initial state
  await saveRun(run);
  onStateChange?.(run);

  // Notify that run has started (allows caller to update work order status)
  await onRunStarted?.(run);

  // Transition to LEASED
  run = applyTransition(run, RunEvent.WORKSPACE_ACQUIRED);
  await saveRun(run);
  onStateChange?.(run);

  // Capture before state
  let beforeState: BeforeState;
  try {
    beforeState = await onCaptureBeforeState(workspace);
    run.snapshotBeforeSha = beforeState.sha;
    await saveRun(run);
  } catch (error) {
    log.error({ error, runId }, 'Failed to capture before state');
    run = applyTransition(run, RunEvent.SYSTEM_ERROR);
    run.result = RunResult.FAILED_ERROR;
    run.error = error instanceof Error ? error.message : String(error);
    await saveRun(run);
    return run;
  }

  // Initialize loop state and strategy (v0.2.16 - Thrust 9)
  const loopState = createInitialLoopState(run.maxIterations);
  const previousSnapshots: Snapshot[] = [];
  const previousVerifications: VerificationReport[] = [];

  // Initialize loop strategy if provided
  if (loopStrategy && harnessConfig) {
    try {
      const initialContext = buildLoopContext(
        workOrder.id,
        runId,
        workOrder.taskPrompt,
        harnessConfig,
        loopState,
        null,
        null,
        previousSnapshots,
        previousVerifications
      );
      await loopStrategy.onLoopStart(initialContext);
      log.debug({ runId, strategyName: loopStrategy.name }, 'Loop strategy initialized');
    } catch (error) {
      log.error({ error, runId }, 'Failed to initialize loop strategy');
      run = applyTransition(run, RunEvent.SYSTEM_ERROR);
      run.result = RunResult.FAILED_ERROR;
      run.error = error instanceof Error ? error.message : String(error);
      await saveRun(run);
      return run;
    }
  }

  // Main iteration loop
  let feedback: string | null = null;

  while (!isTerminalState(run.state)) {
    const iterationStart = Date.now();
    const iteration = run.iteration;

    // Check for wall clock timeout before starting iteration (v0.2.23 - Wave 1.4)
    if (maxWallClockMs !== undefined) {
      const elapsedMs = Date.now() - runStartTime;
      if (elapsedMs > maxWallClockMs) {
        log.warn(
          { runId, elapsedMs, maxWallClockMs, iteration },
          'Run exceeded maxWallClockSeconds timeout'
        );

        // Create timeout error
        const timeoutError = ErrorBuilder.createTimeout(
          elapsedMs,
          maxWallClockMs,
          { runId, iteration, phase: run.state }
        );

        run = applyTransition(run, RunEvent.SYSTEM_ERROR);
        run.result = RunResult.FAILED_ERROR;
        run.error = timeoutError.message;
        await saveRun(run);
        onStateChange?.(run);
        break;
      }
    }

    log.info({ runId, iteration, maxIterations: run.maxIterations }, 'Starting iteration');

    // Update loop state and notify strategy (v0.2.16 - Thrust 9)
    loopState.iteration = iteration;
    loopState.progress.iteration = iteration;
    let currentSnapshot: Snapshot | null = null;
    let currentVerification: VerificationReport | null = null;

    if (loopStrategy && harnessConfig) {
      try {
        const iterContext = buildLoopContext(
          workOrder.id,
          runId,
          workOrder.taskPrompt,
          harnessConfig,
          loopState,
          null,
          null,
          previousSnapshots,
          previousVerifications
        );
        await loopStrategy.onIterationStart(iterContext);
        log.debug({ runId, iteration }, 'Strategy notified of iteration start');
      } catch (error) {
        log.warn({ error, runId, iteration }, 'Strategy onIterationStart failed');
        // Continue execution - strategy errors should not fail the run
      }
    }

    // Create iteration tracking (v0.2.19 - Thrust 3: use factory function)
    const iterationData: IterationData = createIterationData(iteration, run.state);

    try {
      // BUILD PHASE
      // Only transition if not already in BUILDING state (happens when coming from FEEDBACK)
      if (run.state !== RunState.BUILDING) {
        run = applyTransition(run, RunEvent.BUILD_STARTED);
        await saveRun(run);
        onStateChange?.(run);
      }
      onPhaseStart?.('build', iteration);

      // Create streaming callback if broadcaster is available (v0.2.11 - Thrust 4)
      const streamingCallback: StreamingEventCallback | undefined = broadcaster
        ? createStreamingCallback(broadcaster, workOrder.id, runId)
        : undefined;

      const buildResult = await onBuild(
        workspace,
        workOrder.taskPrompt,
        feedback,
        iteration,
        run.sessionId,
        streamingCallback
      );

      onPhaseEnd?.('build', iteration);

      // Record agent result for metrics (v0.2.5)
      if (buildResult.agentResult) {
        onAgentResult?.(buildResult.agentResult, iteration);

        // Populate iteration data with agent fields (v0.2.19 - Thrust 3)
        iterationData.agentSessionId = buildResult.agentResult.sessionId;
        iterationData.agentDurationMs = buildResult.agentResult.durationMs;
        iterationData.agentSuccess = buildResult.agentResult.success;
        iterationData.agentModel = buildResult.agentResult.model ?? null;
        iterationData.agentTokensUsed = buildResult.agentResult.tokensUsed
          ? buildResult.agentResult.tokensUsed.input + buildResult.agentResult.tokensUsed.output
          : null;
        iterationData.agentCostUsd = buildResult.agentResult.totalCostUsd ?? null;

        // Persist full agent result to disk for debugging (v0.2.19 - Thrust 1)
        try {
          const agentFilePath = await resultPersister.saveAgentResult(runId, iteration, buildResult.agentResult);
          iterationData.agentResultFile = agentFilePath;
        } catch (persistError) {
          log.error({ runId, iteration, error: persistError }, 'Failed to persist agent result');
          // Continue execution - don't fail the run because of persistence issues
        }
      }

      // Store session ID for continuation
      run.sessionId = buildResult.sessionId;
      await saveRun(run);

      if (!buildResult.success) {
        log.warn({ runId, iteration, error: buildResult.error }, 'Build failed');

        // Create structured BuildError (v0.2.19 - Thrust 4)
        const buildError = buildResult.agentResult
          ? ErrorBuilder.fromAgentResult(buildResult.agentResult, runId, iteration)
          : ErrorBuilder.fromSystemError(new Error(buildResult.error ?? 'Build failed'), {
              runId,
              iteration,
              phase: 'build',
            });

        // Set error fields in iteration data (v0.2.19 - Thrust 3)
        iterationData.errorType = buildResult.agentResult?.exitCode === 0
          ? IterationErrorType.AGENT_FAILURE
          : IterationErrorType.AGENT_CRASH;
        iterationData.errorMessage = buildError.message;
        iterationData.errorDetails = {
          buildErrorType: buildError.type,
          exitCode: buildError.exitCode,
          sessionId: buildResult.sessionId,
          context: buildError.context,
        };

        run = applyTransition(run, RunEvent.BUILD_FAILED);
        run.result = RunResult.FAILED_BUILD;
        // Include structured error message (v0.2.19 - Thrust 4)
        run.error = buildError.message;
        await saveRun(run);
        break;
      }

      run = applyTransition(run, RunEvent.BUILD_COMPLETED);
      await saveRun(run);
      onStateChange?.(run);

      // PUSH ITERATION (GitHub integration v0.2.4)
      if (onPushIteration) {
        try {
          const taskSummary = workOrder.taskPrompt.slice(0, 50);
          const commitMessage = `AgentGate iteration ${iteration}: ${taskSummary}...`;
          await onPushIteration(workspace, run, iteration, commitMessage);
          log.debug({ runId, iteration }, 'Iteration pushed to GitHub');
        } catch (pushError) {
          log.warn({ runId, iteration, error: pushError }, 'Failed to push iteration to GitHub');
          // Record warning for visibility (v0.2.10 - Thrust 13)
          run.warnings.push({
            type: 'github_push_failed',
            message: pushError instanceof Error ? pushError.message : String(pushError),
            iteration,
            timestamp: new Date(),
          });
          await saveRun(run);
          // Continue even if push fails - we don't want to fail the run due to GitHub issues
        }
      }

      // SNAPSHOT PHASE
      onPhaseStart?.('snapshot', iteration);
      const snapshot = await onSnapshot(
        workspace,
        beforeState,
        runId,
        iteration,
        workOrder.taskPrompt
      );
      onPhaseEnd?.('snapshot', iteration);
      onSnapshotCaptured?.(snapshot, iteration);

      // Track snapshot for strategy (v0.2.16 - Thrust 9)
      currentSnapshot = snapshot;
      previousSnapshots.push(snapshot);

      iterationData.snapshotId = snapshot.id;
      run.snapshotIds.push(snapshot.id);
      run.snapshotAfterSha = snapshot.afterSha;

      run = applyTransition(run, RunEvent.SNAPSHOT_COMPLETED);
      await saveRun(run);
      onStateChange?.(run);

      // VERIFY PHASE
      onPhaseStart?.('verify', iteration);
      const verificationReport = await onVerify(snapshot, gatePlan, runId, iteration);
      onPhaseEnd?.('verify', iteration);
      onVerificationComplete?.(verificationReport, iteration);
      iterationData.verificationPassed = verificationReport.passed;

      // Populate verification fields in iteration data (v0.2.19 - Thrust 3)
      iterationData.verificationDurationMs = verificationReport.totalDuration;
      const levelsRun: string[] = [];
      if (verificationReport.l0Result?.checks?.length > 0) levelsRun.push('L0');
      if (verificationReport.l1Result?.checks?.length > 0) levelsRun.push('L1');
      if (verificationReport.l2Result?.checks?.length > 0) levelsRun.push('L2');
      if (verificationReport.l3Result?.checks?.length > 0) levelsRun.push('L3');
      iterationData.verificationLevelsRun = levelsRun;

      // Persist verification report (v0.2.19 - Thrust 2)
      try {
        const verificationFilePath = await resultPersister.saveVerificationReport(runId, iteration, verificationReport);
        iterationData.verificationFile = verificationFilePath;
      } catch (persistError) {
        log.error({ runId, iteration, error: persistError }, 'Failed to persist verification report');
        // Continue execution - don't fail the run because of persistence issues
      }

      // Track verification for strategy (v0.2.16 - Thrust 9)
      currentVerification = verificationReport;
      previousVerifications.push(verificationReport);

      if (verificationReport.passed) {
        log.info({ runId, iteration }, 'Verification passed');

        // CREATE PULL REQUEST (GitHub integration v0.2.4)
        if (onCreatePullRequest) {
          try {
            const prResult = await onCreatePullRequest(workspace, run, verificationReport);
            if (prResult) {
              run.gitHubPrUrl = prResult.prUrl;
              run.gitHubPrNumber = prResult.prNumber;
              run = applyTransition(run, RunEvent.PR_CREATED);
              await saveRun(run);
              onStateChange?.(run);
              log.info({ runId, prUrl: prResult.prUrl, prNumber: prResult.prNumber }, 'Pull request created');

              // CI POLLING (Thrust 16)
              if (onPollCI && run.gitHubBranch) {
                const gitHubBranch = run.gitHubBranch; // Store to ensure non-null
                log.info({ runId, branch: gitHubBranch }, 'Starting CI polling');
                run = applyTransition(run, RunEvent.CI_POLLING_STARTED);
                await saveRun(run);
                onStateChange?.(run);

                try {
                  const ciResult = await onPollCI(workspace, run, prResult.prUrl, gitHubBranch);

                  if (ciResult.success) {
                    log.info({ runId }, 'CI checks passed');
                    run = applyTransition(run, RunEvent.CI_PASSED);
                    await saveRun(run);
                    onStateChange?.(run);
                    break;
                  } else {
                    log.warn({ runId }, 'CI checks failed, generating feedback');
                    run = applyTransition(run, RunEvent.CI_FAILED);
                    await saveRun(run);
                    onStateChange?.(run);

                    // Set feedback for next iteration
                    feedback = ciResult.feedback ?? 'CI checks failed. Please review and fix the issues.';

                    // Check if CI retry is enabled and we have more iterations
                    // v0.2.19: ciRetryEnabled config controls whether to retry on CI failure
                    if (!config.verification.ciRetryEnabled || iteration >= run.maxIterations) {
                      const reason = !config.verification.ciRetryEnabled
                        ? 'CI retry disabled'
                        : 'Max iterations reached';
                      log.warn({ runId, iteration, ciRetryEnabled: config.verification.ciRetryEnabled }, `${reason} after CI failure`);
                      run = applyTransition(run, RunEvent.VERIFY_FAILED_TERMINAL);
                      run.result = RunResult.FAILED_VERIFICATION;
                      run.error = `${reason} - CI checks did not pass`;
                      await saveRun(run);
                      onStateChange?.(run);
                      break;
                    }

                    // Continue to next iteration with feedback
                    run.iteration++;
                    await saveRun(run);
                    continue;
                  }
                } catch (ciError) {
                  log.error({ runId, error: ciError }, 'CI polling error');
                  run = applyTransition(run, RunEvent.CI_TIMEOUT);
                  run.result = RunResult.FAILED_ERROR;
                  run.error = ciError instanceof Error ? ciError.message : String(ciError);
                  await saveRun(run);
                  onStateChange?.(run);
                  break;
                }
              } else {
                // No CI polling configured, mark as succeeded
                run = applyTransition(run, RunEvent.VERIFY_PASSED);
                await saveRun(run);
                onStateChange?.(run);
                break;
              }
            } else {
              // PR creation returned null, mark as succeeded without PR
              run = applyTransition(run, RunEvent.VERIFY_PASSED);
              await saveRun(run);
              onStateChange?.(run);
              break;
            }
          } catch (prError) {
            log.warn({ runId, error: prError }, 'Failed to create pull request');
            // Record warning for visibility (v0.2.10 - Thrust 13)
            run.warnings.push({
              type: 'github_pr_creation_failed',
              message: prError instanceof Error ? prError.message : String(prError),
              iteration,
              timestamp: new Date(),
            });
            await saveRun(run);
            // Continue even if PR creation fails - the run still succeeded
            run = applyTransition(run, RunEvent.VERIFY_PASSED);
            await saveRun(run);
            onStateChange?.(run);
            break;
          }
        } else {
          // No PR creation configured, mark as succeeded
          run = applyTransition(run, RunEvent.VERIFY_PASSED);
          await saveRun(run);
          onStateChange?.(run);
          break;
        }
      }

      // Check if local retry is enabled and we have more iterations (strategy may override)
      // v0.2.19: localRetryEnabled config controls whether to retry on L0-L3 verification failure
      let shouldStop = !config.verification.localRetryEnabled || iteration >= run.maxIterations;
      let strategyDecision: LoopDecision | null = null;

      // Consult strategy for continue/stop decision (v0.2.16 - Thrust 9)
      if (loopStrategy && harnessConfig) {
        try {
          const decisionContext = buildLoopContext(
            workOrder.id,
            runId,
            workOrder.taskPrompt,
            harnessConfig,
            loopState,
            currentSnapshot,
            currentVerification,
            previousSnapshots,
            previousVerifications
          );
          strategyDecision = await loopStrategy.shouldContinue(decisionContext);
          log.debug(
            {
              runId,
              iteration,
              shouldContinue: strategyDecision.shouldContinue,
              action: strategyDecision.action,
              reason: strategyDecision.reason,
            },
            'Strategy decision received'
          );

          // Strategy can override max iterations check
          if (!strategyDecision.shouldContinue) {
            shouldStop = true;
          } else if (strategyDecision.action === 'continue') {
            // Strategy says continue even if we hit max iterations
            // (e.g., hybrid strategy giving bonus iterations)
            shouldStop = false;
          }
        } catch (error) {
          log.warn({ error, runId, iteration }, 'Strategy shouldContinue failed, using default logic');
          // Fall back to default max iterations check
        }
      }

      if (shouldStop) {
        // Determine reason for stopping (v0.2.19: localRetryEnabled config)
        const stopReason = !config.verification.localRetryEnabled
          ? 'Local verification retry disabled'
          : 'Max iterations reached';
        log.warn({ runId, iteration, localRetryEnabled: config.verification.localRetryEnabled }, `${stopReason}, verification failed`);

        // Create structured BuildError from verification (v0.2.19 - Thrust 4)
        const verificationError = currentVerification
          ? ErrorBuilder.fromVerificationReport(currentVerification, runId, iteration)
          : null;

        // Set error fields in iteration data (v0.2.19 - Thrust 3)
        const defaultErrorMessage = !config.verification.localRetryEnabled
          ? 'Local verification retry disabled - verification failed on first attempt'
          : 'Max iterations reached without passing verification';
        iterationData.errorType = IterationErrorType.VERIFICATION_FAILED;
        iterationData.errorMessage = verificationError?.message ??
          strategyDecision?.reason ??
          defaultErrorMessage;
        iterationData.errorDetails = {
          buildErrorType: verificationError?.type,
          iteration,
          maxIterations: run.maxIterations,
          strategyAction: strategyDecision?.action,
          context: verificationError?.context,
        };

        // Notify strategy of loop end (v0.2.16 - Thrust 9)
        if (loopStrategy && harnessConfig && strategyDecision) {
          try {
            const endContext = buildLoopContext(
              workOrder.id,
              runId,
              workOrder.taskPrompt,
              harnessConfig,
              loopState,
              currentSnapshot,
              currentVerification,
              previousSnapshots,
              previousVerifications
            );
            await loopStrategy.onLoopEnd(endContext, strategyDecision);
          } catch (error) {
            log.warn({ error, runId }, 'Strategy onLoopEnd failed');
          }
        }

        run = applyTransition(run, RunEvent.VERIFY_FAILED_TERMINAL);
        run.result = RunResult.FAILED_VERIFICATION;
        // Use structured error message (v0.2.19 - Thrust 4)
        run.error = verificationError?.message ??
          strategyDecision?.reason ??
          defaultErrorMessage;
        await saveRun(run);
        onStateChange?.(run);
        break;
      }

      // Still have iterations left - generate feedback
      log.info({ runId, iteration }, 'Verification failed, generating feedback');
      run = applyTransition(run, RunEvent.VERIFY_FAILED_RETRYABLE);
      await saveRun(run);
      onStateChange?.(run);

      // FEEDBACK PHASE
      onPhaseStart?.('feedback', iteration);
      feedback = await onFeedback(snapshot, verificationReport, gatePlan);
      onPhaseEnd?.('feedback', iteration);
      iterationData.feedbackGenerated = true;

      run = applyTransition(run, RunEvent.FEEDBACK_GENERATED);
      run.iteration++;
      await saveRun(run);
      onStateChange?.(run);

      // Update iteration data
      iterationData.completedAt = new Date();
      iterationData.durationMs = Date.now() - iterationStart;
      await saveIterationData(runId, iteration, iterationData);
      onIterationComplete?.(run, iterationData);

      // Notify strategy of iteration end (v0.2.16 - Thrust 9)
      if (loopStrategy && harnessConfig && strategyDecision) {
        try {
          const iterEndContext = buildLoopContext(
            workOrder.id,
            runId,
            workOrder.taskPrompt,
            harnessConfig,
            loopState,
            currentSnapshot,
            currentVerification,
            previousSnapshots,
            previousVerifications
          );
          await loopStrategy.onIterationEnd(iterEndContext, strategyDecision);

          // Update loop state with iteration history
          loopState.progress.lastIterationAt = new Date();
          loopState.lastDecision = strategyDecision;
        } catch (error) {
          log.warn({ error, runId, iteration }, 'Strategy onIterationEnd failed');
        }
      }

      // Update before state for next iteration
      beforeState = {
        sha: snapshot.afterSha,
        branch: beforeState.branch,
        isDirty: false,
        capturedAt: new Date(),
      };
    } catch (error) {
      log.error({ error, runId, iteration }, 'Iteration failed with error');

      // Create structured BuildError (v0.2.19 - Thrust 4)
      const systemError = ErrorBuilder.fromSystemError(error, {
        runId,
        iteration,
        phase: run.state,
      });

      // Set error fields in iteration data (v0.2.19 - Thrust 3)
      iterationData.errorType = IterationErrorType.SYSTEM_ERROR;
      iterationData.errorMessage = systemError.message;
      iterationData.errorDetails = {
        buildErrorType: systemError.type,
        errorName: error instanceof Error ? error.name : 'Unknown',
        context: systemError.context,
      };

      run = applyTransition(run, RunEvent.SYSTEM_ERROR);
      run.result = RunResult.FAILED_ERROR;
      // Use structured error message (v0.2.19 - Thrust 4)
      run.error = systemError.message;
      await saveRun(run);
      onStateChange?.(run);

      // Save final iteration state
      iterationData.completedAt = new Date();
      iterationData.durationMs = Date.now() - iterationStart;
      await saveIterationData(runId, iteration, iterationData);
      break;
    }
  }

  // Clean up lease renewal interval (v0.2.10 - Thrust 12)
  if (renewalInterval) {
    clearInterval(renewalInterval);
    log.debug({ runId }, 'Lease renewal interval cleared');
  }

  log.info(
    {
      runId,
      state: run.state,
      result: run.result,
      iterations: run.iteration,
      durationMs: Date.now() - run.startedAt.getTime(),
    },
    'Run execution complete'
  );

  return run;
}

/**
 * Cancel a run.
 */
export async function cancelRun(run: Run): Promise<Run> {
  if (isTerminalState(run.state)) {
    log.warn({ runId: run.id, state: run.state }, 'Cannot cancel run in terminal state');
    return run;
  }

  log.info({ runId: run.id }, 'Canceling run');

  const updatedRun = applyTransition(run, RunEvent.USER_CANCELED);
  await saveRun(updatedRun);

  return updatedRun;
}

// ==========================================================================
// Streaming Event Helpers (v0.2.11 - Thrust 4)
// ==========================================================================

/**
 * Throttling state for output events
 */
interface ThrottleState {
  lastOutputTime: number;
  pendingToolCalls: ParsedEvent[];
  batchTimeout: NodeJS.Timeout | null;
}

/** Minimum interval between output events (ms) */
const OUTPUT_DEBOUNCE_MS = 100;

/** Batch window for rapid tool calls (ms) */
const TOOL_CALL_BATCH_WINDOW_MS = 50;

/**
 * Create a streaming callback that emits events to the broadcaster.
 * Implements throttling for high-frequency events.
 */
function createStreamingCallback(
  broadcaster: EventBroadcaster,
  _workOrderId: string,
  _runId: string
): StreamingEventCallback {
  const throttleState: ThrottleState = {
    lastOutputTime: 0,
    pendingToolCalls: [],
    batchTimeout: null,
  };

  return (event: ParsedEvent): void => {
    switch (event.type) {
      case 'agent_tool_call':
        // Batch rapid tool calls
        throttleState.pendingToolCalls.push(event);

        if (!throttleState.batchTimeout) {
          throttleState.batchTimeout = setTimeout(() => {
            // Emit all batched tool calls
            for (const toolCallEvent of throttleState.pendingToolCalls) {
              if (toolCallEvent.type === 'agent_tool_call') {
                broadcaster.emitAgentToolCall(
                  toolCallEvent.workOrderId,
                  toolCallEvent.runId,
                  toolCallEvent.toolUseId,
                  toolCallEvent.tool,
                  toolCallEvent.input
                );
              }
            }
            throttleState.pendingToolCalls = [];
            throttleState.batchTimeout = null;
          }, TOOL_CALL_BATCH_WINDOW_MS);
        }
        break;

      case 'agent_tool_result':
        // Tool results are not throttled (important for completion tracking)
        broadcaster.emitAgentToolResult(
          event.workOrderId,
          event.runId,
          event.toolUseId,
          event.success,
          event.contentPreview,
          event.contentLength,
          event.durationMs
        );
        break;

      case 'agent_output': {
        // Debounce output events
        const now = Date.now();
        if (now - throttleState.lastOutputTime >= OUTPUT_DEBOUNCE_MS) {
          broadcaster.emitAgentOutput(
            event.workOrderId,
            event.runId,
            event.content
          );
          throttleState.lastOutputTime = now;
        }
        break;
      }

      case 'progress_update':
        // Progress updates are not throttled (already controlled by interval)
        broadcaster.emitProgressUpdate(
          event.workOrderId,
          event.runId,
          event.percentage,
          event.currentPhase,
          event.toolCallCount,
          event.elapsedSeconds,
          event.estimatedRemainingSeconds
        );
        break;

      default:
        // Log unknown event types but don't fail
        log.debug({ eventType: (event as ParsedEvent).type }, 'Unknown streaming event type');
    }
  };
}
