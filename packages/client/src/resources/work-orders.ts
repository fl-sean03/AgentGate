/**
 * Work Orders Resource API
 */

import type {
  WorkOrderSummary,
  WorkOrderDetail,
  CreateWorkOrderOptions,
  PaginatedResponse,
  ListOptions,
} from '../types.js';

export interface WorkOrdersListOptions extends ListOptions {
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
}

export interface WorkOrderCancelResponse {
  id: string;
  status: string;
  message: string;
}

export interface WorkOrderAuditResponse {
  workOrderId: string;
  runs: Array<{
    runId: string;
    startedAt: string;
    completedAt: string | null;
    snapshotCount: number;
    changeCount: number;
  }>;
}

export type RequestFn = <T>(
  method: string,
  path: string,
  options?: { body?: unknown; params?: Record<string, string> }
) => Promise<T>;

/**
 * Work Orders resource methods
 */
export class WorkOrdersResource {
  constructor(private request: RequestFn) {}

  /**
   * List work orders with optional filters
   */
  async list(
    options: WorkOrdersListOptions = {}
  ): Promise<PaginatedResponse<WorkOrderSummary>> {
    const params: Record<string, string> = {};
    if (options.limit) params.limit = String(options.limit);
    if (options.offset) params.offset = String(options.offset);
    if (options.status) params.status = options.status;

    return this.request('GET', '/api/v1/work-orders', { params });
  }

  /**
   * Get detailed work order by ID
   */
  async get(id: string): Promise<WorkOrderDetail> {
    return this.request('GET', `/api/v1/work-orders/${id}`);
  }

  /**
   * Create a new work order
   */
  async create(options: CreateWorkOrderOptions): Promise<WorkOrderSummary> {
    return this.request('POST', '/api/v1/work-orders', {
      body: {
        taskPrompt: options.taskPrompt,
        workspaceSource: options.workspaceSource,
        agentType: options.agentType ?? 'claude-code-subscription',
        harness: options.harness,
      },
    });
  }

  /**
   * Cancel a work order
   */
  async cancel(id: string): Promise<WorkOrderCancelResponse> {
    return this.request('DELETE', `/api/v1/work-orders/${id}`);
  }

  /**
   * Get audit summary for a work order
   */
  async getAudit(id: string): Promise<WorkOrderAuditResponse> {
    return this.request('GET', `/api/v1/work-orders/${id}/audit`);
  }
}
