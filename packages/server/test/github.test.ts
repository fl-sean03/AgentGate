/**
 * GitHub Module Unit Tests
 *
 * Tests for GitHub URL helpers and utility functions.
 * API-based functions require mocking and are tested separately.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getAuthenticatedRemoteUrl,
  stripTokenFromUrl,
  parseGitHubUrl,
  buildGitHubUrl,
  buildCloneUrl,
  getGitHubConfigFromEnv,
} from '../src/workspace/github.js';
import { GitHubError, GitHubErrorCode } from '../src/types/github.js';

describe('GitHub URL Helpers', () => {
  describe('getAuthenticatedRemoteUrl', () => {
    it('should inject token into HTTPS URL', () => {
      const url = 'https://github.com/owner/repo.git';
      const token = 'ghp_test123';
      const result = getAuthenticatedRemoteUrl(url, token);
      expect(result).toBe('https://x-access-token:ghp_test123@github.com/owner/repo.git');
    });

    it('should handle URL without .git suffix', () => {
      const url = 'https://github.com/owner/repo';
      const token = 'ghp_test123';
      const result = getAuthenticatedRemoteUrl(url, token);
      expect(result).toBe('https://x-access-token:ghp_test123@github.com/owner/repo');
    });
  });

  describe('stripTokenFromUrl', () => {
    it('should strip token from authenticated URL', () => {
      const url = 'https://x-access-token:ghp_secret123@github.com/owner/repo.git';
      const result = stripTokenFromUrl(url);
      expect(result).toBe('https://x-access-token:***@github.com/owner/repo.git');
    });

    it('should return unchanged URL if no token', () => {
      const url = 'https://github.com/owner/repo.git';
      const result = stripTokenFromUrl(url);
      expect(result).toBe(url);
    });
  });

  describe('parseGitHubUrl', () => {
    it('should parse simple owner/repo format', () => {
      const result = parseGitHubUrl('owner/repo');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should parse HTTPS URL with .git', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should parse HTTPS URL without .git', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should parse SSH URL', () => {
      const result = parseGitHubUrl('git@github.com:owner/repo.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should parse SSH URL without .git', () => {
      const result = parseGitHubUrl('git@github.com:owner/repo');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should handle repos with dots in name', () => {
      const result = parseGitHubUrl('owner/my.repo.name');
      expect(result).toEqual({ owner: 'owner', repo: 'my.repo.name' });
    });

    it('should handle repos with underscores and dashes', () => {
      const result = parseGitHubUrl('my_org/my-repo_name');
      expect(result).toEqual({ owner: 'my_org', repo: 'my-repo_name' });
    });

    it('should throw on invalid URL', () => {
      expect(() => parseGitHubUrl('invalid')).toThrow('Cannot parse GitHub URL');
    });
  });

  describe('buildGitHubUrl', () => {
    it('should build GitHub URL from owner and repo', () => {
      const result = buildGitHubUrl('owner', 'repo');
      expect(result).toBe('https://github.com/owner/repo');
    });
  });

  describe('buildCloneUrl', () => {
    it('should build clone URL from owner and repo', () => {
      const result = buildCloneUrl('owner', 'repo');
      expect(result).toBe('https://github.com/owner/repo.git');
    });
  });
});

describe('GitHub Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getGitHubConfigFromEnv', () => {
    it('should return config from environment variable', () => {
      process.env.AGENTGATE_GITHUB_TOKEN = 'ghp_test123';

      const config = getGitHubConfigFromEnv();
      expect(config.token).toBe('ghp_test123');
    });

    it('should include baseUrl if GITHUB_API_URL is set', () => {
      process.env.AGENTGATE_GITHUB_TOKEN = 'ghp_test123';
      process.env.GITHUB_API_URL = 'https://api.github.enterprise.com';

      const config = getGitHubConfigFromEnv();
      expect(config.token).toBe('ghp_test123');
      expect(config.baseUrl).toBe('https://api.github.enterprise.com');
    });

    it('should throw GitHubError if token not set', () => {
      delete process.env.AGENTGATE_GITHUB_TOKEN;

      expect(() => getGitHubConfigFromEnv()).toThrow(GitHubError);
    });

    it('should throw with UNAUTHORIZED code if token not set', () => {
      delete process.env.AGENTGATE_GITHUB_TOKEN;

      try {
        getGitHubConfigFromEnv();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GitHubError);
        expect((error as GitHubError).code).toBe(GitHubErrorCode.UNAUTHORIZED);
      }
    });
  });
});

describe('GitHubError', () => {
  it('should create error with message and code', () => {
    const error = new GitHubError('Test error', GitHubErrorCode.NOT_FOUND);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe(GitHubErrorCode.NOT_FOUND);
    expect(error.statusCode).toBeUndefined();
  });

  it('should create error with statusCode', () => {
    const error = new GitHubError('Test error', GitHubErrorCode.NOT_FOUND, 404);
    expect(error.statusCode).toBe(404);
  });

  it('should have correct name', () => {
    const error = new GitHubError('Test', GitHubErrorCode.NETWORK_ERROR);
    expect(error.name).toBe('GitHubError');
  });
});

describe('Pull Request Schema', () => {
  it('should include draft field with default false', async () => {
    const { gitHubPullRequestSchema } = await import('../src/types/github.js');

    const pr = {
      number: 123,
      url: 'https://github.com/owner/repo/pull/123',
      title: 'Test PR',
      state: 'open',
      head: 'feature-branch',
      base: 'main',
    };

    const result = gitHubPullRequestSchema.parse(pr);
    expect(result.draft).toBe(false);
  });

  it('should accept explicit draft: true', async () => {
    const { gitHubPullRequestSchema } = await import('../src/types/github.js');

    const pr = {
      number: 123,
      url: 'https://github.com/owner/repo/pull/123',
      title: 'Test PR',
      state: 'open',
      head: 'feature-branch',
      base: 'main',
      draft: true,
    };

    const result = gitHubPullRequestSchema.parse(pr);
    expect(result.draft).toBe(true);
  });
});

describe('Create Pull Request Options Schema', () => {
  it('should include draft field with default false', async () => {
    const { createPullRequestOptionsSchema } = await import('../src/types/github.js');

    const options = {
      owner: 'testowner',
      repo: 'testrepo',
      title: 'Test PR',
      head: 'feature-branch',
    };

    const result = createPullRequestOptionsSchema.parse(options);
    expect(result.draft).toBe(false);
    expect(result.base).toBe('main'); // default
  });

  it('should accept explicit draft: true', async () => {
    const { createPullRequestOptionsSchema } = await import('../src/types/github.js');

    const options = {
      owner: 'testowner',
      repo: 'testrepo',
      title: 'Test PR',
      head: 'feature-branch',
      draft: true,
    };

    const result = createPullRequestOptionsSchema.parse(options);
    expect(result.draft).toBe(true);
  });
});
