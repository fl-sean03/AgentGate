import { z } from 'zod';

// ============================================================================
// GitHub Configuration
// ============================================================================

/**
 * Configuration for GitHub API client
 */
export const gitHubConfigSchema = z.object({
  /** Personal Access Token with 'repo' scope */
  token: z.string().min(1),
  /** Base URL for GitHub API (for Enterprise, defaults to api.github.com) */
  baseUrl: z.string().url().optional(),
});

export type GitHubConfig = z.infer<typeof gitHubConfigSchema>;

// ============================================================================
// GitHub Repository
// ============================================================================

/**
 * GitHub repository metadata
 */
export const gitHubRepositorySchema = z.object({
  /** Repository owner (user or organization) */
  owner: z.string(),
  /** Repository name */
  repo: z.string(),
  /** Full name: owner/repo */
  fullName: z.string(),
  /** HTTPS clone URL */
  cloneUrl: z.string().url(),
  /** SSH clone URL */
  sshUrl: z.string(),
  /** Default branch (usually 'main') */
  defaultBranch: z.string(),
  /** Whether the repository is private */
  private: z.boolean(),
});

export type GitHubRepository = z.infer<typeof gitHubRepositorySchema>;

// ============================================================================
// GitHub Authentication
// ============================================================================

/**
 * Result of validating GitHub authentication
 */
export const gitHubAuthResultSchema = z.object({
  /** Whether authentication was successful */
  authenticated: z.boolean(),
  /** GitHub username */
  username: z.string(),
  /** OAuth scopes granted to the token */
  scopes: z.array(z.string()),
});

export type GitHubAuthResult = z.infer<typeof gitHubAuthResultSchema>;

// ============================================================================
// GitHub Pull Request
// ============================================================================

/**
 * Pull request state
 */
export const PullRequestState = {
  OPEN: 'open',
  CLOSED: 'closed',
  MERGED: 'merged',
} as const;

export type PullRequestState = (typeof PullRequestState)[keyof typeof PullRequestState];

/**
 * GitHub pull request metadata
 */
export const gitHubPullRequestSchema = z.object({
  /** PR number */
  number: z.number(),
  /** URL to the PR on GitHub */
  url: z.string().url(),
  /** PR title */
  title: z.string(),
  /** PR state: open, closed, or merged */
  state: z.enum(['open', 'closed', 'merged']),
  /** Source branch */
  head: z.string(),
  /** Target branch */
  base: z.string(),
});

export type GitHubPullRequest = z.infer<typeof gitHubPullRequestSchema>;

// ============================================================================
// Create Repository Options
// ============================================================================

/**
 * Options for creating a new GitHub repository
 */
export const createRepositoryOptionsSchema = z.object({
  /** Repository name */
  name: z.string().min(1),
  /** Repository description */
  description: z.string().optional(),
  /** Whether the repository should be private */
  private: z.boolean().default(true), // Default to private for security
  /** Initialize with a README */
  autoInit: z.boolean().default(false),
  /** Create in an organization (if not specified, creates in user's account) */
  org: z.string().optional(),
});

export type CreateRepositoryOptions = z.infer<typeof createRepositoryOptionsSchema>;

// ============================================================================
// Create Pull Request Options
// ============================================================================

/**
 * Options for creating a pull request
 */
export const createPullRequestOptionsSchema = z.object({
  /** Repository owner */
  owner: z.string(),
  /** Repository name */
  repo: z.string(),
  /** PR title */
  title: z.string(),
  /** PR body/description */
  body: z.string().optional(),
  /** Source branch (the branch with changes) */
  head: z.string(),
  /** Target branch (usually 'main') */
  base: z.string().default('main'),
  /** Whether the PR is a draft */
  draft: z.boolean().default(false),
});

export type CreatePullRequestOptions = z.infer<typeof createPullRequestOptionsSchema>;

// ============================================================================
// GitHub Error Types
// ============================================================================

// Note: GitHubSource and GitHubNewSource are defined in work-order.ts
// to keep all WorkspaceSource types together

/**
 * GitHub API error codes
 */
export const GitHubErrorCode = {
  /** Token is invalid or expired */
  UNAUTHORIZED: 'unauthorized',
  /** Token lacks required permissions */
  FORBIDDEN: 'forbidden',
  /** Repository not found */
  NOT_FOUND: 'not_found',
  /** Validation error (e.g., invalid repo name) */
  VALIDATION_FAILED: 'validation_failed',
  /** Rate limit exceeded */
  RATE_LIMITED: 'rate_limited',
  /** Network or other error */
  NETWORK_ERROR: 'network_error',
} as const;

export type GitHubErrorCode = (typeof GitHubErrorCode)[keyof typeof GitHubErrorCode];

/**
 * GitHub API error
 */
export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly code: GitHubErrorCode,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

// ============================================================================
// Push/Pull Result Types
// ============================================================================

/**
 * Result of a git push operation
 */
export interface PushResult {
  /** Whether push was successful */
  success: boolean;
  /** Remote reference that was updated */
  remoteRef: string;
  /** Local branch that was pushed */
  localBranch: string;
  /** Number of commits pushed */
  commits: number;
}

/**
 * Result of a git pull operation
 */
export interface PullResult {
  /** Whether pull was successful */
  success: boolean;
  /** Number of commits pulled */
  commits: number;
  /** Files that were updated */
  filesChanged: number;
  /** Whether there were merge conflicts */
  hasConflicts: boolean;
}

// ============================================================================
// CI Status Types
// ============================================================================

/**
 * CI check status
 */
export const CIStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
} as const;

export type CIStatus = (typeof CIStatus)[keyof typeof CIStatus];

/**
 * CI check conclusion
 */
export const CIConclusion = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  CANCELLED: 'cancelled',
  SKIPPED: 'skipped',
  NEUTRAL: 'neutral',
  TIMED_OUT: 'timed_out',
  ACTION_REQUIRED: 'action_required',
} as const;

export type CIConclusion = (typeof CIConclusion)[keyof typeof CIConclusion];

/**
 * Individual check run result
 */
export interface CheckRunResult {
  /** Check run ID */
  id: number;
  /** Check run name */
  name: string;
  /** Check status */
  status: CIStatus;
  /** Check conclusion (only present when status is 'completed') */
  conclusion: CIConclusion | null;
  /** URL to the check run details */
  detailsUrl: string | null;
  /** Error message or output summary */
  output: {
    title: string | null;
    summary: string | null;
  } | null;
}

/**
 * Aggregated CI status result
 */
export interface CIStatusResult {
  /** Overall status */
  status: CIStatus;
  /** Overall conclusion (only present when all checks completed) */
  conclusion: CIConclusion | null;
  /** Individual check runs */
  checkRuns: CheckRunResult[];
  /** Total number of checks */
  totalCount: number;
  /** Number of pending checks */
  pendingCount: number;
  /** Number of running checks */
  runningCount: number;
  /** Number of completed checks */
  completedCount: number;
  /** Whether all checks passed */
  allPassed: boolean;
  /** Whether any checks failed */
  anyFailed: boolean;
}
