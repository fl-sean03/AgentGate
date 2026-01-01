/**
 * Run API functions
 */

import { Run, RunStatus } from '../types/run';
import { get } from './client';

export interface ListRunsParams {
  work_order_id?: string;
  status?: RunStatus;
  limit?: number;
  offset?: number;
}

export interface ListRunsResponse {
  runs: Run[];
  total: number;
}

/** Server response format for run summary */
interface ServerRunSummary {
  id: string;
  status: RunStatus;
  startedAt?: string;
  completedAt?: string;
  iterationCount: number;
  workOrderId?: string;
}

/** Server response format for paginated list */
interface ServerPaginatedResponse {
  items: ServerRunSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Transform server run to dashboard format
 */
function transformRun(serverRun: ServerRunSummary): Run {
  return {
    id: serverRun.id,
    work_order_id: serverRun.workOrderId ?? '',
    status: serverRun.status,
    started_at: serverRun.startedAt ?? new Date().toISOString(),
    completed_at: serverRun.completedAt,
    iterations: [],
    total_iterations: serverRun.iterationCount,
  };
}

/**
 * List runs with optional filtering
 */
export async function listRuns(
  params?: ListRunsParams,
): Promise<ListRunsResponse> {
  // Map dashboard param name to server param name
  const serverParams: Record<string, string | number | boolean | undefined> = {};
  if (params?.work_order_id) serverParams.workOrderId = params.work_order_id;
  if (params?.status) serverParams.status = params.status;
  if (params?.limit) serverParams.limit = params.limit;
  if (params?.offset) serverParams.offset = params.offset;

  const response = await get<ServerPaginatedResponse>('/api/v1/runs', serverParams);
  return {
    runs: response.items.map(transformRun),
    total: response.total,
  };
}

/**
 * Get a single run by ID
 */
export async function getRun(id: string): Promise<Run> {
  const response = await get<ServerRunSummary>(`/api/v1/runs/${id}`);
  return transformRun(response);
}
