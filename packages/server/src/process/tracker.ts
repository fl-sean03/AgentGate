/**
 * Process Tracker - Persistent tracking of spawned processes.
 * Enables recovery and cleanup of child processes after crashes.
 *
 * (v0.2.27 - Thrust 8: Process Tracking Persistence)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createLogger } from '../utils/logger.js';

const log = createLogger('process-tracker');

/**
 * Process type for classification
 */
export type ProcessType = 'agent' | 'sandbox' | 'helper' | 'background';

/**
 * Process status
 */
export type ProcessStatus = 'running' | 'exited' | 'crashed' | 'killed' | 'orphaned';

/**
 * Tracked process entry
 */
export interface TrackedProcess {
  /** Process ID */
  pid: number;
  /** Process type */
  type: ProcessType;
  /** Command that was executed */
  command: string;
  /** Arguments */
  args: string[];
  /** Working directory */
  cwd?: string;
  /** Associated work order ID */
  workOrderId?: string;
  /** Associated run ID */
  runId?: string;
  /** Associated sandbox ID */
  sandboxId?: string;
  /** Start timestamp */
  startedAt: string;
  /** Last heartbeat */
  lastHeartbeat: string;
  /** Current status */
  status: ProcessStatus;
  /** Exit code (if exited) */
  exitCode?: number;
  /** Exit signal (if killed) */
  exitSignal?: string;
  /** Parent process ID (if this is a child) */
  parentPid?: number;
}

/**
 * Tracker configuration
 */
export interface TrackerConfig {
  /** Path to persistence file */
  registryPath: string;
  /** Heartbeat interval in milliseconds */
  heartbeatIntervalMs: number;
  /** Orphan threshold in milliseconds */
  orphanThresholdMs: number;
  /** Auto-save interval in milliseconds (0 to disable) */
  autoSaveIntervalMs: number;
}

const DEFAULT_CONFIG: TrackerConfig = {
  registryPath: join(homedir(), '.agentgate', 'process-registry.json'),
  heartbeatIntervalMs: 30000,
  orphanThresholdMs: 5 * 60 * 1000, // 5 minutes
  autoSaveIntervalMs: 30000,
};

/**
 * Process Tracker singleton
 */
export class ProcessTracker {
  private static instance: ProcessTracker | null = null;

  private readonly config: TrackerConfig;
  private processes: Map<number, TrackedProcess> = new Map();
  private dirty: boolean = false;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private heartbeatTimers: Map<number, NodeJS.Timeout> = new Map();

  private constructor(config: Partial<TrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the singleton instance
   */
  static getInstance(config?: Partial<TrackerConfig>): ProcessTracker {
    if (!ProcessTracker.instance) {
      ProcessTracker.instance = new ProcessTracker(config);
    }
    return ProcessTracker.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    if (ProcessTracker.instance) {
      ProcessTracker.instance.stopAllTimers();
      ProcessTracker.instance.processes.clear();
    }
    ProcessTracker.instance = null;
  }

  /**
   * Initialize the tracker (load from disk)
   */
  async initialize(): Promise<void> {
    await this.load();
    this.startAutoSave();
    log.info({ processCount: this.processes.size }, 'Process tracker initialized');
  }

  /**
   * Track a new process
   */
  track(
    pid: number,
    type: ProcessType,
    command: string,
    options: {
      args?: string[];
      cwd?: string;
      workOrderId?: string;
      runId?: string;
      sandboxId?: string;
      parentPid?: number;
    } = {}
  ): void {
    const entry: TrackedProcess = {
      pid,
      type,
      command,
      args: options.args || [],
      cwd: options.cwd,
      workOrderId: options.workOrderId,
      runId: options.runId,
      sandboxId: options.sandboxId,
      startedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      status: 'running',
      parentPid: options.parentPid,
    };

    this.processes.set(pid, entry);
    this.dirty = true;

    // Start heartbeat timer
    this.startHeartbeat(pid);

    log.debug({ pid, type, command }, 'Process tracked');
  }

  /**
   * Update process heartbeat
   */
  heartbeat(pid: number): boolean {
    const entry = this.processes.get(pid);
    if (!entry || entry.status !== 'running') {
      return false;
    }

    entry.lastHeartbeat = new Date().toISOString();
    this.dirty = true;
    return true;
  }

  /**
   * Mark process as exited
   */
  markExited(pid: number, exitCode: number): boolean {
    const entry = this.processes.get(pid);
    if (!entry) return false;

    entry.status = 'exited';
    entry.exitCode = exitCode;
    this.dirty = true;
    this.stopHeartbeat(pid);

    log.debug({ pid, exitCode }, 'Process marked as exited');
    return true;
  }

  /**
   * Mark process as killed
   */
  markKilled(pid: number, signal?: string): boolean {
    const entry = this.processes.get(pid);
    if (!entry) return false;

    entry.status = 'killed';
    entry.exitSignal = signal;
    this.dirty = true;
    this.stopHeartbeat(pid);

    log.debug({ pid, signal }, 'Process marked as killed');
    return true;
  }

  /**
   * Mark process as crashed
   */
  markCrashed(pid: number, exitCode?: number): boolean {
    const entry = this.processes.get(pid);
    if (!entry) return false;

    entry.status = 'crashed';
    entry.exitCode = exitCode;
    this.dirty = true;
    this.stopHeartbeat(pid);

    log.warn({ pid, exitCode }, 'Process marked as crashed');
    return true;
  }

  /**
   * Mark process as orphaned
   */
  markOrphaned(pid: number): boolean {
    const entry = this.processes.get(pid);
    if (!entry) return false;

    entry.status = 'orphaned';
    this.dirty = true;
    this.stopHeartbeat(pid);

    log.warn({ pid }, 'Process marked as orphaned');
    return true;
  }

  /**
   * Remove a process from tracking
   */
  remove(pid: number): boolean {
    const existed = this.processes.delete(pid);
    if (existed) {
      this.dirty = true;
      this.stopHeartbeat(pid);
    }
    return existed;
  }

  /**
   * Get a tracked process
   */
  get(pid: number): TrackedProcess | undefined {
    return this.processes.get(pid);
  }

  /**
   * Get all tracked processes
   */
  getAll(): TrackedProcess[] {
    return Array.from(this.processes.values());
  }

  /**
   * Get running processes
   */
  getRunning(): TrackedProcess[] {
    return this.getAll().filter(p => p.status === 'running');
  }

  /**
   * Get processes by type
   */
  getByType(type: ProcessType): TrackedProcess[] {
    return this.getAll().filter(p => p.type === type);
  }

  /**
   * Get processes by work order
   */
  getByWorkOrder(workOrderId: string): TrackedProcess[] {
    return this.getAll().filter(p => p.workOrderId === workOrderId);
  }

  /**
   * Get orphaned processes (stale heartbeat)
   */
  getOrphans(): TrackedProcess[] {
    const now = Date.now();
    const threshold = this.config.orphanThresholdMs;

    return this.getAll().filter(entry => {
      if (entry.status !== 'running') return false;

      const lastHeartbeat = new Date(entry.lastHeartbeat).getTime();
      return (now - lastHeartbeat) > threshold;
    });
  }

  /**
   * Check if a PID is still running
   */
  isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sync status with actual process state
   */
  async syncStatus(): Promise<{ updated: number; orphaned: number }> {
    let updated = 0;
    let orphaned = 0;

    for (const entry of this.getRunning()) {
      if (!this.isProcessAlive(entry.pid)) {
        this.markOrphaned(entry.pid);
        orphaned++;
        updated++;
      }
    }

    if (updated > 0) {
      await this.save();
    }

    return { updated, orphaned };
  }

  /**
   * Get statistics
   */
  getStats(): Record<ProcessStatus, number> & { total: number } {
    const stats: Record<ProcessStatus, number> & { total: number } = {
      running: 0,
      exited: 0,
      crashed: 0,
      killed: 0,
      orphaned: 0,
      total: 0,
    };

    for (const entry of this.processes.values()) {
      stats[entry.status]++;
      stats.total++;
    }

    return stats;
  }

  /**
   * Prune old terminated processes
   */
  prune(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let prunedCount = 0;

    for (const [pid, entry] of this.processes) {
      if (entry.status !== 'running') {
        const startedAt = new Date(entry.startedAt).getTime();
        if ((now - startedAt) > maxAgeMs) {
          this.processes.delete(pid);
          prunedCount++;
        }
      }
    }

    if (prunedCount > 0) {
      this.dirty = true;
      log.info({ prunedCount }, 'Pruned old process entries');
    }

    return prunedCount;
  }

  /**
   * Load from disk
   */
  async load(): Promise<void> {
    if (!existsSync(this.config.registryPath)) {
      log.debug('Process registry not found, starting empty');
      return;
    }

    try {
      const content = await readFile(this.config.registryPath, 'utf-8');
      const data = JSON.parse(content) as { processes: TrackedProcess[] };

      this.processes.clear();
      for (const entry of data.processes || []) {
        this.processes.set(entry.pid, entry);
      }

      log.debug({ processCount: this.processes.size }, 'Process registry loaded');
    } catch (error) {
      log.error({ error }, 'Failed to load process registry');
      this.processes.clear();
    }
  }

  /**
   * Save to disk
   */
  async save(): Promise<void> {
    if (!this.dirty) return;

    const dir = dirname(this.config.registryPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      processes: Array.from(this.processes.values()),
    };

    const tempPath = `${this.config.registryPath}.tmp`;
    await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');

    const { rename } = await import('node:fs/promises');
    await rename(tempPath, this.config.registryPath);

    this.dirty = false;
    log.debug({ processCount: this.processes.size }, 'Process registry saved');
  }

  /**
   * Shutdown the tracker
   */
  async shutdown(): Promise<void> {
    this.stopAllTimers();
    await this.save();
    log.info('Process tracker shutdown');
  }

  private startHeartbeat(pid: number): void {
    if (this.config.heartbeatIntervalMs <= 0) return;

    const timer = setInterval(() => {
      this.heartbeat(pid);
    }, this.config.heartbeatIntervalMs);

    timer.unref();
    this.heartbeatTimers.set(pid, timer);
  }

  private stopHeartbeat(pid: number): void {
    const timer = this.heartbeatTimers.get(pid);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(pid);
    }
  }

  private startAutoSave(): void {
    if (this.config.autoSaveIntervalMs <= 0) return;

    this.autoSaveTimer = setInterval(() => {
      this.save().catch(error => {
        log.error({ error }, 'Auto-save failed');
      });
    }, this.config.autoSaveIntervalMs);

    this.autoSaveTimer.unref();
  }

  private stopAllTimers(): void {
    for (const timer of this.heartbeatTimers.values()) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();

    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }
}

/**
 * Get the process tracker singleton
 */
export function getProcessTracker(config?: Partial<TrackerConfig>): ProcessTracker {
  return ProcessTracker.getInstance(config);
}
