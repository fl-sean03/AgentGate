/**
 * Webhook Types
 *
 * Type definitions for the webhook delivery system.
 */

/**
 * Supported webhook event types
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
 * Webhook configuration
 */
export interface WebhookConfig {
  /** Unique identifier */
  id: string;
  /** Target URL for webhook delivery */
  url: string;
  /** Secret for HMAC signature */
  secret: string;
  /** Event types this webhook subscribes to */
  events: WebhookEventType[];
  /** Whether the webhook is enabled */
  enabled: boolean;
  /** Optional description */
  description?: string;
  /** Optional tenant ID for filtering */
  tenantId?: string;
  /** Optional organization ID for filtering */
  organizationId?: string;
  /** HTTP headers to include */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Created timestamp */
  createdAt?: Date;
  /** Updated timestamp */
  updatedAt?: Date;
}

/**
 * Webhook payload sent to subscribers
 */
export interface WebhookPayload<T = unknown> {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: WebhookEventType;
  /** Timestamp of the event */
  timestamp: string;
  /** API version */
  apiVersion: string;
  /** Event data */
  data: T;
  /** Tenant context */
  tenant?: {
    tenantId?: string;
    tenantUserId?: string;
    organizationId?: string;
  };
}

/**
 * Result of a webhook delivery attempt
 */
export interface DeliveryResult {
  /** Whether delivery was successful */
  success: boolean;
  /** HTTP status code */
  statusCode?: number;
  /** Response body (truncated) */
  responseBody?: string;
  /** Error message if failed */
  error?: string;
  /** Duration of the request in ms */
  durationMs: number;
  /** Number of retry attempts */
  attemptNumber: number;
  /** Timestamp of delivery */
  deliveredAt: string;
}

/**
 * Webhook delivery record
 */
export interface WebhookDelivery {
  /** Unique delivery ID */
  id: string;
  /** Webhook ID */
  webhookId: string;
  /** Event type */
  eventType: WebhookEventType;
  /** Payload sent */
  payload: WebhookPayload;
  /** Delivery result */
  result: DeliveryResult;
  /** Number of retry attempts remaining */
  retriesRemaining: number;
  /** Next retry time if applicable */
  nextRetryAt?: string;
}

/**
 * Options for webhook delivery
 */
export interface DeliveryOptions {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in ms (default: 1000) */
  initialRetryDelayMs?: number;
  /** Maximum retry delay in ms (default: 60000) */
  maxRetryDelayMs?: number;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
}

/**
 * Webhook event context for filtering
 */
export interface WebhookEventContext {
  /** Run ID if applicable */
  runId?: string;
  /** Tenant ID for filtering */
  tenantId?: string;
  /** Tenant user ID */
  tenantUserId?: string;
  /** Organization ID */
  organizationId?: string;
}

/**
 * Listener for delivery events
 */
export interface DeliveryListener {
  onDeliverySuccess?: (delivery: WebhookDelivery) => void;
  onDeliveryFailure?: (delivery: WebhookDelivery) => void;
  onRetryScheduled?: (delivery: WebhookDelivery) => void;
}
