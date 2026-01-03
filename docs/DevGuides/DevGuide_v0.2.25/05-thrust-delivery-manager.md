# Thrust 4: Delivery Manager

## 4.1 Objective

Extract GitHub integration logic from the orchestrator into a pluggable `DeliveryManager` interface. This enables support for multiple VCS providers (GitHub, GitLab, Gitea) and simplifies the core execution logic.

---

## 4.2 Background

### Current State

GitHub logic is embedded in `orchestrator.ts` (lines 514-672):

```
orchestrator.execute()
  └── if (isGitHubWorkspace)
      ├── onPushIteration callback (30 lines)
      ├── onCreatePullRequest callback (50 lines)
      ├── onPollCI callback (40 lines)
      └── CI result handling (40 lines)
```

**Problems**:
1. Cannot support GitLab without modifying orchestrator
2. Orchestrator is 595 lines partly due to GitHub code
3. Testing GitHub integration requires full orchestrator setup
4. GitHub logic mixed with execution orchestration

### Target Architecture

```
DeliveryManager interface
├── GitHubDeliveryManager
│   ├── pushIteration()
│   ├── createPullRequest()
│   └── pollCI()
├── GitLabDeliveryManager (future)
├── LocalDeliveryManager
└── NoopDeliveryManager (testing)
```

---

## 4.3 Subtasks

### 4.3.1 Define DeliveryManager Interface

**File Created**: `packages/server/src/delivery/manager.ts`

**Specification**:

```typescript
/**
 * Context provided to delivery operations
 */
interface DeliveryContext {
  workOrderId: string;
  runId: string;
  workspace: Workspace;
  run: Run;
  iterations: IterationData[];
  deliverySpec: DeliverySpec;
}

/**
 * Result of delivery operations
 */
interface DeliveryResult {
  success: boolean;
  gitResult?: GitDeliveryResult;
  prResult?: PRDeliveryResult;
  ciResult?: CIDeliveryResult;
  errors: DeliveryError[];
}

interface GitDeliveryResult {
  branch: string;
  commits: CommitInfo[];
  pushed: boolean;
}

interface PRDeliveryResult {
  prUrl: string;
  prNumber: number;
  draft: boolean;
  ready: boolean;
}

interface CIDeliveryResult {
  status: 'passed' | 'failed' | 'timeout' | 'skipped';
  checks: CICheck[];
  feedback?: string;
}

/**
 * Delivery manager interface
 */
interface DeliveryManager {
  /**
   * Manager name for identification
   */
  readonly name: string;

  /**
   * Check if this manager can handle the delivery spec
   */
  canHandle(spec: DeliverySpec): boolean;

  /**
   * Execute full delivery workflow
   */
  deliver(context: DeliveryContext): Promise<DeliveryResult>;

  /**
   * Push iteration changes (called after each iteration)
   */
  pushIteration?(context: DeliveryContext, iteration: number): Promise<void>;

  /**
   * Create pull request (called when verification passes)
   */
  createPullRequest?(
    context: DeliveryContext
  ): Promise<PRDeliveryResult | null>;

  /**
   * Poll CI status (called after PR creation if waitForCI)
   */
  pollCI?(context: DeliveryContext, prUrl: string): Promise<CIDeliveryResult>;
}
```

---

### 4.3.2 Implement GitHubDeliveryManager

**File Created**: `packages/server/src/delivery/github.ts`

**Specification**:

Extract and encapsulate all GitHub logic:

```typescript
interface GitHubDeliveryConfig {
  client: Octokit;
  owner: string;
  repo: string;
  defaultBranch: string;
  ciPollingInterval: number;
  ciPollingTimeout: number;
}

class GitHubDeliveryManager implements DeliveryManager {
  readonly name = 'github';

  constructor(private readonly config: GitHubDeliveryConfig) {}

  canHandle(spec: DeliverySpec): boolean {
    return spec.git?.mode === 'github-pr';
  }

  async deliver(context: DeliveryContext): Promise<DeliveryResult> {
    const result: DeliveryResult = {
      success: true,
      errors: [],
    };

    try {
      // Push all iteration commits
      result.gitResult = await this.pushAllIterations(context);

      // Create pull request
      const prResult = await this.createPullRequest(context);
      if (prResult) {
        result.prResult = prResult;

        // Poll CI if configured
        if (context.deliverySpec.waitForCI) {
          result.ciResult = await this.pollCI(context, prResult.prUrl);

          // Convert draft to ready if CI passed
          if (result.ciResult.status === 'passed' && prResult.draft) {
            await this.convertDraftToReady(prResult.prNumber);
            result.prResult.ready = true;
          }

          if (result.ciResult.status === 'failed') {
            result.success = false;
          }
        }
      }

    } catch (error) {
      result.success = false;
      result.errors.push({
        phase: 'delivery',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return result;
  }

  async pushIteration(context: DeliveryContext, iteration: number): Promise<void> {
    const { workspace, run, deliverySpec } = context;
    const branch = this.getBranchName(context);

    // Create commit
    const message = this.formatCommitMessage(context, iteration);

    await this.execGit(workspace.path, [
      'add', '-A'
    ]);

    await this.execGit(workspace.path, [
      'commit', '-m', message
    ]);

    // Push to remote
    await this.execGit(workspace.path, [
      'push', '-u', 'origin', branch
    ]);
  }

  async createPullRequest(context: DeliveryContext): Promise<PRDeliveryResult | null> {
    const { workspace, run, deliverySpec } = context;
    const branch = this.getBranchName(context);

    // Check if PR already exists
    const existing = await this.findExistingPR(branch);
    if (existing) {
      return existing;
    }

    // Create PR
    const prConfig = deliverySpec.pr ?? {};
    const title = this.formatPRTitle(context);
    const body = this.formatPRBody(context);

    const response = await this.config.client.rest.pulls.create({
      owner: this.config.owner,
      repo: this.config.repo,
      head: branch,
      base: this.config.defaultBranch,
      title,
      body,
      draft: prConfig.draft ?? true,
    });

    // Add labels if configured
    if (prConfig.labels?.length) {
      await this.config.client.rest.issues.addLabels({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: response.data.number,
        labels: prConfig.labels,
      });
    }

    // Request reviewers if configured
    if (prConfig.reviewers?.length) {
      await this.config.client.rest.pulls.requestReviewers({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: response.data.number,
        reviewers: prConfig.reviewers,
      });
    }

    return {
      prUrl: response.data.html_url,
      prNumber: response.data.number,
      draft: response.data.draft,
      ready: !response.data.draft,
    };
  }

  async pollCI(context: DeliveryContext, prUrl: string): Promise<CIDeliveryResult> {
    const branch = this.getBranchName(context);
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.ciPollingTimeout) {
      const status = await this.getCIStatus(branch);

      if (status.conclusion !== null) {
        // CI completed
        return {
          status: status.conclusion === 'success' ? 'passed' : 'failed',
          checks: status.checks,
          feedback: status.conclusion !== 'success'
            ? this.formatCIFeedback(status)
            : undefined,
        };
      }

      // Wait before next poll
      await this.sleep(this.config.ciPollingInterval);
    }

    // Timeout
    return {
      status: 'timeout',
      checks: [],
    };
  }

  // Helper methods
  private getBranchName(context: DeliveryContext): string {
    const { workOrderId, runId } = context;
    return `agentgate/${workOrderId.slice(0, 8)}/${runId.slice(0, 8)}`;
  }

  private formatCommitMessage(context: DeliveryContext, iteration: number): string {
    const taskSummary = context.deliverySpec.git?.commitMessagePrefix
      ?? 'AgentGate';
    return `${taskSummary} iteration ${iteration}`;
  }

  private formatPRTitle(context: DeliveryContext): string {
    const taskPrompt = context.run.taskPrompt?.slice(0, 50) ?? 'Task';
    return `[AgentGate] ${taskPrompt}`;
  }

  private formatPRBody(context: DeliveryContext): string {
    const lines = [
      '## Summary',
      '',
      `This PR was created by AgentGate.`,
      '',
      `- **Work Order**: ${context.workOrderId}`,
      `- **Run ID**: ${context.runId}`,
      `- **Iterations**: ${context.iterations.length}`,
      '',
      '## Changes',
      '',
      // Add iteration summaries
      ...context.iterations.map((iter, i) =>
        `- Iteration ${i + 1}: ${iter.verificationPassed ? 'Passed' : 'Failed'}`
      ),
    ];

    return lines.join('\n');
  }

  private async getCIStatus(branch: string): Promise<CIStatus> {
    const response = await this.config.client.rest.repos.getCombinedStatusForRef({
      owner: this.config.owner,
      repo: this.config.repo,
      ref: branch,
    });

    const checks = await this.config.client.rest.checks.listForRef({
      owner: this.config.owner,
      repo: this.config.repo,
      ref: branch,
    });

    // Determine overall status
    const statuses = response.data.statuses;
    const checkRuns = checks.data.check_runs;

    // All must pass for success
    const allPassed = statuses.every(s => s.state === 'success') &&
                      checkRuns.every(c => c.conclusion === 'success');

    const anyFailed = statuses.some(s => s.state === 'failure') ||
                      checkRuns.some(c => c.conclusion === 'failure');

    const anyPending = statuses.some(s => s.state === 'pending') ||
                       checkRuns.some(c => c.status === 'in_progress');

    return {
      conclusion: anyFailed ? 'failure' : allPassed ? 'success' : anyPending ? null : 'failure',
      checks: [
        ...statuses.map(s => ({
          name: s.context,
          status: s.state as CICheckStatus,
        })),
        ...checkRuns.map(c => ({
          name: c.name,
          status: (c.conclusion ?? c.status) as CICheckStatus,
        })),
      ],
    };
  }

  private formatCIFeedback(status: CIStatus): string {
    const failed = status.checks.filter(c =>
      c.status === 'failure' || c.status === 'error'
    );

    return [
      'CI checks failed:',
      ...failed.map(c => `- ${c.name}: ${c.status}`),
      '',
      'Please review and fix the failing checks.',
    ].join('\n');
  }

  private async convertDraftToReady(prNumber: number): Promise<void> {
    await this.config.client.graphql(`
      mutation($prId: ID!) {
        markPullRequestReadyForReview(input: { pullRequestId: $prId }) {
          pullRequest { id }
        }
      }
    `, {
      prId: await this.getPRNodeId(prNumber),
    });
  }

  private async execGit(cwd: string, args: string[]): Promise<void> {
    const { exec } = await import('../utils/exec.js');
    await exec('git', args, { cwd });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**Lines**: ~250 (extracted from orchestrator)

---

### 4.3.3 Implement LocalDeliveryManager

**File Created**: `packages/server/src/delivery/local.ts`

**Specification**:

For local workspace delivery (commit only, no push/PR):

```typescript
class LocalDeliveryManager implements DeliveryManager {
  readonly name = 'local';

  canHandle(spec: DeliverySpec): boolean {
    return spec.git?.mode === 'local';
  }

  async deliver(context: DeliveryContext): Promise<DeliveryResult> {
    const { workspace, deliverySpec } = context;

    if (!deliverySpec.git?.autoCommit) {
      // No delivery actions needed
      return {
        success: true,
        errors: [],
      };
    }

    try {
      // Create final commit
      const message = this.formatCommitMessage(context);

      await this.execGit(workspace.path, ['add', '-A']);
      await this.execGit(workspace.path, ['commit', '-m', message]);

      return {
        success: true,
        gitResult: {
          branch: await this.getCurrentBranch(workspace.path),
          commits: [{ message }],
          pushed: false,
        },
        errors: [],
      };

    } catch (error) {
      // Commit might fail if no changes
      if (this.isNoChangesError(error)) {
        return {
          success: true,
          errors: [],
        };
      }

      return {
        success: false,
        errors: [{
          phase: 'git',
          message: error instanceof Error ? error.message : String(error),
        }],
      };
    }
  }

  private formatCommitMessage(context: DeliveryContext): string {
    return `AgentGate: ${context.run.taskPrompt?.slice(0, 50) ?? 'Task completed'}`;
  }

  private async getCurrentBranch(cwd: string): Promise<string> {
    const { exec } = await import('../utils/exec.js');
    const result = await exec('git', ['branch', '--show-current'], { cwd });
    return result.stdout.trim();
  }

  private async execGit(cwd: string, args: string[]): Promise<void> {
    const { exec } = await import('../utils/exec.js');
    await exec('git', args, { cwd });
  }

  private isNoChangesError(error: unknown): boolean {
    return error instanceof Error &&
           error.message.includes('nothing to commit');
  }
}
```

---

### 4.3.4 Create DeliveryManager Registry

**File Created**: `packages/server/src/delivery/registry.ts`

**Specification**:

Factory for selecting appropriate delivery manager:

```typescript
interface DeliveryManagerRegistry {
  register(manager: DeliveryManager): void;
  get(spec: DeliverySpec): DeliveryManager;
  list(): string[];
}

class DefaultDeliveryManagerRegistry implements DeliveryManagerRegistry {
  private readonly managers = new Map<string, DeliveryManager>();

  constructor() {
    // Register built-in managers
    this.register(new GitHubDeliveryManager(/* default config */));
    this.register(new LocalDeliveryManager());
    this.register(new NoopDeliveryManager());
  }

  register(manager: DeliveryManager): void {
    if (this.managers.has(manager.name)) {
      throw new DuplicateManagerError(manager.name);
    }
    this.managers.set(manager.name, manager);
  }

  get(spec: DeliverySpec): DeliveryManager {
    for (const manager of this.managers.values()) {
      if (manager.canHandle(spec)) {
        return manager;
      }
    }

    // Fall back to noop
    return this.managers.get('noop')!;
  }

  list(): string[] {
    return [...this.managers.keys()];
  }
}

// Singleton instance
export const deliveryRegistry = new DefaultDeliveryManagerRegistry();
```

---

### 4.3.5 Update Existing Delivery Coordinator

**File Modified**: `packages/server/src/delivery/coordinator.ts`

**Change Description**:

The v0.2.24 DeliveryCoordinator should delegate to the appropriate DeliveryManager:

```typescript
class DeliveryCoordinator {
  constructor(private readonly registry: DeliveryManagerRegistry) {}

  async deliver(context: DeliveryContext): Promise<DeliveryResult> {
    const manager = this.registry.get(context.deliverySpec);

    return await manager.deliver(context);
  }
}
```

---

## 4.4 Verification Steps

### Unit Tests

```bash
# Test GitHub delivery manager
pnpm --filter @agentgate/server test -- github-delivery.test.ts

# Test local delivery manager
pnpm --filter @agentgate/server test -- local-delivery.test.ts

# Test registry
pnpm --filter @agentgate/server test -- delivery-registry.test.ts
```

### Integration Tests

```bash
# GitHub integration (requires credentials)
pnpm --filter @agentgate/server test:integration -- --grep "GitHubDelivery"

# Local delivery
pnpm --filter @agentgate/server test:integration -- --grep "LocalDelivery"
```

### Behavior Verification

- [ ] GitHub delivery creates PR correctly
- [ ] CI polling works with timeout
- [ ] Draft to ready conversion works
- [ ] Local delivery commits without push
- [ ] Registry selects correct manager

---

## 4.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/delivery/manager.ts` | Created | DeliveryManager interface |
| `packages/server/src/delivery/github.ts` | Created | GitHubDeliveryManager |
| `packages/server/src/delivery/local.ts` | Created | LocalDeliveryManager |
| `packages/server/src/delivery/registry.ts` | Created | Manager registry |
| `packages/server/src/delivery/coordinator.ts` | Modified | Delegate to registry |
| `packages/server/test/unit/delivery/*.test.ts` | Created | Delivery tests |

---

## 4.6 Dependencies

- **Depends on**: Nothing (can be done in parallel with Thrust 2)
- **Enables**: Thrust 3 (ExecutionEngine uses DeliveryManager)

---

## 4.7 Future: GitLab Support

The interface is designed to easily add GitLab support:

```typescript
class GitLabDeliveryManager implements DeliveryManager {
  readonly name = 'gitlab';

  canHandle(spec: DeliverySpec): boolean {
    return spec.git?.mode === 'gitlab-mr';
  }

  async deliver(context: DeliveryContext): Promise<DeliveryResult> {
    // GitLab-specific implementation
    // Uses GitLab API for MR creation, CI status, etc.
  }
}
```

This would require:
1. GitLab API client configuration
2. MR (Merge Request) creation logic
3. GitLab CI status polling
4. Registration in the registry
