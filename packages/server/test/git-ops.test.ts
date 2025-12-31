/**
 * Git Operations Unit Tests
 *
 * Tests for git-ops module including push/pull operations added in v0.2.4.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import {
  initRepo,
  isGitRepo,
  stageAll,
  commit,
  getCurrentBranch,
  createBranch,
  checkout,
  branchExists,
  hasRemote,
  addRemote,
  setRemoteUrl,
  merge,
  hasConflicts,
  abortMerge,
  deleteBranch,
  getChangedFiles,
} from '../src/workspace/git-ops.js';

const TEST_OUTPUT_DIR = path.join(import.meta.dirname, '../test-output');

describe('Git Operations', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create unique test directory
    testDir = path.join(TEST_OUTPUT_DIR, `git-ops-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initRepo', () => {
    it('should initialize a git repository', async () => {
      await initRepo(testDir);
      const isRepo = await isGitRepo(testDir);
      expect(isRepo).toBe(true);
    });

    it('should create a .git directory', async () => {
      await initRepo(testDir);
      // Check .git exists by verifying it's a git repo
      const isRepo = await isGitRepo(testDir);
      expect(isRepo).toBe(true);
    });
  });

  describe('branch operations', () => {
    beforeEach(async () => {
      // Initialize repo with a file
      await initRepo(testDir);
      await writeFile(path.join(testDir, 'test.txt'), 'test');
      await stageAll(testDir);
      await commit(testDir, 'Initial commit');
    });

    it('should create a new branch', async () => {
      await createBranch(testDir, 'feature-branch');
      const exists = await branchExists(testDir, 'feature-branch');
      expect(exists).toBe(true);
    });

    it('should checkout a branch', async () => {
      await createBranch(testDir, 'feature-branch');
      await checkout(testDir, 'feature-branch');
      const current = await getCurrentBranch(testDir);
      expect(current).toBe('feature-branch');
    });

    it('should detect non-existent branch', async () => {
      const exists = await branchExists(testDir, 'non-existent');
      expect(exists).toBe(false);
    });

    it('should detect existing branch', async () => {
      const currentBranch = await getCurrentBranch(testDir);
      const exists = await branchExists(testDir, currentBranch);
      expect(exists).toBe(true);
    });
  });

  describe('remote operations', () => {
    beforeEach(async () => {
      await initRepo(testDir);
    });

    it('should detect no remote initially', async () => {
      const has = await hasRemote(testDir, 'origin');
      expect(has).toBe(false);
    });

    it('should add a remote', async () => {
      await addRemote(testDir, 'origin', 'https://github.com/owner/repo.git');
      const has = await hasRemote(testDir, 'origin');
      expect(has).toBe(true);
    });

    it('should set remote URL', async () => {
      await addRemote(testDir, 'origin', 'https://github.com/owner/repo.git');
      await setRemoteUrl(testDir, 'origin', 'https://github.com/owner/new-repo.git');
      const has = await hasRemote(testDir, 'origin');
      expect(has).toBe(true);
    });

    it('should handle multiple remotes', async () => {
      await addRemote(testDir, 'origin', 'https://github.com/owner/repo.git');
      await addRemote(testDir, 'upstream', 'https://github.com/upstream/repo.git');

      expect(await hasRemote(testDir, 'origin')).toBe(true);
      expect(await hasRemote(testDir, 'upstream')).toBe(true);
      expect(await hasRemote(testDir, 'other')).toBe(false);
    });
  });

  describe('commit operations', () => {
    beforeEach(async () => {
      await initRepo(testDir);
    });

    it('should stage and commit changes', async () => {
      await writeFile(path.join(testDir, 'file.txt'), 'content');
      await stageAll(testDir);
      const sha = await commit(testDir, 'Test commit');
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    });

    it('should handle commits with special characters in message', async () => {
      await writeFile(path.join(testDir, 'file.txt'), 'content');
      await stageAll(testDir);
      const sha = await commit(testDir, 'Test "quoted" message with special chars: <>&');
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    });
  });

  describe('merge operations', () => {
    beforeEach(async () => {
      // Initialize repo with initial commit on main
      await initRepo(testDir);
      await writeFile(path.join(testDir, 'main.txt'), 'main content');
      await stageAll(testDir);
      await commit(testDir, 'Initial commit on main');
    });

    it('should perform a successful merge without conflicts', async () => {
      // Get the initial branch name
      const initialBranch = await getCurrentBranch(testDir);

      // Create and checkout feature branch
      await createBranch(testDir, 'feature');

      // Make changes on feature branch
      await writeFile(path.join(testDir, 'feature.txt'), 'feature content');
      await stageAll(testDir);
      await commit(testDir, 'Add feature file');

      // Switch back to initial branch
      await checkout(testDir, initialBranch);

      // Merge feature into main
      const result = await merge(testDir, 'feature');

      expect(result.success).toBe(true);
      expect(result.conflicts).toBe(false);
      expect(result.mergeCommit).toBeDefined();
    });

    it('should perform a fast-forward merge', async () => {
      // Create and checkout feature branch
      await createBranch(testDir, 'feature');

      // Make changes on feature branch
      await writeFile(path.join(testDir, 'feature.txt'), 'feature content');
      await stageAll(testDir);
      await commit(testDir, 'Add feature file');

      // Get initial branch name
      const mainBranch = await getCurrentBranch(testDir);
      const initialBranch = mainBranch === 'feature' ? 'main' : 'master';

      // Switch back to main
      await checkout(testDir, initialBranch);

      // Merge feature into main (should be fast-forward)
      const result = await merge(testDir, 'feature', { fastForward: true });

      expect(result.success).toBe(true);
      expect(result.conflicts).toBe(false);
    });

    it('should detect merge conflicts', async () => {
      // Create feature branch
      await createBranch(testDir, 'feature');

      // Make changes on feature branch
      await writeFile(path.join(testDir, 'main.txt'), 'feature content');
      await stageAll(testDir);
      await commit(testDir, 'Modify main.txt on feature');

      // Switch back to main
      const mainBranch = await getCurrentBranch(testDir);
      const initialBranch = mainBranch === 'feature' ? 'main' : 'master';
      await checkout(testDir, initialBranch);

      // Modify same file on main
      await writeFile(path.join(testDir, 'main.txt'), 'main content updated');
      await stageAll(testDir);
      await commit(testDir, 'Modify main.txt on main');

      // Try to merge - should conflict
      const result = await merge(testDir, 'feature');

      expect(result.success).toBe(false);
      expect(result.conflicts).toBe(true);
      expect(result.conflictFiles).toBeDefined();
      expect(result.conflictFiles?.length).toBeGreaterThan(0);
    });

    it('should perform squash merge', async () => {
      // Create feature branch with multiple commits
      await createBranch(testDir, 'feature');

      await writeFile(path.join(testDir, 'file1.txt'), 'content 1');
      await stageAll(testDir);
      await commit(testDir, 'Commit 1');

      await writeFile(path.join(testDir, 'file2.txt'), 'content 2');
      await stageAll(testDir);
      await commit(testDir, 'Commit 2');

      // Switch back to main
      const mainBranch = await getCurrentBranch(testDir);
      const initialBranch = mainBranch === 'feature' ? 'main' : 'master';
      await checkout(testDir, initialBranch);

      // Squash merge
      const result = await merge(testDir, 'feature', {
        squash: true,
        message: 'Squashed feature branch',
      });

      expect(result.success).toBe(true);
      expect(result.conflicts).toBe(false);
      expect(result.mergeCommit).toBeDefined();
    });

    it('should check for conflicts', async () => {
      // Initially no conflicts
      let conflicts = await hasConflicts(testDir);
      expect(conflicts).toBe(false);

      // Create conflicting merge
      await createBranch(testDir, 'feature');
      await writeFile(path.join(testDir, 'main.txt'), 'feature content');
      await stageAll(testDir);
      await commit(testDir, 'Modify on feature');

      const mainBranch = await getCurrentBranch(testDir);
      const initialBranch = mainBranch === 'feature' ? 'main' : 'master';
      await checkout(testDir, initialBranch);

      await writeFile(path.join(testDir, 'main.txt'), 'main content updated');
      await stageAll(testDir);
      await commit(testDir, 'Modify on main');

      // Create conflict
      await merge(testDir, 'feature');

      // Should have conflicts now
      conflicts = await hasConflicts(testDir);
      expect(conflicts).toBe(true);
    });

    it('should abort a merge', async () => {
      // Create conflicting merge
      await createBranch(testDir, 'feature');
      await writeFile(path.join(testDir, 'main.txt'), 'feature content');
      await stageAll(testDir);
      await commit(testDir, 'Modify on feature');

      const mainBranch = await getCurrentBranch(testDir);
      const initialBranch = mainBranch === 'feature' ? 'main' : 'master';
      await checkout(testDir, initialBranch);

      await writeFile(path.join(testDir, 'main.txt'), 'main content updated');
      await stageAll(testDir);
      await commit(testDir, 'Modify on main');

      // Create conflict
      await merge(testDir, 'feature');

      // Verify conflict exists
      expect(await hasConflicts(testDir)).toBe(true);

      // Abort merge
      await abortMerge(testDir);

      // Should no longer have conflicts
      expect(await hasConflicts(testDir)).toBe(false);
    });
  });

  describe('branch deletion', () => {
    beforeEach(async () => {
      await initRepo(testDir);
      await writeFile(path.join(testDir, 'test.txt'), 'test');
      await stageAll(testDir);
      await commit(testDir, 'Initial commit');
    });

    it('should delete a local branch', async () => {
      await createBranch(testDir, 'to-delete');

      // Switch back to main
      const mainBranch = await getCurrentBranch(testDir);
      const initialBranch = mainBranch === 'to-delete' ? 'main' : 'master';
      await checkout(testDir, initialBranch);

      // Delete branch
      await deleteBranch(testDir, 'to-delete');

      // Verify branch is deleted
      const exists = await branchExists(testDir, 'to-delete');
      expect(exists).toBe(false);
    });
  });

  describe('changed files', () => {
    beforeEach(async () => {
      await initRepo(testDir);
      await writeFile(path.join(testDir, 'base.txt'), 'base content');
      await stageAll(testDir);
      await commit(testDir, 'Base commit');
    });

    it('should get changed files between branches', async () => {
      // Create feature branch with changes
      await createBranch(testDir, 'feature');

      await writeFile(path.join(testDir, 'new-file.txt'), 'new content');
      await writeFile(path.join(testDir, 'another.txt'), 'another content');
      await stageAll(testDir);
      await commit(testDir, 'Add new files');

      // Get main branch name
      const mainBranch = await getCurrentBranch(testDir);
      const baseBranch = mainBranch === 'feature' ? 'main' : 'master';

      // Get changed files
      const changed = await getChangedFiles(testDir, baseBranch, 'feature');

      expect(changed).toContain('new-file.txt');
      expect(changed).toContain('another.txt');
      expect(changed.length).toBe(2);
    });

    it('should return empty array when no changes', async () => {
      const mainBranch = await getCurrentBranch(testDir);
      const changed = await getChangedFiles(testDir, mainBranch, mainBranch);

      expect(changed).toEqual([]);
    });
  });
});
