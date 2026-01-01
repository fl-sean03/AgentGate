/**
 * GitHub Actions API client for interacting with workflow runs
 */
import { Octokit } from '@octokit/rest';
import { createLogger } from '../utils/logger.js';
import type {
  WorkflowRun,
  WorkflowJob,
  WorkflowStep,
  ListWorkflowRunsOptions,
  ListWorkflowRunsResponse,
  ListWorkflowJobsResponse,
} from '@agentgate/shared';

const logger = createLogger('github:actions-client');

/**
 * Error thrown when GitHub Actions API operations fail
 */
export class GitHubActionsError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'GitHubActionsError';
  }
}

/**
 * Configuration options for GitHubActionsClient
 */
export interface GitHubActionsClientOptions {
  /** GitHub personal access token. Falls back to GITHUB_TOKEN env var */
  token?: string;
  /** Pre-configured Octokit instance */
  octokit?: Octokit;
}

/**
 * Client for interacting with GitHub Actions API
 *
 * Provides methods for:
 * - Listing workflow runs
 * - Getting workflow run details
 * - Listing jobs for a workflow run
 * - Downloading workflow logs
 * - Finding workflow runs for pull requests
 */
export class GitHubActionsClient {
  private readonly octokit: Octokit;

  constructor(options: GitHubActionsClientOptions = {}) {
    if (options.octokit) {
      this.octokit = options.octokit;
    } else {
      const token = options.token ?? process.env['GITHUB_TOKEN'];
      if (!token) {
        throw new GitHubActionsError(
          'GitHub token is required. Provide token option or set GITHUB_TOKEN environment variable.'
        );
      }
      this.octokit = new Octokit({ auth: token });
    }
  }

  /**
   * List workflow runs for a repository
   *
   * @param owner - Repository owner (user or organization)
   * @param repo - Repository name
   * @param options - Filter and pagination options
   * @returns List of workflow runs with total count
   */
  async listWorkflowRuns(
    owner: string,
    repo: string,
    options: ListWorkflowRunsOptions = {}
  ): Promise<ListWorkflowRunsResponse> {
    logger.debug({ owner, repo, options }, 'Listing workflow runs');

    try {
      const response = await this.octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        branch: options.branch,
        event: options.event,
        status: options.status as
          | 'completed'
          | 'action_required'
          | 'cancelled'
          | 'failure'
          | 'neutral'
          | 'skipped'
          | 'stale'
          | 'success'
          | 'timed_out'
          | 'in_progress'
          | 'queued'
          | 'requested'
          | 'waiting'
          | 'pending'
          | undefined,
        per_page: options.per_page ?? 30,
        page: options.page ?? 1,
        exclude_pull_requests: options.exclude_pull_requests,
        created: options.created,
        head_sha: options.head_sha,
      });

      const workflowRuns: WorkflowRun[] = response.data.workflow_runs.map((run) =>
        this.mapWorkflowRun(run)
      );

      return {
        total_count: response.data.total_count,
        workflow_runs: workflowRuns,
      };
    } catch (error) {
      throw this.handleError('Failed to list workflow runs', error);
    }
  }

  /**
   * Get details for a specific workflow run
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param runId - Workflow run ID
   * @returns Workflow run details
   */
  async getWorkflowRun(owner: string, repo: string, runId: number): Promise<WorkflowRun> {
    logger.debug({ owner, repo, runId }, 'Getting workflow run');

    try {
      const response = await this.octokit.actions.getWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });

      return this.mapWorkflowRun(response.data);
    } catch (error) {
      throw this.handleError(`Failed to get workflow run ${runId}`, error);
    }
  }

  /**
   * List jobs for a workflow run
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param runId - Workflow run ID
   * @returns List of jobs with their steps
   */
  async listJobsForRun(
    owner: string,
    repo: string,
    runId: number
  ): Promise<ListWorkflowJobsResponse> {
    logger.debug({ owner, repo, runId }, 'Listing jobs for workflow run');

    try {
      const response = await this.octokit.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId,
        per_page: 100,
      });

      const jobs: WorkflowJob[] = response.data.jobs.map((job) => this.mapWorkflowJob(job));

      return {
        total_count: response.data.total_count,
        jobs,
      };
    } catch (error) {
      throw this.handleError(`Failed to list jobs for workflow run ${runId}`, error);
    }
  }

  /**
   * Download logs for a workflow run
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param runId - Workflow run ID
   * @returns Raw log content as string
   */
  async downloadLogs(owner: string, repo: string, runId: number): Promise<string> {
    logger.debug({ owner, repo, runId }, 'Downloading workflow run logs');

    try {
      const response = await this.octokit.actions.downloadWorkflowRunLogs({
        owner,
        repo,
        run_id: runId,
      });

      // The response is a redirect URL to the logs archive
      // Octokit follows the redirect and returns the data
      if (typeof response.data === 'string') {
        return response.data;
      }

      // If it's an ArrayBuffer, convert to string
      if (response.data instanceof ArrayBuffer) {
        return new TextDecoder().decode(response.data);
      }

      // Handle the case where data is returned as a URL (redirect)
      if (response.url) {
        logger.debug({ url: response.url }, 'Following redirect for logs');
        const logsResponse = await fetch(response.url);
        if (!logsResponse.ok) {
          throw new GitHubActionsError(
            `Failed to fetch logs from redirect URL: ${logsResponse.status}`
          );
        }
        return await logsResponse.text();
      }

      throw new GitHubActionsError('Unexpected response format for workflow logs');
    } catch (error) {
      if (error instanceof GitHubActionsError) {
        throw error;
      }
      throw this.handleError(`Failed to download logs for workflow run ${runId}`, error);
    }
  }

  /**
   * Find the most recent workflow run for a pull request
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Most recent workflow run matching the PR, or null if none found
   */
  async getRunForPR(owner: string, repo: string, prNumber: number): Promise<WorkflowRun | null> {
    logger.debug({ owner, repo, prNumber }, 'Finding workflow run for PR');

    try {
      // First, get the PR to find the head SHA
      const prResponse = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      const headSha = prResponse.data.head.sha;
      logger.debug({ prNumber, headSha }, 'Found PR head SHA');

      // List workflow runs for this SHA
      const runsResponse = await this.listWorkflowRuns(owner, repo, {
        head_sha: headSha,
        per_page: 10,
      });

      if (runsResponse.workflow_runs.length === 0) {
        logger.debug({ prNumber, headSha }, 'No workflow runs found for PR');
        return null;
      }

      // Return the most recent run (first in the list)
      const run = runsResponse.workflow_runs[0];
      if (run) {
        logger.debug({ prNumber, runId: run.id }, 'Found workflow run for PR');
        return run;
      }

      return null;
    } catch (error) {
      // Handle 404 for PR not found
      if (this.isNotFoundError(error)) {
        logger.debug({ prNumber }, 'PR not found');
        return null;
      }
      throw this.handleError(`Failed to find workflow run for PR #${prNumber}`, error);
    }
  }

  /**
   * Map Octokit workflow run response to our WorkflowRun type
   */
  private mapWorkflowRun(run: Awaited<
    ReturnType<typeof this.octokit.actions.getWorkflowRun>
  >['data']): WorkflowRun {
    return {
      id: run.id,
      name: run.name ?? null,
      status: (run.status as WorkflowRun['status']) ?? null,
      conclusion: (run.conclusion as WorkflowRun['conclusion']) ?? null,
      head_sha: run.head_sha,
      head_branch: run.head_branch ?? null,
      event: run.event,
      created_at: run.created_at,
      updated_at: run.updated_at,
      jobs_url: run.jobs_url,
      logs_url: run.logs_url,
      html_url: run.html_url,
      run_number: run.run_number,
      run_attempt: run.run_attempt ?? 1,
      workflow_id: run.workflow_id,
      repository_url: run.repository.url,
    };
  }

  /**
   * Map Octokit workflow job response to our WorkflowJob type
   */
  private mapWorkflowJob(job: Awaited<
    ReturnType<typeof this.octokit.actions.listJobsForWorkflowRun>
  >['data']['jobs'][number]): WorkflowJob {
    const steps: WorkflowStep[] = (job.steps ?? []).map((step) => ({
      name: step.name,
      status: step.status as WorkflowStep['status'],
      conclusion: (step.conclusion as WorkflowStep['conclusion']) ?? null,
      number: step.number,
      started_at: step.started_at ?? null,
      completed_at: step.completed_at ?? null,
    }));

    return {
      id: job.id,
      name: job.name,
      status: job.status as WorkflowJob['status'],
      conclusion: (job.conclusion as WorkflowJob['conclusion']) ?? null,
      started_at: job.started_at ?? null,
      completed_at: job.completed_at ?? null,
      steps,
      html_url: job.html_url ?? '',
      run_id: job.run_id,
      runner_name: job.runner_name ?? null,
    };
  }

  /**
   * Check if an error is a 404 Not Found error
   */
  private isNotFoundError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'status' in error) {
      return (error as { status: number }).status === 404;
    }
    return false;
  }

  /**
   * Convert Octokit errors to GitHubActionsError
   */
  private handleError(message: string, error: unknown): GitHubActionsError {
    logger.error({ error, message }, 'GitHub Actions API error');

    if (error instanceof GitHubActionsError) {
      return error;
    }

    if (error && typeof error === 'object') {
      const octokitError = error as { status?: number; message?: string };
      const statusCode = octokitError.status;
      const errorMessage = octokitError.message ?? 'Unknown error';

      if (statusCode === 404) {
        return new GitHubActionsError(`${message}: Resource not found`, statusCode);
      }
      if (statusCode === 401) {
        return new GitHubActionsError(`${message}: Authentication failed`, statusCode);
      }
      if (statusCode === 403) {
        return new GitHubActionsError(
          `${message}: Access denied (possibly rate limited)`,
          statusCode
        );
      }

      return new GitHubActionsError(`${message}: ${errorMessage}`, statusCode);
    }

    return new GitHubActionsError(
      message,
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}
