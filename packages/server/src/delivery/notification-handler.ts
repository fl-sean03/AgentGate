/**
 * Notification Handler (v0.2.24)
 *
 * Handles sending notifications: Slack, webhooks, email.
 *
 * @module delivery/notification-handler
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import type {
  NotificationSpec,
  NotificationConfig,
  SlackNotification,
  WebhookNotification,
  EmailNotification,
  NotificationResult,
  DeliveryResult,
} from '../types/delivery-spec.js';
import {
  isSlackNotification,
  isWebhookNotification,
  isEmailNotification,
} from '../types/delivery-spec.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('notification-handler');

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Context for notification operations
 */
export interface NotificationContext {
  notificationSpec: NotificationSpec;
  taskName: string;
  workOrderId: string;
  success: boolean;
  deliveryResult?: DeliveryResult;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Notification handler for delivery
 */
export class NotificationHandler {
  /**
   * Send notifications based on the result
   */
  async sendNotifications(context: NotificationContext): Promise<NotificationResult[]> {
    const { notificationSpec, success } = context;
    const results: NotificationResult[] = [];

    // Get the appropriate notification configs
    const configs = success
      ? (notificationSpec.onSuccess || [])
      : (notificationSpec.onFailure || []);

    if (configs.length === 0) {
      log.debug({ success }, 'No notifications configured for this outcome');
      return results;
    }

    log.info({ success, count: configs.length }, 'Sending notifications');

    // Send each notification
    for (const config of configs) {
      const result = await this.sendNotification(config, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Send a single notification
   */
  private async sendNotification(
    config: NotificationConfig,
    context: NotificationContext
  ): Promise<NotificationResult> {
    if (isSlackNotification(config)) {
      return this.sendSlackNotification(config, context);
    }

    if (isWebhookNotification(config)) {
      return this.sendWebhookNotification(config, context);
    }

    if (isEmailNotification(config)) {
      return this.sendEmailNotification(config, context);
    }

    // Unknown notification type
    return {
      type: 'unknown',
      success: false,
      error: `Unknown notification type: ${(config as { type: string }).type}`,
    };
  }

  /**
   * Send a Slack notification
   */
  private async sendSlackNotification(
    config: SlackNotification,
    context: NotificationContext
  ): Promise<NotificationResult> {
    const { taskName, workOrderId, success, deliveryResult, error } = context;

    log.debug({ channel: config.channel }, 'Sending Slack notification');

    try {
      // Build the message data
      const messageData: {
        taskName: string;
        workOrderId: string;
        success: boolean;
        deliveryResult?: DeliveryResult;
        error?: string;
      } = {
        taskName,
        workOrderId,
        success,
      };

      if (deliveryResult) {
        messageData.deliveryResult = deliveryResult;
      }

      if (error) {
        messageData.error = error;
      }

      const message = this.buildSlackMessage(config, messageData);

      // Send to Slack webhook
      const response = await fetch(config.webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
      }

      log.info({ channel: config.channel }, 'Slack notification sent');

      return {
        type: 'slack',
        success: true,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error({ error: err }, 'Failed to send Slack notification');
      return {
        type: 'slack',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Build Slack message payload
   */
  private buildSlackMessage(
    config: SlackNotification,
    data: {
      taskName: string;
      workOrderId: string;
      success: boolean;
      deliveryResult?: DeliveryResult;
      error?: string;
    }
  ): Record<string, unknown> {
    const { taskName, workOrderId, success, deliveryResult, error } = data;

    // If custom template provided, use it
    if (config.template) {
      const text = config.template
        .replace('{task}', taskName)
        .replace('{workOrderId}', workOrderId)
        .replace('{status}', success ? 'succeeded' : 'failed')
        .replace('{error}', error || 'N/A');

      const message: Record<string, unknown> = { text };
      if (config.channel) {
        message['channel'] = config.channel;
      }
      return message;
    }

    // Build default message with blocks
    const color = success ? '#36a64f' : '#dc3545';
    const status = success ? ':white_check_mark: Succeeded' : ':x: Failed';

    const fields: Array<{ title: string; value: string; short: boolean }> = [
      { title: 'Task', value: taskName, short: true },
      { title: 'Work Order', value: workOrderId, short: true },
      { title: 'Status', value: status, short: true },
    ];

    if (deliveryResult?.pr?.url) {
      fields.push({ title: 'PR', value: deliveryResult.pr.url, short: false });
    }

    if (error) {
      fields.push({ title: 'Error', value: error, short: false });
    }

    const message: Record<string, unknown> = {
      attachments: [
        {
          color,
          title: `AgentGate: ${taskName}`,
          fields,
          footer: 'AgentGate',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    if (config.channel) {
      message['channel'] = config.channel;
    }

    return message;
  }

  /**
   * Send a webhook notification
   */
  private async sendWebhookNotification(
    config: WebhookNotification,
    context: NotificationContext
  ): Promise<NotificationResult> {
    const { taskName, workOrderId, success, deliveryResult, error } = context;

    log.debug({ url: config.url }, 'Sending webhook notification');

    try {
      // Build the payload
      const payload = {
        event: success ? 'task.completed' : 'task.failed',
        timestamp: new Date().toISOString(),
        task: {
          name: taskName,
          workOrderId,
        },
        result: {
          success,
          error,
          delivery: deliveryResult,
        },
      };

      // Send to webhook
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'AgentGate/0.2.24',
        ...config.headers,
      };

      const response = await fetch(config.url, {
        method: config.method || 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook error: ${response.status} ${response.statusText}`);
      }

      log.info({ url: config.url }, 'Webhook notification sent');

      return {
        type: 'webhook',
        success: true,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error({ error: err }, 'Failed to send webhook notification');
      return {
        type: 'webhook',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send an email notification
   *
   * Note: This is a stub implementation. In production, you would
   * integrate with an email service like SendGrid, SES, etc.
   */
  private async sendEmailNotification(
    config: EmailNotification,
    context: NotificationContext
  ): Promise<NotificationResult> {
    const { taskName, workOrderId, success } = context;

    log.debug({ to: config.to }, 'Sending email notification');

    // Email sending requires external service integration
    // This is a placeholder that logs the intent
    log.warn(
      { to: config.to, taskName, workOrderId, success },
      'Email notifications require external service integration - not sent'
    );

    return {
      type: 'email',
      success: false,
      error: 'Email notifications not implemented - requires external service integration',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new notification handler
 */
export function createNotificationHandler(): NotificationHandler {
  return new NotificationHandler();
}
