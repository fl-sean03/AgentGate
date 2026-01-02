import { z } from 'zod';
import {
  LoopStrategyMode,
  CompletionDetection,
  ProgressTrackingMode,
  GitOperationMode,
} from '../../types/harness-config.js';

/**
 * Pagination query parameters
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * List work orders query parameters
 */
export const listWorkOrdersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['queued', 'running', 'waiting_for_children', 'integrating', 'succeeded', 'failed', 'canceled']).optional(),
});

export type ListWorkOrdersQuery = z.infer<typeof listWorkOrdersQuerySchema>;

/**
 * Work order ID parameter
 */
export const workOrderIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type WorkOrderIdParams = z.infer<typeof workOrderIdParamsSchema>;

/**
 * Workspace source types for creating work orders
 */
export const workspaceSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('local'),
    path: z.string().min(1),
  }),
  z.object({
    type: z.literal('github'),
    repo: z.string().min(1),
    branch: z.string().optional(),
  }),
  z.object({
    type: z.literal('github-new'),
    repo: z.string().min(1),
    template: z.string().optional(),
  }),
]);

export type WorkspaceSource = z.infer<typeof workspaceSourceSchema>;

/**
 * API Harness Loop Strategy Options
 */
export const apiLoopStrategyOptionsSchema = z.object({
  mode: z.nativeEnum(LoopStrategyMode).optional(),
  maxIterations: z.number().int().min(1).max(100).optional(),
  // Hybrid-specific options
  baseIterations: z.number().int().min(1).max(100).optional(),
  maxBonusIterations: z.number().int().min(0).max(100).optional(),
  progressThreshold: z.number().min(0).max(1).optional(),
  completionCriteria: z.array(z.nativeEnum(CompletionDetection)).optional(),
  progressTracking: z.nativeEnum(ProgressTrackingMode).optional(),
  // Ralph-specific options
  minIterations: z.number().int().min(1).max(100).optional(),
  convergenceThreshold: z.number().min(0).max(1).optional(),
  windowSize: z.number().int().min(2).max(10).optional(),
}).optional();

export type ApiLoopStrategyOptions = z.infer<typeof apiLoopStrategyOptionsSchema>;

/**
 * API Verification Options
 */
export const apiVerificationOptionsSchema = z.object({
  gatePlanSource: z.enum(['auto', 'inline', 'workspace', 'ci-workflow']).optional(),
  waitForCI: z.boolean().optional(),
  skipLevels: z.array(z.enum(['L0', 'L1', 'L2', 'L3', 'lint', 'typecheck', 'test', 'blackbox', 'contracts'])).optional(),
  ci: z.object({
    timeoutSeconds: z.number().int().min(60).max(7200).optional(),
    pollIntervalSeconds: z.number().int().min(10).max(300).optional(),
    maxIterations: z.number().int().min(1).max(10).optional(),
  }).optional(),
}).optional();

export type ApiVerificationOptions = z.infer<typeof apiVerificationOptionsSchema>;

/**
 * API Git Ops Options
 */
export const apiGitOpsOptionsSchema = z.object({
  mode: z.nativeEnum(GitOperationMode).optional(),
  branchPattern: z.string().optional(),
  draftPR: z.boolean().optional(),
  prTitlePattern: z.string().optional(),
  autoMerge: z.boolean().optional(),
}).optional();

export type ApiGitOpsOptions = z.infer<typeof apiGitOpsOptionsSchema>;

/**
 * API Execution Limits Options
 */
export const apiLimitsOptionsSchema = z.object({
  maxWallClockSeconds: z.number().int().min(60).max(86400).optional(),
  networkAllowed: z.boolean().optional(),
  maxDiskMb: z.number().int().positive().optional(),
}).optional();

export type ApiLimitsOptions = z.infer<typeof apiLimitsOptionsSchema>;

/**
 * API Harness Options - all harness configuration options for API
 */
export const apiHarnessOptionsSchema = z.object({
  profile: z.string().optional(),
  loopStrategy: apiLoopStrategyOptionsSchema,
  verification: apiVerificationOptionsSchema,
  gitOps: apiGitOpsOptionsSchema,
  limits: apiLimitsOptionsSchema,
}).optional();

export type ApiHarnessOptions = z.infer<typeof apiHarnessOptionsSchema>;

/**
 * Create work order request body
 */
export const createWorkOrderBodySchema = z.object({
  taskPrompt: z.string().min(10, 'Task prompt must be at least 10 characters'),
  workspaceSource: workspaceSourceSchema,
  agentType: z.enum([
    'claude-code-subscription',
    'openai-codex',
    'opencode',
  ]).default('claude-code-subscription'),
  // Legacy options (kept for backwards compatibility)
  maxIterations: z.number().int().min(1).max(100).default(3),
  maxTime: z.number().int().min(60).max(86400).optional(),
  // New: full harness configuration options
  harness: apiHarnessOptionsSchema,
});

export type CreateWorkOrderBody = z.infer<typeof createWorkOrderBodySchema>;

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Work order summary for list view
 */
export interface WorkOrderSummary {
  id: string;
  taskPrompt: string;
  status: 'queued' | 'running' | 'waiting_for_children' | 'integrating' | 'succeeded' | 'failed' | 'canceled';
  workspaceSource: WorkspaceSource;
  agentType: string;
  createdAt: string;
  updatedAt: string;
  runCount: number;
}

/**
 * Harness info in API response
 */
export interface HarnessInfo {
  profile: string | null;
  loopStrategy: {
    mode: string;
    maxIterations: number;
  };
  verification: {
    waitForCI: boolean;
    skipLevels: string[];
  };
  gitOps: {
    mode: string;
  };
}

/**
 * Work order detail response
 */
export interface WorkOrderDetail extends WorkOrderSummary {
  maxIterations: number;
  maxTime?: number;
  runs: RunSummary[];
  harness?: HarnessInfo;
}

/**
 * Run summary for work order detail
 */
export interface RunSummary {
  id: string;
  status: 'queued' | 'building' | 'running' | 'succeeded' | 'failed' | 'canceled';
  startedAt?: string;
  completedAt?: string;
  iterationCount: number;
}

/**
 * Run detail response
 */
export interface RunDetail extends RunSummary {
  workOrderId: string;
  branchName?: string;
  prUrl?: string;
  iterations: IterationSummary[];
}

/**
 * Iteration summary
 */
export interface IterationSummary {
  number: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  verification?: VerificationSummary;
}

/**
 * Verification summary
 */
export interface VerificationSummary {
  l0Passed: boolean;
  l1Passed: boolean;
  l2Passed?: boolean;
  l3Passed?: boolean;
  overallPassed: boolean;
}

/**
 * List runs query parameters
 */
export const listRunsQuerySchema = paginationQuerySchema.extend({
  workOrderId: z.string().optional(),
  status: z.enum(['queued', 'building', 'running', 'succeeded', 'failed', 'canceled']).optional(),
});

export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;

/**
 * Run ID parameter
 */
export const runIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type RunIdParams = z.infer<typeof runIdParamsSchema>;

/**
 * Start run response (v0.2.17 - Thrust 7)
 */
export interface StartRunResponse {
  runId: string;
  status: 'queued' | 'building' | 'running' | 'succeeded' | 'failed' | 'canceled';
  startedAt: string;
}

/**
 * Force kill request body (v0.2.23 Wave 1.3)
 */
export const forceKillBodySchema = z.object({
  /** Grace period in ms before escalating to SIGKILL (default: 5000) */
  gracePeriodMs: z.number().int().min(0).max(60000).optional(),
  /** Skip graceful shutdown and immediately SIGKILL */
  immediate: z.boolean().optional(),
  /** Reason for killing (logged for debugging) */
  reason: z.string().max(500).optional(),
}).optional();

export type ForceKillBody = z.infer<typeof forceKillBodySchema>;

/**
 * Force kill response (v0.2.23 Wave 1.3)
 */
export interface ForceKillResponse {
  /** Work order ID */
  id: string;
  /** Whether the kill was successful */
  success: boolean;
  /** Whether SIGKILL was used */
  forcedKill: boolean;
  /** Time taken to terminate the process */
  durationMs: number;
  /** New work order status */
  status: 'queued' | 'running' | 'waiting_for_children' | 'integrating' | 'succeeded' | 'failed' | 'canceled';
  /** Error message if kill failed */
  error?: string;
  /** Message describing the result */
  message: string;
}
