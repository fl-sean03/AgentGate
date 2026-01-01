import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir } from 'node:fs/promises';

let agentGateRoot: string | null = null;

export function getAgentGateRoot(): string {
  if (agentGateRoot) {
    return agentGateRoot;
  }

  agentGateRoot = process.env['AGENTGATE_ROOT'] ?? join(homedir(), '.agentgate');
  return agentGateRoot;
}

export function setAgentGateRoot(root: string): void {
  agentGateRoot = root;
}

export function getWorkspacesDir(): string {
  return join(getAgentGateRoot(), 'workspaces');
}

export function getWorkOrdersDir(): string {
  return join(getAgentGateRoot(), 'work-orders');
}

export function getRunsDir(): string {
  return join(getAgentGateRoot(), 'runs');
}

export function getLeasesDir(): string {
  return join(getAgentGateRoot(), 'leases');
}

export function getSnapshotsDir(): string {
  return join(getAgentGateRoot(), 'snapshots');
}

export function getTmpDir(): string {
  return join(getAgentGateRoot(), 'tmp');
}

// Workspace paths
export function getWorkspacePath(id: string): string {
  return join(getWorkspacesDir(), `${id}.json`);
}

// Work order paths
export function getWorkOrderPath(id: string): string {
  return join(getWorkOrdersDir(), `${id}.json`);
}

// Lease paths
export function getLeasePath(id: string): string {
  return join(getLeasesDir(), `${id}.json`);
}

// Run paths
export function getRunDir(runId: string): string {
  return join(getRunsDir(), runId);
}

export function getRunMetadataPath(runId: string): string {
  return join(getRunDir(runId), 'run.json');
}

export function getRunWorkOrderPath(runId: string): string {
  return join(getRunDir(runId), 'work-order.json');
}

export function getRunGatePlanPath(runId: string): string {
  return join(getRunDir(runId), 'gate-plan.json');
}

export function getRunSummaryPath(runId: string): string {
  return join(getRunDir(runId), 'summary.json');
}

// Iteration paths
export function getIterationDir(runId: string, iteration: number): string {
  return join(getRunDir(runId), 'iterations', iteration.toString());
}

export function getIterationMetadataPath(runId: string, iteration: number): string {
  return join(getIterationDir(runId, iteration), 'iteration.json');
}

export function getAgentLogsPath(runId: string, iteration: number): string {
  return join(getIterationDir(runId, iteration), 'agent-logs.txt');
}

export function getSnapshotMetadataPath(runId: string, iteration: number): string {
  return join(getIterationDir(runId, iteration), 'snapshot.json');
}

export function getPatchPath(runId: string, iteration: number): string {
  return join(getIterationDir(runId, iteration), 'patch.diff');
}

export function getFeedbackPath(runId: string, iteration: number): string {
  return join(getIterationDir(runId, iteration), 'feedback.json');
}

// Verification paths
export function getVerificationDir(runId: string, iteration: number): string {
  return join(getIterationDir(runId, iteration), 'verification');
}

export function getVerificationReportPath(runId: string, iteration: number): string {
  return join(getVerificationDir(runId, iteration), 'report.json');
}

export function getVerificationLogsPath(
  runId: string,
  iteration: number,
  level: string
): string {
  return join(getVerificationDir(runId, iteration), `${level.toLowerCase()}-logs.txt`);
}

// Metrics paths (v0.2.5)
export function getMetricsDir(runId: string): string {
  return join(getRunDir(runId), 'metrics');
}

export function getMetricsIterationsDir(runId: string): string {
  return join(getMetricsDir(runId), 'iterations');
}

export function getIterationMetricsPath(runId: string, iteration: number): string {
  return join(getMetricsIterationsDir(runId), `${iteration}.json`);
}

export function getRunMetricsPath(runId: string): string {
  return join(getMetricsDir(runId), 'run-metrics.json');
}

// Tree paths (v0.2.10)
export function getTreesDir(): string {
  return join(getAgentGateRoot(), 'trees');
}

export function getTreePath(rootId: string): string {
  return join(getTreesDir(), `${rootId}.json`);
}

// Audit paths (v0.2.16 - Thrust 11)
export function getAuditDir(): string {
  return join(getAgentGateRoot(), 'audit');
}

export function getAuditPath(runId: string): string {
  return join(getAuditDir(), `${runId}.json`);
}

// Ensure directories exist
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function ensureRunStructure(runId: string): Promise<void> {
  await ensureDir(getRunDir(runId));
}

export async function ensureIterationStructure(
  runId: string,
  iteration: number
): Promise<void> {
  await ensureDir(getIterationDir(runId, iteration));
  await ensureDir(getVerificationDir(runId, iteration));
}

export async function ensureAllDirs(): Promise<void> {
  await Promise.all([
    ensureDir(getWorkspacesDir()),
    ensureDir(getWorkOrdersDir()),
    ensureDir(getRunsDir()),
    ensureDir(getLeasesDir()),
    ensureDir(getSnapshotsDir()),
    ensureDir(getTmpDir()),
    ensureDir(getTreesDir()),
    ensureDir(getAuditDir()),
  ]);
}
