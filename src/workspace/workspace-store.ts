import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import type { Workspace } from '../types/index.js';
import {
  getWorkspacesDir,
  getWorkspacePath,
  ensureDir,
} from '../artifacts/paths.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('workspace-store');

interface WorkspaceJson {
  id: string;
  rootPath: string;
  source: Workspace['source'];
  leaseId: string | null;
  leasedAt: string | null;
  status: Workspace['status'];
  gitInitialized: boolean;
  createdAt: string;
  updatedAt: string;
}

function toJson(workspace: Workspace): WorkspaceJson {
  return {
    id: workspace.id,
    rootPath: workspace.rootPath,
    source: workspace.source,
    leaseId: workspace.leaseId,
    leasedAt: workspace.leasedAt?.toISOString() ?? null,
    status: workspace.status,
    gitInitialized: workspace.gitInitialized,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

function fromJson(json: WorkspaceJson): Workspace {
  return {
    id: json.id,
    rootPath: json.rootPath,
    source: json.source,
    leaseId: json.leaseId,
    leasedAt: json.leasedAt ? new Date(json.leasedAt) : null,
    status: json.status,
    gitInitialized: json.gitInitialized,
    createdAt: new Date(json.createdAt),
    updatedAt: new Date(json.updatedAt),
  };
}

/**
 * Save a workspace to disk
 */
export async function saveWorkspace(workspace: Workspace): Promise<void> {
  await ensureDir(getWorkspacesDir());
  const path = getWorkspacePath(workspace.id);
  const json = toJson(workspace);
  await writeFile(path, JSON.stringify(json, null, 2), 'utf-8');
  log.debug({ id: workspace.id, path }, 'Saved workspace');
}

/**
 * Load a workspace from disk
 */
export async function loadWorkspace(id: string): Promise<Workspace | null> {
  const path = getWorkspacePath(id);
  try {
    const content = await readFile(path, 'utf-8');
    const json = JSON.parse(content) as WorkspaceJson;
    return fromJson(json);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Delete a workspace from disk
 */
export async function deleteWorkspace(id: string): Promise<void> {
  const path = getWorkspacePath(id);
  try {
    await unlink(path);
    log.debug({ id, path }, 'Deleted workspace file');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * List all workspaces
 */
export async function listWorkspaces(): Promise<Workspace[]> {
  await ensureDir(getWorkspacesDir());
  const dir = getWorkspacesDir();

  try {
    const files = await readdir(dir);
    const workspaces: Workspace[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const id = file.replace('.json', '');
      const workspace = await loadWorkspace(id);
      if (workspace) {
        workspaces.push(workspace);
      }
    }

    return workspaces;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Find a workspace by root path
 */
export async function findWorkspaceByPath(
  rootPath: string
): Promise<Workspace | null> {
  const workspaces = await listWorkspaces();
  return workspaces.find((w) => w.rootPath === rootPath) ?? null;
}

/**
 * Update a workspace (load, modify, save)
 */
export async function updateWorkspace(
  id: string,
  updater: (workspace: Workspace) => Workspace
): Promise<Workspace | null> {
  const workspace = await loadWorkspace(id);
  if (!workspace) {
    return null;
  }

  const updated = updater({
    ...workspace,
    updatedAt: new Date(),
  });

  await saveWorkspace(updated);
  return updated;
}
