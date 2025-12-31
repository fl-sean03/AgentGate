import { simpleGit, type SimpleGit } from 'simple-git';
import type { CommitInfo, DiffStats, FileChange } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('git-snapshot');

function getGit(path: string): SimpleGit {
  return simpleGit(path);
}

export async function createSnapshotCommit(
  path: string,
  message: string
): Promise<string> {
  const git = getGit(path);

  // Stage all changes
  await git.add('-A');

  // Check if there are changes to commit
  const status = await git.status();
  if (status.files.length === 0) {
    log.debug('No changes to commit');
    const sha = await git.revparse(['HEAD']);
    return sha.trim();
  }

  // Create commit
  const result = await git.commit(message);
  log.info({ sha: result.commit, message }, 'Created snapshot commit');

  return result.commit;
}

export async function getCommitInfo(path: string, sha: string): Promise<CommitInfo> {
  const git = getGit(path);

  const log_result = await git.log({
    from: sha,
    to: sha,
    maxCount: 1,
  });

  const commit = log_result.latest;
  if (!commit) {
    throw new Error(`Commit not found: ${sha}`);
  }

  return {
    sha: commit.hash,
    message: commit.message,
    author: commit.author_name,
    date: new Date(commit.date),
    parents: [], // Would need additional parsing
  };
}

export async function getDiffStats(
  path: string,
  from: string,
  to: string
): Promise<DiffStats> {
  const git = getGit(path);

  const diffSummary = await git.diffSummary([from, to]);

  const files: FileChange[] = diffSummary.files.map((file) => {
    let status: FileChange['status'] = 'modified';
    if ('insertions' in file && file.insertions > 0 && !('deletions' in file)) {
      status = 'added';
    }
    // Note: simple-git doesn't provide detailed status, this is simplified

    return {
      path: file.file,
      status,
      insertions: 'insertions' in file ? file.insertions : 0,
      deletions: 'deletions' in file ? file.deletions : 0,
    };
  });

  return {
    filesChanged: diffSummary.changed,
    insertions: diffSummary.insertions,
    deletions: diffSummary.deletions,
    files,
  };
}

export async function generateUnifiedDiff(
  path: string,
  from: string,
  to: string
): Promise<string> {
  const git = getGit(path);
  const diff = await git.diff([from, to]);
  return diff;
}

export async function cherryPick(path: string, sha: string): Promise<void> {
  const git = getGit(path);
  await git.raw(['cherry-pick', sha]);
}

export async function getCurrentBranch(path: string): Promise<string> {
  const git = getGit(path);
  const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
  return branch.trim();
}

export async function createBranch(path: string, name: string): Promise<void> {
  const git = getGit(path);
  await git.checkoutLocalBranch(name);
}

export async function checkout(path: string, ref: string): Promise<void> {
  const git = getGit(path);
  await git.checkout(ref);
}
