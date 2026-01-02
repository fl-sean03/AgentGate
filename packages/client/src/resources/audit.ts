/**
 * Audit Resource API
 */

import type { AuditRecord, ConfigSnapshot, ConfigChange } from '../types.js';

export interface AuditSnapshotsResponse {
  items: ConfigSnapshot[];
  total: number;
}

export interface AuditChangesResponse {
  items: ConfigChange[];
  total: number;
  summary: {
    totalChanges: number;
    byInitiator: {
      user: number;
      strategy: number;
      system: number;
    };
  };
}

export type RequestFn = <T>(
  method: string,
  path: string,
  options?: { body?: unknown; params?: Record<string, string> }
) => Promise<T>;

/**
 * Audit resource methods
 */
export class AuditResource {
  constructor(private request: RequestFn) {}

  /**
   * Get audit record for a run
   */
  async getRecord(runId: string): Promise<AuditRecord> {
    return this.request('GET', `/api/v1/audit/runs/${runId}`);
  }

  /**
   * Get config snapshots for a run
   * @param runId Run ID
   * @param iteration Optional iteration number to filter by
   */
  async getSnapshots(runId: string, iteration?: number): Promise<AuditSnapshotsResponse> {
    const params: Record<string, string> = {};
    if (iteration !== undefined) params.iteration = String(iteration);
    return this.request('GET', `/api/v1/audit/runs/${runId}/snapshots`, { params });
  }

  /**
   * Get config changes for a run
   */
  async getChanges(runId: string): Promise<AuditChangesResponse> {
    return this.request('GET', `/api/v1/audit/runs/${runId}/changes`);
  }
}
