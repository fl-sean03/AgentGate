import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ensureDir } from './paths.js';

export async function writeJson<T>(path: string, data: T): Promise<void> {
  await ensureDir(dirname(path));
  const content = JSON.stringify(data, null, 2);
  await writeFile(path, content, 'utf-8');
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function appendLog(path: string, entry: string): Promise<void> {
  await ensureDir(dirname(path));
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${entry}\n`;
  await appendFile(path, line, 'utf-8');
}

export async function writeLog(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, content, 'utf-8');
}

export async function readLog(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
