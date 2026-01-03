# Thrust 5: Delivery System

## 5.1 Objective

Create a unified delivery system that handles git operations, PR creation, and result publication. The delivery system is triggered after all gates pass and the task converges to desired state.

---

## 5.2 Background

### Current State

Git operations are scattered:

```typescript
// In HarnessConfig
gitOps: GitOpsConfig;              // Branch, commit, push settings

// In orchestrator
onCreatePullRequest();             // PR creation callback
onGitOperation();                  // Generic git callback

// In work-order
// No delivery configuration
```

### Problems

1. **Mixed Responsibilities**: GitOps in harness, PR callbacks in orchestrator
2. **No Delivery Abstraction**: Git operations are implementation detail
3. **Missing Features**: No auto-merge, no deployment triggers

---

## 5.3 Subtasks

### 5.3.1 Define DeliverySpec Types

**Files Created**:
- `packages/server/src/types/delivery.ts` (if not already from Thrust 1)

**Specification**:

```typescript
interface DeliverySpec {
  git: GitSpec;
  pr?: PRSpec;
  notifications?: NotificationSpec;
}

// ═══════════════════════════════════════════════════════════════
// GIT - Version control operations
// ═══════════════════════════════════════════════════════════════

interface GitSpec {
  mode: GitMode;
  branchPrefix?: string;           // Default: 'agentgate/'
  branchName?: string;             // Override full branch name
  commitPrefix?: string;           // Default: '[AgentGate]'
  commitTemplate?: string;         // Template for commit message
  autoCommit?: boolean;            // Default: true
  autoPush?: boolean;              // Default: false
  signCommits?: boolean;           // GPG signing
}

type GitMode =
  | 'local'                        // Commit locally only
  | 'push'                         // Commit and push
  | 'github-pr';                   // Commit, push, create PR

// ═══════════════════════════════════════════════════════════════
// PR - Pull Request configuration
// ═══════════════════════════════════════════════════════════════

interface PRSpec {
  create: boolean;
  draft?: boolean;                 // Default: false
  title?: string;                  // Template with {task}, {date}
  body?: string;                   // Template
  labels?: string[];
  reviewers?: string[];
  assignees?: string[];
  autoMerge?: AutoMergeSpec;
  base?: string;                   // Target branch
}

interface AutoMergeSpec {
  enabled: boolean;
  method?: 'merge' | 'squash' | 'rebase';
  waitForChecks?: boolean;         // Wait for CI before merge
  deleteOnMerge?: boolean;         // Delete branch after merge
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATIONS - Result publishing
// ═══════════════════════════════════════════════════════════════

interface NotificationSpec {
  onSuccess?: NotificationConfig[];
  onFailure?: NotificationConfig[];
}

type NotificationConfig =
  | SlackNotification
  | WebhookNotification
  | EmailNotification;

interface SlackNotification {
  type: 'slack';
  webhook: string;
  channel?: string;
  template?: string;
}

interface WebhookNotification {
  type: 'webhook';
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
}

interface EmailNotification {
  type: 'email';
  to: string[];
  subject?: string;
  template?: string;
}
```

**Verification**:
- [ ] All delivery modes represented
- [ ] PR configuration complete
- [ ] Notification types defined

---

### 5.3.2 Create Git Operations Manager

**Files Created**:
- `packages/server/src/delivery/git-manager.ts`

**Specification**:

```typescript
interface GitManager {
  // Stage and commit changes
  commit(workspace: AcquiredWorkspace, spec: GitSpec, message: string): Promise<CommitResult>;

  // Push to remote
  push(workspace: AcquiredWorkspace, spec: GitSpec): Promise<PushResult>;

  // Create branch
  createBranch(workspace: AcquiredWorkspace, branchName: string): Promise<BranchResult>;

  // Get current state
  getStatus(workspace: AcquiredWorkspace): Promise<GitStatus>;
}

interface CommitResult {
  success: boolean;
  sha?: string;
  filesCommitted: string[];
  error?: string;
}

interface PushResult {
  success: boolean;
  remote?: string;
  branch?: string;
  error?: string;
}

interface BranchResult {
  success: boolean;
  branchName: string;
  error?: string;
}

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
  clean: boolean;
}

class DefaultGitManager implements GitManager {
  async commit(
    workspace: AcquiredWorkspace,
    spec: GitSpec,
    message: string
  ): Promise<CommitResult> {
    const git = simpleGit(workspace.path);

    try {
      // Stage all changes
      await git.add('.');

      // Get staged files
      const status = await git.status();
      const filesCommitted = [
        ...status.staged,
        ...status.created,
        ...status.modified,
      ];

      if (filesCommitted.length === 0) {
        return { success: true, filesCommitted: [] };
      }

      // Format commit message
      const prefix = spec.commitPrefix || '[AgentGate]';
      const fullMessage = `${prefix} ${message}`;

      // Commit
      const commitResult = await git.commit(fullMessage);

      return {
        success: true,
        sha: commitResult.commit,
        filesCommitted,
      };
    } catch (error) {
      return {
        success: false,
        filesCommitted: [],
        error: error.message,
      };
    }
  }

  async push(
    workspace: AcquiredWorkspace,
    spec: GitSpec
  ): Promise<PushResult> {
    const git = simpleGit(workspace.path);

    try {
      const status = await git.status();

      // Set upstream if needed
      if (!status.tracking) {
        await git.push(['-u', 'origin', status.current]);
      } else {
        await git.push();
      }

      return {
        success: true,
        remote: 'origin',
        branch: status.current,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async createBranch(
    workspace: AcquiredWorkspace,
    branchName: string
  ): Promise<BranchResult> {
    const git = simpleGit(workspace.path);

    try {
      await git.checkoutLocalBranch(branchName);
      return { success: true, branchName };
    } catch (error) {
      return { success: false, branchName, error: error.message };
    }
  }

  async getStatus(workspace: AcquiredWorkspace): Promise<GitStatus> {
    const git = simpleGit(workspace.path);
    const status = await git.status();

    return {
      branch: status.current || 'HEAD',
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged,
      modified: status.modified,
      untracked: status.not_added,
      clean: status.isClean(),
    };
  }
}
```

**Verification**:
- [ ] Commits changes correctly
- [ ] Pushes to remote
- [ ] Creates branches
- [ ] Reports status accurately

---

### 5.3.3 Create PR Manager

**Files Created**:
- `packages/server/src/delivery/pr-manager.ts`

**Specification**:

```typescript
interface PRManager {
  // Create pull request
  create(context: PRContext): Promise<PRResult>;

  // Update existing PR
  update(prNumber: number, updates: PRUpdates): Promise<PRResult>;

  // Enable auto-merge
  enableAutoMerge(prNumber: number, spec: AutoMergeSpec): Promise<void>;

  // Get PR status
  getStatus(prNumber: number): Promise<PRStatus>;
}

interface PRContext {
  owner: string;
  repo: string;
  head: string;                    // Source branch
  base: string;                    // Target branch
  spec: PRSpec;
  taskPrompt: string;
  filesChanged: string[];
}

interface PRResult {
  success: boolean;
  prNumber?: number;
  url?: string;
  error?: string;
}

interface PRUpdates {
  title?: string;
  body?: string;
  labels?: string[];
  reviewers?: string[];
  assignees?: string[];
}

interface PRStatus {
  number: number;
  state: 'open' | 'closed' | 'merged';
  mergeable: boolean | null;
  checksStatus: 'pending' | 'success' | 'failure';
  reviewStatus: 'pending' | 'approved' | 'changes_requested';
}

class DefaultPRManager implements PRManager {
  constructor(private octokit: Octokit) {}

  async create(context: PRContext): Promise<PRResult> {
    try {
      // Generate title
      const title = this.formatTemplate(
        context.spec.title || '{task}',
        context
      );

      // Generate body
      const body = this.formatTemplate(
        context.spec.body || this.defaultBody(context),
        context
      );

      // Create PR
      const { data } = await this.octokit.pulls.create({
        owner: context.owner,
        repo: context.repo,
        head: context.head,
        base: context.base || 'main',
        title,
        body,
        draft: context.spec.draft ?? false,
      });

      // Add labels
      if (context.spec.labels?.length) {
        await this.octokit.issues.addLabels({
          owner: context.owner,
          repo: context.repo,
          issue_number: data.number,
          labels: context.spec.labels,
        });
      }

      // Request reviewers
      if (context.spec.reviewers?.length) {
        await this.octokit.pulls.requestReviewers({
          owner: context.owner,
          repo: context.repo,
          pull_number: data.number,
          reviewers: context.spec.reviewers,
        });
      }

      // Add assignees
      if (context.spec.assignees?.length) {
        await this.octokit.issues.addAssignees({
          owner: context.owner,
          repo: context.repo,
          issue_number: data.number,
          assignees: context.spec.assignees,
        });
      }

      // Enable auto-merge if configured
      if (context.spec.autoMerge?.enabled) {
        await this.enableAutoMerge(data.number, context.spec.autoMerge);
      }

      return {
        success: true,
        prNumber: data.number,
        url: data.html_url,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async enableAutoMerge(prNumber: number, spec: AutoMergeSpec): Promise<void> {
    // Use GraphQL API for auto-merge
    const method = spec.method?.toUpperCase() || 'SQUASH';

    await this.octokit.graphql(`
      mutation EnableAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
        enablePullRequestAutoMerge(input: {
          pullRequestId: $pullRequestId,
          mergeMethod: $mergeMethod
        }) {
          pullRequest {
            autoMergeRequest {
              enabledAt
            }
          }
        }
      }
    `, {
      pullRequestId: prNumber,
      mergeMethod: method,
    });
  }

  private formatTemplate(template: string, context: PRContext): string {
    return template
      .replace('{task}', this.summarizeTask(context.taskPrompt))
      .replace('{date}', new Date().toISOString().split('T')[0])
      .replace('{files}', context.filesChanged.length.toString())
      .replace('{branch}', context.head);
  }

  private summarizeTask(prompt: string): string {
    // Take first line or first 50 chars
    const firstLine = prompt.split('\n')[0];
    return firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine;
  }

  private defaultBody(context: PRContext): string {
    return `## Summary

This PR was automatically generated by AgentGate.

### Task
${context.taskPrompt}

### Files Changed
${context.filesChanged.map(f => `- \`${f}\``).join('\n')}

---
*Generated by [AgentGate](https://github.com/agentgate/agentgate)*
`;
  }
}
```

**Verification**:
- [ ] Creates PRs correctly
- [ ] Adds labels and reviewers
- [ ] Enables auto-merge
- [ ] Uses templates correctly

---

### 5.3.4 Create Delivery Coordinator

**Files Created**:
- `packages/server/src/delivery/coordinator.ts`

**Specification**:

```typescript
interface DeliveryCoordinator {
  // Execute full delivery pipeline
  deliver(context: DeliveryContext): Promise<DeliveryResult>;
}

interface DeliveryContext {
  taskSpec: ResolvedTaskSpec;
  workspace: AcquiredWorkspace;
  filesChanged: string[];
  taskPrompt: string;
}

interface DeliveryResult {
  success: boolean;
  mode: GitMode;
  commit?: CommitResult;
  push?: PushResult;
  pr?: PRResult;
  notifications?: NotificationResult[];
  error?: string;
}

class DefaultDeliveryCoordinator implements DeliveryCoordinator {
  constructor(
    private gitManager: GitManager,
    private prManager: PRManager,
    private notifier: NotificationManager
  ) {}

  async deliver(context: DeliveryContext): Promise<DeliveryResult> {
    const spec = context.taskSpec.spec.delivery;
    const result: DeliveryResult = {
      success: false,
      mode: spec.git.mode,
    };

    try {
      // 1. Create branch if needed
      if (spec.git.mode !== 'local') {
        const branchName = this.generateBranchName(spec.git, context);
        await this.gitManager.createBranch(context.workspace, branchName);
      }

      // 2. Commit changes
      if (spec.git.autoCommit !== false) {
        result.commit = await this.gitManager.commit(
          context.workspace,
          spec.git,
          this.generateCommitMessage(context)
        );

        if (!result.commit.success) {
          throw new Error(`Commit failed: ${result.commit.error}`);
        }
      }

      // 3. Push if configured
      if (spec.git.mode === 'push' || spec.git.mode === 'github-pr') {
        result.push = await this.gitManager.push(context.workspace, spec.git);

        if (!result.push.success) {
          throw new Error(`Push failed: ${result.push.error}`);
        }
      }

      // 4. Create PR if configured
      if (spec.git.mode === 'github-pr' && spec.pr?.create) {
        const workspace = context.taskSpec.spec.execution.workspace as GitHubWorkspace;

        result.pr = await this.prManager.create({
          owner: workspace.owner,
          repo: workspace.repo,
          head: result.push?.branch || 'HEAD',
          base: spec.pr.base || 'main',
          spec: spec.pr,
          taskPrompt: context.taskPrompt,
          filesChanged: context.filesChanged,
        });

        if (!result.pr.success) {
          throw new Error(`PR creation failed: ${result.pr.error}`);
        }
      }

      // 5. Send notifications
      if (spec.notifications?.onSuccess) {
        result.notifications = await this.notifier.send(
          spec.notifications.onSuccess,
          { type: 'success', ...result }
        );
      }

      result.success = true;
    } catch (error) {
      result.error = error.message;

      // Send failure notifications
      if (spec.notifications?.onFailure) {
        result.notifications = await this.notifier.send(
          spec.notifications.onFailure,
          { type: 'failure', error: error.message }
        );
      }
    }

    return result;
  }

  private generateBranchName(spec: GitSpec, context: DeliveryContext): string {
    if (spec.branchName) return spec.branchName;

    const prefix = spec.branchPrefix || 'agentgate/';
    const slug = this.slugify(context.taskPrompt);
    const timestamp = Date.now();

    return `${prefix}${slug}-${timestamp}`;
  }

  private generateCommitMessage(context: DeliveryContext): string {
    const firstLine = context.taskPrompt.split('\n')[0];
    const summary = firstLine.length > 50
      ? firstLine.slice(0, 47) + '...'
      : firstLine;

    return summary;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);
  }
}
```

**Verification**:
- [ ] Creates branches correctly
- [ ] Commits and pushes
- [ ] Creates PRs
- [ ] Sends notifications

---

## 5.4 Verification Steps

```bash
# Test git manager
pnpm --filter @agentgate/server test -- --grep "GitManager"

# Test PR manager
pnpm --filter @agentgate/server test -- --grep "PRManager"

# Test coordinator
pnpm --filter @agentgate/server test -- --grep "DeliveryCoordinator"
```

---

## 5.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/types/delivery.ts` | Created/Extended |
| `packages/server/src/delivery/git-manager.ts` | Created |
| `packages/server/src/delivery/pr-manager.ts` | Created |
| `packages/server/src/delivery/notification-manager.ts` | Created |
| `packages/server/src/delivery/coordinator.ts` | Created |
| `packages/server/src/delivery/index.ts` | Created |
| `packages/server/test/unit/delivery/` | Created (tests) |

---

## 5.6 Dependencies

- **Depends on**: Thrust 1 (DeliverySpec types), Thrust 4 (workspace)
- **Used by**: Convergence controller triggers delivery on success
