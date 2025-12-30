import { simpleGit, type SimpleGit, type SimpleGitOptions } from 'simple-git';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '../utils/logger.js';

const log = createLogger('git-ops');

function getGit(path: string): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    baseDir: path,
    binary: 'git',
    maxConcurrentProcesses: 6,
  };
  return simpleGit(options);
}

/**
 * Check if a path is a git repository
 */
export async function isGitRepo(path: string): Promise<boolean> {
  try {
    const gitDir = join(path, '.git');
    await access(gitDir);
    const git = getGit(path);
    const isRepo = await git.checkIsRepo();
    return isRepo;
  } catch {
    return false;
  }
}

/**
 * Initialize a new git repository
 */
export async function initRepo(path: string): Promise<void> {
  log.debug({ path }, 'Initializing git repository');
  const git = getGit(path);
  await git.init();
  log.info({ path }, 'Git repository initialized');
}

/**
 * Clone a git repository
 */
export async function cloneRepo(url: string, dest: string): Promise<void> {
  log.debug({ url, dest }, 'Cloning repository');
  const git = simpleGit();
  await git.clone(url, dest);
  log.info({ url, dest }, 'Repository cloned');
}

/**
 * Get the current HEAD SHA
 */
export async function getCurrentSha(path: string): Promise<string> {
  const git = getGit(path);
  const sha = await git.revparse(['HEAD']);
  return sha.trim();
}

/**
 * Get diff between two commits
 */
export async function getDiff(
  path: string,
  from: string,
  to: string
): Promise<string> {
  const git = getGit(path);
  const diff = await git.diff([from, to]);
  return diff;
}

/**
 * Stage all changes
 */
export async function stageAll(path: string): Promise<void> {
  const git = getGit(path);
  await git.add('.');
  log.debug({ path }, 'Staged all changes');
}

/**
 * Commit staged changes
 * @returns The commit SHA
 */
export async function commit(path: string, message: string): Promise<string> {
  const git = getGit(path);
  const result = await git.commit(message);
  const sha = result.commit;
  log.info({ path, sha, message }, 'Created commit');
  return sha;
}

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(path: string): Promise<boolean> {
  const git = getGit(path);
  const status = await git.status();
  return !status.isClean();
}

/**
 * Get the short SHA (first 7 characters)
 */
export async function getShortSha(path: string): Promise<string> {
  const sha = await getCurrentSha(path);
  return sha.substring(0, 7);
}

/**
 * Create a branch from current HEAD
 */
export async function createBranch(
  path: string,
  branchName: string
): Promise<void> {
  const git = getGit(path);
  await git.checkoutLocalBranch(branchName);
  log.debug({ path, branchName }, 'Created and checked out branch');
}

/**
 * Checkout a specific commit or branch
 */
export async function checkout(path: string, ref: string): Promise<void> {
  const git = getGit(path);
  await git.checkout(ref);
  log.debug({ path, ref }, 'Checked out ref');
}

/**
 * Get list of changed files between commits
 */
export async function getChangedFiles(
  path: string,
  from: string,
  to: string
): Promise<string[]> {
  const git = getGit(path);
  const diff = await git.diffSummary([from, to]);
  return diff.files.map((f) => f.file);
}

/**
 * Export the repository at a specific SHA to a destination
 */
export async function exportArchive(
  path: string,
  sha: string,
  dest: string
): Promise<void> {
  const git = getGit(path);
  // Use git archive to create a tarball and extract it
  await git.raw(['archive', '--format=tar', sha, '--output', `${dest}.tar`]);
  log.debug({ path, sha, dest }, 'Exported archive');
}
