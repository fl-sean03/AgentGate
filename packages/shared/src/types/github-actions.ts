/**
 * GitHub Actions workflow types for AgentGate
 */

/**
 * Workflow run status values from GitHub Actions API
 */
export const WorkflowRunStatus = {
  QUEUED: 'queued',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  WAITING: 'waiting',
  REQUESTED: 'requested',
  PENDING: 'pending',
} as const;

export type WorkflowRunStatus = (typeof WorkflowRunStatus)[keyof typeof WorkflowRunStatus];

/**
 * Workflow run conclusion values from GitHub Actions API
 */
export const WorkflowRunConclusion = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  CANCELLED: 'cancelled',
  SKIPPED: 'skipped',
  TIMED_OUT: 'timed_out',
  ACTION_REQUIRED: 'action_required',
  STALE: 'stale',
  NEUTRAL: 'neutral',
} as const;

export type WorkflowRunConclusion =
  (typeof WorkflowRunConclusion)[keyof typeof WorkflowRunConclusion];

/**
 * Workflow job status values
 */
export const WorkflowJobStatus = {
  QUEUED: 'queued',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  WAITING: 'waiting',
} as const;

export type WorkflowJobStatus = (typeof WorkflowJobStatus)[keyof typeof WorkflowJobStatus];

/**
 * Workflow job conclusion values
 */
export const WorkflowJobConclusion = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  CANCELLED: 'cancelled',
  SKIPPED: 'skipped',
} as const;

export type WorkflowJobConclusion =
  (typeof WorkflowJobConclusion)[keyof typeof WorkflowJobConclusion];

/**
 * Workflow step status values
 */
export const WorkflowStepStatus = {
  QUEUED: 'queued',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;

export type WorkflowStepStatus = (typeof WorkflowStepStatus)[keyof typeof WorkflowStepStatus];

/**
 * Workflow step conclusion values
 */
export const WorkflowStepConclusion = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  CANCELLED: 'cancelled',
  SKIPPED: 'skipped',
} as const;

export type WorkflowStepConclusion =
  (typeof WorkflowStepConclusion)[keyof typeof WorkflowStepConclusion];

/**
 * Represents a step within a workflow job
 */
export interface WorkflowStep {
  name: string;
  status: WorkflowStepStatus;
  conclusion: WorkflowStepConclusion | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * Represents a job within a workflow run
 */
export interface WorkflowJob {
  id: number;
  name: string;
  status: WorkflowJobStatus;
  conclusion: WorkflowJobConclusion | null;
  started_at: string | null;
  completed_at: string | null;
  steps: WorkflowStep[];
  html_url: string;
  run_id: number;
  runner_name: string | null;
}

/**
 * Represents a workflow run
 */
export interface WorkflowRun {
  id: number;
  name: string | null;
  status: WorkflowRunStatus | null;
  conclusion: WorkflowRunConclusion | null;
  head_sha: string;
  head_branch: string | null;
  event: string;
  created_at: string;
  updated_at: string;
  jobs_url: string;
  logs_url: string;
  html_url: string;
  run_number: number;
  run_attempt: number;
  workflow_id: number;
  repository_url: string;
}

/**
 * CI failure type classification
 */
export const CIFailureType = {
  BUILD: 'build',
  LINT: 'lint',
  TEST: 'test',
  OTHER: 'other',
} as const;

export type CIFailureType = (typeof CIFailureType)[keyof typeof CIFailureType];

/**
 * Represents a CI failure with extracted context
 */
export interface CIFailure {
  type: CIFailureType;
  job: string;
  step: string;
  message: string;
  file?: string;
  line?: number;
  context: string[];
}

/**
 * CI result status values
 */
export const CIResultStatus = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  CANCELLED: 'cancelled',
  PENDING: 'pending',
} as const;

export type CIResultStatus = (typeof CIResultStatus)[keyof typeof CIResultStatus];

/**
 * Aggregated CI result for a workflow run
 */
export interface CIResult {
  status: CIResultStatus;
  runId: number;
  runUrl: string;
  failures: CIFailure[];
  duration: number;
  jobs: WorkflowJob[];
}

/**
 * Options for listing workflow runs
 */
export interface ListWorkflowRunsOptions {
  branch?: string;
  event?: string;
  status?: WorkflowRunStatus | 'completed';
  per_page?: number;
  page?: number;
  exclude_pull_requests?: boolean;
  created?: string;
  head_sha?: string;
}

/**
 * Response from listing workflow runs
 */
export interface ListWorkflowRunsResponse {
  total_count: number;
  workflow_runs: WorkflowRun[];
}

/**
 * Response from listing workflow jobs
 */
export interface ListWorkflowJobsResponse {
  total_count: number;
  jobs: WorkflowJob[];
}
