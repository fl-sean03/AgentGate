/**
 * End-to-End Tests for GitHub-Backed Workspaces (v0.2.4)
 *
 * These tests use a REAL GitHub PAT to validate all GitHub integration points.
 * They create real repositories, branches, and PRs on GitHub.
 *
 * Prerequisites:
 * - AGENTGATE_GITHUB_TOKEN environment variable must be set with 'repo' scope
 *
 * Run with:
 *   pnpm test test/e2e/github-e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, rm, readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// GitHub module imports
import {
  createGitHubClient,
  getGitHubConfigFromEnv,
  validateAuth,
  repositoryExists,
  getRepository,
  createRepository,
  createPullRequest,
  getPullRequest,
  getAuthenticatedRemoteUrl,
  stripTokenFromUrl,
  parseGitHubUrl,
  buildGitHubUrl,
  buildCloneUrl,
} from '../../src/workspace/github.js';

// Workspace manager imports
import {
  createFromGitHub,
  createGitHubRepo,
  syncWithGitHub,
  pushToGitHub,
  isGitHubWorkspace,
  getGitHubInfo,
} from '../../src/workspace/manager.js';

// Git operations imports
import {
  isGitRepo,
  getCurrentBranch,
  createBranch,
  checkout,
  branchExists,
  stageAll,
  commit,
  push,
  pull,
  fetch,
  hasRemote,
  addRemote,
  setRemoteUrl,
  getRemoteUrl,
  hasUncommittedChanges,
} from '../../src/workspace/git-ops.js';

// Type imports
import type { Octokit } from '@octokit/rest';
import type { GitHubConfig, GitHubRepository } from '../../src/types/github.js';
import type { GitHubSource, GitHubNewSource } from '../../src/types/index.js';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_PREFIX = 'agentgate-e2e-test';
const CLEANUP_REPOS: string[] = [];
const CLEANUP_BRANCHES: Array<{ owner: string; repo: string; branch: string }> = [];
const CLEANUP_DIRS: string[] = [];

let client: Octokit;
let config: GitHubConfig;
let username: string;
let testRepoName: string;
let testRepoFullName: string;

// ============================================================================
// Setup & Teardown
// ============================================================================

beforeAll(async () => {
  // Skip E2E tests if no token is configured
  if (!process.env.AGENTGATE_GITHUB_TOKEN) {
    console.log('⚠️  Skipping E2E tests: AGENTGATE_GITHUB_TOKEN not set');
    return;
  }

  // Initialize GitHub client
  config = getGitHubConfigFromEnv();
  client = createGitHubClient(config);

  // Get authenticated user
  const authResult = await validateAuth(client);
  username = authResult.username;
  console.log(`✅ Authenticated as: ${username}`);
  console.log(`   Scopes: ${authResult.scopes.join(', ')}`);

  // Create a test repository for shared use
  testRepoName = `${TEST_PREFIX}-${Date.now()}`;
  testRepoFullName = `${username}/${testRepoName}`;

  console.log(`\n📦 Creating test repository: ${testRepoFullName}`);
  await createRepository(client, {
    name: testRepoName,
    private: false,
    autoInit: true,
    description: 'Temporary test repository for AgentGate E2E tests',
  });
  CLEANUP_REPOS.push(testRepoName);
  console.log(`✅ Test repository created: ${testRepoFullName}`);

  // Wait a moment for GitHub to fully initialize the repo
  await new Promise((resolve) => setTimeout(resolve, 2000));
}, 60000);

afterEach(async () => {
  // Clean up any temporary directories created during tests
  for (const dir of CLEANUP_DIRS) {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
  CLEANUP_DIRS.length = 0;
});

afterAll(async () => {
  if (!process.env.AGENTGATE_GITHUB_TOKEN) {
    return;
  }

  console.log('\n🧹 Cleaning up...');

  // Delete test branches
  for (const { owner, repo, branch } of CLEANUP_BRANCHES) {
    try {
      await client.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      console.log(`   Deleted branch: ${owner}/${repo}#${branch}`);
    } catch {
      // Branch may not exist or already deleted
    }
  }

  // Delete test repositories
  for (const repoName of CLEANUP_REPOS) {
    try {
      await client.rest.repos.delete({
        owner: username,
        repo: repoName,
      });
      console.log(`   Deleted repo: ${username}/${repoName}`);
    } catch (error) {
      console.log(`   Failed to delete repo ${repoName}:`, error);
    }
  }

  console.log('✅ Cleanup complete');
}, 60000);

// ============================================================================
// Helper Functions
// ============================================================================

function createTestDir(): string {
  const dir = join(tmpdir(), `agentgate-e2e-${randomUUID()}`);
  CLEANUP_DIRS.push(dir);
  return dir;
}

function skipIfNoToken(): void {
  if (!process.env.AGENTGATE_GITHUB_TOKEN) {
    throw new Error('Skipping: AGENTGATE_GITHUB_TOKEN not set');
  }
}

// ============================================================================
// Category 1: Authentication Tests
// ============================================================================

describe('E2E: Authentication Tests', () => {
  it('AUTH-01: Token Validation - validates PAT and returns user info', async () => {
    skipIfNoToken();

    const result = await validateAuth(client);

    expect(result.authenticated).toBe(true);
    expect(result.username).toBeTruthy();
    expect(result.username).toBe(username);
    expect(Array.isArray(result.scopes)).toBe(true);
  });

  it('AUTH-03: Token Scopes - verifies token has repo scope', async () => {
    skipIfNoToken();

    const result = await validateAuth(client);

    expect(result.scopes).toContain('repo');
  });

  it('AUTH-04: Config From Env - reads token from environment', async () => {
    skipIfNoToken();

    const envConfig = getGitHubConfigFromEnv();

    expect(envConfig.token).toBeTruthy();
    expect(envConfig.token).toBe(process.env.AGENTGATE_GITHUB_TOKEN);
  });
});

// ============================================================================
// Category 2: Repository Operations
// ============================================================================

describe('E2E: Repository Operations', () => {
  it('REPO-01: Check Existing Repo - confirms test repo exists', async () => {
    skipIfNoToken();

    const exists = await repositoryExists(client, username, testRepoName);

    expect(exists).toBe(true);
  });

  it('REPO-02: Check Non-Existent Repo - returns false for fake repo', async () => {
    skipIfNoToken();

    const exists = await repositoryExists(client, username, 'this-repo-does-not-exist-12345');

    expect(exists).toBe(false);
  });

  it('REPO-03: Get Repository Info - returns metadata for test repo', async () => {
    skipIfNoToken();

    const repo = await getRepository(client, username, testRepoName);

    expect(repo.owner).toBe(username);
    expect(repo.repo).toBe(testRepoName);
    expect(repo.fullName).toBe(`${username}/${testRepoName}`);
    expect(repo.cloneUrl).toContain('github.com');
    expect(repo.defaultBranch).toBe('main');
    expect(repo.private).toBe(false);
  });

  it('REPO-04: Create Public Repo - creates new public repository', async () => {
    skipIfNoToken();

    const repoName = `${TEST_PREFIX}-public-${Date.now()}`;

    const repo = await createRepository(client, {
      name: repoName,
      private: false,
      autoInit: true,
      description: 'E2E test: public repo creation',
    });

    CLEANUP_REPOS.push(repoName);

    expect(repo.fullName).toBe(`${username}/${repoName}`);
    expect(repo.private).toBe(false);

    // Verify we can access it
    const exists = await repositoryExists(client, username, repoName);
    expect(exists).toBe(true);
  });

  it('REPO-05: Create Private Repo - creates new private repository', async () => {
    skipIfNoToken();

    const repoName = `${TEST_PREFIX}-private-${Date.now()}`;

    const repo = await createRepository(client, {
      name: repoName,
      private: true,
      autoInit: true,
      description: 'E2E test: private repo creation',
    });

    CLEANUP_REPOS.push(repoName);

    expect(repo.fullName).toBe(`${username}/${repoName}`);
    expect(repo.private).toBe(true);
  });
});

// ============================================================================
// Category 3: URL Helper Tests
// ============================================================================

describe('E2E: URL Helpers', () => {
  it('URL-01: Authenticated Remote URL - injects token correctly', () => {
    const cloneUrl = 'https://github.com/owner/repo.git';
    const token = 'ghp_test_token';

    const authUrl = getAuthenticatedRemoteUrl(cloneUrl, token);

    expect(authUrl).toBe('https://x-access-token:ghp_test_token@github.com/owner/repo.git');
  });

  it('URL-02: Strip Token - removes token from URL', () => {
    const authUrl = 'https://x-access-token:ghp_secret@github.com/owner/repo.git';

    const safeUrl = stripTokenFromUrl(authUrl);

    expect(safeUrl).toBe('https://x-access-token:***@github.com/owner/repo.git');
    expect(safeUrl).not.toContain('ghp_secret');
  });

  it('URL-03: Parse GitHub URL - handles various formats', () => {
    // owner/repo format
    expect(parseGitHubUrl('owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });

    // HTTPS URL
    expect(parseGitHubUrl('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' });
    expect(parseGitHubUrl('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });

    // SSH URL
    expect(parseGitHubUrl('git@github.com:owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('URL-04: Build URLs - creates correct GitHub URLs', () => {
    expect(buildGitHubUrl('owner', 'repo')).toBe('https://github.com/owner/repo');
    expect(buildCloneUrl('owner', 'repo')).toBe('https://github.com/owner/repo.git');
  });
});

// ============================================================================
// Category 4: Workspace Operations
// ============================================================================

describe('E2E: Workspace Operations', () => {
  it('WS-01: Clone Existing Repo - creates workspace from test repo', async () => {
    skipIfNoToken();

    const destPath = createTestDir();
    await mkdir(destPath, { recursive: true });

    const source: GitHubSource = {
      type: 'github',
      owner: username,
      repo: testRepoName,
    };

    const workspace = await createFromGitHub(source, { destPath });

    // Verify workspace created
    expect(workspace.id).toBeTruthy();
    expect(workspace.rootPath).toBe(destPath);
    expect(workspace.source.type).toBe('github');
    expect(workspace.gitInitialized).toBe(true);

    // Verify it's a git repo
    const isRepo = await isGitRepo(destPath);
    expect(isRepo).toBe(true);

    // Verify remote is configured
    const hasOrigin = await hasRemote(destPath, 'origin');
    expect(hasOrigin).toBe(true);

    // Verify files exist (README from auto-init)
    const files = await readdir(destPath);
    expect(files.length).toBeGreaterThan(0);
  }, 30000);

  it('WS-02: Create New Repo Workspace - creates new repo with template', async () => {
    skipIfNoToken();

    const repoName = `${TEST_PREFIX}-newrepo-${Date.now()}`;
    const destPath = createTestDir();
    await mkdir(destPath, { recursive: true });

    const source: GitHubNewSource = {
      type: 'github-new',
      owner: username,
      repoName,
      private: false,
      template: 'minimal',
    };

    CLEANUP_REPOS.push(repoName);

    const workspace = await createGitHubRepo(source, { destPath });

    // Verify workspace created
    expect(workspace.id).toBeTruthy();
    expect(workspace.rootPath).toBe(destPath);
    expect(workspace.source.type).toBe('github-new');

    // Verify repo exists on GitHub
    const exists = await repositoryExists(client, username, repoName);
    expect(exists).toBe(true);

    // Verify it's a git repo with remote
    const isRepo = await isGitRepo(destPath);
    expect(isRepo).toBe(true);

    const hasOrigin = await hasRemote(destPath, 'origin');
    expect(hasOrigin).toBe(true);

    // Verify seed files exist
    const files = await readdir(destPath);
    expect(files).toContain('CLAUDE.md');
  }, 60000);

  it('WS-03: GitHub Workspace Helpers - isGitHubWorkspace and getGitHubInfo', async () => {
    skipIfNoToken();

    const destPath = createTestDir();
    await mkdir(destPath, { recursive: true });

    const source: GitHubSource = {
      type: 'github',
      owner: username,
      repo: testRepoName,
    };

    const workspace = await createFromGitHub(source, { destPath });

    // Test helper functions
    expect(isGitHubWorkspace(workspace)).toBe(true);

    const info = getGitHubInfo(workspace);
    expect(info).not.toBeNull();
    expect(info?.owner).toBe(username);
    expect(info?.repo).toBe(testRepoName);
  }, 30000);
});

// ============================================================================
// Category 5: Git Operations
// ============================================================================

describe('E2E: Git Operations', () => {
  it('GIT-01: Create and Push Branch - creates branch and pushes to GitHub', async () => {
    skipIfNoToken();

    const destPath = createTestDir();
    await mkdir(destPath, { recursive: true });

    // Clone test repo
    const source: GitHubSource = {
      type: 'github',
      owner: username,
      repo: testRepoName,
    };

    const workspace = await createFromGitHub(source, { destPath });
    const branchName = `agentgate/test-${Date.now()}`;

    CLEANUP_BRANCHES.push({ owner: username, repo: testRepoName, branch: branchName });

    // Create and checkout branch
    await createBranch(destPath, branchName);
    await checkout(destPath, branchName);

    // Verify we're on the new branch
    const currentBranch = await getCurrentBranch(destPath);
    expect(currentBranch).toBe(branchName);

    // Push the branch
    await push(destPath, 'origin', branchName, { setUpstream: true });

    // Verify branch exists on remote (via branchExists with checkRemote)
    await fetch(destPath, 'origin');
    const existsOnRemote = await branchExists(destPath, branchName, 'origin');
    expect(existsOnRemote).toBe(true);
  }, 30000);

  it('GIT-02: Push Commits - pushes local commits to GitHub', async () => {
    skipIfNoToken();

    const destPath = createTestDir();
    await mkdir(destPath, { recursive: true });

    // Clone test repo
    const source: GitHubSource = {
      type: 'github',
      owner: username,
      repo: testRepoName,
    };

    const workspace = await createFromGitHub(source, { destPath });
    const branchName = `agentgate/commit-test-${Date.now()}`;

    CLEANUP_BRANCHES.push({ owner: username, repo: testRepoName, branch: branchName });

    // Create branch
    await createBranch(destPath, branchName);
    await checkout(destPath, branchName);

    // Create a test file
    const { writeFile } = await import('node:fs/promises');
    const testFileName = `test-file-${Date.now()}.txt`;
    await writeFile(join(destPath, testFileName), `Test content: ${Date.now()}`);

    // Stage, commit, push
    await stageAll(destPath);
    await commit(destPath, 'E2E test commit');
    await push(destPath, 'origin', branchName, { setUpstream: true });

    // Verify commit appears on GitHub by checking the branch
    const { data: branchData } = await client.rest.repos.getBranch({
      owner: username,
      repo: testRepoName,
      branch: branchName,
    });

    expect(branchData.commit.commit.message).toBe('E2E test commit');
  }, 30000);

  it('GIT-03: Fetch Updates - fetches from remote', async () => {
    skipIfNoToken();

    const destPath = createTestDir();
    await mkdir(destPath, { recursive: true });

    // Clone test repo
    const source: GitHubSource = {
      type: 'github',
      owner: username,
      repo: testRepoName,
    };

    await createFromGitHub(source, { destPath });

    // Fetch should not throw
    await fetch(destPath, 'origin');

    // Verify remote refs are available
    const hasMain = await branchExists(destPath, 'main', 'origin');
    expect(hasMain).toBe(true);
  }, 30000);
});

// ============================================================================
// Category 6: Pull Request Operations
// ============================================================================

describe('E2E: Pull Request Operations', () => {
  it('PR-01: Create PR - creates pull request from branch', async () => {
    skipIfNoToken();

    const destPath = createTestDir();
    await mkdir(destPath, { recursive: true });

    // Clone test repo
    const source: GitHubSource = {
      type: 'github',
      owner: username,
      repo: testRepoName,
    };

    await createFromGitHub(source, { destPath });
    const branchName = `agentgate/pr-test-${Date.now()}`;

    CLEANUP_BRANCHES.push({ owner: username, repo: testRepoName, branch: branchName });

    // Create branch with changes
    await createBranch(destPath, branchName);
    await checkout(destPath, branchName);

    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(destPath, `pr-test-${Date.now()}.txt`), 'PR test content');

    await stageAll(destPath);
    await commit(destPath, 'PR test commit');
    await push(destPath, 'origin', branchName, { setUpstream: true });

    // Wait for GitHub to process the push
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create PR
    const pr = await createPullRequest(client, {
      owner: username,
      repo: testRepoName,
      title: '[E2E Test] PR Creation Test',
      body: 'This PR was created by AgentGate E2E tests.',
      head: branchName,
      base: 'main',
      draft: false,
    });

    expect(pr.number).toBeGreaterThan(0);
    expect(pr.url).toContain('github.com');
    expect(pr.title).toBe('[E2E Test] PR Creation Test');
    expect(pr.state).toBe('open');
    expect(pr.head).toBe(branchName);
    expect(pr.base).toBe('main');

    // Close the PR for cleanup
    await client.rest.pulls.update({
      owner: username,
      repo: testRepoName,
      pull_number: pr.number,
      state: 'closed',
    });
  }, 60000);

  it('PR-02: Get PR Info - retrieves PR details', async () => {
    skipIfNoToken();

    const destPath = createTestDir();
    await mkdir(destPath, { recursive: true });

    // Clone and create a PR
    const source: GitHubSource = {
      type: 'github',
      owner: username,
      repo: testRepoName,
    };

    await createFromGitHub(source, { destPath });
    const branchName = `agentgate/pr-get-test-${Date.now()}`;

    CLEANUP_BRANCHES.push({ owner: username, repo: testRepoName, branch: branchName });

    // Create branch with changes
    await createBranch(destPath, branchName);
    await checkout(destPath, branchName);

    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(destPath, `pr-get-test-${Date.now()}.txt`), 'PR get test');

    await stageAll(destPath);
    await commit(destPath, 'PR get test commit');
    await push(destPath, 'origin', branchName, { setUpstream: true });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create PR
    const createdPr = await createPullRequest(client, {
      owner: username,
      repo: testRepoName,
      title: '[E2E Test] PR Get Test',
      body: 'Testing getPullRequest function.',
      head: branchName,
      base: 'main',
    });

    // Get the PR
    const fetchedPr = await getPullRequest(client, username, testRepoName, createdPr.number);

    expect(fetchedPr.number).toBe(createdPr.number);
    expect(fetchedPr.title).toBe('[E2E Test] PR Get Test');
    expect(fetchedPr.state).toBe('open');

    // Cleanup
    await client.rest.pulls.update({
      owner: username,
      repo: testRepoName,
      pull_number: createdPr.number,
      state: 'closed',
    });
  }, 60000);
});

// ============================================================================
// Category 7: Full Workflow Tests
// ============================================================================

describe('E2E: Full Workflow Tests', () => {
  it('FLOW-01: Existing Repo Workflow - full agentgate flow with existing repo', async () => {
    skipIfNoToken();

    const destPath = createTestDir();
    await mkdir(destPath, { recursive: true });

    // 1. Clone existing repo
    const source: GitHubSource = {
      type: 'github',
      owner: username,
      repo: testRepoName,
    };

    const workspace = await createFromGitHub(source, { destPath });
    expect(workspace.id).toBeTruthy();

    // 2. Create agentgate branch
    const runId = `test-${Date.now()}`;
    const branchName = `agentgate/${runId}`;

    CLEANUP_BRANCHES.push({ owner: username, repo: testRepoName, branch: branchName });

    await createBranch(destPath, branchName);
    await checkout(destPath, branchName);

    // 3. Push branch to establish tracking
    await push(destPath, 'origin', branchName, { setUpstream: true });

    // 4. Make changes (simulating agent work)
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      join(destPath, 'agent-output.txt'),
      `AgentGate output from run ${runId}\nGenerated at: ${new Date().toISOString()}`
    );

    // 5. Commit and push iteration
    await stageAll(destPath);
    await commit(destPath, `AgentGate iteration 1: Initial implementation`);
    await push(destPath, 'origin', branchName);

    // 6. Verify changes on GitHub
    const { data: branchData } = await client.rest.repos.getBranch({
      owner: username,
      repo: testRepoName,
      branch: branchName,
    });
    expect(branchData.commit.commit.message).toContain('AgentGate iteration 1');

    // 7. Create PR (simulating verification success)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const pr = await createPullRequest(client, {
      owner: username,
      repo: testRepoName,
      title: `[AgentGate] Test workflow ${runId}`,
      body: `## AgentGate Run Summary\n\n**Run ID:** ${runId}\n\nThis is a test workflow.`,
      head: branchName,
      base: 'main',
    });

    expect(pr.number).toBeGreaterThan(0);
    expect(pr.url).toContain('github.com');

    // 8. Close PR for cleanup
    await client.rest.pulls.update({
      owner: username,
      repo: testRepoName,
      pull_number: pr.number,
      state: 'closed',
    });

    console.log(`✅ FLOW-01 complete: PR #${pr.number} created and closed`);
  }, 120000);

  it('FLOW-02: New Repo Workflow - full agentgate flow creating new repo', async () => {
    skipIfNoToken();

    const repoName = `${TEST_PREFIX}-flow-${Date.now()}`;
    const destPath = createTestDir();
    await mkdir(destPath, { recursive: true });

    CLEANUP_REPOS.push(repoName);

    // 1. Create new repo with workspace
    const source: GitHubNewSource = {
      type: 'github-new',
      owner: username,
      repoName,
      private: false,
      template: 'minimal',
    };

    const workspace = await createGitHubRepo(source, { destPath });
    expect(workspace.id).toBeTruthy();

    // Wait for GitHub to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 2. Create agentgate branch
    const runId = `test-${Date.now()}`;
    const branchName = `agentgate/${runId}`;

    CLEANUP_BRANCHES.push({ owner: username, repo: repoName, branch: branchName });

    await createBranch(destPath, branchName);
    await checkout(destPath, branchName);
    await push(destPath, 'origin', branchName, { setUpstream: true });

    // 3. Make changes
    const { writeFile } = await import('node:fs/promises');
    // Create src directory and add a file
    await mkdir(join(destPath, 'src'), { recursive: true });
    await writeFile(
      join(destPath, 'src', 'index.ts'),
      `// Generated by AgentGate\nconsole.log('Hello from AgentGate!');\n`
    );

    await stageAll(destPath);
    await commit(destPath, 'AgentGate iteration 1: Added source file');
    await push(destPath, 'origin', branchName);

    // 4. Create PR
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const pr = await createPullRequest(client, {
      owner: username,
      repo: repoName,
      title: `[AgentGate] New repo workflow ${runId}`,
      body: 'New repo workflow test',
      head: branchName,
      base: 'main',
    });

    expect(pr.number).toBeGreaterThan(0);

    console.log(`✅ FLOW-02 complete: New repo ${repoName}, PR #${pr.number}`);
  }, 120000);
});

// ============================================================================
// Test Summary
// ============================================================================

describe('E2E: Test Summary', () => {
  it('prints test configuration', () => {
    if (!process.env.AGENTGATE_GITHUB_TOKEN) {
      console.log('\n⚠️  E2E tests were skipped: AGENTGATE_GITHUB_TOKEN not set');
      return;
    }

    console.log('\n📊 E2E Test Configuration:');
    console.log(`   GitHub User: ${username}`);
    console.log(`   Test Repo: ${testRepoFullName}`);
    console.log(`   Test Prefix: ${TEST_PREFIX}`);
    console.log(`   Repos to cleanup: ${CLEANUP_REPOS.length}`);
    console.log(`   Branches to cleanup: ${CLEANUP_BRANCHES.length}`);
  });
});
