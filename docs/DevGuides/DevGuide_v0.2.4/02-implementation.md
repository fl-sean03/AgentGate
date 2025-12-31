# DevGuide v0.2.4: Implementation

This document contains detailed thrust specifications for implementing GitHub-backed workspaces.

---

## Thrust 1: GitHub Module Foundation

### 1.1 Objective

Create the core GitHub API integration module with authentication and repository operations.

### 1.2 Background

AgentGate needs to interact with GitHub for:
- Validating user authentication
- Creating new repositories
- Getting repository metadata
- Creating pull requests

The `@octokit/rest` library provides a well-typed, maintained GitHub API client.

### 1.3 Subtasks

#### 1.3.1 Add Octokit Dependency

Install `@octokit/rest` as a production dependency. This is the official GitHub REST API client.

#### 1.3.2 Create GitHub Types

Create `src/types/github.ts` with:

- `GitHubConfig` - Configuration for creating client (token, optional base URL)
- `GitHubRepository` - Repository metadata (owner, repo, URLs, branch info)
- `GitHubAuthResult` - Authentication validation result (authenticated, username, scopes)
- `GitHubPullRequest` - PR metadata (number, URL, title, state, branches)
- `CreateRepositoryOptions` - Options for creating repos (name, private, description)
- `CreatePullRequestOptions` - Options for creating PRs (title, body, head, base)

All types should use Zod schemas for runtime validation.

#### 1.3.3 Implement GitHub Client Module

Create `src/workspace/github.ts` with:

**Client Management:**
- `createGitHubClient(config)` - Create authenticated Octokit instance
- `validateAuth(client)` - Verify token and return user info with scopes
- `getGitHubConfigFromEnv()` - Get config from environment variable

**Repository Operations:**
- `repositoryExists(client, owner, repo)` - Check if repo exists and is accessible
- `getRepository(client, owner, repo)` - Get full repository metadata
- `createRepository(client, options)` - Create new repo via API

**Pull Request Operations:**
- `createPullRequest(client, options)` - Create PR from branch to base
- `getPullRequest(client, owner, repo, number)` - Get PR details

**URL Helpers:**
- `getAuthenticatedRemoteUrl(cloneUrl, token)` - Inject token into HTTPS URL
- `stripTokenFromUrl(url)` - Remove token for safe logging
- `parseGitHubUrl(url)` - Extract owner/repo from GitHub URL

#### 1.3.4 Export from Types Index

Update `src/types/index.ts` to export all new GitHub types.

### 1.4 Verification Steps

1. `pnpm typecheck` passes with new types
2. `pnpm lint` shows no errors in new files
3. Import `createGitHubClient` from module without errors
4. Unit tests for client creation pass

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `package.json` | Modified - Add @octokit/rest |
| `src/types/github.ts` | Created |
| `src/types/index.ts` | Modified - Export GitHub types |
| `src/workspace/github.ts` | Created |

---

## Thrust 2: Git Operations Enhancement

### 2.1 Objective

Add push, pull, and remote management operations to the git-ops module.

### 2.2 Background

Current `git-ops.ts` only supports local operations (init, commit, branch, diff). For GitHub integration, we need remote operations (push, pull, fetch) and remote URL management.

### 2.3 Subtasks

#### 2.3.1 Add Remote Management Functions

Implement functions to manage git remotes:

- `hasRemote(path, name)` - Check if remote exists
- `addRemote(path, name, url)` - Add new remote
- `setRemoteUrl(path, name, url)` - Update existing remote URL
- `getRemoteUrl(path, name)` - Get current remote URL
- `removeRemote(path, name)` - Remove remote

#### 2.3.2 Add Push Operation

Implement `push(path, remote, branch, options?)`:

- Push specified branch to remote
- Support force push option (with caution flags)
- Support setting upstream (`-u` flag)
- Handle authentication via URL token injection
- Return push result (success, remote ref, new commits)

#### 2.3.3 Add Pull Operation

Implement `pull(path, remote, branch)`:

- Pull changes from remote branch
- Handle merge conflicts (fail gracefully)
- Return pull result (success, changes merged)

#### 2.3.4 Add Fetch Operation

Implement `fetch(path, remote, branch?)`:

- Fetch updates from remote
- Optional specific branch
- Return fetch result

#### 2.3.5 Add Branch Helper Functions

Implement helpers for branch management:

- `branchExists(path, branchName, checkRemote?)` - Check local or remote branch
- `createAndPushBranch(path, branchName, remote)` - Create local branch and push
- `getRemoteBranches(path, remote)` - List remote branches

#### 2.3.6 Update Module Exports

Update `src/workspace/index.ts` to export all new git operations.

### 2.4 Verification Steps

1. `pnpm typecheck` passes
2. All existing tests pass (no regression)
3. Can add remote to test repo
4. Can push to remote with authenticated URL
5. Can pull changes from remote

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/workspace/git-ops.ts` | Modified - Add remote/push/pull operations |
| `src/workspace/index.ts` | Modified - Export new functions |

---

## Thrust 3: Workspace Manager GitHub Integration

### 3.1 Objective

Update the workspace manager to handle GitHub-backed workspaces with new source types.

### 3.2 Background

The workspace manager currently handles `local`, `git`, and `fresh` sources. We need to add `github` (existing repo) and `github-new` (create repo) sources with full sync capability.

### 3.3 Subtasks

#### 3.3.1 Update WorkspaceSource Schema

In `src/types/work-order.ts`, add new source types:

```typescript
// New discriminated union members:
github: { type: 'github'; owner: string; repo: string; branch?: string }
github-new: { type: 'github-new'; owner: string; repoName: string; private?: boolean; template?: WorkspaceTemplate }
```

Deprecate `git` and `fresh` in favor of GitHub-specific types.

#### 3.3.2 Add GitHub Workspace Creation

In `src/workspace/manager.ts`, implement:

- `createFromGitHub(source)` - Clone existing GitHub repo
  - Validate auth and repo access
  - Clone to workspace directory
  - Set up remote with authenticated URL
  - Return workspace with GitHub metadata

- `createGitHubRepo(source)` - Create new repo and workspace
  - Create repo via GitHub API
  - Clone the new (empty) repo
  - Add seed files if template specified
  - Initial commit and push
  - Return workspace with GitHub metadata

#### 3.3.3 Add Sync Operations

Implement workspace sync functions:

- `syncWithGitHub(workspace)` - Pull latest from remote
  - Fetch and merge from origin/main
  - Handle conflicts (fail with clear error)
  - Update workspace metadata

- `pushToGitHub(workspace, branch, message)` - Push changes
  - Stage all changes
  - Commit with message
  - Push to specified branch
  - Return push result

#### 3.3.4 Add GitHub Config Helper

Implement `getGitHubConfig()`:
- Check `AGENTGATE_GITHUB_TOKEN` environment variable
- Fallback to `~/.agentgate/config.json`
- Return config or throw clear error

#### 3.3.5 Update Workspace Metadata

Extend workspace metadata to track GitHub info:
- `gitHubOwner` - Repository owner
- `gitHubRepo` - Repository name
- `gitHubBranch` - Current branch
- `gitHubRemoteUrl` - Remote URL (without token)

#### 3.3.6 Update Module Exports

Export new functions from `src/workspace/index.ts`.

### 3.4 Verification Steps

1. `pnpm typecheck` passes
2. Can create workspace from existing GitHub repo
3. Can create new GitHub repo and workspace
4. Sync pulls latest changes
5. Push sends changes to remote

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/types/work-order.ts` | Modified - Add GitHub source types |
| `src/workspace/manager.ts` | Modified - Add GitHub workspace methods |
| `src/workspace/index.ts` | Modified - Export new functions |

---

## Thrust 4: Orchestrator GitHub Workflow

### 4.1 Objective

Integrate GitHub operations into the orchestrator run lifecycle for branch-based workflow with automatic PR creation.

### 4.2 Background

The orchestrator manages run execution but currently has no GitHub integration. We need to:
1. Create a branch for each run
2. Push commits after each iteration
3. Create PR when verification passes

### 4.3 Subtasks

#### 4.3.1 Update Run Initialization

In `src/orchestrator/orchestrator.ts`, modify run initialization:

For GitHub workspaces:
1. Pull latest from origin/main
2. Create branch `agentgate/<run-id>` (e.g., `agentgate/wo-abc123`)
3. Push branch to establish remote tracking

#### 4.3.2 Add Iteration Push Logic

After each agent iteration:
1. Stage all changes
2. Commit with message: `AgentGate iteration <N>: <summary>`
3. Push to run branch
4. Log push result

#### 4.3.3 Add PR Creation on Success

When verification passes:
1. Create PR from run branch to main
2. Title: `[AgentGate] <task summary>`
3. Body: Include verification report summary
4. Return PR URL in run result

#### 4.3.4 Update Run Result Type

Extend `RunResult` to include:
- `gitHubBranch` - The run's branch name
- `gitHubPrUrl` - PR URL if created
- `gitHubPrNumber` - PR number if created

#### 4.3.5 Update Run Executor

In `src/orchestrator/run-executor.ts`:

- Add `onPushIteration` callback option
- Call after build phase completes
- Pass iteration number and commit message

### 4.4 Verification Steps

1. `pnpm typecheck` passes
2. All existing tests pass
3. Run with GitHub workspace creates branch
4. Iterations push to branch
5. Successful run creates PR
6. PR URL appears in run result

### 4.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/orchestrator/orchestrator.ts` | Modified - Add GitHub workflow |
| `src/orchestrator/run-executor.ts` | Modified - Add push callback |
| `src/types/run.ts` | Modified - Extend RunResult |

---

## Thrust 5: CLI Updates

### 5.1 Objective

Add CLI commands for GitHub authentication and update the submit command with GitHub options.

### 5.2 Background

Users need to:
1. Set up GitHub authentication
2. Submit work orders targeting GitHub repos
3. See GitHub info in output (branch, PR URL)

### 5.3 Subtasks

#### 5.3.1 Create Auth Command Module

Create `src/control-plane/commands/auth.ts`:

Implement `agentgate auth github` command with subcommands:
- `agentgate auth github` - Interactive token setup (prompt for token)
- `agentgate auth github --token <token>` - Set token directly
- `agentgate auth github --status` - Show current auth status
- `agentgate auth github --clear` - Remove saved token

Token storage:
- Primary: Environment variable `AGENTGATE_GITHUB_TOKEN`
- Fallback: `~/.agentgate/config.json`

#### 5.3.2 Update Submit Command

In `src/control-plane/commands/submit.ts`, add options:

- `--github <owner/repo>` - Use existing GitHub repo
- `--github-new <owner/repo>` - Create new GitHub repo
- `--private` - Make new repo private (with --github-new)

Update submit logic:
1. Parse owner/repo from option
2. Create appropriate WorkspaceSource
3. Display GitHub URL in output
4. Display branch name during run
5. Display PR URL on completion

#### 5.3.3 Update CLI Entry Point

In `src/control-plane/cli.ts`:
- Add auth command to CLI program
- Add appropriate help text

#### 5.3.4 Update Output Formatting

In `src/control-plane/formatter.ts`:
- Add GitHub info to status output
- Add PR URL to completion output
- Format branch names nicely

### 5.4 Verification Steps

1. `agentgate auth github --status` shows auth status
2. `agentgate auth github --token xxx` saves token
3. `agentgate submit --github owner/repo` parses correctly
4. `agentgate submit --github-new owner/repo --private` creates private repo
5. Completion output shows PR URL

### 5.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/control-plane/commands/auth.ts` | Created |
| `src/control-plane/commands/submit.ts` | Modified - Add GitHub options |
| `src/control-plane/cli.ts` | Modified - Add auth command |
| `src/control-plane/formatter.ts` | Modified - Add GitHub output |

---

## Thrust 6: Testing & Documentation

### 6.1 Objective

Add comprehensive tests and update documentation for GitHub-backed workspaces.

### 6.2 Background

New functionality needs tests to ensure reliability. Documentation needs updating for users to understand the new workflow.

### 6.3 Subtasks

#### 6.3.1 Create GitHub Module Tests

Create `test/github.test.ts`:

- Test `createGitHubClient` with valid/invalid config
- Test `validateAuth` with mocked Octokit responses
- Test `repositoryExists` for existing/non-existing repos
- Test `createRepository` with mock API
- Test `createPullRequest` with mock API
- Test URL helpers (authenticated URL, parse URL)

Use Vitest mocking for Octokit.

#### 6.3.2 Create Git Operations Tests

Create or update `test/git-ops.test.ts`:

- Test `hasRemote`, `addRemote`, `setRemoteUrl`
- Test `push` with local bare repo as remote
- Test `pull` from local bare repo
- Test `branchExists`, `createAndPushBranch`

Use temporary directories for test repos.

#### 6.3.3 Create Workspace GitHub Tests

Create `test/workspace-github.test.ts`:

- Test GitHub workspace source validation
- Test `createFromGitHub` with mocked GitHub module
- Test `createGitHubRepo` with mocked GitHub module
- Test `syncWithGitHub` operations

#### 6.3.4 Update README

Update `README.md` with:

- GitHub setup section (token creation, scopes)
- GitHub workflow examples
- Auth command documentation
- Submit command GitHub options
- Troubleshooting common GitHub issues

#### 6.3.5 Create DevGuide Completion Report

Create `reports/thrust-06-report.md` documenting:
- Tests added
- Documentation updated
- Final validation results

### 6.4 Verification Steps

1. `pnpm test` runs all tests
2. All new tests pass
3. Coverage increased
4. README has GitHub section
5. CLI help shows GitHub options

### 6.5 Files Created/Modified

| File | Action |
|------|--------|
| `test/github.test.ts` | Created |
| `test/git-ops.test.ts` | Created or Modified |
| `test/workspace-github.test.ts` | Created |
| `README.md` | Modified - Add GitHub docs |
| `reports/thrust-06-report.md` | Created |

---

## Thrust Execution Order

```
Thrust 1 ─────► Thrust 2 ─────► Thrust 3 ─────► Thrust 4 ─────► Thrust 5 ─────► Thrust 6
(GitHub       (Git Ops)       (Workspace)      (Orchestrator)   (CLI)          (Testing)
 Module)
```

Each thrust builds on the previous. Do not skip ahead.

---

## Final Validation Checklist

After all thrusts complete:

- [ ] `pnpm typecheck` - 0 errors
- [ ] `pnpm lint` - 0 errors
- [ ] `pnpm test` - All pass
- [ ] `pnpm build` - Successful
- [ ] CLI help shows GitHub options
- [ ] Auth command works
- [ ] Submit with --github works (manual test)
- [ ] PR created on successful run (manual test)
