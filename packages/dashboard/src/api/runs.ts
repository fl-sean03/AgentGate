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

/**
 * List runs with optional filtering
 */
export async function listRuns(
  params?: ListRunsParams,
): Promise<ListRunsResponse> {
  return get<ListRunsResponse>('/runs', params as Record<string, string | number | boolean | undefined>);
}

/**
 * Get a single run by ID
 */
export async function getRun(id: string): Promise<Run> {
  return get<Run>(`/runs/${id}`);
}
