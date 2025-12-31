/**
 * Work Order API functions
 */

import { WorkOrder, WorkOrderStatus } from '../types/work-order';
import { get, post, patch } from './client';

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
  prompt: string;
  workspace_source: {
    type: 'git' | 'local' | 'archive';
    url?: string;
    branch?: string;
    path?: string;
    commit?: string;
  };
  max_iterations?: number;
  max_time?: number;
}

/**
 * List work orders with optional filtering
 */
export async function listWorkOrders(
  params?: ListWorkOrdersParams,
): Promise<ListWorkOrdersResponse> {
  return get<ListWorkOrdersResponse>('/work-orders', params as Record<string, string | number | boolean | undefined>);
}

/**
 * Get a single work order by ID
 */
export async function getWorkOrder(id: string): Promise<WorkOrder> {
  return get<WorkOrder>(`/work-orders/${id}`);
}

/**
 * Create a new work order
 */
export async function createWorkOrder(
  request: CreateWorkOrderRequest,
): Promise<WorkOrder> {
  return post<WorkOrder>('/work-orders', request);
}

/**
 * Cancel a work order
 */
export async function cancelWorkOrder(id: string): Promise<WorkOrder> {
  return patch<WorkOrder>(`/work-orders/${id}/cancel`, {});
}
