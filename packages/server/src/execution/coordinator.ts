/**
 * Execution Coordinator (v0.2.24)
 *
 * Coordinates task execution using the TaskSpec-based system.
 * Integrates workspace provisioning, convergence control, and gate evaluation.
 *
 * @module execution/coordinator
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import { randomUUID } from 'node:crypto';
import type {
  ResolvedTaskSpec,
  GateResult,
  GateFailure,
  Workspace,
} from '../types/index.js';
import type { Snapshot } from '../types/snapshot.js';
import type { ConvergenceResult } from '../types/convergence.js';
import {
  createConvergenceController,
  type ConvergenceController,
  type ConvergenceContext,
  type BuildResult,
} from '../convergence/controller.js';
import { createGatePipeline, type GatePipeline, type PipelineContext } from '../gate/pipeline.js';
import { createWorkspaceProvisioner, type WorkspaceProvisioner } from './workspace-provisioner.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('execution-coordinator');

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Context for task execution
 */
export interface ExecutionContext {
  /** Resolved task specification */
  taskSpec: ResolvedTaskSpec;
  /** Work order ID */
  workOrderId: string;
  /** Run ID */
  runId: string;
}

/**
 * Callbacks for execution events
 */
export interface ExecutionCallbacks {
  /**
   * Called to run the build phase (agent execution)
   * @returns Build result with success status and optional output
   */
  onBuild: (context: BuildContext) => Promise<BuildResult & { output?: string }>;

  /**
   * Called to create a snapshot of current state
   * @returns Snapshot of current workspace state
   */
  onSnapshot: (context: SnapshotContext) => Promise<Snapshot>;

  /**
   * Called when iteration starts
   */
  onIterationStart?: (iteration: number) => Promise<void>;

  /**
   * Called when iteration ends
   */
  onIterationEnd?: (iteration: number, result: IterationResult) => Promise<void>;

  /**
   * Called when execution completes
   */
  onComplete?: (result: ExecutionResult) => Promise<void>;
}

/**
 * Context for build phase
 */
export interface BuildContext {
  taskSpec: ResolvedTaskSpec;
  workOrderId: string;
  runId: string;
  iteration: number;
  workspace: Workspace;
  feedback?: string;
}

/**
 * Context for snapshot creation
 */
export interface SnapshotContext {
  taskSpec: ResolvedTaskSpec;
  workOrderId: string;
  runId: string;
  iteration: number;
  workspace: Workspace;
}

/**
 * Result of a single iteration
 */
export interface IterationResult {
  iteration: number;
  gateResults: GateResult[];
  allPassed: boolean;
  feedback?: string;
}

/**
 * Final execution result
 */
export interface ExecutionResult {
  /** Whether the task converged successfully */
  success: boolean;
  /** Convergence result details */
  convergence: ConvergenceResult;
  /** Total duration in milliseconds */
  duration: number;
  /** Final workspace state */
  workspace?: Workspace;
  /** Error if execution failed */
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COORDINATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execution coordinator - orchestrates task execution
 */
export class ExecutionCoordinator {
  private readonly provisioner: WorkspaceProvisioner;
  private readonly convergenceController: ConvergenceController;
  private readonly gatePipeline: GatePipeline;

  constructor() {
    this.provisioner = createWorkspaceProvisioner();
    this.convergenceController = createConvergenceController();
    this.gatePipeline = createGatePipeline();
  }

  /**
   * Execute a task based on the TaskSpec
   */
  async execute(
    context: ExecutionContext,
    callbacks: ExecutionCallbacks
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { taskSpec, workOrderId, runId } = context;

    log.info({ workOrderId, runId, taskName: taskSpec.metadata.name }, 'Starting task execution');

    // Track execution state
    let workspace: Workspace | undefined;
    let lastSnapshot: Snapshot | undefined;
    let accumulatedFeedback = '';

    try {
      // Provision workspace
      const provisionResult = await this.provisioner.provision(taskSpec.spec.execution.workspace);
      if (!provisionResult.success || !provisionResult.workspace) {
        throw new Error(`Workspace provisioning failed: ${provisionResult.error}`);
      }
      workspace = provisionResult.workspace;

      log.info({ workspaceId: workspace.id, workspacePath: workspace.rootPath }, 'Workspace provisioned');

      // Initialize convergence controller
      await this.convergenceController.initialize(taskSpec.spec.convergence);

      // Capture workspace for closures
      const capturedWorkspace = workspace;

      // Build convergence context
      const convergenceContext: ConvergenceContext = {
        taskSpec,
        workOrderId,
        runId,

        // Build phase callback
        onBuild: async (): Promise<BuildResult> => {
          const buildContext: BuildContext = {
            taskSpec,
            workOrderId,
            runId,
            iteration: this.convergenceController.getProgress().iteration,
            workspace: capturedWorkspace,
          };

          if (accumulatedFeedback) {
            buildContext.feedback = accumulatedFeedback;
            accumulatedFeedback = '';
          }

          const result = await callbacks.onBuild(buildContext);

          // If build includes agent output, store it for convergence strategy
          if (result.output) {
            // The convergence controller can use this for similarity detection
            log.debug({ outputLength: result.output.length }, 'Build phase completed with output');
          }

          return result;
        },

        // Snapshot callback
        onSnapshot: async (): Promise<Snapshot> => {
          const snapshotContext: SnapshotContext = {
            taskSpec,
            workOrderId,
            runId,
            iteration: this.convergenceController.getProgress().iteration,
            workspace: capturedWorkspace,
          };

          lastSnapshot = await callbacks.onSnapshot(snapshotContext);
          return lastSnapshot;
        },

        // Gate check callback
        onGateCheck: async (gate): Promise<GateResult> => {
          if (!lastSnapshot) {
            throw new Error('Snapshot required before gate check');
          }

          const pipelineContext: PipelineContext = {
            taskSpec,
            workOrderId,
            runId,
            iteration: this.convergenceController.getProgress().iteration,
            snapshot: lastSnapshot,
            workspacePath: capturedWorkspace.rootPath,
          };

          return this.gatePipeline.executeSingle(gate, pipelineContext);
        },

        // Feedback callback
        onFeedback: async (failures: GateFailure[]): Promise<string> => {
          const feedback = this.formatFeedback(failures);
          accumulatedFeedback = feedback;
          return feedback;
        },
      };

      // Add optional callbacks if provided
      if (callbacks.onIterationStart) {
        convergenceContext.onIterationStart = callbacks.onIterationStart;
      }

      if (callbacks.onIterationEnd) {
        const userCallback = callbacks.onIterationEnd;
        convergenceContext.onIterationEnd = async (iteration, decision) => {
          const iterationResult: IterationResult = {
            iteration,
            gateResults: Object.values(this.convergenceController.getProgress()),
            allPassed: decision.continue === false && decision.reason.includes('passed'),
          };
          if (accumulatedFeedback) {
            iterationResult.feedback = accumulatedFeedback;
          }
          await userCallback(iteration, iterationResult);
        };
      }

      // Run convergence loop
      const convergenceResult = await this.convergenceController.run(convergenceContext);

      const result: ExecutionResult = {
        success: convergenceResult.status === 'converged',
        convergence: convergenceResult,
        duration: Date.now() - startTime,
        workspace,
      };

      log.info(
        {
          workOrderId,
          success: result.success,
          status: convergenceResult.status,
          iterations: convergenceResult.iterations,
          duration: result.duration,
        },
        'Task execution completed'
      );

      if (callbacks.onComplete) {
        await callbacks.onComplete(result);
      }

      return result;
    } catch (error) {
      log.error({ error, workOrderId }, 'Task execution failed');

      const result: ExecutionResult = {
        success: false,
        convergence: {
          status: 'error',
          iterations: 0,
          finalState: {
            iteration: 0,
            elapsed: Date.now() - startTime,
            gateResults: [],
            history: [],
          },
          gateResults: {},
          reason: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
        },
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };

      // Only include workspace if it was successfully provisioned
      if (workspace) {
        result.workspace = workspace;
      }

      if (callbacks.onComplete) {
        await callbacks.onComplete(result);
      }

      return result;
    }
  }

  /**
   * Stop execution
   */
  async stop(reason: string): Promise<void> {
    log.info({ reason }, 'Stopping execution');
    await this.convergenceController.stop(reason);
  }

  /**
   * Check if execution is running
   */
  isRunning(): boolean {
    return this.convergenceController.isRunning();
  }

  /**
   * Format failures into feedback for the agent
   */
  private formatFeedback(failures: GateFailure[]): string {
    if (failures.length === 0) {
      return '';
    }

    const lines = ['## Gate Check Failures\n'];

    for (const failure of failures) {
      let line = `- ${failure.message}`;
      if (failure.file) {
        line += ` (${failure.file}`;
        if (failure.line !== undefined) {
          line += `:${failure.line}`;
        }
        line += ')';
      }
      lines.push(line);

      if (failure.details) {
        lines.push(`  > ${failure.details}`);
      }
    }

    lines.push('');
    lines.push('Please address the issues above and try again.');

    return lines.join('\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new execution coordinator
 */
export function createExecutionCoordinator(): ExecutionCoordinator {
  return new ExecutionCoordinator();
}
