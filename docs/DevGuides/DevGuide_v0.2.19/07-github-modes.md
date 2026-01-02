# 07: Thrust 6 - GitHub Operation Modes

## Overview

Implement configurable GitHub operation modes to handle GitHub failures gracefully, allowing runs to continue or fail explicitly based on configuration.

---

## Current State

### GitHub Failure Handling Today

**Location:** `packages/server/src/orchestrator/run-executor.ts:421-438`

```typescript
try {
  const prUrl = await createPullRequest({...});
  run.prUrl = prUrl;
} catch (error) {
  log.warn({ error }, 'Failed to create PR, continuing without PR');
  // Run succeeds even though PR creation failed!
}
```

### Problems

1. **Silent failure** - PR creation fails but run "succeeds"
2. **No configuration** - Can't choose between fail-fast vs best-effort
3. **Inconsistent state** - Run says succeeded but no PR exists
4. **No retry** - GitHub rate limits cause immediate failure

---

## Target State

### GitHubMode Enum

**Location:** `packages/server/src/types/github-mode.ts`

```typescript
/**
 * Modes for handling GitHub operations.
 */
export enum GitHubMode {
  /**
   * Fail the run if any GitHub operation fails.
   * Use when PR creation is critical to workflow.
   */
  FAIL_FAST = 'fail_fast',

  /**
   * Log warning and continue if GitHub operations fail.
   * Run marked as succeeded but without PR.
   * Use when local changes are primary value.
   */
  BEST_EFFORT = 'best_effort',

  /**
   * Skip all GitHub operations.
   * Use for local-only development or testing.
   */
  DISABLED = 'disabled',
}

/**
 * Result of a GitHub operation.
 */
export interface GitHubOperationResult {
  success: boolean;
  operation: 'push' | 'create_pr' | 'create_branch' | 'add_comment';
  url?: string;
  error?: string;
  retried: number;
  mode: GitHubMode;
}

/**
 * Summary of all GitHub operations for a run.
 */
export interface GitHubOperationsSummary {
  mode: GitHubMode;
  operations: GitHubOperationResult[];
  allSucceeded: boolean;
  prUrl: string | null;
  branchName: string | null;
}
```

### Example Configurations

```typescript
// Critical workflow - fail if no PR
const criticalConfig = {
  gitOps: {
    mode: 'pr',
    githubMode: GitHubMode.FAIL_FAST,
  },
};

// Flexible workflow - continue even if PR fails
const flexibleConfig = {
  gitOps: {
    mode: 'pr',
    githubMode: GitHubMode.BEST_EFFORT,
  },
};

// Local development - no GitHub at all
const localConfig = {
  gitOps: {
    mode: 'direct',
    githubMode: GitHubMode.DISABLED,
  },
};
```

---

## Implementation

### Step 1: Create Type Definitions

**File:** `packages/server/src/types/github-mode.ts`

```typescript
/**
 * Modes for handling GitHub operations.
 */
export enum GitHubMode {
  FAIL_FAST = 'fail_fast',
  BEST_EFFORT = 'best_effort',
  DISABLED = 'disabled',
}

/**
 * Default GitHub mode based on gitOps mode.
 */
export function getDefaultGitHubMode(gitOpsMode: string): GitHubMode {
  switch (gitOpsMode) {
    case 'pr':
    case 'fork':
      return GitHubMode.FAIL_FAST;  // PR modes expect PRs to work
    case 'branch':
      return GitHubMode.BEST_EFFORT;  // Branch mode can work locally
    case 'direct':
      return GitHubMode.DISABLED;  // Direct mode is local-only
    default:
      return GitHubMode.BEST_EFFORT;
  }
}

/**
 * Result of a GitHub operation.
 */
export interface GitHubOperationResult {
  success: boolean;
  operation: 'push' | 'create_pr' | 'create_branch' | 'add_comment';
  url?: string;
  error?: string;
  retried: number;
  mode: GitHubMode;
  skipped: boolean;
}

/**
 * Summary of all GitHub operations for a run.
 */
export interface GitHubOperationsSummary {
  mode: GitHubMode;
  operations: GitHubOperationResult[];
  allSucceeded: boolean;
  anyFailed: boolean;
  prUrl: string | null;
  branchName: string | null;
}

/**
 * Create an empty operations summary.
 */
export function createOperationsSummary(mode: GitHubMode): GitHubOperationsSummary {
  return {
    mode,
    operations: [],
    allSucceeded: true,
    anyFailed: false,
    prUrl: null,
    branchName: null,
  };
}
```

### Step 2: Create GitHubOperationHandler

**File:** `packages/server/src/orchestrator/github-handler.ts`

```typescript
import {
  GitHubMode,
  GitHubOperationResult,
  GitHubOperationsSummary,
  createOperationsSummary,
  getDefaultGitHubMode,
} from '../types/github-mode.js';
import { RetryExecutor, createRetryExecutor } from './retry-executor.js';
import { BuildErrorType } from '../types/build-error.js';
import { createLogger } from '../logging/index.js';

const log = createLogger('github-handler');

/**
 * Handles GitHub operations with configurable failure modes.
 */
export class GitHubOperationHandler {
  private mode: GitHubMode;
  private retryExecutor: RetryExecutor;
  private summary: GitHubOperationsSummary;

  constructor(mode: GitHubMode) {
    this.mode = mode;
    this.retryExecutor = createRetryExecutor({
      maxAttempts: 3,
      initialBackoffMs: 2000,
      retryableErrors: [BuildErrorType.GITHUB_ERROR],
    });
    this.summary = createOperationsSummary(mode);
  }

  /**
   * Execute a GitHub operation with mode-appropriate handling.
   */
  async execute<T>(
    operation: 'push' | 'create_pr' | 'create_branch' | 'add_comment',
    fn: () => Promise<T>
  ): Promise<{ success: boolean; result: T | null; error?: string }> {
    // Skip if disabled
    if (this.mode === GitHubMode.DISABLED) {
      const result: GitHubOperationResult = {
        success: true,
        operation,
        retried: 0,
        mode: this.mode,
        skipped: true,
      };
      this.summary.operations.push(result);
      log.debug({ operation }, 'GitHub operation skipped (disabled mode)');
      return { success: true, result: null };
    }

    // Execute with retry
    const retryResult = await this.retryExecutor.execute(fn, {
      extractErrorType: () => BuildErrorType.GITHUB_ERROR,
      onAttempt: (attempt) => {
        if (attempt.willRetry) {
          log.info(
            { operation, attempt: attempt.attempt, nextRetryMs: attempt.nextRetryMs },
            'Retrying GitHub operation'
          );
        }
      },
    });

    const opResult: GitHubOperationResult = {
      success: retryResult.success,
      operation,
      url: retryResult.result ? String(retryResult.result) : undefined,
      error: retryResult.finalError?.message,
      retried: retryResult.retriedCount,
      mode: this.mode,
      skipped: false,
    };
    this.summary.operations.push(opResult);

    if (retryResult.success) {
      log.info({ operation, retried: retryResult.retriedCount }, 'GitHub operation succeeded');

      // Track PR URL
      if (operation === 'create_pr' && typeof retryResult.result === 'string') {
        this.summary.prUrl = retryResult.result;
      }

      return { success: true, result: retryResult.result };
    }

    // Handle failure based on mode
    this.summary.anyFailed = true;
    this.summary.allSucceeded = false;

    if (this.mode === GitHubMode.FAIL_FAST) {
      log.error(
        { operation, error: retryResult.finalError?.message },
        'GitHub operation failed (fail_fast mode)'
      );
      return {
        success: false,
        result: null,
        error: retryResult.finalError?.message,
      };
    }

    // BEST_EFFORT mode - log warning and continue
    log.warn(
      { operation, error: retryResult.finalError?.message },
      'GitHub operation failed (best_effort mode, continuing)'
    );
    return { success: true, result: null };  // "Success" in best-effort terms
  }

  /**
   * Get the operations summary.
   */
  getSummary(): GitHubOperationsSummary {
    return { ...this.summary };
  }

  /**
   * Check if the run should fail due to GitHub errors.
   */
  shouldFailRun(): boolean {
    return this.mode === GitHubMode.FAIL_FAST && this.summary.anyFailed;
  }
}

/**
 * Create a GitHub operation handler for a run.
 */
export function createGitHubHandler(
  gitOpsMode: string,
  explicitMode?: GitHubMode
): GitHubOperationHandler {
  const mode = explicitMode ?? getDefaultGitHubMode(gitOpsMode);
  return new GitHubOperationHandler(mode);
}
```

### Step 3: Integrate with RunExecutor

**File:** `packages/server/src/orchestrator/run-executor.ts`

```typescript
import { createGitHubHandler } from './github-handler.js';
import { GitHubMode } from '../types/github-mode.js';

// In run execution:
const githubHandler = createGitHubHandler(
  harnessConfig.gitOps?.mode ?? 'direct',
  harnessConfig.gitOps?.githubMode
);

// Push changes
const pushResult = await githubHandler.execute('push', async () => {
  await git.push({ remote: 'origin', branch: branchName });
  return branchName;
});

if (!pushResult.success) {
  run.result = RunResult.FAILED_GITHUB;
  run.error = `Push failed: ${pushResult.error}`;
  break;
}

// Create PR
const prResult = await githubHandler.execute('create_pr', async () => {
  return await createPullRequest({
    title: `[AgentGate] ${taskPrompt}`,
    body: generatePRBody(run),
    head: branchName,
    base: 'main',
  });
});

if (!prResult.success && githubHandler.shouldFailRun()) {
  run.result = RunResult.FAILED_GITHUB;
  run.error = `PR creation failed: ${prResult.error}`;
  break;
}

// Record GitHub operations in run
run.prUrl = prResult.result ?? null;
run.githubSummary = githubHandler.getSummary();
```

### Step 4: Update HarnessConfig

**File:** `packages/server/src/types/harness-config.ts`

```typescript
import { GitHubMode } from './github-mode.js';

export interface GitOpsConfig {
  mode: 'direct' | 'branch' | 'pr' | 'fork';
  branchPattern?: string;
  draftPR?: boolean;
  autoMerge?: boolean;

  // NEW: GitHub operation failure handling
  githubMode?: GitHubMode;
}
```

---

## Testing

### Unit Tests

**File:** `packages/server/test/github-handler.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GitHubOperationHandler, createGitHubHandler } from '../src/orchestrator/github-handler.js';
import { GitHubMode } from '../src/types/github-mode.js';

describe('GitHubOperationHandler', () => {
  describe('DISABLED mode', () => {
    it('should skip operations and return success', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.DISABLED);

      const result = await handler.execute('create_pr', async () => {
        throw new Error('Should not be called');
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeNull();

      const summary = handler.getSummary();
      expect(summary.operations[0].skipped).toBe(true);
    });
  });

  describe('FAIL_FAST mode', () => {
    it('should return failure on error', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.FAIL_FAST);

      const result = await handler.execute('create_pr', async () => {
        throw new Error('GitHub API error');
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub API error');
      expect(handler.shouldFailRun()).toBe(true);
    });

    it('should succeed on success', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.FAIL_FAST);

      const result = await handler.execute('create_pr', async () => {
        return 'https://github.com/owner/repo/pull/123';
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('https://github.com/owner/repo/pull/123');
      expect(handler.shouldFailRun()).toBe(false);
      expect(handler.getSummary().prUrl).toBe('https://github.com/owner/repo/pull/123');
    });
  });

  describe('BEST_EFFORT mode', () => {
    it('should return success even on error', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.BEST_EFFORT);

      const result = await handler.execute('create_pr', async () => {
        throw new Error('GitHub API error');
      });

      expect(result.success).toBe(true);  // Best effort "succeeds"
      expect(result.result).toBeNull();
      expect(handler.shouldFailRun()).toBe(false);

      const summary = handler.getSummary();
      expect(summary.anyFailed).toBe(true);
      expect(summary.prUrl).toBeNull();
    });
  });

  describe('retry behavior', () => {
    it('should retry on transient errors', async () => {
      const handler = new GitHubOperationHandler(GitHubMode.FAIL_FAST);

      let attempts = 0;
      const result = await handler.execute('push', async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Rate limited');
        }
        return 'main';
      });

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);

      const summary = handler.getSummary();
      expect(summary.operations[0].retried).toBe(2);
    });
  });
});

describe('createGitHubHandler', () => {
  it('should use FAIL_FAST for pr mode', () => {
    const handler = createGitHubHandler('pr');
    expect(handler.getSummary().mode).toBe(GitHubMode.FAIL_FAST);
  });

  it('should use DISABLED for direct mode', () => {
    const handler = createGitHubHandler('direct');
    expect(handler.getSummary().mode).toBe(GitHubMode.DISABLED);
  });

  it('should use explicit mode when provided', () => {
    const handler = createGitHubHandler('pr', GitHubMode.BEST_EFFORT);
    expect(handler.getSummary().mode).toBe(GitHubMode.BEST_EFFORT);
  });
});
```

---

## Verification Checklist

- [ ] `GitHubMode` enum defined with FAIL_FAST, BEST_EFFORT, DISABLED
- [ ] `GitHubOperationResult` tracks individual operation outcomes
- [ ] `GitHubOperationsSummary` aggregates all operations
- [ ] `GitHubOperationHandler` implements mode-appropriate handling
- [ ] DISABLED mode skips operations entirely
- [ ] FAIL_FAST mode fails run on GitHub error
- [ ] BEST_EFFORT mode logs warning and continues
- [ ] Retry logic applies to all GitHub operations
- [ ] RunExecutor uses GitHubOperationHandler
- [ ] HarnessConfig accepts githubMode option
- [ ] Run stores githubSummary for debugging
- [ ] Unit tests pass

---

## Benefits

1. **Explicit failure handling** - Know exactly what happens on GitHub errors
2. **Flexible workflows** - Different modes for different needs
3. **Automatic retry** - Rate limits don't immediately kill runs
4. **Visibility** - Operations summary shows what happened
5. **Testability** - DISABLED mode enables local testing
