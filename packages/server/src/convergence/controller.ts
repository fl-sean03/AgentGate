/**
 * Convergence Controller (v0.2.24)
 *
 * Orchestrates the iteration loop, consulting strategies and gates
 * to make continue/stop decisions.
 *
 * @module convergence/controller
 */

import type {
  ConvergenceSpec,
  ConvergenceConfig,
  ConvergenceState,
  ConvergenceResult,
  ConvergenceProgress,
  ConvergenceDecision,
  ConvergenceIterationHistory,
  GateResult,
  GateFailure,
  Gate,
  ResolvedTaskSpec,
} from '../types/index.js';
import type { Snapshot } from '../types/snapshot.js';
import type { ConvergenceStrategy } from './strategy.js';
import { strategyRegistry } from './registry.js';
import { createProgressTracker, type ProgressTracker } from './progress.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT AND CALLBACKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build result from a build phase
 */
export interface BuildResult {
  success: boolean;
  error?: string;
}

/**
 * Context provided to the convergence controller
 */
export interface ConvergenceContext {
  /** Resolved task specification */
  taskSpec: ResolvedTaskSpec;
  /** Work order ID */
  workOrderId: string;
  /** Run ID */
  runId: string;

  /**
   * Callback for the build phase
   * @returns Build result
   */
  onBuild: () => Promise<BuildResult>;

  /**
   * Callback for creating a snapshot
   * @returns Snapshot of current state
   */
  onSnapshot: () => Promise<Snapshot>;

  /**
   * Callback for checking a gate
   * @param gate Gate to check
   * @returns Gate result
   */
  onGateCheck: (gate: Gate) => Promise<GateResult>;

  /**
   * Callback for generating feedback from failures
   * @param failures Gate failures
   * @returns Formatted feedback string
   */
  onFeedback: (failures: GateFailure[]) => Promise<string>;

  /**
   * Optional callback for iteration start
   * @param iteration Current iteration number
   */
  onIterationStart?: (iteration: number) => Promise<void>;

  /**
   * Optional callback for iteration end
   * @param iteration Current iteration number
   * @param decision Decision made
   */
  onIterationEnd?: (iteration: number, decision: ConvergenceDecision) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTROLLER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convergence controller interface
 */
export interface ConvergenceController {
  /** Initialize with TaskSpec convergence configuration */
  initialize(config: ConvergenceSpec): Promise<void>;

  /** Main loop - returns when converged or limits reached */
  run(context: ConvergenceContext): Promise<ConvergenceResult>;

  /** Get current progress (for monitoring) */
  getProgress(): ConvergenceProgress;

  /** Force stop (for cancellation) */
  stop(reason: string): Promise<void>;

  /** Check if controller is running */
  isRunning(): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTROLLER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default convergence controller implementation
 */
export class DefaultConvergenceController implements ConvergenceController {
  private config: ConvergenceSpec | null = null;
  private strategy: ConvergenceStrategy | null = null;
  private progressTracker: ProgressTracker;
  private running = false;
  private stopRequested = false;
  private stopReason = '';
  private startTime = 0;
  private currentIteration = 0;
  private gateResults: Record<string, GateResult> = {};
  private history: ConvergenceIterationHistory[] = [];

  constructor() {
    this.progressTracker = createProgressTracker();
  }

  async initialize(config: ConvergenceSpec): Promise<void> {
    this.config = config;

    // Create strategy from registry
    this.strategy = strategyRegistry.create(config.strategy);
    await this.strategy.initialize(config.config || {});

    // Reset state
    this.progressTracker.reset();
    this.running = false;
    this.stopRequested = false;
    this.stopReason = '';
    this.currentIteration = 0;
    this.gateResults = {};
    this.history = [];
  }

  async run(context: ConvergenceContext): Promise<ConvergenceResult> {
    if (!this.config || !this.strategy) {
      throw new Error('Controller not initialized');
    }

    this.running = true;
    this.startTime = Date.now();
    this.currentIteration = 0;
    this.gateResults = {};
    this.history = [];

    const maxIterations = this.config.limits.maxIterations || 100;
    const maxWallClockMs = this.parseWallClock(this.config.limits.maxWallClock || '1h');

    try {
      while (this.running && !this.stopRequested) {
        this.currentIteration++;

        // Notify iteration start
        if (context.onIterationStart) {
          await context.onIterationStart(this.currentIteration);
        }

        // Build phase
        const buildResult = await context.onBuild();
        if (!buildResult.success) {
          // Build failed - generate feedback and continue
          // (The next iteration should receive feedback)
          continue;
        }

        // Snapshot phase
        const snapshot = await context.onSnapshot();

        // Gate evaluation phase
        const iterationGateResults: GateResult[] = [];
        const failures: GateFailure[] = [];
        let allGatesPassed = true;
        let shouldStop = false;
        let stopGate: string | undefined;

        for (const gate of this.config.gates) {
          const result = await context.onGateCheck(gate);
          iterationGateResults.push(result);
          this.gateResults[gate.name] = result;

          if (!result.passed) {
            allGatesPassed = false;

            // Collect failures for feedback
            if (result.failures) {
              failures.push(...result.failures);
            }

            // Check failure policy
            if (gate.onFailure.action === 'stop') {
              shouldStop = true;
              stopGate = gate.name;
              break;
            }
          }
        }

        // Build convergence state
        const state: ConvergenceState = {
          iteration: this.currentIteration,
          elapsed: Date.now() - this.startTime,
          gateResults: iterationGateResults,
          history: this.history,
          snapshot,
        };

        // Check if all gates passed
        if (allGatesPassed) {
          this.running = false;
          return this.createResult('converged', 'All gates passed', state);
        }

        // Check if we should stop due to gate policy
        if (shouldStop) {
          this.running = false;
          return this.createResult('diverged', `Gate '${stopGate}' requested stop`, state);
        }

        // Check limits
        if (this.currentIteration >= maxIterations) {
          this.running = false;
          return this.createResult('diverged', `Reached max iterations (${maxIterations})`, state);
        }

        if (Date.now() - this.startTime >= maxWallClockMs) {
          this.running = false;
          return this.createResult('diverged', 'Timeout', state);
        }

        // Consult strategy
        const decision = await this.strategy.shouldContinue(state);

        // Record history
        this.history.push({
          iteration: this.currentIteration,
          timestamp: new Date(),
          gateResults: iterationGateResults,
          decision,
          snapshotHash: snapshot.afterSha?.slice(0, 8),
        });

        // Notify iteration end
        if (context.onIterationEnd) {
          await context.onIterationEnd(this.currentIteration, decision);
        }

        if (!decision.continue) {
          this.running = false;
          return this.createResult('diverged', decision.reason, state);
        }

        // Generate feedback for next iteration
        if (failures.length > 0) {
          await context.onFeedback(failures);
        }
      }

      // If stop was requested
      if (this.stopRequested) {
        const state: ConvergenceState = {
          iteration: this.currentIteration,
          elapsed: Date.now() - this.startTime,
          gateResults: Object.values(this.gateResults),
          history: this.history,
        };
        return this.createResult('stopped', this.stopReason, state);
      }

      throw new Error('Unexpected exit from convergence loop');
    } catch (error) {
      this.running = false;
      const state: ConvergenceState = {
        iteration: this.currentIteration,
        elapsed: Date.now() - this.startTime,
        gateResults: Object.values(this.gateResults),
        history: this.history,
      };
      return this.createResult('error', error instanceof Error ? error.message : String(error), state);
    }
  }

  getProgress(): ConvergenceProgress {
    const limits = this.config?.limits;
    const maxIterations = limits?.maxIterations || 100;
    const maxWallClockMs = this.parseWallClock(limits?.maxWallClock || '1h');

    const gatesPassed = Object.values(this.gateResults).filter((r) => r.passed).length;
    const gatesTotal = this.config?.gates.length || 0;

    const progress = this.progressTracker.calculate({
      iteration: this.currentIteration,
      elapsed: Date.now() - this.startTime,
      gateResults: Object.values(this.gateResults),
      history: this.history,
    });

    const trend = progress > 0.5 ? 'improving' : progress < 0.3 ? 'regressing' : 'stagnant';

    return {
      iteration: this.currentIteration,
      maxIterations,
      elapsed: Date.now() - this.startTime,
      maxWallClock: maxWallClockMs,
      gatesPassed,
      gatesTotal,
      trend,
    };
  }

  async stop(reason: string): Promise<void> {
    this.stopRequested = true;
    this.stopReason = reason;
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Parse wall clock string to milliseconds
   */
  private parseWallClock(wallClock: string): number {
    const match = wallClock.match(/^(\d+)([smhd])$/);
    if (!match || !match[1] || !match[2]) {
      return 3600000; // Default 1 hour
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 3600000;
    }
  }

  /**
   * Create result object
   */
  private createResult(
    status: ConvergenceResult['status'],
    reason: string,
    state: ConvergenceState
  ): ConvergenceResult {
    return {
      status,
      iterations: this.currentIteration,
      finalState: state,
      gateResults: this.gateResults,
      reason,
      duration: Date.now() - this.startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new convergence controller
 */
export function createConvergenceController(): ConvergenceController {
  return new DefaultConvergenceController();
}
