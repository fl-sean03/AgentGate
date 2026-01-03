/**
 * Engine Bridge
 * v0.2.26: Bridges Orchestrator callbacks to ExecutionEngine services
 *
 * This module creates PhaseServices from the existing callback-based
 * implementations, allowing the Orchestrator to use ExecutionEngine
 * as the execution backend.
 */

import type { PhaseServices, AgentDriver, Snapshotter, Verifier, FeedbackGenerator, ResultPersister, AgentRequest, SnapshotOptions, VerifyOptions, FeedbackOptions } from '../execution/phases/types.js';
import type { AgentResult, Workspace, Snapshot, VerificationReport, GatePlan, BeforeState, WorkOrder } from '../types/index.js';
import type { SpawnLimits } from '../types/spawn.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('engine-bridge');

/**
 * Options for creating services from orchestrator callbacks
 */
export interface ServiceFactoryOptions {
  /**
   * Agent driver (ClaudeCodeDriver or ClaudeCodeSubscriptionDriver)
   */
  driver: {
    execute: (request: import('../types/index.js').AgentRequest) => Promise<AgentResult>;
  };

  /**
   * Workspace being executed
   */
  workspace: Workspace;

  /**
   * Gate plan for verification
   */
  gatePlan: GatePlan;

  /**
   * Work order being executed
   */
  workOrder: WorkOrder;

  /**
   * Spawn limits for agent (null if spawning disabled)
   */
  spawnLimits: SpawnLimits | null;
}

/**
 * Create an AgentDriver that wraps a ClaudeCodeDriver or SubscriptionDriver
 */
function createAgentDriverFromClaudeCode(
  driver: ServiceFactoryOptions['driver'],
  workOrder: WorkOrder,
  gatePlan: GatePlan,
  spawnLimits: SpawnLimits | null
): AgentDriver {
  return {
    async execute(request: AgentRequest): Promise<AgentResult> {
      // Import defaults lazily to avoid circular deps
      const { EMPTY_CONTEXT_POINTERS, DEFAULT_AGENT_CONSTRAINTS } = await import('../agent/defaults.js');
      const { generateGateSummary } = await import('../gate/summary.js');

      const gatePlanSummary = generateGateSummary(gatePlan);

      const fullRequest: import('../types/index.js').AgentRequest = {
        workspacePath: request.workspacePath,
        taskPrompt: request.taskPrompt,
        priorFeedback: request.feedback,
        timeoutMs: request.timeoutMs ?? workOrder.maxWallClockSeconds * 1000,
        sessionId: request.sessionId,
        contextPointers: EMPTY_CONTEXT_POINTERS,
        gatePlanSummary,
        constraints: DEFAULT_AGENT_CONSTRAINTS,
        spawnLimits,
        workOrderId: workOrder.id,
      };

      log.debug(
        { workOrderId: workOrder.id, iteration: request.iteration },
        'Executing agent via bridge'
      );

      return driver.execute(fullRequest);
    },

    cancel(sessionId: string): Promise<void> {
      // Cancellation is handled via AbortSignal passed to driver.execute()
      // The ExecutionEngine should use AbortController to cancel running agents
      log.warn(
        { sessionId },
        'Cancel called on AgentDriver - cancellation should be handled via AbortSignal'
      );
      return Promise.resolve();
    },
  };
}

/**
 * Create a Snapshotter that uses the captureAfterState function
 */
function createSnapshotterFromWorkspace(workspace: Workspace): Snapshotter {
  return {
    async capture(
      workspacePath: string,
      beforeState: BeforeState,
      options: SnapshotOptions
    ): Promise<Snapshot> {
      const { captureAfterState } = await import('../snapshot/snapshotter.js');

      // Create workspace object with updated path
      const ws: Workspace = {
        ...workspace,
        rootPath: workspacePath,
      };

      log.debug(
        { runId: options.runId, iteration: options.iteration },
        'Capturing snapshot via bridge'
      );

      return captureAfterState(
        ws,
        beforeState,
        options.runId,
        options.iteration,
        options.taskPrompt
      );
    },
  };
}

/**
 * Create a Verifier that uses the verify function
 */
function createVerifierFromWorkspace(
  workspace: Workspace,
  workOrder: WorkOrder
): Verifier {
  return {
    async verify(
      snapshot: Snapshot,
      gatePlan: GatePlan,
      options: VerifyOptions
    ): Promise<VerificationReport> {
      const { verify } = await import('../verifier/verifier.js');

      log.debug(
        { runId: options.runId, iteration: options.iteration, snapshotId: snapshot.id },
        'Verifying via bridge'
      );

      return verify({
        snapshotPath: workspace.rootPath,
        gatePlan,
        snapshotId: snapshot.id,
        runId: options.runId,
        iteration: options.iteration,
        cleanRoom: false,
        timeoutMs: 5 * 60 * 1000, // 5 minutes
        skip: workOrder.skipVerification ?? [],
      });
    },
  };
}

/**
 * Create a FeedbackGenerator that uses the feedback module
 */
function createFeedbackGeneratorFromModule(): FeedbackGenerator {
  return {
    async generate(
      _snapshot: Snapshot,
      report: VerificationReport,
      _gatePlan: GatePlan,
      _options: FeedbackOptions
    ): Promise<string> {
      const { generateFeedback } = await import('../feedback/generator.js');
      const { formatForAgent } = await import('../feedback/formatter.js');

      log.debug(
        { runId: report.runId, iteration: report.iteration, passed: report.passed },
        'Generating feedback via bridge'
      );

      const structured = generateFeedback(report, report.iteration);
      return formatForAgent(structured);
    },
  };
}

/**
 * Create a ResultPersister that uses the result-persister singleton
 */
function createResultPersisterFromSingleton(): ResultPersister {
  return {
    async saveAgentResult(
      runId: string,
      iteration: number,
      result: AgentResult
    ): Promise<string | null> {
      try {
        const { resultPersister } = await import('./result-persister.js');
        return await resultPersister.saveAgentResult(runId, iteration, result);
      } catch (error) {
        log.error({ runId, iteration, error }, 'Failed to save agent result');
        return null;
      }
    },

    async saveVerificationReport(
      runId: string,
      iteration: number,
      report: VerificationReport
    ): Promise<string | null> {
      try {
        const { resultPersister } = await import('./result-persister.js');
        return await resultPersister.saveVerificationReport(runId, iteration, report);
      } catch (error) {
        log.error({ runId, iteration, error }, 'Failed to save verification report');
        return null;
      }
    },

    saveSnapshot(
      _runId: string,
      _iteration: number,
      _snapshot: Snapshot
    ): Promise<string | null> {
      // Snapshots are saved as part of iteration data
      return Promise.resolve(null);
    },
  };
}

/**
 * Create all PhaseServices from orchestrator context
 *
 * This is the main entry point for bridging the Orchestrator's
 * callback-based approach to the ExecutionEngine's service-based approach.
 */
export function createServicesFromCallbacks(
  options: ServiceFactoryOptions
): PhaseServices {
  const { driver, workspace, gatePlan, workOrder, spawnLimits } = options;

  log.info(
    { workOrderId: workOrder.id, workspaceId: workspace.id },
    'Creating services from callbacks'
  );

  return {
    agentDriver: createAgentDriverFromClaudeCode(driver, workOrder, gatePlan, spawnLimits),
    snapshotter: createSnapshotterFromWorkspace(workspace),
    verifier: createVerifierFromWorkspace(workspace, workOrder),
    feedbackGenerator: createFeedbackGeneratorFromModule(),
    resultPersister: createResultPersisterFromSingleton(),
  };
}

/**
 * Capture the initial before state for a run
 */
export async function captureInitialBeforeState(workspace: Workspace): Promise<BeforeState> {
  const { captureBeforeState } = await import('../snapshot/snapshotter.js');
  return captureBeforeState(workspace);
}
