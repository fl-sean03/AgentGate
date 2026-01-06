/**
 * Webhooks Resource
 *
 * Manage webhook subscriptions for B2B organizations.
 */

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'run.created'
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'verification.started'
  | 'verification.passed'
  | 'verification.failed'
  | 'workspace.created'
  | 'workspace.destroyed'
  | 'tool.called'
  | 'tool.result';

/**
 * Webhook summary (list response)
 */
export interface WebhookSummary {
  id: string;
  url: string;
  events: WebhookEventType[];
  enabled: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Webhook detail (get response)
 */
export interface WebhookDetail extends WebhookSummary {
  headers?: Record<string, string>;
  maxRetries: number;
  timeoutMs: number;
  secret?: string;
}

/**
 * Webhook delivery record
 */
export interface WebhookDelivery {
  id: string;
  eventType: WebhookEventType;
  success: boolean;
  statusCode?: number;
  error?: string;
  durationMs: number;
  deliveredAt: string;
  attemptNumber: number;
}

/**
 * Create webhook options
 */
export interface CreateWebhookOptions {
  url: string;
  events: WebhookEventType[];
  description?: string;
  enabled?: boolean;
  headers?: Record<string, string>;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Update webhook options
 */
export interface UpdateWebhookOptions {
  url?: string;
  events?: WebhookEventType[];
  description?: string;
  enabled?: boolean;
  headers?: Record<string, string>;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Webhooks list options
 */
export interface WebhooksListOptions {
  page?: number;
  pageSize?: number;
  enabled?: boolean;
}

/**
 * Webhook deliveries list options
 */
export interface DeliveriesListOptions {
  page?: number;
  pageSize?: number;
  status?: 'success' | 'failed';
}

type RequestFn = <T>(
  method: string,
  path: string,
  options?: { body?: unknown; params?: Record<string, string> }
) => Promise<T>;

/**
 * Webhooks API resource
 */
export class WebhooksResource {
  constructor(private request: RequestFn) {}

  /**
   * List all webhooks for the current organization
   */
  async list(options: WebhooksListOptions = {}): Promise<WebhookSummary[]> {
    const params: Record<string, string> = {};
    if (options.page) params.page = String(options.page);
    if (options.pageSize) params.pageSize = String(options.pageSize);
    if (options.enabled !== undefined) params.enabled = String(options.enabled);

    return this.request('GET', '/api/v1/webhooks', { params });
  }

  /**
   * Get a webhook by ID
   */
  async get(id: string): Promise<WebhookDetail> {
    return this.request('GET', `/api/v1/webhooks/${id}`);
  }

  /**
   * Create a new webhook
   */
  async create(options: CreateWebhookOptions): Promise<WebhookDetail> {
    return this.request('POST', '/api/v1/webhooks', { body: options });
  }

  /**
   * Update a webhook
   */
  async update(id: string, options: UpdateWebhookOptions): Promise<WebhookDetail> {
    return this.request('PATCH', `/api/v1/webhooks/${id}`, { body: options });
  }

  /**
   * Delete a webhook
   */
  async delete(id: string): Promise<void> {
    return this.request('DELETE', `/api/v1/webhooks/${id}`);
  }

  /**
   * Enable a webhook
   */
  async enable(id: string): Promise<WebhookSummary> {
    return this.request('POST', `/api/v1/webhooks/${id}/enable`);
  }

  /**
   * Disable a webhook
   */
  async disable(id: string): Promise<WebhookSummary> {
    return this.request('POST', `/api/v1/webhooks/${id}/disable`);
  }

  /**
   * Regenerate webhook secret
   */
  async regenerateSecret(id: string): Promise<{ secret: string }> {
    return this.request('POST', `/api/v1/webhooks/${id}/regenerate-secret`);
  }

  /**
   * Test a webhook by sending a sample event
   */
  async test(id: string): Promise<WebhookDelivery> {
    return this.request('POST', `/api/v1/webhooks/${id}/test`);
  }

  /**
   * Get delivery history for a webhook
   */
  async getDeliveries(
    id: string,
    options: DeliveriesListOptions = {}
  ): Promise<WebhookDelivery[]> {
    const params: Record<string, string> = {};
    if (options.page) params.page = String(options.page);
    if (options.pageSize) params.pageSize = String(options.pageSize);
    if (options.status) params.status = options.status;

    return this.request('GET', `/api/v1/webhooks/${id}/deliveries`, { params });
  }
}
