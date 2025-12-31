import type { Run, WorkOrder } from '../types/index.js';
import type { RunSummary } from '../types/summary.js';
import { getRunDir } from './paths.js';

export function generateRunSummary(
  run: Run,
  workOrder: WorkOrder
): RunSummary {
  const status: RunSummary['status'] =
    run.result === 'passed'
      ? 'succeeded'
      : run.result === 'canceled'
        ? 'canceled'
        : 'failed';

  const duration = run.completedAt
    ? run.completedAt.getTime() - run.startedAt.getTime()
    : Date.now() - run.startedAt.getTime();

  // Get workspace path based on source type
  let workspacePath: string;
  switch (workOrder.workspaceSource.type) {
    case 'local':
      workspacePath = workOrder.workspaceSource.path;
      break;
    case 'git':
      workspacePath = workOrder.workspaceSource.url;
      break;
    case 'fresh':
      workspacePath = workOrder.workspaceSource.destPath;
      break;
    case 'github':
      workspacePath = `github:${workOrder.workspaceSource.owner}/${workOrder.workspaceSource.repo}`;
      break;
    case 'github-new':
      workspacePath = `github:${workOrder.workspaceSource.owner}/${workOrder.workspaceSource.repoName}`;
      break;
  }

  return {
    runId: run.id,
    workOrderId: run.workOrderId,
    taskPrompt: workOrder.taskPrompt.slice(0, 200),
    workspacePath,
    status,
    iterations: run.iteration,
    duration,
    finalSnapshotSha: run.snapshotAfterSha,
    verificationPassed: run.result === 'passed',
    startedAt: run.startedAt,
    completedAt: run.completedAt ?? new Date(),
    artifactsPath: getRunDir(run.id),
  };
}

export function formatRunReport(summary: RunSummary): string {
  const statusEmoji =
    summary.status === 'succeeded'
      ? 'PASSED'
      : summary.status === 'canceled'
        ? 'CANCELED'
        : 'FAILED';

  const durationStr = formatDuration(summary.duration);

  return `
AgentGate Run Report
====================

Run ID: ${summary.runId}
Work Order: ${summary.workOrderId}
Status: ${statusEmoji}

Task:
${summary.taskPrompt}

Workspace: ${summary.workspacePath}
Duration: ${durationStr}
Iterations: ${summary.iterations}

Final Snapshot: ${summary.finalSnapshotSha ?? 'N/A'}
Verification: ${summary.verificationPassed ? 'PASSED' : 'FAILED'}

Started: ${summary.startedAt.toISOString()}
Completed: ${summary.completedAt.toISOString()}

Artifacts: ${summary.artifactsPath}
`.trim();
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
