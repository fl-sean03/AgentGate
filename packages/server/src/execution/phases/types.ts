/**
 * Phase Handler Types
 * v0.2.25: Defines interfaces for modular phase handlers
 *
 * Each phase (build, snapshot, verify, feedback) has:
 * - A dedicated handler implementing PhaseHandler
 * - Specific input and result types
 * - Access to shared services via PhaseContext
 */

import type {
  Run,
  Snapshot,
  VerificationReport,
  GatePlan,
  BeforeState,
  Workspace,
  AgentResult,
  ResolvedTaskSpec,
} from '../../types/index.js';
import type { StreamingEventCallback } from '../../agent/streaming-executor.js';
import type { Logger } from 'pino';

/**
 * Execution phases
 */
export const Phase = {
  BUILD: 'build',
  SNAPSHOT: 'snapshot',
  VERIFY: 'verify',
  FEEDBACK: 'feedback',
} as const;

export type Phase = (typeof Phase)[keyof typeof Phase];

/**
 * Context provided to all phase handlers
 */
export interface PhaseContext {
  // Identifiers
  workOrderId: string;
  runId: string;
  iteration: number;

  // Configuration
  taskSpec: ResolvedTaskSpec;
  workspace: Workspace;

  // State (read-only snapshot at phase start)
  run: Readonly<Run>;
  beforeState: BeforeState;

  // Services
  services: PhaseServices;

  // Optional streaming callback for real-time updates
  streamingCallback?: StreamingEventCallback;

  // Logger with context
  logger: Logger;
}

/**
 * Services available to phase handlers
 */
export interface PhaseServices {
  // Agent execution
  agentDriver: AgentDriver;

  // Snapshot capture
  snapshotter: Snapshotter;

  // Verification
  verifier: Verifier;

  // Feedback generation
  feedbackGenerator: FeedbackGenerator;

  // Result persistence
  resultPersister: ResultPersister;
}

/**
 * Agent driver interface for executing agents
 */
export interface AgentDriver {
  execute(
    request: AgentRequest,
    streamingCallback?: StreamingEventCallback
  ): Promise<AgentResult>;

  cancel(sessionId: string): Promise<void>;
}

/**
 * Request to agent driver
 */
export interface AgentRequest {
  workspacePath: string;
  taskPrompt: string;
  feedback: string | null;
  sessionId: string | null;
  iteration: number;
  constraints?: AgentConstraints;
  timeoutMs?: number;
}

/**
 * Agent constraints
 */
export interface AgentConstraints {
  maxTokens?: number;
  maxTurns?: number;
  allowedTools?: string[];
  blockedTools?: string[];
}

/**
 * Snapshotter interface for capturing workspace state
 */
export interface Snapshotter {
  capture(
    workspacePath: string,
    beforeState: BeforeState,
    options: SnapshotOptions
  ): Promise<Snapshot>;
}

/**
 * Snapshot options
 */
export interface SnapshotOptions {
  runId: string;
  iteration: number;
  taskPrompt: string;
}

/**
 * Verifier interface for running verification gates
 */
export interface Verifier {
  verify(
    snapshot: Snapshot,
    gatePlan: GatePlan,
    options: VerifyOptions
  ): Promise<VerificationReport>;
}

/**
 * Verify options
 */
export interface VerifyOptions {
  runId: string;
  iteration: number;
  skip?: boolean;
}

/**
 * Feedback generator interface
 */
export interface FeedbackGenerator {
  generate(
    snapshot: Snapshot,
    report: VerificationReport,
    gatePlan: GatePlan,
    options: FeedbackOptions
  ): Promise<string>;
}

/**
 * Feedback options
 */
export interface FeedbackOptions {
  runId: string;
  iteration: number;
}

/**
 * Result persister interface
 */
export interface ResultPersister {
  saveAgentResult(
    runId: string,
    iteration: number,
    result: AgentResult
  ): Promise<string | null>;

  saveVerificationReport(
    runId: string,
    iteration: number,
    report: VerificationReport
  ): Promise<string | null>;

  saveSnapshot(
    runId: string,
    iteration: number,
    snapshot: Snapshot
  ): Promise<string | null>;
}

/**
 * Base phase error type
 */
export interface PhaseError {
  type: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable?: boolean;
}

/**
 * Base result type for all phases
 */
export interface PhaseResult {
  success: boolean;
  error?: PhaseError;
  duration: number;
  metadata?: Record<string, unknown>;
}

/**
 * Validation result for phase inputs
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Phase handler interface
 *
 * Each phase implements this interface with specific input and result types.
 */
export interface PhaseHandler<TInput, TResult extends PhaseResult> {
  /** Handler name for logging */
  readonly name: string;

  /** Phase type */
  readonly phase: Phase;

  /**
   * Execute the phase
   *
   * @param context - Execution context with services and configuration
   * @param input - Phase-specific input
   * @returns Phase-specific result
   */
  execute(context: PhaseContext, input: TInput): Promise<TResult>;

  /**
   * Validate inputs before execution (optional)
   *
   * @param context - Execution context
   * @param input - Phase-specific input
   * @returns Validation result
   */
  validate?(context: PhaseContext, input: TInput): ValidationResult;
}

// ============================================================================
// Build Phase Types
// ============================================================================

/**
 * Input for build phase
 */
export interface BuildPhaseInput {
  taskPrompt: string;
  feedback: string | null;
  sessionId: string | null;
}

/**
 * Build-specific error
 */
export interface BuildError extends PhaseError {
  type: 'agent_crash' | 'agent_timeout' | 'agent_failure' | 'exception';
  agentOutput?: string;
}

/**
 * Result from build phase
 */
export interface BuildPhaseResult extends PhaseResult {
  sessionId: string;
  agentResult?: AgentResult;
  buildError?: BuildError;
}

// ============================================================================
// Snapshot Phase Types
// ============================================================================

/**
 * Input for snapshot phase
 */
export interface SnapshotPhaseInput {
  beforeState: BeforeState;
}

/**
 * Result from snapshot phase
 */
export interface SnapshotPhaseResult extends PhaseResult {
  snapshot?: Snapshot;
}

// ============================================================================
// Verify Phase Types
// ============================================================================

/**
 * Input for verify phase
 */
export interface VerifyPhaseInput {
  snapshot: Snapshot;
  gatePlan: GatePlan;
}

/**
 * Result from verify phase
 */
export interface VerifyPhaseResult extends PhaseResult {
  report?: VerificationReport;
  gateResults?: GateResult[];
  allPassed: boolean;
}

/**
 * Individual gate result
 */
export interface GateResult {
  gate: string;
  passed: boolean;
  duration: number;
  output: string | null;
  error: string | null;
}

// ============================================================================
// Feedback Phase Types
// ============================================================================

/**
 * Input for feedback phase
 */
export interface FeedbackPhaseInput {
  snapshot: Snapshot;
  verificationReport: VerificationReport;
  gatePlan: GatePlan;
}

/**
 * Result from feedback phase
 */
export interface FeedbackPhaseResult extends PhaseResult {
  feedback?: string;
}

// ============================================================================
// Phase Orchestrator Types
// ============================================================================

/**
 * Input to execute a full iteration
 */
export interface IterationInput {
  taskPrompt: string;
  feedback: string | null;
  sessionId: string | null;
  beforeState: BeforeState;
  gatePlan: GatePlan;
}

/**
 * Result from a full iteration
 */
export interface IterationResult {
  success: boolean;
  phases: {
    build?: BuildPhaseResult;
    snapshot?: SnapshotPhaseResult;
    verify?: VerifyPhaseResult;
    feedback?: FeedbackPhaseResult;
  };
  nextSessionId: string | null;
  nextFeedback: string | null;
  shouldContinue: boolean;
  stateTransition: string; // RunEvent
  phaseTimings: Record<Phase, number>;
}
