# 09: Thrust 8 - WorkspaceManager Facade

## Overview

Create a unified `WorkspaceManager` facade that consolidates workspace operations (acquire, release, snapshot, restore, git operations), reducing the 15+ imports in orchestrator to a single dependency.

---

## Current State

### Import Explosion in Orchestrator

**Location:** `packages/server/src/orchestrator/orchestrator.ts`

```typescript
import { acquireWorkspace } from '../workspace/acquire.js';
import { releaseWorkspace } from '../workspace/release.js';
import { createSnapshot } from '../workspace/snapshot.js';
import { restoreSnapshot } from '../workspace/restore.js';
import { ensureGitRepo } from '../workspace/git-init.js';
import { createBranch } from '../workspace/git-branch.js';
import { commitChanges } from '../workspace/git-commit.js';
import { pushChanges } from '../workspace/git-push.js';
import { createPullRequest } from '../github/pr.js';
import { getRepoInfo } from '../github/repo.js';
import { cloneRepo } from '../github/clone.js';
import { forkRepo } from '../github/fork.js';
// ... and more
```

### Problems

1. **Tight coupling** - Orchestrator knows too much about workspace internals
2. **Hard to test** - Must mock 15+ modules for unit tests
3. **Inconsistent error handling** - Each function handles errors differently
4. **No transaction semantics** - Operations can leave workspace in inconsistent state
5. **Duplicate code** - Same patterns repeated across functions

---

## Target State

### WorkspaceManager Facade

```typescript
import { workspaceManager } from '../workspace/manager.js';

// One import instead of 15+
// Clean, testable interface
// Consistent error handling
// Transaction-like operations
```

### WorkspaceManager Interface

**Location:** `packages/server/src/workspace/manager.ts`

```typescript
export interface WorkspaceManager {
  // Lifecycle
  acquire(source: WorkspaceSource, options?: AcquireOptions): Promise<Workspace>;
  release(workspace: Workspace): Promise<void>;

  // Snapshots
  createSnapshot(workspace: Workspace): Promise<string>;
  restoreSnapshot(workspace: Workspace, snapshotId: string): Promise<void>;
  listSnapshots(workspace: Workspace): Promise<SnapshotInfo[]>;
  deleteSnapshot(workspace: Workspace, snapshotId: string): Promise<void>;

  // Git operations
  ensureRepo(workspace: Workspace): Promise<void>;
  createBranch(workspace: Workspace, branchName: string): Promise<void>;
  checkout(workspace: Workspace, branch: string): Promise<void>;
  commit(workspace: Workspace, message: string): Promise<string>;
  push(workspace: Workspace, options?: PushOptions): Promise<void>;
  pull(workspace: Workspace): Promise<void>;
  getDiff(workspace: Workspace, base?: string): Promise<string>;

  // GitHub operations
  createPullRequest(workspace: Workspace, options: PROptions): Promise<string>;
  getRepoInfo(workspace: Workspace): Promise<RepoInfo>;

  // Compound operations
  prepareForRun(source: WorkspaceSource, runId: string): Promise<PreparedWorkspace>;
  cleanupRun(runId: string): Promise<void>;
}
```

---

## Implementation

### Step 1: Create Types

**File:** `packages/server/src/workspace/types.ts`

```typescript
export interface Workspace {
  id: string;
  path: string;
  source: WorkspaceSource;
  createdAt: Date;
  lastAccessedAt: Date;
  state: WorkspaceState;
  metadata: Record<string, unknown>;
}

export enum WorkspaceState {
  ACTIVE = 'active',
  LOCKED = 'locked',
  RELEASING = 'releasing',
  RELEASED = 'released',
}

export interface AcquireOptions {
  /** Lease duration in seconds */
  leaseSeconds?: number;
  /** Whether to clone fresh vs reuse existing */
  fresh?: boolean;
  /** Branch to checkout */
  branch?: string;
}

export interface PushOptions {
  remote?: string;
  branch?: string;
  force?: boolean;
  setUpstream?: boolean;
}

export interface PROptions {
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
  labels?: string[];
}

export interface SnapshotInfo {
  id: string;
  createdAt: Date;
  commitHash: string;
  description?: string;
}

export interface RepoInfo {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  cloneUrl: string;
}

export interface PreparedWorkspace {
  workspace: Workspace;
  snapshotId: string;
  branchName: string;
  repoInfo: RepoInfo | null;
}
```

### Step 2: Create WorkspaceManager Implementation

**File:** `packages/server/src/workspace/manager.ts`

```typescript
import { EventEmitter } from 'node:events';
import {
  Workspace,
  WorkspaceState,
  AcquireOptions,
  PushOptions,
  PROptions,
  SnapshotInfo,
  RepoInfo,
  PreparedWorkspace,
} from './types.js';
import { WorkspaceSource } from '../types/workspace-source.js';
import { createLogger } from '../logging/index.js';

// Import underlying implementations
import { acquireWorkspace as doAcquire } from './acquire.js';
import { releaseWorkspace as doRelease } from './release.js';
import { createSnapshot as doCreateSnapshot } from './snapshot.js';
import { restoreSnapshot as doRestoreSnapshot } from './restore.js';
import * as git from './git.js';
import * as github from '../github/index.js';

const log = createLogger('workspace-manager');

/**
 * Unified facade for all workspace operations.
 */
export class WorkspaceManager extends EventEmitter {
  private activeWorkspaces: Map<string, Workspace> = new Map();

  // ============== Lifecycle ==============

  async acquire(
    source: WorkspaceSource,
    options: AcquireOptions = {}
  ): Promise<Workspace> {
    log.info({ source: source.type, options }, 'Acquiring workspace');

    const workspace = await doAcquire(source, {
      leaseSeconds: options.leaseSeconds ?? 3600,
      fresh: options.fresh ?? false,
    });

    this.activeWorkspaces.set(workspace.id, workspace);
    this.emit('workspace:acquired', workspace);

    if (options.branch) {
      await this.checkout(workspace, options.branch);
    }

    return workspace;
  }

  async release(workspace: Workspace): Promise<void> {
    log.info({ workspaceId: workspace.id }, 'Releasing workspace');

    workspace.state = WorkspaceState.RELEASING;

    try {
      await doRelease(workspace);
      workspace.state = WorkspaceState.RELEASED;
      this.activeWorkspaces.delete(workspace.id);
      this.emit('workspace:released', workspace);
    } catch (error) {
      log.error({ workspaceId: workspace.id, error }, 'Failed to release workspace');
      throw error;
    }
  }

  // ============== Snapshots ==============

  async createSnapshot(workspace: Workspace): Promise<string> {
    log.debug({ workspaceId: workspace.id }, 'Creating snapshot');

    const snapshotId = await doCreateSnapshot(workspace);
    this.emit('snapshot:created', { workspaceId: workspace.id, snapshotId });

    return snapshotId;
  }

  async restoreSnapshot(workspace: Workspace, snapshotId: string): Promise<void> {
    log.debug({ workspaceId: workspace.id, snapshotId }, 'Restoring snapshot');

    await doRestoreSnapshot(workspace, snapshotId);
    this.emit('snapshot:restored', { workspaceId: workspace.id, snapshotId });
  }

  async listSnapshots(workspace: Workspace): Promise<SnapshotInfo[]> {
    // Implementation depends on snapshot storage
    return [];
  }

  async deleteSnapshot(workspace: Workspace, snapshotId: string): Promise<void> {
    // Implementation depends on snapshot storage
  }

  // ============== Git Operations ==============

  async ensureRepo(workspace: Workspace): Promise<void> {
    await git.ensureRepo(workspace.path);
  }

  async createBranch(workspace: Workspace, branchName: string): Promise<void> {
    log.debug({ workspaceId: workspace.id, branchName }, 'Creating branch');
    await git.createBranch(workspace.path, branchName);
  }

  async checkout(workspace: Workspace, branch: string): Promise<void> {
    log.debug({ workspaceId: workspace.id, branch }, 'Checking out branch');
    await git.checkout(workspace.path, branch);
  }

  async commit(workspace: Workspace, message: string): Promise<string> {
    log.debug({ workspaceId: workspace.id }, 'Creating commit');
    return await git.commit(workspace.path, message);
  }

  async push(workspace: Workspace, options: PushOptions = {}): Promise<void> {
    log.debug({ workspaceId: workspace.id, options }, 'Pushing changes');
    await git.push(workspace.path, {
      remote: options.remote ?? 'origin',
      branch: options.branch,
      force: options.force ?? false,
      setUpstream: options.setUpstream ?? true,
    });
  }

  async pull(workspace: Workspace): Promise<void> {
    await git.pull(workspace.path);
  }

  async getDiff(workspace: Workspace, base?: string): Promise<string> {
    return await git.diff(workspace.path, base);
  }

  async getStatus(workspace: Workspace): Promise<git.GitStatus> {
    return await git.status(workspace.path);
  }

  // ============== GitHub Operations ==============

  async createPullRequest(
    workspace: Workspace,
    options: PROptions
  ): Promise<string> {
    log.info({ workspaceId: workspace.id, title: options.title }, 'Creating PR');

    const repoInfo = await this.getRepoInfo(workspace);
    const prUrl = await github.createPullRequest({
      owner: repoInfo.owner,
      repo: repoInfo.name,
      ...options,
    });

    this.emit('pr:created', { workspaceId: workspace.id, prUrl });
    return prUrl;
  }

  async getRepoInfo(workspace: Workspace): Promise<RepoInfo> {
    return await github.getRepoInfo(workspace.path);
  }

  // ============== Compound Operations ==============

  /**
   * Prepare a workspace for a run:
   * 1. Acquire workspace
   * 2. Create branch
   * 3. Create initial snapshot
   */
  async prepareForRun(
    source: WorkspaceSource,
    runId: string
  ): Promise<PreparedWorkspace> {
    log.info({ source: source.type, runId }, 'Preparing workspace for run');

    // Acquire
    const workspace = await this.acquire(source, { fresh: true });

    try {
      // Create branch
      const branchName = `agentgate/${runId}`;
      await this.createBranch(workspace, branchName);
      await this.checkout(workspace, branchName);

      // Create initial snapshot
      const snapshotId = await this.createSnapshot(workspace);

      // Get repo info if applicable
      let repoInfo: RepoInfo | null = null;
      if (source.type === 'github' || source.type === 'github-new') {
        repoInfo = await this.getRepoInfo(workspace);
      }

      return {
        workspace,
        snapshotId,
        branchName,
        repoInfo,
      };
    } catch (error) {
      // Cleanup on failure
      await this.release(workspace);
      throw error;
    }
  }

  /**
   * Cleanup after a run completes.
   */
  async cleanupRun(runId: string): Promise<void> {
    log.info({ runId }, 'Cleaning up run workspace');

    // Find workspace by run ID pattern
    for (const [id, workspace] of this.activeWorkspaces) {
      if (workspace.metadata.runId === runId) {
        await this.release(workspace);
      }
    }
  }

  /**
   * Get active workspace count.
   */
  getActiveCount(): number {
    return this.activeWorkspaces.size;
  }

  /**
   * Get all active workspaces.
   */
  getActiveWorkspaces(): Workspace[] {
    return Array.from(this.activeWorkspaces.values());
  }
}

// Singleton instance
let instance: WorkspaceManager | null = null;

export function getWorkspaceManager(): WorkspaceManager {
  if (!instance) {
    instance = new WorkspaceManager();
  }
  return instance;
}

// For testing
export function resetWorkspaceManager(): void {
  instance = null;
}
```

### Step 3: Create Index File

**File:** `packages/server/src/workspace/index.ts`

```typescript
export { WorkspaceManager, getWorkspaceManager, resetWorkspaceManager } from './manager.js';
export * from './types.js';
```

### Step 4: Refactor Orchestrator

**File:** `packages/server/src/orchestrator/orchestrator.ts`

```typescript
// BEFORE: 15+ imports
import { acquireWorkspace } from '../workspace/acquire.js';
import { releaseWorkspace } from '../workspace/release.js';
// ... many more

// AFTER: 1 import
import { getWorkspaceManager, WorkspaceManager } from '../workspace/index.js';

export class Orchestrator {
  private workspaceManager: WorkspaceManager;

  constructor() {
    this.workspaceManager = getWorkspaceManager();
  }

  private async executeRun(run: Run): Promise<void> {
    // Prepare workspace
    const prepared = await this.workspaceManager.prepareForRun(
      run.workspaceSource,
      run.id
    );

    try {
      // Run iterations
      for (let i = 0; i < run.maxIterations; i++) {
        // Agent execution
        const result = await this.executeIteration(prepared.workspace, i);

        if (result.success) {
          // Commit and push
          await this.workspaceManager.commit(
            prepared.workspace,
            `[AgentGate] Iteration ${i + 1}`
          );
          await this.workspaceManager.push(prepared.workspace, {
            branch: prepared.branchName,
          });

          // Create PR
          const prUrl = await this.workspaceManager.createPullRequest(
            prepared.workspace,
            {
              title: `[AgentGate] ${run.taskPrompt}`,
              body: this.generatePRBody(run),
              head: prepared.branchName,
              base: prepared.repoInfo?.defaultBranch ?? 'main',
            }
          );

          run.prUrl = prUrl;
          break;
        }

        // Restore snapshot for next iteration
        await this.workspaceManager.restoreSnapshot(
          prepared.workspace,
          prepared.snapshotId
        );
      }
    } finally {
      // Always cleanup
      await this.workspaceManager.cleanupRun(run.id);
    }
  }
}
```

---

## Testing

### Unit Tests

**File:** `packages/server/test/workspace-manager.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceManager, resetWorkspaceManager } from '../src/workspace/manager.js';

// Mock underlying modules
vi.mock('../src/workspace/acquire.js');
vi.mock('../src/workspace/release.js');
vi.mock('../src/workspace/snapshot.js');
vi.mock('../src/workspace/git.js');
vi.mock('../src/github/index.js');

describe('WorkspaceManager', () => {
  let manager: WorkspaceManager;

  beforeEach(() => {
    resetWorkspaceManager();
    manager = new WorkspaceManager();
    vi.clearAllMocks();
  });

  describe('acquire', () => {
    it('should acquire workspace and track it', async () => {
      const mockWorkspace = {
        id: 'ws-1',
        path: '/tmp/workspace',
        source: { type: 'local', path: '/src' },
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        state: 'active',
        metadata: {},
      };

      const { acquireWorkspace } = await import('../src/workspace/acquire.js');
      vi.mocked(acquireWorkspace).mockResolvedValue(mockWorkspace);

      const workspace = await manager.acquire({ type: 'local', path: '/src' });

      expect(workspace.id).toBe('ws-1');
      expect(manager.getActiveCount()).toBe(1);
    });

    it('should checkout branch if specified', async () => {
      const mockWorkspace = { id: 'ws-1', path: '/tmp/ws' };
      const { acquireWorkspace } = await import('../src/workspace/acquire.js');
      const git = await import('../src/workspace/git.js');

      vi.mocked(acquireWorkspace).mockResolvedValue(mockWorkspace as any);

      await manager.acquire({ type: 'local', path: '/src' }, { branch: 'develop' });

      expect(git.checkout).toHaveBeenCalledWith('/tmp/ws', 'develop');
    });
  });

  describe('release', () => {
    it('should release workspace and remove from tracking', async () => {
      const mockWorkspace = { id: 'ws-1', path: '/tmp/ws', state: 'active' };
      const { acquireWorkspace } = await import('../src/workspace/acquire.js');
      const { releaseWorkspace } = await import('../src/workspace/release.js');

      vi.mocked(acquireWorkspace).mockResolvedValue(mockWorkspace as any);
      vi.mocked(releaseWorkspace).mockResolvedValue(undefined);

      const workspace = await manager.acquire({ type: 'local', path: '/src' });
      await manager.release(workspace);

      expect(manager.getActiveCount()).toBe(0);
    });
  });

  describe('prepareForRun', () => {
    it('should acquire, branch, and snapshot', async () => {
      const mockWorkspace = { id: 'ws-1', path: '/tmp/ws' };
      const { acquireWorkspace } = await import('../src/workspace/acquire.js');
      const { createSnapshot } = await import('../src/workspace/snapshot.js');
      const git = await import('../src/workspace/git.js');

      vi.mocked(acquireWorkspace).mockResolvedValue(mockWorkspace as any);
      vi.mocked(createSnapshot).mockResolvedValue('snap-123');

      const prepared = await manager.prepareForRun(
        { type: 'local', path: '/src' },
        'run-abc'
      );

      expect(prepared.workspace.id).toBe('ws-1');
      expect(prepared.snapshotId).toBe('snap-123');
      expect(prepared.branchName).toBe('agentgate/run-abc');
      expect(git.createBranch).toHaveBeenCalled();
    });

    it('should cleanup on failure', async () => {
      const mockWorkspace = { id: 'ws-1', path: '/tmp/ws' };
      const { acquireWorkspace } = await import('../src/workspace/acquire.js');
      const { releaseWorkspace } = await import('../src/workspace/release.js');
      const git = await import('../src/workspace/git.js');

      vi.mocked(acquireWorkspace).mockResolvedValue(mockWorkspace as any);
      vi.mocked(git.createBranch).mockRejectedValue(new Error('Branch exists'));

      await expect(
        manager.prepareForRun({ type: 'local', path: '/src' }, 'run-abc')
      ).rejects.toThrow('Branch exists');

      expect(releaseWorkspace).toHaveBeenCalled();
    });
  });

  describe('events', () => {
    it('should emit events on operations', async () => {
      const mockWorkspace = { id: 'ws-1', path: '/tmp/ws' };
      const { acquireWorkspace } = await import('../src/workspace/acquire.js');
      vi.mocked(acquireWorkspace).mockResolvedValue(mockWorkspace as any);

      const acquiredHandler = vi.fn();
      manager.on('workspace:acquired', acquiredHandler);

      await manager.acquire({ type: 'local', path: '/src' });

      expect(acquiredHandler).toHaveBeenCalledWith(mockWorkspace);
    });
  });
});
```

---

## Verification Checklist

- [ ] `Workspace` and related types defined in `workspace/types.ts`
- [ ] `WorkspaceManager` class created in `workspace/manager.ts`
- [ ] Lifecycle methods: acquire, release
- [ ] Snapshot methods: create, restore, list, delete
- [ ] Git methods: ensureRepo, createBranch, checkout, commit, push, pull, getDiff
- [ ] GitHub methods: createPullRequest, getRepoInfo
- [ ] Compound methods: prepareForRun, cleanupRun
- [ ] Events emitted for key operations
- [ ] Singleton accessor: getWorkspaceManager()
- [ ] Index file exports public API
- [ ] Orchestrator refactored to use WorkspaceManager
- [ ] Unit tests with mocked dependencies
- [ ] Active workspace tracking works correctly

---

## Benefits

1. **Single dependency** - One import instead of 15+
2. **Easier testing** - Mock one class instead of many modules
3. **Consistent error handling** - All operations go through facade
4. **Event-driven** - Subscribe to workspace lifecycle events
5. **Compound operations** - prepareForRun handles common patterns
6. **Transaction-like** - Cleanup on failure
