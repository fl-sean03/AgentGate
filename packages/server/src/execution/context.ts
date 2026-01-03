/**
 * Execution Context Types
 * v0.2.25: Unified context objects for execution pipeline
 *
 * Replaces the 16 callback parameters with typed context objects.
 */

import type {
  Run,
  Workspace,
  BeforeState,
  GatePlan,
  WorkOrder,
  ResolvedTaskSpec,
} from '../types/index.js';
import type { PhaseServices } from './phases/types.js';
import type { Logger } from 'pino';

/**
 * Full execution context passed to ExecutionEngine
 */
export interface ExecutionContext {
  // Identifiers
  workOrderId: string;
  runId: string;

  // Configuration
  workOrder: WorkOrder;
  taskSpec: ResolvedTaskSpec;
  gatePlan: GatePlan;

  // Resources
  workspace: Workspace;
  run: Run;

  // Services
  services: PhaseServices;

  // Timing
  startTime: number;
  maxWallClockMs: number;

  // Logger with context
  logger: Logger;
}

/**
 * Execution state tracked by engine during run
 */
export interface ExecutionState {
  context: ExecutionContext;
  startTime: number;
  iteration: number;
  sessionId: string | null;
  feedback: string | null;
  beforeState: BeforeState | null;
}

/**
 * Status of a running execution
 */
export interface ExecutionStatus {
  runId: string;
  workOrderId: string;
  state: string;
  iteration: number;
  maxIterations: number;
  elapsedMs: number;
  phase?: string;
}

/**
 * Input to execute a work order
 */
export interface ExecutionInput {
  workOrder: WorkOrder;
  taskSpec: ResolvedTaskSpec;
  leaseId?: string;
}

/**
 * Result of execution
 */
export interface ExecutionResult {
  run: Run;
  iterations: IterationData[];
  deliveryResult?: DeliveryResult;
  metrics: ExecutionMetrics;
}

/**
 * Iteration data stored during execution (local engine format)
 * Note: This is different from types/run.ts IterationData which has more fields
 */
export interface IterationData {
  iteration: number;
  startTime: Date;
  endTime: Date | null;
  durationMs: number | null;
  success: boolean;
  phaseTimings: Record<string, number>;
  snapshotId: string | null;
  verificationPassed: boolean | null;
  feedbackGenerated: boolean;
  error: string | null;
}

/**
 * Delivery result from VCS operations
 */
export interface DeliveryResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  branchName?: string;
  ciStatus?: string;
  error?: string;
  durationMs: number;
}

/**
 * Metrics captured during execution
 */
export interface ExecutionMetrics {
  totalDurationMs: number;
  iterationCount: number;
  phaseBreakdown: Record<string, number>;
  agentMetrics?: {
    totalTokens: number;
    totalCostUsd: number;
    avgIterationMs: number;
  };
}

/**
 * Configuration for ExecutionEngine
 */
export interface ExecutionEngineConfig {
  // Limits
  defaultTimeoutMs: number;
  maxConcurrentRuns: number;

  // Feature flags
  useNewPhaseHandlers?: boolean;
  emitProgressEvents?: boolean;
  collectMetrics?: boolean;
}

/**
 * Create default execution engine config
 */
export function createDefaultEngineConfig(): ExecutionEngineConfig {
  return {
    defaultTimeoutMs: 3600000, // 1 hour
    maxConcurrentRuns: 10,
    useNewPhaseHandlers: true,
    emitProgressEvents: true,
    collectMetrics: true,
  };
}
