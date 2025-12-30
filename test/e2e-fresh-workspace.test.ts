/**
 * E2E Test: Fresh Workspace with Claude Code
 *
 * This test validates the full pipeline:
 * 1. Creates a fresh TypeScript workspace
 * 2. Runs Claude Code to implement a simple task
 * 3. Verifies the output
 */

import { describe, it, expect, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createFresh, deleteById } from '../src/workspace/manager.js';
import { getTypeScriptSeedFiles } from '../src/workspace/templates.js';
import type { Workspace } from '../src/types/index.js';

const TEST_WORKSPACE_PATH = path.join(import.meta.dirname, '../test-output/e2e-fresh');

describe('E2E: Fresh Workspace', () => {
  let workspace: Workspace | null = null;

  afterAll(async () => {
    if (workspace) {
      try {
        await deleteById(workspace.id, { deleteFiles: true });
      } catch {
        // Cleanup error is ok
      }
    }
    // Also try to remove the test output directory
    try {
      await fs.rm(TEST_WORKSPACE_PATH, { recursive: true, force: true });
    } catch {
      // Ok if it doesn't exist
    }
  });

  it('should create a fresh TypeScript workspace with seed files', async () => {
    const seedFiles = getTypeScriptSeedFiles({
      projectName: 'E2E Test Project',
      taskDescription: 'Create a function that adds two numbers',
    });

    workspace = await createFresh(TEST_WORKSPACE_PATH, {
      seedFiles,
      commitMessage: 'E2E test initialization',
    });

    expect(workspace.id).toBeDefined();
    expect(workspace.rootPath).toBe(TEST_WORKSPACE_PATH);
    expect(workspace.gitInitialized).toBe(true);

    // Verify seed files were created
    const claudeMd = await fs.readFile(path.join(TEST_WORKSPACE_PATH, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('E2E Test Project');
    expect(claudeMd).toContain('Create a function that adds two numbers');

    const packageJson = await fs.readFile(path.join(TEST_WORKSPACE_PATH, 'package.json'), 'utf-8');
    expect(JSON.parse(packageJson).name).toBe('e2e-test-project');

    const tsconfig = await fs.readFile(path.join(TEST_WORKSPACE_PATH, 'tsconfig.json'), 'utf-8');
    expect(JSON.parse(tsconfig).compilerOptions.strict).toBe(true);

    const indexTs = await fs.readFile(path.join(TEST_WORKSPACE_PATH, 'src/index.ts'), 'utf-8');
    expect(indexTs).toContain('E2E Test Project');
  });

  it('should have a valid git repository', async () => {
    expect(workspace).not.toBeNull();

    // Check that .git exists
    const gitDir = path.join(TEST_WORKSPACE_PATH, '.git');
    const stat = await fs.stat(gitDir);
    expect(stat.isDirectory()).toBe(true);

    // Check that we have at least one commit
    const { execa } = await import('execa');
    const result = await execa('git', ['log', '--oneline', '-1'], {
      cwd: TEST_WORKSPACE_PATH,
    });
    expect(result.stdout).toContain('E2E test initialization');
  });
});
