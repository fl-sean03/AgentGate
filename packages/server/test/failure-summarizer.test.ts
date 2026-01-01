/**
 * Failure Summarizer Tests
 *
 * Tests for CI failure summarization.
 */

import { describe, it, expect } from 'vitest';
import {
  FailureSummarizer,
  type CISummary,
} from '../src/github/failure-summarizer.js';
import { type MonitorResult, type WorkflowRunResult } from '../src/github/workflow-monitor.js';
import { type JobLogs } from '../src/github/log-downloader.js';

describe('FailureSummarizer', () => {
  const summarizer = new FailureSummarizer();

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

  const createMockLogs = (entries: Record<string, string>): JobLogs => {
    return new Map(Object.entries(entries));
  };

  describe('summarize', () => {
    it('should summarize successful runs', () => {
      const monitorResult = createMockMonitorResult([{ status: 'success' }]);
      const logs = createMockLogs({});

      const summary = summarizer.summarize(monitorResult, logs);

      expect(summary.overallStatus).toBe('success');
      expect(summary.failedJobs).toBe(0);
      expect(summary.jobSummaries).toHaveLength(0);
    });

    it('should summarize failed runs', () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          failedJobs: [{ jobName: 'build', failedStep: 'Test', conclusion: 'failure' }],
        },
      ]);

      const logs = createMockLogs({
        build: `##[group]Test
FAIL test/file.test.ts
Process completed with exit code 1.
##[endgroup]`,
      });

      const summary = summarizer.summarize(monitorResult, logs);

      expect(summary.overallStatus).toBe('failure');
      expect(summary.failedJobs).toBe(1);
      expect(summary.jobSummaries).toHaveLength(1);
      expect(summary.jobSummaries[0]?.status).toBe('failure');
    });

    it('should generate action items', () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          failedJobs: [{ jobName: 'test', failedStep: 'Run tests', conclusion: 'failure' }],
        },
      ]);

      const logs = createMockLogs({
        test: `##[group]Run tests
 FAIL  test/config.test.ts > Configuration > test
AssertionError: expected 1 to be 2
 ❯ test/config.test.ts:10:19
Process completed with exit code 1.
##[endgroup]`,
      });

      const summary = summarizer.summarize(monitorResult, logs);

      expect(summary.actionItems.length).toBeGreaterThan(0);
      expect(summary.actionItems[0]?.category).toBe('test');
    });

    it('should handle multiple failed jobs', () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          failedJobs: [
            { jobName: 'test', failedStep: 'Run tests', conclusion: 'failure' },
            { jobName: 'lint', failedStep: 'Lint', conclusion: 'failure' },
          ],
        },
      ]);

      const logs = createMockLogs({
        test: `##[group]Run tests
FAIL test/file.test.ts
Process completed with exit code 1.
##[endgroup]`,
        lint: `##[group]Lint
/src/index.ts
  5:1  error  Error message  rule-name
Process completed with exit code 1.
##[endgroup]`,
      });

      const summary = summarizer.summarize(monitorResult, logs);

      expect(summary.failedJobs).toBe(2);
    });

    it('should generate markdown output', () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          failedJobs: [{ jobName: 'build', failedStep: 'Test', conclusion: 'failure' }],
        },
      ]);

      const logs = createMockLogs({
        build: `##[group]Test
FAIL test/file.test.ts
Process completed with exit code 1.
##[endgroup]`,
      });

      const summary = summarizer.summarize(monitorResult, logs);

      expect(summary.markdown).toContain('# CI Failure Report');
      expect(summary.markdown).toContain('## Summary');
      expect(summary.markdown).toContain('## Failed Jobs');
    });

    it('should find logs with case-insensitive matching', () => {
      const monitorResult = createMockMonitorResult([
        {
          status: 'failure',
          failedJobs: [{ jobName: 'Build', failedStep: 'Test', conclusion: 'failure' }],
        },
      ]);

      const logs = createMockLogs({
        build: `##[group]Test
##[error]Error occurred
Process completed with exit code 1.
##[endgroup]`,
      });

      const summary = summarizer.summarize(monitorResult, logs);

      expect(summary.jobSummaries).toHaveLength(1);
      expect(summary.jobSummaries[0]?.status).toBe('failure');
    });
  });

  describe('summarizeJob', () => {
    it('should summarize job with no logs', () => {
      const summary = summarizer.summarizeJob('build', null);

      expect(summary.jobName).toBe('build');
      expect(summary.status).toBe('failure');
      expect(summary.failedSteps).toHaveLength(0);
      expect(summary.errorCount).toBe(0);
    });

    it('should summarize job with TypeScript errors', () => {
      const logs = `##[group]Typecheck
src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/index.ts(20,3): error TS2339: Property 'x' does not exist on type 'Y'.
Process completed with exit code 1.
##[endgroup]`;

      const summary = summarizer.summarizeJob('typecheck', logs);

      expect(summary.status).toBe('failure');
      expect(summary.failedSteps).toHaveLength(1);
      expect(summary.errorCount).toBe(2);
      expect(summary.failedSteps[0]?.category).toBe('typecheck');
    });

    it('should summarize job with lint errors', () => {
      const logs = `##[group]Lint
/home/runner/src/index.ts
  10:5  error  Description  rule-name
  20:3  error  Another issue  other-rule
Process completed with exit code 1.
##[endgroup]`;

      const summary = summarizer.summarizeJob('lint', logs);

      expect(summary.status).toBe('failure');
      expect(summary.failedSteps[0]?.category).toBe('lint');
      expect(summary.errorCount).toBe(2);
    });

    it('should summarize job with test failures', () => {
      const logs = `##[group]Test
 FAIL  test/config.test.ts > Configuration > should work
AssertionError: expected true to be false
 ❯ test/config.test.ts:25:10
Process completed with exit code 1.
##[endgroup]`;

      const summary = summarizer.summarizeJob('test', logs);

      expect(summary.status).toBe('failure');
      expect(summary.failedSteps[0]?.category).toBe('test');
    });

    it('should return success for passing job', () => {
      const logs = `##[group]Build
Building project...
Build completed successfully.
Process completed with exit code 0.
##[endgroup]`;

      const summary = summarizer.summarizeJob('build', logs);

      expect(summary.status).toBe('success');
      expect(summary.failedSteps).toHaveLength(0);
    });
  });

  describe('generateActionItems', () => {
    it('should generate high priority for test failures', () => {
      const summary = summarizer.summarize(
        createMockMonitorResult([
          {
            status: 'failure',
            failedJobs: [{ jobName: 'test', failedStep: 'Test', conclusion: 'failure' }],
          },
        ]),
        createMockLogs({
          test: `##[group]Test
 FAIL  test/file.test.ts > test
Error: assertion failed
 ❯ test/file.test.ts:10:5
Process completed with exit code 1.
##[endgroup]`,
        })
      );

      const testItem = summary.actionItems.find((i) => i.category === 'test');
      expect(testItem?.priority).toBe('high');
    });

    it('should generate medium priority for lint errors', () => {
      const summary = summarizer.summarize(
        createMockMonitorResult([
          {
            status: 'failure',
            failedJobs: [{ jobName: 'lint', failedStep: 'Lint', conclusion: 'failure' }],
          },
        ]),
        createMockLogs({
          lint: `##[group]Lint
/src/index.ts
  5:1  error  Error  rule-name
Process completed with exit code 1.
##[endgroup]`,
        })
      );

      const lintItem = summary.actionItems.find((i) => i.category === 'lint');
      expect(lintItem?.priority).toBe('medium');
    });

    it('should deduplicate similar errors', () => {
      const summary = summarizer.summarize(
        createMockMonitorResult([
          {
            status: 'failure',
            failedJobs: [{ jobName: 'typecheck', failedStep: 'Check', conclusion: 'failure' }],
          },
        ]),
        createMockLogs({
          typecheck: `##[group]Check
src/file.ts(10,5): error TS2322: Same error
src/file.ts(10,5): error TS2322: Same error
src/file.ts(10,5): error TS2322: Same error
Process completed with exit code 1.
##[endgroup]`,
        })
      );

      // Should deduplicate
      const items = summary.actionItems.filter((i) => i.category === 'typecheck');
      expect(items.length).toBeLessThanOrEqual(1);
    });

    it('should limit action items', () => {
      // Generate many errors
      const errors: string[] = [];
      for (let i = 0; i < 50; i++) {
        errors.push(`src/file${i}.ts(${i},1): error TS2322: Error ${i}`);
      }

      const summary = summarizer.summarize(
        createMockMonitorResult([
          {
            status: 'failure',
            failedJobs: [{ jobName: 'typecheck', failedStep: 'Check', conclusion: 'failure' }],
          },
        ]),
        createMockLogs({
          typecheck: `##[group]Check
${errors.join('\n')}
Process completed with exit code 1.
##[endgroup]`,
        })
      );

      expect(summary.actionItems.length).toBeLessThanOrEqual(10);
    });

    it('should include files in action items', () => {
      const summary = summarizer.summarize(
        createMockMonitorResult([
          {
            status: 'failure',
            failedJobs: [{ jobName: 'typecheck', failedStep: 'Check', conclusion: 'failure' }],
          },
        ]),
        createMockLogs({
          typecheck: `##[group]Check
src/github/client.ts(10,5): error TS2322: Type error
Process completed with exit code 1.
##[endgroup]`,
        })
      );

      const item = summary.actionItems.find((i) => i.category === 'typecheck');
      expect(item?.files).toContain('src/github/client.ts');
    });
  });

  describe('formatAsMarkdown', () => {
    it('should include summary section', () => {
      const summary: CISummary = {
        overallStatus: 'failure',
        totalJobs: 3,
        failedJobs: 1,
        jobSummaries: [],
        actionItems: [],
        markdown: '',
      };

      const markdown = summarizer.formatAsMarkdown(summary);

      expect(markdown).toContain('# CI Failure Report');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('**Status:** Failed');
      expect(markdown).toContain('**Failed Jobs:** 1 of 3');
    });

    it('should include failed jobs section', () => {
      const summary: CISummary = {
        overallStatus: 'failure',
        totalJobs: 1,
        failedJobs: 1,
        jobSummaries: [
          {
            jobName: 'test',
            status: 'failure',
            failedSteps: [
              {
                stepName: 'Run tests',
                category: 'test',
                errors: [
                  {
                    message: 'Test failed',
                    file: 'test/file.test.ts',
                    line: 10,
                    code: null,
                    context: null,
                  },
                ],
                logSnippet: 'test log',
              },
            ],
            errorCount: 1,
          },
        ],
        actionItems: [],
        markdown: '',
      };

      const markdown = summarizer.formatAsMarkdown(summary);

      expect(markdown).toContain('## Failed Jobs');
      expect(markdown).toContain('### test - FAILED');
      expect(markdown).toContain('#### Step: Run tests');
    });

    it('should include action items section', () => {
      const summary: CISummary = {
        overallStatus: 'failure',
        totalJobs: 1,
        failedJobs: 1,
        jobSummaries: [],
        actionItems: [
          {
            priority: 'high',
            category: 'test',
            description: 'Fix failing test in `test/file.test.ts`',
            files: ['test/file.test.ts'],
          },
        ],
        markdown: '',
      };

      const markdown = summarizer.formatAsMarkdown(summary);

      expect(markdown).toContain('## Action Items');
      expect(markdown).toContain('[HIGH]');
      expect(markdown).toContain('Fix failing test');
    });

    it('should include instructions section', () => {
      const summary: CISummary = {
        overallStatus: 'failure',
        totalJobs: 1,
        failedJobs: 1,
        jobSummaries: [],
        actionItems: [],
        markdown: '',
      };

      const markdown = summarizer.formatAsMarkdown(summary);

      expect(markdown).toContain('## Instructions');
      expect(markdown).toContain('fix these issues');
      expect(markdown).toContain('HIGH priority');
    });

    it('should truncate very long output', () => {
      // Create many failed steps to generate enough content to trigger truncation
      const manyFailedSteps = Array(50)
        .fill(null)
        .map((_, stepIdx) => ({
          stepName: `Test Step ${stepIdx}`,
          category: 'test' as const,
          errors: Array(10)
            .fill(null)
            .map((_, i) => ({
              message: `Error ${stepIdx}-${i}: ${'x'.repeat(200)}`,
              file: `file${stepIdx}-${i}.ts`,
              line: i,
              code: null,
              context: null,
            })),
          logSnippet: 'x'.repeat(1000),
        }));

      const summary: CISummary = {
        overallStatus: 'failure',
        totalJobs: 1,
        failedJobs: 1,
        jobSummaries: [
          {
            jobName: 'test',
            status: 'failure',
            failedSteps: manyFailedSteps,
            errorCount: 500,
          },
        ],
        actionItems: [],
        markdown: '',
      };

      const markdown = summarizer.formatAsMarkdown(summary);

      expect(markdown.length).toBeLessThanOrEqual(5200);
      expect(markdown).toContain('truncated');
    });

    it('should format file locations correctly', () => {
      const summary: CISummary = {
        overallStatus: 'failure',
        totalJobs: 1,
        failedJobs: 1,
        jobSummaries: [
          {
            jobName: 'typecheck',
            status: 'failure',
            failedSteps: [
              {
                stepName: 'Check',
                category: 'typecheck',
                errors: [
                  {
                    message: 'Type error',
                    file: 'src/index.ts',
                    line: 42,
                    code: 'TS2322',
                    context: null,
                  },
                ],
                logSnippet: '',
              },
            ],
            errorCount: 1,
          },
        ],
        actionItems: [],
        markdown: '',
      };

      const markdown = summarizer.formatAsMarkdown(summary);

      expect(markdown).toContain('`src/index.ts:42`');
    });
  });
});
