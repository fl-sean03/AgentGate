/**
 * Progress Emitter
 * v0.2.25: Real-time execution progress events
 *
 * Provides visibility into execution progress through:
 * - Run lifecycle events
 * - Iteration events
 * - Phase events
 * - Gate events
 * - Delivery events
 */

import { createLogger } from '../utils/logger.js';
import type { Phase } from '../execution/phases/types.js';
import type { RunResult } from '../types/index.js';

const log = createLogger('progress-emitter');

/**
 * Event types emitted during execution
 */
export type ProgressEventType =
  | 'run_started'
  | 'run_completed'
  | 'run_canceled'
  | 'run_failed'
  | 'iteration_started'
  | 'iteration_completed'
  | 'phase_started'
  | 'phase_completed'
  | 'gate_checked'
  | 'delivery_started'
  | 'delivery_completed';

/**
 * Base event structure
 */
export interface ProgressEventBase {
  type: ProgressEventType;
  timestamp: Date;
  workOrderId: string;
  runId: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Union type of all progress events
 */
export type ProgressEvent =
  | RunStartedEvent
  | RunCompletedEvent
  | RunCanceledEvent
  | RunFailedEvent
  | IterationStartedEvent
  | IterationCompletedEvent
  | PhaseStartedEvent
  | PhaseCompletedEvent
  | GateCheckedEvent
  | DeliveryStartedEvent
  | DeliveryCompletedEvent;

/**
 * Run lifecycle events
 */
export interface RunStartedEvent extends ProgressEventBase {
  type: 'run_started';
  taskSpec: {
    goal: string;
    strategy: string;
    maxIterations: number;
  };
}

export interface RunCompletedEvent extends ProgressEventBase {
  type: 'run_completed';
  result: 'succeeded' | 'failed' | 'canceled';
  iterations: number;
  durationMs: number;
  metrics?: ExecutionMetrics;
}

export interface RunCanceledEvent extends ProgressEventBase {
  type: 'run_canceled';
  reason: string;
}

export interface RunFailedEvent extends ProgressEventBase {
  type: 'run_failed';
  error: string;
}

/**
 * Iteration events
 */
export interface IterationStartedEvent extends ProgressEventBase {
  type: 'iteration_started';
  iteration: number;
  maxIterations: number;
  feedback?: string;
}

export interface IterationCompletedEvent extends ProgressEventBase {
  type: 'iteration_completed';
  iteration: number;
  success: boolean;
  phaseTimings: Record<Phase, number>;
  gateResults?: GateSummary[];
}

/**
 * Phase events
 */
export interface PhaseStartedEvent extends ProgressEventBase {
  type: 'phase_started';
  iteration: number;
  phase: Phase;
}

export interface PhaseCompletedEvent extends ProgressEventBase {
  type: 'phase_completed';
  iteration: number;
  phase: Phase;
  success: boolean;
  durationMs: number;
}

/**
 * Gate events
 */
export interface GateCheckedEvent extends ProgressEventBase {
  type: 'gate_checked';
  iteration: number;
  gate: string;
  passed: boolean;
}

/**
 * Delivery events
 */
export interface DeliveryStartedEvent extends ProgressEventBase {
  type: 'delivery_started';
}

export interface DeliveryCompletedEvent extends ProgressEventBase {
  type: 'delivery_completed';
  success: boolean;
  prUrl?: string;
  ciStatus?: string;
}

/**
 * Gate summary for events
 */
export interface GateSummary {
  name: string;
  passed: boolean;
  duration: number;
}

/**
 * Execution metrics
 */
export interface ExecutionMetrics {
  totalDurationMs: number;
  iterationCount: number;
  phaseBreakdown: Record<Phase, number>;
  agentMetrics?: {
    totalTokens: number;
    totalCostUsd: number;
    avgIterationMs: number;
  };
}

/**
 * Progress listener function
 */
export type ProgressListener = (event: ProgressEvent) => void;

/**
 * Progress emitter interface
 */
export interface ProgressEmitter {
  // Run events
  emitRunStarted(
    workOrderId: string,
    runId: string,
    taskSpec: RunStartedEvent['taskSpec']
  ): void;

  emitRunCompleted(
    workOrderId: string,
    runId: string,
    result: RunResult,
    metrics?: ExecutionMetrics
  ): void;

  emitRunCanceled(workOrderId: string, runId: string, reason: string): void;

  emitRunFailed(workOrderId: string, runId: string, error: string): void;

  // Iteration events
  emitIterationStarted(
    workOrderId: string,
    runId: string,
    iteration: number,
    maxIterations: number,
    feedback?: string
  ): void;

  emitIterationCompleted(
    workOrderId: string,
    runId: string,
    iteration: number,
    success: boolean,
    phaseTimings: Record<Phase, number>
  ): void;

  // Phase events
  emitPhaseStarted(
    workOrderId: string,
    runId: string,
    iteration: number,
    phase: Phase
  ): void;

  emitPhaseCompleted(
    workOrderId: string,
    runId: string,
    iteration: number,
    phase: Phase,
    success: boolean,
    durationMs: number
  ): void;

  // Gate events
  emitGateChecked(
    workOrderId: string,
    runId: string,
    iteration: number,
    gate: string,
    passed: boolean
  ): void;

  // Delivery events
  emitDeliveryStarted(workOrderId: string, runId: string): void;

  emitDeliveryCompleted(
    workOrderId: string,
    runId: string,
    success: boolean,
    prUrl?: string,
    ciStatus?: string
  ): void;

  // Subscription
  subscribe(listener: ProgressListener): () => void;
}

/**
 * Default progress emitter implementation
 */
export class DefaultProgressEmitter implements ProgressEmitter {
  private readonly listeners = new Set<ProgressListener>();

  // Run events
  emitRunStarted(
    workOrderId: string,
    runId: string,
    taskSpec: RunStartedEvent['taskSpec']
  ): void {
    this.emit({
      type: 'run_started',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      taskSpec,
    });
  }

  emitRunCompleted(
    workOrderId: string,
    runId: string,
    result: RunResult,
    metrics?: ExecutionMetrics
  ): void {
    const event: RunCompletedEvent = {
      type: 'run_completed',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      result: this.mapResult(result),
      iterations: metrics?.iterationCount ?? 0,
      durationMs: metrics?.totalDurationMs ?? 0,
    };
    if (metrics) {
      event.metrics = metrics;
    }
    this.emit(event);
  }

  emitRunCanceled(workOrderId: string, runId: string, reason: string): void {
    this.emit({
      type: 'run_canceled',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      reason,
    });
  }

  emitRunFailed(workOrderId: string, runId: string, error: string): void {
    this.emit({
      type: 'run_failed',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      error,
    });
  }

  // Iteration events
  emitIterationStarted(
    workOrderId: string,
    runId: string,
    iteration: number,
    maxIterations: number,
    feedback?: string
  ): void {
    const event: IterationStartedEvent = {
      type: 'iteration_started',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      iteration,
      maxIterations,
    };
    if (feedback !== undefined) {
      event.feedback = feedback;
    }
    this.emit(event);
  }

  emitIterationCompleted(
    workOrderId: string,
    runId: string,
    iteration: number,
    success: boolean,
    phaseTimings: Record<Phase, number>
  ): void {
    this.emit({
      type: 'iteration_completed',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      iteration,
      success,
      phaseTimings,
      gateResults: [],
    });
  }

  // Phase events
  emitPhaseStarted(
    workOrderId: string,
    runId: string,
    iteration: number,
    phase: Phase
  ): void {
    this.emit({
      type: 'phase_started',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      iteration,
      phase,
    });
  }

  emitPhaseCompleted(
    workOrderId: string,
    runId: string,
    iteration: number,
    phase: Phase,
    success: boolean,
    durationMs: number
  ): void {
    this.emit({
      type: 'phase_completed',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      iteration,
      phase,
      success,
      durationMs,
    });
  }

  // Gate events
  emitGateChecked(
    workOrderId: string,
    runId: string,
    iteration: number,
    gate: string,
    passed: boolean
  ): void {
    this.emit({
      type: 'gate_checked',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      iteration,
      gate,
      passed,
    });
  }

  // Delivery events
  emitDeliveryStarted(workOrderId: string, runId: string): void {
    this.emit({
      type: 'delivery_started',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
    });
  }

  emitDeliveryCompleted(
    workOrderId: string,
    runId: string,
    success: boolean,
    prUrl?: string,
    ciStatus?: string
  ): void {
    const event: DeliveryCompletedEvent = {
      type: 'delivery_completed',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      success,
    };
    if (prUrl !== undefined) {
      event.prUrl = prUrl;
    }
    if (ciStatus !== undefined) {
      event.ciStatus = ciStatus;
    }
    this.emit(event);
  }

  // Subscription
  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Internal emit
  private emit(event: ProgressEvent): void {
    // Log the event
    log.info(
      {
        eventType: event.type,
        workOrderId: event.workOrderId,
        runId: event.runId,
        ...event.metadata,
      },
      `Progress: ${event.type}`
    );

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        log.error({ error }, 'Progress listener error');
      }
    }
  }

  private mapResult(result: RunResult): 'succeeded' | 'failed' | 'canceled' {
    if (result === 'passed') return 'succeeded';
    if (result === 'canceled') return 'canceled';
    return 'failed';
  }
}

/**
 * Singleton instance
 */
let progressEmitterInstance: ProgressEmitter | null = null;

/**
 * Get or create the global progress emitter
 */
export function getProgressEmitter(): ProgressEmitter {
  if (!progressEmitterInstance) {
    progressEmitterInstance = new DefaultProgressEmitter();
  }
  return progressEmitterInstance;
}

/**
 * Reset progress emitter (for testing)
 */
export function resetProgressEmitter(): void {
  progressEmitterInstance = null;
}
