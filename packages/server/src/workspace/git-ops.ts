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

// ============================================================================
// Remote Operations (Added in v0.2.4)
// ============================================================================

/**
 * Check if a remote exists
 */
export async function hasRemote(path: string, name: string): Promise<boolean> {
  const git = getGit(path);
  const remotes = await git.getRemotes();
  return remotes.some((r) => r.name === name);
}

/**
 * Add a remote to the repository
 */
export async function addRemote(
  path: string,
  name: string,
  url: string
): Promise<void> {
  const git = getGit(path);
  await git.addRemote(name, url);
  log.debug({ path, name }, 'Added remote');
}

/**
 * Set (update) the URL of an existing remote
 */
export async function setRemoteUrl(
  path: string,
  name: string,
  url: string
): Promise<void> {
  const git = getGit(path);
  await git.remote(['set-url', name, url]);
  log.debug({ path, name }, 'Updated remote URL');
}

/**
 * Get the URL of a remote
 */
export async function getRemoteUrl(
  path: string,
  name: string
): Promise<string | null> {
  const git = getGit(path);
  const remotes = await git.getRemotes(true);
  const remote = remotes.find((r) => r.name === name);
  return remote?.refs.fetch ?? null;
}

/**
 * Remove a remote
 */
export async function removeRemote(path: string, name: string): Promise<void> {
  const git = getGit(path);
  await git.removeRemote(name);
  log.debug({ path, name }, 'Removed remote');
}

// ============================================================================
// Push/Pull Operations (Added in v0.2.4)
// ============================================================================

export interface PushOptions {
  /** Force push (use with caution) */
  force?: boolean;
  /** Set upstream tracking */
  setUpstream?: boolean;
}

export interface PushResult {
  success: boolean;
  remoteRef: string;
  localBranch: string;
}

/**
 * Push a branch to a remote
 */
export async function push(
  path: string,
  remote: string,
  branch: string,
  options: PushOptions = {}
): Promise<PushResult> {
  const git = getGit(path);
  const args: string[] = [];

  if (options.force) {
    args.push('--force');
  }
  if (options.setUpstream) {
    args.push('-u');
  }

  await git.push(remote, branch, args);

  log.info({ path, remote, branch, force: options.force }, 'Pushed to remote');

  return {
    success: true,
    remoteRef: `${remote}/${branch}`,
    localBranch: branch,
  };
}

export interface PullResult {
  success: boolean;
  commits: number;
  filesChanged: number;
}

/**
 * Pull from a remote
 */
export async function pull(
  path: string,
  remote: string,
  branch: string
): Promise<PullResult> {
  const git = getGit(path);
  const result = await git.pull(remote, branch);

  log.info({ path, remote, branch, files: result.files?.length ?? 0 }, 'Pulled from remote');

  return {
    success: true,
    commits: result.summary?.changes ?? 0,
    filesChanged: result.files?.length ?? 0,
  };
}

/**
 * Fetch from a remote
 */
export async function fetch(
  path: string,
  remote: string,
  branch?: string
): Promise<void> {
  const git = getGit(path);

  if (branch) {
    await git.fetch(remote, branch);
  } else {
    await git.fetch(remote);
  }

  log.debug({ path, remote, branch }, 'Fetched from remote');
}

// ============================================================================
// Branch Operations (Added in v0.2.4)
// ============================================================================

/**
 * Check if a branch exists (locally or remotely)
 */
export async function branchExists(
  path: string,
  branchName: string,
  checkRemote?: string
): Promise<boolean> {
  const git = getGit(path);

  if (checkRemote) {
    // Check remote branch
    const branches = await git.branch(['-r']);
    const remoteBranch = `${checkRemote}/${branchName}`;
    return branches.all.includes(remoteBranch);
  } else {
    // Check local branch
    const branches = await git.branchLocal();
    return branches.all.includes(branchName);
  }
}

/**
 * Create a branch and push it to remote
 */
export async function createAndPushBranch(
  path: string,
  branchName: string,
  remote: string
): Promise<void> {
  const git = getGit(path);

  // Create and checkout the branch
  await git.checkoutLocalBranch(branchName);

  // Push with upstream tracking
  await push(path, remote, branchName, { setUpstream: true });

  log.info({ path, branchName, remote }, 'Created and pushed branch');
}

/**
 * Get list of remote branches
 */
export async function getRemoteBranches(
  path: string,
  remote: string
): Promise<string[]> {
  const git = getGit(path);
  const branches = await git.branch(['-r']);

  return branches.all
    .filter((b) => b.startsWith(`${remote}/`))
    .map((b) => b.replace(`${remote}/`, ''));
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(path: string): Promise<string> {
  const git = getGit(path);
  const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
  return branch.trim();
}

/**
 * Check if the current branch has an upstream set
 */
export async function hasUpstream(path: string): Promise<boolean> {
  const git = getGit(path);
  try {
    await git.revparse(['--abbrev-ref', '--symbolic-full-name', '@{u}']);
    return true;
  } catch {
    return false;
  }
}
