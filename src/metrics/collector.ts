/**
 * Metrics collector for run execution.
 * Collects timing data, token usage, code changes, and verification results
 * during run execution.
 */

import {
  type Phase,
  type PhaseMetrics,
  type LevelMetrics,
  type IterationMetrics,
  type AgentResult,
  type Snapshot,
  type VerificationReport,
  Phase as PhaseEnum,
} from '../types/index.js';

/**
 * Internal state for tracking a phase
 */
interface PhaseState {
  phase: Phase;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
}

/**
 * Internal state for tracking an iteration
 */
interface IterationState {
  iteration: number;
  startedAt: Date;
  completedAt: Date | null;

  // Phase tracking
  phases: Map<Phase, PhaseState>;

  // Agent data
  agentTokensInput: number | null;
  agentTokensOutput: number | null;
  agentExitCode: number | null;
  agentDurationMs: number | null;

  // Snapshot data
  filesChanged: number;
  insertions: number;
  deletions: number;

  // Verification data
  verificationPassed: boolean;
  verificationDurationMs: number;
  verificationLevels: LevelMetrics[];
}

/**
 * Collects metrics during run execution.
 * Thread-safe for single-threaded async execution.
 */
export class MetricsCollector {
  private runId: string;
  private currentIteration: number = 0;
  private iterations: Map<number, IterationState> = new Map();

  constructor(runId: string) {
    this.runId = runId;
  }

  /**
   * Start tracking a new iteration
   */
  startIteration(iteration: number): void {
    this.currentIteration = iteration;

    const state: IterationState = {
      iteration,
      startedAt: new Date(),
      completedAt: null,
      phases: new Map([
        [PhaseEnum.BUILD, this.createPhaseState(PhaseEnum.BUILD)],
        [PhaseEnum.SNAPSHOT, this.createPhaseState(PhaseEnum.SNAPSHOT)],
        [PhaseEnum.VERIFY, this.createPhaseState(PhaseEnum.VERIFY)],
        [PhaseEnum.FEEDBACK, this.createPhaseState(PhaseEnum.FEEDBACK)],
      ]),
      agentTokensInput: null,
      agentTokensOutput: null,
      agentExitCode: null,
      agentDurationMs: null,
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      verificationPassed: false,
      verificationDurationMs: 0,
      verificationLevels: [],
    };

    this.iterations.set(iteration, state);
  }

  /**
   * End tracking for an iteration
   */
  endIteration(iteration: number): void {
    const state = this.iterations.get(iteration);
    if (state) {
      state.completedAt = new Date();
    }
  }

  /**
   * Record the start of a phase
   */
  startPhase(phase: Phase): void {
    const state = this.iterations.get(this.currentIteration);
    if (!state) return;

    const phaseState = state.phases.get(phase);
    if (phaseState) {
      phaseState.startedAt = new Date();
    }
  }

  /**
   * Record the end of a phase
   */
  endPhase(phase: Phase): void {
    const state = this.iterations.get(this.currentIteration);
    if (!state) return;

    const phaseState = state.phases.get(phase);
    if (phaseState?.startedAt) {
      phaseState.completedAt = new Date();
      phaseState.durationMs = phaseState.completedAt.getTime() - phaseState.startedAt.getTime();
    }
  }

  /**
   * Get current phase duration (for in-progress phase)
   */
  getCurrentPhaseDuration(phase: Phase): number | null {
    const state = this.iterations.get(this.currentIteration);
    if (!state) return null;

    const phaseState = state.phases.get(phase);
    if (!phaseState?.startedAt) return null;

    if (phaseState.durationMs !== null) {
      return phaseState.durationMs;
    }

    // Phase still in progress
    return Date.now() - phaseState.startedAt.getTime();
  }

  /**
   * Record agent result (token usage, exit code, duration)
   */
  recordAgentResult(result: AgentResult): void {
    const state = this.iterations.get(this.currentIteration);
    if (!state) return;

    if (result.tokensUsed) {
      state.agentTokensInput = result.tokensUsed.input;
      state.agentTokensOutput = result.tokensUsed.output;
    }
    state.agentExitCode = result.exitCode;
    state.agentDurationMs = result.durationMs;
  }

  /**
   * Record snapshot data (code changes)
   */
  recordSnapshot(snapshot: Snapshot): void {
    const state = this.iterations.get(this.currentIteration);
    if (!state) return;

    state.filesChanged = snapshot.filesChanged;
    state.insertions = snapshot.insertions;
    state.deletions = snapshot.deletions;
  }

  /**
   * Record verification result
   */
  recordVerification(report: VerificationReport): void {
    const state = this.iterations.get(this.currentIteration);
    if (!state) return;

    state.verificationPassed = report.passed;
    state.verificationDurationMs = report.totalDuration;

    // Convert level results to level metrics
    state.verificationLevels = [
      this.convertLevelResult(report.l0Result),
      this.convertLevelResult(report.l1Result),
      this.convertLevelResult(report.l2Result),
      this.convertLevelResult(report.l3Result),
    ];
  }

  /**
   * Get current iteration number
   */
  getCurrentIteration(): number {
    return this.currentIteration;
  }

  /**
   * Get phase metrics for an iteration
   */
  getPhaseMetrics(iteration: number): PhaseMetrics[] {
    const state = this.iterations.get(iteration);
    if (!state) return [];

    const result: PhaseMetrics[] = [];
    for (const [phase, phaseState] of state.phases) {
      if (phaseState.startedAt && phaseState.completedAt && phaseState.durationMs !== null) {
        result.push({
          phase,
          startedAt: phaseState.startedAt,
          completedAt: phaseState.completedAt,
          durationMs: phaseState.durationMs,
        });
      }
    }
    return result;
  }

  /**
   * Get metrics for a specific iteration
   */
  getIterationMetrics(iteration: number): IterationMetrics | null {
    const state = this.iterations.get(iteration);
    if (!state?.completedAt) return null;

    const phases = this.getPhaseMetrics(iteration);
    const totalDurationMs = state.completedAt.getTime() - state.startedAt.getTime();

    return {
      iteration: state.iteration,
      runId: this.runId,
      phases,
      totalDurationMs,
      agentTokensInput: state.agentTokensInput,
      agentTokensOutput: state.agentTokensOutput,
      agentExitCode: state.agentExitCode,
      agentDurationMs: state.agentDurationMs,
      filesChanged: state.filesChanged,
      insertions: state.insertions,
      deletions: state.deletions,
      verificationPassed: state.verificationPassed,
      verificationDurationMs: state.verificationDurationMs,
      verificationLevels: state.verificationLevels,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
    };
  }

  /**
   * Get all iteration metrics
   */
  getAllIterationMetrics(): IterationMetrics[] {
    const result: IterationMetrics[] = [];
    for (const iteration of this.iterations.keys()) {
      const metrics = this.getIterationMetrics(iteration);
      if (metrics) {
        result.push(metrics);
      }
    }
    return result.sort((a, b) => a.iteration - b.iteration);
  }

  /**
   * Create initial phase state
   */
  private createPhaseState(phase: Phase): PhaseState {
    return {
      phase,
      startedAt: null,
      completedAt: null,
      durationMs: null,
    };
  }

  /**
   * Convert a LevelResult to LevelMetrics
   */
  private convertLevelResult(levelResult: {
    level: string;
    passed: boolean;
    checks: Array<{ passed: boolean }>;
    duration: number;
  }): LevelMetrics {
    return {
      level: levelResult.level as 'L0' | 'L1' | 'L2' | 'L3',
      passed: levelResult.passed,
      durationMs: levelResult.duration,
      checksRun: levelResult.checks.length,
      checksPassed: levelResult.checks.filter(c => c.passed).length,
    };
  }
}
