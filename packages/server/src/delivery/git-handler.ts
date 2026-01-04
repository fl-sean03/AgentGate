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
import { createRetryPolicyEngine, type RetryPolicy } from '../orchestrator/retry-policy.js';
import { BuildErrorType } from '../types/build-error.js';

const log = createLogger('git-handler');

// ═══════════════════════════════════════════════════════════════════════════
// RETRY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Retry policy for git operations.
 * Uses 3 retries with exponential backoff for transient errors.
 */
export const GIT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  maxBackoffMs: 10000,
  retryableErrors: [
    BuildErrorType.SYSTEM_ERROR,
    BuildErrorType.GITHUB_ERROR,
  ],
  retryOnTimeout: true,
  jitter: true,
};

/**
 * Error patterns that indicate transient failures which should be retried.
 */
const TRANSIENT_ERROR_PATTERNS = [
  /ENOENT/i,                    // File not found (temporary)
  /ECONNRESET/i,                // Connection reset
  /ETIMEDOUT/i,                 // Network timeout
  /ECONNREFUSED/i,              // Connection refused
  /network\s+timeout/i,         // Network timeout message
  /temporary\s+lock/i,          // Git temporary lock
  /\.lock.*exists/i,            // Git lock file exists
  /could not lock/i,            // Could not lock ref
  /unable to create.*lock/i,    // Unable to create lock
  /Another git process/i,       // Another git process running
  /fatal: Unable to create/i,   // Unable to create file
  /Connection timed out/i,      // SSH/HTTPS timeout
  /Could not resolve host/i,    // DNS resolution failure
];

/**
 * Check if an error is a transient error that should be retried.
 */
export function isTransientGitError(error: Error): boolean {
  const message = error.message || '';
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Extract a BuildErrorType from a git error.
 */
function extractGitErrorType(error: Error): BuildErrorType {
  const message = error.message || '';

  // Network-related errors
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|network|timeout|resolve host/i.test(message)) {
    return BuildErrorType.GITHUB_ERROR;
  }

  // Lock-related errors (transient)
  if (/lock|ENOENT/i.test(message)) {
    return BuildErrorType.SYSTEM_ERROR;
  }

  return BuildErrorType.UNKNOWN;
}

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
   * Commit changes in the workspace.
   * Retries up to 3 times on transient errors (network timeout, ENOENT, temporary lock).
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

    const retryEngine = createRetryPolicyEngine(GIT_RETRY_POLICY);

    const result = await retryEngine.execute(
      async (): Promise<CommitResult> => {
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
      },
      {
        isRetryable: isTransientGitError,
        extractErrorType: extractGitErrorType,
        onAttempt: (attempt) => {
          if (!attempt.success) {
            log.warn(
              { workOrderId, attempt: attempt.attempt, error: attempt.error?.message },
              'Commit attempt failed, will retry if transient'
            );
          }
        },
      }
    );

    if (result.success && result.result) {
      return result.result;
    }

    // All retries exhausted
    const errorMessage = result.finalError?.message ?? 'Unknown error during commit';
    log.error(
      { workOrderId, attempts: result.attempts.length, error: errorMessage },
      'Failed to commit changes after retries'
    );
    return {
      success: false,
      filesCommitted: [],
      error: errorMessage,
    };
  }

  /**
   * Push changes to remote.
   * Retries up to 3 times on transient errors (network timeout, ENOENT, temporary lock).
   */
  async pushChanges(context: GitContext, branchName: string): Promise<PushResultType> {
    const { workspace, workOrderId } = context;
    const repoPath = workspace.rootPath;
    const remote = 'origin';

    log.debug({ workOrderId, branchName }, 'Pushing changes to remote');

    // Check if remote exists (this is a precondition, not retryable)
    const hasOrigin = await hasRemote(repoPath, remote);
    if (!hasOrigin) {
      return {
        success: false,
        error: 'No remote "origin" configured',
      };
    }

    const retryEngine = createRetryPolicyEngine(GIT_RETRY_POLICY);

    const result = await retryEngine.execute(
      async (): Promise<PushResultType> => {
        // Push to remote
        const pushResult = await push(repoPath, remote, branchName, { setUpstream: true });

        log.info({ remote, branchName }, 'Pushed changes to remote');

        return {
          success: pushResult.success,
          remote,
          branch: branchName,
        };
      },
      {
        isRetryable: isTransientGitError,
        extractErrorType: extractGitErrorType,
        onAttempt: (attempt) => {
          if (!attempt.success) {
            log.warn(
              { workOrderId, branchName, attempt: attempt.attempt, error: attempt.error?.message },
              'Push attempt failed, will retry if transient'
            );
          }
        },
      }
    );

    if (result.success && result.result) {
      return result.result;
    }

    // All retries exhausted
    const errorMessage = result.finalError?.message ?? 'Unknown error during push';
    log.error(
      { workOrderId, branchName, attempts: result.attempts.length, error: errorMessage },
      'Failed to push changes after retries'
    );
    return {
      success: false,
      error: errorMessage,
    };
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
