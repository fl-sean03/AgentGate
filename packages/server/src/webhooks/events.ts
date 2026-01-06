/**
 * Webhook Events
 *
 * Event emitter and dispatcher for webhook events.
 */

import { EventEmitter } from 'events';
import type {
  WebhookEventType,
  WebhookEventContext,
  WebhookPayload,
} from './types.js';
import { WebhookRegistry, defaultWebhookRegistry } from './registry.js';
import { WebhookDeliveryService, defaultDeliveryService } from './delivery.js';

/**
 * Event data for each webhook event type
 */
export interface WebhookEventData {
  'run.created': {
    runId: string;
    workOrder: unknown;
    createdAt: string;
  };
  'run.started': {
    runId: string;
    startedAt: string;
  };
  'run.completed': {
    runId: string;
    result: unknown;
    completedAt: string;
    durationMs: number;
  };
  'run.failed': {
    runId: string;
    error: string;
    failedAt: string;
    durationMs?: number;
  };
  'run.cancelled': {
    runId: string;
    cancelledAt: string;
    reason?: string;
  };
  'verification.started': {
    runId: string;
    level: string;
    startedAt: string;
  };
  'verification.passed': {
    runId: string;
    level: string;
    result: unknown;
    durationMs: number;
  };
  'verification.failed': {
    runId: string;
    level: string;
    result: unknown;
    durationMs: number;
  };
  'workspace.created': {
    runId: string;
    workspaceId: string;
    template?: string;
    createdAt: string;
  };
  'workspace.destroyed': {
    runId: string;
    workspaceId: string;
    destroyedAt: string;
  };
  'tool.called': {
    runId: string;
    toolName: string;
    input: unknown;
    calledAt: string;
  };
  'tool.result': {
    runId: string;
    toolName: string;
    output: unknown;
    success: boolean;
    durationMs: number;
  };
}

/**
 * Webhook event dispatcher
 */
export class WebhookEventDispatcher extends EventEmitter {
  private readonly registry: WebhookRegistry;
  private readonly deliveryService: WebhookDeliveryService;
  private enabled = true;

  constructor(
    registry: WebhookRegistry = defaultWebhookRegistry,
    deliveryService: WebhookDeliveryService = defaultDeliveryService
  ) {
    super();
    this.registry = registry;
    this.deliveryService = deliveryService;
  }

  /**
   * Enable the dispatcher
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable the dispatcher (events will be ignored)
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Check if dispatcher is enabled
   */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Emit a webhook event
   */
  async emitEvent<T extends WebhookEventType>(
    eventType: T,
    data: WebhookEventData[T],
    context?: WebhookEventContext
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    // Emit locally for listeners
    this.emit(eventType, data, context);

    // Get matching webhooks
    const webhooks = this.registry.getForEvent(eventType, context);

    if (webhooks.length === 0) {
      return;
    }

    // Deliver to all matching webhooks
    const tenant = context
      ? {
          tenantId: context.tenantId,
          tenantUserId: context.tenantUserId,
          organizationId: context.organizationId,
        }
      : undefined;

    const deliveryPromises = webhooks.map((webhook) =>
      this.deliveryService.deliver(webhook, eventType, data, tenant).catch((error) => {
        // Emit error event for logging
        this.emit('error', {
          webhookId: webhook.id,
          eventType,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      })
    );

    // Don't block on delivery - let it happen in background
    Promise.all(deliveryPromises).catch(() => {
      // Errors already handled above
    });
  }

  /**
   * Helper: Emit run.created event
   */
  runCreated(
    runId: string,
    workOrder: unknown,
    context?: WebhookEventContext
  ): void {
    this.emitEvent('run.created', {
      runId,
      workOrder,
      createdAt: new Date().toISOString(),
    }, { ...context, runId });
  }

  /**
   * Helper: Emit run.started event
   */
  runStarted(runId: string, context?: WebhookEventContext): void {
    this.emitEvent('run.started', {
      runId,
      startedAt: new Date().toISOString(),
    }, { ...context, runId });
  }

  /**
   * Helper: Emit run.completed event
   */
  runCompleted(
    runId: string,
    result: unknown,
    durationMs: number,
    context?: WebhookEventContext
  ): void {
    this.emitEvent('run.completed', {
      runId,
      result,
      completedAt: new Date().toISOString(),
      durationMs,
    }, { ...context, runId });
  }

  /**
   * Helper: Emit run.failed event
   */
  runFailed(
    runId: string,
    error: string,
    durationMs?: number,
    context?: WebhookEventContext
  ): void {
    this.emitEvent('run.failed', {
      runId,
      error,
      failedAt: new Date().toISOString(),
      durationMs,
    }, { ...context, runId });
  }

  /**
   * Helper: Emit run.cancelled event
   */
  runCancelled(
    runId: string,
    reason?: string,
    context?: WebhookEventContext
  ): void {
    this.emitEvent('run.cancelled', {
      runId,
      cancelledAt: new Date().toISOString(),
      reason,
    }, { ...context, runId });
  }

  /**
   * Helper: Emit verification.started event
   */
  verificationStarted(
    runId: string,
    level: string,
    context?: WebhookEventContext
  ): void {
    this.emitEvent('verification.started', {
      runId,
      level,
      startedAt: new Date().toISOString(),
    }, { ...context, runId });
  }

  /**
   * Helper: Emit verification.passed event
   */
  verificationPassed(
    runId: string,
    level: string,
    result: unknown,
    durationMs: number,
    context?: WebhookEventContext
  ): void {
    this.emitEvent('verification.passed', {
      runId,
      level,
      result,
      durationMs,
    }, { ...context, runId });
  }

  /**
   * Helper: Emit verification.failed event
   */
  verificationFailed(
    runId: string,
    level: string,
    result: unknown,
    durationMs: number,
    context?: WebhookEventContext
  ): void {
    this.emitEvent('verification.failed', {
      runId,
      level,
      result,
      durationMs,
    }, { ...context, runId });
  }

  /**
   * Helper: Emit workspace.created event
   */
  workspaceCreated(
    runId: string,
    workspaceId: string,
    template?: string,
    context?: WebhookEventContext
  ): void {
    this.emitEvent('workspace.created', {
      runId,
      workspaceId,
      template,
      createdAt: new Date().toISOString(),
    }, { ...context, runId });
  }

  /**
   * Helper: Emit workspace.destroyed event
   */
  workspaceDestroyed(
    runId: string,
    workspaceId: string,
    context?: WebhookEventContext
  ): void {
    this.emitEvent('workspace.destroyed', {
      runId,
      workspaceId,
      destroyedAt: new Date().toISOString(),
    }, { ...context, runId });
  }

  /**
   * Helper: Emit tool.called event
   */
  toolCalled(
    runId: string,
    toolName: string,
    input: unknown,
    context?: WebhookEventContext
  ): void {
    this.emitEvent('tool.called', {
      runId,
      toolName,
      input,
      calledAt: new Date().toISOString(),
    }, { ...context, runId });
  }

  /**
   * Helper: Emit tool.result event
   */
  toolResult(
    runId: string,
    toolName: string,
    output: unknown,
    success: boolean,
    durationMs: number,
    context?: WebhookEventContext
  ): void {
    this.emitEvent('tool.result', {
      runId,
      toolName,
      output,
      success,
      durationMs,
    }, { ...context, runId });
  }
}

/**
 * Default event dispatcher instance
 */
export const defaultEventDispatcher = new WebhookEventDispatcher();
