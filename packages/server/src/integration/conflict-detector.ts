/**
 * Conflict Detection Module
 *
 * Detects potential merge conflicts between child work order branches
 * before attempting integration.
 */

import { createLogger } from '../utils/logger.js';
import { getChangedFiles } from '../workspace/git-ops.js';

const log = createLogger('conflict-detector');

export interface ConflictCheckResult {
  /** Whether conflicts were detected */
  hasConflicts: boolean;
  /** List of files that conflict between branches */
  conflictingFiles: string[];
  /** Details about each pairwise conflict */
  conflicts: PairwiseConflict[];
}

export interface PairwiseConflict {
  /** Branch 1 name */
  branch1: string;
  /** Branch 2 name */
  branch2: string;
  /** Files that both branches modified */
  sharedFiles: string[];
}

/**
 * Detect potential conflicts between multiple child branches
 *
 * This performs a pairwise comparison of all branches to find files
 * that have been modified by more than one branch.
 */
export async function detectConflicts(
  repoPath: string,
  baseBranch: string,
  childBranches: string[]
): Promise<ConflictCheckResult> {
  log.debug({ repoPath, baseBranch, childBranches }, 'Detecting conflicts');

  if (childBranches.length === 0) {
    return {
      hasConflicts: false,
      conflictingFiles: [],
      conflicts: [],
    };
  }

  // Get changed files for each branch
  const branchChanges = await Promise.all(
    childBranches.map(async (branch) => ({
      branch,
      files: await getChangedFiles(repoPath, baseBranch, branch),
    }))
  );

  log.debug(
    { changes: branchChanges.map((c) => ({ branch: c.branch, count: c.files.length })) },
    'Retrieved changed files'
  );

  // Perform pairwise comparison
  const conflicts: PairwiseConflict[] = [];
  const allConflictingFiles = new Set<string>();

  for (let i = 0; i < branchChanges.length; i++) {
    for (let j = i + 1; j < branchChanges.length; j++) {
      const branch1 = branchChanges[i];
      const branch2 = branchChanges[j];

      if (!branch1 || !branch2) {
        continue;
      }

      // Find files modified by both branches
      const sharedFiles = branch1.files.filter((file) => branch2.files.includes(file));

      if (sharedFiles.length > 0) {
        conflicts.push({
          branch1: branch1.branch,
          branch2: branch2.branch,
          sharedFiles,
        });

        sharedFiles.forEach((file) => allConflictingFiles.add(file));
      }
    }
  }

  const hasConflicts = conflicts.length > 0;

  if (hasConflicts) {
    log.warn(
      {
        conflictCount: conflicts.length,
        fileCount: allConflictingFiles.size,
      },
      'Conflicts detected'
    );
  } else {
    log.info({ branchCount: childBranches.length }, 'No conflicts detected');
  }

  return {
    hasConflicts,
    conflictingFiles: Array.from(allConflictingFiles),
    conflicts,
  };
}

/**
 * Detect conflicts between a single branch and the base
 *
 * This checks if merging a single branch would result in conflicts.
 */
export async function detectSingleBranchConflicts(
  repoPath: string,
  baseBranch: string,
  childBranch: string
): Promise<boolean> {
  log.debug({ repoPath, baseBranch, childBranch }, 'Checking single branch conflicts');

  try {
    // Get changed files in both branches since their common ancestor
    const baseFiles = await getChangedFiles(repoPath, `${baseBranch}...${childBranch}`, baseBranch);
    const childFiles = await getChangedFiles(repoPath, baseBranch, childBranch);

    // If base branch has changes that overlap with child, there may be conflicts
    const overlappingFiles = baseFiles.filter((file) => childFiles.includes(file));

    const hasConflicts = overlappingFiles.length > 0;

    if (hasConflicts) {
      log.warn(
        { childBranch, conflictingFiles: overlappingFiles },
        'Single branch conflict detected'
      );
    }

    return hasConflicts;
  } catch (error) {
    log.error({ repoPath, baseBranch, childBranch, err: error }, 'Error detecting conflicts');
    // In case of error, assume conflicts may exist
    return true;
  }
}
