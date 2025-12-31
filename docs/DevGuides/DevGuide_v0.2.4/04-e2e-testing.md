# DevGuide v0.2.4: End-to-End Testing

**Created**: 2025-12-30
**Purpose**: Comprehensive E2E testing for GitHub-backed workspaces using real GitHub API

---

## Overview

This document defines the comprehensive E2E test suite for validating the GitHub-backed workspaces feature. Unlike unit tests (which mock the GitHub API), these tests use a real GitHub Personal Access Token to verify all integration points work correctly.

---

## Prerequisites

### Required Environment
```bash
# GitHub PAT with repo scope
AGENTGATE_GITHUB_TOKEN=ghp_xxx

# Anthropic API key (for agent tests)
ANTHROPIC_API_KEY=sk-ant-xxx
```

### Test Repository Naming Convention
All test repositories created by E2E tests will be prefixed with `agentgate-e2e-test-` to make cleanup easy.

---

## Test Categories

### Category 1: Authentication Tests

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| AUTH-01 | Token Validation | Validate PAT with GitHub API | Returns username and scopes |
| AUTH-02 | Invalid Token | Test with invalid token | Throws UNAUTHORIZED error |
| AUTH-03 | Token Scopes | Verify token has `repo` scope | Scopes include 'repo' |
| AUTH-04 | CLI Auth Status | `agentgate auth github --status` | Shows authenticated user |

---

### Category 2: Repository Operations

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| REPO-01 | Check Existing Repo | Check if known repo exists | Returns true |
| REPO-02 | Check Non-Existent Repo | Check if fake repo exists | Returns false |
| REPO-03 | Get Repository Info | Get metadata for existing repo | Returns repo info |
| REPO-04 | Create Public Repo | Create new public repository | Repo created, accessible |
| REPO-05 | Create Private Repo | Create new private repository | Repo created, private |
| REPO-06 | Delete Test Repo | Clean up test repository | Repo deleted |

---

### Category 3: Workspace Operations

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| WS-01 | Clone Existing Repo | Create workspace from existing GitHub repo | Workspace created with files |
| WS-02 | Create New Repo Workspace | Create workspace with new GitHub repo | New repo created, workspace has seed files |
| WS-03 | Sync With GitHub | Pull latest changes | Changes synced |
| WS-04 | Push To GitHub | Push local changes | Changes appear on GitHub |

---

### Category 4: Git Operations

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| GIT-01 | Create Branch | Create agentgate branch | Branch created locally and remotely |
| GIT-02 | Push to Branch | Push commits to branch | Commits visible on GitHub |
| GIT-03 | Pull Changes | Pull from remote | Local updated |
| GIT-04 | Fetch Updates | Fetch without merge | Remote refs updated |

---

### Category 5: Pull Request Operations

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| PR-01 | Create PR | Create PR from branch | PR created with URL |
| PR-02 | Get PR Info | Get PR by number | PR details returned |
| PR-03 | PR with Body | Create PR with description | PR has full description |

---

### Category 6: Full Workflow Tests

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| FLOW-01 | Existing Repo Workflow | Full workflow with existing repo | Branch created, PR made |
| FLOW-02 | New Repo Workflow | Full workflow creating new repo | Repo created, branch, PR |
| FLOW-03 | CLI Submit with GitHub | `agentgate submit --github` | Full execution |
| FLOW-04 | CLI Submit with GitHub-New | `agentgate submit --github-new` | Full execution |

---

## E2E Test Implementation

### Test File Structure
```
test/
└── e2e/
    └── github-e2e.test.ts    # All E2E tests
```

### Test Execution
```bash
# Run E2E tests only
pnpm test test/e2e/github-e2e.test.ts

# Run with verbose output
pnpm test test/e2e/github-e2e.test.ts --reporter=verbose

# Run specific test
pnpm test test/e2e/github-e2e.test.ts -t "AUTH-01"
```

---

## Detailed Test Specifications

### AUTH-01: Token Validation

**Purpose**: Verify the GitHub PAT is valid and returns user info

**Steps**:
1. Get config from environment
2. Create GitHub client
3. Call validateAuth()

**Expected**:
- `authenticated` is `true`
- `username` matches token owner
- `scopes` is an array

**Code**:
```typescript
const config = getGitHubConfigFromEnv();
const client = createGitHubClient(config);
const result = await validateAuth(client);

expect(result.authenticated).toBe(true);
expect(result.username).toBeTruthy();
expect(Array.isArray(result.scopes)).toBe(true);
```

---

### AUTH-03: Token Scopes

**Purpose**: Verify token has required `repo` scope

**Steps**:
1. Get auth result
2. Check scopes include 'repo'

**Expected**:
- Scopes include 'repo'

**Code**:
```typescript
const result = await validateAuth(client);
expect(result.scopes).toContain('repo');
```

---

### REPO-04: Create Public Repo

**Purpose**: Create a new public repository via API

**Steps**:
1. Generate unique repo name with timestamp
2. Call createRepository with autoInit=true
3. Verify repo accessible
4. Clean up (delete repo)

**Expected**:
- Repository created successfully
- Repository is public
- Can access via API

**Code**:
```typescript
const repoName = `agentgate-e2e-test-${Date.now()}`;
const repo = await createRepository(client, {
  name: repoName,
  private: false,
  autoInit: true,
});

expect(repo.fullName).toBe(`${username}/${repoName}`);
expect(repo.private).toBe(false);

// Cleanup
await client.rest.repos.delete({ owner: username, repo: repoName });
```

---

### WS-01: Clone Existing Repo

**Purpose**: Create workspace from existing GitHub repository

**Steps**:
1. Use a known public repo (e.g., owner's own test repo)
2. Call createFromGitHub()
3. Verify workspace has files
4. Verify git remote is configured

**Expected**:
- Workspace created at expected path
- Files from repo present
- Git remote 'origin' configured

---

### WS-02: Create New Repo Workspace

**Purpose**: Create workspace with a new GitHub repository

**Steps**:
1. Generate unique repo name
2. Call createGitHubRepo() with template
3. Verify repo exists on GitHub
4. Verify workspace has seed files
5. Clean up

**Expected**:
- New repo visible on GitHub
- Workspace has CLAUDE.md and template files
- Initial commit present on main branch

---

### FLOW-01: Existing Repo Workflow

**Purpose**: Simulate full agentgate workflow with existing repo

**Steps**:
1. Clone existing repo to workspace
2. Create branch `agentgate/test-run-<id>`
3. Make a test file change
4. Commit and push to branch
5. Create PR
6. Verify PR exists
7. Clean up (close PR, delete branch)

**Expected**:
- Branch visible on GitHub
- PR created with correct base/head
- PR has title and body

---

### FLOW-02: New Repo Workflow

**Purpose**: Simulate full agentgate workflow with new repo

**Steps**:
1. Create new repo with createGitHubRepo()
2. Create branch `agentgate/test-run-<id>`
3. Make a test file change
4. Commit and push to branch
5. Create PR
6. Verify PR exists
7. Clean up (delete repo)

**Expected**:
- New repo created
- Branch visible on GitHub
- PR created
- Full cleanup successful

---

## Test Data Management

### Test Repository
For tests that need an existing repo, we will:
1. Create a test repo at the start of the test suite
2. Use it for all "existing repo" tests
3. Delete it at the end of the test suite

### Cleanup Strategy
- Each test that creates resources must clean them up
- Use `afterEach` and `afterAll` hooks for cleanup
- All test repos have prefix `agentgate-e2e-test-` for easy identification

---

## Error Scenarios

| Scenario | Test | Expected Behavior |
|----------|------|-------------------|
| No token | AUTH-02 | Throws GitHubError with UNAUTHORIZED |
| Invalid token | AUTH-02 | Throws GitHubError with UNAUTHORIZED |
| Repo not found | REPO-02 | repositoryExists returns false |
| No permission | N/A | Throws GitHubError with FORBIDDEN |
| Rate limited | N/A | Retry with backoff |

---

## Test Execution Order

Tests should run in this order to minimize API calls:

1. **Setup**: Create test repository for shared use
2. **Auth Tests**: Verify authentication works
3. **Repo Tests**: Test repository operations
4. **Workspace Tests**: Test workspace creation
5. **Git Tests**: Test git operations
6. **PR Tests**: Test pull request operations
7. **Flow Tests**: Test full workflows
8. **Cleanup**: Delete all test repositories

---

## Success Criteria

All E2E tests must pass with:
- Real GitHub API calls
- Real repository operations
- Actual file system operations
- No mocking

---

## Test Results Template

```markdown
## E2E Test Results - [DATE]

### Environment
- Node.js: [version]
- GitHub User: [username]
- Token Scopes: [scopes]

### Results Summary
| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Auth     | X/4    |        |         |
| Repo     | X/6    |        |         |
| Workspace| X/4    |        |         |
| Git      | X/4    |        |         |
| PR       | X/3    |        |         |
| Flow     | X/4    |        |         |
| **Total**| **X/25** |      |         |

### Failed Tests
[Details of any failures]

### Cleanup Status
- [ ] All test repos deleted
- [ ] All test branches deleted
- [ ] All test PRs closed
```

---

## Related Files

- `test/e2e/github-e2e.test.ts` - E2E test implementation
- `src/workspace/github.ts` - GitHub module being tested
- `src/workspace/manager.ts` - Workspace manager being tested
- `src/orchestrator/orchestrator.ts` - Orchestrator being tested
