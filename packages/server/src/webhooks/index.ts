/**
 * Webhook System
 *
 * HTTP webhook delivery infrastructure for AgentGate.
 * Supports event-based webhooks with HMAC-SHA256 signatures
 * and exponential backoff retry.
 */

// Export types
export type {
  WebhookEventType,
  WebhookConfig,
  WebhookPayload,
  DeliveryResult,
  WebhookDelivery,
  DeliveryOptions,
  WebhookEventContext,
  DeliveryListener,
} from './types.js';

// Export registry
export {
  WebhookRegistry,
  defaultWebhookRegistry,
} from './registry.js';

// Export delivery
export {
  WebhookDeliveryService,
  defaultDeliveryService,
} from './delivery.js';

// Export signatures
export {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  SIGNATURE_VERSION,
  MAX_TIMESTAMP_AGE_MS,
  generateSignature,
  parseSignatureHeader,
  verifySignature,
  generateWebhookHeaders,
} from './signatures.js';

// Export retry utilities
export {
  DEFAULT_DELIVERY_OPTIONS,
  calculateRetryDelay,
  shouldRetry,
  shouldRetryError,
  RetryScheduler,
} from './retry.js';

// Export events
export {
  WebhookEventData,
  WebhookEventDispatcher,
  defaultEventDispatcher,
} from './events.js';
