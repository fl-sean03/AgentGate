/**
 * Service Adapters
 * v0.2.25: Adapters that wrap existing AgentGate services for the ExecutionEngine
 *
 * These adapters provide the interface expected by PhaseServices while
 * delegating to the existing implementation modules.
 */

import { randomUUID } from 'node:crypto';
import type {
  PhaseServices,
  AgentDriver,
  Snapshotter,
  Verifier,
  FeedbackGenerator,
  ResultPersister,
  AgentRequest,
  SnapshotOptions,
  VerifyOptions,
  FeedbackOptions,
} from './phases/types.js';
import type { AgentResult, Snapshot, VerificationReport, GatePlan, BeforeState } from '../types/index.js';

/**
 * Options for creating service adapters
 */
export interface ServiceAdapterOptions {
  /**
   * Agent driver instance (ClaudeCodeDriver or ClaudeCodeSubscriptionDriver)
   */
  agentDriver: {
    execute: (request: import('../types/index.js').AgentRequest) => Promise<AgentResult>;
  };

  /**
   * Callback for capturing snapshot
   */
  captureSnapshot?: (
    workspacePath: string,
    beforeState: BeforeState,
    runId: string,
    iteration: number,
    taskPrompt: string
  ) => Promise<Snapshot>;

  /**
   * Verifier callback
   */
  verifyFn?: (options: {
    snapshotPath: string;
    gatePlan: GatePlan;
    snapshotId: string;
    runId: string;
    iteration: number;
    cleanRoom: boolean;
    timeoutMs: number;
    skip: string[];
  }) => Promise<VerificationReport>;

  /**
   * Feedback generator function
   */
  generateFeedback?: (report: VerificationReport, iteration: number) => unknown;

  /**
   * Feedback formatter function
   */
  formatFeedback?: (feedback: unknown) => string;
}

/**
 * Create an AgentDriver adapter
 */
export function createAgentDriverAdapter(
  driver: ServiceAdapterOptions['agentDriver']
): AgentDriver {
  return {
    async execute(request: AgentRequest): Promise<AgentResult> {
      // Import defaults for context pointers and constraints
      const { EMPTY_CONTEXT_POINTERS, DEFAULT_AGENT_CONSTRAINTS } = await import('../agent/defaults.js');

      // Convert internal AgentRequest to types/AgentRequest
      const fullRequest: import('../types/index.js').AgentRequest = {
        workspacePath: request.workspacePath,
        taskPrompt: request.taskPrompt,
        priorFeedback: request.feedback ?? null,
        timeoutMs: request.timeoutMs ?? 300000,
        sessionId: request.sessionId ?? null,
        contextPointers: EMPTY_CONTEXT_POINTERS,
        gatePlanSummary: '',
        constraints: DEFAULT_AGENT_CONSTRAINTS,
        spawnLimits: null,
      };
      return driver.execute(fullRequest);
    },
    async cancel(): Promise<void> {
      // Currently, cancellation is handled at the process level
    },
  };
}

/**
 * Create a Snapshotter adapter
 */
export function createSnapshotterAdapter(
  captureSnapshot?: ServiceAdapterOptions['captureSnapshot']
): Snapshotter {
  return {
    async capture(
      workspacePath: string,
      beforeState: BeforeState,
      options: SnapshotOptions
    ): Promise<Snapshot> {
      if (captureSnapshot) {
        return captureSnapshot(
          workspacePath,
          beforeState,
          options.runId,
          options.iteration,
          options.taskPrompt
        );
      }

      // Default implementation - return minimal snapshot
      return {
        id: randomUUID(),
        runId: options.runId,
        iteration: options.iteration,
        beforeSha: beforeState.sha,
        afterSha: beforeState.sha,
        branch: beforeState.branch,
        commitMessage: `Iteration ${options.iteration}`,
        patchPath: null,
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        createdAt: new Date(),
      };
    },
  };
}

/**
 * Create a Verifier adapter
 */
export function createVerifierAdapter(
  verifyFn?: ServiceAdapterOptions['verifyFn']
): Verifier {
  return {
    async verify(
      snapshot: Snapshot,
      gatePlan: GatePlan,
      options: VerifyOptions
    ): Promise<VerificationReport> {
      if (verifyFn) {
        return verifyFn({
          snapshotPath: '', // Will be filled from workspace context
          gatePlan,
          snapshotId: snapshot.id,
          runId: options.runId,
          iteration: options.iteration,
          cleanRoom: false,
          timeoutMs: 5 * 60 * 1000,
          skip: [],
        });
      }

      // Default implementation - return passed
      return {
        id: randomUUID(),
        snapshotId: snapshot.id,
        runId: options.runId,
        iteration: options.iteration,
        passed: true,
        l0Result: { level: 'L0', passed: true, checks: [], duration: 0 },
        l1Result: { level: 'L1', passed: true, checks: [], duration: 0 },
        l2Result: { level: 'L2', passed: true, checks: [], duration: 0 },
        l3Result: { level: 'L3', passed: true, checks: [], duration: 0 },
        logs: '',
        diagnostics: [],
        totalDuration: 0,
        createdAt: new Date(),
      };
    },
  };
}

/**
 * Create a FeedbackGenerator adapter
 */
export function createFeedbackGeneratorAdapter(
  generateFeedback?: ServiceAdapterOptions['generateFeedback'],
  formatFeedback?: ServiceAdapterOptions['formatFeedback']
): FeedbackGenerator {
  return {
    generate(
      _snapshot: Snapshot,
      report: VerificationReport,
      _gatePlan: GatePlan,
      _options: FeedbackOptions
    ): Promise<string> {
      if (generateFeedback && formatFeedback) {
        const structured = generateFeedback(report, report.iteration);
        return Promise.resolve(formatFeedback(structured));
      }

      // Default implementation - simple feedback
      if (report.passed) {
        return Promise.resolve('All verification gates passed.');
      }

      const failures: string[] = [];
      if (!report.l0Result?.passed) failures.push('L0 (contracts)');
      if (!report.l1Result?.passed) failures.push('L1 (tests)');
      if (!report.l2Result?.passed) failures.push('L2 (blackbox)');
      if (!report.l3Result?.passed) failures.push('L3 (review)');

      return Promise.resolve(`Verification failed at levels: ${failures.join(', ')}. Please review the test output and fix the issues.`);
    },
  };
}

/**
 * Create a ResultPersister adapter
 */
export function createResultPersisterAdapter(): ResultPersister {
  // Import persistence functions lazily to avoid circular deps
  return {
    async saveAgentResult(
      runId: string,
      iteration: number,
      result: AgentResult
    ): Promise<string | null> {
      try {
        const { resultPersister } = await import('../orchestrator/result-persister.js');
        return await resultPersister.saveAgentResult(runId, iteration, result);
      } catch {
        return null;
      }
    },
    async saveVerificationReport(
      runId: string,
      iteration: number,
      report: VerificationReport
    ): Promise<string | null> {
      try {
        const { resultPersister } = await import('../orchestrator/result-persister.js');
        return await resultPersister.saveVerificationReport(runId, iteration, report);
      } catch {
        return null;
      }
    },
    saveSnapshot(
      _runId: string,
      _iteration: number,
      _snapshot: Snapshot
    ): Promise<string | null> {
      // Snapshots are saved as part of the iteration data, not separately
      return Promise.resolve(null);
    },
  };
}

/**
 * Create all service adapters from options
 */
export function createServiceAdapters(options: ServiceAdapterOptions): PhaseServices {
  return {
    agentDriver: createAgentDriverAdapter(options.agentDriver),
    snapshotter: createSnapshotterAdapter(options.captureSnapshot),
    verifier: createVerifierAdapter(options.verifyFn),
    feedbackGenerator: createFeedbackGeneratorAdapter(
      options.generateFeedback,
      options.formatFeedback
    ),
    resultPersister: createResultPersisterAdapter(),
  };
}
