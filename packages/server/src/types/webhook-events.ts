/**
 * Webhook Event Types
 *
 * Defines webhook event types and payloads for B2B2C integrations.
 * These events are fired when work orders and runs change state.
 *
 * @module types/webhook-events
 */

import type { WorkOrderStatus } from './work-order.js';

/**
 * Supported webhook event types
 */
export const WebhookEventType = {
  /** Fired when a run starts executing */
  RUN_STARTED: 'run.started',
  /** Fired when a run completes successfully */
  RUN_COMPLETED: 'run.completed',
  /** Fired when a run fails */
  RUN_FAILED: 'run.failed',
  /** Fired when a run is cancelled */
  RUN_CANCELLED: 'run.cancelled',
  /** Fired when a work order's status changes */
  WORK_ORDER_STATUS_CHANGED: 'work_order.status_changed',
  /** Fired when credits are deducted */
  CREDITS_DEDUCTED: 'credits.deducted',
} as const;

export type WebhookEventType = (typeof WebhookEventType)[keyof typeof WebhookEventType];

/**
 * Base webhook event structure
 */
export interface WebhookEventBase {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: WebhookEventType;
  /** ISO 8601 timestamp of when the event occurred */
  timestamp: string;
  /** API version */
  apiVersion: string;
}

/**
 * Run started event payload
 */
export interface RunStartedEventData {
  /** Run ID */
  runId: string;
  /** Work order ID */
  workOrderId: string;
  /** Task prompt */
  taskPrompt: string;
  /** Repository identifier */
  repository: string;
  /** Branch name (if applicable) */
  branch?: string;
  /** Maximum iterations configured */
  maxIterations: number;
  /** ISO 8601 timestamp of when the run started */
  startedAt: string;
  /** B2B2C tenant user ID (if provided) */
  tenantUserId?: string;
}

/**
 * Run completed event payload
 */
export interface RunCompletedEventData {
  /** Run ID */
  runId: string;
  /** Work order ID */
  workOrderId: string;
  /** Number of iterations executed */
  iterations: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Pull request URL (if created) */
  prUrl?: string;
  /** Pull request number (if created) */
  prNumber?: number;
  /** Actual cost in USD */
  costUsd?: number;
  /** ISO 8601 timestamp of when the run completed */
  completedAt: string;
  /** B2B2C tenant user ID (if provided) */
  tenantUserId?: string;
}

/**
 * Run failed event payload
 */
export interface RunFailedEventData {
  /** Run ID */
  runId: string;
  /** Work order ID */
  workOrderId: string;
  /** Number of iterations executed before failure */
  iterations: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message */
  error: string;
  /** ISO 8601 timestamp of when the run failed */
  failedAt: string;
  /** B2B2C tenant user ID (if provided) */
  tenantUserId?: string;
}

/**
 * Run cancelled event payload
 */
export interface RunCancelledEventData {
  /** Run ID */
  runId: string;
  /** Work order ID */
  workOrderId: string;
  /** Number of iterations executed before cancellation */
  iterations: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Reason for cancellation */
  reason?: string;
  /** ISO 8601 timestamp of when the run was cancelled */
  cancelledAt: string;
  /** B2B2C tenant user ID (if provided) */
  tenantUserId?: string;
}

/**
 * Work order status changed event payload
 */
export interface WorkOrderStatusChangedEventData {
  /** Work order ID */
  workOrderId: string;
  /** Previous status */
  previousStatus: WorkOrderStatus;
  /** New status */
  newStatus: WorkOrderStatus;
  /** ISO 8601 timestamp of when the status changed */
  changedAt: string;
  /** Error message (if status is 'failed') */
  error?: string;
  /** B2B2C tenant user ID (if provided) */
  tenantUserId?: string;
}

/**
 * Credits deducted event payload
 */
export interface CreditsDeductedEventData {
  /** Transaction ID */
  transactionId: string;
  /** Run ID that triggered the deduction */
  runId: string;
  /** Work order ID */
  workOrderId: string;
  /** Amount deducted in cents */
  amountCents: number;
  /** New balance in cents */
  newBalanceCents: number;
  /** ISO 8601 timestamp of when credits were deducted */
  deductedAt: string;
  /** B2B2C tenant user ID (if provided) */
  tenantUserId?: string;
}

/**
 * Webhook event union type
 */
export type WebhookEvent =
  | (WebhookEventBase & { type: typeof WebhookEventType.RUN_STARTED; data: RunStartedEventData })
  | (WebhookEventBase & { type: typeof WebhookEventType.RUN_COMPLETED; data: RunCompletedEventData })
  | (WebhookEventBase & { type: typeof WebhookEventType.RUN_FAILED; data: RunFailedEventData })
  | (WebhookEventBase & { type: typeof WebhookEventType.RUN_CANCELLED; data: RunCancelledEventData })
  | (WebhookEventBase & { type: typeof WebhookEventType.WORK_ORDER_STATUS_CHANGED; data: WorkOrderStatusChangedEventData })
  | (WebhookEventBase & { type: typeof WebhookEventType.CREDITS_DEDUCTED; data: CreditsDeductedEventData });

/**
 * Webhook delivery status
 */
export const WebhookDeliveryStatus = {
  PENDING: 'pending',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  RETRYING: 'retrying',
} as const;

export type WebhookDeliveryStatus = (typeof WebhookDeliveryStatus)[keyof typeof WebhookDeliveryStatus];

/**
 * Webhook delivery record
 */
export interface WebhookDeliveryRecord {
  /** Delivery attempt ID */
  id: string;
  /** Event being delivered */
  eventId: string;
  /** Webhook endpoint URL */
  url: string;
  /** HTTP status code of response */
  statusCode?: number;
  /** Response body (truncated) */
  responseBody?: string;
  /** Error message if failed */
  error?: string;
  /** Number of retry attempts */
  attemptNumber: number;
  /** ISO 8601 timestamp of attempt */
  attemptedAt: string;
  /** Delivery status */
  status: WebhookDeliveryStatus;
}
