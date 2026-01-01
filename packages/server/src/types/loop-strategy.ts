import type { LoopStrategyConfig, LoopStrategyMode } from './harness-config.js';
import type { VerificationReport } from './verification.js';
import type { Snapshot } from './snapshot.js';

// Loop Decision - returned by strategy to control loop behavior
export interface LoopDecision {
  shouldContinue: boolean;
  reason: string;
  action: 'continue' | 'stop' | 'retry' | 'escalate';
  metadata: Record<string, unknown>;
}

// Loop Progress - tracks progress across iterations
export interface LoopProgress {
  iteration: number;
  totalIterations: number;
  startedAt: Date;
  lastIterationAt: Date | null;
  estimatedCompletion: Date | null;
  progressPercent: number;
  trend: 'improving' | 'stagnant' | 'regressing' | 'unknown';
  metrics: ProgressMetrics;
}

// Progress Metrics - detailed progress measurements
export interface ProgressMetrics {
  testsPassingPrevious: number;
  testsPassingCurrent: number;
  testsTotal: number;
  linesChanged: number;
  filesChanged: number;
  errorsFixed: number;
  errorsRemaining: number;
  customMetrics: Record<string, number>;
}

// Loop Detection Data - for detecting infinite loops
export interface LoopDetectionData {
  recentSnapshots: SnapshotFingerprint[];
  repeatPatterns: RepeatPattern[];
  loopDetected: boolean;
  loopType: 'exact' | 'semantic' | 'oscillating' | null;
  confidence: number;
  detectedAt: Date | null;
}

// Snapshot Fingerprint - lightweight representation for comparison
export interface SnapshotFingerprint {
  iteration: number;
  sha: string;
  fileHashes: Record<string, string>;
  errorSignature: string | null;
  createdAt: Date;
}

// Repeat Pattern - detected repetition in iterations
export interface RepeatPattern {
  patternType: 'exact' | 'semantic' | 'oscillating';
  iterations: number[];
  confidence: number;
  description: string;
}

// Loop State - complete state of the loop at any point
export interface LoopState {
  iteration: number;
  maxIterations: number;
  startedAt: Date;
  lastDecision: LoopDecision | null;
  progress: LoopProgress;
  loopDetection: LoopDetectionData;
  history: IterationHistory[];
  isTerminal: boolean;
  terminationReason: string | null;
}

// Iteration History - record of a single iteration
export interface IterationHistory {
  iteration: number;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  decision: LoopDecision;
  snapshotSha: string | null;
  verificationPassed: boolean;
  errorsCount: number;
  tokensUsed: number;
}

// Loop Context - context passed to strategy methods
export interface LoopContext {
  workOrderId: string;
  runId: string;
  taskPrompt: string;
  config: LoopStrategyConfig;
  state: LoopState;
  currentSnapshot: Snapshot | null;
  currentVerification: VerificationReport | null;
  previousSnapshots: Snapshot[];
  previousVerifications: VerificationReport[];
}

// Loop Strategy Interface - implemented by each strategy
export interface LoopStrategy {
  readonly name: string;
  readonly mode: LoopStrategyMode;

  /**
   * Initialize the strategy with configuration
   */
  initialize(config: LoopStrategyConfig): Promise<void>;

  /**
   * Called before the first iteration
   */
  onLoopStart(context: LoopContext): Promise<void>;

  /**
   * Called before each iteration
   */
  onIterationStart(context: LoopContext): Promise<void>;

  /**
   * Called after each iteration to decide whether to continue
   */
  shouldContinue(context: LoopContext): Promise<LoopDecision>;

  /**
   * Called after each iteration completes
   */
  onIterationEnd(context: LoopContext, decision: LoopDecision): Promise<void>;

  /**
   * Called when the loop terminates
   */
  onLoopEnd(context: LoopContext, finalDecision: LoopDecision): Promise<void>;

  /**
   * Get current progress estimate
   */
  getProgress(context: LoopContext): LoopProgress;

  /**
   * Detect if the loop is stuck in a cycle
   */
  detectLoop(context: LoopContext): LoopDetectionData;

  /**
   * Reset strategy state (for reuse)
   */
  reset(): void;
}

// Loop Strategy Factory - creates strategies from config
export type LoopStrategyFactory = (config: LoopStrategyConfig) => LoopStrategy;
