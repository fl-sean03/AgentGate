// Run State (State Machine States)
export const RunState = {
  QUEUED: 'queued',
  LEASED: 'leased',
  BUILDING: 'building',
  SNAPSHOTTING: 'snapshotting',
  VERIFYING: 'verifying',
  FEEDBACK: 'feedback',
  PR_CREATED: 'pr_created',
  CI_POLLING: 'ci_polling',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const;

export type RunState = (typeof RunState)[keyof typeof RunState];

// Run Events
export const RunEvent = {
  WORKSPACE_ACQUIRED: 'workspace_acquired',
  BUILD_STARTED: 'build_started',
  BUILD_COMPLETED: 'build_completed',
  BUILD_FAILED: 'build_failed',
  SNAPSHOT_COMPLETED: 'snapshot_completed',
  SNAPSHOT_FAILED: 'snapshot_failed',
  VERIFY_PASSED: 'verify_passed',
  VERIFY_FAILED_RETRYABLE: 'verify_failed_retryable',
  VERIFY_FAILED_TERMINAL: 'verify_failed_terminal',
  FEEDBACK_GENERATED: 'feedback_generated',
  PR_CREATED: 'pr_created',
  CI_POLLING_STARTED: 'ci_polling_started',
  CI_PASSED: 'ci_passed',
  CI_FAILED: 'ci_failed',
  CI_TIMEOUT: 'ci_timeout',
  USER_CANCELED: 'user_canceled',
  SYSTEM_ERROR: 'system_error',
} as const;

export type RunEvent = (typeof RunEvent)[keyof typeof RunEvent];

// Run Result
export const RunResult = {
  PASSED: 'passed',
  FAILED_VERIFICATION: 'failed_verification',
  FAILED_BUILD: 'failed_build',
  FAILED_TIMEOUT: 'failed_timeout',
  FAILED_ERROR: 'failed_error',
  CANCELED: 'canceled',
} as const;

export type RunResult = (typeof RunResult)[keyof typeof RunResult];

// Run Warning (v0.2.10 - Thrust 13)
export interface RunWarning {
  type: string;
  message: string;
  iteration: number;
  timestamp: Date;
}

// Run
export interface Run {
  id: string;
  workOrderId: string;
  workspaceId: string;
  iteration: number;
  maxIterations: number;
  state: RunState;
  snapshotBeforeSha: string | null;
  snapshotAfterSha: string | null;
  snapshotIds: string[];
  startedAt: Date;
  completedAt: Date | null;
  result: RunResult | null;
  error: string | null;
  sessionId: string | null;
  // GitHub integration (v0.2.4)
  gitHubBranch: string | null;
  gitHubPrUrl: string | null;
  gitHubPrNumber: number | null;
  // Warnings for non-fatal issues (v0.2.10 - Thrust 13)
  warnings: RunWarning[];
}

// Iteration Data
export interface IterationData {
  iteration: number;
  state: RunState;
  snapshotId: string | null;
  verificationPassed: boolean | null;
  feedbackGenerated: boolean;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
}

// Run Status (for queries)
export interface RunStatus {
  runId: string;
  state: RunState;
  iteration: number;
  maxIterations: number;
  progress: string;
  elapsedMs: number;
}
