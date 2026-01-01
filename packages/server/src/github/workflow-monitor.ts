/**
 * Workflow Run Monitor
 *
 * Polls GitHub Actions for workflow run status and detects completion.
 * Supports multiple concurrent workflows and provides progress callbacks.
 */

import { ActionsClient, type WorkflowRun, type WorkflowJob } from './actions-client.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('workflow-monitor');

// ============================================================================
// Types
// ============================================================================

/** Monitor event types */
export type MonitorEventType =
  | 'workflow_detected'
  | 'workflow_status_changed'
  | 'polling'
  | 'completed';

/** Progress event data */
export interface MonitorProgressEvent {
  event: MonitorEventType;
  data: {
    runs?: WorkflowRunResult[];
    run?: WorkflowRunResult;
    previousStatus?: string;
    newStatus?: string;
    completedCount?: number;
    totalCount?: number;
  };
  elapsed: number;
}

/** Callback for progress updates */
export type MonitorProgressCallback = (event: MonitorProgressEvent) => void;

/** Monitor configuration options */
export interface MonitorOptions {
  /** Polling interval in milliseconds (default: 30000) */
  pollIntervalMs?: number;
  /** Maximum wait time in milliseconds (default: 1800000 = 30 min) */
  timeoutMs?: number;
  /** Initial wait time for workflows to be detected (default: 10000) */
  initialWaitMs?: number;
  /** Progress callback */
  onProgress?: MonitorProgressCallback;
}

/** Failed job information */
export interface FailedJobInfo {
  jobName: string;
  failedStep: string | null;
  conclusion: string;
}

/** Individual workflow run result */
export interface WorkflowRunResult {
  workflowName: string;
  runId: number;
  status: 'success' | 'failure' | 'cancelled' | 'skipped' | 'in_progress' | 'queued';
  url: string;
  failedJobs: FailedJobInfo[];
  jobs?: WorkflowJob[];
}

/** Overall monitor result */
export interface MonitorResult {
  overallStatus: 'success' | 'failure' | 'timeout' | 'cancelled';
  runs: WorkflowRunResult[];
  durationMs: number;
  timedOut: boolean;
}

// ============================================================================
// Workflow Monitor
// ============================================================================

const DEFAULT_OPTIONS: Required<Omit<MonitorOptions, 'onProgress'>> = {
  pollIntervalMs: 30_000,
  timeoutMs: 30 * 60 * 1000, // 30 minutes
  initialWaitMs: 10_000,
};

/**
 * Monitors GitHub Actions workflow runs until completion
 */
export class WorkflowMonitor {
  private readonly client: ActionsClient;
  private readonly options: Required<Omit<MonitorOptions, 'onProgress'>> & {
    onProgress?: MonitorProgressCallback;
  };
  private cancelled = false;
  private abortController: AbortController | null = null;

  constructor(client: ActionsClient, options?: MonitorOptions) {
    this.client = client;
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  /**
   * Wait for all workflows to complete for a branch or commit SHA
   *
   * @param branchOrSha - Branch name or commit SHA to monitor
   * @param signal - Optional AbortSignal for cancellation
   * @returns Monitor result with all run details
   */
  async waitForCompletion(branchOrSha: string, signal?: AbortSignal): Promise<MonitorResult> {
    this.cancelled = false;
    this.abortController = new AbortController();

    const startTime = Date.now();
    const trackedRuns = new Map<number, WorkflowRunResult>();

    // Combine external signal with internal abort controller
    const combinedSignal = signal
      ? this.combineSignals(signal, this.abortController.signal)
      : this.abortController.signal;

    try {
      // Initial wait for workflows to be detected
      logger.debug({ initialWaitMs: this.options.initialWaitMs }, 'Waiting for workflows to be detected');
      await this.delay(this.options.initialWaitMs, combinedSignal);

      if (this.cancelled || combinedSignal.aborted) {
        return this.createCancelledResult(trackedRuns, startTime);
      }

      // Main polling loop
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (this.cancelled || combinedSignal.aborted) {
          return this.createCancelledResult(trackedRuns, startTime);
        }

        // Check timeout
        const elapsed = Date.now() - startTime;
        if (elapsed >= this.options.timeoutMs) {
          logger.warn({ elapsed, timeout: this.options.timeoutMs }, 'Monitoring timed out');
          return this.createTimeoutResult(trackedRuns, startTime);
        }

        // Find workflow runs
        const runs = await this.findWorkflowRuns(branchOrSha);

        // Update tracked runs
        for (const run of runs) {
          const existingRun = trackedRuns.get(run.id);
          const runResult = await this.mapRunToResult(run);

          if (!existingRun) {
            // New run detected
            trackedRuns.set(run.id, runResult);
            this.emitEvent('workflow_detected', { run: runResult }, startTime);
          } else if (existingRun.status !== runResult.status) {
            // Status changed
            this.emitEvent(
              'workflow_status_changed',
              {
                run: runResult,
                previousStatus: existingRun.status,
                newStatus: runResult.status,
              },
              startTime
            );
            trackedRuns.set(run.id, runResult);
          }
        }

        // Check if all runs are complete
        const allRuns = Array.from(trackedRuns.values());
        const completedRuns = allRuns.filter(
          (r) => r.status !== 'in_progress' && r.status !== 'queued'
        );

        this.emitEvent(
          'polling',
          {
            runs: allRuns,
            completedCount: completedRuns.length,
            totalCount: allRuns.length,
          },
          startTime
        );

        // If we have runs and all are complete, we're done
        if (allRuns.length > 0 && completedRuns.length === allRuns.length) {
          const result = this.createCompletedResult(trackedRuns, startTime);
          this.emitEvent('completed', { runs: result.runs }, startTime);
          return result;
        }

        // Wait before next poll
        await this.delay(this.options.pollIntervalMs, combinedSignal);
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Get the current status of workflows for a branch or commit
   */
  async getLatestRunStatus(branchOrSha: string): Promise<WorkflowRunResult[]> {
    const runs = await this.findWorkflowRuns(branchOrSha);
    const results: WorkflowRunResult[] = [];

    for (const run of runs) {
      results.push(await this.mapRunToResult(run));
    }

    return results;
  }

  /**
   * Cancel ongoing monitoring
   */
  cancel(): void {
    this.cancelled = true;
    this.abortController?.abort();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async findWorkflowRuns(branchOrSha: string): Promise<WorkflowRun[]> {
    // Try SHA first (40 char hex)
    if (/^[0-9a-f]{40}$/i.test(branchOrSha)) {
      return this.client.getWorkflowRunsForCommit(branchOrSha);
    }

    // Otherwise search by branch
    const runs = await this.client.listWorkflowRuns({ branch: branchOrSha });

    // Filter to most recent attempt for each workflow
    const latestByWorkflow = new Map<number, WorkflowRun>();
    for (const run of runs) {
      const existing = latestByWorkflow.get(run.workflow_id);
      if (
        !existing ||
        new Date(run.created_at).getTime() > new Date(existing.created_at).getTime()
      ) {
        latestByWorkflow.set(run.workflow_id, run);
      }
    }

    return Array.from(latestByWorkflow.values());
  }

  private async mapRunToResult(run: WorkflowRun): Promise<WorkflowRunResult> {
    let status: WorkflowRunResult['status'];

    if (run.status === 'completed') {
      switch (run.conclusion) {
        case 'success':
          status = 'success';
          break;
        case 'failure':
          status = 'failure';
          break;
        case 'cancelled':
          status = 'cancelled';
          break;
        case 'skipped':
          status = 'skipped';
          break;
        default:
          status = 'failure'; // timed_out and other conclusions treated as failure
      }
    } else if (run.status === 'in_progress') {
      status = 'in_progress';
    } else {
      status = 'queued';
    }

    const result: WorkflowRunResult = {
      workflowName: run.name ?? `Workflow ${run.workflow_id}`,
      runId: run.id,
      status,
      url: run.html_url,
      failedJobs: [],
    };

    // Get failed jobs if the run failed
    if (status === 'failure') {
      try {
        const jobs = await this.client.getWorkflowRunJobs(run.id);
        result.jobs = jobs;
        result.failedJobs = jobs
          .filter((job) => job.conclusion === 'failure')
          .map((job) => {
            const failedStep = job.steps.find((step) => step.conclusion === 'failure');
            return {
              jobName: job.name,
              failedStep: failedStep?.name ?? null,
              conclusion: job.conclusion ?? 'failure',
            };
          });
      } catch (error) {
        logger.warn({ runId: run.id, err: error }, 'Failed to get jobs for failed run');
      }
    }

    return result;
  }

  private createCompletedResult(
    trackedRuns: Map<number, WorkflowRunResult>,
    startTime: number
  ): MonitorResult {
    const runs = Array.from(trackedRuns.values());
    const anyFailed = runs.some((r) => r.status === 'failure');

    return {
      overallStatus: anyFailed ? 'failure' : 'success',
      runs,
      durationMs: Date.now() - startTime,
      timedOut: false,
    };
  }

  private createTimeoutResult(
    trackedRuns: Map<number, WorkflowRunResult>,
    startTime: number
  ): MonitorResult {
    return {
      overallStatus: 'timeout',
      runs: Array.from(trackedRuns.values()),
      durationMs: Date.now() - startTime,
      timedOut: true,
    };
  }

  private createCancelledResult(
    trackedRuns: Map<number, WorkflowRunResult>,
    startTime: number
  ): MonitorResult {
    return {
      overallStatus: 'cancelled',
      runs: Array.from(trackedRuns.values()),
      durationMs: Date.now() - startTime,
      timedOut: false,
    };
  }

  private emitEvent(
    event: MonitorEventType,
    data: MonitorProgressEvent['data'],
    startTime: number
  ): void {
    if (this.options.onProgress) {
      this.options.onProgress({
        event,
        data,
        elapsed: Date.now() - startTime,
      });
    }
  }

  private async delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);

      if (signal) {
        if (signal.aborted) {
          clearTimeout(timeout);
          resolve();
          return;
        }

        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
      }
    });
  }

  private combineSignals(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();

    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        return controller.signal;
      }

      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    return controller.signal;
  }
}
