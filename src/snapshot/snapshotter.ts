import { writeFile } from 'node:fs/promises';
import { nanoid } from 'nanoid';
import type { Workspace, BeforeState, Snapshot } from '../types/index.js';
import {
  createSnapshotCommit,
  getDiffStats,
  generateUnifiedDiff,
  getCurrentBranch,
} from './git-snapshot.js';
import { saveSnapshot } from './snapshot-store.js';
import { getPatchPath, ensureIterationStructure } from '../artifacts/paths.js';
import { createLogger } from '../utils/logger.js';
import { simpleGit } from 'simple-git';

const log = createLogger('snapshotter');

export async function captureBeforeState(workspace: Workspace): Promise<BeforeState> {
  const git = simpleGit(workspace.rootPath);

  const sha = (await git.revparse(['HEAD'])).trim();
  const branch = await getCurrentBranch(workspace.rootPath);
  const status = await git.status();
  const isDirty = status.files.length > 0;

  // If dirty, create a WIP commit
  if (isDirty) {
    log.info({ workspaceId: workspace.id }, 'Workspace is dirty, creating WIP commit');
    await git.add('-A');
    await git.commit('[agentgate] WIP before run');
  }

  const finalSha = isDirty ? (await git.revparse(['HEAD'])).trim() : sha;

  const beforeState: BeforeState = {
    sha: finalSha,
    branch,
    isDirty,
    capturedAt: new Date(),
  };

  log.info({ beforeState }, 'Captured before state');
  return beforeState;
}

export async function captureAfterState(
  workspace: Workspace,
  before: BeforeState,
  runId: string,
  iteration: number,
  taskPrompt: string
): Promise<Snapshot> {
  const git = simpleGit(workspace.rootPath);

  // Stage all changes
  await git.add('-A');

  // Check for changes
  const status = await git.status();
  const hasChanges = status.files.length > 0;

  let afterSha: string;
  let commitMessage: string;

  if (hasChanges) {
    // Create commit
    const truncatedPrompt = taskPrompt.slice(0, 100);
    commitMessage = `[agentgate] Run ${runId} iteration ${iteration}\n\nTask: ${truncatedPrompt}`;

    afterSha = await createSnapshotCommit(workspace.rootPath, commitMessage);
    log.info({ afterSha, iteration }, 'Created after-state commit');
  } else {
    // No changes - use before SHA
    afterSha = before.sha;
    commitMessage = '';
    log.info({ iteration }, 'No changes detected, using before SHA');
  }

  // Get diff stats
  const diffStats = hasChanges
    ? await getDiffStats(workspace.rootPath, before.sha, afterSha)
    : { filesChanged: 0, insertions: 0, deletions: 0, files: [] };

  // Ensure iteration structure exists
  await ensureIterationStructure(runId, iteration);

  // Generate and save patch
  let patchPath: string | null = null;
  if (hasChanges) {
    const patch = await generateUnifiedDiff(workspace.rootPath, before.sha, afterSha);
    patchPath = getPatchPath(runId, iteration);
    await writeFile(patchPath, patch);
    log.debug({ patchPath }, 'Saved patch file');
  }

  const snapshot: Snapshot = {
    id: afterSha,
    runId,
    iteration,
    beforeSha: before.sha,
    afterSha,
    branch: before.branch,
    commitMessage,
    patchPath,
    filesChanged: diffStats.filesChanged,
    insertions: diffStats.insertions,
    deletions: diffStats.deletions,
    createdAt: new Date(),
  };

  // Persist snapshot metadata
  await saveSnapshot(snapshot);

  log.info(
    {
      snapshotId: snapshot.id,
      filesChanged: snapshot.filesChanged,
      insertions: snapshot.insertions,
      deletions: snapshot.deletions,
    },
    'Captured after state'
  );

  return snapshot;
}

export async function getSnapshot(id: string): Promise<Snapshot | null> {
  const { loadSnapshot } = await import('./snapshot-store.js');
  return loadSnapshot(id);
}

export async function generatePatch(snapshot: Snapshot): Promise<string | null> {
  if (!snapshot.patchPath) {
    return null;
  }

  const { readFile } = await import('node:fs/promises');
  try {
    return await readFile(snapshot.patchPath, 'utf-8');
  } catch {
    return null;
  }
}
