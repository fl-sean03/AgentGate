import { mkdir, rm, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import type { Workspace } from '../types/index.js';
import { getTmpDir, ensureDir } from '../artifacts/paths.js';
import { createTempDir, removeTempDir } from '../utils/temp.js';
import { createLogger } from '../utils/logger.js';
import { getCurrentSha } from './git-ops.js';

const log = createLogger('checkout');

/**
 * Extract a snapshot of the workspace at a specific SHA to a destination directory
 * Uses git archive to create a clean export without .git directory
 */
export async function extractSnapshot(
  workspace: Workspace,
  sha: string,
  destDir: string
): Promise<void> {
  log.debug(
    { workspaceId: workspace.id, sha, destDir },
    'Extracting snapshot'
  );

  // Ensure destination exists
  await mkdir(destDir, { recursive: true });

  // Use git archive to create a tarball and pipe to tar for extraction
  // This gives us a clean copy without .git directory
  await execa('git', ['archive', '--format=tar', sha], {
    cwd: workspace.rootPath,
    stdout: 'pipe',
  }).then(async (archiveResult) => {
    // Extract the tar to destination
    await execa('tar', ['-xf', '-', '-C', destDir], {
      input: archiveResult.stdout,
    });
  });

  log.info(
    { workspaceId: workspace.id, sha, destDir },
    'Snapshot extracted'
  );
}

/**
 * Create a clean checkout of the workspace at a specific SHA
 * Returns the path to the temporary checkout directory
 */
export async function createCleanCheckout(
  workspace: Workspace,
  sha?: string
): Promise<string> {
  // Get the SHA to checkout (default to current HEAD)
  const targetSha = sha ?? (await getCurrentSha(workspace.rootPath));

  log.debug(
    { workspaceId: workspace.id, sha: targetSha },
    'Creating clean checkout'
  );

  // Create a temporary directory for the checkout
  const checkoutDir = await createTempDir(`checkout-${workspace.id}`);

  try {
    // Extract the snapshot
    await extractSnapshot(workspace, targetSha, checkoutDir);

    log.info(
      { workspaceId: workspace.id, sha: targetSha, checkoutDir },
      'Clean checkout created'
    );

    return checkoutDir;
  } catch (error) {
    // Clean up on failure
    await removeTempDir(checkoutDir);
    throw error;
  }
}

/**
 * Clean up a checkout directory
 */
export async function cleanupCheckout(checkoutPath: string): Promise<void> {
  log.debug({ checkoutPath }, 'Cleaning up checkout');

  // Verify the path is in our temp directory before removing
  const tmpDir = getTmpDir();
  if (!checkoutPath.startsWith(tmpDir)) {
    throw new Error(
      `Refusing to cleanup path outside temp directory: ${checkoutPath}`
    );
  }

  await removeTempDir(checkoutPath);
  log.debug({ checkoutPath }, 'Checkout cleaned up');
}

/**
 * Create a working copy by copying the workspace
 * Unlike extractSnapshot, this includes the .git directory
 */
export async function createWorkingCopy(
  workspace: Workspace
): Promise<string> {
  log.debug({ workspaceId: workspace.id }, 'Creating working copy');

  // Create a temporary directory for the working copy
  const workDir = await createTempDir(`work-${workspace.id}`);

  try {
    // Copy the entire workspace including .git
    await cp(workspace.rootPath, workDir, {
      recursive: true,
      preserveTimestamps: true,
    });

    log.info(
      { workspaceId: workspace.id, workDir },
      'Working copy created'
    );

    return workDir;
  } catch (error) {
    // Clean up on failure
    await removeTempDir(workDir);
    throw error;
  }
}

/**
 * Sync changes from a working copy back to the original workspace
 * Only syncs files, not the .git directory
 */
export async function syncFromWorkingCopy(
  workDir: string,
  workspace: Workspace
): Promise<void> {
  log.debug(
    { workDir, workspaceId: workspace.id },
    'Syncing from working copy'
  );

  // Use rsync-like behavior: copy all files except .git
  const entries = await import('node:fs/promises').then((fs) =>
    fs.readdir(workDir, { withFileTypes: true })
  );

  for (const entry of entries) {
    if (entry.name === '.git') continue;

    const srcPath = join(workDir, entry.name);
    const destPath = join(workspace.rootPath, entry.name);

    // Remove existing destination
    await rm(destPath, { recursive: true, force: true });

    // Copy from working directory
    if (entry.isDirectory()) {
      await cp(srcPath, destPath, { recursive: true, preserveTimestamps: true });
    } else {
      await cp(srcPath, destPath, { preserveTimestamps: true });
    }
  }

  log.info(
    { workDir, workspaceId: workspace.id },
    'Synced from working copy'
  );
}
