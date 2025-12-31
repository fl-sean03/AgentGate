/**
 * Workspace Manager Integration Tests
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { create, deleteById, type LocalSource } from '../src/workspace/manager.js';
import { acquire, release, isLeased } from '../src/workspace/lease.js';

const TOY_REPO_PATH = path.join(import.meta.dirname, '../test-fixtures/toy-repo');

describe('Workspace Manager', () => {
  const createdWorkspaces: string[] = [];

  afterEach(async () => {
    // Cleanup created workspaces
    for (const id of createdWorkspaces) {
      try {
        await release(id);
        await deleteById(id, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    createdWorkspaces.length = 0;
  });

  it('should create a workspace from local path', async () => {
    const source: LocalSource = {
      type: 'local',
      path: TOY_REPO_PATH,
    };

    const workspace = await create(source);
    createdWorkspaces.push(workspace.id);

    expect(workspace.id).toBeDefined();
    expect(workspace.rootPath).toBeDefined();
    expect(workspace.createdAt).toBeInstanceOf(Date);
  });

  it('should acquire and release workspace leases', async () => {
    const source: LocalSource = {
      type: 'local',
      path: TOY_REPO_PATH,
    };

    const workspace = await create(source);
    createdWorkspaces.push(workspace.id);

    // Not leased initially
    expect(await isLeased(workspace.id)).toBe(false);

    // Acquire lease
    const lease = await acquire(workspace.id, 'test-run-1');
    expect(lease).toBeDefined();
    expect(await isLeased(workspace.id)).toBe(true);

    // Release lease
    if (lease) {
      await release(lease.id);
    }
    expect(await isLeased(workspace.id)).toBe(false);
  });

  it('should prevent double acquisition', async () => {
    const source: LocalSource = {
      type: 'local',
      path: TOY_REPO_PATH,
    };

    const workspace = await create(source);
    createdWorkspaces.push(workspace.id);

    const lease1 = await acquire(workspace.id, 'test-run-1');
    expect(lease1).toBeDefined();

    // Should return null on second acquire (already leased)
    const lease2 = await acquire(workspace.id, 'test-run-2');
    expect(lease2).toBeNull();

    if (lease1) {
      await release(lease1.id);
    }
  });
});
