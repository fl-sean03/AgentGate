# DevGuide v0.2.4: Overview

## Current State Analysis

### Existing Workspace Architecture

The current workspace system is **local filesystem-only**:

1. **Workspace Sources** (`src/types/work-order.ts`):
   - `local`: Point to existing directory
   - `git`: Clone from URL (one-time, no sync)
   - `fresh`: Create new workspace with seed files

2. **Git Operations** (`src/workspace/git-ops.ts`):
   - ✅ `initRepo()`, `cloneRepo()`, `commit()`, `stageAll()`
   - ✅ `createBranch()`, `checkout()`, `getDiff()`
   - ❌ **No push operations**
   - ❌ **No remote management after initial clone**
   - ❌ **No authentication handling**

3. **Metadata Storage**:
   - JSON files in `~/.agentgate/workspaces/`
   - Workspace path, lease info, status
   - No persistent remote connection

### Problems with Current Approach

| Problem | Impact |
|---------|--------|
| Local-only state | Lost if disk fails, not shareable |
| No push capability | Agent changes stay local |
| One-time clone | Never syncs with remote updates |
| No collaboration | User can't work alongside agent |
| CI disconnect | Verification separate from GitHub Actions |

---

## Target Architecture

### GitHub as Source of Truth

**Core Principle**: The GitHub repository IS the workspace.

```
                    ┌───────────────────────┐
                    │   GitHub Repository   │
                    │   (Source of Truth)   │
                    └───────────┬───────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
            ▼                   ▼                   ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
    │   AgentGate   │   │     User      │   │  GitHub CI    │
    │   Workspace   │   │  Local Clone  │   │   Actions     │
    └───────────────┘   └───────────────┘   └───────────────┘
            │                   │                   │
            └───────────────────┼───────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │  All sync via GitHub  │
                    │  (push/pull/PR)       │
                    └───────────────────────┘
```

### New Workspace Sources

**Replace** `git` and `fresh` with GitHub-specific types:

```typescript
type WorkspaceSource =
  | { type: 'local'; path: string }  // Keep for local dev
  | { type: 'github'; owner: string; repo: string; branch?: string }
  | { type: 'github-new'; owner: string; repoName: string; private?: boolean; template?: WorkspaceTemplate }
```

### Branch-per-Run Strategy

Each run creates an isolated branch:

```
main                    ─────●─────●─────●─────●─────●─────
                             │                 │
agentgate/wo-abc123    ──────●──●──●          │
                                   │          │
                                   └──── PR ──┘

agentgate/wo-def456               ──────●──●──●
                                            │
                                            └──── PR (pending)
```

**Benefits**:
- Main branch always stable
- Each run fully auditable
- Multiple concurrent runs possible
- Easy rollback (delete branch)
- Natural PR workflow

---

## Design Decisions

### 1. Why PAT over OAuth/GitHub App?

| Approach | Pros | Cons |
|----------|------|------|
| **PAT** | Simple setup, works immediately, user-familiar | Must manually create, no automatic rotation |
| OAuth | Better UX, automatic token refresh | Requires callback server, more complex |
| GitHub App | Fine-grained permissions, org-level | Complex setup, requires app installation |

**Decision**: Start with PAT for v0.2.4. Design allows adding OAuth/App later.

**Implementation**:
- Environment variable: `AGENTGATE_GITHUB_TOKEN`
- Fallback: `~/.agentgate/config.json`
- Required scope: `repo` (full repository access)

### 2. Why Branch-per-Run over Single Branch?

| Approach | Pros | Cons |
|----------|------|------|
| **Branch-per-run** | Full audit trail, concurrent runs, safe | More branches to manage |
| Single branch | Simple, fewer branches | Loses history, can't run concurrently |
| Direct to main | Simplest | Dangerous, no review step |

**Decision**: Branch-per-run (`agentgate/<run-id>`) for safety and auditability.

### 3. Why Auto-Create PR?

| Approach | Pros | Cons |
|----------|------|------|
| **Always create** | Natural workflow, easy review | May create unwanted PRs |
| Optional flag | User control | Extra flag to remember |
| Never | User does manually | More friction |

**Decision**: Always create PR when verification passes. User merges when ready.

### 4. Why No Database?

| Approach | Pros | Cons |
|----------|------|------|
| **No database** | Simple deployment, GitHub is state | Limited query capability |
| SQLite | Fast queries, local | Another moving part |
| Postgres | Full ACID, scalable | Complex deployment |

**Decision**: Keep current JSON metadata + GitHub. Git history IS the audit log.

---

## Module Architecture

### New Modules

```
src/
├── types/
│   └── github.ts          # NEW: GitHub-specific types
├── workspace/
│   ├── github.ts          # NEW: GitHub API operations
│   ├── git-ops.ts         # MODIFY: Add push/pull/remote
│   └── manager.ts         # MODIFY: GitHub workspace support
├── orchestrator/
│   ├── orchestrator.ts    # MODIFY: Branch/push/PR workflow
│   └── run-executor.ts    # MODIFY: Push after iterations
└── control-plane/
    └── commands/
        ├── auth.ts        # NEW: Auth management
        └── submit.ts      # MODIFY: GitHub options
```

### Type Hierarchy

```typescript
// src/types/github.ts

export interface GitHubConfig {
  token: string;
  baseUrl?: string;  // For GitHub Enterprise
}

export interface GitHubRepository {
  owner: string;
  repo: string;
  fullName: string;  // owner/repo
  cloneUrl: string;  // https://github.com/owner/repo.git
  sshUrl: string;    // git@github.com:owner/repo.git
  defaultBranch: string;
  private: boolean;
}

export interface GitHubAuthResult {
  authenticated: boolean;
  username: string;
  scopes: string[];
}

export interface GitHubPullRequest {
  number: number;
  url: string;
  title: string;
  state: 'open' | 'closed' | 'merged';
  head: string;  // source branch
  base: string;  // target branch
}
```

### GitHub Module API

```typescript
// src/workspace/github.ts

// Client management
createGitHubClient(config: GitHubConfig): Octokit
validateAuth(client: Octokit): Promise<GitHubAuthResult>

// Repository operations
repositoryExists(client, owner, repo): Promise<boolean>
getRepository(client, owner, repo): Promise<GitHubRepository>
createRepository(client, options): Promise<GitHubRepository>

// Pull request operations
createPullRequest(client, options): Promise<GitHubPullRequest>
getPullRequest(client, owner, repo, number): Promise<GitHubPullRequest>

// Helpers
getAuthenticatedRemoteUrl(repoUrl, token): string
parseGitHubUrl(url): { owner: string; repo: string }
```

---

## Security Considerations

### Token Security

1. **Storage**: Environment variable preferred over file
2. **Scope**: Minimum required is `repo` scope
3. **Rotation**: Document manual rotation process
4. **Never log**: Token never appears in logs or error messages

### URL Security

```typescript
// Token injected into URL for git operations
const authenticatedUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;

// NEVER log this URL - strip token first
const safeUrl = url.replace(/x-access-token:[^@]+@/, 'x-access-token:***@');
```

### Branch Protection

- Agent never pushes to main directly
- All changes go through PR
- Repo maintainer controls merge permissions

---

## Error Handling Strategy

### GitHub API Errors

| Error | Handling |
|-------|----------|
| 401 Unauthorized | Invalid token - prompt re-auth |
| 403 Forbidden | Missing permissions - check scopes |
| 404 Not Found | Repo doesn't exist or no access |
| 422 Validation | Invalid request - check parameters |
| Rate limit | Wait and retry with exponential backoff |

### Git Operation Errors

| Error | Handling |
|-------|----------|
| Push rejected | Pull first, resolve conflicts |
| Auth failed | Check token, URL format |
| Network error | Retry with backoff |
| Branch exists | Use unique run ID in branch name |

---

## Migration Path

### Backward Compatibility

- `local` workspace source unchanged
- Existing `git` source deprecated but functional
- `fresh` source deprecated in favor of `github-new`

### Upgrade Path

```bash
# Before v0.2.4 (local-only)
agentgate submit --prompt "Fix bug" --path ./my-project

# After v0.2.4 (GitHub-backed, recommended)
agentgate submit --prompt "Fix bug" --github owner/my-project

# Local still works for development
agentgate submit --prompt "Fix bug" --path ./my-project
```

---

## Testing Strategy

### Unit Tests

- GitHub module functions with mocked Octokit
- Git operations with temporary repos
- Workspace manager GitHub integration

### Integration Tests

- Full workflow with mock GitHub API
- CLI commands with stubbed backend

### E2E Tests (Manual)

- Real GitHub repo creation
- Push/pull operations
- PR creation and verification

---

## Success Metrics

| Metric | Target |
|--------|--------|
| TypeScript errors | 0 |
| ESLint errors | 0 |
| Test pass rate | 100% |
| New tests added | 10+ |
| Documentation updated | Yes |
