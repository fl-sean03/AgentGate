/**
 * Failure Summarizer Module
 *
 * Transforms parsed log failures into actionable feedback for agents:
 * - Categorizes and prioritizes errors
 * - Generates markdown summaries
 * - Creates actionable fix suggestions
 */

import { LogParser, type ParsedError, type ErrorCategory } from './log-parser.js';
import { type MonitorResult } from './workflow-monitor.js';

// ============================================================================
// Types
// ============================================================================

/** Job logs map: job name -> log content */
export type JobLogs = Map<string, string>;

/** Error information for summary */
export interface ErrorInfo {
  message: string;
  file: string | null;
  line: number | null;
  code: string | null;
  context: string | null;
}

/** Step failure details */
export interface StepFailure {
  stepName: string;
  category: ErrorCategory;
  errors: ErrorInfo[];
  logSnippet: string;
}

/** Job summary */
export interface JobSummary {
  jobName: string;
  status: 'success' | 'failure';
  failedSteps: StepFailure[];
  errorCount: number;
}

/** Action item priority */
export type ActionPriority = 'high' | 'medium' | 'low';

/** Action item for fixing issues */
export interface ActionItem {
  priority: ActionPriority;
  category: string;
  description: string;
  files: string[];
}

/** Complete CI summary */
export interface CISummary {
  overallStatus: 'success' | 'failure';
  totalJobs: number;
  failedJobs: number;
  jobSummaries: JobSummary[];
  actionItems: ActionItem[];
  markdown: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_LOG_SNIPPET_LINES = 50;
const MAX_SUMMARY_CHARS = 5000;
const MAX_ACTION_ITEMS = 10;
const MAX_DETAILED_ERRORS = 10;

// ============================================================================
// Failure Summarizer
// ============================================================================

/**
 * Summarizes CI failures for agent consumption
 */
export class FailureSummarizer {
  private readonly parser: LogParser;

  constructor() {
    this.parser = new LogParser();
  }

  /**
   * Create a full CI summary from monitor result and logs
   */
  summarize(monitorResult: MonitorResult, logs: JobLogs): CISummary {
    const jobSummaries: JobSummary[] = [];
    let totalJobs = 0;
    let failedJobs = 0;

    // Process each workflow run
    for (const run of monitorResult.runs) {
      for (const failedJob of run.failedJobs) {
        totalJobs++;
        const jobLog = this.findLogForJob(failedJob.jobName, logs);
        const summary = this.summarizeJob(failedJob.jobName, jobLog);

        if (summary.status === 'failure') {
          failedJobs++;
          jobSummaries.push(summary);
        }
      }

      // Count successful jobs too
      if (run.status === 'success') {
        totalJobs++;
      }
    }

    // If no failed jobs recorded, but status is failure, add placeholder
    if (failedJobs === 0 && monitorResult.overallStatus === 'failure') {
      totalJobs = monitorResult.runs.length || 1;
      failedJobs = monitorResult.runs.filter((r) => r.status === 'failure').length || 1;
    }

    // Ensure totalJobs is at least the number of runs
    if (totalJobs === 0) {
      totalJobs = monitorResult.runs.length || 1;
    }

    const overallStatus = failedJobs > 0 ? 'failure' : 'success';
    const actionItems = this.generateActionItems(jobSummaries);

    const summary: CISummary = {
      overallStatus,
      totalJobs,
      failedJobs,
      jobSummaries,
      actionItems,
      markdown: '',
    };

    // Generate markdown
    summary.markdown = this.formatAsMarkdown(summary);

    return summary;
  }

  /**
   * Summarize a single job
   */
  summarizeJob(jobName: string, jobLog: string | null): JobSummary {
    if (!jobLog) {
      return {
        jobName,
        status: 'failure',
        failedSteps: [],
        errorCount: 0,
      };
    }

    const parsedLog = this.parser.parse(jobLog);
    const failures = this.parser.findFailures(parsedLog);
    const failedSteps: StepFailure[] = [];
    let errorCount = 0;

    for (const failure of failures) {
      const category = this.determineCategory(failure.errors);
      const stepFailure: StepFailure = {
        stepName: failure.step.name,
        category,
        errors: failure.errors.slice(0, MAX_DETAILED_ERRORS).map((e) => ({
          message: e.message,
          file: e.file,
          line: e.line,
          code: e.code,
          context: e.context,
        })),
        logSnippet: this.truncateSnippet(failure.step.content),
      };

      errorCount += failure.errors.length;
      failedSteps.push(stepFailure);
    }

    // Determine status based on parsing
    const hasExitCodeFailure = parsedLog.steps.some(
      (s) => s.exitCode !== null && s.exitCode !== 0
    );
    const hasErrorMarkers = jobLog.includes('##[error]');
    const status = failures.length > 0 || hasExitCodeFailure || hasErrorMarkers ? 'failure' : 'success';

    return {
      jobName,
      status,
      failedSteps,
      errorCount,
    };
  }

  /**
   * Generate prioritized action items from failures
   */
  generateActionItems(jobSummaries: JobSummary[]): ActionItem[] {
    const items: ActionItem[] = [];
    const seenDescriptions = new Set<string>();

    for (const job of jobSummaries) {
      for (const step of job.failedSteps) {
        const priority = this.getPriority(step.category);
        const files = this.extractFiles(step.errors);


        for (const error of step.errors) {
          const description = this.createActionDescription(step.category, error, files);

          // Skip duplicates
          if (seenDescriptions.has(description)) {
            continue;
          }
          seenDescriptions.add(description);

          items.push({
            priority,
            category: step.category,
            description,
            files,
          });

          // Stop if we have enough items
          if (items.length >= MAX_ACTION_ITEMS) {
            break;
          }
        }

        if (items.length >= MAX_ACTION_ITEMS) {
          break;
        }
      }

      if (items.length >= MAX_ACTION_ITEMS) {
        break;
      }
    }

    // Sort by priority
    const priorityOrder: Record<ActionPriority, number> = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return items.slice(0, MAX_ACTION_ITEMS);
  }

  /**
   * Format summary as markdown
   */
  formatAsMarkdown(summary: CISummary): string {
    const parts: string[] = [];

    // Header
    parts.push('# CI Failure Report\n');

    // Summary section
    parts.push('## Summary\n');
    parts.push(`- **Status:** ${summary.overallStatus === 'failure' ? 'Failed' : 'Passed'}`);
    parts.push(`- **Failed Jobs:** ${summary.failedJobs} of ${summary.totalJobs}`);
    parts.push('');

    // Failed jobs section
    if (summary.jobSummaries.length > 0) {
      parts.push('## Failed Jobs\n');

      for (const job of summary.jobSummaries) {
        parts.push(`### ${job.jobName} - FAILED\n`);

        for (const step of job.failedSteps) {
          parts.push(`#### Step: ${step.stepName}\n`);

          // Show errors
          if (step.errors.length > 0) {
            parts.push(`**${this.categoryLabel(step.category)}:**\n`);

            for (const error of step.errors.slice(0, 5)) {
              const location = this.formatLocation(error);
              parts.push(`- ${location}`);
              if (error.message) {
                parts.push(`  \`\`\``);
                parts.push(`  ${error.message.slice(0, 200)}`);
                parts.push(`  \`\`\``);
              }
            }

            if (step.errors.length > 5) {
              parts.push(`\n*...and ${step.errors.length - 5} more errors*\n`);
            }
          }

          // Log snippet in details
          if (step.logSnippet) {
            parts.push('\n<details>');
            parts.push('<summary>Log snippet</summary>\n');
            parts.push('```');
            parts.push(step.logSnippet.slice(0, 500));
            parts.push('```');
            parts.push('</details>\n');
          }
        }
      }
    }

    // Action items section
    if (summary.actionItems.length > 0) {
      parts.push('## Action Items\n');

      for (let i = 0; i < summary.actionItems.length; i++) {
        const item = summary.actionItems[i]!;
        const priorityTag = `[${item.priority.toUpperCase()}]`;
        parts.push(`${i + 1}. **${priorityTag}** ${item.description}`);
      }
      parts.push('');
    }

    // Instructions
    parts.push('## Instructions\n');
    parts.push(
      'Please fix these issues and push to the same branch. The CI will automatically re-run.'
    );
    parts.push('Focus on the HIGH priority items first.\n');

    let markdown = parts.join('\n');

    // Truncate if too long
    if (markdown.length > MAX_SUMMARY_CHARS) {
      markdown = markdown.slice(0, MAX_SUMMARY_CHARS - 50);
      markdown += '\n\n...(truncated - see full logs for details)';
    }

    return markdown;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private findLogForJob(jobName: string, logs: JobLogs): string | null {
    // Try exact match first
    if (logs.has(jobName)) {
      return logs.get(jobName) ?? null;
    }

    // Try case-insensitive match
    for (const [key, value] of logs) {
      if (key.toLowerCase() === jobName.toLowerCase()) {
        return value;
      }
    }

    // Try partial match
    for (const [key, value] of logs) {
      if (key.toLowerCase().includes(jobName.toLowerCase()) ||
          jobName.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }

    return null;
  }

  private determineCategory(errors: ParsedError[]): ErrorCategory {
    // Return most common category
    const counts: Record<ErrorCategory, number> = {
      test: 0,
      lint: 0,
      typecheck: 0,
      build: 0,
      runtime: 0,
      other: 0,
    };

    for (const error of errors) {
      counts[error.category]++;
    }

    let maxCategory: ErrorCategory = 'other';
    let maxCount = 0;

    for (const [category, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxCategory = category as ErrorCategory;
      }
    }

    return maxCategory;
  }

  private getPriority(category: ErrorCategory): ActionPriority {
    switch (category) {
      case 'test':
      case 'typecheck':
      case 'build':
        return 'high';
      case 'lint':
        return 'medium';
      default:
        return 'low';
    }
  }

  private extractFiles(errors: ErrorInfo[]): string[] {
    const files = new Set<string>();
    for (const error of errors) {
      if (error.file) {
        files.add(error.file);
      }
    }
    return Array.from(files);
  }

  private createActionDescription(
    category: ErrorCategory,
    error: ErrorInfo,
    files: string[]
  ): string {
    const fileList = files.slice(0, 3).map((f) => `\`${f}\``).join(', ');

    switch (category) {
      case 'test':
        if (error.file) {
          return `Fix failing test in \`${error.file}\``;
        }
        return 'Fix failing tests';
      case 'typecheck':
        if (error.file && error.line) {
          return `Fix type error in \`${error.file}:${error.line}\``;
        }
        return `Fix type errors in ${fileList || 'source files'}`;
      case 'lint':
        if (files.length === 1) {
          return `Fix lint issues in \`${files[0]}\` or run \`pnpm lint --fix\``;
        }
        return 'Fix lint issues or run `pnpm lint --fix`';
      case 'build':
        return 'Fix build error';
      default:
        return `Investigate error: ${error.message.slice(0, 50)}`;
    }
  }

  private categoryLabel(category: ErrorCategory): string {
    switch (category) {
      case 'test':
        return 'Test Failures';
      case 'typecheck':
        return 'TypeScript Errors';
      case 'lint':
        return 'Lint Errors';
      case 'build':
        return 'Build Errors';
      case 'runtime':
        return 'Runtime Errors';
      default:
        return 'Errors';
    }
  }

  private formatLocation(error: ErrorInfo): string {
    if (error.file && error.line) {
      return `\`${error.file}:${error.line}\``;
    }
    if (error.file) {
      return `\`${error.file}\``;
    }
    return 'Unknown location';
  }

  private truncateSnippet(content: string): string {
    const lines = content.split('\n');
    if (lines.length <= MAX_LOG_SNIPPET_LINES) {
      return content;
    }

    const truncated = lines.slice(0, MAX_LOG_SNIPPET_LINES).join('\n');
    return `${truncated}\n... (${lines.length - MAX_LOG_SNIPPET_LINES} more lines)`;
  }
}
