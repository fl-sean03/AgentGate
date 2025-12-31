/**
 * Metrics storage module.
 * Handles persistence and retrieval of metrics from artifact storage.
 */

import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  getMetricsDir,
  getMetricsIterationsDir,
  getIterationMetricsPath,
  getRunMetricsPath,
  ensureDir,
} from '../artifacts/paths.js';
import {
  type IterationMetrics,
  type RunMetrics,
  iterationMetricsSchema,
  runMetricsSchema,
} from '../types/metrics.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('metrics-storage');

/**
 * Save iteration metrics to storage
 */
export async function saveIterationMetrics(metrics: IterationMetrics): Promise<void> {
  const path = getIterationMetricsPath(metrics.runId, metrics.iteration);
  await ensureDir(dirname(path));

  // Validate before saving
  const validated = iterationMetricsSchema.parse(metrics);
  await writeFile(path, JSON.stringify(validated, null, 2), 'utf-8');

  log.debug({ runId: metrics.runId, iteration: metrics.iteration }, 'Saved iteration metrics');
}

/**
 * Load iteration metrics from storage
 */
export async function loadIterationMetrics(
  runId: string,
  iteration: number
): Promise<IterationMetrics | null> {
  const path = getIterationMetricsPath(runId, iteration);

  try {
    const content = await readFile(path, 'utf-8');
    const data: unknown = JSON.parse(content);
    return iterationMetricsSchema.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    log.error({ error, runId, iteration }, 'Failed to load iteration metrics');
    throw error;
  }
}

/**
 * Save aggregated run metrics to storage
 */
export async function saveRunMetrics(metrics: RunMetrics): Promise<void> {
  const path = getRunMetricsPath(metrics.runId);
  await ensureDir(dirname(path));

  // Validate before saving
  const validated = runMetricsSchema.parse(metrics);
  await writeFile(path, JSON.stringify(validated, null, 2), 'utf-8');

  log.debug({ runId: metrics.runId }, 'Saved run metrics');
}

/**
 * Load run metrics from storage
 */
export async function loadRunMetrics(runId: string): Promise<RunMetrics | null> {
  const path = getRunMetricsPath(runId);

  try {
    const content = await readFile(path, 'utf-8');
    const data: unknown = JSON.parse(content);
    return runMetricsSchema.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    log.error({ error, runId }, 'Failed to load run metrics');
    throw error;
  }
}

/**
 * Load all iteration metrics for a run
 */
export async function getAllIterationMetrics(runId: string): Promise<IterationMetrics[]> {
  const dir = getMetricsIterationsDir(runId);

  try {
    const files = await readdir(dir);
    const iterations: IterationMetrics[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const iteration = parseInt(file.replace('.json', ''), 10);
        if (!isNaN(iteration)) {
          const metrics = await loadIterationMetrics(runId, iteration);
          if (metrics) {
            iterations.push(metrics);
          }
        }
      }
    }

    // Sort by iteration number
    return iterations.sort((a, b) => a.iteration - b.iteration);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    log.error({ error, runId }, 'Failed to load iteration metrics');
    throw error;
  }
}

/**
 * Check if run metrics exist
 */
export async function metricsExist(runId: string): Promise<boolean> {
  const path = getRunMetricsPath(runId);
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure metrics directory structure exists for a run
 */
export async function ensureMetricsStructure(runId: string): Promise<void> {
  await ensureDir(getMetricsDir(runId));
  await ensureDir(getMetricsIterationsDir(runId));
}
