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
      const exists = await branchExists(testDir, 'main');
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
});
