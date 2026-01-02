/**
 * Run data persistence.
 * Stores and retrieves run state and iteration data.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  RunState,
  IterationErrorType,
  type Run,
  type IterationData,
  type RunStatus,
  type AgentResult,
  type VerificationReport,
} from '../types/index.js';
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
 * Save iteration data to disk.
 * (v0.2.19 - Thrust 3: Enhanced IterationData)
 */
export async function saveIterationData(
  runId: string,
  data: IterationData
): Promise<string> {
  await ensureRunStructure(runId);
  const runDir = getRunDir(runId);
  const filePath = join(runDir, `iteration-${data.iteration}.json`);

  await writeFile(filePath, JSON.stringify(data, null, 2));

  log.debug({ runId, iteration: data.iteration }, 'Saved iteration data');
  return filePath;
}

/**
 * Load iteration data from disk.
 * (v0.2.19 - Thrust 3: Enhanced IterationData)
 */
export async function loadIterationData(
  runId: string,
  iteration: number
): Promise<IterationData | null> {
  try {
    const runDir = getRunDir(runId);
    const filePath = join(runDir, `iteration-${iteration}.json`);
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as Record<string, unknown>;

    // Parse agent tokens used if present
    let agentTokensUsed: { input: number; output: number; total: number } | null = null;
    const rawTokens = data['agentTokensUsed'] as Record<string, number> | null;
    if (rawTokens) {
      agentTokensUsed = {
        input: rawTokens['input'] ?? 0,
        output: rawTokens['output'] ?? 0,
        total: rawTokens['total'] ?? 0,
      };
    }

    return {
      // Core metadata
      iteration: data['iteration'] as number,
      state: data['state'] as RunState,
      startedAt: new Date(data['startedAt'] as string),
      completedAt: data['completedAt'] ? new Date(data['completedAt'] as string) : null,
      durationMs: (data['durationMs'] as number) ?? null,

      // Snapshot
      snapshotId: (data['snapshotId'] as string) ?? null,

      // Feedback loop
      feedbackGenerated: (data['feedbackGenerated'] as boolean) ?? false,

      // Agent execution (v0.2.19 - Thrust 3)
      agentSessionId: (data['agentSessionId'] as string) ?? null,
      agentResultFile: (data['agentResultFile'] as string) ?? null,
      agentDurationMs: (data['agentDurationMs'] as number) ?? null,
      agentSuccess: (data['agentSuccess'] as boolean) ?? null,
      agentModel: (data['agentModel'] as string) ?? null,
      agentTokensUsed,
      agentCostUsd: (data['agentCostUsd'] as number) ?? null,

      // Verification (v0.2.19 - Thrust 3)
      verificationFile: (data['verificationFile'] as string) ?? null,
      verificationPassed: (data['verificationPassed'] as boolean) ?? null,
      verificationLevelsRun: (data['verificationLevelsRun'] as string[]) ?? [],
      verificationDurationMs: (data['verificationDurationMs'] as number) ?? null,

      // Error handling (v0.2.19 - Thrust 3)
      errorType: (data['errorType'] as IterationErrorType) ?? IterationErrorType.NONE,
      errorMessage: (data['errorMessage'] as string) ?? null,
      errorDetails: (data['errorDetails'] as Record<string, unknown>) ?? null,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
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

// ==========================================================================
// Enhanced IterationData Functions (v0.2.19 - Thrust 3)
// ==========================================================================

/**
 * List all iteration numbers for a run.
 */
export async function listIterations(runId: string): Promise<number[]> {
  const runDir = getRunDir(runId);

  let files: string[];
  try {
    files = await readdir(runDir);
  } catch {
    return [];
  }

  return files
    .filter(f => f.startsWith('iteration-') && f.endsWith('.json'))
    .map(f => parseInt(f.replace('iteration-', '').replace('.json', ''), 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
}

/**
 * Update iteration data with agent result info.
 */
export function updateWithAgentResult(
  data: IterationData,
  result: AgentResult,
  resultFile: string
): IterationData {
  // Convert TokenUsage to the required format with total
  let agentTokensUsed: { input: number; output: number; total: number } | null = null;
  if (result.tokensUsed) {
    agentTokensUsed = {
      input: result.tokensUsed.input,
      output: result.tokensUsed.output,
      total: result.tokensUsed.input + result.tokensUsed.output,
    };
  }

  return {
    ...data,
    agentSessionId: result.sessionId,
    agentResultFile: resultFile,
    agentDurationMs: result.durationMs,
    agentSuccess: result.success,
    agentModel: result.model ?? null,
    agentTokensUsed,
    agentCostUsd: result.totalCostUsd ?? null,
  };
}

/**
 * Update iteration data with verification result info.
 */
export function updateWithVerificationResult(
  data: IterationData,
  report: VerificationReport,
  reportFile: string
): IterationData {
  // Determine which levels were run
  const verificationLevelsRun: string[] = [];
  if (report.l0Result) verificationLevelsRun.push('L0');
  if (report.l1Result) verificationLevelsRun.push('L1');
  if (report.l2Result) verificationLevelsRun.push('L2');
  if (report.l3Result) verificationLevelsRun.push('L3');

  return {
    ...data,
    verificationFile: reportFile,
    verificationPassed: report.passed,
    verificationLevelsRun,
    verificationDurationMs: report.totalDuration,
  };
}

/**
 * Update iteration data with error info.
 */
export function updateWithError(
  data: IterationData,
  errorType: IterationErrorType,
  message: string,
  details?: Record<string, unknown>
): IterationData {
  return {
    ...data,
    errorType,
    errorMessage: message,
    errorDetails: details ?? null,
    completedAt: new Date(),
    durationMs: new Date().getTime() - data.startedAt.getTime(),
  };
}
