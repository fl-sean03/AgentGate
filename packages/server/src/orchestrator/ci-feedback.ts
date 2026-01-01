/**
 * CI Feedback Generator Module
 *
 * Creates actionable feedback for agents from CI failures.
 * Connects the CI monitoring system to the orchestrator's feedback loop.
 */

import { createLogger } from '../utils/logger.js';
import {
  type MonitorResult,
  type WorkflowRunResult,
  LogDownloader,
  FailureSummarizer,
  type CISummary,
  type JobLogs,
} from '../github/index.js';

const logger = createLogger('ci-feedback');

// ============================================================================
// Types
// ============================================================================

/** CI feedback object for agent consumption */
export interface CIFeedback {
  /** Feedback type identifier */
  type: 'ci_failure';
  /** Workflow run ID */
  workflowRunId: number;
  /** PR number if available */
  prNumber: number | null;
  /** Full CI summary */
  summary: CISummary;
  /** Formatted markdown prompt for agent */
  prompt: string;
  /** Number of previous CI remediation attempts */
  previousAttempts: number;
  /** URL to the workflow run */
  workflowUrl: string | null;
}

/** Options for feedback generation */
export interface CIFeedbackGeneratorOptions {
  /** Maximum number of logs to download per run */
  maxLogsPerRun?: number;
  /** Whether to strip ANSI codes from logs */
  stripAnsi?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OPTIONS: Required<CIFeedbackGeneratorOptions> = {
  maxLogsPerRun: 5,
  stripAnsi: true,
};

// ============================================================================
// CI Feedback Generator
// ============================================================================

/**
 * Generates actionable feedback for agents from CI failures
 */
export class CIFeedbackGenerator {
  private readonly logDownloader: LogDownloader;
  private readonly failureSummarizer: FailureSummarizer;
  private readonly options: Required<CIFeedbackGeneratorOptions>;

  constructor(
    logDownloader: LogDownloader,
    failureSummarizer?: FailureSummarizer,
    options?: CIFeedbackGeneratorOptions
  ) {
    this.logDownloader = logDownloader;
    this.failureSummarizer = failureSummarizer ?? new FailureSummarizer();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Generate feedback from a CI monitor result
   *
   * @param monitorResult - Result from WorkflowMonitor
   * @param branchName - Branch name for instructions
   * @param prNumber - PR number if available
   * @param previousAttempts - Number of previous CI fix attempts
   * @returns CI feedback object
   */
  async generateFeedback(
    monitorResult: MonitorResult,
    branchName: string,
    prNumber: number | null,
    previousAttempts: number
  ): Promise<CIFeedback> {
    logger.info(
      {
        overallStatus: monitorResult.overallStatus,
        runCount: monitorResult.runs.length,
        branchName,
        previousAttempts,
      },
      'Generating CI feedback'
    );

    // Get the first failed run for primary context
    const failedRun = monitorResult.runs.find((r) => r.status === 'failure');

    if (!failedRun) {
      logger.warn('No failed runs found, creating minimal feedback');
      return this.createMinimalFeedback(
        monitorResult,
        branchName,
        prNumber,
        previousAttempts
      );
    }

    // Download logs for failed jobs
    const logs = await this.downloadFailedJobLogs(failedRun);

    // Generate summary from logs
    const summary = this.failureSummarizer.summarize(monitorResult, logs);

    // Format prompt for agent
    const prompt = this.formatForAgent(summary, branchName, previousAttempts);

    const feedback: CIFeedback = {
      type: 'ci_failure',
      workflowRunId: failedRun.runId,
      prNumber,
      summary,
      prompt,
      previousAttempts,
      workflowUrl: failedRun.url,
    };

    logger.debug(
      {
        workflowRunId: feedback.workflowRunId,
        actionItemCount: summary.actionItems.length,
        failedJobCount: summary.failedJobs,
      },
      'CI feedback generated'
    );

    return feedback;
  }

  /**
   * Format CI summary as a markdown prompt for the agent
   *
   * @param summary - CI failure summary
   * @param branchName - Branch to push to
   * @param previousAttempts - Number of previous fix attempts
   * @returns Formatted markdown string
   */
  formatForAgent(
    summary: CISummary,
    branchName: string,
    previousAttempts: number
  ): string {
    const parts: string[] = [];

    // Header
    parts.push('## Previous CI Failure\n');
    parts.push("Your last commit triggered GitHub Actions CI but it failed.\n");

    // Attempt counter if relevant
    if (previousAttempts > 0) {
      parts.push(`> **Note:** This is CI fix attempt ${previousAttempts + 1}.\n`);
    }

    // Include the markdown summary (without the header, since we added our own)
    const summaryMarkdown = summary.markdown
      .replace(/^# CI Failure Report\n+/, '')
      .trim();
    parts.push(summaryMarkdown);
    parts.push('');

    // Instructions section
    parts.push('## Instructions\n');
    parts.push('1. Fix the issues identified above');
    parts.push('2. Run `pnpm test` locally to verify');
    parts.push('3. Commit your fixes');
    parts.push(`4. Push to the branch: \`${branchName}\``);
    parts.push('');
    parts.push('Do NOT create a new PR. Push to the existing branch to trigger new CI checks.');
    parts.push('');

    return parts.join('\n');
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Download logs for failed jobs in a workflow run
   */
  private async downloadFailedJobLogs(run: WorkflowRunResult): Promise<JobLogs> {
    const logs: JobLogs = new Map();

    if (run.failedJobs.length === 0) {
      logger.debug({ runId: run.runId }, 'No failed jobs to download logs for');
      return logs;
    }

    try {
      // Download all logs for the run
      const allLogs = await this.logDownloader.downloadLogs(run.runId, {
        stripAnsi: this.options.stripAnsi,
      });

      // Filter to only failed jobs (up to the limit)
      const failedJobNames = run.failedJobs
        .slice(0, this.options.maxLogsPerRun)
        .map((j) => j.jobName);

      for (const jobName of failedJobNames) {
        // Try to find matching log
        for (const [logJobName, content] of allLogs) {
          if (
            logJobName === jobName ||
            logJobName.toLowerCase() === jobName.toLowerCase() ||
            logJobName.toLowerCase().includes(jobName.toLowerCase())
          ) {
            logs.set(jobName, content);
            break;
          }
        }
      }

      logger.debug(
        {
          runId: run.runId,
          requestedJobs: failedJobNames.length,
          foundLogs: logs.size,
        },
        'Downloaded logs for failed jobs'
      );
    } catch (error) {
      logger.warn(
        { runId: run.runId, err: error },
        'Failed to download logs, proceeding without detailed log content'
      );
    }

    return logs;
  }

  /**
   * Create minimal feedback when no failed runs are found
   */
  private createMinimalFeedback(
    monitorResult: MonitorResult,
    branchName: string,
    prNumber: number | null,
    previousAttempts: number
  ): CIFeedback {
    const summary: CISummary = {
      overallStatus: monitorResult.overallStatus === 'success' ? 'success' : 'failure',
      totalJobs: monitorResult.runs.length,
      failedJobs: monitorResult.runs.filter((r) => r.status === 'failure').length,
      jobSummaries: [],
      actionItems: [],
      markdown: this.createMinimalMarkdown(monitorResult),
    };

    const prompt = this.formatForAgent(summary, branchName, previousAttempts);

    return {
      type: 'ci_failure',
      workflowRunId: monitorResult.runs[0]?.runId ?? 0,
      prNumber,
      summary,
      prompt,
      previousAttempts,
      workflowUrl: monitorResult.runs[0]?.url ?? null,
    };
  }

  /**
   * Create minimal markdown when detailed logs aren't available
   */
  private createMinimalMarkdown(monitorResult: MonitorResult): string {
    const parts: string[] = [];
    parts.push('# CI Failure Report\n');
    parts.push('## Summary\n');

    if (monitorResult.timedOut) {
      parts.push('- **Status:** Timed Out');
      parts.push('- The CI workflow took too long to complete.');
    } else if (monitorResult.overallStatus === 'cancelled') {
      parts.push('- **Status:** Cancelled');
      parts.push('- The CI workflow was cancelled.');
    } else {
      parts.push('- **Status:** Failed');
      parts.push('- Unable to retrieve detailed failure information.');
      parts.push('- Please check the GitHub Actions page for more details.');
    }

    parts.push('');

    // List run URLs
    if (monitorResult.runs.length > 0) {
      parts.push('## Workflow Runs\n');
      for (const run of monitorResult.runs) {
        parts.push(`- [${run.workflowName}](${run.url}) - ${run.status}`);
      }
      parts.push('');
    }

    parts.push('## Instructions\n');
    parts.push('Please check the workflow run logs on GitHub and fix any issues.');

    return parts.join('\n');
  }
}
