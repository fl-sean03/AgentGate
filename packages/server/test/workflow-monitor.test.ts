/**
 * Workflow Monitor Tests
 *
 * Tests for GitHub Actions workflow monitoring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorkflowMonitor,
  type MonitorProgressEvent,
} from '../src/github/workflow-monitor.js';
import { ActionsClient, type WorkflowRun, type WorkflowJob } from '../src/github/actions-client.js';

// Mock ActionsClient
vi.mock('../src/github/actions-client.js', () => ({
  ActionsClient: vi.fn(),
  ActionsApiError: class ActionsApiError extends Error {
    constructor(
      message: string,
      public code: string,
      public statusCode?: number,
      public retryable = false
    ) {
      super(message);
    }
  },
  ActionsApiErrorCode: {
    NOT_FOUND: 'not_found',
    UNAUTHORIZED: 'unauthorized',
    RATE_LIMITED: 'rate_limited',
    FORBIDDEN: 'forbidden',
    LOGS_UNAVAILABLE: 'logs_unavailable',
    NETWORK_ERROR: 'network_error',
  },
}));

describe('WorkflowMonitor', () => {
  let mockClient: {
    listWorkflowRuns: ReturnType<typeof vi.fn>;
    getWorkflowRunsForCommit: ReturnType<typeof vi.fn>;
    getWorkflowRunJobs: ReturnType<typeof vi.fn>;
  };
  let monitor: WorkflowMonitor;

  const createMockRun = (overrides: Partial<WorkflowRun> = {}): WorkflowRun => ({
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
    ...overrides,
  });

  const createMockJob = (overrides: Partial<WorkflowJob> = {}): WorkflowJob => ({
    id: 456,
    name: 'build',
    status: 'completed',
    conclusion: 'success',
    started_at: '2024-01-01T00:00:00Z',
    completed_at: '2024-01-01T00:01:00Z',
    steps: [],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      listWorkflowRuns: vi.fn(),
      getWorkflowRunsForCommit: vi.fn(),
      getWorkflowRunJobs: vi.fn(),
    };

    monitor = new WorkflowMonitor(mockClient as unknown as ActionsClient, {
      pollIntervalMs: 10,
      timeoutMs: 1000,
      initialWaitMs: 10,
    });
  });

  describe('waitForCompletion', () => {
    it('should complete successfully when workflow passes', async () => {
      const run = createMockRun({ status: 'completed', conclusion: 'success' });
      mockClient.listWorkflowRuns.mockResolvedValue([run]);

      const result = await monitor.waitForCompletion('main');

      expect(result.overallStatus).toBe('success');
      expect(result.runs).toHaveLength(1);
      expect(result.runs[0]?.status).toBe('success');
      expect(result.timedOut).toBe(false);
    });

    it('should detect failure when workflow fails', async () => {
      const run = createMockRun({ status: 'completed', conclusion: 'failure' });
      const job = createMockJob({
        conclusion: 'failure',
        steps: [{ name: 'Test', status: 'completed', conclusion: 'failure', number: 1 }],
      });

      mockClient.listWorkflowRuns.mockResolvedValue([run]);
      mockClient.getWorkflowRunJobs.mockResolvedValue([job]);

      const result = await monitor.waitForCompletion('main');

      expect(result.overallStatus).toBe('failure');
      expect(result.runs[0]?.status).toBe('failure');
      expect(result.runs[0]?.failedJobs).toHaveLength(1);
      expect(result.runs[0]?.failedJobs[0]?.jobName).toBe('build');
    });

    it('should poll until completion', async () => {
      const inProgressRun = createMockRun({ status: 'in_progress', conclusion: null });
      const completedRun = createMockRun({ status: 'completed', conclusion: 'success' });

      mockClient.listWorkflowRuns
        .mockResolvedValueOnce([inProgressRun])
        .mockResolvedValueOnce([inProgressRun])
        .mockResolvedValueOnce([completedRun]);

      const result = await monitor.waitForCompletion('main');

      expect(result.overallStatus).toBe('success');
      expect(mockClient.listWorkflowRuns).toHaveBeenCalledTimes(3);
    });

    it('should handle timeout', async () => {
      const inProgressRun = createMockRun({ status: 'in_progress', conclusion: null });

      mockClient.listWorkflowRuns.mockResolvedValue([inProgressRun]);

      // Use short timeout for test
      const shortMonitor = new WorkflowMonitor(mockClient as unknown as ActionsClient, {
        pollIntervalMs: 50,
        timeoutMs: 100,
        initialWaitMs: 10,
      });

      const result = await shortMonitor.waitForCompletion('main');

      expect(result.overallStatus).toBe('timeout');
      expect(result.timedOut).toBe(true);
    });

    it('should handle cancellation', async () => {
      const inProgressRun = createMockRun({ status: 'in_progress', conclusion: null });

      mockClient.listWorkflowRuns.mockResolvedValue([inProgressRun]);

      const controller = new AbortController();

      // Cancel after a short delay
      setTimeout(() => controller.abort(), 50);

      const result = await monitor.waitForCompletion('main', controller.signal);

      expect(result.overallStatus).toBe('cancelled');
    });

    it('should handle multiple concurrent workflows', async () => {
      const run1 = createMockRun({ id: 1, name: 'CI', workflow_id: 1 });
      const run2 = createMockRun({ id: 2, name: 'Lint', workflow_id: 2 });

      mockClient.listWorkflowRuns.mockResolvedValue([run1, run2]);

      const result = await monitor.waitForCompletion('main');

      expect(result.overallStatus).toBe('success');
      expect(result.runs).toHaveLength(2);
    });

    it('should fail if any workflow fails', async () => {
      const run1 = createMockRun({ id: 1, name: 'CI', workflow_id: 1, conclusion: 'success' });
      const run2 = createMockRun({ id: 2, name: 'Lint', workflow_id: 2, conclusion: 'failure' });

      mockClient.listWorkflowRuns.mockResolvedValue([run1, run2]);
      mockClient.getWorkflowRunJobs.mockResolvedValue([createMockJob({ conclusion: 'failure' })]);

      const result = await monitor.waitForCompletion('main');

      expect(result.overallStatus).toBe('failure');
    });

    it('should search by SHA when SHA is provided', async () => {
      const sha = 'abc123def456789012345678901234567890abcd';
      const run = createMockRun({ head_sha: sha });

      mockClient.getWorkflowRunsForCommit.mockResolvedValue([run]);

      const result = await monitor.waitForCompletion(sha);

      expect(mockClient.getWorkflowRunsForCommit).toHaveBeenCalledWith(sha);
      expect(mockClient.listWorkflowRuns).not.toHaveBeenCalled();
      expect(result.overallStatus).toBe('success');
    });

    it('should track only most recent run per workflow', async () => {
      const olderRun = createMockRun({
        id: 1,
        workflow_id: 1,
        created_at: '2024-01-01T00:00:00Z',
      });
      const newerRun = createMockRun({
        id: 2,
        workflow_id: 1,
        created_at: '2024-01-01T01:00:00Z',
      });

      mockClient.listWorkflowRuns.mockResolvedValue([olderRun, newerRun]);

      const result = await monitor.waitForCompletion('main');

      expect(result.runs).toHaveLength(1);
      expect(result.runs[0]?.runId).toBe(2);
    });
  });

  describe('progress callbacks', () => {
    it('should emit workflow_detected event', async () => {
      const run = createMockRun();
      mockClient.listWorkflowRuns.mockResolvedValue([run]);

      const events: MonitorProgressEvent[] = [];
      const monitorWithCallback = new WorkflowMonitor(mockClient as unknown as ActionsClient, {
        pollIntervalMs: 10,
        timeoutMs: 1000,
        initialWaitMs: 10,
        onProgress: (event) => events.push(event),
      });

      await monitorWithCallback.waitForCompletion('main');

      const detectedEvent = events.find((e) => e.event === 'workflow_detected');
      expect(detectedEvent).toBeDefined();
      expect(detectedEvent?.data.run).toBeDefined();
    });

    it('should emit workflow_status_changed event', async () => {
      const inProgressRun = createMockRun({ status: 'in_progress', conclusion: null });
      const completedRun = createMockRun({ status: 'completed', conclusion: 'success' });

      mockClient.listWorkflowRuns
        .mockResolvedValueOnce([inProgressRun])
        .mockResolvedValueOnce([completedRun]);

      const events: MonitorProgressEvent[] = [];
      const monitorWithCallback = new WorkflowMonitor(mockClient as unknown as ActionsClient, {
        pollIntervalMs: 10,
        timeoutMs: 1000,
        initialWaitMs: 10,
        onProgress: (event) => events.push(event),
      });

      await monitorWithCallback.waitForCompletion('main');

      const statusChangedEvent = events.find((e) => e.event === 'workflow_status_changed');
      expect(statusChangedEvent).toBeDefined();
      expect(statusChangedEvent?.data.previousStatus).toBe('in_progress');
      expect(statusChangedEvent?.data.newStatus).toBe('success');
    });

    it('should emit polling events', async () => {
      const run = createMockRun();
      mockClient.listWorkflowRuns.mockResolvedValue([run]);

      const events: MonitorProgressEvent[] = [];
      const monitorWithCallback = new WorkflowMonitor(mockClient as unknown as ActionsClient, {
        pollIntervalMs: 10,
        timeoutMs: 1000,
        initialWaitMs: 10,
        onProgress: (event) => events.push(event),
      });

      await monitorWithCallback.waitForCompletion('main');

      const pollingEvents = events.filter((e) => e.event === 'polling');
      expect(pollingEvents.length).toBeGreaterThan(0);
      expect(pollingEvents[0]?.data.totalCount).toBeDefined();
      expect(pollingEvents[0]?.data.completedCount).toBeDefined();
    });

    it('should emit completed event', async () => {
      const run = createMockRun();
      mockClient.listWorkflowRuns.mockResolvedValue([run]);

      const events: MonitorProgressEvent[] = [];
      const monitorWithCallback = new WorkflowMonitor(mockClient as unknown as ActionsClient, {
        pollIntervalMs: 10,
        timeoutMs: 1000,
        initialWaitMs: 10,
        onProgress: (event) => events.push(event),
      });

      await monitorWithCallback.waitForCompletion('main');

      const completedEvent = events.find((e) => e.event === 'completed');
      expect(completedEvent).toBeDefined();
      expect(completedEvent?.data.runs).toBeDefined();
    });
  });

  describe('getLatestRunStatus', () => {
    it('should return current status of workflows', async () => {
      const run = createMockRun({ status: 'in_progress', conclusion: null });
      mockClient.listWorkflowRuns.mockResolvedValue([run]);

      const results = await monitor.getLatestRunStatus('main');

      expect(results).toHaveLength(1);
      expect(results[0]?.status).toBe('in_progress');
    });
  });

  describe('cancel', () => {
    it('should cancel monitoring', async () => {
      const inProgressRun = createMockRun({ status: 'in_progress', conclusion: null });
      mockClient.listWorkflowRuns.mockResolvedValue([inProgressRun]);

      // Start monitoring and cancel immediately
      const promise = monitor.waitForCompletion('main');

      // Small delay then cancel
      await new Promise((resolve) => setTimeout(resolve, 50));
      monitor.cancel();

      const result = await promise;
      expect(result.overallStatus).toBe('cancelled');
    });
  });

  describe('edge cases', () => {
    it('should handle empty workflow list', async () => {
      mockClient.listWorkflowRuns.mockResolvedValue([]);

      // With no workflows, the monitor will keep polling until timeout
      const shortMonitor = new WorkflowMonitor(mockClient as unknown as ActionsClient, {
        pollIntervalMs: 10,
        timeoutMs: 100,
        initialWaitMs: 10,
      });

      const result = await shortMonitor.waitForCompletion('main');

      // No workflows found, will timeout
      expect(result.runs).toHaveLength(0);
    });

    it('should handle queued status', async () => {
      const queuedRun = createMockRun({ status: 'queued', conclusion: null });
      const completedRun = createMockRun({ status: 'completed', conclusion: 'success' });

      mockClient.listWorkflowRuns
        .mockResolvedValueOnce([queuedRun])
        .mockResolvedValueOnce([completedRun]);

      const result = await monitor.waitForCompletion('main');

      expect(result.overallStatus).toBe('success');
    });

    it('should handle cancelled workflow', async () => {
      const run = createMockRun({ status: 'completed', conclusion: 'cancelled' });
      mockClient.listWorkflowRuns.mockResolvedValue([run]);

      const result = await monitor.waitForCompletion('main');

      expect(result.runs[0]?.status).toBe('cancelled');
    });

    it('should handle skipped workflow', async () => {
      const run = createMockRun({ status: 'completed', conclusion: 'skipped' });
      mockClient.listWorkflowRuns.mockResolvedValue([run]);

      const result = await monitor.waitForCompletion('main');

      expect(result.runs[0]?.status).toBe('skipped');
    });

    it('should handle timed_out conclusion', async () => {
      const run = createMockRun({ status: 'completed', conclusion: 'timed_out' });
      mockClient.listWorkflowRuns.mockResolvedValue([run]);
      mockClient.getWorkflowRunJobs.mockResolvedValue([]);

      const result = await monitor.waitForCompletion('main');

      // timed_out is treated as failure
      expect(result.runs[0]?.status).toBe('failure');
    });
  });
});
