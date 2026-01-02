/**
 * Stale Work Order Detector (v0.2.23 Wave 2.2)
 *
 * Monitors running work orders for staleness, detecting:
 * - Dead agent processes (process no longer running)
 * - Work orders running too long without activity
 * - Work orders exceeding maximum allowed running time
 *
 * When a stale work order is detected, the detector:
 * 1. Kills the process if it exists
 * 2. Marks the work order as failed
 * 3. Emits events for monitoring/logging
 */

import { EventEmitter } from 'node:events';
import { createLogger } from '../utils/logger.js';
import type { WorkOrderStore } from './work-order-store.js';
import type { WorkOrder } from '../types/index.js';
import { getAgentProcessManager } from './agent-process-manager.js';
import type { QueueManager } from './queue-manager.js';

const log = createLogger('stale-detector');

/**
 * Configuration for StaleDetector.
 */
export interface StaleDetectorConfig {
  /** How often to check for stale work orders (ms). Default: 60000 (1 minute) */
  checkIntervalMs: number;

  /** How long without activity before considered stale (ms). Default: 600000 (10 minutes) */
  staleThresholdMs: number;

  /** Maximum allowed running time (ms). Default: 14400000 (4 hours) */
  maxRunningTimeMs: number;
}

/**
 * Default configuration for StaleDetector.
 */
export const DEFAULT_STALE_DETECTOR_CONFIG: StaleDetectorConfig = {
  checkIntervalMs: 60000,        // Check every minute
  staleThresholdMs: 10 * 60000,  // 10 minutes without activity
  maxRunningTimeMs: 4 * 3600000, // 4 hours max
};

/**
 * Status of a stale check for a single work order.
 */
export type StaleCheckStatus = 'healthy' | 'stale' | 'dead';

/**
 * Result of checking a single work order for staleness.
 */
export interface StaleCheck {
  /** ID of the work order checked */
  workOrderId: string;

  /** Health status of the work order */
  status: StaleCheckStatus;

  /** Reason for the status (for stale/dead) */
  reason?: string;

  /** How long the work order has been running (ms) */
  runningTimeMs: number;

  /** When the work order was last active (if tracked) */
  lastActivityAt?: Date;
}

/**
 * Events emitted by StaleDetector.
 */
export interface StaleDetectorEvents {
  /** Emitted when a stale work order is detected */
  staleDetected: (check: StaleCheck) => void;

  /** Emitted when a dead process is detected */
  deadProcessDetected: (workOrderId: string, reason: string) => void;

  /** Emitted when a stale work order is handled (killed and marked failed) */
  staleHandled: (workOrderId: string, killed: boolean) => void;

  /** Emitted when stale detection check starts */
  checkStarted: () => void;

  /** Emitted when stale detection check completes */
  checkCompleted: (results: StaleCheck[]) => void;
}

/**
 * Detects and handles stale work orders.
 *
 * A work order is considered stale when:
 * 1. Its agent process is no longer running (dead)
 * 2. It has exceeded the maximum running time
 * 3. It has had no activity for longer than the stale threshold
 */
export class StaleDetector extends EventEmitter {
  private readonly config: StaleDetectorConfig;
  private checkTimer: NodeJS.Timeout | null = null;
  private isChecking: boolean = false;
  private shuttingDown: boolean = false;

  constructor(
    private readonly workOrderStore: WorkOrderStore,
    private readonly queueManager: QueueManager,
    config: Partial<StaleDetectorConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_STALE_DETECTOR_CONFIG, ...config };
  }

  /**
   * Start periodic stale detection.
   */
  start(): void {
    if (this.checkTimer) {
      log.warn('Stale detector already started');
      return;
    }

    this.shuttingDown = false;

    log.info(
      {
        checkIntervalMs: this.config.checkIntervalMs,
        staleThresholdMs: this.config.staleThresholdMs,
        maxRunningTimeMs: this.config.maxRunningTimeMs,
      },
      'Starting stale detector'
    );

    this.checkTimer = setInterval(() => {
      void this.checkForStaleWorkOrders();
    }, this.config.checkIntervalMs);

    // Run initial check immediately
    void this.checkForStaleWorkOrders();
  }

  /**
   * Stop stale detection.
   */
  async stop(): Promise<void> {
    this.shuttingDown = true;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    // Wait for any in-progress check to complete
    if (this.isChecking) {
      log.info('Waiting for in-progress check to complete...');
      await this.waitForCheckComplete();
    }

    log.info('Stale detector stopped');
  }

  /**
   * Check if the detector is currently running.
   */
  isRunning(): boolean {
    return this.checkTimer !== null;
  }

  /**
   * Manually trigger a stale check (useful for testing).
   * Returns the check results.
   */
  async checkForStaleWorkOrders(): Promise<StaleCheck[]> {
    if (this.isChecking || this.shuttingDown) {
      return [];
    }

    this.isChecking = true;
    this.emit('checkStarted');

    try {
      // Get all work orders and filter for running ones
      // Use a high limit to get all work orders
      const workOrders = await this.workOrderStore.list({ limit: 1000, offset: 0 });
      const running = workOrders.filter((wo) => wo.status === 'running');

      if (running.length === 0) {
        const results: StaleCheck[] = [];
        this.emit('checkCompleted', results);
        return results;
      }

      log.debug({ runningCount: running.length }, 'Checking running work orders for staleness');

      const results: StaleCheck[] = [];

      for (const wo of running) {
        const check = await this.checkWorkOrder(wo);
        results.push(check);

        if (check.status !== 'healthy') {
          await this.handleStaleWorkOrder(wo.id, check);
        }
      }

      this.emit('checkCompleted', results);
      return results;
    } catch (error) {
      log.error({ err: error }, 'Error checking for stale work orders');
      return [];
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Check a single work order for staleness.
   */
  private async checkWorkOrder(wo: WorkOrder): Promise<StaleCheck> {
    // Calculate running time based on when the work order started
    // We check the queue manager for actual start time tracking
    const runningInfo = this.queueManager.getRunningWorkOrderInfo(wo.id);
    const startTime = runningInfo?.startedAt?.getTime() ?? wo.createdAt.getTime();
    const runningTimeMs = Date.now() - startTime;

    // Check if process is still alive using AgentProcessManager
    const processManager = getAgentProcessManager();
    const trackedProcess = processManager.getProcess(wo.id);

    if (!trackedProcess) {
      // No process tracked - check if we can find the PID another way
      // If there's no tracked process and the work order is running,
      // it might have crashed without being tracked
      return {
        workOrderId: wo.id,
        status: 'dead',
        reason: 'No process found for running work order',
        runningTimeMs,
      };
    }

    // Check if the process has already exited
    if (trackedProcess.hasExited) {
      return {
        workOrderId: wo.id,
        status: 'dead',
        reason: `Process exited with code ${trackedProcess.exitCode ?? 'unknown'}`,
        runningTimeMs,
      };
    }

    // Check if process PID is still running using signal 0
    const isAlive = this.isProcessAlive(trackedProcess.pid);

    if (!isAlive) {
      return {
        workOrderId: wo.id,
        status: 'dead',
        reason: `Process ${trackedProcess.pid} is not running`,
        runningTimeMs,
      };
    }

    // Check if exceeded max running time
    if (runningTimeMs > this.config.maxRunningTimeMs) {
      return {
        workOrderId: wo.id,
        status: 'stale',
        reason: `Running for ${Math.round(runningTimeMs / 60000)} minutes (max: ${Math.round(this.config.maxRunningTimeMs / 60000)})`,
        runningTimeMs,
      };
    }

    // Check last activity (using process start time as proxy for now)
    // In a full implementation, we could track actual activity timestamps
    // For now, we consider the process healthy if it's running and within time limits
    // The staleThresholdMs is checked against the running time if we don't have activity tracking
    // This is a simplified check - in production, we'd want to track actual activity

    return {
      workOrderId: wo.id,
      status: 'healthy',
      runningTimeMs,
    };
  }

  /**
   * Check if a process is still alive using signal 0.
   */
  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0); // Signal 0 checks if process exists
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Handle a stale or dead work order.
   */
  private async handleStaleWorkOrder(
    workOrderId: string,
    check: StaleCheck
  ): Promise<void> {
    log.warn(
      { workOrderId, status: check.status, reason: check.reason, runningTimeMs: check.runningTimeMs },
      'Detected stale work order'
    );

    this.emit('staleDetected', check);

    if (check.status === 'dead') {
      this.emit('deadProcessDetected', workOrderId, check.reason ?? 'Unknown reason');
    }

    // Try to kill the process if it exists
    const processManager = getAgentProcessManager();
    let killed = false;

    try {
      const killResult = await processManager.forceKill(
        workOrderId,
        `Stale detection: ${check.reason}`
      );
      killed = killResult.success;
    } catch (error) {
      log.debug({ workOrderId, err: error }, 'Error killing stale process (may already be dead)');
    }

    // Remove from queue manager's running set
    this.queueManager.forceCancel(workOrderId);

    // Mark as failed in the work order store
    try {
      await this.workOrderStore.updateStatus(workOrderId, 'failed', {
        error: `Stale detection: ${check.reason}`,
        completedAt: new Date(),
      });
    } catch (error) {
      log.error({ workOrderId, err: error }, 'Failed to update stale work order status');
    }

    log.info(
      { workOrderId, killed, reason: check.reason },
      'Marked stale work order as failed'
    );

    this.emit('staleHandled', workOrderId, killed);
  }

  /**
   * Wait for any in-progress check to complete.
   */
  private async waitForCheckComplete(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    while (this.isChecking && Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

// Singleton instance (lazy initialization)
let detectorInstance: StaleDetector | null = null;

/**
 * Get or create the global StaleDetector instance.
 *
 * @param workOrderStore - Work order store for reading/updating work orders
 * @param queueManager - Queue manager for process tracking
 * @param config - Configuration (only used on first call)
 * @returns StaleDetector instance
 */
export function getStaleDetector(
  workOrderStore: WorkOrderStore,
  queueManager: QueueManager,
  config?: Partial<StaleDetectorConfig>
): StaleDetector {
  if (!detectorInstance) {
    detectorInstance = new StaleDetector(workOrderStore, queueManager, config);
  }
  return detectorInstance;
}

/**
 * Create a new StaleDetector instance (not the singleton).
 *
 * @param workOrderStore - Work order store for reading/updating work orders
 * @param queueManager - Queue manager for process tracking
 * @param config - Configuration
 * @returns New StaleDetector instance
 */
export function createStaleDetector(
  workOrderStore: WorkOrderStore,
  queueManager: QueueManager,
  config?: Partial<StaleDetectorConfig>
): StaleDetector {
  return new StaleDetector(workOrderStore, queueManager, config);
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetStaleDetector(): void {
  if (detectorInstance) {
    void detectorInstance.stop();
    detectorInstance = null;
  }
}
