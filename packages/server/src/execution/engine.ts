/**
 * Execution Engine
 * v0.2.25: Unified execution engine for work order processing
 *
 * Replaces both executeRun() and ExecutionCoordinator with a single,
 * well-structured execution path.
 *
 * Key responsibilities:
 * - Orchestrate phase handlers
 * - Manage state machine transitions
 * - Handle timeouts and cancellation
 * - Coordinate delivery
 * - Emit progress events
 */

import { randomUUID } from 'node:crypto';
import {
  type ExecutionContext,
  type ExecutionState,
  type ExecutionStatus,
  type ExecutionInput,
  type ExecutionResult,
  type ExecutionMetrics,
  type ExecutionEngineConfig,
  type IterationData,
  createDefaultEngineConfig,
} from './context.js';
import {
  PhaseOrchestrator,
  type PhaseContext,
  type IterationInput,
  Phase,
} from './phases/index.js';
import {
  applyTransition,
  isTerminalState,
  getResultForEvent,
} from '../orchestrator/state-machine.js';
import { createRun, saveRun, saveIterationData } from '../orchestrator/run-store.js';
import { RunEvent, RunResult, RunState, type Run, type BeforeState } from '../types/index.js';
import { getProgressEmitter } from '../observability/progress-emitter.js';
import { getMetricsCollector } from '../observability/metrics-collector.js';
import { createLogger } from '../utils/logger.js';
import type { Logger } from 'pino';

const log = createLogger('execution-engine');

/**
 * Execution Engine Interface
 */
export interface ExecutionEngine {
  /**
   * Execute a work order to completion
   */
  execute(input: ExecutionInput): Promise<ExecutionResult>;

  /**
   * Cancel a running execution
   */
  cancel(runId: string, reason: string): Promise<void>;

  /**
   * Get status of running execution
   */
  getStatus(runId: string): ExecutionStatus | null;

  /**
   * Get count of active executions
   */
  getActiveCount(): number;
}

/**
 * Concurrency limit error
 */
export class ConcurrencyLimitError extends Error {
  constructor(limit: number) {
    super(`Concurrency limit of ${limit} reached`);
    this.name = 'ConcurrencyLimitError';
  }
}

/**
 * Run not found error
 */
export class RunNotFoundError extends Error {
  constructor(runId: string) {
    super(`Run not found: ${runId}`);
    this.name = 'RunNotFoundError';
  }
}

/**
 * Default Execution Engine Implementation
 */
export class DefaultExecutionEngine implements ExecutionEngine {
  private readonly activeRuns = new Map<string, ExecutionState>();
  private readonly config: ExecutionEngineConfig;
  private readonly phaseOrchestrator: PhaseOrchestrator;
  private readonly logger: Logger;

  constructor(config: Partial<ExecutionEngineConfig> = {}) {
    this.config = { ...createDefaultEngineConfig(), ...config };
    this.phaseOrchestrator = new PhaseOrchestrator();
    this.logger = createLogger('execution-engine');
  }

  /**
   * Execute a work order to completion
   */
  async execute(input: ExecutionInput): Promise<ExecutionResult> {
    const { workOrder, taskSpec, leaseId, services: inputServices, workspace: inputWorkspace, gatePlan: inputGatePlan } = input;
    const startTime = Date.now();

    // Check concurrency limit
    if (this.activeRuns.size >= this.config.maxConcurrentRuns) {
      throw new ConcurrencyLimitError(this.config.maxConcurrentRuns);
    }

    // Create run
    const runId = randomUUID();
    const maxIterations = taskSpec.spec.convergence?.limits?.maxIterations ?? 3;
    // Extract workspace ID from workspace source or use default
    const workspaceId = this.extractWorkspaceId(workOrder);
    let run = createRun(runId, workOrder.id, workspaceId, maxIterations);

    this.logger.info(
      {
        runId,
        workOrderId: workOrder.id,
        maxIterations,
      },
      'Execution started'
    );

    // Create execution state
    const state: ExecutionState = {
      context: null as unknown as ExecutionContext, // Will be set below
      startTime,
      iteration: 1,
      sessionId: null,
      feedback: null,
      beforeState: null,
    };

    this.activeRuns.set(runId, state);

    // Emit progress
    if (this.config.emitProgressEvents) {
      getProgressEmitter().emitRunStarted(workOrder.id, runId, {
        goal: taskSpec.spec.goal.prompt.slice(0, 100),
        strategy: taskSpec.spec.convergence?.strategy ?? 'default',
        maxIterations,
      });
    }

    // Collect metrics
    if (this.config.collectMetrics) {
      getMetricsCollector().incrementRunsStarted();
      getMetricsCollector().setActiveRuns(this.activeRuns.size);
    }

    const iterations: IterationData[] = [];
    const phaseBreakdown: Record<string, number> = {};

    try {
      // Transition to LEASED
      run = applyTransition(run, RunEvent.WORKSPACE_ACQUIRED);
      await saveRun(run);

      // Get timeout - parse maxWallClock string if provided (e.g., "2h", "30m")
      const maxWallClockMs = this.parseWallClockTimeout(taskSpec) ?? this.config.defaultTimeoutMs;

      // Main iteration loop
      while (!isTerminalState(run.state)) {
        const iteration = run.iteration;

        // Check timeout
        if (Date.now() - startTime > maxWallClockMs) {
          this.logger.warn({ runId, elapsed: Date.now() - startTime }, 'Execution timeout');
          run = applyTransition(run, RunEvent.SYSTEM_ERROR);
          run.result = RunResult.FAILED_TIMEOUT;
          run.error = 'Execution timeout exceeded';
          await saveRun(run);
          break;
        }

        // Check cancellation
        if (!this.activeRuns.has(runId)) {
          this.logger.info({ runId }, 'Execution was canceled');
          break;
        }

        // Emit iteration started
        if (this.config.emitProgressEvents) {
          getProgressEmitter().emitIterationStarted(
            workOrder.id,
            runId,
            iteration,
            maxIterations,
            state.feedback ?? undefined
          );
        }

        // Transition to BUILDING
        run = applyTransition(run, RunEvent.BUILD_STARTED);
        await saveRun(run);

        // Build phase context
        const defaultBeforeState: BeforeState = {
          sha: '',
          branch: 'main',
          isDirty: false,
          capturedAt: new Date(),
        };
        // Use provided workspace or create mock
        const workspace = inputWorkspace ?? this.createMockWorkspace(workOrder, workspaceId);
        // Use provided services or create mock
        const services = inputServices ?? this.createMockServices();

        const phaseContext: PhaseContext = {
          workOrderId: workOrder.id,
          runId,
          iteration,
          taskSpec,
          workspace,
          run,
          beforeState: state.beforeState ?? defaultBeforeState,
          services,
          logger: this.logger,
        };

        // Use provided gate plan or build from task spec
        const gatePlan = inputGatePlan ?? this.buildGatePlan(taskSpec);

        // Execute iteration via PhaseOrchestrator
        const iterationInput: IterationInput = {
          taskPrompt: taskSpec.spec.goal.prompt,
          feedback: state.feedback,
          sessionId: state.sessionId,
          beforeState: state.beforeState ?? defaultBeforeState,
          gatePlan,
        };

        const iterationStartTime = Date.now();
        const iterationResult = await this.phaseOrchestrator.executeIteration(
          phaseContext,
          iterationInput
        );

        // Record iteration data
        const iterationData: IterationData = {
          iteration,
          startTime: new Date(iterationStartTime),
          endTime: new Date(),
          durationMs: Date.now() - iterationStartTime,
          success: iterationResult.success,
          phaseTimings: iterationResult.phaseTimings as Record<string, number>,
          snapshotId: iterationResult.phases.snapshot?.snapshot?.id ?? null,
          verificationPassed: iterationResult.phases.verify?.allPassed ?? null,
          feedbackGenerated: !!iterationResult.phases.feedback,
          error: null,
        };
        iterations.push(iterationData);

        // Update phase breakdown
        for (const [phase, duration] of Object.entries(iterationResult.phaseTimings)) {
          phaseBreakdown[phase] = (phaseBreakdown[phase] ?? 0) + duration;
        }

        // Apply state transition
        run = applyTransition(run, iterationResult.stateTransition as RunEvent);

        // Set result for failure states
        if (run.state === RunState.FAILED) {
          run.result = getResultForEvent(iterationResult.stateTransition as RunEvent);
        }

        await saveRun(run);
        // Convert engine's IterationData to run.ts IterationData format
        // The types are intentionally different - engine's version is simpler
        await saveIterationData(runId, iteration, iterationData as unknown as import('../types/index.js').IterationData);

        // Emit iteration completed
        if (this.config.emitProgressEvents) {
          getProgressEmitter().emitIterationCompleted(
            workOrder.id,
            runId,
            iteration,
            iterationResult.success,
            iterationResult.phaseTimings
          );
        }

        // Check if we should continue
        if (!iterationResult.shouldContinue) {
          break;
        }

        // Check max iterations
        if (iteration >= maxIterations) {
          this.logger.info({ runId, iteration }, 'Max iterations reached');
          run = applyTransition(run, RunEvent.VERIFY_FAILED_TERMINAL);
          run.result = RunResult.FAILED_VERIFICATION;
          run.error = 'Max iterations reached without passing verification';
          await saveRun(run);
          break;
        }

        // Prepare for next iteration
        state.sessionId = iterationResult.nextSessionId;
        state.feedback = iterationResult.nextFeedback;
        run.iteration++;
        await saveRun(run);
      }

      // Calculate metrics
      const totalDurationMs = Date.now() - startTime;
      const metrics: ExecutionMetrics = {
        totalDurationMs,
        iterationCount: iterations.length,
        phaseBreakdown,
      };

      // Emit completion
      if (this.config.emitProgressEvents) {
        getProgressEmitter().emitRunCompleted(workOrder.id, runId, run.result ?? RunResult.FAILED_ERROR, metrics);
      }

      // Collect metrics
      if (this.config.collectMetrics) {
        const result =
          run.state === RunState.SUCCEEDED
            ? 'succeeded'
            : run.state === RunState.CANCELED
              ? 'canceled'
              : 'failed';
        getMetricsCollector().incrementRunsCompleted(result);
        getMetricsCollector().recordRunDuration(totalDurationMs);
      }

      this.logger.info(
        {
          runId,
          workOrderId: workOrder.id,
          state: run.state,
          result: run.result,
          iterations: iterations.length,
          durationMs: totalDurationMs,
        },
        'Execution completed'
      );

      return {
        run,
        iterations,
        metrics,
      };
    } catch (error) {
      this.logger.error({ runId, error }, 'Execution failed with exception');

      // Handle unexpected error
      if (!isTerminalState(run.state)) {
        try {
          run = applyTransition(run, RunEvent.SYSTEM_ERROR);
          run.result = RunResult.FAILED_ERROR;
          run.error = error instanceof Error ? error.message : String(error);
          await saveRun(run);
        } catch {
          // Ignore state machine errors during error handling
        }
      }

      if (this.config.emitProgressEvents) {
        getProgressEmitter().emitRunFailed(
          workOrder.id,
          runId,
          error instanceof Error ? error.message : String(error)
        );
      }

      throw error;
    } finally {
      this.activeRuns.delete(runId);

      if (this.config.collectMetrics) {
        getMetricsCollector().setActiveRuns(this.activeRuns.size);
      }
    }
  }

  /**
   * Cancel a running execution
   */
  async cancel(runId: string, reason: string): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) {
      throw new RunNotFoundError(runId);
    }

    this.logger.info({ runId, reason }, 'Canceling execution');

    // Remove from active runs to signal cancellation
    this.activeRuns.delete(runId);

    if (this.config.emitProgressEvents) {
      getProgressEmitter().emitRunCanceled(state.context?.workOrderId ?? '', runId, reason);
    }
  }

  /**
   * Get status of running execution
   */
  getStatus(runId: string): ExecutionStatus | null {
    const state = this.activeRuns.get(runId);
    if (!state) {
      return null;
    }

    return {
      runId,
      workOrderId: state.context?.workOrderId ?? '',
      state: state.context?.run?.state ?? 'unknown',
      iteration: state.iteration,
      maxIterations: state.context?.run?.maxIterations ?? 0,
      elapsedMs: Date.now() - state.startTime,
    };
  }

  /**
   * Get count of active executions
   */
  getActiveCount(): number {
    return this.activeRuns.size;
  }

  /**
   * Parse wall clock timeout from TaskSpec
   * Returns timeout in milliseconds or null if not specified
   */
  private parseWallClockTimeout(taskSpec: import('../types/index.js').ResolvedTaskSpec): number | null {
    const wallClock = taskSpec.spec.convergence?.limits?.maxWallClock;
    if (!wallClock) return null;

    // Parse duration string like "2h", "30m", "1d"
    const match = wallClock.match(/^(\d+)([smhd])$/);
    if (!match || !match[1] || !match[2]) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return null;
    }
  }

  /**
   * Extract workspace ID from work order source
   */
  private extractWorkspaceId(workOrder: import('../types/index.js').WorkOrder): string {
    const source = workOrder.workspaceSource;
    if (source.type === 'local') {
      return source.path;
    } else if (source.type === 'github') {
      return `${source.owner}/${source.repo}`;
    } else if (source.type === 'github-new') {
      return `${source.owner}/${source.repoName}`;
    } else if (source.type === 'git') {
      return source.url;
    } else if (source.type === 'fresh') {
      return source.destPath;
    }
    return 'default';
  }

  /**
   * Create a mock workspace from work order
   */
  private createMockWorkspace(
    workOrder: import('../types/index.js').WorkOrder,
    workspaceId: string
  ): import('../types/index.js').Workspace {
    const source = workOrder.workspaceSource;
    const rootPath = source.type === 'local' ? source.path : `/tmp/workspaces/${workspaceId}`;

    return {
      id: workspaceId,
      rootPath,
      source: workOrder.workspaceSource,
      leaseId: null,
      leasedAt: null,
      status: 'leased',
      gitInitialized: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Build gate plan from task spec
   */
  private buildGatePlan(taskSpec: import('../types/index.js').ResolvedTaskSpec): import('../types/index.js').GatePlan {
    // TODO: Extract from harness config or task spec
    // Return a minimal valid GatePlan
    return {
      id: randomUUID(),
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
      tests: [],
      blackbox: [],
      policy: {
        networkAllowed: false,
        maxRuntimeSeconds: 600,
        maxDiskMb: null,
        disallowedCommands: [],
      },
    };
  }

  /**
   * Create mock services for now (will be replaced with real implementations)
   */
  private createMockServices(): import('./phases/types.js').PhaseServices {
    return {
      agentDriver: {
        execute: async () => ({
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
          structuredOutput: null,
          sessionId: randomUUID(),
          tokensUsed: null,
          durationMs: 0,
        }),
        cancel: async () => {},
      },
      snapshotter: {
        capture: async () => ({
          id: randomUUID(),
          runId: '',
          iteration: 1,
          beforeSha: '',
          afterSha: '',
          branch: 'main',
          commitMessage: '',
          patchPath: null,
          filesChanged: 0,
          insertions: 0,
          deletions: 0,
          createdAt: new Date(),
        }),
      },
      verifier: {
        verify: async () => ({
          id: randomUUID(),
          snapshotId: '',
          runId: '',
          iteration: 1,
          passed: true,
          l0Result: { level: 'L0', passed: true, checks: [], duration: 0 },
          l1Result: { level: 'L1', passed: true, checks: [], duration: 0 },
          l2Result: { level: 'L2', passed: true, checks: [], duration: 0 },
          l3Result: { level: 'L3', passed: true, checks: [], duration: 0 },
          logs: '',
          diagnostics: [],
          totalDuration: 0,
          createdAt: new Date(),
        }),
      },
      feedbackGenerator: {
        generate: async () => 'Feedback',
      },
      resultPersister: {
        saveAgentResult: async () => null,
        saveVerificationReport: async () => null,
        saveSnapshot: async () => null,
      },
    };
  }
}

/**
 * Create an execution engine with default configuration
 */
export function createExecutionEngine(
  config?: Partial<ExecutionEngineConfig>
): ExecutionEngine {
  return new DefaultExecutionEngine(config);
}
