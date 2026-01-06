/**
 * Webhook Registry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WebhookRegistry } from '../../src/webhooks/registry.js';
import type { WebhookConfig, WebhookEventType } from '../../src/webhooks/types.js';

describe('WebhookRegistry', () => {
  let registry: WebhookRegistry;

  beforeEach(() => {
    registry = new WebhookRegistry();
  });

  const createTestWebhook = (overrides: Partial<WebhookConfig> = {}): WebhookConfig => ({
    id: 'test-webhook-1',
    url: 'https://example.com/webhook',
    secret: 'test-secret',
    events: ['run.completed', 'run.failed'],
    enabled: true,
    ...overrides,
  });

  describe('register', () => {
    it('should register a webhook', () => {
      const webhook = createTestWebhook();
      registry.register(webhook);

      expect(registry.has(webhook.id)).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should throw when registering duplicate webhook', () => {
      const webhook = createTestWebhook();
      registry.register(webhook);

      expect(() => registry.register(webhook)).toThrow();
    });

    it('should set timestamps on registration', () => {
      const webhook = createTestWebhook();
      registry.register(webhook);

      const stored = registry.get(webhook.id);
      expect(stored?.createdAt).toBeInstanceOf(Date);
      expect(stored?.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('unregister', () => {
    it('should unregister a webhook', () => {
      const webhook = createTestWebhook();
      registry.register(webhook);

      expect(registry.unregister(webhook.id)).toBe(true);
      expect(registry.has(webhook.id)).toBe(false);
    });

    it('should return false for non-existent webhook', () => {
      expect(registry.unregister('non-existent')).toBe(false);
    });
  });

  describe('get', () => {
    it('should return webhook by id', () => {
      const webhook = createTestWebhook();
      registry.register(webhook);

      const result = registry.get(webhook.id);
      expect(result?.url).toBe(webhook.url);
    });

    it('should return undefined for non-existent webhook', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update webhook properties', () => {
      const webhook = createTestWebhook();
      registry.register(webhook);

      const updated = registry.update(webhook.id, { url: 'https://new.example.com' });
      expect(updated?.url).toBe('https://new.example.com');
    });

    it('should return null for non-existent webhook', () => {
      expect(registry.update('non-existent', { url: 'https://new.example.com' })).toBeNull();
    });

    it('should update timestamp on update', async () => {
      const webhook = createTestWebhook();
      registry.register(webhook);

      const original = registry.get(webhook.id)?.updatedAt;
      await new Promise((resolve) => setTimeout(resolve, 10));

      registry.update(webhook.id, { description: 'Updated' });
      const updated = registry.get(webhook.id)?.updatedAt;

      expect(updated?.getTime()).toBeGreaterThan(original?.getTime() ?? 0);
    });
  });

  describe('getForEvent', () => {
    it('should return webhooks for event type', () => {
      registry.register(createTestWebhook({ id: 'wh-1', events: ['run.completed'] }));
      registry.register(createTestWebhook({ id: 'wh-2', events: ['run.failed'] }));
      registry.register(createTestWebhook({ id: 'wh-3', events: ['run.completed', 'run.failed'] }));

      const completed = registry.getForEvent('run.completed');
      expect(completed).toHaveLength(2);
      expect(completed.map((w) => w.id)).toContain('wh-1');
      expect(completed.map((w) => w.id)).toContain('wh-3');
    });

    it('should exclude disabled webhooks', () => {
      registry.register(createTestWebhook({ id: 'wh-1', enabled: true }));
      registry.register(createTestWebhook({ id: 'wh-2', enabled: false }));

      const webhooks = registry.getForEvent('run.completed');
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].id).toBe('wh-1');
    });

    it('should filter by tenant context', () => {
      registry.register(createTestWebhook({ id: 'wh-1', tenantId: 'tenant-1' }));
      registry.register(createTestWebhook({ id: 'wh-2', tenantId: 'tenant-2' }));
      registry.register(createTestWebhook({ id: 'wh-3' })); // No tenant filter

      const webhooks = registry.getForEvent('run.completed', { tenantId: 'tenant-1' });
      expect(webhooks).toHaveLength(2);
      expect(webhooks.map((w) => w.id)).toContain('wh-1');
      expect(webhooks.map((w) => w.id)).toContain('wh-3');
    });

    it('should filter by organization context', () => {
      registry.register(createTestWebhook({ id: 'wh-1', organizationId: 'org-1' }));
      registry.register(createTestWebhook({ id: 'wh-2', organizationId: 'org-2' }));

      const webhooks = registry.getForEvent('run.completed', { organizationId: 'org-1' });
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].id).toBe('wh-1');
    });
  });

  describe('enable/disable', () => {
    it('should enable a webhook', () => {
      registry.register(createTestWebhook({ id: 'wh-1', enabled: false }));

      expect(registry.enable('wh-1')).toBe(true);
      expect(registry.get('wh-1')?.enabled).toBe(true);
    });

    it('should disable a webhook', () => {
      registry.register(createTestWebhook({ id: 'wh-1', enabled: true }));

      expect(registry.disable('wh-1')).toBe(true);
      expect(registry.get('wh-1')?.enabled).toBe(false);
    });

    it('should return false for non-existent webhook', () => {
      expect(registry.enable('non-existent')).toBe(false);
      expect(registry.disable('non-existent')).toBe(false);
    });
  });

  describe('list', () => {
    it('should return all webhooks', () => {
      registry.register(createTestWebhook({ id: 'wh-1' }));
      registry.register(createTestWebhook({ id: 'wh-2' }));

      expect(registry.list()).toHaveLength(2);
    });
  });

  describe('clear', () => {
    it('should remove all webhooks', () => {
      registry.register(createTestWebhook({ id: 'wh-1' }));
      registry.register(createTestWebhook({ id: 'wh-2' }));

      registry.clear();

      expect(registry.size).toBe(0);
    });
  });
});
