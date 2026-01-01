/**
 * GitHub Actions API Client
 *
 * Provides typed access to GitHub Actions API operations:
 * - List workflow runs
 * - Get workflow run details and jobs
 * - Download workflow logs
 * - Find runs by commit SHA
 */

import { Octokit } from '@octokit/rest';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('actions-client');

// ============================================================================
// Types
// ============================================================================

/** Workflow run status */
export type WorkflowRunStatus = 'queued' | 'in_progress' | 'completed' | 'waiting';

/** Workflow run conclusion */
export type WorkflowRunConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | null;

/** Workflow run information */
export interface WorkflowRun {
  id: number;
  name: string | null;
  head_branch: string | null;
  head_sha: string;
  status: WorkflowRunStatus | null;
  conclusion: WorkflowRunConclusion;
  workflow_id: number;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_attempt: number;
}

/** Workflow step status */
export type WorkflowStepStatus = 'queued' | 'in_progress' | 'completed';

/** Workflow step conclusion */
export type WorkflowStepConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | null;

/** Workflow step information */
export interface WorkflowStep {
  name: string;
  status: WorkflowStepStatus;
  conclusion: WorkflowStepConclusion;
  number: number;
  started_at: string | undefined;
  completed_at: string | null | undefined;
}

/** Workflow job status */
export type WorkflowJobStatus = 'queued' | 'in_progress' | 'completed' | 'waiting';

/** Workflow job conclusion */
export type WorkflowJobConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | null;

/** Workflow job information */
export interface WorkflowJob {
  id: number;
  name: string;
  status: WorkflowJobStatus;
  conclusion: WorkflowJobConclusion;
  started_at: string;
  completed_at: string | null;
  steps: WorkflowStep[];
}

/** Options for listing workflow runs */
export interface ListWorkflowRunsOptions {
  branch?: string;
  event?: string;
  status?: 'completed' | 'action_required' | 'cancelled' | 'failure' | 'neutral' | 'skipped' | 'stale' | 'success' | 'timed_out' | 'in_progress' | 'queued' | 'requested' | 'waiting' | 'pending';
  per_page?: number;
  page?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/** Error codes for Actions API */
export const ActionsApiErrorCode = {
  /** Run or resource not found */
  NOT_FOUND: 'not_found',
  /** Authentication failed */
  UNAUTHORIZED: 'unauthorized',
  /** Rate limit exceeded */
  RATE_LIMITED: 'rate_limited',
  /** Insufficient permissions */
  FORBIDDEN: 'forbidden',
  /** Logs not available yet */
  LOGS_UNAVAILABLE: 'logs_unavailable',
  /** Network or unknown error */
  NETWORK_ERROR: 'network_error',
} as const;

export type ActionsApiErrorCode = (typeof ActionsApiErrorCode)[keyof typeof ActionsApiErrorCode];

/** Custom error for Actions API operations */
export class ActionsApiError extends Error {
  readonly name = 'ActionsApiError';

  constructor(
    message: string,
    public readonly code: ActionsApiErrorCode,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
    public readonly originalError?: Error
  ) {
    super(message);
    Object.setPrototypeOf(this, ActionsApiError.prototype);
  }
}

// ============================================================================
// Retry Configuration
// ============================================================================

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
};

// ============================================================================
// Actions Client
// ============================================================================

/** Options for ActionsClient constructor */
export interface ActionsClientOptions {
  owner: string;
  repo: string;
  token: string;
  baseUrl?: string;
  retryConfig?: Partial<RetryConfig>;
}

/**
 * Client for GitHub Actions API operations
 */
export class ActionsClient {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;
  private readonly retryConfig: RetryConfig;

  constructor(options: ActionsClientOptions) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options.retryConfig };

    const octokitOptions: ConstructorParameters<typeof Octokit>[0] = {
      auth: options.token,
      userAgent: 'agentgate-actions-client/0.2.12',
    };

    if (options.baseUrl) {
      octokitOptions.baseUrl = options.baseUrl;
    }

    this.octokit = new Octokit(octokitOptions);
  }

  /**
   * List workflow runs with optional filters
   */
  async listWorkflowRuns(options?: ListWorkflowRunsOptions): Promise<WorkflowRun[]> {
    return this.withRetry(async () => {
      try {
        const params: Parameters<typeof this.octokit.rest.actions.listWorkflowRunsForRepo>[0] = {
          owner: this.owner,
          repo: this.repo,
          per_page: options?.per_page ?? 30,
          page: options?.page ?? 1,
        };

        if (options?.branch) params.branch = options.branch;
        if (options?.event) params.event = options.event;
        if (options?.status) params.status = options.status;

        const { data } = await this.octokit.rest.actions.listWorkflowRunsForRepo(params);

        return data.workflow_runs.map((run) => this.mapWorkflowRun(run));
      } catch (error) {
        throw this.mapError(error, 'Failed to list workflow runs');
      }
    });
  }

  /**
   * Get a single workflow run by ID
   */
  async getWorkflowRun(runId: number): Promise<WorkflowRun> {
    return this.withRetry(async () => {
      try {
        const { data } = await this.octokit.rest.actions.getWorkflowRun({
          owner: this.owner,
          repo: this.repo,
          run_id: runId,
        });

        return this.mapWorkflowRun(data);
      } catch (error) {
        throw this.mapError(error, `Failed to get workflow run ${runId}`);
      }
    });
  }

  /**
   * Get jobs for a workflow run
   */
  async getWorkflowRunJobs(runId: number): Promise<WorkflowJob[]> {
    return this.withRetry(async () => {
      try {
        const { data } = await this.octokit.rest.actions.listJobsForWorkflowRun({
          owner: this.owner,
          repo: this.repo,
          run_id: runId,
        });

        return data.jobs.map((job) => this.mapWorkflowJob(job));
      } catch (error) {
        throw this.mapError(error, `Failed to get jobs for workflow run ${runId}`);
      }
    });
  }

  /**
   * Download workflow run logs as a zip buffer
   *
   * Note: Returns raw zip data. Use LogDownloader to extract.
   */
  async downloadWorkflowLogs(runId: number): Promise<ArrayBuffer> {
    return this.withRetry(async () => {
      try {
        const response = await this.octokit.rest.actions.downloadWorkflowRunLogs({
          owner: this.owner,
          repo: this.repo,
          run_id: runId,
        });

        // Response data is ArrayBuffer when logs are available
        if (response.data instanceof ArrayBuffer) {
          return response.data;
        }

        // Handle redirects - Octokit follows them automatically
        // If data is not ArrayBuffer, it might be a redirect response
        if (typeof response.data === 'string') {
          // Data is the redirect URL - fetch it
          const fetchResponse = await fetch(response.data);
          if (!fetchResponse.ok) {
            throw new ActionsApiError(
              'Failed to download logs from redirect URL',
              ActionsApiErrorCode.LOGS_UNAVAILABLE,
              fetchResponse.status
            );
          }
          return await fetchResponse.arrayBuffer();
        }

        throw new ActionsApiError(
          'Unexpected response format for logs download',
          ActionsApiErrorCode.LOGS_UNAVAILABLE
        );
      } catch (error) {
        if (error instanceof ActionsApiError) throw error;

        const mappedError = this.mapError(error, `Failed to download logs for run ${runId}`);

        // Special handling for 404 on logs
        if (mappedError.code === ActionsApiErrorCode.NOT_FOUND) {
          throw new ActionsApiError(
            `Logs not available for run ${runId}. The run may still be in progress or logs may have expired.`,
            ActionsApiErrorCode.LOGS_UNAVAILABLE,
            404
          );
        }

        throw mappedError;
      }
    });
  }

  /**
   * Find workflow runs for a specific commit SHA
   */
  async getWorkflowRunsForCommit(sha: string): Promise<WorkflowRun[]> {
    return this.withRetry(async () => {
      try {
        const { data } = await this.octokit.rest.actions.listWorkflowRunsForRepo({
          owner: this.owner,
          repo: this.repo,
          head_sha: sha,
          per_page: 100,
        });

        return data.workflow_runs.map((run) => this.mapWorkflowRun(run));
      } catch (error) {
        throw this.mapError(error, `Failed to get workflow runs for commit ${sha}`);
      }
    });
  }

  /**
   * Get the most recent workflow run for a commit
   */
  async getWorkflowRunForCommit(sha: string): Promise<WorkflowRun | null> {
    const runs = await this.getWorkflowRunsForCommit(sha);

    if (runs.length === 0) {
      return null;
    }

    // Sort by created_at descending and return most recent
    runs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return runs[0] ?? null;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private mapWorkflowRun(run: {
    id: number;
    name?: string | null;
    head_branch: string | null;
    head_sha: string;
    status: string | null;
    conclusion: string | null;
    workflow_id: number;
    html_url: string;
    created_at: string;
    updated_at: string;
    run_attempt?: number;
  }): WorkflowRun {
    return {
      id: run.id,
      name: run.name ?? null,
      head_branch: run.head_branch,
      head_sha: run.head_sha,
      status: run.status as WorkflowRunStatus | null,
      conclusion: run.conclusion as WorkflowRunConclusion,
      workflow_id: run.workflow_id,
      html_url: run.html_url,
      created_at: run.created_at,
      updated_at: run.updated_at,
      run_attempt: run.run_attempt ?? 1,
    };
  }

  private mapWorkflowJob(job: {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    started_at: string;
    completed_at: string | null;
    steps?: Array<{
      name: string;
      status: string;
      conclusion: string | null;
      number: number;
      started_at?: string | null;
      completed_at?: string | null;
    }>;
  }): WorkflowJob {
    return {
      id: job.id,
      name: job.name,
      status: job.status as WorkflowJobStatus,
      conclusion: job.conclusion as WorkflowJobConclusion,
      started_at: job.started_at,
      completed_at: job.completed_at,
      steps: (job.steps ?? []).map((step) => ({
        name: step.name,
        status: step.status as WorkflowStepStatus,
        conclusion: step.conclusion as WorkflowStepConclusion,
        number: step.number,
        started_at: step.started_at ?? undefined,
        completed_at: step.completed_at ?? undefined,
      })),
    };
  }

  private mapError(error: unknown, context: string): ActionsApiError {
    if (error instanceof ActionsApiError) {
      return error;
    }

    if (error instanceof Error && 'status' in error) {
      const status = (error as { status: number }).status;

      switch (status) {
        case 401:
          return new ActionsApiError(
            `${context}: Invalid or expired token`,
            ActionsApiErrorCode.UNAUTHORIZED,
            status,
            false,
            error
          );
        case 403:
          // Check for rate limiting
          if (error.message?.includes('rate limit')) {
            return new ActionsApiError(
              `${context}: Rate limit exceeded`,
              ActionsApiErrorCode.RATE_LIMITED,
              status,
              true,
              error
            );
          }
          return new ActionsApiError(
            `${context}: Insufficient permissions`,
            ActionsApiErrorCode.FORBIDDEN,
            status,
            false,
            error
          );
        case 404:
          return new ActionsApiError(
            `${context}: Resource not found`,
            ActionsApiErrorCode.NOT_FOUND,
            status,
            false,
            error
          );
        case 429:
          return new ActionsApiError(
            `${context}: Rate limit exceeded`,
            ActionsApiErrorCode.RATE_LIMITED,
            status,
            true,
            error
          );
        default:
          if (status >= 500) {
            return new ActionsApiError(
              `${context}: Server error`,
              ActionsApiErrorCode.NETWORK_ERROR,
              status,
              true,
              error
            );
          }
      }
    }

    // Network/unknown errors
    return new ActionsApiError(
      `${context}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ActionsApiErrorCode.NETWORK_ERROR,
      undefined,
      true,
      error instanceof Error ? error : undefined
    );
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: ActionsApiError | undefined;
    let delay = this.retryConfig.initialDelayMs;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (!(error instanceof ActionsApiError)) {
          throw error;
        }

        lastError = error;

        // Don't retry non-retryable errors
        if (!error.retryable) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.retryConfig.maxRetries) {
          break;
        }

        logger.debug(
          { attempt: attempt + 1, delay, error: error.message },
          'Retrying after error'
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= this.retryConfig.backoffMultiplier;
      }
    }

    throw lastError!;
  }
}
