/**
 * CI Feedback Generator Tests
 *
 * Tests for generating agent feedback from CI failures.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CIFeedbackGenerator, type CIFeedback } from '../src/orchestrator/ci-feedback.js';
import { type MonitorResult, type WorkflowRunResult } from '../src/github/workflow-monitor.js';
import { type JobLogs, LogDownloader } from '../src/github/log-downloader.js';
import { FailureSummarizer, type CISummary } from '../src/github/failure-summarizer.js';
import { ActionsClient } from '../src/github/actions-client.js';

// Mock the LogDownloader
vi.mock('../src/github/log-downloader.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/github/log-downloader.js')>();
  return {
    ...original,
    LogDownloader: vi.fn().mockImplementation(() => ({
      downloadLogs: vi.fn().mockResolvedValue(new Map()),
    })),
  };
});

describe('CIFeedbackGenerator', () => {
  let mockLogDownloader: LogDownloader;
  let mockFailureSummarizer: FailureSummarizer;
  let generator: CIFeedbackGenerator;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock ActionsClient
    const mockActionsClient = {
      downloadWorkflowLogs: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    } as unknown as ActionsClient;

    mockLogDownloader = new LogDownloader(mockActionsClient);
    mockFailureSummarizer = new FailureSummarizer();
    generator = new CIFeedbackGenerator(mockLogDownloader, mockFailureSummarizer);
  });

  const createMockMonitorResult = (
    runs: Partial<WorkflowRunResult>[] = []
  ): MonitorResult => ({
    overallStatus: runs.some((r) => r.status === 'failure') ? 'failure' : 'success',
    runs: runs.map((r, i) => ({
      workflowName: r.workflowName ?? `Workflow ${i}`,
      runId: r.runId ?? 1000 + i,
      status: r.status ?? 'success',
      url: r.url ?? `https://github.com/test/repo/actions/runs/${1000 + i}`,
      failedJobs: r.failedJobs ?? [],
    })),
    durationMs: 10000,
    timedOut: false,
  });

  describe('generateFeedback', () => {
    it('should generate feedback from CI failure', async () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          runId: 12345,
          url: 'https://github.com/test/repo/actions/runs/12345',
          failedJobs: [{ jobName: 'test', failedStep: 'Run tests', conclusion: 'failure' }],
        },
      ]);

      const feedback = await generator.generateFeedback(
        monitorResult,
        'agentgate/feature-branch',
        42,
        0
      );

      expect(feedback.type).toBe('ci_failure');
      expect(feedback.workflowRunId).toBe(12345);
      expect(feedback.prNumber).toBe(42);
      expect(feedback.previousAttempts).toBe(0);
      expect(feedback.workflowUrl).toBe('https://github.com/test/repo/actions/runs/12345');
    });

    it('should include branch name in prompt', async () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          failedJobs: [{ jobName: 'test', failedStep: 'Test', conclusion: 'failure' }],
        },
      ]);

      const feedback = await generator.generateFeedback(
        monitorResult,
        'agentgate/my-branch',
        1,
        0
      );

      expect(feedback.prompt).toContain('agentgate/my-branch');
      expect(feedback.prompt).toContain('Push to the branch');
    });

    it('should include attempt number in prompt when retrying', async () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          failedJobs: [{ jobName: 'test', failedStep: 'Test', conclusion: 'failure' }],
        },
      ]);

      const feedback = await generator.generateFeedback(
        monitorResult,
        'agentgate/branch',
        1,
        2 // Third attempt
      );

      expect(feedback.prompt).toContain('attempt 3');
      expect(feedback.previousAttempts).toBe(2);
    });

    it('should create minimal feedback when no failed runs found', async () => {
      const monitorResult: MonitorResult = {
        overallStatus: 'timeout',
        runs: [
          {
            workflowName: 'CI',
            runId: 1000,
            status: 'in_progress',
            url: 'https://github.com/test/repo/actions/runs/1000',
            failedJobs: [],
          },
        ],
        durationMs: 30000,
        timedOut: true,
      };

      const feedback = await generator.generateFeedback(
        monitorResult,
        'agentgate/branch',
        1,
        0
      );

      expect(feedback.type).toBe('ci_failure');
      expect(feedback.summary.markdown).toContain('Timed Out');
    });

    it('should handle cancelled workflow', async () => {
      const monitorResult: MonitorResult = {
        overallStatus: 'cancelled',
        runs: [
          {
            workflowName: 'CI',
            runId: 1000,
            status: 'cancelled',
            url: 'https://github.com/test/repo/actions/runs/1000',
            failedJobs: [],
          },
        ],
        durationMs: 5000,
        timedOut: false,
      };

      const feedback = await generator.generateFeedback(
        monitorResult,
        'agentgate/branch',
        1,
        0
      );

      expect(feedback.summary.markdown).toContain('Cancelled');
    });

    it('should handle null PR number', async () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          failedJobs: [{ jobName: 'test', failedStep: 'Test', conclusion: 'failure' }],
        },
      ]);

      const feedback = await generator.generateFeedback(
        monitorResult,
        'agentgate/branch',
        null,
        0
      );

      expect(feedback.prNumber).toBeNull();
    });
  });

  describe('formatForAgent', () => {
    it('should format summary as markdown prompt', () => {
      const summary: CISummary = {
        overallStatus: 'failure',
        totalJobs: 1,
        failedJobs: 1,
        jobSummaries: [],
        actionItems: [],
        markdown: '# CI Failure Report\n\n## Summary\n\n- Test failed',
      };

      const prompt = generator.formatForAgent(summary, 'agentgate/branch', 0);

      expect(prompt).toContain('## Previous CI Failure');
      expect(prompt).toContain('GitHub Actions CI but it failed');
      expect(prompt).toContain('## Instructions');
      expect(prompt).toContain('Fix the issues');
      expect(prompt).toContain('Run `pnpm test` locally');
      expect(prompt).toContain('Push to the branch: `agentgate/branch`');
      expect(prompt).toContain('Do NOT create a new PR');
    });

    it('should include attempt counter when retrying', () => {
      const summary: CISummary = {
        overallStatus: 'failure',
        totalJobs: 1,
        failedJobs: 1,
        jobSummaries: [],
        actionItems: [],
        markdown: '# CI Failure Report\n\n## Summary\n\n- Test failed',
      };

      const prompt = generator.formatForAgent(summary, 'agentgate/branch', 2);

      expect(prompt).toContain('attempt 3');
      expect(prompt).toContain('**Note:**');
    });

    it('should not include attempt counter on first attempt', () => {
      const summary: CISummary = {
        overallStatus: 'failure',
        totalJobs: 1,
        failedJobs: 1,
        jobSummaries: [],
        actionItems: [],
        markdown: '# CI Failure Report\n\n## Summary\n\n- Test failed',
      };

      const prompt = generator.formatForAgent(summary, 'agentgate/branch', 0);

      expect(prompt).not.toContain('attempt');
      expect(prompt).not.toContain('**Note:**');
    });

    it('should strip markdown header from summary', () => {
      const summary: CISummary = {
        overallStatus: 'failure',
        totalJobs: 1,
        failedJobs: 1,
        jobSummaries: [],
        actionItems: [],
        markdown: '# CI Failure Report\n\n## Summary\n\n- **Status:** Failed',
      };

      const prompt = generator.formatForAgent(summary, 'agentgate/branch', 0);

      // Should not have duplicate headers
      expect((prompt.match(/# CI Failure Report/g) || []).length).toBe(0);
      expect(prompt).toContain('## Summary');
    });

    it('should include numbered instructions', () => {
      const summary: CISummary = {
        overallStatus: 'failure',
        totalJobs: 1,
        failedJobs: 1,
        jobSummaries: [],
        actionItems: [],
        markdown: '# CI Failure Report\n\n## Summary\n\n- Failed',
      };

      const prompt = generator.formatForAgent(summary, 'main', 0);

      expect(prompt).toContain('1. Fix the issues');
      expect(prompt).toContain('2. Run `pnpm test`');
      expect(prompt).toContain('3. Commit your fixes');
      expect(prompt).toContain('4. Push to the branch');
    });
  });

  describe('CIFeedback object', () => {
    it('should have correct structure', async () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          runId: 99999,
          failedJobs: [{ jobName: 'build', failedStep: 'Build', conclusion: 'failure' }],
        },
      ]);

      const feedback = await generator.generateFeedback(
        monitorResult,
        'agentgate/test',
        123,
        1
      );

      // Verify structure
      expect(feedback).toHaveProperty('type', 'ci_failure');
      expect(feedback).toHaveProperty('workflowRunId');
      expect(feedback).toHaveProperty('prNumber');
      expect(feedback).toHaveProperty('summary');
      expect(feedback).toHaveProperty('prompt');
      expect(feedback).toHaveProperty('previousAttempts');
      expect(feedback).toHaveProperty('workflowUrl');

      // Verify summary structure
      expect(feedback.summary).toHaveProperty('overallStatus');
      expect(feedback.summary).toHaveProperty('totalJobs');
      expect(feedback.summary).toHaveProperty('failedJobs');
      expect(feedback.summary).toHaveProperty('jobSummaries');
      expect(feedback.summary).toHaveProperty('actionItems');
      expect(feedback.summary).toHaveProperty('markdown');
    });
  });

  describe('error handling', () => {
    it('should handle log download failure gracefully', async () => {
      // Create generator with a mock that throws
      const mockActionsClient = {
        downloadWorkflowLogs: vi.fn().mockRejectedValue(new Error('Network error')),
      } as unknown as ActionsClient;

      const errorLogDownloader = {
        downloadLogs: vi.fn().mockRejectedValue(new Error('Download failed')),
      } as unknown as LogDownloader;

      const errorGenerator = new CIFeedbackGenerator(errorLogDownloader, mockFailureSummarizer);

      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          failedJobs: [{ jobName: 'test', failedStep: 'Test', conclusion: 'failure' }],
        },
      ]);

      // Should not throw, should proceed with empty logs
      const feedback = await errorGenerator.generateFeedback(
        monitorResult,
        'agentgate/branch',
        1,
        0
      );

      expect(feedback.type).toBe('ci_failure');
      // Should still generate some feedback even without logs
      expect(feedback.prompt).toBeTruthy();
    });
  });
});
