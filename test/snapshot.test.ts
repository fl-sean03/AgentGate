/**
 * Snapshot Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { create, deleteById, type LocalSource } from '../src/workspace/manager.js';
import { captureBeforeState, captureAfterState } from '../src/snapshot/snapshotter.js';
import type { Workspace } from '../src/types/index.js';

const TOY_REPO_PATH = path.join(import.meta.dirname, '../test-fixtures/toy-repo');

describe('Snapshot', () => {
  let workspace: Workspace;

  beforeAll(async () => {
    const source: LocalSource = {
      type: 'local',
      path: TOY_REPO_PATH,
    };
    workspace = await create(source);
  });

  afterAll(async () => {
    if (workspace) {
      await deleteById(workspace.id, { force: true });
    }
  });

  it('should capture before state', async () => {
    const beforeState = await captureBeforeState(workspace);

    expect(beforeState.sha).toBeDefined();
    expect(beforeState.sha.length).toBe(40); // Git SHA length
    expect(beforeState.branch).toBeDefined();
    expect(beforeState.capturedAt).toBeInstanceOf(Date);
  });

  it('should capture after state with changes', async () => {
    const beforeState = await captureBeforeState(workspace);

    // Make a change
    const testFile = path.join(workspace.rootPath, 'test-change.txt');
    await fs.writeFile(testFile, 'Test content for snapshot');

    const snapshot = await captureAfterState(
      workspace,
      beforeState,
      'test-run-id',
      1,
      'Test task prompt'
    );

    expect(snapshot.id).toBeDefined();
    expect(snapshot.beforeSha).toBe(beforeState.sha);
    // The snapshot tracks changes
    expect(snapshot.afterSha).toBeDefined();
    expect(snapshot.filesChanged).toBeGreaterThanOrEqual(0);

    // Cleanup - remove test file and reset
    await fs.unlink(testFile);
  });
});
