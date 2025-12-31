# DevGuide v0.2.4: Appendices

## A. Complete File Reference

### New Files

| File | Purpose | Thrust |
|------|---------|--------|
| `src/types/github.ts` | GitHub type definitions and Zod schemas | 1 |
| `src/workspace/github.ts` | GitHub API operations module | 1 |
| `src/control-plane/commands/auth.ts` | Auth CLI command | 5 |
| `test/github.test.ts` | GitHub module tests | 6 |
| `test/git-ops.test.ts` | Git operations tests | 6 |
| `test/workspace-github.test.ts` | Workspace GitHub integration tests | 6 |

### Modified Files

| File | Changes | Thrust |
|------|---------|--------|
| `package.json` | Add @octokit/rest dependency | 1 |
| `src/types/index.ts` | Export GitHub types | 1 |
| `src/workspace/git-ops.ts` | Add push/pull/remote operations | 2 |
| `src/workspace/index.ts` | Export new functions | 2, 3 |
| `src/types/work-order.ts` | Add GitHub source types | 3 |
| `src/workspace/manager.ts` | Add GitHub workspace methods | 3 |
| `src/types/run.ts` | Extend RunResult with GitHub fields | 4 |
| `src/orchestrator/orchestrator.ts` | Add GitHub workflow | 4 |
| `src/orchestrator/run-executor.ts` | Add push iteration callback | 4 |
| `src/control-plane/commands/submit.ts` | Add --github options | 5 |
| `src/control-plane/cli.ts` | Add auth command | 5 |
| `src/control-plane/formatter.ts` | Add GitHub output formatting | 5 |
| `README.md` | Add GitHub documentation | 6 |

---

## B. Type Reference

### GitHubConfig
```typescript
interface GitHubConfig {
  token: string;
  baseUrl?: string;  // For GitHub Enterprise
}
```

### GitHubRepository
```typescript
interface GitHubRepository {
  owner: string;
  repo: string;
  fullName: string;      // "owner/repo"
  cloneUrl: string;      // "https://github.com/owner/repo.git"
  sshUrl: string;        // "git@github.com:owner/repo.git"
  defaultBranch: string; // "main"
  private: boolean;
}
```

### GitHubAuthResult
```typescript
interface GitHubAuthResult {
  authenticated: boolean;
  username: string;
  scopes: string[];
}
```

### GitHubPullRequest
```typescript
interface GitHubPullRequest {
  number: number;
  url: string;
  title: string;
  state: 'open' | 'closed' | 'merged';
  head: string;  // source branch
  base: string;  // target branch
}
```

### WorkspaceSource (Updated)
```typescript
type WorkspaceSource =
  | { type: 'local'; path: string }
  | { type: 'github'; owner: string; repo: string; branch?: string }
  | { type: 'github-new'; owner: string; repoName: string; private?: boolean; template?: WorkspaceTemplate }
  // Deprecated:
  | { type: 'git'; url: string; branch?: string }
  | { type: 'fresh'; destPath: string; template?: WorkspaceTemplate }
```

---

## C. Function Reference

### GitHub Module (src/workspace/github.ts)

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `createGitHubClient` | `config: GitHubConfig` | `Octokit` | Create authenticated client |
| `validateAuth` | `client: Octokit` | `Promise<GitHubAuthResult>` | Verify token |
| `getGitHubConfigFromEnv` | - | `GitHubConfig` | Get config from env |
| `repositoryExists` | `client, owner, repo` | `Promise<boolean>` | Check repo exists |
| `getRepository` | `client, owner, repo` | `Promise<GitHubRepository>` | Get repo metadata |
| `createRepository` | `client, options` | `Promise<GitHubRepository>` | Create new repo |
| `createPullRequest` | `client, options` | `Promise<GitHubPullRequest>` | Create PR |
| `getAuthenticatedRemoteUrl` | `cloneUrl, token` | `string` | Inject token into URL |
| `stripTokenFromUrl` | `url` | `string` | Remove token for logging |
| `parseGitHubUrl` | `url` | `{owner, repo}` | Parse GitHub URL |

### Git Operations (src/workspace/git-ops.ts) - New Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `hasRemote` | `path, name` | `Promise<boolean>` | Check remote exists |
| `addRemote` | `path, name, url` | `Promise<void>` | Add remote |
| `setRemoteUrl` | `path, name, url` | `Promise<void>` | Update remote URL |
| `getRemoteUrl` | `path, name` | `Promise<string>` | Get remote URL |
| `push` | `path, remote, branch, options?` | `Promise<PushResult>` | Push to remote |
| `pull` | `path, remote, branch` | `Promise<PullResult>` | Pull from remote |
| `fetch` | `path, remote, branch?` | `Promise<void>` | Fetch from remote |
| `branchExists` | `path, branch, checkRemote?` | `Promise<boolean>` | Check branch exists |
| `createAndPushBranch` | `path, branch, remote` | `Promise<void>` | Create and push branch |

### Workspace Manager (src/workspace/manager.ts) - New Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `createFromGitHub` | `source: GitHubSource` | `Promise<Workspace>` | Clone existing repo |
| `createGitHubRepo` | `source: GitHubNewSource` | `Promise<Workspace>` | Create new repo |
| `syncWithGitHub` | `workspace: Workspace` | `Promise<void>` | Pull latest |
| `pushToGitHub` | `workspace, branch, message` | `Promise<PushResult>` | Push changes |
| `getGitHubConfig` | - | `GitHubConfig` | Get GitHub config |

---

## D. CLI Command Reference

### Auth Commands

```bash
# Interactive token setup
agentgate auth github

# Set token directly
agentgate auth github --token ghp_xxxxxxxxxxxx

# Check authentication status
agentgate auth github --status

# Clear saved token
agentgate auth github --clear
```

### Submit Command Options

```bash
# Existing repository
agentgate submit --prompt "Fix bug" --github owner/repo

# Create new public repository
agentgate submit --prompt "Create API" --github-new owner/new-repo

# Create new private repository
agentgate submit --prompt "Internal tool" --github-new owner/new-repo --private

# With other options
agentgate submit \
  --prompt "Add tests" \
  --github owner/repo \
  --agent claude-code \
  --max-iterations 5
```

---

## E. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTGATE_GITHUB_TOKEN` | Yes (for GitHub) | GitHub Personal Access Token |

### Token Requirements

- **Scope**: `repo` (full repository access)
- **Expiration**: Recommended to set expiration
- **Rotation**: Manual - recreate when expired

### Creating a Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Click "Generate new token (classic)"
3. Set expiration (90 days recommended)
4. Select scope: `repo`
5. Generate and copy token
6. Set environment variable: `export AGENTGATE_GITHUB_TOKEN=ghp_xxx`

---

## F. Error Messages Reference

| Error | Cause | Solution |
|-------|-------|----------|
| `GitHub token not configured` | No token in env or config | Run `agentgate auth github` |
| `Invalid GitHub token` | Token expired or revoked | Create new token |
| `Repository not found` | Repo doesn't exist or no access | Check owner/repo spelling |
| `Permission denied` | Token lacks required scope | Create token with `repo` scope |
| `Branch already exists` | Run ID collision (rare) | Use different run ID |
| `Push rejected` | Remote has newer changes | Pull first, resolve conflicts |

---

## G. Thrust Completion Checklist

### Thrust 1: GitHub Module Foundation
- [ ] @octokit/rest installed
- [ ] GitHub types created
- [ ] GitHub module implemented
- [ ] Types exported from index
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes

### Thrust 2: Git Operations Enhancement
- [ ] Remote management functions added
- [ ] Push operation implemented
- [ ] Pull operation implemented
- [ ] Fetch operation implemented
- [ ] Branch helpers implemented
- [ ] Functions exported
- [ ] `pnpm typecheck` passes
- [ ] Existing tests pass

### Thrust 3: Workspace Manager Integration
- [ ] WorkspaceSource schema updated
- [ ] createFromGitHub implemented
- [ ] createGitHubRepo implemented
- [ ] Sync operations implemented
- [ ] Config helper implemented
- [ ] Functions exported
- [ ] `pnpm typecheck` passes

### Thrust 4: Orchestrator Workflow
- [ ] Run initialization creates branch
- [ ] Iterations push to branch
- [ ] PR created on success
- [ ] RunResult extended
- [ ] `pnpm typecheck` passes
- [ ] Existing tests pass

### Thrust 5: CLI Updates
- [ ] Auth command created
- [ ] Submit --github option added
- [ ] Submit --github-new option added
- [ ] --private flag works
- [ ] Output shows GitHub info
- [ ] Help text updated
- [ ] `pnpm typecheck` passes

### Thrust 6: Testing & Documentation
- [ ] GitHub module tests pass
- [ ] Git ops tests pass
- [ ] Workspace GitHub tests pass
- [ ] README updated
- [ ] All tests pass
- [ ] Completion report created

---

## H. Verification Commands

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint

# Run all tests
pnpm test

# Run specific test file
pnpm test test/github.test.ts

# Build project
pnpm build

# Test CLI
node dist/index.js --help
node dist/index.js auth github --status
node dist/index.js submit --help

# Full validation
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

---

## I. Troubleshooting Guide

### Authentication Issues

**Problem**: "GitHub token not configured"
```bash
# Solution 1: Set environment variable
export AGENTGATE_GITHUB_TOKEN=ghp_your_token

# Solution 2: Use auth command
agentgate auth github --token ghp_your_token
```

**Problem**: "Invalid GitHub token"
```bash
# Verify token works
curl -H "Authorization: token ghp_your_token" https://api.github.com/user

# If 401, token is invalid - create new one
```

### Repository Issues

**Problem**: "Repository not found"
- Check spelling of owner/repo
- Verify repo exists on GitHub
- Check token has access to private repos

**Problem**: "Permission denied"
- Verify token has `repo` scope
- Check you have write access to repo

### Git Issues

**Problem**: "Push rejected"
```bash
# Pull latest changes first
cd ~/.agentgate/workspaces/<id>
git pull origin main
# Resolve any conflicts, then retry
```

**Problem**: "Branch already exists"
- Extremely rare (run IDs are unique)
- Delete the remote branch and retry

---

## J. Related Documentation

- [GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [Octokit.js Documentation](https://octokit.github.io/rest.js/)
- [Git Push Documentation](https://git-scm.com/docs/git-push)
- [DevGuide System](../README.md)
