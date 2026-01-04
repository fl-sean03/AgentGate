/**
 * Tests for Merge Conflict Detector.
 * (v0.2.27 - Thrust 5: Merge Conflict Detection)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import {
  detectConflicts,
  getCurrentBranch,
  branchExists,
  getCommitDivergence,
  hasUncommittedChanges,
  getModifiedFiles,
  getUpstreamModifiedFiles,
  getPotentialConflictFiles,
  mightHaveConflicts,
} from '../../src/git/conflict-detector.js';

const execAsync = promisify(exec);

/**
 * Helper to run git commands in a directory
 */
async function git(cwd: string, args: string): Promise<string> {
  const { stdout } = await execAsync(`git ${args}`, { cwd });
  return stdout.trim();
}

/**
 * Setup a test git repository with main and feature branches
 */
async function setupTestRepo(): Promise<string> {
  const repoDir = join(tmpdir(), `conflict-test-${randomUUID()}`);
  await mkdir(repoDir, { recursive: true });

  // Initialize repo
  await git(repoDir, 'init');
  await git(repoDir, 'config user.email "test@example.com"');
  await git(repoDir, 'config user.name "Test User"');

  // Create initial commit on main
  await writeFile(join(repoDir, 'README.md'), '# Test Project\n');
  await git(repoDir, 'add .');
  await git(repoDir, 'commit -m "Initial commit"');

  // Rename default branch to main if needed
  const currentBranch = await git(repoDir, 'rev-parse --abbrev-ref HEAD');
  if (currentBranch !== 'main') {
    await git(repoDir, 'branch -m main');
  }

  return repoDir;
}

describe('ConflictDetector', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await setupTestRepo();
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      const branch = await getCurrentBranch(testDir);
      expect(branch).toBe('main');
    });

    it('should return feature branch name', async () => {
      await git(testDir, 'checkout -b feature-test');
      const branch = await getCurrentBranch(testDir);
      expect(branch).toBe('feature-test');
    });
  });

  describe('branchExists', () => {
    it('should return true for existing branch', async () => {
      const exists = await branchExists(testDir, 'main');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent branch', async () => {
      const exists = await branchExists(testDir, 'non-existent-branch');
      expect(exists).toBe(false);
    });

    it('should handle new branches', async () => {
      await git(testDir, 'checkout -b new-feature');
      const exists = await branchExists(testDir, 'new-feature');
      expect(exists).toBe(true);
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return false for clean working directory', async () => {
      const hasChanges = await hasUncommittedChanges(testDir);
      expect(hasChanges).toBe(false);
    });

    it('should return true for unstaged changes', async () => {
      await writeFile(join(testDir, 'new-file.txt'), 'content');
      const hasChanges = await hasUncommittedChanges(testDir);
      expect(hasChanges).toBe(true);
    });

    it('should return true for staged changes', async () => {
      await writeFile(join(testDir, 'new-file.txt'), 'content');
      await git(testDir, 'add new-file.txt');
      const hasChanges = await hasUncommittedChanges(testDir);
      expect(hasChanges).toBe(true);
    });
  });

  describe('getCommitDivergence', () => {
    it('should return 0/0 for same branch', async () => {
      const { ahead, behind } = await getCommitDivergence(testDir, 'main', 'main');
      expect(ahead).toBe(0);
      expect(behind).toBe(0);
    });

    it('should return ahead count for feature branch', async () => {
      // Create feature branch and add commits
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'feature.txt'), 'feature content');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Feature commit"');

      const { ahead, behind } = await getCommitDivergence(testDir, 'feature', 'main');
      expect(ahead).toBe(1);
      expect(behind).toBe(0);
    });

    it('should return behind count when main has new commits', async () => {
      // Create feature branch
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'feature.txt'), 'feature');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Feature commit"');

      // Go back to main and add commits
      await git(testDir, 'checkout main');
      await writeFile(join(testDir, 'main-update.txt'), 'main update');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Main commit"');

      // Check from feature perspective
      await git(testDir, 'checkout feature');
      const { ahead, behind } = await getCommitDivergence(testDir, 'feature', 'main');
      expect(ahead).toBe(1);
      expect(behind).toBe(1);
    });
  });

  describe('getModifiedFiles', () => {
    it('should return empty array when no changes', async () => {
      const files = await getModifiedFiles(testDir, 'main');
      expect(files).toHaveLength(0);
    });

    it('should return modified files in feature branch', async () => {
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'new-file.txt'), 'content');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Add new file"');

      const files = await getModifiedFiles(testDir, 'main');
      expect(files).toContain('new-file.txt');
    });
  });

  describe('detectConflicts', () => {
    it('should return no conflicts when branches are identical', async () => {
      const result = await detectConflicts(testDir, {
        targetBranch: 'main',
        fetchFirst: false,
      });

      expect(result.hasConflicts).toBe(false);
      expect(result.conflictCount).toBe(0);
      expect(result.currentBranch).toBe('main');
    });

    it('should return no conflicts when feature adds new files', async () => {
      // Create feature branch with new file
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'feature.txt'), 'feature content');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Add feature"');

      const result = await detectConflicts(testDir, {
        targetBranch: 'main',
        fetchFirst: false,
      });

      expect(result.hasConflicts).toBe(false);
      expect(result.currentBranch).toBe('feature');
      expect(result.commitsAhead).toBe(1);
      expect(result.commitsBehind).toBe(0);
    });

    it('should detect conflicts when same file modified differently', async () => {
      // Create feature branch and modify README
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'README.md'), '# Feature Changes\n');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Feature changes to README"');

      // Go back to main and make different changes to README
      await git(testDir, 'checkout main');
      await writeFile(join(testDir, 'README.md'), '# Main Changes\n');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Main changes to README"');

      // Check for conflicts from feature branch
      await git(testDir, 'checkout feature');

      const result = await detectConflicts(testDir, {
        targetBranch: 'main',
        fetchFirst: false,
      });

      expect(result.hasConflicts).toBe(true);
      expect(result.conflictCount).toBe(1);
      expect(result.conflicts[0]?.path).toBe('README.md');
      expect(result.conflicts[0]?.type).toBe('modify-modify');
    });

    it('should detect add-add conflicts', async () => {
      // Create feature branch and add new file
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'shared.txt'), 'feature version');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Add shared.txt in feature"');

      // Go back to main and add same file with different content
      await git(testDir, 'checkout main');
      await writeFile(join(testDir, 'shared.txt'), 'main version');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Add shared.txt in main"');

      // Check for conflicts from feature branch
      await git(testDir, 'checkout feature');

      const result = await detectConflicts(testDir, {
        targetBranch: 'main',
        fetchFirst: false,
      });

      expect(result.hasConflicts).toBe(true);
      expect(result.conflictCount).toBe(1);
      expect(result.conflicts[0]?.path).toBe('shared.txt');
    });

    it('should report correct divergence', async () => {
      // Create feature with 2 commits
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'f1.txt'), 'f1');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Feature 1"');
      await writeFile(join(testDir, 'f2.txt'), 'f2');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Feature 2"');

      // Main with 1 commit (non-conflicting)
      await git(testDir, 'checkout main');
      await writeFile(join(testDir, 'm1.txt'), 'm1');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Main 1"');

      await git(testDir, 'checkout feature');

      const result = await detectConflicts(testDir, {
        targetBranch: 'main',
        fetchFirst: false,
      });

      expect(result.commitsAhead).toBe(2);
      expect(result.commitsBehind).toBe(1);
      expect(result.hasConflicts).toBe(false);
    });

    it('should handle missing target branch', async () => {
      const result = await detectConflicts(testDir, {
        targetBranch: 'non-existent-branch',
        fetchFirst: false,
      });

      expect(result.hasConflicts).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should include conflict content when requested', async () => {
      // Create conflicting changes
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'README.md'), 'feature content');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Feature"');

      await git(testDir, 'checkout main');
      await writeFile(join(testDir, 'README.md'), 'main content');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Main"');

      await git(testDir, 'checkout feature');

      const result = await detectConflicts(testDir, {
        targetBranch: 'main',
        fetchFirst: false,
        includeContent: true,
      });

      expect(result.hasConflicts).toBe(true);
      // Content should be available
      expect(result.conflicts[0]).toBeDefined();
    });
  });

  describe('getPotentialConflictFiles', () => {
    it('should return empty array when no overlapping changes', async () => {
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'feature.txt'), 'feature');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Feature"');

      await git(testDir, 'checkout main');
      await writeFile(join(testDir, 'main.txt'), 'main');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Main"');

      await git(testDir, 'checkout feature');

      const files = await getPotentialConflictFiles(testDir, 'main');
      expect(files).toHaveLength(0);
    });

    it('should return overlapping files', async () => {
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'README.md'), 'feature');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Feature"');

      await git(testDir, 'checkout main');
      await writeFile(join(testDir, 'README.md'), 'main');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Main"');

      await git(testDir, 'checkout feature');

      const files = await getPotentialConflictFiles(testDir, 'main');
      expect(files).toContain('README.md');
    });
  });

  describe('mightHaveConflicts', () => {
    it('should return false when not behind target', async () => {
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'feature.txt'), 'feature');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Feature"');

      const might = await mightHaveConflicts(testDir, {
        targetBranch: 'main',
        fetchFirst: false,
      });

      expect(might).toBe(false);
    });

    it('should return false when behind but no overlapping files', async () => {
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'feature.txt'), 'feature');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Feature"');

      await git(testDir, 'checkout main');
      await writeFile(join(testDir, 'main.txt'), 'main');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Main"');

      await git(testDir, 'checkout feature');

      const might = await mightHaveConflicts(testDir, {
        targetBranch: 'main',
        fetchFirst: false,
      });

      expect(might).toBe(false);
    });

    it('should return true when overlapping files exist', async () => {
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'README.md'), 'feature');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Feature"');

      await git(testDir, 'checkout main');
      await writeFile(join(testDir, 'README.md'), 'main');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Main"');

      await git(testDir, 'checkout feature');

      const might = await mightHaveConflicts(testDir, {
        targetBranch: 'main',
        fetchFirst: false,
      });

      expect(might).toBe(true);
    });
  });

  describe('getUpstreamModifiedFiles', () => {
    it('should return files modified in target since divergence', async () => {
      await git(testDir, 'checkout -b feature');

      await git(testDir, 'checkout main');
      await writeFile(join(testDir, 'upstream.txt'), 'upstream');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Upstream change"');

      await git(testDir, 'checkout feature');

      const files = await getUpstreamModifiedFiles(testDir, 'main');
      expect(files).toContain('upstream.txt');
    });
  });

  describe('edge cases', () => {
    it('should handle repos with no commits on target after diverge', async () => {
      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'feature.txt'), 'content');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Feature"');

      const result = await detectConflicts(testDir, {
        targetBranch: 'main',
        fetchFirst: false,
      });

      expect(result.hasConflicts).toBe(false);
      expect(result.commitsBehind).toBe(0);
    });

    it('should restore working directory after detection', async () => {
      // Make uncommitted changes
      await writeFile(join(testDir, 'uncommitted.txt'), 'uncommitted');

      await git(testDir, 'checkout -b feature');
      await writeFile(join(testDir, 'feature.txt'), 'feature');
      await git(testDir, 'add feature.txt');
      await git(testDir, 'commit -m "Feature"');

      await git(testDir, 'checkout main');
      await writeFile(join(testDir, 'README.md'), 'conflict');
      await git(testDir, 'add .');
      await git(testDir, 'commit -m "Main"');

      await git(testDir, 'checkout feature');

      // Add uncommitted changes
      await writeFile(join(testDir, 'local-change.txt'), 'local');

      await detectConflicts(testDir, {
        targetBranch: 'main',
        fetchFirst: false,
      });

      // Verify we're still on feature branch
      const branch = await getCurrentBranch(testDir);
      expect(branch).toBe('feature');

      // Verify uncommitted changes are preserved
      const hasChanges = await hasUncommittedChanges(testDir);
      expect(hasChanges).toBe(true);
    });
  });
});
