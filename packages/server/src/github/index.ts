/**
 * GitHub Integration Module
 *
 * Exports for GitHub Actions API integration and CI monitoring.
 */

// Actions Client
export {
  ActionsClient,
  ActionsApiError,
  ActionsApiErrorCode,
  type ActionsClientOptions,
  type WorkflowRun,
  type WorkflowRunStatus,
  type WorkflowRunConclusion,
  type WorkflowJob,
  type WorkflowJobStatus,
  type WorkflowJobConclusion,
  type WorkflowStep,
  type WorkflowStepStatus,
  type WorkflowStepConclusion,
  type ListWorkflowRunsOptions,
} from './actions-client.js';

// Workflow Monitor
export {
  WorkflowMonitor,
  type MonitorOptions,
  type MonitorResult,
  type WorkflowRunResult,
  type FailedJobInfo,
  type MonitorEventType,
  type MonitorProgressEvent,
  type MonitorProgressCallback,
} from './workflow-monitor.js';

// Log Downloader
export {
  LogDownloader,
  stripAnsiCodes,
  type JobLogs as DownloadedJobLogs,
} from './log-downloader.js';

// Log Parser
export {
  LogParser,
  type ParsedLog,
  type ParsedStep,
  type ParsedError,
  type FailedStep,
  type ErrorCategory,
} from './log-parser.js';

// Failure Summarizer
export {
  FailureSummarizer,
  type JobLogs,
  type CISummary,
  type JobSummary,
  type StepFailure,
  type ErrorInfo,
  type ActionItem,
  type ActionPriority,
} from './failure-summarizer.js';
