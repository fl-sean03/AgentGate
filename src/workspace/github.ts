/**
 * GitHub API Operations Module
 *
 * Provides functions for interacting with GitHub:
 * - Authentication and client creation
 * - Repository operations (create, get, check existence)
 * - Pull request operations
 * - URL helpers for authenticated git operations
 */

import { Octokit } from '@octokit/rest';
import {
  type GitHubConfig,
  type GitHubRepository,
  type GitHubAuthResult,
  type GitHubPullRequest,
  type CreateRepositoryOptions,
  type CreatePullRequestOptions,
  GitHubError,
  GitHubErrorCode,
  gitHubConfigSchema,
} from '../types/github.js';

// ============================================================================
// Client Management
// ============================================================================

/**
 * Create an authenticated GitHub API client
 */
export function createGitHubClient(config: GitHubConfig): Octokit {
  const validated = gitHubConfigSchema.parse(config);

  const options: ConstructorParameters<typeof Octokit>[0] = {
    auth: validated.token,
    userAgent: 'agentgate/0.2.4',
  };

  if (validated.baseUrl) {
    options.baseUrl = validated.baseUrl;
  }

  return new Octokit(options);
}

/**
 * Get GitHub configuration from environment variables
 *
 * Looks for AGENTGATE_GITHUB_TOKEN in environment
 *
 * @throws GitHubError if token not configured
 */
export function getGitHubConfigFromEnv(): GitHubConfig {
  const token = process.env.AGENTGATE_GITHUB_TOKEN;

  if (!token) {
    throw new GitHubError(
      'GitHub token not configured. Set AGENTGATE_GITHUB_TOKEN environment variable or run: agentgate auth github',
      GitHubErrorCode.UNAUTHORIZED
    );
  }

  return {
    token,
    baseUrl: process.env.GITHUB_API_URL,
  };
}

/**
 * Validate GitHub authentication and return user info
 */
export async function validateAuth(client: Octokit): Promise<GitHubAuthResult> {
  try {
    const { data: user } = await client.rest.users.getAuthenticated();

    // Get scopes from response headers
    // Note: Octokit doesn't directly expose headers, so we make a simple request
    const response = await client.request('GET /user');
    const scopeHeader = response.headers['x-oauth-scopes'] ?? '';
    const scopes = scopeHeader
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);

    return {
      authenticated: true,
      username: user.login,
      scopes,
    };
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const status = (error as { status: number }).status;
      if (status === 401) {
        throw new GitHubError(
          'Invalid GitHub token. Please check your token and try again.',
          GitHubErrorCode.UNAUTHORIZED,
          401
        );
      }
    }
    throw error;
  }
}

// ============================================================================
// Repository Operations
// ============================================================================

/**
 * Check if a repository exists and is accessible
 */
export async function repositoryExists(
  client: Octokit,
  owner: string,
  repo: string
): Promise<boolean> {
  try {
    await client.rest.repos.get({ owner, repo });
    return true;
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const status = (error as { status: number }).status;
      if (status === 404) {
        return false;
      }
      if (status === 401) {
        throw new GitHubError(
          'Invalid GitHub token',
          GitHubErrorCode.UNAUTHORIZED,
          401
        );
      }
      if (status === 403) {
        throw new GitHubError(
          'Access denied to repository. Check token permissions.',
          GitHubErrorCode.FORBIDDEN,
          403
        );
      }
    }
    throw error;
  }
}

/**
 * Get repository metadata
 *
 * @throws GitHubError if repository not found or access denied
 */
export async function getRepository(
  client: Octokit,
  owner: string,
  repo: string
): Promise<GitHubRepository> {
  try {
    const { data } = await client.rest.repos.get({ owner, repo });

    return {
      owner: data.owner.login,
      repo: data.name,
      fullName: data.full_name,
      cloneUrl: data.clone_url,
      sshUrl: data.ssh_url,
      defaultBranch: data.default_branch,
      private: data.private,
    };
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const status = (error as { status: number }).status;
      if (status === 404) {
        throw new GitHubError(
          `Repository ${owner}/${repo} not found`,
          GitHubErrorCode.NOT_FOUND,
          404
        );
      }
      if (status === 401) {
        throw new GitHubError(
          'Invalid GitHub token',
          GitHubErrorCode.UNAUTHORIZED,
          401
        );
      }
      if (status === 403) {
        throw new GitHubError(
          'Access denied to repository. Check token permissions.',
          GitHubErrorCode.FORBIDDEN,
          403
        );
      }
    }
    throw error;
  }
}

/**
 * Create a new GitHub repository
 *
 * @throws GitHubError if creation fails
 */
export async function createRepository(
  client: Octokit,
  options: CreateRepositoryOptions
): Promise<GitHubRepository> {
  try {
    let data;

    if (options.org) {
      // Create in organization
      const orgParams: Parameters<typeof client.rest.repos.createInOrg>[0] = {
        org: options.org,
        name: options.name,
        private: options.private,
        auto_init: options.autoInit,
      };
      if (options.description) {
        orgParams.description = options.description;
      }
      const response = await client.rest.repos.createInOrg(orgParams);
      data = response.data;
    } else {
      // Create in user's account
      const userParams: Parameters<typeof client.rest.repos.createForAuthenticatedUser>[0] = {
        name: options.name,
        private: options.private,
        auto_init: options.autoInit,
      };
      if (options.description) {
        userParams.description = options.description;
      }
      const response = await client.rest.repos.createForAuthenticatedUser(userParams);
      data = response.data;
    }

    return {
      owner: data.owner.login,
      repo: data.name,
      fullName: data.full_name,
      cloneUrl: data.clone_url,
      sshUrl: data.ssh_url,
      defaultBranch: data.default_branch,
      private: data.private,
    };
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const status = (error as { status: number }).status;
      if (status === 422) {
        throw new GitHubError(
          `Failed to create repository: ${(error as Error).message}`,
          GitHubErrorCode.VALIDATION_FAILED,
          422
        );
      }
      if (status === 401) {
        throw new GitHubError(
          'Invalid GitHub token',
          GitHubErrorCode.UNAUTHORIZED,
          401
        );
      }
      if (status === 403) {
        throw new GitHubError(
          'Permission denied. Check token scopes.',
          GitHubErrorCode.FORBIDDEN,
          403
        );
      }
    }
    throw error;
  }
}

// ============================================================================
// Pull Request Operations
// ============================================================================

/**
 * Create a pull request
 *
 * @throws GitHubError if creation fails
 */
export async function createPullRequest(
  client: Octokit,
  options: CreatePullRequestOptions
): Promise<GitHubPullRequest> {
  try {
    const prParams: Parameters<typeof client.rest.pulls.create>[0] = {
      owner: options.owner,
      repo: options.repo,
      title: options.title,
      head: options.head,
      base: options.base,
      draft: options.draft,
    };
    if (options.body) {
      prParams.body = options.body;
    }
    const { data } = await client.rest.pulls.create(prParams);

    return {
      number: data.number,
      url: data.html_url,
      title: data.title,
      state: data.state as 'open' | 'closed' | 'merged',
      head: data.head.ref,
      base: data.base.ref,
    };
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const status = (error as { status: number }).status;
      if (status === 422) {
        // Common case: PR already exists or no commits
        throw new GitHubError(
          `Failed to create pull request: ${(error as Error).message}`,
          GitHubErrorCode.VALIDATION_FAILED,
          422
        );
      }
      if (status === 404) {
        throw new GitHubError(
          `Repository ${options.owner}/${options.repo} not found`,
          GitHubErrorCode.NOT_FOUND,
          404
        );
      }
    }
    throw error;
  }
}

/**
 * Get pull request details
 */
export async function getPullRequest(
  client: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<GitHubPullRequest> {
  try {
    const { data } = await client.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    // Determine if merged
    let state: 'open' | 'closed' | 'merged' = data.state as 'open' | 'closed';
    if (data.merged) {
      state = 'merged';
    }

    return {
      number: data.number,
      url: data.html_url,
      title: data.title,
      state,
      head: data.head.ref,
      base: data.base.ref,
    };
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const status = (error as { status: number }).status;
      if (status === 404) {
        throw new GitHubError(
          `Pull request #${pullNumber} not found in ${owner}/${repo}`,
          GitHubErrorCode.NOT_FOUND,
          404
        );
      }
    }
    throw error;
  }
}

// ============================================================================
// URL Helpers
// ============================================================================

/**
 * Inject token into HTTPS clone URL for authenticated git operations
 *
 * @param cloneUrl - HTTPS clone URL (e.g., https://github.com/owner/repo.git)
 * @param token - GitHub PAT
 * @returns Authenticated URL (e.g., https://x-access-token:TOKEN@github.com/owner/repo.git)
 */
export function getAuthenticatedRemoteUrl(cloneUrl: string, token: string): string {
  // Replace https:// with https://x-access-token:TOKEN@
  return cloneUrl.replace('https://', `https://x-access-token:${token}@`);
}

/**
 * Strip token from URL for safe logging
 *
 * @param url - URL that may contain a token
 * @returns URL with token replaced with ***
 */
export function stripTokenFromUrl(url: string): string {
  return url.replace(/x-access-token:[^@]+@/, 'x-access-token:***@');
}

/**
 * Parse owner and repo from GitHub URL
 *
 * Supports formats:
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo
 * - git@github.com:owner/repo.git
 * - owner/repo
 *
 * @param url - GitHub URL or owner/repo string
 * @returns { owner, repo }
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  // Simple owner/repo format
  if (/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/.test(url)) {
    const parts = url.split('/');
    const owner = parts[0];
    const repo = parts[1];
    if (owner && repo) {
      return { owner, repo: repo.replace(/\.git$/, '') };
    }
  }

  // HTTPS URL
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    const owner = httpsMatch[1];
    const repo = httpsMatch[2];
    if (owner && repo) {
      return { owner, repo };
    }
  }

  // SSH URL
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    const owner = sshMatch[1];
    const repo = sshMatch[2];
    if (owner && repo) {
      return { owner, repo };
    }
  }

  throw new Error(`Cannot parse GitHub URL: ${url}`);
}

/**
 * Build GitHub repository URL from owner and repo
 */
export function buildGitHubUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`;
}

/**
 * Build GitHub clone URL from owner and repo
 */
export function buildCloneUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`;
}
