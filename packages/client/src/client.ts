/**
 * AgentGate Client SDK - Main Client Class
 */

import type { AgentGateClientConfig } from './types.js';
import {
  AgentGateError,
  NetworkError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  ConflictError,
  RateLimitError,
  ServerError,
} from './errors.js';
import { WorkOrdersResource } from './resources/work-orders.js';
import { RunsResource } from './resources/runs.js';
import { ProfilesResource } from './resources/profiles.js';
import { AuditResource } from './resources/audit.js';

interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * AgentGate API Client
 *
 * Provides type-safe access to all AgentGate API endpoints.
 *
 * @example
 * ```typescript
 * const client = new AgentGateClient({
 *   baseUrl: 'http://localhost:3000',
 *   apiKey: 'your-api-key',
 * });
 *
 * // Create a work order
 * const workOrder = await client.workOrders.create({
 *   taskPrompt: 'Implement feature X',
 *   workspaceSource: { type: 'github', repo: 'owner/repo' },
 * });
 *
 * // Stream run events
 * for await (const event of client.runs.streamEvents(runId)) {
 *   console.log(event.type, event.data);
 * }
 * ```
 */
export class AgentGateClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;
  private fetchFn: typeof fetch;

  /** Work orders resource */
  public readonly workOrders: WorkOrdersResource;

  /** Runs resource */
  public readonly runs: RunsResource;

  /** Profiles resource */
  public readonly profiles: ProfilesResource;

  /** Audit resource */
  public readonly audit: AuditResource;

  constructor(config: AgentGateClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
    this.fetchFn = config.fetch ?? fetch;

    // Initialize resources
    const requestFn = this.request.bind(this);
    const getHeaders = () => this.getHeaders();

    this.workOrders = new WorkOrdersResource(requestFn);
    this.runs = new RunsResource(requestFn, this.baseUrl, getHeaders);
    this.profiles = new ProfilesResource(requestFn);
    this.audit = new AuditResource(requestFn);
  }

  /**
   * Get headers for requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    return headers;
  }

  /**
   * Make an HTTP request to the API
   */
  private async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; params?: Record<string, string> } = {}
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        url.searchParams.set(key, value);
      }
    }

    const headers = this.getHeaders();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchFn(url.toString(), {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        this.handleError(response.status, data.error);
      }

      return data.data as T;
    } catch (error) {
      if (error instanceof AgentGateError) throw error;

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new NetworkError('Request timeout');
      }

      throw new NetworkError('Request failed', error as Error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle API error responses
   */
  private handleError(status: number, error: ApiErrorResponse): never {
    switch (status) {
      case 400:
        throw new ValidationError(error.message, error.details);
      case 401:
        throw new AuthenticationError(error.message);
      case 404:
        throw new NotFoundError('Resource', error.message);
      case 409:
        throw new ConflictError(error.message);
      case 429:
        throw new RateLimitError(error.message);
      default:
        if (status >= 500) {
          throw new ServerError(error.message, status);
        }
        throw new AgentGateError(error.message, error.code, status, error.details);
    }
  }
}
