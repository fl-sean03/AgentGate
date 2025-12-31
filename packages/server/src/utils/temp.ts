import { mkdir, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import { getAgentGateRoot } from '../artifacts/paths.js';
import { createLogger } from './logger.js';

const log = createLogger('temp');

export async function createTempDir(prefix: string): Promise<string> {
  const root = getAgentGateRoot();
  const tmpRoot = join(root, 'tmp');
  await mkdir(tmpRoot, { recursive: true });

  const dirName = `${prefix}-${nanoid(8)}`;
  const dirPath = join(tmpRoot, dirName);
  await mkdir(dirPath, { recursive: true });

  log.debug({ dirPath }, 'Created temp directory');
  return dirPath;
}

export async function removeTempDir(path: string): Promise<void> {
  const root = getAgentGateRoot();
  const tmpRoot = join(root, 'tmp');

  // Safety check: only remove directories under tmp
  if (!path.startsWith(tmpRoot)) {
    throw new Error(`Refusing to remove directory outside tmp: ${path}`);
  }

  try {
    await rm(path, { recursive: true, force: true });
    log.debug({ path }, 'Removed temp directory');
  } catch (error) {
    log.warn({ path, error }, 'Failed to remove temp directory');
  }
}

export async function listTempDirs(): Promise<string[]> {
  const root = getAgentGateRoot();
  const tmpRoot = join(root, 'tmp');

  try {
    const entries = await readdir(tmpRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => join(tmpRoot, e.name));
  } catch {
    return [];
  }
}

export async function cleanupStaleTempDirs(maxAgeMs: number): Promise<number> {
  const dirs = await listTempDirs();
  const now = Date.now();
  let cleaned = 0;

  for (const dir of dirs) {
    try {
      const stats = await stat(dir);
      const age = now - stats.mtimeMs;

      if (age > maxAgeMs) {
        await removeTempDir(dir);
        cleaned++;
      }
    } catch (error) {
      log.warn({ dir, error }, 'Error checking temp directory age');
    }
  }

  if (cleaned > 0) {
    log.info({ cleaned }, 'Cleaned up stale temp directories');
  }

  return cleaned;
}
