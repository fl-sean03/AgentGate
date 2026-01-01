/**
 * Work Order API functions
 */

import { WorkOrder, WorkOrderStatus, WorkspaceSource } from '../types/work-order';
import { get, post, del } from './client';

export interface ListWorkOrdersParams {
  status?: WorkOrderStatus;
  limit?: number;
  offset?: number;
}

export interface ListWorkOrdersResponse {
  work_orders: WorkOrder[];
  total: number;
}

export interface CreateWorkOrderRequest {
  taskPrompt: string;
  workspaceSource: {
    type: 'local' | 'github' | 'github-new';
    path?: string;
    repo?: string;
    branch?: string;
    template?: string;
  };
  maxIterations?: number;
  maxTime?: number;
}

/** Server response format for work order summary */
interface ServerWorkOrderSummary {
  id: string;
  taskPrompt: string;
  status: WorkOrderStatus;
  workspaceSource: {
    type: string;
    path?: string;
    repo?: string;
    branch?: string;
  };
  agentType: string;
  createdAt: string;
  updatedAt: string;
  runCount: number;
}

/** Server response format for paginated list */
interface ServerPaginatedResponse {
  items: ServerWorkOrderSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Transform server workspace source to dashboard format
 */
function transformWorkspaceSource(source: ServerWorkOrderSummary['workspaceSource']): WorkspaceSource {
  if (source.type === 'local') {
    return { type: 'local', path: source.path };
  }
  if (source.type === 'github' || source.type === 'github-new') {
    return { type: 'git', url: source.repo, branch: source.branch };
  }
  return { type: 'local', path: source.path };
}

/**
 * Transform server work order to dashboard format
 */
function transformWorkOrder(serverOrder: ServerWorkOrderSummary): WorkOrder {
  return {
    id: serverOrder.id,
    status: serverOrder.status,
    prompt: serverOrder.taskPrompt,
    workspace_source: transformWorkspaceSource(serverOrder.workspaceSource),
    created_at: serverOrder.createdAt,
    updated_at: serverOrder.updatedAt,
  };
}

/**
 * List work orders with optional filtering
 */
export async function listWorkOrders(
  params?: ListWorkOrdersParams,
): Promise<ListWorkOrdersResponse> {
  const response = await get<ServerPaginatedResponse>('/api/v1/work-orders', params as Record<string, string | number | boolean | undefined>);
  return {
    work_orders: response.items.map(transformWorkOrder),
    total: response.total,
  };
}

/**
 * Get a single work order by ID
 */
export async function getWorkOrder(id: string): Promise<WorkOrder> {
  const response = await get<ServerWorkOrderSummary>(`/api/v1/work-orders/${id}`);
  return transformWorkOrder(response);
}

/**
 * Create a new work order
 */
export async function createWorkOrder(
  request: CreateWorkOrderRequest,
): Promise<WorkOrder> {
  const response = await post<ServerWorkOrderSummary>('/api/v1/work-orders', request);
  return transformWorkOrder(response);
}

/** Server response for cancel operation */
interface CancelResponse {
  id: string;
  status: string;
  message: string;
}

/**
 * Cancel a work order
 */
export async function cancelWorkOrder(id: string): Promise<WorkOrder> {
  await del<CancelResponse>(`/api/v1/work-orders/${id}`);
  // Fetch the updated work order after cancellation
  return getWorkOrder(id);
}
