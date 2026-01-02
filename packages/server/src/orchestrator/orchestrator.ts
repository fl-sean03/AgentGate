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
import type { HarnessConfig, ResolvedHarnessConfig } from '../types/harness-config.js';
import type { LoopStrategy } from '../types/loop-strategy.js';
import { type SpawnLimits } from '../types/spawn.js';
import { executeRun, type RunExecutorOptions } from './run-executor.js';
import { loadRun, getRunStatus } from './run-store.js';
import { workOrderService } from '../control-plane/work-order-service.js';
import { createLogger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';

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

  /**
   * Default harness configuration.
   * Used when work order doesn't specify a profile.
   * (v0.2.16 - Thrust 9)
   */
  defaultHarnessConfig?: Partial<HarnessConfig>;
}

/**
 * Internal orchestrator config with resolved defaults.
 */
interface InternalOrchestratorConfig {
  maxConcurrentRuns: number;
  defaultTimeoutSeconds: number;
  spawnLimits: SpawnLimits;
  enableSpawning: boolean;
  defaultHarnessConfig: Partial<HarnessConfig> | null;
}

/**
 * The main Orchestrator class.
 * Manages work order execution and coordinates all modules.
 */
export class Orchestrator {
  private config: InternalOrchestratorConfig;
  private activeRuns: Map<string, Run> = new Map();

  constructor(config: OrchestratorConfig = {}) {
    const globalConfig = getConfig();

    this.config = {
      maxConcurrentRuns: config.maxConcurrentRuns ?? globalConfig.maxConcurrentRuns,
      defaultTimeoutSeconds: config.defaultTimeoutSeconds ?? globalConfig.defaultTimeoutSeconds,
      spawnLimits: config.spawnLimits ?? {
        maxDepth: globalConfig.maxSpawnDepth,
        maxChildren: globalConfig.maxChildrenPerParent,
        maxTotalDescendants: globalConfig.maxTreeSize,
      },
      enableSpawning: config.enableSpawning ?? true,
      defaultHarnessConfig: config.defaultHarnessConfig ?? null,
    };

    log.info(
      {
        maxConcurrentRuns: this.config.maxConcurrentRuns,
        defaultTimeoutSeconds: this.config.defaultTimeoutSeconds,
        spawnLimits: this.config.spawnLimits,
        hasDefaultHarnessConfig: !!this.config.defaultHarnessConfig,
      },
      'Orchestrator initialized with configuration'
    );
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
    const { createGitHubClient, getGitHubConfigFromEnv, createPullRequest, convertDraftToReady, pollCIStatus, parseCIFailures } = await import('../workspace/github.js');
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
    let lease: Awaited<ReturnType<typeof acquire>>;
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

      // Acquire lease with duration matching work order's max wall clock time
      const leaseDuration = Math.min(
        workOrder.maxWallClockSeconds * 1000,
        24 * 60 * 60 * 1000  // Cap at 24 hours
      );
      lease = await acquire(workspace.id, workOrder.id, leaseDuration);
      if (!lease) {
        throw new Error(`Failed to acquire lease for workspace ${workspace.id}`);
      }
      log.info({ workspaceId: workspace.id, leaseId: lease.id, expiresAt: lease.expiresAt }, 'Workspace acquired');
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

        // Create run branch with hierarchical naming for tree structures (v0.2.10)
        let runBranchName: string;
        if (workOrder.parentId) {
          // Child work order - use hierarchical naming: agentgate/<rootId>/<workOrderId>
          const rootId = workOrder.rootId ?? workOrder.id;
          runBranchName = `agentgate/${rootId}/${workOrder.id}`;
        } else {
          // Root work order - use simple naming: agentgate/<workOrderId>
          runBranchName = `agentgate/${workOrder.id}`;
        }
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

    // Resolve harness configuration and create loop strategy (v0.2.16 - Thrust 9)
    let harnessConfig: ResolvedHarnessConfig;
    let loopStrategy: LoopStrategy;
    try {
      const { resolveHarnessConfig, createDefaultConfig } = await import('../harness/config-resolver.js');
      const { createStrategy } = await import('../harness/strategy-registry.js');

      // Build CLI overrides from work order options
      const cliOverrides: Partial<HarnessConfig> = {};
      // Handle loop strategy mode and max iterations (v0.2.16 - Thrust 10)
      if (workOrder.loopStrategyMode ?? workOrder.maxIterations) {
        const strategyMode = workOrder.loopStrategyMode ?? 'fixed';
        cliOverrides.loopStrategy = {
          mode: strategyMode,
          // Pass maxIterations if specified - different strategies use different field names
          ...(workOrder.maxIterations && strategyMode === 'fixed' ? { maxIterations: workOrder.maxIterations } : {}),
          ...(workOrder.maxIterations && strategyMode === 'hybrid' ? { baseIterations: workOrder.maxIterations } : {}),
          ...(workOrder.maxIterations && strategyMode === 'ralph' ? { maxIterations: workOrder.maxIterations } : {}),
          completionDetection: ['verification_pass'],
        } as HarnessConfig['loopStrategy'];
      }

      // Resolve harness config using:
      // 1. Profile name from work order (if any)
      // 2. Default harness config from orchestrator
      // 3. CLI overrides from work order (loopStrategyMode, maxIterations)
      const hasProfile = workOrder.harnessProfile != null;
      const hasDefaultConfig = this.config.defaultHarnessConfig != null;
      const hasOverrides = Object.keys(cliOverrides).length > 0 || workOrder.loopStrategyMode != null;
      if (hasProfile || hasDefaultConfig || hasOverrides) {
        const resolveOptions: {
          profileName?: string;
          cliOverrides?: Partial<HarnessConfig>;
        } = {
          cliOverrides: {
            ...(this.config.defaultHarnessConfig ?? {}),
            ...cliOverrides,
          },
        };
        if (workOrder.harnessProfile) {
          resolveOptions.profileName = workOrder.harnessProfile;
        }
        harnessConfig = await resolveHarnessConfig(resolveOptions);
      } else {
        // No profile or overrides - use defaults
        harnessConfig = createDefaultConfig();
      }

      // Create loop strategy from config
      loopStrategy = await createStrategy(harnessConfig.loopStrategy);

      log.info(
        {
          strategyMode: loopStrategy.mode,
          strategyName: loopStrategy.name,
          hasProfile: !!workOrder.harnessProfile,
        },
        'Harness configuration resolved and loop strategy created'
      );
    } catch (error) {
      log.error({ error, workOrderId: workOrder.id }, 'Failed to resolve harness configuration');
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
      harnessConfig, // v0.2.16 - Thrust 9
      loopStrategy,  // v0.2.16 - Thrust 9
      leaseId: lease.id, // Pass lease ID for periodic renewal (v0.2.10 - Thrust 12)
      maxWallClockMs: workOrder.maxWallClockSeconds * 1000, // v0.2.23 - Wave 1.4: Work Order Timeout Enforcement

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

          // Build result now includes full agentResult for persistence (v0.2.19 - Thrust 1)
          const buildResult: {
            sessionId: string;
            success: boolean;
            error?: string;
            agentResult?: typeof result;
          } = {
            sessionId: result.sessionId ?? randomUUID(),
            success: result.success,
            agentResult: result,
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
          skip: workOrder.skipVerification ?? [], // v0.2.15: Allow skipping verification levels
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

        // Create PR as draft initially - will be converted to ready after CI passes
        const pr = await createPullRequest(client, {
          owner,
          repo,
          title: prTitle,
          body: prBody,
          head: gitHubBranch,
          base: 'main',
          draft: true,
        });

        return {
          prUrl: pr.url,
          prNumber: pr.number,
        };
      };

      // Only enable CI polling if waitForCI is true
      if (workOrder.waitForCI) {
        executorOptions.onPollCI = async (_ws, run, _prUrl, branchRef): Promise<{ success: boolean; feedback?: string }> => {
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
            log.warn({ runId: run.id }, 'Workspace is not GitHub-backed, skipping CI polling');
            return { success: true };
          }

          try {
            log.info({ runId: run.id, owner, repo, ref: branchRef }, 'Polling CI status');

            // Poll for CI completion (30 min timeout)
            const ciStatus = await pollCIStatus(client, owner, repo, branchRef, {
              pollIntervalMs: 30_000, // 30 seconds
              timeoutMs: 30 * 60 * 1000, // 30 minutes
            });

            log.info(
              {
                runId: run.id,
                status: ciStatus.status,
                conclusion: ciStatus.conclusion,
                totalChecks: ciStatus.totalCount,
                passed: ciStatus.allPassed,
              },
              'CI polling completed'
            );

            if (ciStatus.allPassed) {
              // Convert draft PR to ready for review now that CI has passed
              if (run.gitHubPrNumber) {
                try {
                  log.info({ runId: run.id, prNumber: run.gitHubPrNumber }, 'Converting draft PR to ready for review');
                  await convertDraftToReady(client, owner, repo, run.gitHubPrNumber);
                  log.info({ runId: run.id, prNumber: run.gitHubPrNumber }, 'PR marked as ready for review');
                } catch (error) {
                  // Log but don't fail - PR is still valid even if we can't convert it
                  log.warn({ runId: run.id, prNumber: run.gitHubPrNumber, error }, 'Failed to convert draft PR to ready');
                }
              }
              return { success: true };
            } else {
              // Generate feedback from CI failures
              const feedback = parseCIFailures(ciStatus);
              return { success: false, feedback };
            }
          } catch (error) {
            log.error({ runId: run.id, error }, 'CI polling failed');
            throw error;
          }
        };
      }
    }

    // Execute the run and track it
    let run: Run | undefined;
    try {
      // Execute the run
      run = await executeRun(executorOptions);

      // Add to active runs tracking AFTER we have the run ID
      this.activeRuns.set(run.id, run);

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

      // Remove from active runs tracking using the correct ID
      if (run) {
        this.activeRuns.delete(run.id);
      }
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

  /**
   * Get current configuration (for health endpoint)
   */
  getConfiguration(): InternalOrchestratorConfig {
    return { ...this.config };
  }

  /**
   * Get current stats (for health endpoint)
   */
  getStats(): { activeRuns: number; maxConcurrentRuns: number } {
    return {
      activeRuns: this.activeRuns.size,
      maxConcurrentRuns: this.config.maxConcurrentRuns,
    };
  }
}

/**
 * Create an orchestrator instance.
 */
export function createOrchestrator(config?: OrchestratorConfig): Orchestrator {
  return new Orchestrator(config);
}
