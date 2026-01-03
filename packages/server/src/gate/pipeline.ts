/**
 * Gate Pipeline (v0.2.24)
 *
 * Executes gates in sequence according to their configuration.
 *
 * @module gate/pipeline
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import type {
  Gate,
  GateResult,
  GateFeedback,
  GatePipelineResult,
  GateFailure,
  ResolvedTaskSpec,
} from '../types/index.js';
import type { Snapshot } from '../types/snapshot.js';
import type { GateContext } from './runner-types.js';
import { gateRunnerRegistry, type GateRunnerRegistry } from './registry.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('gate-pipeline');

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Context for pipeline execution
 */
export interface PipelineContext {
  /** Resolved task specification */
  taskSpec: ResolvedTaskSpec;
  /** Work order ID */
  workOrderId: string;
  /** Run ID */
  runId: string;
  /** Current iteration number */
  iteration: number;
  /** Current snapshot */
  snapshot: Snapshot;
  /** Workspace path */
  workspacePath: string;
  /** Previous gate results (for reference) */
  previousResults?: GateResult[];
}

/**
 * Options for pipeline execution
 */
export interface PipelineOptions {
  /** Custom registry to use (defaults to global) */
  registry?: GateRunnerRegistry;
  /** Callback for gate start */
  onGateStart?: (gate: Gate) => Promise<void>;
  /** Callback for gate complete */
  onGateComplete?: (gate: Gate, result: GateResult) => Promise<void>;
  /** Whether to continue on failure (override gate policy) */
  continueOnFailure?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Gate pipeline executor
 */
export class GatePipeline {
  private readonly registry: GateRunnerRegistry;

  constructor(registry?: GateRunnerRegistry) {
    this.registry = registry || gateRunnerRegistry;
  }

  /**
   * Execute all gates in the pipeline
   * @param context Pipeline context
   * @param options Execution options
   * @returns Pipeline result
   */
  async execute(context: PipelineContext, options: PipelineOptions = {}): Promise<GatePipelineResult> {
    const gates = context.taskSpec.spec.convergence.gates;
    const results: GateResult[] = [];
    const feedback: GateFeedback[] = [];
    let stoppedAt: string | undefined;

    log.info(
      { workOrderId: context.workOrderId, iteration: context.iteration, gateCount: gates.length },
      'Starting gate pipeline execution'
    );

    for (const gate of gates) {
      // Check gate condition
      if (!this.shouldRunGate(gate, context, results)) {
        log.debug({ gateName: gate.name }, 'Skipping gate due to condition');
        continue;
      }

      // Notify gate start
      if (options.onGateStart) {
        await options.onGateStart(gate);
      }

      // Get runner for this gate type
      const runner = (options.registry || this.registry).get(gate.check.type);
      if (!runner) {
        log.error({ gateName: gate.name, type: gate.check.type }, 'No runner found for gate type');
        const errorResult: GateResult = {
          gate: gate.name,
          type: gate.check.type,
          passed: false,
          timestamp: new Date(),
          duration: 0,
          details: { error: `No runner for type '${gate.check.type}'` },
          failures: [{ message: `No gate runner registered for type '${gate.check.type}'` }],
        };
        results.push(errorResult);
        stoppedAt = gate.name;
        break;
      }

      // Build gate context
      const gateContext: GateContext = {
        taskSpec: context.taskSpec,
        workOrderId: context.workOrderId,
        runId: context.runId,
        iteration: context.iteration,
        snapshot: context.snapshot,
        workspacePath: context.workspacePath,
        currentGate: gate.name,
        previousResults: results,
      };

      // Execute gate
      log.debug({ gateName: gate.name }, 'Executing gate');
      const result = await runner.run(gateContext);
      results.push(result);

      // Notify gate complete
      if (options.onGateComplete) {
        await options.onGateComplete(gate, result);
      }

      // Handle result
      if (result.passed) {
        log.debug({ gateName: gate.name }, 'Gate passed');

        // Check success policy
        if (gate.onSuccess?.action === 'skip-remaining') {
          log.info({ gateName: gate.name }, 'Skipping remaining gates due to success policy');
          break;
        }
      } else {
        log.debug(
          { gateName: gate.name, failureCount: result.failures?.length || 0 },
          'Gate failed'
        );

        // Generate feedback
        const gateFeedback = await runner.generateFeedback(result);
        feedback.push(gateFeedback);

        // Check failure policy
        const shouldStop = !options.continueOnFailure && gate.onFailure.action === 'stop';
        if (shouldStop) {
          log.info({ gateName: gate.name }, 'Stopping pipeline due to failure policy');
          stoppedAt = gate.name;
          break;
        }
      }
    }

    const allPassed = results.every((r) => r.passed);

    log.info(
      { workOrderId: context.workOrderId, passed: allPassed, gateCount: results.length, stoppedAt },
      'Gate pipeline execution complete'
    );

    const pipelineResult: GatePipelineResult = {
      passed: allPassed,
      results,
    };

    if (stoppedAt) {
      pipelineResult.stoppedAt = stoppedAt;
    }

    if (feedback.length > 0) {
      pipelineResult.feedback = feedback;
    }

    return pipelineResult;
  }

  /**
   * Execute a single gate
   * @param gate Gate to execute
   * @param context Pipeline context
   * @returns Gate result
   */
  async executeSingle(gate: Gate, context: PipelineContext): Promise<GateResult> {
    const runner = this.registry.get(gate.check.type);
    if (!runner) {
      return {
        gate: gate.name,
        type: gate.check.type,
        passed: false,
        timestamp: new Date(),
        duration: 0,
        details: { error: `No runner for type '${gate.check.type}'` },
        failures: [{ message: `No gate runner registered for type '${gate.check.type}'` }],
      };
    }

    const gateContext: GateContext = {
      taskSpec: context.taskSpec,
      workOrderId: context.workOrderId,
      runId: context.runId,
      iteration: context.iteration,
      snapshot: context.snapshot,
      workspacePath: context.workspacePath,
      currentGate: gate.name,
    };
    if (context.previousResults) {
      gateContext.previousResults = context.previousResults;
    }

    return runner.run(gateContext);
  }

  /**
   * Check if a gate should run based on its condition
   */
  private shouldRunGate(gate: Gate, context: PipelineContext, previousResults: GateResult[]): boolean {
    const condition = gate.condition;
    if (!condition) {
      return true;
    }

    // Check 'when' condition
    if (condition.when === 'manual') {
      // Manual gates require explicit invocation
      log.debug({ gateName: gate.name }, 'Skipping manual gate');
      return false;
    }

    if (condition.when === 'on-change') {
      // Only run if there were changes in the snapshot
      const hasChanges = context.snapshot.filesChanged > 0;
      if (!hasChanges) {
        log.debug({ gateName: gate.name }, 'Skipping gate - no changes detected');
        return false;
      }
    }

    // Check 'skipIf' condition (simple expression evaluation)
    if (condition.skipIf) {
      const shouldSkip = this.evaluateSkipCondition(condition.skipIf, context, previousResults);
      if (shouldSkip) {
        log.debug({ gateName: gate.name, condition: condition.skipIf }, 'Skipping gate due to skipIf condition');
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a skip condition expression
   * Supports simple expressions like:
   * - "gate.verification.passed" - check if a gate passed
   * - "iteration < 2" - check iteration count
   */
  private evaluateSkipCondition(
    expression: string,
    context: PipelineContext,
    previousResults: GateResult[]
  ): boolean {
    try {
      // Check for gate result conditions
      const gateMatch = expression.match(/^gate\.([^.]+)\.passed$/);
      if (gateMatch && gateMatch[1]) {
        const gateName = gateMatch[1];
        const result = previousResults.find((r) => r.gate === gateName);
        return result?.passed || false;
      }

      // Check for iteration conditions
      const iterMatch = expression.match(/^iteration\s*(<|>|<=|>=|==)\s*(\d+)$/);
      if (iterMatch && iterMatch[1] && iterMatch[2]) {
        const op = iterMatch[1];
        const value = parseInt(iterMatch[2], 10);
        switch (op) {
          case '<':
            return context.iteration < value;
          case '>':
            return context.iteration > value;
          case '<=':
            return context.iteration <= value;
          case '>=':
            return context.iteration >= value;
          case '==':
            return context.iteration === value;
        }
      }

      // Unknown expression - don't skip
      log.warn({ expression }, 'Unknown skipIf expression');
      return false;
    } catch (error) {
      log.warn({ expression, error }, 'Error evaluating skipIf condition');
      return false;
    }
  }

  /**
   * Collect all failures from gate results
   */
  collectFailures(results: GateResult[]): GateFailure[] {
    const failures: GateFailure[] = [];
    for (const result of results) {
      if (!result.passed && result.failures) {
        failures.push(...result.failures);
      }
    }
    return failures;
  }

  /**
   * Format all feedback into a single string for the agent
   */
  formatFeedback(feedbackList: GateFeedback[]): string {
    if (feedbackList.length === 0) {
      return '';
    }

    const lines: string[] = ['## Gate Check Results\n'];

    for (const feedback of feedbackList) {
      lines.push(feedback.formatted);
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new gate pipeline
 */
export function createGatePipeline(registry?: GateRunnerRegistry): GatePipeline {
  return new GatePipeline(registry);
}
