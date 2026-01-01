/**
 * CI Feedback Generator Tests
 *
 * Tests for the CIFeedbackGenerator class that connects CI monitoring
 * to the orchestrator's feedback loop.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CIFeedbackGenerator,
  createCIFeedbackGenerator,
  type CIFeedback,
  type GenerateFeedbackOptions,
} from '../src/orchestrator/ci-feedback.js';
import { type MonitorResult, type WorkflowRunResult } from '../src/github/workflow-monitor.js';
import { type JobLogs } from '../src/github/log-downloader.js';
import { FailureSummarizer, type CISummary } from '../src/github/failure-summarizer.js';

// Mock WorkflowMonitor
const createMockWorkflowMonitor = () => ({
  waitForCompletion: vi.fn(),
  getLatestRunStatus: vi.fn(),
  cancel: vi.fn(),
});

// Mock LogDownloader
const createMockLogDownloader = () => ({
  downloadLogs: vi.fn(),
  getLogsForJob: vi.fn(),
});

// Helper to create mock monitor results
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

// Helper to create mock logs
const createMockLogs = (entries: Record<string, string>): JobLogs => {
  return new Map(Object.entries(entries));
};

// Default feedback options
const defaultOptions: GenerateFeedbackOptions = {
  prNumber: 123,
  branchName: 'agentgate/test-branch',
  previousAttempts: 0,
  maxCiIterations: 3,
};

describe('CIFeedbackGenerator', () => {
  let mockWorkflowMonitor: ReturnType<typeof createMockWorkflowMonitor>;
  let mockLogDownloader: ReturnType<typeof createMockLogDownloader>;
  let generator: CIFeedbackGenerator;

  beforeEach(() => {
    mockWorkflowMonitor = createMockWorkflowMonitor();
    mockLogDownloader = createMockLogDownloader();
    generator = new CIFeedbackGenerator(
      mockWorkflowMonitor as never,
      mockLogDownloader as never
    );
  });

  describe('generateFeedback', () => {
    it('should generate feedback from a failed monitor result', async () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          workflowName: 'CI',
          runId: 1001,
          failedJobs: [{ jobName: 'test', failedStep: 'Run tests', conclusion: 'failure' }],
        },
      ]);

      mockLogDownloader.downloadLogs.mockResolvedValue(
        createMockLogs({
          test: `##[group]Run tests
FAIL test/file.test.ts
Error: expected true to be false
Process completed with exit code 1.
##[endgroup]`,
        })
      );

      const feedback = await generator.generateFeedback(monitorResult, defaultOptions);

      expect(feedback.type).toBe('ci_failure');
      expect(feedback.prNumber).toBe(123);
      expect(feedback.branchName).toBe('agentgate/test-branch');
      expect(feedback.previousAttempts).toBe(0);
      expect(feedback.summary.overallStatus).toBe('failure');
      expect(feedback.prompt).toContain('CI Failure');
    });

    it('should include workflow URLs', async () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          runId: 2001,
          url: 'https://github.com/test/repo/actions/runs/2001',
        },
      ]);

      mockLogDownloader.downloadLogs.mockResolvedValue(createMockLogs({}));

      const feedback = await generator.generateFeedback(monitorResult, defaultOptions);

      expect(feedback.workflowUrls).toContain('https://github.com/test/repo/actions/runs/2001');
    });

    it('should handle multiple failed runs', async () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          workflowName: 'CI',
          runId: 1001,
          failedJobs: [{ jobName: 'test', failedStep: 'Run tests', conclusion: 'failure' }],
        },
        {
          status: 'failure',
          workflowName: 'Lint',
          runId: 1002,
          failedJobs: [{ jobName: 'lint', failedStep: 'Lint', conclusion: 'failure' }],
        },
      ]);

      mockLogDownloader.downloadLogs.mockResolvedValue(createMockLogs({}));

      const feedback = await generator.generateFeedback(monitorResult, defaultOptions);

      expect(feedback.workflowUrls.length).toBe(2);
    });

    it('should continue if log download fails', async () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          runId: 1001,
          failedJobs: [{ jobName: 'test', failedStep: 'Test', conclusion: 'failure' }],
        },
      ]);

      mockLogDownloader.downloadLogs.mockRejectedValue(new Error('Network error'));

      // Should not throw
      const feedback = await generator.generateFeedback(monitorResult, defaultOptions);

      expect(feedback.type).toBe('ci_failure');
      expect(feedback.summary.overallStatus).toBe('failure');
    });

    it('should track previous attempts', async () => {
      const monitorResult = createMockMonitorResult([{ status: 'failure' }]);
      mockLogDownloader.downloadLogs.mockResolvedValue(createMockLogs({}));

      const options: GenerateFeedbackOptions = {
        ...defaultOptions,
        previousAttempts: 2,
      };

      const feedback = await generator.generateFeedback(monitorResult, options);

      expect(feedback.previousAttempts).toBe(2);
      expect(feedback.prompt).toContain('attempt 3');
    });

    it('should only download logs for failed runs', async () => {
      const monitorResult = createMockMonitorResult([
        { status: 'success', runId: 1001 },
        { status: 'failure', runId: 1002 },
      ]);

      mockLogDownloader.downloadLogs.mockResolvedValue(createMockLogs({}));

      await generator.generateFeedback(monitorResult, defaultOptions);

      // Should only be called once for the failed run
      expect(mockLogDownloader.downloadLogs).toHaveBeenCalledTimes(1);
      expect(mockLogDownloader.downloadLogs).toHaveBeenCalledWith(1002);
    });
  });

  describe('formatForAgent', () => {
    const failureSummarizer = new FailureSummarizer();

    const createMockSummary = (overrides: Partial<CISummary> = {}): CISummary => ({
      overallStatus: 'failure',
      totalJobs: 1,
      failedJobs: 1,
      jobSummaries: [],
      actionItems: [],
      markdown: '# CI Failure Report\n\n## Summary\n\n- **Status:** Failed\n- **Failed Jobs:** 1 of 1',
      ...overrides,
    });

    it('should include CI failure header', () => {
      const summary = createMockSummary();

      const prompt = generator.formatForAgent(summary, defaultOptions);

      expect(prompt).toContain('## Previous CI Failure');
      expect(prompt).toContain('GitHub Actions CI but it failed');
    });

    it('should include instructions', () => {
      const summary = createMockSummary();

      const prompt = generator.formatForAgent(summary, defaultOptions);

      expect(prompt).toContain('## Instructions');
      expect(prompt).toContain('Fix the issues identified above');
      expect(prompt).toContain('Run `pnpm test` locally');
      expect(prompt).toContain('Commit your fixes');
      expect(prompt).toContain('Push to the branch');
    });

    it('should include branch name', () => {
      const summary = createMockSummary();

      const prompt = generator.formatForAgent(summary, {
        ...defaultOptions,
        branchName: 'agentgate/my-feature',
      });

      expect(prompt).toContain('`agentgate/my-feature`');
    });

    it('should warn about not creating new PR', () => {
      const summary = createMockSummary();

      const prompt = generator.formatForAgent(summary, defaultOptions);

      expect(prompt).toContain('Do NOT create a new PR');
    });

    it('should include attempt counter on subsequent attempts', () => {
      const summary = createMockSummary();

      const prompt = generator.formatForAgent(summary, {
        ...defaultOptions,
        previousAttempts: 1,
      });

      expect(prompt).toContain('attempt 2 of 3');
    });

    it('should warn about remaining attempts', () => {
      const summary = createMockSummary();

      const prompt = generator.formatForAgent(summary, {
        ...defaultOptions,
        previousAttempts: 2,
        maxCiIterations: 3,
      });

      expect(prompt).toContain('Warning');
      expect(prompt).toContain('attempt(s) remaining');
    });

    it('should include the markdown summary', () => {
      const summary = createMockSummary({
        markdown: '# CI Failure Report\n\nTest failure details here',
      });

      const prompt = generator.formatForAgent(summary, defaultOptions);

      expect(prompt).toContain('# CI Failure Report');
      expect(prompt).toContain('Test failure details here');
    });
  });

  describe('getWorkflowMonitor', () => {
    it('should return the workflow monitor', () => {
      expect(generator.getWorkflowMonitor()).toBe(mockWorkflowMonitor);
    });
  });

  describe('getLogDownloader', () => {
    it('should return the log downloader', () => {
      expect(generator.getLogDownloader()).toBe(mockLogDownloader);
    });
  });

  describe('log truncation', () => {
    it('should truncate long logs', async () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          runId: 1001,
          failedJobs: [{ jobName: 'test', failedStep: 'Test', conclusion: 'failure' }],
        },
      ]);

      // Create a very long log
      const longLog = 'x'.repeat(10000);
      mockLogDownloader.downloadLogs.mockResolvedValue(createMockLogs({ test: longLog }));

      // Create generator with custom config
      const generatorWithConfig = new CIFeedbackGenerator(
        mockWorkflowMonitor as never,
        mockLogDownloader as never,
        undefined,
        { maxLogSnippetLength: 1000 }
      );

      const feedback = await generatorWithConfig.generateFeedback(monitorResult, defaultOptions);

      // The truncated log should be in the summary/prompt somewhere
      expect(feedback.prompt.length).toBeLessThan(longLog.length);
    });
  });
});

describe('createCIFeedbackGenerator', () => {
  it('should create a CIFeedbackGenerator instance', () => {
    const mockWorkflowMonitor = createMockWorkflowMonitor();
    const mockLogDownloader = createMockLogDownloader();

    const generator = createCIFeedbackGenerator(
      mockWorkflowMonitor as never,
      mockLogDownloader as never
    );

    expect(generator).toBeInstanceOf(CIFeedbackGenerator);
  });

  it('should accept custom config', () => {
    const mockWorkflowMonitor = createMockWorkflowMonitor();
    const mockLogDownloader = createMockLogDownloader();

    const generator = createCIFeedbackGenerator(
      mockWorkflowMonitor as never,
      mockLogDownloader as never,
      { maxLogSnippetLength: 2000 }
    );

    expect(generator).toBeInstanceOf(CIFeedbackGenerator);
  });
});
