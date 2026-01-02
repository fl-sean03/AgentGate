/**
 * Runs Resource API
 */

import type { RunSummary, RunDetail, PaginatedResponse, ListOptions } from '../types.js';
import { RunStream, streamEvents, type StreamOptions } from '../stream.js';

export interface RunsListOptions extends ListOptions {
  workOrderId?: string;
  status?: 'queued' | 'building' | 'running' | 'succeeded' | 'failed' | 'canceled';
}

export interface RunConfigResponse {
  runId: string;
  config: Record<string, unknown>;
}

export interface RunStrategyStateResponse {
  runId: string;
  state: Record<string, unknown>;
}

export type RequestFn = <T>(
  method: string,
  path: string,
  options?: { body?: unknown; params?: Record<string, string> }
) => Promise<T>;

/**
 * Runs resource methods
 */
export class RunsResource {
  constructor(
    private request: RequestFn,
    private baseUrl: string,
    private getHeaders: () => Record<string, string>
  ) {}

  /**
   * List runs with optional filters
   */
  async list(options: RunsListOptions = {}): Promise<PaginatedResponse<RunSummary>> {
    const params: Record<string, string> = {};
    if (options.limit) params.limit = String(options.limit);
    if (options.offset) params.offset = String(options.offset);
    if (options.workOrderId) params.workOrderId = options.workOrderId;
    if (options.status) params.status = options.status;

    return this.request('GET', '/api/v1/runs', { params });
  }

  /**
   * Get detailed run by ID
   */
  async get(id: string): Promise<RunDetail> {
    return this.request('GET', `/api/v1/runs/${id}`);
  }

  /**
   * Get resolved harness config for a run
   */
  async getConfig(id: string): Promise<RunConfigResponse> {
    return this.request('GET', `/api/v1/runs/${id}/config`);
  }

  /**
   * Get strategy state for a run
   */
  async getStrategyState(id: string): Promise<RunStrategyStateResponse> {
    return this.request('GET', `/api/v1/runs/${id}/strategy-state`);
  }

  /**
   * Stream run events using callback pattern
   */
  stream(id: string, options: StreamOptions): RunStream {
    const stream = new RunStream(
      `${this.baseUrl}/api/v1/runs/${id}/stream`,
      this.getHeaders(),
      options
    );
    stream.connect();
    return stream;
  }

  /**
   * Stream run events using async iterator pattern
   */
  async *streamEvents(id: string) {
    yield* streamEvents(`${this.baseUrl}/api/v1/runs/${id}/stream`, this.getHeaders());
  }
}
