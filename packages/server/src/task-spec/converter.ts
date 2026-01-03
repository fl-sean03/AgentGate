/**
 * HarnessConfig to TaskSpec Converter (v0.2.24)
 *
 * Converts legacy HarnessConfig + WorkOrder to the new TaskSpec format.
 *
 * @module task-spec/converter
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import {
  type HarnessConfig,
  type LoopStrategyConfig,
  type VerificationConfig,
  type GitOpsConfig,
  type ExecutionLimits,
  type AgentDriverConfig,
  LoopStrategyMode,
  GitOperationMode,
  CompletionDetection,
} from '../types/harness-config.js';
import { type WorkOrder, type WorkspaceSource } from '../types/work-order.js';
import { VerificationLevel } from '../types/verification.js';
import {
  type TaskSpec,
  type TaskMetadata,
  type GoalSpec,
  type TaskSpecSource,
  type ResolvedTaskSpec,
} from '../types/task-spec.js';
import {
  type ConvergenceSpec,
  type ConvergenceConfig,
  type ConvergenceLimits,
  type ConvergenceStrategyType,
} from '../types/convergence.js';
import {
  type Gate,
  type GateCheck,
  type VerificationLevelsCheck,
  type FailurePolicy,
} from '../types/gate.js';
import {
  type ExecutionSpec,
  type WorkspaceSpec,
  type AgentSpec,
  type AgentDriverType,
} from '../types/execution-spec.js';
import { type DeliverySpec, type GitSpec, type PRSpec, type GitModeType } from '../types/delivery-spec.js';
import { resolveTaskSpec } from './resolver.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONVERTER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for conversion
 */
export interface ConvertOptions {
  /** Resolve with defaults after conversion */
  resolve?: boolean;
  /** Add deprecation warnings */
  warnOnDeprecation?: boolean;
}

/**
 * Result of conversion
 */
export interface ConvertResult {
  taskSpec: TaskSpec | ResolvedTaskSpec;
  warnings: string[];
  source: TaskSpecSource;
}

/**
 * HarnessConfig to TaskSpec converter interface
 */
export interface TaskSpecConverter {
  /** Convert HarnessConfig + WorkOrder to TaskSpec */
  fromHarnessConfig(
    harness: HarnessConfig,
    workOrder?: Partial<WorkOrder>,
    options?: ConvertOptions
  ): ConvertResult;

  /** Convert loop strategy to convergence spec */
  convertLoopStrategy(loop: LoopStrategyConfig): Partial<ConvergenceSpec>;

  /** Convert verification config to gates */
  convertVerification(
    verification: VerificationConfig,
    completionDetection?: CompletionDetection[]
  ): Gate[];

  /** Convert git ops to delivery spec */
  convertGitOps(gitOps: GitOpsConfig): DeliverySpec;

  /** Convert agent driver config */
  convertAgentDriver(driver?: AgentDriverConfig): AgentSpec;

  /** Convert execution limits */
  convertExecutionLimits(limits: ExecutionLimits): ConvergenceLimits;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map legacy loop strategy mode to convergence strategy
 */
const STRATEGY_MAP: Record<LoopStrategyMode, ConvergenceStrategyType> = {
  [LoopStrategyMode.FIXED]: 'fixed',
  [LoopStrategyMode.HYBRID]: 'hybrid',
  [LoopStrategyMode.RALPH]: 'ralph',
  [LoopStrategyMode.CUSTOM]: 'manual',
};

/**
 * Map legacy git operation mode to delivery git mode
 */
const GIT_MODE_MAP: Record<GitOperationMode, GitModeType> = {
  [GitOperationMode.LOCAL]: 'local',
  [GitOperationMode.PUSH_ONLY]: 'push',
  [GitOperationMode.GITHUB_PR]: 'github-pr',
};

/**
 * Map legacy agent driver type
 */
const DRIVER_MAP: Record<string, AgentDriverType> = {
  'claude-code-api': 'claude-code-api',
  'claude-code-subscription': 'claude-code-subscription',
  'claude-agent-sdk': 'claude-agent-sdk',
};

// ═══════════════════════════════════════════════════════════════════════════
// CONVERTER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a TaskSpec converter
 */
export function createTaskSpecConverter(): TaskSpecConverter {
  return {
    fromHarnessConfig(
      harness: HarnessConfig,
      workOrder: Partial<WorkOrder> = {},
      options: ConvertOptions = {}
    ): ConvertResult {
      const { resolve = true, warnOnDeprecation = true } = options;
      const warnings: string[] = [];

      if (warnOnDeprecation) {
        warnings.push(
          'HarnessConfig is deprecated. Consider migrating to TaskSpec format.'
        );
      }

      // Extract metadata
      const metadata: TaskMetadata = {
        name: workOrder.id || 'unnamed-task',
      };
      if (harness.metadata) {
        metadata.labels = harness.metadata as Record<string, string>;
      }

      // Convert goal
      const goal: GoalSpec = {
        prompt: workOrder.taskPrompt || '',
      };

      // Convert convergence
      const convergenceParts = this.convertLoopStrategy(harness.loopStrategy);
      const gates = this.convertVerification(
        harness.verification,
        'completionDetection' in harness.loopStrategy
          ? harness.loopStrategy.completionDetection
          : undefined
      );

      // Handle waitForCI from work order
      if (workOrder.waitForCI) {
        gates.push({
          name: 'ci',
          check: {
            type: 'github-actions',
            timeout: '30m',
          },
          onFailure: {
            action: 'iterate',
            maxAttempts: 3,
            feedback: 'auto',
          },
        });
      }

      const limits = this.convertExecutionLimits(harness.executionLimits);

      // Override max iterations from work order if provided
      if (workOrder.maxIterations) {
        limits.maxIterations = workOrder.maxIterations;
      }

      const convergence: ConvergenceSpec = {
        strategy: convergenceParts.strategy || 'hybrid',
        gates,
        limits,
      };
      if (convergenceParts.config && Object.keys(convergenceParts.config).length > 0) {
        convergence.config = convergenceParts.config;
      }

      // Convert execution
      const workspace = convertWorkspaceSource(workOrder);
      const agent = this.convertAgentDriver(harness.agentDriver);

      const execution: ExecutionSpec = {
        workspace,
        agent,
      };

      // Convert delivery
      const delivery = this.convertGitOps(harness.gitOps);

      // Build TaskSpec
      const taskSpec: TaskSpec = {
        apiVersion: 'agentgate.io/v1',
        kind: 'TaskSpec',
        metadata,
        spec: {
          goal,
          convergence,
          execution,
          delivery,
        },
      };

      const source: TaskSpecSource = { type: 'legacy-harness' };

      if (resolve) {
        return {
          taskSpec: resolveTaskSpec(taskSpec, { source }),
          warnings,
          source,
        };
      }

      return {
        taskSpec,
        warnings,
        source,
      };
    },

    convertLoopStrategy(loop: LoopStrategyConfig): Partial<ConvergenceSpec> {
      const strategy = STRATEGY_MAP[loop.mode] || 'hybrid';
      let config: ConvergenceConfig = {};

      switch (loop.mode) {
        case LoopStrategyMode.FIXED:
          config = {
            iterations: loop.maxIterations,
          };
          break;

        case LoopStrategyMode.HYBRID:
          config = {
            baseIterations: loop.baseIterations,
            bonusIterations: loop.maxBonusIterations,
            progressThreshold: loop.progressThreshold,
          };
          break;

        case LoopStrategyMode.RALPH:
          config = {
            convergenceThreshold: loop.convergenceThreshold,
            windowSize: loop.windowSize,
            minIterations: loop.minIterations,
          };
          break;

        case LoopStrategyMode.CUSTOM:
          // Custom strategies become manual in the new system
          break;
      }

      return {
        strategy,
        config,
      };
    },

    convertVerification(
      verification: VerificationConfig,
      completionDetection?: CompletionDetection[]
    ): Gate[] {
      const gates: Gate[] = [];
      type SkipLevel = 'lint' | 'typecheck' | 'test' | 'blackbox' | 'contracts';
      const skipLevels = new Set<SkipLevel>(verification.skipLevels as SkipLevel[]);

      // Map skip levels to verification levels
      const levelMapping: Record<SkipLevel, ('L0' | 'L1' | 'L2' | 'L3')[]> = {
        lint: ['L0'],
        typecheck: ['L0'],
        test: ['L2'],
        blackbox: ['L3'],
        contracts: ['L1'],
      };

      // Determine which levels to include
      const allLevels: ('L0' | 'L1' | 'L2' | 'L3')[] = ['L0', 'L1', 'L2', 'L3'];
      const includedLevels = allLevels.filter((level) => {
        for (const [skipKey, mappedLevels] of Object.entries(levelMapping)) {
          if (skipLevels.has(skipKey as SkipLevel) && mappedLevels.includes(level)) {
            return false;
          }
        }
        return true;
      });

      if (includedLevels.length > 0) {
        const check: VerificationLevelsCheck = {
          type: 'verification-levels',
          levels: includedLevels,
          timeout: verification.timeoutMs,
        };

        gates.push({
          name: 'local-verify',
          check,
          onFailure: {
            action: 'iterate',
            maxAttempts: verification.maxRetries || 10,
            feedback: 'auto',
          },
        });
      }

      // Add loop detection gate if configured
      if (completionDetection?.includes(CompletionDetection.LOOP_DETECTION)) {
        gates.push({
          name: 'loop-detection',
          check: {
            type: 'convergence',
            strategy: 'similarity',
            threshold: 0.95,
          },
          onFailure: {
            action: 'stop',
          },
        });
      }

      return gates;
    },

    convertGitOps(gitOps: GitOpsConfig): DeliverySpec {
      const gitMode = GIT_MODE_MAP[gitOps.mode] || 'local';

      const git: GitSpec = {
        mode: gitMode,
        branchPrefix: gitOps.branchPrefix,
        commitPrefix: gitOps.commitMessagePrefix,
        autoCommit: gitOps.autoCommit,
        autoPush: gitOps.autoPush,
      };

      const delivery: DeliverySpec = { git };

      // Add PR spec if configured
      if (gitOps.createPR) {
        delivery.pr = {
          create: true,
          draft: gitOps.prDraft,
          reviewers: gitOps.prReviewers,
          labels: gitOps.prLabels,
        };
      }

      return delivery;
    },

    convertAgentDriver(driver?: AgentDriverConfig): AgentSpec {
      if (!driver) {
        return {
          driver: 'claude-code-subscription',
        };
      }

      const spec: AgentSpec = {
        driver: DRIVER_MAP[driver.type] || 'claude-code-subscription',
      };

      if (driver.model) spec.model = driver.model;
      if (driver.maxTokens !== undefined) spec.maxTokens = driver.maxTokens;
      if (driver.temperature !== undefined) spec.temperature = driver.temperature;
      if (driver.systemPrompt) spec.systemPrompt = driver.systemPrompt;
      if (driver.tools) spec.tools = driver.tools.map((t) => ({ name: t }));
      if (driver.mcpServers) spec.mcpServers = driver.mcpServers as Record<string, { command: string }>;

      return spec;
    },

    convertExecutionLimits(limits: ExecutionLimits): ConvergenceLimits {
      const result: ConvergenceLimits = {
        maxIterations: 100, // Default, can be overridden by loop strategy
        maxWallClock: `${limits.maxWallClockSeconds}s`,
      };
      if (limits.maxTotalTokens !== undefined) {
        result.maxTokens = limits.maxTotalTokens;
      }
      return result;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert work order workspace source to WorkspaceSpec
 */
function convertWorkspaceSource(workOrder: Partial<WorkOrder>): WorkspaceSpec {
  const source = workOrder.workspaceSource;

  if (!source) {
    // Default to fresh workspace
    return {
      source: 'fresh',
      destPath: '/tmp/agentgate-workspace',
    };
  }

  switch (source.type) {
    case 'local':
      return {
        source: 'local',
        path: source.path,
      };

    case 'git': {
      const result: WorkspaceSpec = {
        source: 'git',
        url: source.url,
      };
      if (source.branch) (result as import('../types/execution-spec.js').GitWorkspace).ref = source.branch;
      return result;
    }

    case 'github': {
      const result: WorkspaceSpec = {
        source: 'github',
        owner: source.owner,
        repo: source.repo,
      };
      if (source.branch) (result as import('../types/execution-spec.js').GitHubWorkspace).ref = source.branch;
      return result;
    }

    case 'github-new': {
      const result: import('../types/execution-spec.js').GitHubNewWorkspace = {
        source: 'github-new',
        owner: source.owner,
        repoName: source.repoName,
      };
      if (source.private !== undefined) result.private = source.private;
      if (source.template) result.template = source.template;
      return result;
    }

    case 'fresh': {
      const result: import('../types/execution-spec.js').FreshWorkspace = {
        source: 'fresh',
        destPath: source.destPath || '/tmp/agentgate-workspace',
      };
      if (source.template) result.template = mapWorkspaceTemplate(source.template);
      if (source.projectName) result.projectName = source.projectName;
      return result;
    }

    default:
      return {
        source: 'fresh',
        destPath: '/tmp/agentgate-workspace',
      };
  }
}

/**
 * Map legacy workspace template to new template type
 */
function mapWorkspaceTemplate(
  template: import('../types/work-order.js').WorkspaceTemplate
): import('../types/execution-spec.js').WorkspaceTemplateType {
  const mapping: Record<
    import('../types/work-order.js').WorkspaceTemplate,
    import('../types/execution-spec.js').WorkspaceTemplateType
  > = {
    minimal: 'empty',
    typescript: 'node-typescript',
    python: 'python',
  };
  return mapping[template] || 'empty';
}

/**
 * Default converter instance
 */
let defaultConverter: TaskSpecConverter | null = null;

/**
 * Get the default TaskSpec converter
 */
export function getDefaultConverter(): TaskSpecConverter {
  if (!defaultConverter) {
    defaultConverter = createTaskSpecConverter();
  }
  return defaultConverter;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert HarnessConfig + WorkOrder to TaskSpec
 */
export function convertHarnessToTaskSpec(
  harness: HarnessConfig,
  workOrder?: Partial<WorkOrder>,
  options?: ConvertOptions
): ConvertResult {
  return getDefaultConverter().fromHarnessConfig(harness, workOrder, options);
}

/**
 * Quick migration helper - creates minimal TaskSpec from work order
 */
export function createMinimalTaskSpec(
  workOrder: Partial<WorkOrder>,
  harness?: HarnessConfig
): TaskSpec {
  const converter = getDefaultConverter();

  if (harness) {
    const result = converter.fromHarnessConfig(harness, workOrder, { resolve: false });
    return result.taskSpec as TaskSpec;
  }

  // Create minimal TaskSpec without harness
  return {
    apiVersion: 'agentgate.io/v1',
    kind: 'TaskSpec',
    metadata: {
      name: workOrder.id || 'unnamed-task',
    },
    spec: {
      goal: {
        prompt: workOrder.taskPrompt || '',
      },
      convergence: {
        strategy: 'hybrid',
        gates: [
          {
            name: 'local-verify',
            check: {
              type: 'verification-levels',
              levels: ['L0', 'L1'],
            },
            onFailure: {
              action: 'iterate',
            },
          },
        ],
        limits: {
          maxIterations: workOrder.maxIterations || 10,
        },
      },
      execution: {
        workspace: convertWorkspaceSource(workOrder),
        agent: {
          driver: 'claude-code-subscription',
        },
      },
      delivery: {
        git: {
          mode: 'local',
        },
      },
    },
  };
}
