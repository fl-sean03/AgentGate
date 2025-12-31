import { z } from 'zod';

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
  maxIterations: z.number().int().min(1).max(10).default(3),
  maxTime: z.number().int().min(60).max(3600).optional(),
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
 * Work order detail response
 */
export interface WorkOrderDetail extends WorkOrderSummary {
  maxIterations: number;
  maxTime?: number;
  runs: RunSummary[];
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
