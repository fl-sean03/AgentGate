/**
 * Run data persistence.
 * Stores and retrieves run state and iteration data.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { RunState, IterationErrorType, type Run, type IterationData, type RunStatus } from '../types/index.js';
import { getRunDir, ensureRunStructure } from '../artifacts/paths.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('run-store');

/**
 * Save a run to disk.
 */
export async function saveRun(run: Run): Promise<void> {
  await ensureRunStructure(run.id);
  const runDir = getRunDir(run.id);
  const runFile = join(runDir, 'run.json');

  await writeFile(runFile, JSON.stringify(run, null, 2));
  log.debug({ runId: run.id, state: run.state }, 'Run saved');
}

/**
 * Load a run from disk.
 */
export async function loadRun(runId: string): Promise<Run | null> {
  try {
    const runDir = getRunDir(runId);
    const runFile = join(runDir, 'run.json');
    const content = await readFile(runFile, 'utf-8');
    const data = JSON.parse(content) as Record<string, unknown>;

    // Reconstruct dates and warnings
    const warnings = (data['warnings'] as Array<{ type: string; message: string; iteration: number; timestamp: string }>) ?? [];

    const run: Run = {
      id: data['id'] as string,
      workOrderId: data['workOrderId'] as string,
      workspaceId: data['workspaceId'] as string,
      iteration: data['iteration'] as number,
      maxIterations: data['maxIterations'] as number,
      state: data['state'] as RunState,
      snapshotBeforeSha: (data['snapshotBeforeSha'] as string) ?? null,
      snapshotAfterSha: (data['snapshotAfterSha'] as string) ?? null,
      snapshotIds: (data['snapshotIds'] as string[]) ?? [],
      startedAt: new Date(data['startedAt'] as string),
      completedAt: data['completedAt'] ? new Date(data['completedAt'] as string) : null,
      result: (data['result'] as Run['result']) ?? null,
      error: (data['error'] as string) ?? null,
      sessionId: (data['sessionId'] as string) ?? null,
      // GitHub integration (v0.2.4)
      gitHubBranch: (data['gitHubBranch'] as string) ?? null,
      gitHubPrUrl: (data['gitHubPrUrl'] as string) ?? null,
      gitHubPrNumber: (data['gitHubPrNumber'] as number) ?? null,
      // Warnings for non-fatal issues (v0.2.10 - Thrust 13)
      warnings: warnings.map(w => ({
        ...w,
        timestamp: new Date(w.timestamp),
      })),
      // CI integration (v0.2.12 - Thrust 6)
      ciEnabled: (data['ciEnabled'] as boolean) ?? false,
      ciIterationCount: (data['ciIterationCount'] as number) ?? 0,
      maxCiIterations: (data['maxCiIterations'] as number) ?? 3,
      ciStatus: (data['ciStatus'] as Run['ciStatus']) ?? null,
      ciPollingStartedAt: data['ciPollingStartedAt'] ? new Date(data['ciPollingStartedAt'] as string) : null,
      ciCompletedAt: data['ciCompletedAt'] ? new Date(data['ciCompletedAt'] as string) : null,
      ciWorkflowUrl: (data['ciWorkflowUrl'] as string) ?? null,
    };

    return run;
  } catch (error) {
    log.debug({ runId, error }, 'Run not found');
    return null;
  }
}

/**
 * Save iteration data.
 */
export async function saveIterationData(
  runId: string,
  iteration: number,
  data: IterationData
): Promise<void> {
  await ensureRunStructure(runId);
  const runDir = getRunDir(runId);
  const iterFile = join(runDir, `iteration-${iteration}.json`);

  await writeFile(iterFile, JSON.stringify(data, null, 2));
  log.debug({ runId, iteration }, 'Iteration data saved');
}

/**
 * Load iteration data.
 */
export async function loadIterationData(
  runId: string,
  iteration: number
): Promise<IterationData | null> {
  try {
    const runDir = getRunDir(runId);
    const iterFile = join(runDir, `iteration-${iteration}.json`);
    const content = await readFile(iterFile, 'utf-8');
    const data = JSON.parse(content) as Record<string, unknown>;

    return {
      iteration: data['iteration'] as number,
      state: data['state'] as RunState,
      snapshotId: (data['snapshotId'] as string) ?? null,
      verificationPassed: (data['verificationPassed'] as boolean) ?? null,
      feedbackGenerated: (data['feedbackGenerated'] as boolean) ?? false,
      startedAt: new Date(data['startedAt'] as string),
      completedAt: data['completedAt'] ? new Date(data['completedAt'] as string) : null,
      durationMs: (data['durationMs'] as number) ?? null,
      // Agent fields (v0.2.19 - Thrust 3)
      agentSessionId: (data['agentSessionId'] as string) ?? null,
      agentResultFile: (data['agentResultFile'] as string) ?? null,
      agentDurationMs: (data['agentDurationMs'] as number) ?? null,
      agentSuccess: (data['agentSuccess'] as boolean) ?? null,
      agentModel: (data['agentModel'] as string) ?? null,
      agentTokensUsed: (data['agentTokensUsed'] as number) ?? null,
      agentCostUsd: (data['agentCostUsd'] as number) ?? null,
      // Verification fields (v0.2.19 - Thrust 3)
      verificationFile: (data['verificationFile'] as string) ?? null,
      verificationLevelsRun: (data['verificationLevelsRun'] as string[]) ?? [],
      verificationDurationMs: (data['verificationDurationMs'] as number) ?? null,
      // Error fields (v0.2.19 - Thrust 3)
      errorType: (data['errorType'] as IterationErrorType) ?? IterationErrorType.NONE,
      errorMessage: (data['errorMessage'] as string) ?? null,
      errorDetails: (data['errorDetails'] as Record<string, unknown>) ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Get all iteration data for a run.
 */
export async function getAllIterationData(runId: string): Promise<IterationData[]> {
  const run = await loadRun(runId);
  if (!run) {
    return [];
  }

  const iterations: IterationData[] = [];
  for (let i = 1; i <= run.iteration; i++) {
    const data = await loadIterationData(runId, i);
    if (data) {
      iterations.push(data);
    }
  }

  return iterations;
}

/**
 * Get run status (summary for queries).
 */
export async function getRunStatus(runId: string): Promise<RunStatus | null> {
  const run = await loadRun(runId);
  if (!run) {
    return null;
  }

  const { getProgressDescription } = await import('./state-machine.js');

  const elapsedMs = run.completedAt
    ? run.completedAt.getTime() - run.startedAt.getTime()
    : Date.now() - run.startedAt.getTime();

  return {
    runId: run.id,
    state: run.state,
    iteration: run.iteration,
    maxIterations: run.maxIterations,
    progress: getProgressDescription(run),
    elapsedMs,
  };
}

/**
 * List all runs.
 */
export async function listRuns(
  options: { limit?: number; offset?: number } = {}
): Promise<Run[]> {
  const { limit = 20, offset = 0 } = options;

  try {
    const { getRunsDir } = await import('../artifacts/paths.js');
    const runsDir = getRunsDir();

    let entries: string[];
    try {
      entries = await readdir(runsDir);
    } catch {
      return [];
    }

    // Filter to only directories and sort by name (reverse chronological due to UUID)
    const runs: Run[] = [];

    for (const entry of entries) {
      const run = await loadRun(entry);
      if (run) {
        runs.push(run);
      }
    }

    // Sort by startedAt descending
    runs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    // Apply pagination
    return runs.slice(offset, offset + limit);
  } catch (error) {
    log.error({ error }, 'Failed to list runs');
    return [];
  }
}

/**
 * Options for creating a run.
 */
export interface CreateRunOptions {
  /** Enable CI monitoring */
  ciEnabled?: boolean;
  /** Maximum CI remediation attempts */
  maxCiIterations?: number;
}

/**
 * Create a new run.
 */
export function createRun(
  runId: string,
  workOrderId: string,
  workspaceId: string,
  maxIterations: number,
  options?: CreateRunOptions
): Run {
  return {
    id: runId,
    workOrderId,
    workspaceId,
    iteration: 1,
    maxIterations,
    state: RunState.QUEUED,
    snapshotBeforeSha: null,
    snapshotAfterSha: null,
    snapshotIds: [],
    startedAt: new Date(),
    completedAt: null,
    result: null,
    error: null,
    sessionId: null,
    // GitHub integration (v0.2.4)
    gitHubBranch: null,
    gitHubPrUrl: null,
    gitHubPrNumber: null,
    // Warnings for non-fatal issues (v0.2.10 - Thrust 13)
    warnings: [],
    // CI integration (v0.2.12 - Thrust 6)
    ciEnabled: options?.ciEnabled ?? false,
    ciIterationCount: 0,
    maxCiIterations: options?.maxCiIterations ?? 3,
    ciStatus: null,
    ciPollingStartedAt: null,
    ciCompletedAt: null,
    ciWorkflowUrl: null,
  };
}
