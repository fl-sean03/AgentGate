/**
 * Main Orchestrator.
 * Coordinates all modules to execute work orders.
 */

import { randomUUID } from 'node:crypto';
import {
  type WorkOrder,
  type Run,
  type GatePlan,
  type Workspace,
  type AgentRequest,
  WorkspaceTemplate,
} from '../types/index.js';
import { type SpawnLimits } from '../types/spawn.js';
import { executeRun, type RunExecutorOptions } from './run-executor.js';
import { loadRun, getRunStatus } from './run-store.js';
import { workOrderService } from '../control-plane/work-order-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('orchestrator');

/**
 * Orchestrator configuration.
 */
export interface OrchestratorConfig {
  /**
   * Maximum concurrent runs.
   */
  maxConcurrentRuns?: number;

  /**
   * Default timeout for runs in seconds.
   */
  defaultTimeoutSeconds?: number;

  /**
   * Spawn limits for recursive agent spawning.
   * If not provided, defaults will be used.
   */
  spawnLimits?: SpawnLimits;

  /**
   * Enable agent spawning.
   * Default: true
   */
  enableSpawning?: boolean;
}

/**
 * The main Orchestrator class.
 * Manages work order execution and coordinates all modules.
 */
export class Orchestrator {
  private config: Required<OrchestratorConfig>;
  private activeRuns: Map<string, Run> = new Map();

  constructor(config: OrchestratorConfig = {}) {
    this.config = {
      maxConcurrentRuns: config.maxConcurrentRuns ?? 5,
      defaultTimeoutSeconds: config.defaultTimeoutSeconds ?? 3600,
      spawnLimits: config.spawnLimits ?? {
        maxDepth: 3,
        maxChildren: 10,
        maxTotalDescendants: 100,
      },
      enableSpawning: config.enableSpawning ?? true,
    };
  }

  /**
   * Execute a work order.
   * This is the main entry point for running a task.
   */
  async execute(workOrder: WorkOrder): Promise<Run> {
    log.info(
      {
        workOrderId: workOrder.id,
        taskPrompt: workOrder.taskPrompt.slice(0, 100),
        maxIterations: workOrder.maxIterations,
      },
      'Starting work order execution'
    );

    // Check concurrent run limit
    if (this.activeRuns.size >= this.config.maxConcurrentRuns) {
      throw new Error(
        `Maximum concurrent runs (${this.config.maxConcurrentRuns}) reached`
      );
    }

    // Import modules dynamically to avoid circular dependencies
    const {
      create,
      createFromGit,
      createFresh,
      createFromGitHub,
      createGitHubRepo,
      syncWithGitHub,
      isGitHubWorkspace,
    } = await import('../workspace/manager.js');
    const {
      getDefaultSeedFiles,
      getMinimalSeedFiles,
      getTypeScriptSeedFiles,
      getPythonSeedFiles,
    } = await import('../workspace/templates.js');
    const { acquire, release } = await import('../workspace/lease.js');
    const { resolveGatePlan } = await import('../gate/resolver.js');
    const { createBranch, checkout, stageAll, commit, push } = await import('../workspace/git-ops.js');
    const { createGitHubClient, getGitHubConfigFromEnv, createPullRequest } = await import('../workspace/github.js');
    const { captureBeforeState, captureAfterState } = await import(
      '../snapshot/snapshotter.js'
    );
    const { verify } = await import('../verifier/verifier.js');
    const { generateFeedback } = await import('../feedback/generator.js');
    const { formatForAgent } = await import('../feedback/formatter.js');
    const { ClaudeCodeDriver } = await import('../agent/claude-code-driver.js');
    const { ClaudeCodeSubscriptionDriver } = await import('../agent/claude-code-subscription-driver.js');
    const { DEFAULT_AGENT_CONSTRAINTS } = await import('../agent/defaults.js');
    const { AgentType } = await import('../types/work-order.js');

    // Create or acquire workspace
    let workspace: Workspace;
    try {
      if (workOrder.workspaceSource.type === 'local') {
        workspace = await create(workOrder.workspaceSource);
      } else if (workOrder.workspaceSource.type === 'git') {
        const gitSource = workOrder.workspaceSource;
        workspace = await createFromGit(
          gitSource.url,
          gitSource.branch ?? 'main'
        );
      } else if (workOrder.workspaceSource.type === 'fresh') {
        const freshSource = workOrder.workspaceSource;

        // Generate seed files with task prompt embedded in CLAUDE.md
        const templateVars = {
          projectName: freshSource.projectName ?? 'Project',
          taskDescription: workOrder.taskPrompt,
        };

        let seedFiles;
        switch (freshSource.template) {
          case WorkspaceTemplate.TYPESCRIPT:
            seedFiles = getTypeScriptSeedFiles(templateVars);
            break;
          case WorkspaceTemplate.PYTHON:
            seedFiles = getPythonSeedFiles(templateVars);
            break;
          case WorkspaceTemplate.MINIMAL:
            seedFiles = getMinimalSeedFiles(templateVars);
            break;
          default:
            seedFiles = getDefaultSeedFiles(templateVars);
        }

        workspace = await createFresh(freshSource.destPath, {
          seedFiles,
          commitMessage: `Initialize workspace for: ${workOrder.taskPrompt.slice(0, 50)}...`,
        });
        log.info({ workspaceId: workspace.id, template: freshSource.template }, 'Fresh workspace created');
      } else if (workOrder.workspaceSource.type === 'github') {
        // GitHub source - clone existing repository
        const gitHubSource = workOrder.workspaceSource;
        workspace = await createFromGitHub(gitHubSource);
        log.info(
          { workspaceId: workspace.id, owner: gitHubSource.owner, repo: gitHubSource.repo },
          'GitHub workspace created from existing repo'
        );
      } else if (workOrder.workspaceSource.type === 'github-new') {
        // GitHub New source - create new repository
        const gitHubNewSource = workOrder.workspaceSource;

        // Generate seed files with task prompt embedded in CLAUDE.md
        const templateVars = {
          projectName: gitHubNewSource.repoName,
          taskDescription: workOrder.taskPrompt,
        };

        let seedFiles;
        switch (gitHubNewSource.template) {
          case WorkspaceTemplate.TYPESCRIPT:
            seedFiles = getTypeScriptSeedFiles(templateVars);
            break;
          case WorkspaceTemplate.PYTHON:
            seedFiles = getPythonSeedFiles(templateVars);
            break;
          case WorkspaceTemplate.MINIMAL:
            seedFiles = getMinimalSeedFiles(templateVars);
            break;
          default:
            seedFiles = getDefaultSeedFiles(templateVars);
        }

        workspace = await createGitHubRepo(gitHubNewSource, { seedFiles });
        log.info(
          { workspaceId: workspace.id, owner: gitHubNewSource.owner, repo: gitHubNewSource.repoName },
          'GitHub workspace created with new repo'
        );
      } else {
        throw new Error(`Unknown workspace source type: ${(workOrder.workspaceSource as { type: string }).type}`);
      }

      // Acquire lease
      await acquire(workspace.id, workOrder.id);
      log.info({ workspaceId: workspace.id }, 'Workspace acquired');
    } catch (error) {
      log.error({ error, workOrderId: workOrder.id }, 'Failed to acquire workspace');
      throw error;
    }

    // Set up GitHub branch for GitHub-backed workspaces
    let gitHubBranch: string | null = null;
    const isGitHub = isGitHubWorkspace(workspace);

    if (isGitHub) {
      try {
        // Pull latest from main
        await syncWithGitHub(workspace);
        log.debug({ workspaceId: workspace.id }, 'Synced with GitHub');

        // Create run branch
        const runBranchName = `agentgate/${workOrder.id}`;
        gitHubBranch = runBranchName;

        // Create and checkout the branch
        await createBranch(workspace.rootPath, runBranchName);
        await checkout(workspace.rootPath, runBranchName);
        log.info({ workspaceId: workspace.id, branch: runBranchName }, 'Created GitHub run branch');

        // Push the branch to establish tracking
        await push(workspace.rootPath, 'origin', runBranchName, { setUpstream: true });
        log.debug({ workspaceId: workspace.id, branch: runBranchName }, 'Pushed run branch to GitHub');
      } catch (error) {
        log.error({ error, workOrderId: workOrder.id }, 'Failed to set up GitHub branch');
        await release(workspace.id);
        throw error;
      }
    }

    // Resolve gate plan
    let gatePlan: GatePlan;
    try {
      gatePlan = await resolveGatePlan(workspace.rootPath, workOrder.gatePlanSource);
      log.info({ gatePlanId: gatePlan.id }, 'Gate plan resolved');
    } catch (error) {
      log.error({ error, workOrderId: workOrder.id }, 'Failed to resolve gate plan');
      await release(workspace.id);
      throw error;
    }

    // Create agent driver based on agent type
    let driver: InstanceType<typeof ClaudeCodeDriver> | InstanceType<typeof ClaudeCodeSubscriptionDriver>;
    if (workOrder.agentType === AgentType.CLAUDE_CODE_SUBSCRIPTION) {
      const subscriptionDriver = new ClaudeCodeSubscriptionDriver();
      const available = await subscriptionDriver.isAvailable();
      if (!available) {
        const subscriptionStatus = subscriptionDriver.getSubscriptionStatus();
        const error = subscriptionStatus?.error ?? 'Subscription not available';
        log.error({ error, workOrderId: workOrder.id }, 'Subscription driver not available');
        await release(workspace.id);
        throw new Error(`Cannot use subscription driver: ${error}`);
      }
      const subscriptionStatus = subscriptionDriver.getSubscriptionStatus();
      log.info(
        {
          subscriptionType: subscriptionStatus?.subscriptionType,
          rateLimitTier: subscriptionStatus?.rateLimitTier,
          billingMethod: 'subscription',
        },
        'Using subscription-based billing'
      );
      driver = subscriptionDriver;
    } else {
      driver = new ClaudeCodeDriver();
      log.info({ billingMethod: 'api' }, 'Using API-based billing');
    }

    // Set up run executor options
    const executorOptions: RunExecutorOptions = {
      workOrder,
      workspace,
      gatePlan,

      onCaptureBeforeState: async (ws) => {
        return captureBeforeState(ws);
      },

      onBuild: async (ws, taskPrompt, feedback, iteration, sessionId) => {
        log.debug(
          { workspaceId: ws.id, iteration, hasFeedback: !!feedback },
          'Building'
        );

        try {
          const { EMPTY_CONTEXT_POINTERS } = await import('../agent/defaults.js');
          const { generateGateSummary } = await import('../gate/summary.js');

          const gatePlanSummary = generateGateSummary(executorOptions.gatePlan);

          const request: AgentRequest = {
            workspacePath: ws.rootPath,
            taskPrompt,
            gatePlanSummary,
            constraints: DEFAULT_AGENT_CONSTRAINTS,
            priorFeedback: feedback,
            contextPointers: EMPTY_CONTEXT_POINTERS,
            timeoutMs: workOrder.maxWallClockSeconds * 1000,
            sessionId: sessionId,
            spawnLimits: this.config.enableSpawning ? this.config.spawnLimits : null,
            workOrderId: workOrder.id,
          };

          const result = await driver.execute(request);

          const buildResult: { sessionId: string; success: boolean; error?: string } = {
            sessionId: result.sessionId ?? randomUUID(),
            success: result.success,
          };
          if (!result.success) {
            buildResult.error = result.stderr || 'Build failed';
          }
          return buildResult;
        } catch (error) {
          log.error({ error, iteration }, 'Build error');
          const errorResult: { sessionId: string; success: boolean; error?: string } = {
            sessionId: sessionId ?? randomUUID(),
            success: false,
          };
          errorResult.error = error instanceof Error ? error.message : String(error);
          return errorResult;
        }
      },

      onSnapshot: async (ws, beforeState, runId, iteration, taskPrompt) => {
        log.debug({ runId, iteration }, 'Capturing snapshot');
        return captureAfterState(ws, beforeState, runId, iteration, taskPrompt);
      },

      onVerify: async (snapshot, plan, runId, iteration) => {
        log.debug({ snapshotId: snapshot.id, iteration }, 'Verifying');
        const report = await verify({
          snapshotPath: workspace.rootPath,
          gatePlan: plan,
          snapshotId: snapshot.id,
          runId,
          iteration,
          cleanRoom: false, // TODO: Make configurable
          timeoutMs: 5 * 60 * 1000, // 5 minute timeout per verification
        });
        return report;
      },

      // eslint-disable-next-line @typescript-eslint/require-await -- Callback interface requires Promise
      onFeedback: async (_snapshot, report, _plan) => {
        log.debug({ passed: report.passed }, 'Generating feedback');
        const structuredFeedback = generateFeedback(report, report.iteration);
        // Convert to string for the agent
        return formatForAgent(structuredFeedback);
      },

      onRunStarted: async (run) => {
        log.info({ runId: run.id, workOrderId: workOrder.id }, 'Run started, updating work order status to RUNNING');
        await workOrderService.markRunning(workOrder.id, run.id);
      },

      onStateChange: (run) => {
        log.debug({ runId: run.id, state: run.state }, 'Run state changed');
      },

      onIterationComplete: (run, iteration) => {
        log.info(
          {
            runId: run.id,
            iteration: iteration.iteration,
            passed: iteration.verificationPassed,
            durationMs: iteration.durationMs,
          },
          'Iteration complete'
        );
      },

    };

    // Add GitHub integration callbacks (v0.2.4)
    if (isGitHub) {
      executorOptions.onPushIteration = async (ws, run, iteration, commitMessage): Promise<void> => {
        // Set the branch name on the run if not already set
        if (!run.gitHubBranch && gitHubBranch) {
          run.gitHubBranch = gitHubBranch;
        }

        // Stage all changes
        await stageAll(ws.rootPath);

        // Commit with the provided message
        await commit(ws.rootPath, commitMessage);

        // Push to the run branch
        if (gitHubBranch) {
          await push(ws.rootPath, 'origin', gitHubBranch);
          log.debug({ runId: run.id, iteration, branch: gitHubBranch }, 'Pushed iteration to GitHub');
        }
      };

      executorOptions.onCreatePullRequest = async (_ws, run, verificationReport): Promise<{ prUrl: string; prNumber: number } | null> => {
        if (!gitHubBranch) {
          log.warn({ runId: run.id }, 'No GitHub branch set, skipping PR creation');
          return null;
        }

        // Get GitHub config and create client
        const config = getGitHubConfigFromEnv();
        const client = createGitHubClient(config);

        // Get owner and repo from workspace source
        let owner: string;
        let repo: string;

        if (workOrder.workspaceSource.type === 'github') {
          owner = workOrder.workspaceSource.owner;
          repo = workOrder.workspaceSource.repo;
        } else if (workOrder.workspaceSource.type === 'github-new') {
          owner = workOrder.workspaceSource.owner;
          repo = workOrder.workspaceSource.repoName;
        } else {
          log.warn({ runId: run.id }, 'Workspace is not GitHub-backed, skipping PR creation');
          return null;
        }

        // Determine highest verification level passed
        const getHighestLevel = (): string => {
          if (verificationReport.l3Result.passed) return 'L3';
          if (verificationReport.l2Result.passed) return 'L2';
          if (verificationReport.l1Result.passed) return 'L1';
          if (verificationReport.l0Result.passed) return 'L0';
          return 'None';
        };

        // Create the PR
        const taskSummary = workOrder.taskPrompt.slice(0, 50);
        const prTitle = `[AgentGate] ${taskSummary}...`;
        const prBody = `## AgentGate Run Summary

**Run ID:** ${run.id}
**Work Order:** ${workOrder.id}
**Iterations:** ${run.iteration}
**Status:** Verification Passed

### Task
${workOrder.taskPrompt}

### Verification Report
- Passed: ${verificationReport.passed}
- Highest Level: ${getHighestLevel()}

---
*This PR was automatically created by AgentGate.*`;

        const pr = await createPullRequest(client, {
          owner,
          repo,
          title: prTitle,
          body: prBody,
          head: gitHubBranch,
          base: 'main',
          draft: false,
        });

        return {
          prUrl: pr.url,
          prNumber: pr.number,
        };
      };
    }

    // Track active run
    const runId = randomUUID();

    try {
      // Execute the run
      const run = await executeRun(executorOptions);
      this.activeRuns.delete(run.id);

      log.info(
        {
          runId: run.id,
          result: run.result,
          iterations: run.iteration,
        },
        'Work order execution complete'
      );

      return run;
    } finally {
      // Always release workspace
      await release(workspace.id);
      this.activeRuns.delete(runId);
    }
  }

  /**
   * Get status of a run.
   */
  async getStatus(runId: string): ReturnType<typeof getRunStatus> {
    return getRunStatus(runId);
  }

  /**
   * Get a run by ID.
   */
  async getRun(runId: string): ReturnType<typeof loadRun> {
    return loadRun(runId);
  }

  /**
   * Get the number of active runs.
   */
  getActiveRunCount(): number {
    return this.activeRuns.size;
  }
}

/**
 * Create an orchestrator instance.
 */
export function createOrchestrator(config?: OrchestratorConfig): Orchestrator {
  return new Orchestrator(config);
}
