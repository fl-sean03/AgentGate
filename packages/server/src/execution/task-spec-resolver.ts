/**
 * TaskSpec Resolver
 * v0.2.25: Converts WorkOrder + HarnessConfig to ResolvedTaskSpec
 *
 * This module bridges the gap between the existing WorkOrder/HarnessConfig
 * API and the new TaskSpec-based ExecutionEngine.
 */

import { createHash } from 'node:crypto';
import type {
  WorkOrder,
  GatePlan,
  ResolvedTaskSpec,
  TaskSpec,
  TaskSpecSource,
  TaskSpecBody,
} from '../types/index.js';
import type { ResolvedHarnessConfig } from '../types/harness-config.js';

/**
 * Options for resolving a TaskSpec from a WorkOrder
 */
export interface TaskSpecResolverOptions {
  workOrder: WorkOrder;
  harnessConfig: ResolvedHarnessConfig;
  gatePlan: GatePlan;
}

/**
 * Resolve a WorkOrder + HarnessConfig into a ResolvedTaskSpec
 *
 * This function maps the existing AgentGate configuration format
 * to the new TaskSpec format used by the ExecutionEngine.
 */
export function resolveTaskSpec(options: TaskSpecResolverOptions): ResolvedTaskSpec {
  const { workOrder, harnessConfig, gatePlan } = options;

  // Get max iterations from work order or harness config
  const maxIterations = workOrder.maxIterations ??
    (harnessConfig.loopStrategy?.mode === 'fixed'
      ? (harnessConfig.loopStrategy as { maxIterations?: number }).maxIterations
      : 3) ?? 3;

  // Build the spec body with minimal required fields
  // Use unknown first to avoid strict type checking
  const specBody = {
    goal: {
      prompt: workOrder.taskPrompt,
      desiredState: {
        allGatesPassed: true,
      },
    },
    convergence: {
      strategy: 'fixed',
      limits: {
        maxIterations,
        maxWallClock: `${workOrder.maxWallClockSeconds}s`,
      },
      gates: gatePlan.tests.map((test) => ({
        name: test.name ?? 'unnamed-test',
        level: 'L1',
        check: {
          type: 'custom',
          command: test.command,
        },
        onFailure: {
          action: 'iterate',
        },
      })),
    },
    execution: {
      workspace: {
        source: workOrder.workspaceSource.type,
        destPath: '/tmp/workspace',
      },
      agent: {
        driver: 'claude-code',
      },
    },
    delivery: {
      git: {
        commitStrategy: 'per-iteration',
      },
      pr: {
        create: true,
        title: '[AgentGate] ${goal}',
        draft: true,
      },
      ci: {
        wait: workOrder.waitForCI ?? false,
      },
    },
  } as unknown as TaskSpecBody;

  // Assemble the TaskSpec
  const taskSpec: TaskSpec = {
    apiVersion: 'agentgate.io/v1',
    kind: 'TaskSpec',
    metadata: {
      name: workOrder.id,
      labels: {
        'agentgate.io/work-order-id': workOrder.id,
      },
    },
    spec: specBody,
  };

  // Calculate hash
  const hash = createHash('sha256')
    .update(JSON.stringify(taskSpec))
    .digest('hex')
    .slice(0, 16);

  // Determine source
  const source: TaskSpecSource = {
    type: 'legacy-harness',
  };

  // Return resolved TaskSpec
  return {
    ...taskSpec,
    _resolved: true,
    _hash: hash,
    _resolvedAt: new Date(),
    _source: source,
  };
}

/**
 * Extract GatePlan from TaskSpec for verification
 * Returns the original gate plan when available, otherwise builds minimal one.
 */
export function extractGatePlan(taskSpec: ResolvedTaskSpec, originalGatePlan?: GatePlan): GatePlan {
  // If we have the original gate plan, return it
  if (originalGatePlan) {
    return originalGatePlan;
  }

  // Build minimal gate plan from task spec
  const gates = taskSpec.spec.convergence?.gates ?? [];

  return {
    id: `taskspec-${taskSpec._hash}`,
    source: 'default',
    sourceFile: null,
    environment: {
      runtime: 'generic',
      runtimeVersion: null,
      setupCommands: [],
    },
    contracts: {
      requiredFiles: [],
      requiredSchemas: [],
      forbiddenPatterns: [],
      namingConventions: [],
    },
    tests: gates
      .filter((g) => g.check?.type === 'custom')
      .map((g) => ({
        name: g.name,
        command: (g.check as { command?: string })?.command ?? '',
        timeout: 300,
        expectedExit: 0,
      })),
    blackbox: [],
    policy: {
      networkAllowed: false,
      maxRuntimeSeconds: 600,
      maxDiskMb: null,
      disallowedCommands: [],
    },
  };
}
