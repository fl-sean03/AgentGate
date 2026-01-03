/**
 * PR Handler (v0.2.24)
 *
 * Handles GitHub pull request operations for delivery.
 *
 * @module delivery/pr-handler
 */

import type { PRSpec, PRResult, AutoMergeSpec } from '../types/delivery-spec.js';
import type { WorkspaceSpec, GitHubWorkspace, GitHubNewWorkspace } from '../types/execution-spec.js';
import {
  createGitHubClient,
  getGitHubConfigFromEnv,
  createPullRequest,
  getRepository,
} from '../workspace/github.js';
import { createLogger } from '../utils/logger.js';
import type { Octokit } from '@octokit/rest';

const log = createLogger('pr-handler');

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Context for PR operations
 */
export interface PRContext {
  prSpec: PRSpec;
  workspaceSpec: WorkspaceSpec;
  branchName: string;
  taskName: string;
  workOrderId: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PR HANDLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pull request handler for delivery
 */
export class PRHandler {
  private client: Octokit | null = null;

  /**
   * Initialize the GitHub client
   */
  private getClient(): Octokit {
    if (!this.client) {
      const config = getGitHubConfigFromEnv();
      this.client = createGitHubClient(config);
    }
    return this.client;
  }

  /**
   * Create a pull request based on the spec
   */
  async createPR(context: PRContext): Promise<PRResult> {
    const { prSpec, workspaceSpec, branchName, taskName, workOrderId } = context;

    log.info({ workOrderId, branchName }, 'Creating pull request');

    // Get repository info from workspace spec
    const repoInfo = this.getRepoInfo(workspaceSpec);
    if (!repoInfo) {
      return {
        success: false,
        error: 'Cannot create PR: workspace is not a GitHub repository',
      };
    }

    const { owner, repo } = repoInfo;

    try {
      const client = this.getClient();

      // Get default branch if base not specified
      let base = prSpec.base;
      if (!base) {
        const repoData = await getRepository(client, owner, repo);
        base = repoData.defaultBranch;
      }

      // Generate title and body
      const title = this.generateTitle(prSpec, taskName);
      const body = this.generateBody(prSpec, taskName, workOrderId);

      // Create the PR
      const pr = await createPullRequest(client, {
        owner,
        repo,
        title,
        head: branchName,
        base,
        body,
        draft: prSpec.draft ?? false,
      });

      log.info({ prNumber: pr.number, url: pr.url }, 'Pull request created');

      // Add labels if specified
      if (prSpec.labels && prSpec.labels.length > 0) {
        await this.addLabels(client, owner, repo, pr.number, prSpec.labels);
      }

      // Request reviewers if specified
      if (prSpec.reviewers && prSpec.reviewers.length > 0) {
        await this.requestReviewers(client, owner, repo, pr.number, prSpec.reviewers);
      }

      // Add assignees if specified
      if (prSpec.assignees && prSpec.assignees.length > 0) {
        await this.addAssignees(client, owner, repo, pr.number, prSpec.assignees);
      }

      // Enable auto-merge if configured
      if (prSpec.autoMerge?.enabled) {
        await this.enableAutoMerge(client, owner, repo, pr.number, prSpec.autoMerge);
      }

      return {
        success: true,
        prNumber: pr.number,
        url: pr.url,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ error }, 'Failed to create pull request');
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get repository info from workspace spec
   */
  private getRepoInfo(workspaceSpec: WorkspaceSpec): { owner: string; repo: string } | null {
    if (workspaceSpec.source === 'github') {
      const githubSpec = workspaceSpec as GitHubWorkspace;
      return { owner: githubSpec.owner, repo: githubSpec.repo };
    }

    if (workspaceSpec.source === 'github-new') {
      const githubNewSpec = workspaceSpec as GitHubNewWorkspace;
      return { owner: githubNewSpec.owner, repo: githubNewSpec.repoName };
    }

    return null;
  }

  /**
   * Generate PR title
   */
  private generateTitle(prSpec: PRSpec, taskName: string): string {
    if (prSpec.title) {
      return prSpec.title
        .replace('{task}', taskName)
        .replace('{date}', new Date().toISOString().split('T')[0] || '');
    }

    return `[AgentGate] ${taskName}`;
  }

  /**
   * Generate PR body
   */
  private generateBody(prSpec: PRSpec, taskName: string, workOrderId: string): string {
    if (prSpec.body) {
      return prSpec.body
        .replace('{task}', taskName)
        .replace('{workOrderId}', workOrderId)
        .replace('{date}', new Date().toISOString().split('T')[0] || '');
    }

    return [
      `## Summary`,
      '',
      `Task: ${taskName}`,
      `Work Order: ${workOrderId}`,
      '',
      '---',
      '*This PR was created automatically by AgentGate.*',
    ].join('\n');
  }

  /**
   * Add labels to a PR
   */
  private async addLabels(
    client: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    labels: string[]
  ): Promise<void> {
    try {
      await client.rest.issues.addLabels({
        owner,
        repo,
        issue_number: prNumber,
        labels,
      });
      log.debug({ prNumber, labels }, 'Added labels to PR');
    } catch (error) {
      log.warn({ error, prNumber, labels }, 'Failed to add labels to PR');
    }
  }

  /**
   * Request reviewers for a PR
   */
  private async requestReviewers(
    client: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    reviewers: string[]
  ): Promise<void> {
    try {
      await client.rest.pulls.requestReviewers({
        owner,
        repo,
        pull_number: prNumber,
        reviewers,
      });
      log.debug({ prNumber, reviewers }, 'Requested reviewers for PR');
    } catch (error) {
      log.warn({ error, prNumber, reviewers }, 'Failed to request reviewers for PR');
    }
  }

  /**
   * Add assignees to a PR
   */
  private async addAssignees(
    client: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    assignees: string[]
  ): Promise<void> {
    try {
      await client.rest.issues.addAssignees({
        owner,
        repo,
        issue_number: prNumber,
        assignees,
      });
      log.debug({ prNumber, assignees }, 'Added assignees to PR');
    } catch (error) {
      log.warn({ error, prNumber, assignees }, 'Failed to add assignees to PR');
    }
  }

  /**
   * Enable auto-merge for a PR
   */
  private async enableAutoMerge(
    client: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    autoMerge: AutoMergeSpec
  ): Promise<void> {
    try {
      // Get PR node ID for GraphQL mutation
      const { data: prData } = await client.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      // Map merge method
      const mergeMethod = (autoMerge.method || 'squash').toUpperCase();

      // Enable auto-merge via GraphQL
      await client.graphql<unknown>(
        `
        mutation($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
          enablePullRequestAutoMerge(input: {
            pullRequestId: $pullRequestId,
            mergeMethod: $mergeMethod
          }) {
            pullRequest {
              autoMergeRequest {
                enabledAt
              }
            }
          }
        }
        `,
        {
          pullRequestId: prData.node_id,
          mergeMethod,
        }
      );

      log.debug({ prNumber, mergeMethod }, 'Enabled auto-merge for PR');
    } catch (error) {
      log.warn({ error, prNumber }, 'Failed to enable auto-merge for PR');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new PR handler
 */
export function createPRHandler(): PRHandler {
  return new PRHandler();
}
