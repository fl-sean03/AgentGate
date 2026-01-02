/**
 * Agent Process Manager (v0.2.23 Wave 1.3)
 *
 * Manages agent process lifecycle, providing:
 * - Process tracking by work order ID
 * - Graceful shutdown with configurable grace period
 * - Force kill capability via SIGKILL escalation
 * - Process health monitoring
 */

import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createLogger } from '../utils/logger.js';

const log = createLogger('agent-process-manager');

/**
 * Information about a tracked process.
 */
export interface TrackedProcess {
  /** Work order ID associated with this process */
  workOrderId: string;
  /** Run ID associated with this process */
  runId: string;
  /** The child process handle */
  process: ChildProcess;
  /** Process ID (PID) */
  pid: number;
  /** When the process was registered */
  startedAt: Date;
  /** Whether a kill signal has been sent */
  killSignalSent: boolean;
  /** Time when kill signal was sent */
  killSignalSentAt: Date | null;
  /** Whether the process has exited */
  hasExited: boolean;
  /** Exit code if exited */
  exitCode: number | null;
  /** Exit signal if killed */
  exitSignal: string | null;
}

/**
 * Options for killing a process.
 */
export interface KillOptions {
  /** Grace period in milliseconds before escalating to SIGKILL (default: 5000) */
  gracePeriodMs?: number;
  /** Reason for killing (logged for debugging) */
  reason?: string;
  /** Skip graceful shutdown and immediately send SIGKILL */
  forceImmediate?: boolean;
}

/**
 * Result of a kill operation.
 */
export interface KillResult {
  /** Whether the kill was successful */
  success: boolean;
  /** Whether force kill was used */
  forcedKill: boolean;
  /** Time taken to terminate the process */
  durationMs: number;
  /** Error message if kill failed */
  error?: string;
}

/**
 * Events emitted by AgentProcessManager.
 */
export interface AgentProcessManagerEvents {
  /** Emitted when a process is registered */
  registered: (info: TrackedProcess) => void;
  /** Emitted when a process exits naturally */
  exited: (info: TrackedProcess) => void;
  /** Emitted when a process is killed */
  killed: (workOrderId: string, result: KillResult) => void;
  /** Emitted when a force kill is performed */
  forceKilled: (workOrderId: string, pid: number) => void;
}

/**
 * Configuration for AgentProcessManager.
 */
export interface AgentProcessManagerConfig {
  /** Default grace period in ms before force kill (default: 5000) */
  defaultGracePeriodMs: number;
  /** Interval for checking stale processes in ms (default: 30000) */
  staleCheckIntervalMs: number;
  /** Maximum process lifetime in ms before warning (default: 3600000 = 1 hour) */
  maxProcessLifetimeMs: number;
}

/**
 * Default configuration.
 */
export const DEFAULT_PROCESS_MANAGER_CONFIG: AgentProcessManagerConfig = {
  defaultGracePeriodMs: 5000,
  staleCheckIntervalMs: 30000,
  maxProcessLifetimeMs: 3600000, // 1 hour
};

/**
 * Manages agent process lifecycle with force kill capability.
 */
export class AgentProcessManager extends EventEmitter {
  private readonly processes: Map<string, TrackedProcess> = new Map();
  private readonly config: AgentProcessManagerConfig;
  private staleCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<AgentProcessManagerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_PROCESS_MANAGER_CONFIG, ...config };

    log.info(
      {
        defaultGracePeriodMs: this.config.defaultGracePeriodMs,
        maxProcessLifetimeMs: this.config.maxProcessLifetimeMs,
      },
      'AgentProcessManager initialized'
    );
  }

  /**
   * Start monitoring for stale processes.
   */
  startMonitoring(): void {
    if (this.staleCheckTimer) {
      return;
    }

    this.staleCheckTimer = setInterval(() => {
      this.checkStaleProcesses();
    }, this.config.staleCheckIntervalMs);

    log.debug(
      { intervalMs: this.config.staleCheckIntervalMs },
      'Process monitoring started'
    );
  }

  /**
   * Stop monitoring for stale processes.
   */
  stopMonitoring(): void {
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
      log.debug('Process monitoring stopped');
    }
  }

  /**
   * Register a child process for tracking.
   *
   * @param workOrderId - Work order ID
   * @param runId - Run ID
   * @param process - Child process to track
   */
  register(workOrderId: string, runId: string, process: ChildProcess): void {
    if (!process.pid) {
      log.warn({ workOrderId, runId }, 'Cannot register process without PID');
      return;
    }

    // Check if a process is already registered for this work order
    const existing = this.processes.get(workOrderId);
    if (existing && !existing.hasExited) {
      log.warn(
        { workOrderId, existingPid: existing.pid, newPid: process.pid },
        'Replacing existing process registration'
      );
    }

    const tracked: TrackedProcess = {
      workOrderId,
      runId,
      process,
      pid: process.pid,
      startedAt: new Date(),
      killSignalSent: false,
      killSignalSentAt: null,
      hasExited: false,
      exitCode: null,
      exitSignal: null,
    };

    this.processes.set(workOrderId, tracked);

    // Set up exit handlers
    const onExit = (code: number | null, signal: string | null): void => {
      tracked.hasExited = true;
      tracked.exitCode = code;
      tracked.exitSignal = signal;

      log.info(
        { workOrderId, runId, pid: tracked.pid, exitCode: code, signal },
        'Process exited'
      );

      this.emit('exited', tracked);
    };

    process.once('exit', onExit);
    process.once('close', (code, signal) => {
      if (!tracked.hasExited) {
        onExit(code, signal);
      }
    });

    log.info(
      { workOrderId, runId, pid: process.pid },
      'Process registered for tracking'
    );

    this.emit('registered', tracked);
  }

  /**
   * Unregister a process (called after cleanup).
   */
  unregister(workOrderId: string): void {
    const tracked = this.processes.get(workOrderId);
    if (tracked) {
      this.processes.delete(workOrderId);
      log.debug({ workOrderId, pid: tracked.pid }, 'Process unregistered');
    }
  }

  /**
   * Kill a process by work order ID.
   *
   * @param workOrderId - Work order ID to kill
   * @param options - Kill options
   * @returns Promise resolving to kill result
   */
  async kill(workOrderId: string, options: KillOptions = {}): Promise<KillResult> {
    const startTime = Date.now();
    const tracked = this.processes.get(workOrderId);

    if (!tracked) {
      log.warn({ workOrderId }, 'No process found for work order');
      return {
        success: false,
        forcedKill: false,
        durationMs: Date.now() - startTime,
        error: `No process found for work order: ${workOrderId}`,
      };
    }

    if (tracked.hasExited) {
      log.debug({ workOrderId, pid: tracked.pid }, 'Process already exited');
      return {
        success: true,
        forcedKill: false,
        durationMs: Date.now() - startTime,
      };
    }

    const gracePeriod = options.gracePeriodMs ?? this.config.defaultGracePeriodMs;
    const reason = options.reason ?? 'Requested by user';

    log.info(
      {
        workOrderId,
        pid: tracked.pid,
        gracePeriodMs: gracePeriod,
        forceImmediate: options.forceImmediate,
        reason,
      },
      'Killing process'
    );

    // If force immediate, skip graceful shutdown
    if (options.forceImmediate) {
      return this.forceKillProcess(tracked, startTime, reason);
    }

    // Try graceful shutdown first
    try {
      tracked.killSignalSent = true;
      tracked.killSignalSentAt = new Date();

      // Send SIGTERM for graceful shutdown
      const killed = tracked.process.kill('SIGTERM');
      if (!killed) {
        log.warn({ workOrderId, pid: tracked.pid }, 'SIGTERM signal failed to send');
      }

      // Wait for process to exit gracefully
      const exited = await this.waitForExit(tracked, gracePeriod);

      if (exited) {
        log.info({ workOrderId, pid: tracked.pid }, 'Process terminated gracefully');
        this.emit('killed', workOrderId, {
          success: true,
          forcedKill: false,
          durationMs: Date.now() - startTime,
        });
        return {
          success: true,
          forcedKill: false,
          durationMs: Date.now() - startTime,
        };
      }

      // Graceful shutdown failed, escalate to SIGKILL
      log.warn(
        { workOrderId, pid: tracked.pid, gracePeriodMs: gracePeriod },
        'Graceful shutdown timed out, escalating to SIGKILL'
      );

      return this.forceKillProcess(tracked, startTime, reason);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ workOrderId, pid: tracked.pid, error }, 'Error killing process');

      return {
        success: false,
        forcedKill: false,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Force kill a process immediately with SIGKILL.
   */
  async forceKill(workOrderId: string, reason?: string): Promise<KillResult> {
    return this.kill(workOrderId, {
      forceImmediate: true,
      reason: reason ?? 'Force kill requested',
    });
  }

  /**
   * Get tracked process info by work order ID.
   */
  getProcess(workOrderId: string): TrackedProcess | null {
    return this.processes.get(workOrderId) ?? null;
  }

  /**
   * Check if a work order has an active process.
   */
  hasActiveProcess(workOrderId: string): boolean {
    const tracked = this.processes.get(workOrderId);
    return tracked !== undefined && !tracked.hasExited;
  }

  /**
   * Get all tracked processes.
   */
  getAllProcesses(): TrackedProcess[] {
    return Array.from(this.processes.values());
  }

  /**
   * Get count of active processes.
   */
  getActiveCount(): number {
    let count = 0;
    for (const tracked of this.processes.values()) {
      if (!tracked.hasExited) {
        count++;
      }
    }
    return count;
  }

  /**
   * Kill all active processes.
   */
  async killAll(options: KillOptions = {}): Promise<Map<string, KillResult>> {
    const results = new Map<string, KillResult>();
    const promises: Promise<void>[] = [];

    for (const [workOrderId, tracked] of this.processes) {
      if (!tracked.hasExited) {
        promises.push(
          this.kill(workOrderId, options).then((result) => {
            results.set(workOrderId, result);
          })
        );
      }
    }

    await Promise.all(promises);
    return results;
  }

  /**
   * Shutdown the manager and kill all processes.
   */
  async shutdown(): Promise<void> {
    this.stopMonitoring();

    const activeCount = this.getActiveCount();
    if (activeCount > 0) {
      log.info({ activeCount }, 'Shutting down, killing active processes');
      await this.killAll({ reason: 'Process manager shutdown' });
    }

    this.processes.clear();
    log.info('AgentProcessManager shutdown complete');
  }

  /**
   * Force kill a process with SIGKILL.
   */
  private async forceKillProcess(
    tracked: TrackedProcess,
    startTime: number,
    reason: string
  ): Promise<KillResult> {
    try {
      log.warn(
        { workOrderId: tracked.workOrderId, pid: tracked.pid, reason },
        'Force killing process with SIGKILL'
      );

      const killed = tracked.process.kill('SIGKILL');
      if (!killed && !tracked.hasExited) {
        // Process may have already exited
        log.debug({ pid: tracked.pid }, 'SIGKILL signal returned false');
      }

      // Wait a short time for the kill to take effect
      await this.waitForExit(tracked, 1000);

      this.emit('forceKilled', tracked.workOrderId, tracked.pid);

      const result: KillResult = {
        success: tracked.hasExited,
        forcedKill: true,
        durationMs: Date.now() - startTime,
      };

      if (!tracked.hasExited) {
        result.error = 'Process did not exit after SIGKILL';
      }

      this.emit('killed', tracked.workOrderId, result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(
        { workOrderId: tracked.workOrderId, pid: tracked.pid, error },
        'Force kill failed'
      );

      return {
        success: false,
        forcedKill: true,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Wait for a process to exit with timeout.
   */
  private waitForExit(tracked: TrackedProcess, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (tracked.hasExited) {
        resolve(true);
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeoutMs);

      const onExit = (): void => {
        cleanup();
        resolve(true);
      };

      const cleanup = (): void => {
        clearTimeout(timeout);
        tracked.process.removeListener('exit', onExit);
        tracked.process.removeListener('close', onExit);
      };

      tracked.process.once('exit', onExit);
      tracked.process.once('close', onExit);
    });
  }

  /**
   * Check for stale processes that have been running too long.
   */
  private checkStaleProcesses(): void {
    const now = Date.now();

    for (const tracked of this.processes.values()) {
      if (tracked.hasExited) {
        continue;
      }

      const runtime = now - tracked.startedAt.getTime();
      if (runtime > this.config.maxProcessLifetimeMs) {
        log.warn(
          {
            workOrderId: tracked.workOrderId,
            pid: tracked.pid,
            runtimeMs: runtime,
            maxLifetimeMs: this.config.maxProcessLifetimeMs,
          },
          'Stale process detected - running longer than max lifetime'
        );
      }
    }
  }
}

// Singleton instance (lazy initialization)
let managerInstance: AgentProcessManager | null = null;

/**
 * Get or create the global AgentProcessManager instance.
 */
export function getAgentProcessManager(
  config?: Partial<AgentProcessManagerConfig>
): AgentProcessManager {
  if (!managerInstance) {
    managerInstance = new AgentProcessManager(config);
  }
  return managerInstance;
}

/**
 * Create a new AgentProcessManager instance (not the singleton).
 */
export function createAgentProcessManager(
  config?: Partial<AgentProcessManagerConfig>
): AgentProcessManager {
  return new AgentProcessManager(config);
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetAgentProcessManager(): void {
  if (managerInstance) {
    void managerInstance.shutdown();
    managerInstance = null;
  }
}
