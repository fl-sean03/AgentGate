/**
 * GitHub Operation Modes and Clone Modes (v0.2.19 - Thrust 6)
 *
 * Provides configurable GitHub operation modes to handle GitHub failures
 * gracefully, and workspace cloning strategies for performance optimization.
 */

/**
 * Clone modes for GitHub workspaces.
 * Determines how repositories are cloned and prepared.
 */
export enum CloneMode {
  /**
   * Fresh clone every time.
   * Slowest but guarantees clean state.
   * Use for: production runs, clean room verification.
   */
  FRESH = 'fresh',

  /**
   * Reuse cached clone if available.
   * Faster for repeated runs on same repo.
   * Use for: development, iterative testing.
   */
  CACHED = 'cached',

  /**
   * Shallow clone with limited history.
   * Fastest initial clone, limited git history.
   * Use for: large repos, CI environments.
   */
  SHALLOW = 'shallow',
}

/**
 * Modes for handling GitHub operations (push, PR creation, etc.).
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
   * Use when local changes are the primary value.
   */
  BEST_EFFORT = 'best_effort',

  /**
   * Skip all GitHub operations.
   * Use for local-only development or testing.
   */
  DISABLED = 'disabled',
}

/**
 * Get the default GitHub mode based on gitOps mode.
 *
 * @param gitOpsMode - The git operations mode
 * @returns Appropriate default GitHubMode
 */
export function getDefaultGitHubMode(gitOpsMode: string): GitHubMode {
  switch (gitOpsMode) {
    case 'pr':
    case 'fork':
    case 'github_pr':
      return GitHubMode.FAIL_FAST; // PR modes expect PRs to work
    case 'branch':
    case 'push_only':
      return GitHubMode.BEST_EFFORT; // Branch mode can work locally
    case 'direct':
    case 'local':
      return GitHubMode.DISABLED; // Direct/local mode is local-only
    default:
      return GitHubMode.BEST_EFFORT;
  }
}

/**
 * Result of a single GitHub operation.
 */
export interface GitHubOperationResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Type of operation performed */
  operation: 'push' | 'create_pr' | 'create_branch' | 'add_comment' | 'update_pr';

  /** Resulting URL if applicable (PR URL, etc.) */
  url?: string;

  /** Error message if failed */
  error?: string;

  /** Number of retries performed */
  retried: number;

  /** Mode that was active */
  mode: GitHubMode;

  /** Whether this operation was skipped (disabled mode) */
  skipped: boolean;
}

/**
 * Summary of all GitHub operations for a run.
 */
export interface GitHubOperationsSummary {
  /** The mode used for operations */
  mode: GitHubMode;

  /** All operation results */
  operations: GitHubOperationResult[];

  /** Whether all operations succeeded */
  allSucceeded: boolean;

  /** Whether any operation failed */
  anyFailed: boolean;

  /** Final PR URL if created */
  prUrl: string | null;

  /** Branch name used */
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

/**
 * Configuration for workspace caching.
 */
export interface WorkspaceCacheConfig {
  /** Whether caching is enabled */
  enabled: boolean;

  /** Maximum number of cached workspaces */
  maxCached: number;

  /** Maximum age of cached workspace in milliseconds */
  maxAgeMs: number;

  /** Directory for cached workspaces */
  cacheDir: string;
}

/**
 * Default workspace cache configuration.
 */
export const DEFAULT_CACHE_CONFIG: WorkspaceCacheConfig = {
  enabled: true,
  maxCached: 10,
  maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours
  cacheDir: '/tmp/agentgate-workspace-cache',
};

/**
 * Options for cloning a GitHub workspace.
 */
export interface CloneOptions {
  /** Clone mode to use */
  mode: CloneMode;

  /** Branch to checkout (default: main) */
  branch?: string;

  /** Depth for shallow clones (default: 1) */
  depth?: number;

  /** Whether to fetch submodules */
  submodules?: boolean;

  /** Cache configuration */
  cache?: Partial<WorkspaceCacheConfig>;
}

/**
 * Default clone options.
 */
export const DEFAULT_CLONE_OPTIONS: Required<CloneOptions> = {
  mode: CloneMode.FRESH,
  branch: 'main',
  depth: 1,
  submodules: false,
  cache: DEFAULT_CACHE_CONFIG,
};

/**
 * Result of a clone operation.
 */
export interface CloneResult {
  /** Whether the clone succeeded */
  success: boolean;

  /** Path to the cloned workspace */
  path: string;

  /** Clone mode used */
  mode: CloneMode;

  /** Whether a cached version was used */
  fromCache: boolean;

  /** Duration of clone operation in milliseconds */
  durationMs: number;

  /** Error message if failed */
  error?: string;
}
