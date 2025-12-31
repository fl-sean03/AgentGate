import { z } from 'zod';
import type { WorkOrder, WorkspaceSource } from './work-order.js';
import type { RunSummary, RunDetail, IterationSummary, VerificationResult } from './run.js';

// Pagination Query
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// Paginated Response
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// API Response Wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta: {
    timestamp: string;
    requestId?: string;
  };
}

// API Error
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Error Codes
export const ApiErrorCode = {
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONFLICT: 'CONFLICT',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

// Work Order Summary (for list view)
export interface WorkOrderSummary {
  id: string;
  taskPrompt: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  workspaceSource: WorkspaceSource;
  agentType: string;
  createdAt: string;
  updatedAt: string;
  runCount: number;
}

// Work Order Detail (for detail view)
export interface WorkOrderDetail extends WorkOrderSummary {
  maxIterations: number;
  maxTime?: number;
  runs: RunSummary[];
}

// List Work Orders Query
export const listWorkOrdersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'canceled']).optional(),
});

export type ListWorkOrdersQuery = z.infer<typeof listWorkOrdersQuerySchema>;

// Create Work Order Request
export const createWorkOrderBodySchema = z.object({
  taskPrompt: z.string().min(10, 'Task prompt must be at least 10 characters'),
  workspaceSource: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('local'),
      path: z.string().min(1),
    }),
    z.object({
      type: z.literal('github'),
      owner: z.string().min(1),
      repo: z.string().min(1),
      branch: z.string().optional(),
    }),
    z.object({
      type: z.literal('github-new'),
      owner: z.string().min(1),
      repoName: z.string().min(1),
      private: z.boolean().optional(),
      template: z.string().optional(),
    }),
  ]),
  agentType: z.enum([
    'claude-code-subscription',
    'openai-codex',
    'opencode',
  ]).default('claude-code-subscription'),
  maxIterations: z.number().int().min(1).max(10).default(3),
  maxTime: z.number().int().min(60).max(3600).optional(),
});

export type CreateWorkOrderBody = z.infer<typeof createWorkOrderBodySchema>;

// ID Parameters
export const workOrderIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type WorkOrderIdParams = z.infer<typeof workOrderIdParamsSchema>;

export const runIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type RunIdParams = z.infer<typeof runIdParamsSchema>;

// Re-export for convenience
export type { RunSummary, RunDetail, IterationSummary, VerificationResult };
