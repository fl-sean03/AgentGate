/**
 * Tests for GitHandler retry logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHandler, GitContext, isTransientGitError, GIT_RETRY_POLICY } from '../../src/delivery/git-handler.js';

// Mock the git-ops module
vi.mock('../../src/workspace/git-ops.js', () => ({
  hasUncommittedChanges: vi.fn(),
  stageAll: vi.fn(),
  commit: vi.fn(),
  hasRemote: vi.fn(),
  push: vi.fn(),
  getCurrentBranch: vi.fn(),
  branchExists: vi.fn(),
  createBranch: vi.fn(),
  getCurrentSha: vi.fn(),
}));

// Mock the retry-policy module to speed up tests
vi.mock('../../src/orchestrator/retry-policy.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/orchestrator/retry-policy.js')>();
  return {
    ...original,
    createRetryPolicyEngine: (policy: typeof original.DEFAULT_RETRY_POLICY) => {
      // Use a faster backoff for tests
      const testPolicy = {
        ...policy,
        backoffMs: 10,
        maxBackoffMs: 50,
        jitter: false,
      };
      return new original.RetryPolicyEngine(testPolicy);
    },
  };
});

import {
  hasUncommittedChanges,
  stageAll,
  commit,
  hasRemote,
  push,
  getCurrentBranch,
  branchExists,
  createBranch,
} from '../../src/workspace/git-ops.js';

describe('GitHandler', () => {
  let handler: GitHandler;
  let context: GitContext;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new GitHandler();
    context = {
      workspace: { rootPath: '/test/repo' } as any,
      gitSpec: { mode: 'commit' as const },
      taskName: 'Test task',
      workOrderId: 'test-work-order-123',
    };
  });

  describe('isTransientGitError', () => {
    it('should identify ENOENT as transient', () => {
      const error = new Error('ENOENT: no such file or directory');
      expect(isTransientGitError(error)).toBe(true);
    });

    it('should identify network timeout as transient', () => {
      const error = new Error('ETIMEDOUT: connection timed out');
      expect(isTransientGitError(error)).toBe(true);
    });

    it('should identify connection reset as transient', () => {
      const error = new Error('ECONNRESET: connection reset by peer');
      expect(isTransientGitError(error)).toBe(true);
    });

    it('should identify git lock errors as transient', () => {
      const error = new Error('fatal: Unable to create .git/index.lock: File exists');
      expect(isTransientGitError(error)).toBe(true);
    });

    it('should identify temporary lock as transient', () => {
      const error = new Error('Another git process seems to be running in this repository');
      expect(isTransientGitError(error)).toBe(true);
    });

    it('should identify DNS resolution failure as transient', () => {
      const error = new Error('Could not resolve host: github.com');
      expect(isTransientGitError(error)).toBe(true);
    });

    it('should not identify non-transient errors', () => {
      const error = new Error('fatal: not a git repository');
      expect(isTransientGitError(error)).toBe(false);
    });

    it('should not identify permission errors as transient', () => {
      const error = new Error('Permission denied');
      expect(isTransientGitError(error)).toBe(false);
    });
  });

  describe('GIT_RETRY_POLICY', () => {
    it('should have maxRetries of 3', () => {
      expect(GIT_RETRY_POLICY.maxRetries).toBe(3);
    });

    it('should use exponential backoff', () => {
      expect(GIT_RETRY_POLICY.backoffMultiplier).toBeGreaterThan(1);
    });

    it('should have jitter enabled', () => {
      expect(GIT_RETRY_POLICY.jitter).toBe(true);
    });
  });

  describe('commitChanges', () => {
    it('should return success with no changes to commit', async () => {
      vi.mocked(hasUncommittedChanges).mockResolvedValue(false);

      const result = await handler.commitChanges(context, 'test-branch');

      expect(result.success).toBe(true);
      expect(result.filesCommitted).toEqual([]);
      expect(stageAll).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    });

    it('should commit changes successfully on first try', async () => {
      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(stageAll).mockResolvedValue(undefined);
      vi.mocked(commit).mockResolvedValue('abc123');

      const result = await handler.commitChanges(context, 'test-branch');

      expect(result.success).toBe(true);
      expect(result.sha).toBe('abc123');
      expect(stageAll).toHaveBeenCalledTimes(1);
      expect(commit).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient ENOENT error and succeed', async () => {
      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(stageAll).mockResolvedValue(undefined);
      vi.mocked(commit)
        .mockRejectedValueOnce(new Error('ENOENT: temporary file not found'))
        .mockResolvedValueOnce('abc123');

      const result = await handler.commitChanges(context, 'test-branch');

      expect(result.success).toBe(true);
      expect(result.sha).toBe('abc123');
      expect(commit).toHaveBeenCalledTimes(2);
    });

    it('should retry on network timeout and succeed', async () => {
      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(stageAll).mockResolvedValue(undefined);
      vi.mocked(commit)
        .mockRejectedValueOnce(new Error('ETIMEDOUT: network timeout'))
        .mockResolvedValueOnce('def456');

      const result = await handler.commitChanges(context, 'test-branch');

      expect(result.success).toBe(true);
      expect(result.sha).toBe('def456');
      expect(commit).toHaveBeenCalledTimes(2);
    });

    it('should retry on git lock error and succeed', async () => {
      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(stageAll).mockResolvedValue(undefined);
      vi.mocked(commit)
        .mockRejectedValueOnce(new Error('fatal: Unable to create .git/index.lock'))
        .mockRejectedValueOnce(new Error('Another git process seems to be running'))
        .mockResolvedValueOnce('ghi789');

      const result = await handler.commitChanges(context, 'test-branch');

      expect(result.success).toBe(true);
      expect(result.sha).toBe('ghi789');
      expect(commit).toHaveBeenCalledTimes(3);
    });

    it('should fail after exhausting retries on transient error', async () => {
      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(stageAll).mockResolvedValue(undefined);
      vi.mocked(commit).mockRejectedValue(new Error('ENOENT: persistent error'));

      const result = await handler.commitChanges(context, 'test-branch');

      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOENT');
      // 1 initial + 3 retries = 4 calls
      expect(commit).toHaveBeenCalledTimes(4);
    });

    it('should not retry on non-transient error', async () => {
      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(stageAll).mockResolvedValue(undefined);
      vi.mocked(commit).mockRejectedValue(new Error('fatal: not a git repository'));

      const result = await handler.commitChanges(context, 'test-branch');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a git repository');
      // Non-transient error should not trigger retries
      expect(commit).toHaveBeenCalledTimes(1);
    });
  });

  describe('pushChanges', () => {
    it('should fail if no remote configured', async () => {
      vi.mocked(hasRemote).mockResolvedValue(false);

      const result = await handler.pushChanges(context, 'test-branch');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No remote "origin" configured');
      expect(push).not.toHaveBeenCalled();
    });

    it('should push successfully on first try', async () => {
      vi.mocked(hasRemote).mockResolvedValue(true);
      vi.mocked(push).mockResolvedValue({
        success: true,
        remoteRef: 'origin/test-branch',
        localBranch: 'test-branch',
      });

      const result = await handler.pushChanges(context, 'test-branch');

      expect(result.success).toBe(true);
      expect(result.remote).toBe('origin');
      expect(result.branch).toBe('test-branch');
      expect(push).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient network timeout and succeed', async () => {
      vi.mocked(hasRemote).mockResolvedValue(true);
      vi.mocked(push)
        .mockRejectedValueOnce(new Error('ETIMEDOUT: connection timed out'))
        .mockResolvedValueOnce({
          success: true,
          remoteRef: 'origin/test-branch',
          localBranch: 'test-branch',
        });

      const result = await handler.pushChanges(context, 'test-branch');

      expect(result.success).toBe(true);
      expect(push).toHaveBeenCalledTimes(2);
    });

    it('should retry on connection reset and succeed', async () => {
      vi.mocked(hasRemote).mockResolvedValue(true);
      vi.mocked(push)
        .mockRejectedValueOnce(new Error('ECONNRESET: connection reset'))
        .mockResolvedValueOnce({
          success: true,
          remoteRef: 'origin/test-branch',
          localBranch: 'test-branch',
        });

      const result = await handler.pushChanges(context, 'test-branch');

      expect(result.success).toBe(true);
      expect(push).toHaveBeenCalledTimes(2);
    });

    it('should retry on DNS resolution failure and succeed', async () => {
      vi.mocked(hasRemote).mockResolvedValue(true);
      vi.mocked(push)
        .mockRejectedValueOnce(new Error('Could not resolve host: github.com'))
        .mockResolvedValueOnce({
          success: true,
          remoteRef: 'origin/test-branch',
          localBranch: 'test-branch',
        });

      const result = await handler.pushChanges(context, 'test-branch');

      expect(result.success).toBe(true);
      expect(push).toHaveBeenCalledTimes(2);
    });

    it('should fail after exhausting retries on transient error', async () => {
      vi.mocked(hasRemote).mockResolvedValue(true);
      vi.mocked(push).mockRejectedValue(new Error('ETIMEDOUT: persistent timeout'));

      const result = await handler.pushChanges(context, 'test-branch');

      expect(result.success).toBe(false);
      expect(result.error).toContain('ETIMEDOUT');
      // 1 initial + 3 retries = 4 calls
      expect(push).toHaveBeenCalledTimes(4);
    });

    it('should not retry on non-transient error', async () => {
      vi.mocked(hasRemote).mockResolvedValue(true);
      vi.mocked(push).mockRejectedValue(new Error('remote rejected: permission denied'));

      const result = await handler.pushChanges(context, 'test-branch');

      expect(result.success).toBe(false);
      expect(result.error).toContain('permission denied');
      // Non-transient error should not trigger retries
      expect(push).toHaveBeenCalledTimes(1);
    });

    it('should retry multiple times before succeeding', async () => {
      vi.mocked(hasRemote).mockResolvedValue(true);
      vi.mocked(push)
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockRejectedValueOnce(new Error('Connection timed out'))
        .mockResolvedValueOnce({
          success: true,
          remoteRef: 'origin/test-branch',
          localBranch: 'test-branch',
        });

      const result = await handler.pushChanges(context, 'test-branch');

      expect(result.success).toBe(true);
      expect(push).toHaveBeenCalledTimes(4);
    });
  });
});
