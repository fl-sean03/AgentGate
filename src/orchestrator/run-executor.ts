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
  RunEvent,
  RunResult,
} from '../types/index.js';
import {
  applyTransition,
  isTerminalState,
} from './state-machine.js';
import { saveRun, saveIterationData, createRun } from './run-store.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('run-executor');

/**
 * Options for run execution.
 */
export interface RunExecutorOptions {
  workOrder: WorkOrder;
  workspace: Workspace;
  gatePlan: GatePlan;

  // Callbacks for each phase
  onBuild: (
    workspace: Workspace,
    taskPrompt: string,
    feedback: string | null,
    iteration: number,
    sessionId: string | null
  ) => Promise<{ sessionId: string; success: boolean; error?: string }>;

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
  onStateChange?: (run: Run) => void;
  onIterationComplete?: (run: Run, iteration: IterationData) => void;

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
    onBuild,
    onSnapshot,
    onVerify,
    onFeedback,
    onCaptureBeforeState,
    onStateChange,
    onIterationComplete,
    onPushIteration,
    onCreatePullRequest,
  } = options;

  const runId = randomUUID();
  let run = createRun(runId, workOrder.id, workspace.id, workOrder.maxIterations);

  log.info(
    {
      runId,
      workOrderId: workOrder.id,
      workspaceId: workspace.id,
      maxIterations: workOrder.maxIterations,
    },
    'Starting run execution'
  );

  // Save initial state
  await saveRun(run);
  onStateChange?.(run);

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

  // Main iteration loop
  let feedback: string | null = null;

  while (!isTerminalState(run.state)) {
    const iterationStart = Date.now();
    const iteration = run.iteration;

    log.info({ runId, iteration, maxIterations: run.maxIterations }, 'Starting iteration');

    // Create iteration tracking
    const iterationData: IterationData = {
      iteration,
      state: run.state,
      snapshotId: null,
      verificationPassed: null,
      feedbackGenerated: false,
      startedAt: new Date(),
      completedAt: null,
      durationMs: null,
    };

    try {
      // BUILD PHASE
      run = applyTransition(run, RunEvent.BUILD_STARTED);
      await saveRun(run);
      onStateChange?.(run);

      const buildResult = await onBuild(
        workspace,
        workOrder.taskPrompt,
        feedback,
        iteration,
        run.sessionId
      );

      // Store session ID for continuation
      run.sessionId = buildResult.sessionId;
      await saveRun(run);

      if (!buildResult.success) {
        log.warn({ runId, iteration, error: buildResult.error }, 'Build failed');
        run = applyTransition(run, RunEvent.BUILD_FAILED);
        run.result = RunResult.FAILED_BUILD;
        run.error = buildResult.error ?? 'Build failed';
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
          // Continue even if push fails - we don't want to fail the run due to GitHub issues
        }
      }

      // SNAPSHOT PHASE
      const snapshot = await onSnapshot(
        workspace,
        beforeState,
        runId,
        iteration,
        workOrder.taskPrompt
      );

      iterationData.snapshotId = snapshot.id;
      run.snapshotIds.push(snapshot.id);
      run.snapshotAfterSha = snapshot.afterSha;

      run = applyTransition(run, RunEvent.SNAPSHOT_COMPLETED);
      await saveRun(run);
      onStateChange?.(run);

      // VERIFY PHASE
      const verificationReport = await onVerify(snapshot, gatePlan, runId, iteration);
      iterationData.verificationPassed = verificationReport.passed;

      if (verificationReport.passed) {
        log.info({ runId, iteration }, 'Verification passed');
        run = applyTransition(run, RunEvent.VERIFY_PASSED);
        await saveRun(run);
        onStateChange?.(run);

        // CREATE PULL REQUEST (GitHub integration v0.2.4)
        if (onCreatePullRequest) {
          try {
            const prResult = await onCreatePullRequest(workspace, run, verificationReport);
            if (prResult) {
              run.gitHubPrUrl = prResult.prUrl;
              run.gitHubPrNumber = prResult.prNumber;
              await saveRun(run);
              log.info({ runId, prUrl: prResult.prUrl, prNumber: prResult.prNumber }, 'Pull request created');
            }
          } catch (prError) {
            log.warn({ runId, error: prError }, 'Failed to create pull request');
            // Continue even if PR creation fails - the run still succeeded
          }
        }

        break;
      }

      // Check if we have more iterations
      if (iteration >= run.maxIterations) {
        log.warn({ runId, iteration }, 'Max iterations reached, verification failed');
        run = applyTransition(run, RunEvent.VERIFY_FAILED_TERMINAL);
        run.result = RunResult.FAILED_VERIFICATION;
        run.error = 'Max iterations reached without passing verification';
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
      feedback = await onFeedback(snapshot, verificationReport, gatePlan);
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

      // Update before state for next iteration
      beforeState = {
        sha: snapshot.afterSha,
        branch: beforeState.branch,
        isDirty: false,
        capturedAt: new Date(),
      };
    } catch (error) {
      log.error({ error, runId, iteration }, 'Iteration failed with error');
      run = applyTransition(run, RunEvent.SYSTEM_ERROR);
      run.result = RunResult.FAILED_ERROR;
      run.error = error instanceof Error ? error.message : String(error);
      await saveRun(run);
      onStateChange?.(run);

      // Save final iteration state
      iterationData.completedAt = new Date();
      iterationData.durationMs = Date.now() - iterationStart;
      await saveIterationData(runId, iteration, iterationData);
      break;
    }
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
