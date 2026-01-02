/**
 * GitHub Workspace Modes (v0.2.19 - Thrust 6)
 *
 * Provides mode-specific cloning strategies and workspace caching
 * for faster re-runs and flexible GitHub integration.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { simpleGit } from 'simple-git';
import {
  CloneMode,
  GitHubMode,
  getDefaultGitHubMode,
  createOperationsSummary,
  type GitHubOperationResult,
  type GitHubOperationsSummary,
  type CloneOptions,
  type CloneResult,
  type WorkspaceCacheConfig,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_CLONE_OPTIONS,
} from '../types/github-mode.js';
import {
  type RetryPolicyEngine,
  createRetryPolicyEngine,
} from '../orchestrator/retry-policy.js';
import { BuildErrorType } from '../types/build-error.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('github-workspace-modes');

/**
 * Handles GitHub operations with configurable failure modes.
 */
export class GitHubOperationHandler {
  private mode: GitHubMode;
  private retryEngine: RetryPolicyEngine;
  private summary: GitHubOperationsSummary;

  constructor(mode: GitHubMode) {
    this.mode = mode;
    this.retryEngine = createRetryPolicyEngine({
      maxRetries: 3,
      backoffMs: 2000,
      retryableErrors: [BuildErrorType.GITHUB_ERROR],
    });
    this.summary = createOperationsSummary(mode);
  }

  /**
   * Execute a GitHub operation with mode-appropriate handling.
   *
   * @param operation - Type of operation
   * @param fn - Async function to execute
   * @returns Result indicating success/failure based on mode
   */
  async execute<T>(
    operation: GitHubOperationResult['operation'],
    fn: () => Promise<T>
  ): Promise<{ success: boolean; result: T | null; error?: string }> {
    // Skip if disabled
    if (this.mode === GitHubMode.DISABLED) {
      const result: GitHubOperationResult = {
        success: true,
        operation,
        retried: 0,
        mode: this.mode,
        skipped: true,
      };
      this.summary.operations.push(result);
      log.debug({ operation }, 'GitHub operation skipped (disabled mode)');
      return { success: true, result: null };
    }

    // Execute with retry
    const retryResult = await this.retryEngine.execute(fn, {
      extractErrorType: () => BuildErrorType.GITHUB_ERROR,
      onAttempt: (attempt) => {
        if (attempt.willRetry) {
          log.info(
            { operation, attempt: attempt.attempt, nextRetryMs: attempt.nextRetryMs },
            'Retrying GitHub operation'
          );
        }
      },
    });

    const opResult: GitHubOperationResult = {
      success: retryResult.success,
      operation,
      retried: retryResult.retriedCount,
      mode: this.mode,
      skipped: false,
    };
    if (retryResult.result) {
      opResult.url = String(retryResult.result);
    }
    if (retryResult.finalError?.message) {
      opResult.error = retryResult.finalError.message;
    }
    this.summary.operations.push(opResult);

    if (retryResult.success) {
      log.info({ operation, retried: retryResult.retriedCount }, 'GitHub operation succeeded');

      // Track PR URL
      if (operation === 'create_pr' && typeof retryResult.result === 'string') {
        this.summary.prUrl = retryResult.result;
      }

      return { success: true, result: retryResult.result };
    }

    // Handle failure based on mode
    this.summary.anyFailed = true;
    this.summary.allSucceeded = false;

    if (this.mode === GitHubMode.FAIL_FAST) {
      log.error(
        { operation, error: retryResult.finalError?.message },
        'GitHub operation failed (fail_fast mode)'
      );
      const failResult: { success: boolean; result: T | null; error?: string } = {
        success: false,
        result: null,
      };
      if (retryResult.finalError?.message) {
        failResult.error = retryResult.finalError.message;
      }
      return failResult;
    }

    // BEST_EFFORT mode - log warning and continue
    log.warn(
      { operation, error: retryResult.finalError?.message },
      'GitHub operation failed (best_effort mode, continuing)'
    );
    return { success: true, result: null }; // "Success" in best-effort terms
  }

  /**
   * Set the branch name in the summary.
   */
  setBranchName(branchName: string): void {
    this.summary.branchName = branchName;
  }

  /**
   * Get the operations summary.
   */
  getSummary(): GitHubOperationsSummary {
    return { ...this.summary };
  }

  /**
   * Check if the run should fail due to GitHub errors.
   */
  shouldFailRun(): boolean {
    return this.mode === GitHubMode.FAIL_FAST && this.summary.anyFailed;
  }

  /**
   * Get the current mode.
   */
  getMode(): GitHubMode {
    return this.mode;
  }
}

/**
 * Create a GitHub operation handler for a run.
 *
 * @param gitOpsMode - The git operations mode (pr, branch, direct, etc.)
 * @param explicitMode - Explicit GitHubMode override
 * @returns Configured handler
 */
export function createGitHubHandler(
  gitOpsMode: string,
  explicitMode?: GitHubMode
): GitHubOperationHandler {
  const mode = explicitMode ?? getDefaultGitHubMode(gitOpsMode);
  return new GitHubOperationHandler(mode);
}

/**
 * Manages workspace cloning with different strategies.
 */
export class WorkspaceCloneManager {
  private cacheConfig: WorkspaceCacheConfig;
  private cacheIndex: Map<string, { path: string; createdAt: Date }> = new Map();

  constructor(cacheConfig: Partial<WorkspaceCacheConfig> = {}) {
    this.cacheConfig = { ...DEFAULT_CACHE_CONFIG, ...cacheConfig };
  }

  /**
   * Clone a repository using the specified mode.
   *
   * @param repoUrl - Repository URL to clone
   * @param targetDir - Target directory for the clone
   * @param options - Clone options
   * @returns Clone result
   */
  async clone(
    repoUrl: string,
    targetDir: string,
    options: Partial<CloneOptions> = {}
  ): Promise<CloneResult> {
    const startTime = Date.now();
    const opts: Required<CloneOptions> = {
      ...DEFAULT_CLONE_OPTIONS,
      ...options,
      cache: { ...DEFAULT_CACHE_CONFIG, ...options.cache },
    };

    log.info({ repoUrl, mode: opts.mode, branch: opts.branch }, 'Starting clone operation');

    try {
      switch (opts.mode) {
        case CloneMode.CACHED:
          return await this.cloneCached(repoUrl, targetDir, opts, startTime);

        case CloneMode.SHALLOW:
          return await this.cloneShallow(repoUrl, targetDir, opts, startTime);

        case CloneMode.FRESH:
        default:
          return await this.cloneFresh(repoUrl, targetDir, opts, startTime);
      }
    } catch (error) {
      log.error({ error, repoUrl, mode: opts.mode }, 'Clone operation failed');
      return {
        success: false,
        path: targetDir,
        mode: opts.mode,
        fromCache: false,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Perform a fresh clone (full clone, no cache).
   */
  private async cloneFresh(
    repoUrl: string,
    targetDir: string,
    options: Required<CloneOptions>,
    startTime: number
  ): Promise<CloneResult> {
    const git = simpleGit();

    // Ensure target directory doesn't exist
    await this.cleanDirectory(targetDir);

    // Full clone
    await git.clone(repoUrl, targetDir, [
      '--branch', options.branch,
      ...(options.submodules ? ['--recurse-submodules'] : []),
    ]);

    log.info({ repoUrl, targetDir, durationMs: Date.now() - startTime }, 'Fresh clone completed');

    return {
      success: true,
      path: targetDir,
      mode: CloneMode.FRESH,
      fromCache: false,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Perform a shallow clone (limited history).
   */
  private async cloneShallow(
    repoUrl: string,
    targetDir: string,
    options: Required<CloneOptions>,
    startTime: number
  ): Promise<CloneResult> {
    const git = simpleGit();

    // Ensure target directory doesn't exist
    await this.cleanDirectory(targetDir);

    // Shallow clone
    await git.clone(repoUrl, targetDir, [
      '--depth', String(options.depth),
      '--branch', options.branch,
      '--single-branch',
      ...(options.submodules ? ['--recurse-submodules', '--shallow-submodules'] : []),
    ]);

    log.info(
      { repoUrl, targetDir, depth: options.depth, durationMs: Date.now() - startTime },
      'Shallow clone completed'
    );

    return {
      success: true,
      path: targetDir,
      mode: CloneMode.SHALLOW,
      fromCache: false,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Clone using cache if available.
   */
  private async cloneCached(
    repoUrl: string,
    targetDir: string,
    options: Required<CloneOptions>,
    startTime: number
  ): Promise<CloneResult> {
    if (!this.cacheConfig.enabled) {
      // Fall back to fresh clone if cache disabled
      return this.cloneFresh(repoUrl, targetDir, options, startTime);
    }

    const cacheKey = this.getCacheKey(repoUrl);
    const cached = this.cacheIndex.get(cacheKey);

    // Check if cached version exists and is valid
    if (cached && this.isCacheValid(cached.createdAt)) {
      try {
        // Copy cached workspace to target
        await this.copyDirectory(cached.path, targetDir);

        // Update the cached workspace
        const git = simpleGit(targetDir);
        await git.fetch('origin');
        await git.checkout(options.branch);
        await git.pull('origin', options.branch);

        log.info(
          { repoUrl, targetDir, cacheKey, durationMs: Date.now() - startTime },
          'Clone from cache completed'
        );

        return {
          success: true,
          path: targetDir,
          mode: CloneMode.CACHED,
          fromCache: true,
          durationMs: Date.now() - startTime,
        };
      } catch (error) {
        log.warn({ error, cacheKey }, 'Cache update failed, falling back to fresh clone');
        this.cacheIndex.delete(cacheKey);
      }
    }

    // No valid cache, perform fresh clone and cache it
    const result = await this.cloneFresh(repoUrl, targetDir, options, startTime);

    if (result.success) {
      await this.cacheWorkspace(cacheKey, targetDir);
    }

    return result;
  }

  /**
   * Switch to a different branch in an existing workspace.
   *
   * @param workspacePath - Path to the workspace
   * @param branchName - Branch to switch to
   * @param createIfMissing - Create branch if it doesn't exist
   */
  async switchBranch(
    workspacePath: string,
    branchName: string,
    createIfMissing = false
  ): Promise<void> {
    const git = simpleGit(workspacePath);

    try {
      // Try to checkout existing branch
      await git.checkout(branchName);
      log.debug({ workspacePath, branchName }, 'Switched to existing branch');
    } catch {
      if (createIfMissing) {
        // Create and checkout new branch
        await git.checkoutLocalBranch(branchName);
        log.debug({ workspacePath, branchName }, 'Created and switched to new branch');
      } else {
        throw new Error(`Branch '${branchName}' not found and createIfMissing is false`);
      }
    }
  }

  /**
   * Get the current branch name.
   */
  async getCurrentBranch(workspacePath: string): Promise<string> {
    const git = simpleGit(workspacePath);
    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  }

  /**
   * Clean up expired cache entries.
   */
  async cleanupCache(): Promise<number> {
    let cleaned = 0;

    for (const [key, entry] of this.cacheIndex.entries()) {
      if (!this.isCacheValid(entry.createdAt)) {
        try {
          await fs.rm(entry.path, { recursive: true, force: true });
          this.cacheIndex.delete(key);
          cleaned++;
          log.debug({ cacheKey: key, path: entry.path }, 'Removed expired cache entry');
        } catch (error) {
          log.warn({ error, cacheKey: key }, 'Failed to remove cache entry');
        }
      }
    }

    // Also enforce max cache limit
    while (this.cacheIndex.size > this.cacheConfig.maxCached) {
      // Remove oldest entry
      let oldestKey: string | null = null;
      let oldestDate: Date | null = null;

      for (const [key, entry] of this.cacheIndex.entries()) {
        if (!oldestDate || entry.createdAt < oldestDate) {
          oldestDate = entry.createdAt;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const entry = this.cacheIndex.get(oldestKey);
        if (entry) {
          try {
            await fs.rm(entry.path, { recursive: true, force: true });
          } catch {
            // Ignore cleanup errors
          }
          this.cacheIndex.delete(oldestKey);
          cleaned++;
        }
      }
    }

    log.info({ cleaned, remaining: this.cacheIndex.size }, 'Cache cleanup completed');
    return cleaned;
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number; maxSize: number; maxAgeMs: number } {
    return {
      size: this.cacheIndex.size,
      maxSize: this.cacheConfig.maxCached,
      maxAgeMs: this.cacheConfig.maxAgeMs,
    };
  }

  /**
   * Generate a cache key for a repository URL.
   */
  private getCacheKey(repoUrl: string): string {
    return createHash('sha256').update(repoUrl).digest('hex').slice(0, 16);
  }

  /**
   * Check if a cache entry is still valid.
   */
  private isCacheValid(createdAt: Date): boolean {
    const age = Date.now() - createdAt.getTime();
    return age < this.cacheConfig.maxAgeMs;
  }

  /**
   * Cache a workspace for future use.
   */
  private async cacheWorkspace(cacheKey: string, sourcePath: string): Promise<void> {
    if (!this.cacheConfig.enabled) return;

    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheConfig.cacheDir, { recursive: true });

      const cachePath = join(this.cacheConfig.cacheDir, cacheKey);

      // Copy workspace to cache
      await this.copyDirectory(sourcePath, cachePath);

      // Update index
      this.cacheIndex.set(cacheKey, {
        path: cachePath,
        createdAt: new Date(),
      });

      log.debug({ cacheKey, cachePath }, 'Workspace cached');

      // Trigger cleanup if needed
      await this.cleanupCache();
    } catch (error) {
      log.warn({ error, cacheKey }, 'Failed to cache workspace');
    }
  }

  /**
   * Clean/remove a directory.
   */
  private async cleanDirectory(dir: string): Promise<void> {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, which is fine
    }
  }

  /**
   * Copy a directory recursively.
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

/**
 * Create a workspace clone manager with optional configuration.
 */
export function createCloneManager(
  cacheConfig?: Partial<WorkspaceCacheConfig>
): WorkspaceCloneManager {
  return new WorkspaceCloneManager(cacheConfig);
}

// Re-export types and enums for convenience
export {
  CloneMode,
  GitHubMode,
  getDefaultGitHubMode,
  createOperationsSummary,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_CLONE_OPTIONS,
} from '../types/github-mode.js';
export type {
  GitHubOperationResult,
  GitHubOperationsSummary,
  CloneOptions,
  CloneResult,
  WorkspaceCacheConfig,
} from '../types/github-mode.js';
