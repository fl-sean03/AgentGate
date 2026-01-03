/**
 * Queue Facade - Phase 2 Feature Flag Integration
 *
 * Provides a unified interface that delegates to either the legacy
 * QueueManager or the new queue system based on feature flags.
 *
 * This enables:
 * - Feature flag-based switching between systems
 * - Shadow mode for result comparison
 * - Gradual rollout via percentage-based routing
 *
 * @module queue/queue-facade
 *
 * @deprecated Phase 4 Notice: The QueueFacade and its feature flag routing are
 * deprecated migration tools. Once the new queue system is fully validated:
 * 1. Set useNewQueueSystem=true and rolloutPercent=100
 * 2. The facade will be simplified to directly use the new queue system
 * 3. Legacy queue support will be removed in a future release
 *
 * Methods marked as @deprecated will be removed when the legacy queue is removed.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';
import type {
  QueueManager,
  EnqueueOptions,
  EnqueueResult,
  QueuePosition,
  QueueStats,
} from '../control-plane/queue-manager.js';
import { Scheduler, QueuedWorkOrder } from './scheduler.js';
import { ResourceMonitor } from './resource-monitor.js';
import { RetryManager } from './retry-manager.js';
import { WorkOrderStateMachine } from './state-machine.js';
import type { QueueConfig } from '../config/index.js';

const log = createLogger('queue-facade');

/**
 * Configuration for QueueFacade.
 */
export interface QueueFacadeConfig {
  /** Enable new queue system (default: false) */
  useNewQueueSystem: boolean;

  /** Run in shadow mode - both systems process (default: false) */
  shadowMode: boolean;

  /** Rollout percentage for gradual migration (0-100) */
  rolloutPercent: number;
}

/**
 * Events emitted by QueueFacade.
 */
export interface QueueFacadeEvents {
  /** Emitted when shadow mode detects a difference between systems */
  'shadow-mismatch': (workOrderId: string, legacy: unknown, newSystem: unknown) => void;

  /** Emitted when a work order is routed to a specific system */
  'routed': (workOrderId: string, system: 'legacy' | 'new') => void;
}

/**
 * Statistics from QueueFacade.
 */
export interface QueueFacadeStats {
  /** Current active system */
  activeSystem: 'legacy' | 'new' | 'both';

  /** Whether shadow mode is enabled */
  shadowMode: boolean;

  /** Current rollout percentage */
  rolloutPercent: number;

  /** Stats from legacy system (if active) */
  legacyStats: QueueStats | undefined;

  /** Stats from new system (if active) */
  newSystemStats: {
    queueDepth: number;
    isRunning: boolean;
    availableSlots: number;
    activeSlots: number;
  } | undefined;

  /** Counters */
  counters: {
    totalRouted: number;
    routedToLegacy: number;
    routedToNew: number;
    shadowMismatches: number;
  };
}

/**
 * Simple hash function for consistent routing.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Determine if a work order should use the new queue system.
 */
function shouldUseNewQueue(
  workOrderId: string,
  config: QueueFacadeConfig
): boolean {
  // If new system is fully enabled, always use it
  if (config.useNewQueueSystem && config.rolloutPercent >= 100) {
    return true;
  }

  // If new system is disabled and no rollout, use legacy
  if (!config.useNewQueueSystem && config.rolloutPercent === 0) {
    return false;
  }

  // Percentage-based routing using consistent hash
  const hash = hashString(workOrderId);
  return (hash % 100) < config.rolloutPercent;
}

/**
 * QueueFacade provides a unified interface that delegates to either
 * the legacy QueueManager or the new queue system based on configuration.
 *
 * Key features:
 * - Feature flag-based switching
 * - Shadow mode for comparing both systems
 * - Percentage-based rollout for gradual migration
 * - Event emission for monitoring routing decisions
 */
export class QueueFacade extends EventEmitter {
  private readonly config: QueueFacadeConfig;
  private readonly legacyQueue: QueueManager;
  private readonly scheduler: Scheduler | null;
  private readonly resourceMonitor: ResourceMonitor | null;
  private readonly retryManager: RetryManager | null;

  // Counters for monitoring
  private counters = {
    totalRouted: 0,
    routedToLegacy: 0,
    routedToNew: 0,
    shadowMismatches: 0,
  };

  constructor(
    legacyQueue: QueueManager,
    config: QueueFacadeConfig,
    options?: {
      scheduler?: Scheduler;
      resourceMonitor?: ResourceMonitor;
      retryManager?: RetryManager;
    }
  ) {
    super();
    this.legacyQueue = legacyQueue;
    this.config = config;
    this.scheduler = options?.scheduler ?? null;
    this.resourceMonitor = options?.resourceMonitor ?? null;
    this.retryManager = options?.retryManager ?? null;

    log.info(
      {
        useNewQueueSystem: config.useNewQueueSystem,
        shadowMode: config.shadowMode,
        rolloutPercent: config.rolloutPercent,
        hasNewSystem: !!this.scheduler,
      },
      'QueueFacade initialized'
    );
  }

  /**
   * Create a QueueFacade from the queue config.
   */
  static fromConfig(
    legacyQueue: QueueManager,
    queueConfig: QueueConfig,
    options?: {
      scheduler?: Scheduler;
      resourceMonitor?: ResourceMonitor;
      retryManager?: RetryManager;
    }
  ): QueueFacade {
    return new QueueFacade(
      legacyQueue,
      {
        useNewQueueSystem: queueConfig.useNewQueueSystem,
        shadowMode: queueConfig.shadowMode,
        rolloutPercent: queueConfig.rolloutPercent,
      },
      options
    );
  }

  /**
   * Enqueue a work order using the appropriate system.
   */
  enqueue(workOrderId: string, options: EnqueueOptions = {}): EnqueueResult {
    this.counters.totalRouted++;

    const useNew = shouldUseNewQueue(workOrderId, this.config);

    // Shadow mode: run both and compare
    if (this.config.shadowMode && this.scheduler) {
      return this.enqueueWithShadow(workOrderId, options);
    }

    // Route to appropriate system
    if (useNew && this.scheduler) {
      return this.enqueueToNew(workOrderId, options);
    }

    return this.enqueueToLegacy(workOrderId, options);
  }

  /**
   * Enqueue to legacy system.
   *
   * @deprecated This method routes to the legacy queue which is deprecated.
   * Set useNewQueueSystem=true and rolloutPercent=100 to use the new queue system.
   * Legacy queue support will be removed in a future release.
   */
  private enqueueToLegacy(
    workOrderId: string,
    options: EnqueueOptions
  ): EnqueueResult {
    this.counters.routedToLegacy++;
    this.emit('routed', workOrderId, 'legacy');

    log.debug({ workOrderId }, 'Routing to legacy queue (deprecated)');

    return this.legacyQueue.enqueue(workOrderId, options);
  }

  /**
   * Enqueue to new queue system.
   */
  private enqueueToNew(
    workOrderId: string,
    options: EnqueueOptions
  ): EnqueueResult {
    if (!this.scheduler) {
      log.warn({ workOrderId }, 'New queue system not available, falling back to legacy');
      return this.enqueueToLegacy(workOrderId, options);
    }

    this.counters.routedToNew++;
    this.emit('routed', workOrderId, 'new');

    log.debug({ workOrderId }, 'Routing to new queue system');

    // Create a state machine for this work order
    const stateMachine = new WorkOrderStateMachine({
      workOrderId,
      maxRetries: 3,
    });

    // Create queued work order
    const queuedWorkOrder: QueuedWorkOrder = {
      id: workOrderId,
      stateMachine,
      priority: options.priority ?? 0,
      submittedAt: new Date(),
      data: { options },
    };

    // Enqueue to scheduler
    const success = this.scheduler.enqueue(queuedWorkOrder);

    if (!success) {
      return {
        success: false,
        position: null,
        error: 'Queue is full',
      };
    }

    // Return compatible position info
    const queueDepth = this.scheduler.getQueueDepth();
    const position: QueuePosition = {
      position: queueDepth,
      estimatedWaitMs: null, // New system doesn't provide estimates yet
      ahead: queueDepth - 1,
      state: 'waiting',
      enqueuedAt: queuedWorkOrder.submittedAt,
    };

    return { success: true, position };
  }

  /**
   * Enqueue with shadow mode - runs both systems and compares.
   * Primary result comes from legacy system.
   *
   * @deprecated Shadow mode is a migration tool for validating the new queue system.
   * After validation, disable shadow mode and set rolloutPercent=100.
   * This method will be removed when the legacy queue is removed.
   */
  private enqueueWithShadow(
    workOrderId: string,
    options: EnqueueOptions
  ): EnqueueResult {
    log.debug({ workOrderId }, 'Shadow mode: running both systems (deprecated migration tool)');

    // Run legacy first (this is the source of truth)
    const legacyResult = this.enqueueToLegacy(workOrderId, options);

    // Run new system for comparison (don't count this in routing stats)
    if (this.scheduler) {
      try {
        const stateMachine = new WorkOrderStateMachine({
          workOrderId: `shadow-${workOrderId}`,
          maxRetries: 3,
        });

        const queuedWorkOrder: QueuedWorkOrder = {
          id: `shadow-${workOrderId}`,
          stateMachine,
          priority: options.priority ?? 0,
          submittedAt: new Date(),
          data: { options, shadow: true },
        };

        const newSuccess = this.scheduler.enqueue(queuedWorkOrder);

        // Compare results
        if (legacyResult.success !== newSuccess) {
          this.counters.shadowMismatches++;
          this.emit('shadow-mismatch', workOrderId, legacyResult, { success: newSuccess });

          log.warn(
            {
              workOrderId,
              legacySuccess: legacyResult.success,
              newSuccess,
            },
            'Shadow mode: mismatch detected'
          );
        }
      } catch (error) {
        log.error({ workOrderId, error }, 'Shadow mode: new system error');
      }
    }

    return legacyResult;
  }

  /**
   * Get position of a work order.
   */
  getPosition(workOrderId: string): QueuePosition | null {
    // Check legacy system first
    const legacyPosition = this.legacyQueue.getPosition(workOrderId);
    if (legacyPosition) {
      return legacyPosition;
    }

    // Check new system
    if (this.scheduler) {
      const queued = this.scheduler.getQueuedWorkOrders();
      const index = queued.findIndex(w => w.id === workOrderId);
      if (index !== -1) {
        const wo = queued[index]!;
        return {
          position: index + 1,
          estimatedWaitMs: null,
          ahead: index,
          state: 'waiting',
          enqueuedAt: wo.submittedAt,
        };
      }
    }

    return null;
  }

  /**
   * Cancel a work order from either system.
   */
  cancel(workOrderId: string): boolean {
    // Try legacy system
    const legacyCancelled = this.legacyQueue.cancel(workOrderId);
    if (legacyCancelled) {
      return true;
    }

    // Try new system
    if (this.scheduler) {
      const dequeued = this.scheduler.dequeue(workOrderId);
      if (dequeued) {
        return true;
      }
    }

    return false;
  }

  /**
   * Mark a work order as started in the appropriate system.
   */
  markStarted(
    workOrderId: string,
    options?: { abortController?: AbortController; maxWallClockMs?: number | null }
  ): void {
    // Legacy system handles this
    this.legacyQueue.markStarted(workOrderId, options);
  }

  /**
   * Mark a work order as completed in the appropriate system.
   */
  markCompleted(workOrderId: string): void {
    this.legacyQueue.markCompleted(workOrderId);
  }

  /**
   * Check if a work order can start immediately.
   */
  canStartImmediately(): boolean {
    if (this.config.useNewQueueSystem && this.resourceMonitor) {
      const health = this.resourceMonitor.getHealthReport();
      return health.availableSlots > 0 && health.memoryPressure !== 'critical';
    }

    return this.legacyQueue.canStartImmediately();
  }

  /**
   * Check if a work order is enqueued in either system.
   */
  isEnqueued(workOrderId: string): boolean {
    if (this.legacyQueue.isEnqueued(workOrderId)) {
      return true;
    }

    if (this.scheduler) {
      const queued = this.scheduler.getQueuedWorkOrders();
      return queued.some(w => w.id === workOrderId);
    }

    return false;
  }

  /**
   * Check if a work order is running.
   */
  isRunning(workOrderId: string): boolean {
    return this.legacyQueue.isRunning(workOrderId);
  }

  /**
   * Get combined statistics from both systems.
   */
  getStats(): QueueFacadeStats {
    const legacyStats = this.legacyQueue.getStats();

    let newSystemStats: QueueFacadeStats['newSystemStats'];
    if (this.scheduler && this.resourceMonitor) {
      const health = this.resourceMonitor.getHealthReport();
      newSystemStats = {
        queueDepth: this.scheduler.getQueueDepth(),
        isRunning: this.scheduler.getStats().isRunning,
        availableSlots: health.availableSlots,
        activeSlots: health.activeSlots,
      };
    }

    let activeSystem: 'legacy' | 'new' | 'both';
    if (this.config.shadowMode) {
      activeSystem = 'both';
    } else if (this.config.useNewQueueSystem && this.config.rolloutPercent >= 100) {
      activeSystem = 'new';
    } else if (!this.config.useNewQueueSystem && this.config.rolloutPercent === 0) {
      activeSystem = 'legacy';
    } else {
      activeSystem = 'both'; // Partial rollout
    }

    return {
      activeSystem,
      shadowMode: this.config.shadowMode,
      rolloutPercent: this.config.rolloutPercent,
      legacyStats,
      newSystemStats,
      counters: { ...this.counters },
    };
  }

  /**
   * Get the legacy queue manager for direct access.
   *
   * @deprecated The legacy queue is deprecated. Use getScheduler() for the new
   * queue system instead. This method will be removed when the legacy queue is removed.
   */
  getLegacyQueue(): QueueManager {
    return this.legacyQueue;
  }

  /**
   * Get the scheduler if available.
   */
  getScheduler(): Scheduler | null {
    return this.scheduler;
  }

  /**
   * Get the resource monitor if available.
   */
  getResourceMonitor(): ResourceMonitor | null {
    return this.resourceMonitor;
  }

  /**
   * Get the retry manager if available.
   */
  getRetryManager(): RetryManager | null {
    return this.retryManager;
  }

  /**
   * Update configuration dynamically.
   * Useful for runtime feature flag changes.
   *
   * @deprecated This method is used for feature flag-based migration which is deprecated.
   * After completing migration (useNewQueueSystem=true, rolloutPercent=100), runtime
   * configuration updates will no longer be needed and this method will be removed.
   */
  updateConfig(updates: Partial<QueueFacadeConfig>): void {
    const oldConfig = { ...this.config };

    if (updates.useNewQueueSystem !== undefined) {
      (this.config as { useNewQueueSystem: boolean }).useNewQueueSystem = updates.useNewQueueSystem;
    }
    if (updates.shadowMode !== undefined) {
      (this.config as { shadowMode: boolean }).shadowMode = updates.shadowMode;
    }
    if (updates.rolloutPercent !== undefined) {
      (this.config as { rolloutPercent: number }).rolloutPercent = updates.rolloutPercent;
    }

    log.info(
      { oldConfig, newConfig: this.config },
      'QueueFacade configuration updated (deprecated migration feature)'
    );
  }

  /**
   * Reset counters (useful for testing).
   */
  resetCounters(): void {
    this.counters = {
      totalRouted: 0,
      routedToLegacy: 0,
      routedToNew: 0,
      shadowMismatches: 0,
    };
  }
}
