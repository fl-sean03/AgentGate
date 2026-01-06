/**
 * Webhook Delivery Service
 *
 * HTTP delivery with retry support for webhook payloads.
 */

import { randomUUID } from 'crypto';
import type {
  WebhookConfig,
  WebhookPayload,
  DeliveryResult,
  WebhookDelivery,
  DeliveryOptions,
  DeliveryListener,
  WebhookEventType,
} from './types.js';
import { generateWebhookHeaders } from './signatures.js';
import {
  RetryScheduler,
  DEFAULT_DELIVERY_OPTIONS,
  shouldRetry,
  shouldRetryError,
} from './retry.js';

/**
 * Webhook delivery service
 */
export class WebhookDeliveryService {
  private readonly options: Required<DeliveryOptions>;
  private readonly retryScheduler: RetryScheduler;
  private readonly listeners: Set<DeliveryListener> = new Set();
  private readonly deliveryHistory: Map<string, WebhookDelivery[]> = new Map();
  private readonly maxHistoryPerWebhook = 100;

  constructor(options: DeliveryOptions = {}) {
    this.options = { ...DEFAULT_DELIVERY_OPTIONS, ...options };
    this.retryScheduler = new RetryScheduler(this.options);
  }

  /**
   * Add a delivery listener
   */
  addListener(listener: DeliveryListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove a delivery listener
   */
  removeListener(listener: DeliveryListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Deliver a webhook
   */
  async deliver(
    webhook: WebhookConfig,
    eventType: WebhookEventType,
    data: unknown,
    tenant?: { tenantId?: string; tenantUserId?: string; organizationId?: string }
  ): Promise<WebhookDelivery> {
    const payload: WebhookPayload = {
      id: randomUUID(),
      type: eventType,
      timestamp: new Date().toISOString(),
      apiVersion: '2024-01',
      data,
      tenant,
    };

    const delivery = await this.deliverPayload(webhook, payload, 1);
    this.storeDelivery(webhook.id, delivery);
    return delivery;
  }

  /**
   * Deliver a payload with retry support
   */
  private async deliverPayload(
    webhook: WebhookConfig,
    payload: WebhookPayload,
    attemptNumber: number
  ): Promise<WebhookDelivery> {
    const deliveryId = `${payload.id}-${attemptNumber}`;
    const startTime = Date.now();

    const payloadJson = JSON.stringify(payload);
    const headers = generateWebhookHeaders(payloadJson, webhook.secret);

    // Merge custom headers
    if (webhook.headers) {
      Object.assign(headers, webhook.headers);
    }

    let result: DeliveryResult;

    try {
      const controller = new AbortController();
      const timeoutMs = webhook.timeoutMs ?? this.options.timeoutMs;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadJson,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;
      let responseBody: string | undefined;

      try {
        responseBody = await response.text();
        // Truncate response body
        if (responseBody.length > 1000) {
          responseBody = responseBody.slice(0, 1000) + '... (truncated)';
        }
      } catch {
        // Ignore response body errors
      }

      result = {
        success: response.ok,
        statusCode: response.status,
        responseBody,
        durationMs,
        attemptNumber,
        deliveredAt: new Date().toISOString(),
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      result = {
        success: false,
        durationMs,
        attemptNumber,
        deliveredAt: new Date().toISOString(),
        error: errorMessage,
      };
    }

    const retriesRemaining = this.options.maxRetries - attemptNumber;
    const shouldScheduleRetry =
      !result.success &&
      retriesRemaining > 0 &&
      this.shouldRetryDelivery(result);

    const delivery: WebhookDelivery = {
      id: deliveryId,
      webhookId: webhook.id,
      eventType: payload.type,
      payload,
      result,
      retriesRemaining: shouldScheduleRetry ? retriesRemaining : 0,
    };

    // Notify listeners
    if (result.success) {
      this.notifySuccess(delivery);
    } else if (shouldScheduleRetry) {
      // Schedule retry
      const { scheduledAt } = this.retryScheduler.schedule(
        deliveryId,
        attemptNumber + 1,
        async () => {
          await this.deliverPayload(webhook, payload, attemptNumber + 1);
        }
      );
      delivery.nextRetryAt = scheduledAt.toISOString();
      this.notifyRetryScheduled(delivery);
    } else {
      this.notifyFailure(delivery);
    }

    return delivery;
  }

  /**
   * Determine if delivery should be retried
   */
  private shouldRetryDelivery(result: DeliveryResult): boolean {
    if (result.statusCode && shouldRetry(result.statusCode)) {
      return true;
    }
    if (result.error && shouldRetryError(new Error(result.error))) {
      return true;
    }
    return false;
  }

  /**
   * Store delivery in history
   */
  private storeDelivery(webhookId: string, delivery: WebhookDelivery): void {
    let history = this.deliveryHistory.get(webhookId);
    if (!history) {
      history = [];
      this.deliveryHistory.set(webhookId, history);
    }

    history.unshift(delivery);

    // Trim history
    if (history.length > this.maxHistoryPerWebhook) {
      history.length = this.maxHistoryPerWebhook;
    }
  }

  /**
   * Get delivery history for a webhook
   */
  getDeliveryHistory(webhookId: string, limit = 20): WebhookDelivery[] {
    const history = this.deliveryHistory.get(webhookId);
    if (!history) {
      return [];
    }
    return history.slice(0, limit);
  }

  /**
   * Clear delivery history for a webhook
   */
  clearDeliveryHistory(webhookId: string): void {
    this.deliveryHistory.delete(webhookId);
  }

  /**
   * Cancel pending retries for a webhook
   */
  cancelPendingRetries(webhookId: string): void {
    // Find all pending retries for this webhook
    const history = this.deliveryHistory.get(webhookId);
    if (history) {
      for (const delivery of history) {
        if (delivery.nextRetryAt && this.retryScheduler.hasPending(delivery.id)) {
          this.retryScheduler.cancel(delivery.id);
        }
      }
    }
  }

  /**
   * Shutdown the delivery service
   */
  shutdown(): void {
    this.retryScheduler.cancelAll();
    this.listeners.clear();
    this.deliveryHistory.clear();
  }

  /**
   * Get count of pending retries
   */
  get pendingRetryCount(): number {
    return this.retryScheduler.pendingCount;
  }

  private notifySuccess(delivery: WebhookDelivery): void {
    for (const listener of this.listeners) {
      try {
        listener.onDeliverySuccess?.(delivery);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private notifyFailure(delivery: WebhookDelivery): void {
    for (const listener of this.listeners) {
      try {
        listener.onDeliveryFailure?.(delivery);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private notifyRetryScheduled(delivery: WebhookDelivery): void {
    for (const listener of this.listeners) {
      try {
        listener.onRetryScheduled?.(delivery);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

/**
 * Default delivery service instance
 */
export const defaultDeliveryService = new WebhookDeliveryService();
