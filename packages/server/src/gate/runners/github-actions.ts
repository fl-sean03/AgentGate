/**
 * GitHub Actions Gate Runner (v0.2.24)
 *
 * Polls GitHub Actions workflows to check CI status.
 *
 * @module gate/runners/github-actions
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import type {
  GateResult,
  GateFailure,
  GitHubActionsCheck,
} from '../../types/index.js';
import type { GateContext, ValidationResult, GitHubActionsDetails } from '../runner-types.js';
import { BaseGateRunner } from '../base-runner.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('github-actions-gate-runner');

/**
 * Workflow run status from GitHub API
 */
interface WorkflowRunStatus {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'neutral' | null;
  url: string;
}

/**
 * Gate runner for GitHub Actions workflows
 */
export class GitHubActionsGateRunner extends BaseGateRunner {
  readonly name = 'github-actions';
  readonly type = 'github-actions' as const;

  /**
   * Run GitHub Actions gate check
   */
  async run(context: GateContext): Promise<GateResult> {
    const startTime = Date.now();
    const gateName = context.currentGate || 'github-actions';

    // Get check configuration
    const gate = context.taskSpec.spec.convergence.gates.find(
      (g) => g.name === gateName
    );
    if (!gate || gate.check.type !== 'github-actions') {
      return this.failedResult(
        gateName,
        { error: 'Gate configuration not found' },
        [{ message: 'Gate configuration not found or invalid type' }],
        Date.now() - startTime
      );
    }

    const check = gate.check as GitHubActionsCheck;
    const pollIntervalMs = this.parseTimeout(check.pollInterval || '30s');
    const timeoutMs = this.parseTimeout(check.timeout || '30m');
    const workflows = check.workflows || [];

    log.info(
      { gateName, workflows, pollIntervalMs, timeoutMs },
      'Running GitHub Actions gate'
    );

    try {
      // Get repository info from workspace spec
      const workspace = context.taskSpec.spec.execution.workspace;
      let repoOwner: string | undefined;
      let repoName: string | undefined;
      let ref = context.snapshot.afterSha || 'main';

      if (workspace.source === 'github') {
        repoOwner = workspace.owner;
        repoName = workspace.repo;
        if (workspace.ref) {
          ref = context.snapshot.afterSha || workspace.ref;
        }
      } else if (workspace.source === 'github-new') {
        repoOwner = workspace.owner;
        repoName = workspace.repoName;
      }

      if (!repoOwner || !repoName) {
        return this.failedResult(
          gateName,
          { error: 'Repository information not available' },
          [{ message: 'GitHub Actions gate requires a GitHub workspace' }],
          Date.now() - startTime
        );
      }

      // Poll for workflow completion
      const workflowResults = await this.pollWorkflows(
        repoOwner,
        repoName,
        ref,
        workflows,
        pollIntervalMs,
        timeoutMs,
        startTime
      );

      const duration = Date.now() - startTime;

      // Build details
      const details: GitHubActionsDetails = {
        type: 'github-actions',
        workflows: workflowResults.map((w) => ({
          name: w.name,
          status: this.mapStatus(w),
          url: w.url,
        })),
        pollDuration: duration,
      };

      // Check if all workflows passed
      const allPassed = workflowResults.every(
        (w) => w.status === 'completed' && w.conclusion === 'success'
      );

      if (allPassed) {
        return this.passedResult(gateName, details as unknown as Record<string, unknown>, duration);
      }

      // Collect failures
      const failures: GateFailure[] = [];
      for (const workflow of workflowResults) {
        if (workflow.status !== 'completed' || workflow.conclusion !== 'success') {
          const status = workflow.status === 'completed'
            ? `failed (${workflow.conclusion})`
            : workflow.status;
          failures.push({
            message: `Workflow '${workflow.name}' ${status}`,
            details: `URL: ${workflow.url}`,
          });
        }
      }

      return this.failedResult(gateName, details as unknown as Record<string, unknown>, failures, duration);
    } catch (error) {
      log.error({ error, gateName }, 'GitHub Actions gate failed with error');
      return this.failedResult(
        gateName,
        { error: error instanceof Error ? error.message : String(error) },
        [{ message: `GitHub Actions error: ${error instanceof Error ? error.message : String(error)}` }],
        Date.now() - startTime
      );
    }
  }

  /**
   * Poll GitHub Actions workflows until completion or timeout
   */
  private async pollWorkflows(
    owner: string,
    repo: string,
    ref: string,
    filterWorkflows: string[],
    pollInterval: number,
    timeout: number,
    startTime: number
  ): Promise<WorkflowRunStatus[]> {
    const token = process.env['GITHUB_TOKEN'];
    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable not set');
    }

    while (Date.now() - startTime < timeout) {
      // Fetch workflow runs for the ref
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/runs?head_sha=${ref}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'AgentGate/0.2.24',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as {
        workflow_runs: Array<{
          name: string;
          status: 'queued' | 'in_progress' | 'completed';
          conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'neutral' | null;
          html_url: string;
        }>;
      };

      // Filter workflows if specific ones were requested
      let runs = data.workflow_runs;
      if (filterWorkflows.length > 0) {
        runs = runs.filter((run) => filterWorkflows.includes(run.name));
      }

      // Map to our status type
      const statuses: WorkflowRunStatus[] = runs.map((run) => ({
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        url: run.html_url,
      }));

      // Check if all workflows are completed
      const allCompleted = statuses.length > 0 && statuses.every(
        (s) => s.status === 'completed'
      );

      if (allCompleted) {
        return statuses;
      }

      // Wait before polling again
      await this.sleep(pollInterval);
    }

    // Timeout - return current status
    throw new Error('GitHub Actions polling timed out');
  }

  /**
   * Map workflow status to our gate status
   */
  private mapStatus(
    workflow: WorkflowRunStatus
  ): 'success' | 'failure' | 'pending' | 'skipped' {
    if (workflow.status !== 'completed') {
      return 'pending';
    }
    switch (workflow.conclusion) {
      case 'success':
        return 'success';
      case 'skipped':
      case 'neutral':
        return 'skipped';
      default:
        return 'failure';
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validate GitHub Actions gate configuration
   */
  validate(config: GitHubActionsCheck): ValidationResult {
    if (config.type !== 'github-actions') {
      return { valid: false, error: 'Invalid check type' };
    }

    if (config.workflows && !Array.isArray(config.workflows)) {
      return { valid: false, error: 'workflows must be an array' };
    }

    return { valid: true };
  }

  /**
   * Generate suggestions for GitHub Actions failures
   */
  protected generateSuggestions(result: GateResult): string[] {
    return [
      'Check the GitHub Actions workflow logs for details',
      'Ensure all tests pass locally before pushing',
      'Review the CI configuration for any issues',
    ];
  }
}

/**
 * Create a GitHub Actions gate runner instance
 */
export function createGitHubActionsGateRunner(): GitHubActionsGateRunner {
  return new GitHubActionsGateRunner();
}
