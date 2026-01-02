/**
 * Tests for GitHub Workspace Modes (v0.2.19 - Thrust 6)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GitHubOperationHandler,
  createGitHubHandler,
  WorkspaceCloneManager,
  createCloneManager,
  CloneMode,
  GitHubMode,
  getDefaultGitHubMode,
  createOperationsSummary,
} from '../src/workspace/github-workspace-modes.js';

describe('GitHubMode', () => {
  describe('getDefaultGitHubMode', () => {
    it('should return FAIL_FAST for pr mode', () => {
      expect(getDefaultGitHubMode('pr')).toBe(GitHubMode.FAIL_FAST);
    });

    it('should return FAIL_FAST for fork mode', () => {
      expect(getDefaultGitHubMode('fork')).toBe(GitHubMode.FAIL_FAST);
    });

    it('should return FAIL_FAST for github_pr mode', () => {
      expect(getDefaultGitHubMode('github_pr')).toBe(GitHubMode.FAIL_FAST);
    });

    it('should return BEST_EFFORT for branch mode', () => {
      expect(getDefaultGitHubMode('branch')).toBe(GitHubMode.BEST_EFFORT);
    });

    it('should return BEST_EFFORT for push_only mode', () => {
      expect(getDefaultGitHubMode('push_only')).toBe(GitHubMode.BEST_EFFORT);
    });

    it('should return DISABLED for direct mode', () => {
      expect(getDefaultGitHubMode('direct')).toBe(GitHubMode.DISABLED);
    });

    it('should return DISABLED for local mode', () => {
      expect(getDefaultGitHubMode('local')).toBe(GitHubMode.DISABLED);
    });

    it('should return BEST_EFFORT for unknown modes', () => {
      expect(getDefaultGitHubMode('unknown')).toBe(GitHubMode.BEST_EFFORT);
    });
  });

  describe('createOperationsSummary', () => {
    it('should create empty summary with correct mode', () => {
      const summary = createOperationsSummary(GitHubMode.FAIL_FAST);

      expect(summary.mode).toBe(GitHubMode.FAIL_FAST);
      expect(summary.operations).toHaveLength(0);
      expect(summary.allSucceeded).toBe(true);
      expect(summary.anyFailed).toBe(false);
      expect(summary.prUrl).toBeNull();
      expect(summary.branchName).toBeNull();
    });
  });
});

describe('GitHubOperationHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('DISABLED mode', () => {
    it('should skip operations and return success', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.DISABLED);

      const operationFn = vi.fn().mockRejectedValue(new Error('Should not be called'));

      const resultPromise = handler.execute('create_pr', operationFn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.result).toBeNull();
      expect(operationFn).not.toHaveBeenCalled();

      const summary = handler.getSummary();
      expect(summary.operations).toHaveLength(1);
      expect(summary.operations[0]!.skipped).toBe(true);
      expect(summary.operations[0]!.success).toBe(true);
    });

    it('should not fail run in disabled mode', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.DISABLED);

      const resultPromise = handler.execute('push', async () => 'result');
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(handler.shouldFailRun()).toBe(false);
    });
  });

  describe('FAIL_FAST mode', () => {
    it('should return failure on error', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.FAIL_FAST);

      const error = new Error('GitHub API error');
      const operationFn = vi.fn().mockRejectedValue(error);

      const resultPromise = handler.execute('create_pr', operationFn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub API error');
      expect(handler.shouldFailRun()).toBe(true);
    });

    it('should succeed on successful operation', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.FAIL_FAST);

      const operationFn = vi.fn().mockResolvedValue('https://github.com/owner/repo/pull/123');

      const resultPromise = handler.execute('create_pr', operationFn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.result).toBe('https://github.com/owner/repo/pull/123');
      expect(handler.shouldFailRun()).toBe(false);

      const summary = handler.getSummary();
      expect(summary.prUrl).toBe('https://github.com/owner/repo/pull/123');
    });

    it('should track operations in summary', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.FAIL_FAST);

      await Promise.all([
        (async () => {
          const resultPromise = handler.execute('create_branch', async () => 'main');
          await vi.runAllTimersAsync();
          return resultPromise;
        })(),
        (async () => {
          const resultPromise = handler.execute('push', async () => 'origin/main');
          await vi.runAllTimersAsync();
          return resultPromise;
        })(),
      ]);

      const summary = handler.getSummary();
      expect(summary.operations).toHaveLength(2);
      expect(summary.allSucceeded).toBe(true);
      expect(summary.anyFailed).toBe(false);
    });
  });

  describe('BEST_EFFORT mode', () => {
    it('should return success even on error', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.BEST_EFFORT);

      const error = new Error('GitHub API error');
      const operationFn = vi.fn().mockRejectedValue(error);

      const resultPromise = handler.execute('create_pr', operationFn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // In best-effort mode, we return success even though operation failed
      expect(result.success).toBe(true);
      expect(result.result).toBeNull();
      expect(handler.shouldFailRun()).toBe(false);

      const summary = handler.getSummary();
      expect(summary.anyFailed).toBe(true);
      expect(summary.allSucceeded).toBe(false);
      expect(summary.prUrl).toBeNull();
    });

    it('should succeed normally when operation succeeds', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.BEST_EFFORT);

      const operationFn = vi.fn().mockResolvedValue('https://github.com/owner/repo/pull/456');

      const resultPromise = handler.execute('create_pr', operationFn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.result).toBe('https://github.com/owner/repo/pull/456');

      const summary = handler.getSummary();
      expect(summary.prUrl).toBe('https://github.com/owner/repo/pull/456');
    });
  });

  describe('retry behavior', () => {
    it('should retry on transient errors', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.FAIL_FAST);

      let attempts = 0;
      const operationFn = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Rate limited');
        }
        return 'main';
      });

      const resultPromise = handler.execute('push', operationFn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);

      const summary = handler.getSummary();
      expect(summary.operations[0]!.retried).toBe(2);
    });

    it('should fail after max retries exhausted', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.FAIL_FAST);

      const operationFn = vi.fn().mockRejectedValue(new Error('Persistent error'));

      const resultPromise = handler.execute('push', operationFn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      // 1 initial + 3 retries = 4 attempts
      expect(operationFn).toHaveBeenCalledTimes(4);
    });
  });

  describe('branch tracking', () => {
    it('should track branch name in summary', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.FAIL_FAST);

      handler.setBranchName('feature/test-branch');

      const summary = handler.getSummary();
      expect(summary.branchName).toBe('feature/test-branch');
    });
  });

  describe('getMode', () => {
    it('should return the current mode', () => {
      expect(new GitHubOperationHandler(GitHubMode.FAIL_FAST).getMode()).toBe(GitHubMode.FAIL_FAST);
      expect(new GitHubOperationHandler(GitHubMode.BEST_EFFORT).getMode()).toBe(GitHubMode.BEST_EFFORT);
      expect(new GitHubOperationHandler(GitHubMode.DISABLED).getMode()).toBe(GitHubMode.DISABLED);
    });
  });
});

describe('createGitHubHandler', () => {
  it('should use FAIL_FAST for pr mode', () => {
    const handler = createGitHubHandler('pr');
    expect(handler.getSummary().mode).toBe(GitHubMode.FAIL_FAST);
  });

  it('should use DISABLED for direct mode', () => {
    const handler = createGitHubHandler('direct');
    expect(handler.getSummary().mode).toBe(GitHubMode.DISABLED);
  });

  it('should use explicit mode when provided', () => {
    const handler = createGitHubHandler('pr', GitHubMode.BEST_EFFORT);
    expect(handler.getSummary().mode).toBe(GitHubMode.BEST_EFFORT);
  });

  it('should override default based on explicit mode', () => {
    const handler = createGitHubHandler('direct', GitHubMode.FAIL_FAST);
    expect(handler.getSummary().mode).toBe(GitHubMode.FAIL_FAST);
  });
});

describe('CloneMode', () => {
  it('should have all expected modes', () => {
    expect(CloneMode.FRESH).toBe('fresh');
    expect(CloneMode.CACHED).toBe('cached');
    expect(CloneMode.SHALLOW).toBe('shallow');
  });
});

describe('WorkspaceCloneManager', () => {
  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const manager = createCloneManager({
        maxCached: 20,
        maxAgeMs: 3600000,
      });

      const stats = manager.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(20);
      expect(stats.maxAgeMs).toBe(3600000);
    });
  });

  describe('cleanupCache', () => {
    it('should clean up empty cache without errors', async () => {
      const manager = createCloneManager();

      const cleaned = await manager.cleanupCache();

      expect(cleaned).toBe(0);
    });
  });

  // Note: Full integration tests for clone operations would require
  // mocking the file system and git operations, which is complex.
  // These are better tested in e2e tests with real repositories.
});

describe('createCloneManager', () => {
  it('should create manager with default config', () => {
    const manager = createCloneManager();
    const stats = manager.getCacheStats();

    expect(stats.maxSize).toBe(10);
    expect(stats.maxAgeMs).toBe(24 * 60 * 60 * 1000); // 24 hours
  });

  it('should create manager with custom config', () => {
    const manager = createCloneManager({
      maxCached: 5,
      maxAgeMs: 1000,
    });
    const stats = manager.getCacheStats();

    expect(stats.maxSize).toBe(5);
    expect(stats.maxAgeMs).toBe(1000);
  });
});
