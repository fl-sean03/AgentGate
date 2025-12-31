import { readdir } from 'node:fs/promises';
import type {
  Run,
  IterationData,
  VerificationReport,
  GatePlan,
  StructuredFeedback,
} from '../types/index.js';
import type { RunSummary } from '../types/summary.js';
import {
  getRunDir,
  getRunMetadataPath,
  getRunGatePlanPath,
  getRunSummaryPath,
  getIterationMetadataPath,
  getAgentLogsPath,
  getVerificationReportPath,
  getFeedbackPath,
  getVerificationLogsPath,
  getRunsDir,
  ensureRunStructure,
  ensureIterationStructure,
} from './paths.js';
import { writeJson, readJson, writeLog, readLog } from './json.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('artifact-store');

// Run operations
export async function saveRunMetadata(run: Run): Promise<void> {
  await ensureRunStructure(run.id);
  await writeJson(getRunMetadataPath(run.id), run);
  log.debug({ runId: run.id }, 'Saved run metadata');
}

export async function loadRunMetadata(runId: string): Promise<Run | null> {
  const data = await readJson<Run>(getRunMetadataPath(runId));
  if (!data) return null;

  return {
    ...data,
    startedAt: new Date(data.startedAt),
    completedAt: data.completedAt ? new Date(data.completedAt) : null,
  };
}

// Iteration operations
export async function saveIterationMetadata(
  runId: string,
  iteration: number,
  data: IterationData
): Promise<void> {
  await ensureIterationStructure(runId, iteration);
  await writeJson(getIterationMetadataPath(runId, iteration), data);
  log.debug({ runId, iteration }, 'Saved iteration metadata');
}

export async function loadIterationMetadata(
  runId: string,
  iteration: number
): Promise<IterationData | null> {
  const data = await readJson<IterationData>(getIterationMetadataPath(runId, iteration));
  if (!data) return null;

  return {
    ...data,
    startedAt: new Date(data.startedAt),
    completedAt: data.completedAt ? new Date(data.completedAt) : null,
  };
}

// Agent logs
export async function saveAgentLogs(
  runId: string,
  iteration: number,
  logs: string
): Promise<void> {
  await ensureIterationStructure(runId, iteration);
  await writeLog(getAgentLogsPath(runId, iteration), logs);
  log.debug({ runId, iteration }, 'Saved agent logs');
}

export async function loadAgentLogs(
  runId: string,
  iteration: number
): Promise<string | null> {
  return readLog(getAgentLogsPath(runId, iteration));
}

// Verification report
export async function saveVerificationReport(
  runId: string,
  iteration: number,
  report: VerificationReport
): Promise<void> {
  await ensureIterationStructure(runId, iteration);
  await writeJson(getVerificationReportPath(runId, iteration), report);
  log.debug({ runId, iteration, passed: report.passed }, 'Saved verification report');
}

export async function loadVerificationReport(
  runId: string,
  iteration: number
): Promise<VerificationReport | null> {
  const data = await readJson<VerificationReport>(
    getVerificationReportPath(runId, iteration)
  );
  if (!data) return null;

  return {
    ...data,
    createdAt: new Date(data.createdAt),
  };
}

// Verification logs
export async function saveVerificationLogs(
  runId: string,
  iteration: number,
  level: string,
  logs: string
): Promise<void> {
  await ensureIterationStructure(runId, iteration);
  await writeLog(getVerificationLogsPath(runId, iteration, level), logs);
}

export async function loadVerificationLogs(
  runId: string,
  iteration: number,
  level: string
): Promise<string | null> {
  return readLog(getVerificationLogsPath(runId, iteration, level));
}

// Feedback
export async function saveFeedback(
  runId: string,
  iteration: number,
  feedback: StructuredFeedback
): Promise<void> {
  await ensureIterationStructure(runId, iteration);
  await writeJson(getFeedbackPath(runId, iteration), feedback);
  log.debug({ runId, iteration }, 'Saved feedback');
}

export async function loadFeedback(
  runId: string,
  iteration: number
): Promise<StructuredFeedback | null> {
  return readJson<StructuredFeedback>(getFeedbackPath(runId, iteration));
}

// Gate plan
export async function saveGatePlan(runId: string, plan: GatePlan): Promise<void> {
  await ensureRunStructure(runId);
  await writeJson(getRunGatePlanPath(runId), plan);
  log.debug({ runId }, 'Saved gate plan');
}

export async function loadGatePlan(runId: string): Promise<GatePlan | null> {
  return readJson<GatePlan>(getRunGatePlanPath(runId));
}

// Run summary
export async function saveRunSummary(runId: string, summary: RunSummary): Promise<void> {
  await ensureRunStructure(runId);
  await writeJson(getRunSummaryPath(runId), summary);
  log.debug({ runId }, 'Saved run summary');
}

export async function loadRunSummary(runId: string): Promise<RunSummary | null> {
  const data = await readJson<RunSummary>(getRunSummaryPath(runId));
  if (!data) return null;

  return {
    ...data,
    startedAt: new Date(data.startedAt),
    completedAt: new Date(data.completedAt),
  };
}

// List operations
export async function listRuns(): Promise<RunSummary[]> {
  const runsDir = getRunsDir();

  try {
    const entries = await readdir(runsDir, { withFileTypes: true });
    const summaries: RunSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const summary = await loadRunSummary(entry.name);
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries.sort(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function listIterations(runId: string): Promise<number[]> {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Static function, not a method
  const { join } = await import('node:path');
  const iterationsDir = join(getRunDir(runId), 'iterations');

  try {
    const entries = await readdir(iterationsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => parseInt(e.name, 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function getLatestIteration(runId: string): Promise<number> {
  const iterations = await listIterations(runId);
  return iterations.length > 0 ? Math.max(...iterations) : 0;
}
