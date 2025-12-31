import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Snapshot } from '../types/index.js';
import { getSnapshotsDir, ensureDir } from '../artifacts/paths.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('snapshot-store');

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  const dir = getSnapshotsDir();
  await ensureDir(dir);

  const path = join(dir, `${snapshot.id}.json`);
  await writeFile(path, JSON.stringify(snapshot, null, 2));

  log.debug({ snapshotId: snapshot.id }, 'Saved snapshot');
}

export async function loadSnapshot(id: string): Promise<Snapshot | null> {
  const path = join(getSnapshotsDir(), `${id}.json`);

  try {
    const content = await readFile(path, 'utf-8');
    const data = JSON.parse(content) as Snapshot;

    // Parse dates
    return {
      ...data,
      createdAt: new Date(data.createdAt),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function loadSnapshotsByRun(runId: string): Promise<Snapshot[]> {
  const dir = getSnapshotsDir();

  try {
    const files = await readdir(dir);
    const snapshots: Snapshot[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const snapshot = await loadSnapshot(file.replace('.json', ''));
      if (snapshot && snapshot.runId === runId) {
        snapshots.push(snapshot);
      }
    }

    return snapshots.sort((a, b) => a.iteration - b.iteration);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function deleteSnapshot(id: string): Promise<void> {
  const { unlink } = await import('node:fs/promises');
  const path = join(getSnapshotsDir(), `${id}.json`);

  try {
    await unlink(path);
    log.debug({ snapshotId: id }, 'Deleted snapshot');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
