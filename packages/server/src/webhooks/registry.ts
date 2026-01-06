/**
 * Webhook Registry
 *
 * In-memory storage for webhook configurations.
 * The SaaS layer provides persistence by syncing with this registry.
 */

import type { WebhookConfig, WebhookEventType, WebhookEventContext } from './types.js';

/**
 * Webhook registry for managing webhook configurations
 */
export class WebhookRegistry {
  private webhooks: Map<string, WebhookConfig> = new Map();

  /**
   * Register a new webhook
   */
  register(config: WebhookConfig): void {
    if (this.webhooks.has(config.id)) {
      throw new Error(`Webhook with ID '${config.id}' already registered`);
    }
    this.webhooks.set(config.id, {
      ...config,
      createdAt: config.createdAt ?? new Date(),
      updatedAt: config.updatedAt ?? new Date(),
    });
  }

  /**
   * Update an existing webhook
   */
  update(id: string, updates: Partial<Omit<WebhookConfig, 'id'>>): WebhookConfig | null {
    const existing = this.webhooks.get(id);
    if (!existing) {
      return null;
    }

    const updated: WebhookConfig = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: new Date(),
    };

    this.webhooks.set(id, updated);
    return updated;
  }

  /**
   * Unregister a webhook
   */
  unregister(id: string): boolean {
    return this.webhooks.delete(id);
  }

  /**
   * Get a webhook by ID
   */
  get(id: string): WebhookConfig | undefined {
    return this.webhooks.get(id);
  }

  /**
   * Check if a webhook exists
   */
  has(id: string): boolean {
    return this.webhooks.has(id);
  }

  /**
   * Get all webhooks
   */
  list(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Get webhooks for a specific event type with optional context filtering
   */
  getForEvent(
    eventType: WebhookEventType,
    context?: WebhookEventContext
  ): WebhookConfig[] {
    const webhooks: WebhookConfig[] = [];

    for (const webhook of this.webhooks.values()) {
      // Skip disabled webhooks
      if (!webhook.enabled) {
        continue;
      }

      // Check if webhook subscribes to this event
      if (!webhook.events.includes(eventType)) {
        continue;
      }

      // Apply context filters if provided
      if (context) {
        // If webhook has tenantId filter, it must match
        if (webhook.tenantId && context.tenantId !== webhook.tenantId) {
          continue;
        }

        // If webhook has organizationId filter, it must match
        if (webhook.organizationId && context.organizationId !== webhook.organizationId) {
          continue;
        }
      }

      webhooks.push(webhook);
    }

    return webhooks;
  }

  /**
   * Get webhooks for a specific organization
   */
  getForOrganization(organizationId: string): WebhookConfig[] {
    return Array.from(this.webhooks.values()).filter(
      (w) => w.organizationId === organizationId
    );
  }

  /**
   * Get webhooks for a specific tenant
   */
  getForTenant(tenantId: string): WebhookConfig[] {
    return Array.from(this.webhooks.values()).filter(
      (w) => w.tenantId === tenantId
    );
  }

  /**
   * Clear all webhooks
   */
  clear(): void {
    this.webhooks.clear();
  }

  /**
   * Get total count of registered webhooks
   */
  get size(): number {
    return this.webhooks.size;
  }

  /**
   * Enable a webhook
   */
  enable(id: string): boolean {
    const webhook = this.webhooks.get(id);
    if (!webhook) {
      return false;
    }
    webhook.enabled = true;
    webhook.updatedAt = new Date();
    return true;
  }

  /**
   * Disable a webhook
   */
  disable(id: string): boolean {
    const webhook = this.webhooks.get(id);
    if (!webhook) {
      return false;
    }
    webhook.enabled = false;
    webhook.updatedAt = new Date();
    return true;
  }
}

/**
 * Default webhook registry instance
 */
export const defaultWebhookRegistry = new WebhookRegistry();
