import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { CleanupResult, RetentionPolicy, StorageUsage } from '../types/summary.js';
import {
  getRunsDir,
  getTmpDir,
  getLeasesDir,
  getWorkspacesDir,
  getSnapshotsDir,
} from './paths.js';
import { loadRunSummary } from './store.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('cleanup');

const DEFAULT_POLICY: RetentionPolicy = {
  maxRunAgeDays: 30,
  maxRunCount: 100,
  keepFailedRuns: true,
  keepSucceededRuns: true,
};

export async function cleanupOldRuns(
  policy: Partial<RetentionPolicy> = {}
): Promise<CleanupResult> {
  const p = { ...DEFAULT_POLICY, ...policy };
  const runsDir = getRunsDir();
  const maxAgeMs = p.maxRunAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  let deletedRuns = 0;
  let freedBytes = 0;

  try {
    const entries = await readdir(runsDir, { withFileTypes: true });
    const runDirs = entries.filter((e) => e.isDirectory());

    // Sort by modification time (newest first)
    const runsWithTime: { name: string; mtime: number }[] = [];
    for (const entry of runDirs) {
      const path = join(runsDir, entry.name);
      const stats = await stat(path);
      runsWithTime.push({ name: entry.name, mtime: stats.mtimeMs });
    }
    runsWithTime.sort((a, b) => b.mtime - a.mtime);

    // Apply retention policy
    for (let i = 0; i < runsWithTime.length; i++) {
      const run = runsWithTime[i];
      if (!run) continue;

      const age = now - run.mtime;
      const exceedsCount = i >= p.maxRunCount;
      const exceedsAge = age > maxAgeMs;

      if (exceedsCount || exceedsAge) {
        const summary = await loadRunSummary(run.name);

        // Check if we should keep based on status
        if (summary) {
          if (summary.status === 'failed' && p.keepFailedRuns) continue;
          if (summary.status === 'succeeded' && p.keepSucceededRuns) continue;
        }

        const path = join(runsDir, run.name);
        const size = await getDirSize(path);

        await rm(path, { recursive: true, force: true });
        deletedRuns++;
        freedBytes += size;

        log.info({ runId: run.name, reason: exceedsAge ? 'age' : 'count' }, 'Deleted run');
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error({ error }, 'Error cleaning up runs');
    }
  }

  return {
    deletedRuns,
    deletedTempFiles: 0,
    deletedLeases: 0,
    freedBytes,
  };
}

export async function cleanupTempFiles(): Promise<CleanupResult> {
  const tmpDir = getTmpDir();
  const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
  const now = Date.now();

  let deletedTempFiles = 0;
  let freedBytes = 0;

  try {
    const entries = await readdir(tmpDir, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(tmpDir, entry.name);
      const stats = await stat(path);

      if (now - stats.mtimeMs > maxAgeMs) {
        const size = entry.isDirectory() ? await getDirSize(path) : stats.size;
        await rm(path, { recursive: true, force: true });
        deletedTempFiles++;
        freedBytes += size;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error({ error }, 'Error cleaning up temp files');
    }
  }

  return {
    deletedRuns: 0,
    deletedTempFiles,
    deletedLeases: 0,
    freedBytes,
  };
}

export async function cleanupOrphanedLeases(): Promise<CleanupResult> {
  const leasesDir = getLeasesDir();
  const maxAgeMs = 2 * 60 * 60 * 1000; // 2 hours
  const now = Date.now();

  let deletedLeases = 0;

  try {
    const entries = await readdir(leasesDir);

    for (const file of entries) {
      if (!file.endsWith('.json')) continue;

      const path = join(leasesDir, file);
      const stats = await stat(path);

      if (now - stats.mtimeMs > maxAgeMs) {
        await rm(path);
        deletedLeases++;
        log.info({ leaseId: file.replace('.json', '') }, 'Deleted orphaned lease');
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error({ error }, 'Error cleaning up leases');
    }
  }

  return {
    deletedRuns: 0,
    deletedTempFiles: 0,
    deletedLeases,
    freedBytes: 0,
  };
}

export async function getStorageUsage(): Promise<StorageUsage> {
  const [workspacesBytes, runsBytes, snapshotsBytes, tempBytes] = await Promise.all([
    getDirSize(getWorkspacesDir()).catch(() => 0),
    getDirSize(getRunsDir()).catch(() => 0),
    getDirSize(getSnapshotsDir()).catch(() => 0),
    getDirSize(getTmpDir()).catch(() => 0),
  ]);

  return {
    totalBytes: workspacesBytes + runsBytes + snapshotsBytes + tempBytes,
    workspacesBytes,
    runsBytes,
    snapshotsBytes,
    tempBytes,
  };
}

async function getDirSize(path: string): Promise<number> {
  let size = 0;

  try {
    const entries = await readdir(path, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(path, entry.name);

      if (entry.isDirectory()) {
        size += await getDirSize(entryPath);
      } else {
        const stats = await stat(entryPath);
        size += stats.size;
      }
    }
  } catch {
    // Ignore errors
  }

  return size;
}
