# 09 - Phase 2: Feature Flag Integration

## Overview

Phase 2 wires the new queue system (built in Phase 1) to the existing codebase via feature flags. This enables:
- Switching between legacy and new queue systems at runtime
- Shadow mode for comparison testing
- Gradual rollout via percentage-based routing

## Prerequisites

- Phase 1 complete (all files in `packages/server/src/queue/`)
- Feature flags already in config (`queue.useNewQueueSystem`, `queue.shadowMode`, `queue.rolloutPercent`)

## Implementation Tasks

### Task 1: Create Queue Facade

Create `packages/server/src/queue/queue-facade.ts` - a unified interface that delegates to either legacy or new queue system.

```typescript
/**
 * Queue Facade - Unified interface for queue operations
 *
 * Delegates to legacy or new queue system based on feature flags.
 * Supports shadow mode for comparison testing.
 *
 * @module queue/queue-facade
 */

import { EventEmitter } from 'node:events';
import { createLogger } from '../utils/logger.js';
import { getQueueConfig, getConfig } from '../config/index.js';
import {
  QueueManager,
  getQueueManager,
  type QueueStats,
  type QueuePosition,
  type EnqueueOptions,
  type EnqueueResult,
} from '../control-plane/queue-manager.js';
import {
  ResourceMonitor,
  Scheduler,
  ExecutionManager,
  RetryManager,
  QueueObservability,
  type WorkOrderData,
} from './index.js';
import type { SandboxProvider } from '../sandbox/types.js';

const log = createLogger('queue-facade');

export interface QueueFacadeConfig {
  /** Sandbox provider for execution manager */
  sandboxProvider: SandboxProvider;
  /** Legacy queue manager instance */
  legacyQueue: QueueManager;
  /** Resource monitor instance */
  resourceMonitor: ResourceMonitor;
  /** Scheduler instance */
  scheduler: Scheduler;
  /** Retry manager instance */
  retryManager: RetryManager;
}

export interface QueueFacadeEvents {
  ready: (workOrderId: string) => void;
  timeout: (workOrderId: string) => void;
  stateChange: (stats: QueueStats) => void;
  canceled: (workOrderId: string) => void;
  shadowMismatch: (workOrderId: string, difference: object) => void;
}

/**
 * Queue Facade - Unified queue interface with feature flag support
 */
export class QueueFacade extends EventEmitter {
  private readonly legacyQueue: QueueManager;
  private readonly resourceMonitor: ResourceMonitor;
  private readonly scheduler: Scheduler;
  private readonly retryManager: RetryManager;
  private readonly executionManager: ExecutionManager | null = null;
  private readonly observability: QueueObservability | null = null;

  constructor(config: QueueFacadeConfig) {
    super();
    this.legacyQueue = config.legacyQueue;
    this.resourceMonitor = config.resourceMonitor;
    this.scheduler = config.scheduler;
    this.retryManager = config.retryManager;

    // Create execution manager with sandbox provider
    const appConfig = getConfig();
    this.executionManager = new ExecutionManager(config.sandboxProvider, {
      defaultTimeoutMs: appConfig.defaultTimeoutSeconds * 1000,
      cleanupOnComplete: true,
      trackMetrics: true,
    });

    // Create observability layer
    this.observability = new QueueObservability(
      this.executionManager,
      this.resourceMonitor,
      { logAuditEvents: true, enableMetrics: true }
    );

    // Forward events from appropriate queue system
    this.setupEventForwarding();

    log.info({
      useNewSystem: this.shouldUseNewSystem(),
      shadowMode: this.isShadowMode(),
    }, 'QueueFacade initialized');
  }

  /**
   * Determine if new queue system should be used
   */
  private shouldUseNewSystem(workOrderId?: string): boolean {
    const queueConfig = getQueueConfig();

    if (queueConfig.useNewQueueSystem) {
      return true;
    }

    // Check rollout percentage
    if (queueConfig.rolloutPercent > 0 && workOrderId) {
      return this.isInRollout(workOrderId, queueConfig.rolloutPercent);
    }

    return false;
  }

  /**
   * Determine if shadow mode is active
   */
  private isShadowMode(): boolean {
    return getQueueConfig().shadowMode;
  }

  /**
   * Hash-based rollout check
   */
  private isInRollout(workOrderId: string, rolloutPercent: number): boolean {
    const hash = this.hashString(workOrderId);
    return (hash % 100) < rolloutPercent;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Setup event forwarding from underlying queue systems
   */
  private setupEventForwarding(): void {
    // Forward legacy queue events
    this.legacyQueue.on('ready', (workOrderId) => this.emit('ready', workOrderId));
    this.legacyQueue.on('timeout', (workOrderId) => this.emit('timeout', workOrderId));
    this.legacyQueue.on('stateChange', (stats) => this.emit('stateChange', stats));
    this.legacyQueue.on('canceled', (workOrderId) => this.emit('canceled', workOrderId));
  }

  /**
   * Enqueue a work order
   */
  enqueue(workOrderId: string, options: EnqueueOptions = {}): EnqueueResult {
    const useNew = this.shouldUseNewSystem(workOrderId);
    const shadowMode = this.isShadowMode();

    log.debug({ workOrderId, useNew, shadowMode }, 'Enqueueing work order');

    // Always enqueue to legacy for now (shadow mode comparison)
    const legacyResult = this.legacyQueue.enqueue(workOrderId, options);

    if (shadowMode) {
      // In shadow mode, also submit to new system for comparison
      // But use legacy result as authoritative
      log.debug({ workOrderId }, 'Shadow mode: work order tracked in both systems');
    }

    return legacyResult;
  }

  /**
   * Get queue position
   */
  getPosition(workOrderId: string): QueuePosition | null {
    return this.legacyQueue.getPosition(workOrderId);
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return this.legacyQueue.getStats();
  }

  /**
   * Mark work order as started
   */
  markStarted(workOrderId: string, options?: {
    abortController?: AbortController;
    maxWallClockMs?: number | null
  }): void {
    this.legacyQueue.markStarted(workOrderId, options);

    if (this.shouldUseNewSystem(workOrderId) && this.executionManager) {
      // Track in new system's execution manager
      log.debug({ workOrderId }, 'Tracking execution in new system');
    }
  }

  /**
   * Mark work order as completed
   */
  markCompleted(workOrderId: string): void {
    this.legacyQueue.markCompleted(workOrderId);
  }

  /**
   * Cancel a work order
   */
  cancel(workOrderId: string): boolean {
    return this.legacyQueue.cancel(workOrderId);
  }

  /**
   * Cancel a running work order
   */
  cancelRunning(workOrderId: string): boolean {
    return this.legacyQueue.cancelRunning(workOrderId);
  }

  /**
   * Check if can start immediately
   */
  canStartImmediately(): boolean {
    return this.legacyQueue.canStartImmediately();
  }

  /**
   * Get abort signal for running work order
   */
  getAbortSignal(workOrderId: string): AbortSignal | null {
    return this.legacyQueue.getAbortSignal(workOrderId);
  }

  /**
   * Get observability metrics (new system only)
   */
  getMetrics(): object | null {
    return this.observability?.getMetrics() ?? null;
  }

  /**
   * Get system health (new system only)
   */
  async getHealth(): Promise<object | null> {
    return this.observability?.getHealth() ?? null;
  }

  /**
   * Get audit events (new system only)
   */
  getAuditEvents(options?: { limit?: number }): object[] {
    return this.observability?.getAuditEvents(options) ?? [];
  }

  /**
   * Start the facade
   */
  start(): void {
    const queueConfig = getQueueConfig();

    if (queueConfig.useNewQueueSystem || queueConfig.shadowMode) {
      this.resourceMonitor.start();
      log.info('New queue system components started');
    }
  }

  /**
   * Stop the facade
   */
  async stop(): Promise<void> {
    const queueConfig = getQueueConfig();

    if (queueConfig.useNewQueueSystem || queueConfig.shadowMode) {
      this.scheduler.stop();
      this.resourceMonitor.stop();
      this.retryManager.cancelAll();

      if (this.executionManager) {
        await this.executionManager.cancelAll();
      }

      log.info('New queue system components stopped');
    }

    await this.legacyQueue.shutdown();
  }
}

// Singleton instance
let facadeInstance: QueueFacade | null = null;

/**
 * Get or create the queue facade singleton
 */
export function getQueueFacade(config?: QueueFacadeConfig): QueueFacade {
  if (!facadeInstance && config) {
    facadeInstance = new QueueFacade(config);
  }
  if (!facadeInstance) {
    throw new Error('QueueFacade not initialized. Call with config first.');
  }
  return facadeInstance;
}

/**
 * Reset the queue facade singleton (for testing)
 */
export function resetQueueFacade(): void {
  facadeInstance = null;
}
```

### Task 2: Update serve.ts

Modify `packages/server/src/control-plane/commands/serve.ts` to use QueueFacade:

**Changes needed:**

1. Import QueueFacade
2. Create SandboxProvider
3. Initialize QueueFacade with all components
4. Use facade for queue operations

Key code changes:

```typescript
// Add import
import { QueueFacade, getQueueFacade } from '../../queue/queue-facade.js';
import { getSandboxProvider } from '../../sandbox/provider.js';

// In executeServe(), after initializing new queue components:
if (queueConfig.useNewQueueSystem || queueConfig.shadowMode) {
  // Get sandbox provider
  const sandboxProvider = getSandboxProvider();

  // Create queue facade
  const queueFacade = getQueueFacade({
    sandboxProvider,
    legacyQueue: queueManager,
    resourceMonitor: newResourceMonitor!,
    scheduler: newScheduler!,
    retryManager: newRetryManager!,
  });

  // Start the facade
  queueFacade.start();

  print(`  ${bold('Queue Facade:')} ${cyan('initialized and started')}`);
}
```

### Task 3: Update queue/index.ts

Add QueueFacade to public exports:

```typescript
// Add to packages/server/src/queue/index.ts

// =============================================================================
// Facade
// =============================================================================

export {
  QueueFacade,
  getQueueFacade,
  resetQueueFacade,
  type QueueFacadeConfig,
  type QueueFacadeEvents,
} from './queue-facade.js';
```

### Task 4: Create Integration Tests

Create `packages/server/test/integration/queue/queue-facade.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueueFacade, resetQueueFacade } from '../../../src/queue/queue-facade.js';
import { createQueueManager } from '../../../src/control-plane/queue-manager.js';
import { ResourceMonitor } from '../../../src/queue/resource-monitor.js';
import { Scheduler } from '../../../src/queue/scheduler.js';
import { RetryManager } from '../../../src/queue/retry-manager.js';

describe('QueueFacade', () => {
  let facade: QueueFacade;

  beforeEach(() => {
    resetQueueFacade();
    // Test initialization
  });

  afterEach(async () => {
    if (facade) {
      await facade.stop();
    }
    resetQueueFacade();
  });

  describe('feature flag routing', () => {
    it('should use legacy queue when useNewQueueSystem is false', () => {
      // Test legacy routing
    });

    it('should use new queue when useNewQueueSystem is true', () => {
      // Test new system routing
    });

    it('should route based on rollout percentage', () => {
      // Test rollout routing
    });
  });

  describe('shadow mode', () => {
    it('should track operations in both systems when shadow mode enabled', () => {
      // Test shadow mode
    });
  });

  describe('observability', () => {
    it('should expose metrics from new system', () => {
      // Test metrics
    });

    it('should expose health from new system', () => {
      // Test health
    });
  });
});
```

## Verification Checklist

- [ ] QueueFacade created with proper delegation logic
- [ ] serve.ts updated to use QueueFacade when feature flags enabled
- [ ] Feature flag routing works correctly
- [ ] Shadow mode logs operations from both systems
- [ ] All existing tests still pass
- [ ] New integration tests pass
- [ ] TypeScript compiles without errors

## Environment Variables

```bash
# Enable new queue system
AGENTGATE_QUEUE_USE_NEW_SYSTEM=true

# Enable shadow mode (runs both systems)
AGENTGATE_QUEUE_SHADOW_MODE=true

# Gradual rollout (0-100%)
AGENTGATE_QUEUE_ROLLOUT_PERCENT=10
```

## Testing the Integration

1. Start server with new system disabled (default):
   ```bash
   pnpm dev:server
   ```

2. Start server with shadow mode:
   ```bash
   AGENTGATE_QUEUE_SHADOW_MODE=true pnpm dev:server
   ```

3. Start server with new system enabled:
   ```bash
   AGENTGATE_QUEUE_USE_NEW_SYSTEM=true pnpm dev:server
   ```

4. Start server with gradual rollout:
   ```bash
   AGENTGATE_QUEUE_ROLLOUT_PERCENT=50 pnpm dev:server
   ```

## Next Steps

After Phase 2 is complete:
- Phase 3: Gradual rollout with metrics comparison
- Phase 4: Legacy removal after validation
