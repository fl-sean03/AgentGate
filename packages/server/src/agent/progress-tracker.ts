/**
 * Progress Tracker Module
 *
 * Tracks execution progress during agent runs and provides meaningful
 * progress indication based on heuristics and observable metrics.
 */

import { createLogger } from '../utils/index.js';
import type { ProgressUpdateEvent } from '../server/websocket/types.js';

const logger = createLogger('agent:progress-tracker');

/**
 * Execution phases with their associated progress weights
 */
export type ExecutionPhase =
  | 'Starting'
  | 'Reading'
  | 'Planning'
  | 'Implementing'
  | 'Testing'
  | 'Finalizing';

/**
 * Phase weights for progress calculation
 */
const PHASE_WEIGHTS: Record<ExecutionPhase, number> = {
  Starting: 5,
  Reading: 15,
  Planning: 25,
  Implementing: 60,
  Testing: 85,
  Finalizing: 95,
};

/**
 * Tool categories for phase detection
 */
const READING_TOOLS = ['Read', 'Glob', 'Grep'];
const WRITING_TOOLS = ['Write', 'Edit'];
const TESTING_PATTERNS = ['test', 'check', 'verify', 'lint', 'typecheck', 'build'];
const FINALIZING_PATTERNS = ['git', 'commit', 'push', 'pr', 'pull request'];
const PLANNING_PATTERNS = ['plan', 'approach', 'strategy', 'steps', 'will do', 'let me'];

/**
 * Options for the ProgressTracker
 */
export interface ProgressOptions {
  /** Expected duration in seconds (for estimation) */
  expectedDurationSeconds?: number;
  /** Expected number of tool calls (for estimation) */
  expectedToolCalls?: number;
  /** Minimum time in phase before allowing transition (ms) */
  minPhaseTimeMs?: number;
}

/**
 * Progress state returned by getProgress
 */
export interface ProgressState {
  /** Current percentage (0-99) */
  percentage: number;
  /** Current execution phase */
  currentPhase: ExecutionPhase;
  /** Total tool calls made */
  toolCallCount: number;
  /** Elapsed seconds since start */
  elapsedSeconds: number;
  /** Estimated remaining seconds (undefined if not confident) */
  estimatedRemainingSeconds?: number;
}

/**
 * ProgressTracker monitors execution metrics and provides progress estimates.
 *
 * Features:
 * - Phase detection from tool call patterns
 * - Progress percentage estimation
 * - Periodic progress event emission
 * - Configurable estimation parameters
 */
export class ProgressTracker {
  private readonly workOrderId: string;
  private readonly runId: string;
  private readonly expectedDurationSeconds: number;
  private readonly expectedToolCalls: number;
  private readonly minPhaseTimeMs: number;

  private startTime: number = Date.now();
  private toolCallCount = 0;
  private recentToolCalls: string[] = [];
  private recentOutputText: string[] = [];
  private currentPhase: ExecutionPhase = 'Starting';
  private phaseStartTime: number = Date.now();

  private periodicTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    workOrderId: string,
    runId: string,
    options?: ProgressOptions
  ) {
    this.workOrderId = workOrderId;
    this.runId = runId;
    this.expectedDurationSeconds = options?.expectedDurationSeconds ?? 300; // 5 minutes default
    this.expectedToolCalls = options?.expectedToolCalls ?? 50;
    this.minPhaseTimeMs = options?.minPhaseTimeMs ?? 2000;

    logger.debug(
      {
        workOrderId,
        runId,
        expectedDurationSeconds: this.expectedDurationSeconds,
        expectedToolCalls: this.expectedToolCalls,
      },
      'ProgressTracker initialized'
    );
  }

  /**
   * Record a tool call for progress tracking
   */
  recordToolCall(tool: string): void {
    this.toolCallCount++;
    this.recentToolCalls.push(tool);

    // Keep only last 10 tool calls for phase detection
    if (this.recentToolCalls.length > 10) {
      this.recentToolCalls.shift();
    }

    // Update phase based on tool pattern
    this.updatePhaseFromTools();

    logger.debug(
      { tool, toolCallCount: this.toolCallCount, currentPhase: this.currentPhase },
      'Tool call recorded'
    );
  }

  /**
   * Record agent output text for phase detection
   */
  recordOutput(text: string): void {
    this.recentOutputText.push(text.toLowerCase());

    // Keep only last 5 outputs for detection
    if (this.recentOutputText.length > 5) {
      this.recentOutputText.shift();
    }

    // Update phase based on output patterns
    this.updatePhaseFromOutput();
  }

  /**
   * Get current progress state
   */
  getProgress(): ProgressState {
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - this.startTime) / 1000);

    // Calculate percentage using multi-factor model
    const percentage = this.calculatePercentage(elapsedSeconds);

    // Calculate estimated remaining time
    let estimatedRemainingSeconds: number | undefined;
    if (percentage > 10) {
      const totalEstimatedSeconds = (elapsedSeconds / percentage) * 100;
      estimatedRemainingSeconds = Math.max(0, Math.floor(totalEstimatedSeconds - elapsedSeconds));
    }

    // Build result with optional property only if defined
    const result: ProgressState = {
      percentage,
      currentPhase: this.currentPhase,
      toolCallCount: this.toolCallCount,
      elapsedSeconds,
    };

    if (estimatedRemainingSeconds !== undefined) {
      result.estimatedRemainingSeconds = estimatedRemainingSeconds;
    }

    return result;
  }

  /**
   * Start emitting periodic progress updates
   */
  startPeriodicEmit(
    callback: (event: ProgressUpdateEvent) => void,
    intervalMs: number
  ): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
    }

    this.periodicTimer = setInterval(() => {
      if (this.stopped) {
        return;
      }

      const progress = this.getProgress();
      const event: ProgressUpdateEvent = {
        type: 'progress_update',
        workOrderId: this.workOrderId,
        runId: this.runId,
        percentage: progress.percentage,
        currentPhase: progress.currentPhase,
        toolCallCount: progress.toolCallCount,
        elapsedSeconds: progress.elapsedSeconds,
        ...(progress.estimatedRemainingSeconds !== undefined && {
          estimatedRemainingSeconds: progress.estimatedRemainingSeconds,
        }),
        timestamp: new Date().toISOString(),
      };

      callback(event);
    }, intervalMs);

    logger.debug({ intervalMs }, 'Started periodic progress emission');
  }

  /**
   * Stop the tracker and cleanup
   */
  stop(): void {
    this.stopped = true;

    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }

    logger.debug(
      {
        workOrderId: this.workOrderId,
        runId: this.runId,
        finalToolCallCount: this.toolCallCount,
        finalPhase: this.currentPhase,
      },
      'ProgressTracker stopped'
    );
  }

  /**
   * Reset the tracker state
   */
  reset(): void {
    this.startTime = Date.now();
    this.toolCallCount = 0;
    this.recentToolCalls = [];
    this.recentOutputText = [];
    this.currentPhase = 'Starting';
    this.phaseStartTime = Date.now();
    this.stopped = false;
  }

  /**
   * Calculate progress percentage
   */
  private calculatePercentage(elapsedSeconds: number): number {
    // Time factor (0-30% of total)
    const timeFactor = Math.min(
      elapsedSeconds / this.expectedDurationSeconds,
      1
    ) * 0.3;

    // Tool call factor (0-30% of total)
    const toolFactor = Math.min(
      this.toolCallCount / this.expectedToolCalls,
      1
    ) * 0.3;

    // Phase factor (0-40% of total, based on phase weights)
    const phaseWeight = PHASE_WEIGHTS[this.currentPhase];
    const phaseFactor = (phaseWeight / 100) * 0.4;

    // Combine factors
    const rawPercentage = (timeFactor + toolFactor + phaseFactor) * 100;

    // Clamp to 0-99 (never show 100% until actually complete)
    return Math.min(Math.floor(rawPercentage), 99);
  }

  /**
   * Update phase based on recent tool calls
   */
  private updatePhaseFromTools(): void {
    if (this.recentToolCalls.length === 0) {
      return;
    }

    // Don't change phase too quickly
    const now = Date.now();
    if (now - this.phaseStartTime < this.minPhaseTimeMs) {
      return;
    }

    // Count tool types in recent calls
    const recentTools = this.recentToolCalls.slice(-5);
    const readingCount = recentTools.filter(t => READING_TOOLS.includes(t)).length;
    const writingCount = recentTools.filter(t => WRITING_TOOLS.includes(t)).length;

    // Determine new phase based on dominant tool type
    let newPhase = this.currentPhase;

    if (readingCount >= 3 && this.currentPhase === 'Starting') {
      newPhase = 'Reading';
    } else if (writingCount >= 2 && ['Starting', 'Reading', 'Planning'].includes(this.currentPhase)) {
      newPhase = 'Implementing';
    }

    if (newPhase !== this.currentPhase) {
      this.transitionPhase(newPhase);
    }
  }

  /**
   * Update phase based on agent output patterns
   */
  private updatePhaseFromOutput(): void {
    if (this.recentOutputText.length === 0) {
      return;
    }

    const now = Date.now();
    if (now - this.phaseStartTime < this.minPhaseTimeMs) {
      return;
    }

    const recentText = this.recentOutputText.join(' ');

    // Check for phase indicators
    let newPhase = this.currentPhase;

    if (TESTING_PATTERNS.some(p => recentText.includes(p))) {
      if (['Starting', 'Reading', 'Planning', 'Implementing'].includes(this.currentPhase)) {
        newPhase = 'Testing';
      }
    } else if (FINALIZING_PATTERNS.some(p => recentText.includes(p))) {
      if (['Testing', 'Implementing'].includes(this.currentPhase)) {
        newPhase = 'Finalizing';
      }
    } else if (PLANNING_PATTERNS.some(p => recentText.includes(p))) {
      if (['Starting', 'Reading'].includes(this.currentPhase)) {
        newPhase = 'Planning';
      }
    }

    if (newPhase !== this.currentPhase) {
      this.transitionPhase(newPhase);
    }
  }

  /**
   * Transition to a new phase
   */
  private transitionPhase(newPhase: ExecutionPhase): void {
    logger.info(
      {
        previousPhase: this.currentPhase,
        newPhase,
        toolCallCount: this.toolCallCount,
        elapsedSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      },
      'Phase transition'
    );

    this.currentPhase = newPhase;
    this.phaseStartTime = Date.now();
  }

  /**
   * Manually set the current phase
   */
  setPhase(phase: ExecutionPhase): void {
    this.transitionPhase(phase);
  }

  /**
   * Get the elapsed time in seconds
   */
  getElapsedSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get the current tool call count
   */
  getToolCallCount(): number {
    return this.toolCallCount;
  }
}

/**
 * Create a progress tracker instance
 */
export function createProgressTracker(
  workOrderId: string,
  runId: string,
  options?: ProgressOptions
): ProgressTracker {
  return new ProgressTracker(workOrderId, runId, options);
}
