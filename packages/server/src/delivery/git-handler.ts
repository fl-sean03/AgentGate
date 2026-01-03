/**
 * Git Handler (v0.2.24)
 *
 * Handles git operations for delivery: commit, push, branch creation.
 *
 * @module delivery/git-handler
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import type { GitSpec, CommitResult, PushResultType } from '../types/delivery-spec.js';
import type { Workspace } from '../types/index.js';
import {
  hasUncommittedChanges,
  stageAll,
  commit,
  createBranch,
  push,
  getCurrentBranch,
  getCurrentSha,
  hasRemote,
  branchExists,
} from '../workspace/git-ops.js';
import { createLogger } from '../utils/logger.js';
import { nanoid } from 'nanoid';

const log = createLogger('git-handler');

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Context for git operations
 */
export interface GitContext {
  workspace: Workspace;
  gitSpec: GitSpec;
  taskName: string;
  workOrderId: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// GIT HANDLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Git operations handler for delivery
 */
export class GitHandler {
  /**
   * Execute git operations based on the spec
   */
  async execute(context: GitContext): Promise<{
    commit?: CommitResult;
    push?: PushResultType;
    branchName: string;
  }> {
    const { workspace, gitSpec, taskName, workOrderId } = context;
    const repoPath = workspace.rootPath;

    log.info({ workOrderId, mode: gitSpec.mode }, 'Executing git operations');

    // Generate branch name if needed
    const branchName = this.generateBranchName(gitSpec, taskName);

    // Check if we need to create a new branch
    const currentBranch = await getCurrentBranch(repoPath);
    if (branchName !== currentBranch) {
      // Check if branch already exists
      const exists = await branchExists(repoPath, branchName);
      if (!exists) {
        await createBranch(repoPath, branchName);
        log.info({ branchName }, 'Created new branch');
      }
    }

    // Commit changes if auto-commit is enabled
    let commitResult: CommitResult | undefined;
    if (gitSpec.autoCommit !== false) {
      commitResult = await this.commitChanges(context, branchName);
    }

    // Push changes if mode is 'push' or 'github-pr' and auto-push is enabled
    let pushResult: PushResultType | undefined;
    if ((gitSpec.mode === 'push' || gitSpec.mode === 'github-pr') && gitSpec.autoPush !== false) {
      pushResult = await this.pushChanges(context, branchName);
    }

    const result: { commit?: CommitResult; push?: PushResultType; branchName: string } = {
      branchName,
    };

    if (commitResult) {
      result.commit = commitResult;
    }

    if (pushResult) {
      result.push = pushResult;
    }

    return result;
  }

  /**
   * Commit changes in the workspace
   */
  async commitChanges(context: GitContext, branchName: string): Promise<CommitResult> {
    const { workspace, gitSpec, taskName, workOrderId } = context;
    const repoPath = workspace.rootPath;

    log.debug({ workOrderId }, 'Checking for uncommitted changes');

    // Check if there are changes to commit
    const hasChanges = await hasUncommittedChanges(repoPath);
    if (!hasChanges) {
      log.info({ workOrderId }, 'No changes to commit');
      return {
        success: true,
        filesCommitted: [],
      };
    }

    try {
      // Stage all changes
      await stageAll(repoPath);

      // Generate commit message
      const message = this.generateCommitMessage(gitSpec, taskName);

      // Commit
      const sha = await commit(repoPath, message);

      log.info({ sha, message }, 'Committed changes');

      // Get list of files committed (simplified - just return a marker)
      // In a real implementation, we'd use git diff --name-only HEAD~1
      return {
        success: true,
        sha,
        filesCommitted: ['(changes committed)'],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ error }, 'Failed to commit changes');
      return {
        success: false,
        filesCommitted: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Push changes to remote
   */
  async pushChanges(context: GitContext, branchName: string): Promise<PushResultType> {
    const { workspace, workOrderId } = context;
    const repoPath = workspace.rootPath;
    const remote = 'origin';

    log.debug({ workOrderId, branchName }, 'Pushing changes to remote');

    try {
      // Check if remote exists
      const hasOrigin = await hasRemote(repoPath, remote);
      if (!hasOrigin) {
        return {
          success: false,
          error: 'No remote "origin" configured',
        };
      }

      // Push to remote
      const result = await push(repoPath, remote, branchName, { setUpstream: true });

      log.info({ remote, branchName }, 'Pushed changes to remote');

      return {
        success: result.success,
        remote,
        branch: branchName,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ error }, 'Failed to push changes');
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Generate a branch name based on the spec
   */
  private generateBranchName(gitSpec: GitSpec, taskName: string): string {
    // If explicit branch name provided, use it
    if (gitSpec.branchName) {
      return gitSpec.branchName;
    }

    // Generate from prefix and task name
    const prefix = gitSpec.branchPrefix || 'agentgate/';
    const sanitizedName = taskName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    const shortId = nanoid(6);
    return `${prefix}${sanitizedName}-${shortId}`;
  }

  /**
   * Generate a commit message based on the spec
   */
  private generateCommitMessage(gitSpec: GitSpec, taskName: string): string {
    // If template provided, use it
    if (gitSpec.commitTemplate) {
      return gitSpec.commitTemplate
        .replace('{task}', taskName)
        .replace('{date}', new Date().toISOString().split('T')[0] || '');
    }

    // Generate default message
    const prefix = gitSpec.commitPrefix || '[AgentGate]';
    return `${prefix} ${taskName}`;
  }

  /**
   * Get the current SHA of the workspace
   */
  async getCurrentSha(workspace: Workspace): Promise<string> {
    return getCurrentSha(workspace.rootPath);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new git handler
 */
export function createGitHandler(): GitHandler {
  return new GitHandler();
}
