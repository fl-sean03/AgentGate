/**
 * Merge Conflict Detector - Detects conflicts between local changes and upstream.
 * Provides early warning when agent's work conflicts with main branch changes.
 *
 * (v0.2.27 - Thrust 5: Merge Conflict Detection)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '../utils/logger.js';

const execAsync = promisify(exec);
const log = createLogger('conflict-detector');

/**
 * Conflict details for a single file
 */
export interface FileConflict {
  /** Path to the conflicting file */
  path: string;
  /** Type of conflict */
  type: 'modify-modify' | 'modify-delete' | 'delete-modify' | 'add-add';
  /** Our changes (local) */
  ours?: string;
  /** Their changes (upstream) */
  theirs?: string;
  /** Base version (common ancestor) */
  base?: string;
}

/**
 * Result of conflict detection
 */
export interface ConflictDetectionResult {
  /** Whether conflicts were detected */
  hasConflicts: boolean;
  /** Number of conflicting files */
  conflictCount: number;
  /** Details of each conflict */
  conflicts: FileConflict[];
  /** Branch we're comparing against */
  targetBranch: string;
  /** Current branch */
  currentBranch: string;
  /** Number of commits ahead of target */
  commitsAhead: number;
  /** Number of commits behind target */
  commitsBehind: number;
  /** Whether a fast-forward merge is possible */
  canFastForward: boolean;
  /** Error message if detection failed */
  error?: string;
}

/**
 * Options for conflict detection
 */
export interface ConflictDetectorOptions {
  /** Target branch to compare against (default: main) */
  targetBranch?: string;
  /** Whether to fetch before detection (default: true) */
  fetchFirst?: boolean;
  /** Remote name (default: origin) */
  remote?: string;
  /** Include file content in conflict details (default: false) */
  includeContent?: boolean;
  /** Maximum number of conflicts to report (default: 100) */
  maxConflicts?: number;
}

const DEFAULT_OPTIONS: Required<ConflictDetectorOptions> = {
  targetBranch: 'main',
  fetchFirst: true,
  remote: 'origin',
  includeContent: false,
  maxConflicts: 100,
};

/**
 * Execute git command in a directory
 */
async function git(
  cwd: string,
  args: string,
  options?: { throwOnError?: boolean }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execAsync(`git ${args}`, {
      cwd,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    if (options?.throwOnError) {
      throw error;
    }
    return {
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || '',
      exitCode: err.code || 1,
    };
  }
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(cwd: string): Promise<string> {
  const result = await git(cwd, 'rev-parse --abbrev-ref HEAD', { throwOnError: true });
  return result.stdout;
}

/**
 * Check if a branch exists (locally or remotely)
 */
export async function branchExists(
  cwd: string,
  branch: string,
  remote?: string
): Promise<boolean> {
  const fullRef = remote ? `${remote}/${branch}` : branch;
  const result = await git(cwd, `rev-parse --verify ${fullRef}`);
  return result.exitCode === 0;
}

/**
 * Get the number of commits ahead/behind
 */
export async function getCommitDivergence(
  cwd: string,
  currentBranch: string,
  targetBranch: string,
  remote?: string
): Promise<{ ahead: number; behind: number }> {
  const targetRef = remote ? `${remote}/${targetBranch}` : targetBranch;

  const result = await git(
    cwd,
    `rev-list --left-right --count ${currentBranch}...${targetRef}`
  );

  if (result.exitCode !== 0) {
    log.warn({ error: result.stderr }, 'Failed to get commit divergence');
    return { ahead: 0, behind: 0 };
  }

  const [aheadStr, behindStr] = result.stdout.split('\t');
  return {
    ahead: parseInt(aheadStr || '0', 10),
    behind: parseInt(behindStr || '0', 10),
  };
}

/**
 * Parse the type of conflict from git status
 */
function parseConflictType(
  statusCode: string
): 'modify-modify' | 'modify-delete' | 'delete-modify' | 'add-add' {
  switch (statusCode) {
    case 'DD':
      return 'delete-modify'; // Both deleted
    case 'AU':
      return 'add-add'; // Added by us
    case 'UD':
      return 'modify-delete'; // Deleted by them
    case 'UA':
      return 'add-add'; // Added by them
    case 'DU':
      return 'delete-modify'; // Deleted by us
    case 'AA':
      return 'add-add'; // Both added
    case 'UU':
      return 'modify-modify'; // Both modified
    default:
      return 'modify-modify';
  }
}

/**
 * Detect merge conflicts between current branch and target branch
 */
export async function detectConflicts(
  cwd: string,
  options: ConflictDetectorOptions = {}
): Promise<ConflictDetectionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Get current branch
    const currentBranch = await getCurrentBranch(cwd);
    log.debug({ currentBranch, targetBranch: opts.targetBranch }, 'Detecting conflicts');

    // Determine if we should use remote ref or local ref
    let useRemote = false;
    let targetRef = opts.targetBranch;

    // Try to fetch if requested
    if (opts.fetchFirst) {
      const fetchResult = await git(cwd, `fetch ${opts.remote} ${opts.targetBranch}`);
      if (fetchResult.exitCode === 0) {
        useRemote = true;
        targetRef = `${opts.remote}/${opts.targetBranch}`;
      } else {
        log.debug({ error: fetchResult.stderr }, 'Fetch failed, using local refs');
      }
    }

    // Check if target branch exists (try remote first, then local)
    let targetExists = false;
    if (useRemote) {
      targetExists = await branchExists(cwd, opts.targetBranch, opts.remote);
    }
    if (!targetExists) {
      targetExists = await branchExists(cwd, opts.targetBranch);
      if (targetExists) {
        useRemote = false;
        targetRef = opts.targetBranch;
      }
    }

    if (!targetExists) {
      return {
        hasConflicts: false,
        conflictCount: 0,
        conflicts: [],
        targetBranch: opts.targetBranch,
        currentBranch,
        commitsAhead: 0,
        commitsBehind: 0,
        canFastForward: false,
        error: `Target branch ${opts.targetBranch} not found`,
      };
    }

    // Get divergence
    const { ahead, behind } = await getCommitDivergence(
      cwd,
      currentBranch,
      opts.targetBranch,
      useRemote ? opts.remote : undefined
    );

    // If we're not behind, no conflicts possible
    if (behind === 0) {
      log.debug('No commits behind target, no conflicts possible');
      return {
        hasConflicts: false,
        conflictCount: 0,
        conflicts: [],
        targetBranch: opts.targetBranch,
        currentBranch,
        commitsAhead: ahead,
        commitsBehind: behind,
        canFastForward: ahead === 0,
      };
    }

    // Try a dry-run merge to detect conflicts
    // First, save current state
    const stashResult = await git(cwd, 'stash push -m "conflict-detection-temp"');
    const didStash = stashResult.exitCode === 0 && !stashResult.stdout.includes('No local changes');

    try {
      // Try to merge without committing
      const mergeResult = await git(cwd, `merge --no-commit --no-ff ${targetRef}`);

      if (mergeResult.exitCode === 0) {
        // No conflicts - abort the merge
        await git(cwd, 'merge --abort');

        return {
          hasConflicts: false,
          conflictCount: 0,
          conflicts: [],
          targetBranch: opts.targetBranch,
          currentBranch,
          commitsAhead: ahead,
          commitsBehind: behind,
          canFastForward: ahead === 0 && behind > 0,
        };
      }

      // There are conflicts - get the list
      const statusResult = await git(cwd, 'status --porcelain');
      const conflicts: FileConflict[] = [];

      for (const line of statusResult.stdout.split('\n')) {
        if (!line) continue;

        const statusCode = line.substring(0, 2);
        const filePath = line.substring(3);

        // Check if this is a conflict marker
        if (statusCode.includes('U') || statusCode === 'AA' || statusCode === 'DD') {
          if (conflicts.length >= opts.maxConflicts) {
            log.warn({ max: opts.maxConflicts }, 'Maximum conflicts reached, truncating');
            break;
          }

          const conflict: FileConflict = {
            path: filePath,
            type: parseConflictType(statusCode),
          };

          // Optionally include content
          if (opts.includeContent) {
            try {
              const showOurs = await git(cwd, `show :2:${filePath}`);
              if (showOurs.exitCode === 0) {
                conflict.ours = showOurs.stdout;
              }

              const showTheirs = await git(cwd, `show :3:${filePath}`);
              if (showTheirs.exitCode === 0) {
                conflict.theirs = showTheirs.stdout;
              }

              const showBase = await git(cwd, `show :1:${filePath}`);
              if (showBase.exitCode === 0) {
                conflict.base = showBase.stdout;
              }
            } catch {
              // Content retrieval is best-effort
            }
          }

          conflicts.push(conflict);
        }
      }

      // Abort the merge
      await git(cwd, 'merge --abort');

      log.info({ conflictCount: conflicts.length }, 'Conflicts detected');

      return {
        hasConflicts: conflicts.length > 0,
        conflictCount: conflicts.length,
        conflicts,
        targetBranch: opts.targetBranch,
        currentBranch,
        commitsAhead: ahead,
        commitsBehind: behind,
        canFastForward: false,
      };
    } finally {
      // Restore stash if we stashed
      if (didStash) {
        await git(cwd, 'stash pop');
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ error: message }, 'Conflict detection failed');

    return {
      hasConflicts: false,
      conflictCount: 0,
      conflicts: [],
      targetBranch: opts.targetBranch,
      currentBranch: '',
      commitsAhead: 0,
      commitsBehind: 0,
      canFastForward: false,
      error: message,
    };
  }
}

/**
 * Check if there are any local uncommitted changes
 */
export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const result = await git(cwd, 'status --porcelain');
  return result.stdout.length > 0;
}

/**
 * Get the list of files modified in local commits vs target
 */
export async function getModifiedFiles(
  cwd: string,
  targetBranch: string,
  remote?: string
): Promise<string[]> {
  const targetRef = remote ? `${remote}/${targetBranch}` : targetBranch;
  const result = await git(cwd, `diff --name-only ${targetRef}...HEAD`);

  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout.split('\n').filter(Boolean);
}

/**
 * Get files that were modified in the target branch since our branch diverged
 */
export async function getUpstreamModifiedFiles(
  cwd: string,
  targetBranch: string,
  remote?: string
): Promise<string[]> {
  const targetRef = remote ? `${remote}/${targetBranch}` : targetBranch;

  // Find merge base
  const mergeBaseResult = await git(cwd, `merge-base HEAD ${targetRef}`);
  if (mergeBaseResult.exitCode !== 0) {
    return [];
  }

  const mergeBase = mergeBaseResult.stdout;

  // Get files changed in target since merge base
  const result = await git(cwd, `diff --name-only ${mergeBase}...${targetRef}`);

  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout.split('\n').filter(Boolean);
}

/**
 * Get files that might have conflicts (modified in both branches)
 */
export async function getPotentialConflictFiles(
  cwd: string,
  targetBranch: string,
  remote?: string
): Promise<string[]> {
  const ourFiles = await getModifiedFiles(cwd, targetBranch, remote);
  const theirFiles = await getUpstreamModifiedFiles(cwd, targetBranch, remote);

  // Return intersection
  const theirSet = new Set(theirFiles);
  return ourFiles.filter(file => theirSet.has(file));
}

/**
 * Quick check if there might be conflicts (without doing a trial merge)
 */
export async function mightHaveConflicts(
  cwd: string,
  options: ConflictDetectorOptions = {}
): Promise<boolean> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Determine if we should use remote or local
  let useRemote = false;

  // Fetch if requested
  if (opts.fetchFirst) {
    const fetchResult = await git(cwd, `fetch ${opts.remote} ${opts.targetBranch}`);
    if (fetchResult.exitCode === 0) {
      useRemote = await branchExists(cwd, opts.targetBranch, opts.remote);
    }
  }

  // If not using remote, check local branch exists
  if (!useRemote) {
    const localExists = await branchExists(cwd, opts.targetBranch);
    if (!localExists) {
      return false;
    }
  }

  // Get divergence
  const currentBranch = await getCurrentBranch(cwd);
  const { behind } = await getCommitDivergence(
    cwd,
    currentBranch,
    opts.targetBranch,
    useRemote ? opts.remote : undefined
  );

  // If not behind, definitely no conflicts
  if (behind === 0) {
    return false;
  }

  // Check for overlapping modified files
  const potentialConflicts = await getPotentialConflictFiles(
    cwd,
    opts.targetBranch,
    useRemote ? opts.remote : undefined
  );

  return potentialConflicts.length > 0;
}
