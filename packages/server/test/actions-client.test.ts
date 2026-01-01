/**
 * Actions Client Tests
 *
 * Tests for GitHub Actions API client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ActionsClient,
  ActionsApiError,
  ActionsApiErrorCode,
} from '../src/github/actions-client.js';

// Mock Octokit
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: {
      actions: {
        listWorkflowRunsForRepo: vi.fn(),
        getWorkflowRun: vi.fn(),
        listJobsForWorkflowRun: vi.fn(),
        downloadWorkflowRunLogs: vi.fn(),
      },
    },
  })),
}));

import { Octokit } from '@octokit/rest';

describe('ActionsClient', () => {
  let client: ActionsClient;
  let mockOctokit: {
    rest: {
      actions: {
        listWorkflowRunsForRepo: ReturnType<typeof vi.fn>;
        getWorkflowRun: ReturnType<typeof vi.fn>;
        listJobsForWorkflowRun: ReturnType<typeof vi.fn>;
        downloadWorkflowRunLogs: ReturnType<typeof vi.fn>;
      };
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Get reference to mock
    mockOctokit = new (Octokit as unknown as new () => typeof mockOctokit)();

    client = new ActionsClient({
      owner: 'test-owner',
      repo: 'test-repo',
      token: 'test-token',
      retryConfig: {
        maxRetries: 1,
        initialDelayMs: 10,
        backoffMultiplier: 1,
      },
    });

    // Access the internal octokit
    // @ts-expect-error Accessing private property for testing
    client.octokit = mockOctokit;
  });

  describe('listWorkflowRuns', () => {
    it('should list workflow runs', async () => {
      const mockRuns = [
        {
          id: 123,
          name: 'CI',
          head_branch: 'main',
          head_sha: 'abc123',
          status: 'completed',
          conclusion: 'success',
          workflow_id: 1,
          html_url: 'https://github.com/test/repo/actions/runs/123',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:01:00Z',
          run_attempt: 1,
        },
      ];

      mockOctokit.rest.actions.listWorkflowRunsForRepo.mockResolvedValue({
        data: { workflow_runs: mockRuns },
      });

      const result = await client.listWorkflowRuns();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 123,
        name: 'CI',
        head_branch: 'main',
        head_sha: 'abc123',
        status: 'completed',
        conclusion: 'success',
        workflow_id: 1,
        html_url: 'https://github.com/test/repo/actions/runs/123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:01:00Z',
        run_attempt: 1,
      });
    });

    it('should filter by branch', async () => {
      mockOctokit.rest.actions.listWorkflowRunsForRepo.mockResolvedValue({
        data: { workflow_runs: [] },
      });

      await client.listWorkflowRuns({ branch: 'feature-branch' });

      expect(mockOctokit.rest.actions.listWorkflowRunsForRepo).toHaveBeenCalledWith(
        expect.objectContaining({ branch: 'feature-branch' })
      );
    });

    it('should filter by status', async () => {
      mockOctokit.rest.actions.listWorkflowRunsForRepo.mockResolvedValue({
        data: { workflow_runs: [] },
      });

      await client.listWorkflowRuns({ status: 'completed' });

      expect(mockOctokit.rest.actions.listWorkflowRunsForRepo).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('should handle 401 error', async () => {
      const error = new Error('Bad credentials') as Error & { status: number };
      error.status = 401;
      mockOctokit.rest.actions.listWorkflowRunsForRepo.mockRejectedValue(error);

      await expect(client.listWorkflowRuns()).rejects.toThrow(ActionsApiError);
      await expect(client.listWorkflowRuns()).rejects.toMatchObject({
        code: ActionsApiErrorCode.UNAUTHORIZED,
      });
    });

    it('should handle 403 error', async () => {
      const error = new Error('Forbidden') as Error & { status: number };
      error.status = 403;
      mockOctokit.rest.actions.listWorkflowRunsForRepo.mockRejectedValue(error);

      await expect(client.listWorkflowRuns()).rejects.toMatchObject({
        code: ActionsApiErrorCode.FORBIDDEN,
      });
    });

    it('should handle rate limit error', async () => {
      const error = new Error('rate limit exceeded') as Error & { status: number };
      error.status = 403;
      mockOctokit.rest.actions.listWorkflowRunsForRepo.mockRejectedValue(error);

      await expect(client.listWorkflowRuns()).rejects.toMatchObject({
        code: ActionsApiErrorCode.RATE_LIMITED,
        retryable: true,
      });
    });
  });

  describe('getWorkflowRun', () => {
    it('should get a single workflow run', async () => {
      const mockRun = {
        id: 123,
        name: 'CI',
        head_branch: 'main',
        head_sha: 'abc123',
        status: 'completed',
        conclusion: 'success',
        workflow_id: 1,
        html_url: 'https://github.com/test/repo/actions/runs/123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:01:00Z',
        run_attempt: 1,
      };

      mockOctokit.rest.actions.getWorkflowRun.mockResolvedValue({ data: mockRun });

      const result = await client.getWorkflowRun(123);

      expect(result).toEqual({
        id: 123,
        name: 'CI',
        head_branch: 'main',
        head_sha: 'abc123',
        status: 'completed',
        conclusion: 'success',
        workflow_id: 1,
        html_url: 'https://github.com/test/repo/actions/runs/123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:01:00Z',
        run_attempt: 1,
      });
    });

    it('should handle 404 error', async () => {
      const error = new Error('Not found') as Error & { status: number };
      error.status = 404;
      mockOctokit.rest.actions.getWorkflowRun.mockRejectedValue(error);

      await expect(client.getWorkflowRun(999)).rejects.toMatchObject({
        code: ActionsApiErrorCode.NOT_FOUND,
      });
    });
  });

  describe('getWorkflowRunJobs', () => {
    it('should get jobs for a workflow run', async () => {
      const mockJobs = [
        {
          id: 456,
          name: 'build',
          status: 'completed',
          conclusion: 'success',
          started_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T00:01:00Z',
          steps: [
            {
              name: 'Checkout',
              status: 'completed',
              conclusion: 'success',
              number: 1,
            },
          ],
        },
      ];

      mockOctokit.rest.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: { jobs: mockJobs },
      });

      const result = await client.getWorkflowRunJobs(123);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 456,
        name: 'build',
        status: 'completed',
        conclusion: 'success',
        steps: expect.arrayContaining([
          expect.objectContaining({
            name: 'Checkout',
            status: 'completed',
            conclusion: 'success',
            number: 1,
          }),
        ]),
      });
    });

    it('should handle empty steps', async () => {
      const mockJobs = [
        {
          id: 456,
          name: 'build',
          status: 'completed',
          conclusion: 'success',
          started_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T00:01:00Z',
          // No steps property
        },
      ];

      mockOctokit.rest.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: { jobs: mockJobs },
      });

      const result = await client.getWorkflowRunJobs(123);

      expect(result[0]?.steps).toEqual([]);
    });
  });

  describe('downloadWorkflowLogs', () => {
    it('should download logs as ArrayBuffer', async () => {
      const mockZipData = new ArrayBuffer(100);
      mockOctokit.rest.actions.downloadWorkflowRunLogs.mockResolvedValue({
        data: mockZipData,
      });

      const result = await client.downloadWorkflowLogs(123);

      expect(result).toBe(mockZipData);
    });

    it('should handle 404 as logs unavailable', async () => {
      const error = new Error('Not found') as Error & { status: number };
      error.status = 404;
      mockOctokit.rest.actions.downloadWorkflowRunLogs.mockRejectedValue(error);

      await expect(client.downloadWorkflowLogs(123)).rejects.toMatchObject({
        code: ActionsApiErrorCode.LOGS_UNAVAILABLE,
      });
    });
  });

  describe('getWorkflowRunsForCommit', () => {
    it('should get workflow runs for a commit SHA', async () => {
      const mockRuns = [
        {
          id: 123,
          name: 'CI',
          head_branch: 'main',
          head_sha: 'abc123def456',
          status: 'completed',
          conclusion: 'success',
          workflow_id: 1,
          html_url: 'https://github.com/test/repo/actions/runs/123',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:01:00Z',
          run_attempt: 1,
        },
      ];

      mockOctokit.rest.actions.listWorkflowRunsForRepo.mockResolvedValue({
        data: { workflow_runs: mockRuns },
      });

      const result = await client.getWorkflowRunsForCommit('abc123def456');

      expect(result).toHaveLength(1);
      expect(mockOctokit.rest.actions.listWorkflowRunsForRepo).toHaveBeenCalledWith(
        expect.objectContaining({ head_sha: 'abc123def456' })
      );
    });
  });

  describe('getWorkflowRunForCommit', () => {
    it('should return null when no runs found', async () => {
      mockOctokit.rest.actions.listWorkflowRunsForRepo.mockResolvedValue({
        data: { workflow_runs: [] },
      });

      const result = await client.getWorkflowRunForCommit('abc123def456');

      expect(result).toBeNull();
    });

    it('should return most recent run', async () => {
      const mockRuns = [
        {
          id: 123,
          name: 'CI',
          head_branch: 'main',
          head_sha: 'abc123',
          status: 'completed',
          conclusion: 'success',
          workflow_id: 1,
          html_url: 'https://github.com/test/repo/actions/runs/123',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:01:00Z',
          run_attempt: 1,
        },
        {
          id: 124,
          name: 'CI',
          head_branch: 'main',
          head_sha: 'abc123',
          status: 'completed',
          conclusion: 'success',
          workflow_id: 1,
          html_url: 'https://github.com/test/repo/actions/runs/124',
          created_at: '2024-01-01T00:02:00Z', // More recent
          updated_at: '2024-01-01T00:03:00Z',
          run_attempt: 1,
        },
      ];

      mockOctokit.rest.actions.listWorkflowRunsForRepo.mockResolvedValue({
        data: { workflow_runs: mockRuns },
      });

      const result = await client.getWorkflowRunForCommit('abc123');

      expect(result?.id).toBe(124);
    });
  });

  describe('retry logic', () => {
    it('should retry on 5xx errors', async () => {
      const error = new Error('Internal server error') as Error & { status: number };
      error.status = 500;

      mockOctokit.rest.actions.listWorkflowRunsForRepo
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: { workflow_runs: [] } });

      const result = await client.listWorkflowRuns();

      expect(result).toEqual([]);
      expect(mockOctokit.rest.actions.listWorkflowRunsForRepo).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 401 errors', async () => {
      const error = new Error('Unauthorized') as Error & { status: number };
      error.status = 401;

      mockOctokit.rest.actions.listWorkflowRunsForRepo.mockRejectedValue(error);

      await expect(client.listWorkflowRuns()).rejects.toThrow(ActionsApiError);
      expect(mockOctokit.rest.actions.listWorkflowRunsForRepo).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 rate limit', async () => {
      const error = new Error('Rate limited') as Error & { status: number };
      error.status = 429;

      mockOctokit.rest.actions.listWorkflowRunsForRepo
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: { workflow_runs: [] } });

      const result = await client.listWorkflowRuns();

      expect(result).toEqual([]);
      expect(mockOctokit.rest.actions.listWorkflowRunsForRepo).toHaveBeenCalledTimes(2);
    });
  });
});

describe('ActionsApiError', () => {
  it('should create error with all properties', () => {
    const originalError = new Error('Original error');
    const error = new ActionsApiError(
      'Test error',
      ActionsApiErrorCode.NOT_FOUND,
      404,
      false,
      originalError
    );

    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ActionsApiErrorCode.NOT_FOUND);
    expect(error.statusCode).toBe(404);
    expect(error.retryable).toBe(false);
    expect(error.originalError).toBe(originalError);
    expect(error.name).toBe('ActionsApiError');
  });

  it('should create retryable error', () => {
    const error = new ActionsApiError(
      'Rate limited',
      ActionsApiErrorCode.RATE_LIMITED,
      429,
      true
    );

    expect(error.retryable).toBe(true);
  });
});
