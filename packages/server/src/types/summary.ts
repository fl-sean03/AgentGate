// Run Summary
export interface RunSummary {
  runId: string;
  workOrderId: string;
  taskPrompt: string;
  workspacePath: string;
  status: 'succeeded' | 'failed' | 'canceled';
  iterations: number;
  duration: number;
  finalSnapshotSha: string | null;
  verificationPassed: boolean;
  startedAt: Date;
  completedAt: Date;
  artifactsPath: string;
}

// Storage Usage
export interface StorageUsage {
  totalBytes: number;
  workspacesBytes: number;
  runsBytes: number;
  snapshotsBytes: number;
  tempBytes: number;
}

// Cleanup Result
export interface CleanupResult {
  deletedRuns: number;
  deletedTempFiles: number;
  deletedLeases: number;
  freedBytes: number;
}

// Retention Policy
export interface RetentionPolicy {
  maxRunAgeDays: number;
  maxRunCount: number;
  keepFailedRuns: boolean;
  keepSucceededRuns: boolean;
}

// Daemon Status
export interface DaemonStatus {
  running: boolean;
  currentRunId: string | null;
  queueSize: number;
  uptime: number;
  lastActivity: Date | null;
}
