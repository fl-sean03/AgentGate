/**
 * Webhook Routes
 *
 * API endpoints for managing webhooks.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'crypto';
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
} from '../types.js';
import { defaultWebhookRegistry } from '../../webhooks/registry.js';
import { defaultDeliveryService } from '../../webhooks/delivery.js';
import type {
  WebhookConfig,
  WebhookEventType,
} from '../../webhooks/types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('webhooks-routes');

/**
 * Webhook creation request body
 */
interface CreateWebhookBody {
  url: string;
  secret?: string;
  events: WebhookEventType[];
  enabled?: boolean;
  description?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Webhook update request body
 */
interface UpdateWebhookBody {
  url?: string;
  secret?: string;
  events?: WebhookEventType[];
  enabled?: boolean;
  description?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Params for webhook routes
 */
interface WebhookParams {
  id: string;
}

/**
 * Query params for deliveries
 */
interface DeliveriesQuery {
  limit?: string;
}

/**
 * Generate a random secret for webhook signing
 */
function generateSecret(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let secret = 'whsec_';
  for (let i = 0; i < 32; i++) {
    secret += chars[Math.floor(Math.random() * chars.length)];
  }
  return secret;
}

/**
 * Register webhook management routes
 */
export function registerWebhookRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/webhooks
   * List all webhooks
   */
  app.get('/api/v1/webhooks', async (_request, reply) => {
    logger.debug('Listing webhooks');

    const webhooks = defaultWebhookRegistry.list();

    // Hide secrets in response
    const sanitizedWebhooks = webhooks.map((w) => ({
      ...w,
      secret: '••••••••',
    }));

    return reply.send(
      createSuccessResponse({
        webhooks: sanitizedWebhooks,
        count: webhooks.length,
      })
    );
  });

  /**
   * GET /api/v1/webhooks/:id
   * Get a specific webhook by ID
   */
  app.get<{
    Params: WebhookParams;
  }>('/api/v1/webhooks/:id', async (request, reply) => {
    const { id } = request.params;
    logger.debug('Getting webhook', { id });

    const webhook = defaultWebhookRegistry.get(id);

    if (!webhook) {
      return reply.status(404).send(
        createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Webhook not found: ${id}`
        )
      );
    }

    // Hide secret in response
    const sanitizedWebhook = {
      ...webhook,
      secret: '••••••••',
    };

    return reply.send(
      createSuccessResponse({
        webhook: sanitizedWebhook,
      })
    );
  });

  /**
   * POST /api/v1/webhooks
   * Register a new webhook
   */
  app.post<{
    Body: CreateWebhookBody;
  }>('/api/v1/webhooks', async (request, reply) => {
    const body = request.body;
    logger.info('Creating webhook', { url: body.url });

    // Validate required fields
    if (!body.url) {
      return reply.status(400).send(
        createErrorResponse(
          ErrorCode.BAD_REQUEST,
          'Webhook URL is required'
        )
      );
    }

    // Validate URL format
    try {
      new URL(body.url);
    } catch {
      return reply.status(400).send(
        createErrorResponse(
          ErrorCode.BAD_REQUEST,
          'Invalid webhook URL'
        )
      );
    }

    if (!body.events || body.events.length === 0) {
      return reply.status(400).send(
        createErrorResponse(
          ErrorCode.BAD_REQUEST,
          'At least one event type is required'
        )
      );
    }

    const webhook: WebhookConfig = {
      id: `wh_${randomUUID().replace(/-/g, '')}`,
      url: body.url,
      secret: body.secret || generateSecret(),
      events: body.events,
      enabled: body.enabled ?? true,
      description: body.description,
      headers: body.headers,
      timeoutMs: body.timeoutMs,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      defaultWebhookRegistry.register(webhook);
      logger.info('Webhook created successfully', { id: webhook.id });

      // Return the full webhook with secret on creation
      return reply.status(201).send(
        createSuccessResponse({
          webhook,
          message: 'Save the secret - it will only be shown once',
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create webhook', { error: message });

      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          `Failed to create webhook: ${message}`
        )
      );
    }
  });

  /**
   * PATCH /api/v1/webhooks/:id
   * Update an existing webhook
   */
  app.patch<{
    Params: WebhookParams;
    Body: UpdateWebhookBody;
  }>('/api/v1/webhooks/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body;
    logger.info('Updating webhook', { id });

    const existing = defaultWebhookRegistry.get(id);

    if (!existing) {
      return reply.status(404).send(
        createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Webhook not found: ${id}`
        )
      );
    }

    // Validate URL if provided
    if (body.url) {
      try {
        new URL(body.url);
      } catch {
        return reply.status(400).send(
          createErrorResponse(
            ErrorCode.BAD_REQUEST,
            'Invalid webhook URL'
          )
        );
      }
    }

    try {
      const updated = defaultWebhookRegistry.update(id, body);

      if (!updated) {
        return reply.status(404).send(
          createErrorResponse(
            ErrorCode.NOT_FOUND,
            `Webhook not found: ${id}`
          )
        );
      }

      logger.info('Webhook updated successfully', { id });

      // Hide secret in response
      const sanitizedWebhook = {
        ...updated,
        secret: '••••••••',
      };

      return reply.send(
        createSuccessResponse({
          webhook: sanitizedWebhook,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update webhook', { error: message });

      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          `Failed to update webhook: ${message}`
        )
      );
    }
  });

  /**
   * DELETE /api/v1/webhooks/:id
   * Delete a webhook
   */
  app.delete<{
    Params: WebhookParams;
  }>('/api/v1/webhooks/:id', async (request, reply) => {
    const { id } = request.params;
    logger.info('Deleting webhook', { id });

    const existing = defaultWebhookRegistry.get(id);

    if (!existing) {
      return reply.status(404).send(
        createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Webhook not found: ${id}`
        )
      );
    }

    // Cancel any pending retries
    defaultDeliveryService.cancelPendingRetries(id);

    const deleted = defaultWebhookRegistry.unregister(id);

    if (!deleted) {
      return reply.status(404).send(
        createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Webhook not found: ${id}`
        )
      );
    }

    logger.info('Webhook deleted successfully', { id });

    return reply.send(
      createSuccessResponse({
        success: true,
        id,
      })
    );
  });

  /**
   * POST /api/v1/webhooks/:id/test
   * Send a test event to a webhook
   */
  app.post<{
    Params: WebhookParams;
  }>('/api/v1/webhooks/:id/test', async (request, reply) => {
    const { id } = request.params;
    logger.info('Sending test event to webhook', { id });

    const webhook = defaultWebhookRegistry.get(id);

    if (!webhook) {
      return reply.status(404).send(
        createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Webhook not found: ${id}`
        )
      );
    }

    try {
      // Send a test event
      const delivery = await defaultDeliveryService.deliver(
        webhook,
        'run.created', // Use a common event type for test
        {
          test: true,
          message: 'This is a test webhook delivery',
          timestamp: new Date().toISOString(),
        }
      );

      logger.info('Test event sent', { id, success: delivery.result.success });

      return reply.send(
        createSuccessResponse({
          delivery: {
            id: delivery.id,
            success: delivery.result.success,
            statusCode: delivery.result.statusCode,
            durationMs: delivery.result.durationMs,
            error: delivery.result.error,
          },
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send test event', { error: message });

      return reply.status(500).send(
        createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          `Failed to send test event: ${message}`
        )
      );
    }
  });

  /**
   * GET /api/v1/webhooks/:id/deliveries
   * Get delivery history for a webhook
   */
  app.get<{
    Params: WebhookParams;
    Querystring: DeliveriesQuery;
  }>('/api/v1/webhooks/:id/deliveries', async (request, reply) => {
    const { id } = request.params;
    const limit = parseInt(request.query.limit || '20', 10);
    logger.debug('Getting webhook deliveries', { id, limit });

    const webhook = defaultWebhookRegistry.get(id);

    if (!webhook) {
      return reply.status(404).send(
        createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Webhook not found: ${id}`
        )
      );
    }

    const deliveries = defaultDeliveryService.getDeliveryHistory(id, limit);

    return reply.send(
      createSuccessResponse({
        deliveries,
        count: deliveries.length,
      })
    );
  });

  logger.info('Webhook routes registered');
}
