/**
 * CI Feedback Generator
 *
 * Connects CI monitoring system to the orchestrator's feedback loop.
 * Generates agent-consumable feedback from CI failures to enable remediation.
 */

import type { WorkflowMonitor, MonitorResult, WorkflowRunResult } from '../github/workflow-monitor.js';
import type { LogDownloader, JobLogs } from '../github/log-downloader.js';
import { FailureSummarizer, type CISummary } from '../github/failure-summarizer.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ci-feedback');

// ============================================================================
// Types
// ============================================================================

/**
 * CI feedback object for agent consumption
 */
export interface CIFeedback {
  /** Type of feedback */
  type: 'ci_failure';
  /** Workflow run ID */
  workflowRunId: number | null;
  /** PR number */
  prNumber: number;
  /** Parsed summary of CI failures */
  summary: CISummary;
  /** Formatted prompt for the agent */
  prompt: string;
  /** Number of previous CI remediation attempts */
  previousAttempts: number;
  /** Branch name to push to */
  branchName: string;
  /** URLs to workflow runs */
  workflowUrls: string[];
}

/**
 * Options for generating feedback
 */
export interface GenerateFeedbackOptions {
  /** PR number for context */
  prNumber: number;
  /** Branch name for push instructions */
  branchName: string;
  /** Number of previous CI remediation attempts */
  previousAttempts: number;
  /** Maximum CI iterations allowed */
  maxCiIterations: number;
}

/**
 * Configuration for CIFeedbackGenerator
 */
export interface CIFeedbackGeneratorConfig {
  /** Maximum log snippet length in characters */
  maxLogSnippetLength?: number;
  /** Include full log context in feedback */
  includeFullContext?: boolean;
}

// ============================================================================
// CI Feedback Generator
// ============================================================================

/**
 * Generates feedback from CI failures for agent remediation.
 */
export class CIFeedbackGenerator {
  private readonly workflowMonitor: WorkflowMonitor;
  private readonly logDownloader: LogDownloader;
  private readonly failureSummarizer: FailureSummarizer;
  private readonly config: Required<CIFeedbackGeneratorConfig>;

  constructor(
    workflowMonitor: WorkflowMonitor,
    logDownloader: LogDownloader,
    failureSummarizer?: FailureSummarizer,
    config?: CIFeedbackGeneratorConfig
  ) {
    this.workflowMonitor = workflowMonitor;
    this.logDownloader = logDownloader;
    this.failureSummarizer = failureSummarizer ?? new FailureSummarizer();
    this.config = {
      maxLogSnippetLength: config?.maxLogSnippetLength ?? 5000,
      includeFullContext: config?.includeFullContext ?? true,
    };
  }

  /**
   * Generate feedback from a monitor result.
   *
   * Downloads logs for failed jobs, parses and summarizes failures,
   * and formats as an agent-consumable prompt.
   */
  async generateFeedback(
    monitorResult: MonitorResult,
    options: GenerateFeedbackOptions
  ): Promise<CIFeedback> {
    log.info(
      {
        overallStatus: monitorResult.overallStatus,
        runCount: monitorResult.runs.length,
        prNumber: options.prNumber,
        previousAttempts: options.previousAttempts,
      },
      'Generating CI feedback from monitor result'
    );

    // Download logs for failed runs
    const logs = await this.downloadFailedLogs(monitorResult.runs);

    // Generate summary using the failure summarizer
    const summary = this.failureSummarizer.summarize(monitorResult, logs);

    // Get workflow URLs for reference
    const workflowUrls = monitorResult.runs.map((r) => r.url);

    // Get the first workflow run ID for reference
    const workflowRunId = monitorResult.runs[0]?.runId ?? null;

    // Format the feedback for the agent
    const prompt = this.formatForAgent(summary, options);

    const feedback: CIFeedback = {
      type: 'ci_failure',
      workflowRunId,
      prNumber: options.prNumber,
      summary,
      prompt,
      previousAttempts: options.previousAttempts,
      branchName: options.branchName,
      workflowUrls,
    };

    log.info(
      {
        actionItemCount: summary.actionItems.length,
        failedJobs: summary.failedJobs,
        promptLength: prompt.length,
      },
      'CI feedback generated'
    );

    return feedback;
  }

  /**
   * Format a CI summary for agent consumption.
   *
   * Creates a markdown prompt with:
   * - CI failure summary
   * - File references
   * - Fix instructions
   * - Push instructions
   */
  formatForAgent(summary: CISummary, options: GenerateFeedbackOptions): string {
    const parts: string[] = [];

    // Header
    parts.push('## Previous CI Failure\n');
    parts.push('Your last commit triggered GitHub Actions CI but it failed.\n');

    // Attempt counter
    if (options.previousAttempts > 0) {
      const remaining = options.maxCiIterations - options.previousAttempts - 1;
      parts.push(`**Note:** This is CI remediation attempt ${options.previousAttempts + 1} of ${options.maxCiIterations}.`);
      if (remaining <= 1) {
        parts.push(`**Warning:** Only ${remaining} attempt(s) remaining before the run fails.\n`);
      } else {
        parts.push('');
      }
    }

    // Include the markdown summary from FailureSummarizer
    parts.push(summary.markdown);

    // Instructions
    parts.push('\n## Instructions\n');
    parts.push('1. Fix the issues identified above');
    parts.push('2. Run `pnpm test` locally to verify');
    parts.push('3. Commit your fixes');
    parts.push(`4. Push to the branch: \`${options.branchName}\`\n`);
    parts.push('**IMPORTANT:** Do NOT create a new PR. Push to the existing branch to trigger new CI checks.');

    return parts.join('\n');
  }

  /**
   * Get a reference to the workflow monitor for external use.
   */
  getWorkflowMonitor(): WorkflowMonitor {
    return this.workflowMonitor;
  }

  /**
   * Get a reference to the log downloader for external use.
   */
  getLogDownloader(): LogDownloader {
    return this.logDownloader;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Download logs for failed workflow runs.
   */
  private async downloadFailedLogs(runs: WorkflowRunResult[]): Promise<JobLogs> {
    const allLogs: JobLogs = new Map();

    for (const run of runs) {
      // Only download logs for failed runs
      if (run.status !== 'failure') {
        continue;
      }

      try {
        log.debug({ runId: run.runId, workflowName: run.workflowName }, 'Downloading logs for failed run');
        const jobLogs = await this.logDownloader.downloadLogs(run.runId);

        // Merge logs into allLogs
        for (const [jobName, content] of jobLogs) {
          // Truncate if necessary
          const truncatedContent = this.truncateLog(content);
          allLogs.set(`${run.workflowName}/${jobName}`, truncatedContent);
        }
      } catch (error) {
        log.warn(
          { runId: run.runId, workflowName: run.workflowName, error },
          'Failed to download logs for run, continuing without logs'
        );
        // Continue without logs - we can still provide basic feedback
      }
    }

    log.debug({ logCount: allLogs.size }, 'Downloaded logs for failed runs');
    return allLogs;
  }

  /**
   * Truncate log content to configured max length.
   */
  private truncateLog(content: string): string {
    if (content.length <= this.config.maxLogSnippetLength) {
      return content;
    }

    // Keep the last portion which typically has the most relevant errors
    const truncated = content.slice(-this.config.maxLogSnippetLength);
    return `... (truncated ${content.length - this.config.maxLogSnippetLength} characters)\n${truncated}`;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a CIFeedbackGenerator with the given dependencies.
 */
export function createCIFeedbackGenerator(
  workflowMonitor: WorkflowMonitor,
  logDownloader: LogDownloader,
  config?: CIFeedbackGeneratorConfig
): CIFeedbackGenerator {
  return new CIFeedbackGenerator(workflowMonitor, logDownloader, undefined, config);
}
