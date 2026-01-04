# Automation Thrusts (Phase 4) - Future

---

> **Note:** This phase is planned for after the foundation is stable. These thrusts describe the continuous improvement system that will enable AgentGate to discover and execute tasks autonomously.

---

## Thrust 10: Task Scheduler

### 10.1 Objective

Create a task scheduler that manages a queue of automated improvement tasks.

### 10.2 Background

The scheduler is the brain of the continuous improvement system:
- Receives tasks from discovery plugins
- Prioritizes based on importance and complexity
- Dispatches to worker for execution
- Tracks completion and results

### 10.3 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Task Scheduler                            │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │ Task Queue   │   │ Prioritizer  │   │ Dispatcher   │    │
│  │              │   │              │   │              │    │
│  │ • Pending    │ → │ • Urgency    │ → │ • Rate limit │    │
│  │ • In-progress│   │ • Complexity │   │ • Worker     │    │
│  │ • Completed  │   │ • Dependencies│   │   selection  │    │
│  └──────────────┘   └──────────────┘   └──────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 10.4 Planned Features

#### 10.4.1 Task Queue

```typescript
interface ScheduledTask {
  id: string;
  source: 'github-issue' | 'dependency-update' | 'test-failure' | 'manual';
  priority: 'critical' | 'high' | 'medium' | 'low';
  workOrder: Partial<WorkOrderInput>;
  scheduledAt: Date;
  status: 'pending' | 'dispatched' | 'completed' | 'failed';
  dependencies?: string[];  // Other task IDs that must complete first
  metadata: Record<string, unknown>;
}
```

#### 10.4.2 Priority Algorithm

```typescript
function calculatePriority(task: ScheduledTask): number {
  let score = 0;

  // Source-based scoring
  if (task.source === 'test-failure') score += 100;  // Fix broken tests first
  if (task.source === 'github-issue' && task.metadata.hasLabel('critical')) score += 80;
  if (task.source === 'dependency-update' && task.metadata.securityVulnerability) score += 90;

  // Recency bonus
  const ageHours = (Date.now() - task.scheduledAt.getTime()) / (1000 * 60 * 60);
  score += Math.min(ageHours * 2, 50);  // Cap age bonus at 50

  return score;
}
```

#### 10.4.3 Rate Limiting

- Maximum concurrent tasks: configurable (default 2)
- Cooldown between tasks: configurable (default 5 minutes)
- Daily task limit: configurable (default 10)
- Budget tracking: integration with usage service

### 10.5 Files to Create

| File | Purpose |
|------|---------|
| `packages/scheduler/src/queue.ts` | Task queue management |
| `packages/scheduler/src/prioritizer.ts` | Priority calculation |
| `packages/scheduler/src/dispatcher.ts` | Task dispatch logic |
| `packages/scheduler/src/types.ts` | Type definitions |

---

## Thrust 11: Discovery Plugins

### 11.1 Objective

Create a plugin system that discovers tasks from various sources.

### 11.2 Background

Discovery plugins scan for improvement opportunities:
- GitHub issues labeled for automation
- Outdated dependencies
- Failing tests in CI
- Code quality metrics

### 11.3 Plugin Architecture

```typescript
interface DiscoveryPlugin {
  name: string;
  schedule: string;  // Cron expression
  discover(): Promise<DiscoveredTask[]>;
  validateTask(task: DiscoveredTask): Promise<boolean>;
}

interface DiscoveredTask {
  source: string;
  title: string;
  description: string;
  suggestedWorkOrder: Partial<WorkOrderInput>;
  priority: 'critical' | 'high' | 'medium' | 'low';
  metadata: Record<string, unknown>;
}
```

### 11.4 Planned Plugins

#### 11.4.1 GitHub Issue Plugin

Scans for issues with automation labels:

```typescript
class GitHubIssuePlugin implements DiscoveryPlugin {
  name = 'github-issues';
  schedule = '0 */6 * * *';  // Every 6 hours

  async discover(): Promise<DiscoveredTask[]> {
    const issues = await this.github.listIssues({
      labels: ['good-first-issue', 'automation-candidate'],
      state: 'open',
    });

    return issues.map(issue => ({
      source: 'github-issue',
      title: issue.title,
      description: issue.body,
      suggestedWorkOrder: {
        task: `Fix GitHub issue #${issue.number}: ${issue.title}`,
        context: issue.body,
        verificationLevel: 'L1',
      },
      priority: this.issuePriority(issue),
      metadata: { issueNumber: issue.number },
    }));
  }
}
```

#### 11.4.2 Dependency Update Plugin

Checks for outdated dependencies:

```typescript
class DependencyUpdatePlugin implements DiscoveryPlugin {
  name = 'dependency-updates';
  schedule = '0 2 * * *';  // Daily at 2 AM

  async discover(): Promise<DiscoveredTask[]> {
    const outdated = await this.checkOutdated();

    return outdated.map(dep => ({
      source: 'dependency-update',
      title: `Update ${dep.name} from ${dep.current} to ${dep.latest}`,
      description: `Dependency ${dep.name} has an update available`,
      suggestedWorkOrder: {
        task: `Update dependency ${dep.name} to ${dep.latest}`,
        verificationLevel: 'L1',
      },
      priority: dep.isSecurityUpdate ? 'critical' : 'low',
      metadata: { dependency: dep },
    }));
  }
}
```

#### 11.4.3 Test Failure Plugin

Monitors CI for failing tests:

```typescript
class TestFailurePlugin implements DiscoveryPlugin {
  name = 'test-failures';
  schedule = '*/30 * * * *';  // Every 30 minutes

  async discover(): Promise<DiscoveredTask[]> {
    const runs = await this.github.listWorkflowRuns({
      status: 'failure',
      per_page: 10,
    });

    return runs.map(run => ({
      source: 'test-failure',
      title: `Fix failing tests in ${run.head_branch}`,
      description: `CI run ${run.id} failed`,
      suggestedWorkOrder: {
        task: 'Fix the failing tests in the latest CI run',
        context: await this.getFailureLogs(run),
        verificationLevel: 'L1',
      },
      priority: run.head_branch === 'main' ? 'critical' : 'high',
      metadata: { runId: run.id },
    }));
  }
}
```

### 11.5 Files to Create

| File | Purpose |
|------|---------|
| `packages/scheduler/src/plugins/base.ts` | Plugin interface |
| `packages/scheduler/src/plugins/github-issues.ts` | GitHub issue discovery |
| `packages/scheduler/src/plugins/dependency-updates.ts` | Dependency updates |
| `packages/scheduler/src/plugins/test-failures.ts` | Test failure detection |
| `packages/scheduler/src/plugins/registry.ts` | Plugin registration |

---

## Thrust 12: Continuous Worker

### 12.1 Objective

Create an always-running daemon that executes scheduled tasks and creates PRs for review.

### 12.2 Background

The worker is the execution arm:
- Pulls tasks from scheduler
- Submits work orders to AgentGate
- Monitors execution
- Creates PRs with results
- Reports success/failure

### 12.3 Worker Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Continuous Worker                         │
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Puller   │ →  │ Executor │ →  │ Reporter │              │
│  │          │    │          │    │          │              │
│  │ Get next │    │ Submit   │    │ Create   │              │
│  │ task     │    │ work     │    │ PR or    │              │
│  │          │    │ order    │    │ issue    │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│                       │                                      │
│                       ▼                                      │
│               ┌──────────────┐                              │
│               │ AgentGate    │                              │
│               │ Server       │                              │
│               └──────────────┘                              │
└─────────────────────────────────────────────────────────────┘
```

### 12.4 Worker Loop

```typescript
class ContinuousWorker {
  private running = false;

  async start(): Promise<void> {
    this.running = true;
    logger.info('Continuous worker started');

    while (this.running) {
      try {
        // Check rate limits
        if (await this.isRateLimited()) {
          await this.sleep(60000);
          continue;
        }

        // Get next task
        const task = await this.scheduler.getNextTask();
        if (!task) {
          await this.sleep(30000);
          continue;
        }

        // Execute task
        logger.info({ taskId: task.id }, 'Executing task');
        const result = await this.executeTask(task);

        // Report result
        await this.reportResult(task, result);

      } catch (error) {
        logger.error({ error }, 'Worker loop error');
        await this.sleep(60000);
      }
    }
  }

  private async executeTask(task: ScheduledTask): Promise<ExecutionResult> {
    // Create work order
    const workOrder = await this.agentgate.submitWorkOrder({
      ...task.workOrder,
      metadata: {
        scheduledTaskId: task.id,
        source: task.source,
      },
    });

    // Wait for completion
    return await this.waitForCompletion(workOrder.id);
  }

  private async reportResult(task: ScheduledTask, result: ExecutionResult): Promise<void> {
    if (result.status === 'completed') {
      // Create PR
      await this.createPullRequest(task, result);
    } else {
      // Log failure, maybe create issue
      await this.reportFailure(task, result);
    }
  }
}
```

### 12.5 PR Creation

```typescript
async function createPullRequest(task: ScheduledTask, result: ExecutionResult): Promise<void> {
  const title = `[AutoFix] ${task.title}`;
  const body = `
## Automated Fix

This PR was created automatically by the AgentGate continuous improvement system.

### Task
${task.description}

### Changes Made
${result.summary}

### Verification Results
${result.verificationResults.map(r => `- ${r.gate}: ${r.status}`).join('\n')}

### Agent Output
<details>
<summary>Click to expand</summary>

\`\`\`
${result.agentOutput}
\`\`\`

</details>

---
*This PR requires human review before merging.*
`;

  await github.createPullRequest({
    title,
    body,
    head: result.branch,
    base: 'main',
    labels: ['automated', 'needs-review'],
  });
}
```

### 12.6 Files to Create

| File | Purpose |
|------|---------|
| `packages/worker/src/worker.ts` | Main worker daemon |
| `packages/worker/src/executor.ts` | Task execution |
| `packages/worker/src/reporter.ts` | Result reporting |
| `packages/worker/src/pr-creator.ts` | PR creation |
| `packages/worker/src/index.ts` | Entry point |

---

## Phase 4 Summary

After completing Phase 4 (future), you have:

```
HOME SERVER (Storefront - Extended)
├── AgentGate SaaS Server
│   └── Serving customers
│
├── Task Scheduler
│   ├── Task queue
│   ├── Priority management
│   └── Rate limiting
│
├── Discovery Plugins
│   ├── GitHub issues
│   ├── Dependency updates
│   └── Test failures
│
└── Continuous Worker
    ├── Executes tasks
    ├── Creates PRs
    └── Reports results

RESULT: PRs created automatically for you to review
```

**Capabilities Unlocked:**
- Automatic issue fixing
- Automatic dependency updates
- Automatic test failure fixes
- Human-in-the-loop via PR review
- Budget-controlled automation

---

## Implementation Timeline

Phase 4 is not part of the initial v0.2.31 implementation. It should be tackled after:

1. Phase 1-3 complete and stable
2. SaaS serving real users
3. Usage patterns understood
4. Budget for automated operations established

Estimated effort: 2-4 weeks after Phase 3 stabilization.
