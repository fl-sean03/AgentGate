/**
 * TaskSpec Resolver (v0.2.24)
 *
 * Applies defaults and resolves inheritance for TaskSpec.
 *
 * @module task-spec/resolver
 */

import { createHash } from 'crypto';
import {
  type TaskSpec,
  type TaskSpecSource,
  type ResolvedTaskSpec,
  type GoalSpec,
  type DesiredState,
} from '../types/task-spec.js';
import {
  type ConvergenceSpec,
  type ConvergenceConfig,
  type ConvergenceLimits,
  type ConvergenceStrategyType,
} from '../types/convergence.js';
import { type Gate, type FailurePolicy } from '../types/gate.js';
import {
  type ExecutionSpec,
  type WorkspaceSpec,
  type SandboxSpec,
  type AgentSpec,
} from '../types/execution-spec.js';
import { type DeliverySpec, type GitSpec, type PRSpec } from '../types/delivery-spec.js';

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT VALUES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default convergence configuration
 */
export const DEFAULT_CONVERGENCE_CONFIG: Required<ConvergenceConfig> = {
  iterations: 5,
  baseIterations: 3,
  bonusIterations: 2,
  progressThreshold: 0.1,
  convergenceThreshold: 0.05,
  windowSize: 3,
  minIterations: 1,
  promptHotReload: false,
  tuningSignsPath: '',
};

/**
 * Default convergence limits
 */
export const DEFAULT_CONVERGENCE_LIMITS: Required<ConvergenceLimits> = {
  maxIterations: 100,
  maxWallClock: '1h',
  maxCost: '$100',
  maxTokens: 10000000,
};

/**
 * Default failure policy for gates
 */
export const DEFAULT_FAILURE_POLICY: FailurePolicy = {
  action: 'iterate',
  maxAttempts: 10,
  feedback: 'auto',
};

/**
 * Default git spec
 */
export const DEFAULT_GIT_SPEC: Partial<GitSpec> = {
  mode: 'local',
  branchPrefix: 'agentgate/',
  commitPrefix: '[AgentGate]',
  autoCommit: true,
  autoPush: false,
  signCommits: false,
};

/**
 * Default agent spec
 */
export const DEFAULT_AGENT_SPEC: Partial<AgentSpec> = {
  driver: 'claude-code-subscription',
  maxTokens: 200000,
  temperature: 0,
};

/**
 * Default sandbox spec
 */
export const DEFAULT_SANDBOX_SPEC: SandboxSpec = {
  provider: 'docker',
  network: 'bridge',
};

// ═══════════════════════════════════════════════════════════════════════════
// RESOLVER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for resolving TaskSpec
 */
export interface ResolveOptions {
  /** Source of the TaskSpec */
  source?: TaskSpecSource;
  /** Override specific fields */
  overrides?: Partial<TaskSpecOverrides>;
}

/**
 * Fields that can be overridden during resolution
 */
export interface TaskSpecOverrides {
  maxIterations?: number;
  maxWallClock?: string;
  strategy?: ConvergenceStrategyType;
  driver?: string;
  prompt?: string;
}

/**
 * TaskSpec resolver interface
 */
export interface TaskSpecResolver {
  /** Resolve with defaults and optional overrides */
  resolve(spec: TaskSpec, options?: ResolveOptions): ResolvedTaskSpec;

  /** Compute hash for a TaskSpec */
  computeHash(spec: TaskSpec): string;

  /** Apply defaults to convergence spec */
  resolveConvergence(conv: ConvergenceSpec): ConvergenceSpec;

  /** Apply defaults to execution spec */
  resolveExecution(exec: ExecutionSpec): ExecutionSpec;

  /** Apply defaults to delivery spec */
  resolveDelivery(del: DeliverySpec): DeliverySpec;

  /** Apply defaults to gates */
  resolveGates(gates: Gate[]): Gate[];
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOLVER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a TaskSpec resolver
 */
export function createTaskSpecResolver(): TaskSpecResolver {
  return {
    resolve(spec: TaskSpec, options: ResolveOptions = {}): ResolvedTaskSpec {
      const { source = { type: 'inline' }, overrides = {} } = options;

      // Apply overrides to a mutable copy
      const resolvedSpec = structuredClone(spec);

      // Apply field overrides
      if (overrides.maxIterations !== undefined) {
        resolvedSpec.spec.convergence.limits.maxIterations = overrides.maxIterations;
      }
      if (overrides.maxWallClock !== undefined) {
        resolvedSpec.spec.convergence.limits.maxWallClock = overrides.maxWallClock;
      }
      if (overrides.strategy !== undefined) {
        resolvedSpec.spec.convergence.strategy = overrides.strategy;
      }
      if (overrides.driver !== undefined) {
        resolvedSpec.spec.execution.agent.driver = overrides.driver as ExecutionSpec['agent']['driver'];
      }
      if (overrides.prompt !== undefined) {
        resolvedSpec.spec.goal.prompt = overrides.prompt;
      }

      // Resolve sub-specs with defaults
      const resolvedConvergence = this.resolveConvergence(resolvedSpec.spec.convergence);
      const resolvedExecution = this.resolveExecution(resolvedSpec.spec.execution);
      const resolvedDelivery = this.resolveDelivery(resolvedSpec.spec.delivery);
      const resolvedGates = this.resolveGates(resolvedConvergence.gates);

      // Build final resolved spec
      const finalSpec: TaskSpec = {
        apiVersion: resolvedSpec.apiVersion,
        kind: resolvedSpec.kind,
        metadata: resolvedSpec.metadata,
        spec: {
          goal: resolvedSpec.spec.goal,
          convergence: {
            ...resolvedConvergence,
            gates: resolvedGates,
          },
          execution: resolvedExecution,
          delivery: resolvedDelivery,
        },
      };

      // Compute hash of the final spec
      const hash = this.computeHash(finalSpec);

      return {
        ...finalSpec,
        _resolved: true,
        _hash: hash,
        _resolvedAt: new Date(),
        _source: source,
      };
    },

    computeHash(spec: TaskSpec): string {
      const content = JSON.stringify({
        apiVersion: spec.apiVersion,
        kind: spec.kind,
        metadata: spec.metadata,
        spec: spec.spec,
      });
      return createHash('sha256').update(content).digest('hex').slice(0, 16);
    },

    resolveConvergence(conv: ConvergenceSpec): ConvergenceSpec {
      const config = conv.config || {};
      const limits = conv.limits || {};

      // Apply strategy-specific defaults
      let resolvedConfig: ConvergenceConfig;
      switch (conv.strategy) {
        case 'fixed':
          resolvedConfig = {
            iterations: config.iterations ?? DEFAULT_CONVERGENCE_CONFIG.iterations,
          };
          break;
        case 'hybrid':
          resolvedConfig = {
            baseIterations: config.baseIterations ?? DEFAULT_CONVERGENCE_CONFIG.baseIterations,
            bonusIterations: config.bonusIterations ?? DEFAULT_CONVERGENCE_CONFIG.bonusIterations,
            progressThreshold: config.progressThreshold ?? DEFAULT_CONVERGENCE_CONFIG.progressThreshold,
          };
          break;
        case 'ralph':
          resolvedConfig = {
            convergenceThreshold: config.convergenceThreshold ?? DEFAULT_CONVERGENCE_CONFIG.convergenceThreshold,
            windowSize: config.windowSize ?? DEFAULT_CONVERGENCE_CONFIG.windowSize,
            minIterations: config.minIterations ?? DEFAULT_CONVERGENCE_CONFIG.minIterations,
            promptHotReload: config.promptHotReload ?? DEFAULT_CONVERGENCE_CONFIG.promptHotReload,
            tuningSignsPath: config.tuningSignsPath ?? DEFAULT_CONVERGENCE_CONFIG.tuningSignsPath,
          };
          break;
        default:
          resolvedConfig = config;
      }

      const result: ConvergenceSpec = {
        strategy: conv.strategy,
        config: resolvedConfig,
        gates: conv.gates,
        limits: {
          maxIterations: limits.maxIterations ?? DEFAULT_CONVERGENCE_LIMITS.maxIterations,
          maxWallClock: limits.maxWallClock ?? DEFAULT_CONVERGENCE_LIMITS.maxWallClock,
        },
      };
      if (limits.maxCost) result.limits.maxCost = limits.maxCost;
      if (limits.maxTokens !== undefined) result.limits.maxTokens = limits.maxTokens;
      return result;
    },

    resolveExecution(exec: ExecutionSpec): ExecutionSpec {
      const result: ExecutionSpec = {
        workspace: exec.workspace,
        agent: {
          driver: exec.agent.driver ?? DEFAULT_AGENT_SPEC.driver!,
        },
      };

      // Resolve sandbox if present
      if (exec.sandbox) {
        const sandbox: SandboxSpec = {
          provider: exec.sandbox.provider ?? 'docker',
        };
        if (exec.sandbox.image) sandbox.image = exec.sandbox.image;
        if (exec.sandbox.resources) sandbox.resources = exec.sandbox.resources;
        if (exec.sandbox.network) sandbox.network = exec.sandbox.network;
        else sandbox.network = 'bridge';
        if (exec.sandbox.mounts) sandbox.mounts = exec.sandbox.mounts;
        if (exec.sandbox.environment) sandbox.environment = exec.sandbox.environment;
        if (exec.sandbox.workdir) sandbox.workdir = exec.sandbox.workdir;
        result.sandbox = sandbox;
      }

      // Resolve agent
      if (exec.agent.model) result.agent.model = exec.agent.model;
      if (exec.agent.maxTokens !== undefined) result.agent.maxTokens = exec.agent.maxTokens;
      else if (DEFAULT_AGENT_SPEC.maxTokens !== undefined) result.agent.maxTokens = DEFAULT_AGENT_SPEC.maxTokens;
      if (exec.agent.temperature !== undefined) result.agent.temperature = exec.agent.temperature;
      else if (DEFAULT_AGENT_SPEC.temperature !== undefined) result.agent.temperature = DEFAULT_AGENT_SPEC.temperature;
      if (exec.agent.systemPrompt) result.agent.systemPrompt = exec.agent.systemPrompt;
      if (exec.agent.tools) result.agent.tools = exec.agent.tools;
      if (exec.agent.mcpServers) result.agent.mcpServers = exec.agent.mcpServers;
      if (exec.agent.capabilities) result.agent.capabilities = exec.agent.capabilities;

      return result;
    },

    resolveDelivery(del: DeliverySpec): DeliverySpec {
      const git = del.git;
      const resolvedGit: GitSpec = {
        mode: git.mode ?? 'local',
      };

      if (git.branchPrefix) resolvedGit.branchPrefix = git.branchPrefix;
      else if (DEFAULT_GIT_SPEC.branchPrefix) resolvedGit.branchPrefix = DEFAULT_GIT_SPEC.branchPrefix;
      if (git.branchName) resolvedGit.branchName = git.branchName;
      if (git.commitPrefix) resolvedGit.commitPrefix = git.commitPrefix;
      else if (DEFAULT_GIT_SPEC.commitPrefix) resolvedGit.commitPrefix = DEFAULT_GIT_SPEC.commitPrefix;
      if (git.commitTemplate) resolvedGit.commitTemplate = git.commitTemplate;
      if (git.autoCommit !== undefined) resolvedGit.autoCommit = git.autoCommit;
      else if (DEFAULT_GIT_SPEC.autoCommit !== undefined) resolvedGit.autoCommit = DEFAULT_GIT_SPEC.autoCommit;
      if (git.autoPush !== undefined) resolvedGit.autoPush = git.autoPush;
      else if (DEFAULT_GIT_SPEC.autoPush !== undefined) resolvedGit.autoPush = DEFAULT_GIT_SPEC.autoPush;
      if (git.signCommits !== undefined) resolvedGit.signCommits = git.signCommits;
      else if (DEFAULT_GIT_SPEC.signCommits !== undefined) resolvedGit.signCommits = DEFAULT_GIT_SPEC.signCommits;

      const result: DeliverySpec = { git: resolvedGit };
      if (del.pr) result.pr = del.pr;
      if (del.notifications) result.notifications = del.notifications;

      return result;
    },

    resolveGates(gates: Gate[]): Gate[] {
      return gates.map((gate) => {
        const onFailure: FailurePolicy = {
          action: gate.onFailure.action ?? 'iterate',
        };
        if (gate.onFailure.maxAttempts !== undefined) {
          onFailure.maxAttempts = gate.onFailure.maxAttempts;
        } else if (DEFAULT_FAILURE_POLICY.maxAttempts !== undefined) {
          onFailure.maxAttempts = DEFAULT_FAILURE_POLICY.maxAttempts;
        }
        if (gate.onFailure.feedback !== undefined) {
          onFailure.feedback = gate.onFailure.feedback;
        } else if (DEFAULT_FAILURE_POLICY.feedback !== undefined) {
          onFailure.feedback = DEFAULT_FAILURE_POLICY.feedback;
        }
        if (gate.onFailure.backoff) onFailure.backoff = gate.onFailure.backoff;

        const result: Gate = {
          name: gate.name,
          check: gate.check,
          onFailure,
        };

        if (gate.onSuccess) result.onSuccess = gate.onSuccess;
        if (gate.condition) result.condition = gate.condition;

        return result;
      });
    },
  };
}

/**
 * Default resolver instance
 */
let defaultResolver: TaskSpecResolver | null = null;

/**
 * Get the default TaskSpec resolver
 */
export function getDefaultResolver(): TaskSpecResolver {
  if (!defaultResolver) {
    defaultResolver = createTaskSpecResolver();
  }
  return defaultResolver;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve a TaskSpec with defaults
 */
export function resolveTaskSpec(
  spec: TaskSpec,
  options?: ResolveOptions
): ResolvedTaskSpec {
  return getDefaultResolver().resolve(spec, options);
}

/**
 * Compute hash for a TaskSpec
 */
export function computeTaskSpecHash(spec: TaskSpec): string {
  return getDefaultResolver().computeHash(spec);
}
