/**
 * Sandbox Registry - Persistent tracking of active sandboxes.
 * Enables orphan detection and cleanup after crashes.
 *
 * (v0.2.27 - Thrust 4: Guaranteed Sandbox Cleanup)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createLogger } from '../utils/logger.js';

const log = createLogger('sandbox-registry');

/**
 * Sandbox type
 */
export type SandboxType = 'docker' | 'subprocess';

/**
 * Sandbox status in registry
 */
export type RegistryStatus = 'active' | 'terminated' | 'orphaned' | 'cleanup_failed';

/**
 * Registry entry for a sandbox
 */
export interface SandboxRegistryEntry {
  /** Unique sandbox ID */
  sandboxId: string;
  /** Type of sandbox */
  type: SandboxType;
  /** Docker container ID or process PID */
  resourceId: string;
  /** Associated run ID (if any) */
  runId?: string;
  /** Associated work order ID (if any) */
  workOrderId?: string;
  /** When the sandbox was created */
  createdAt: string;
  /** Last heartbeat timestamp */
  lastHeartbeat: string;
  /** Current status */
  status: RegistryStatus;
  /** Workspace path */
  workspacePath?: string;
  /** Cleanup attempts */
  cleanupAttempts: number;
  /** Last cleanup error (if any) */
  lastCleanupError?: string;
}

/**
 * Registry configuration
 */
export interface RegistryConfig {
  /** Registry file path */
  registryPath: string;
  /** Orphan threshold in milliseconds (default: 5 minutes) */
  orphanThresholdMs: number;
  /** Auto-save interval in milliseconds (0 to disable) */
  autoSaveIntervalMs: number;
}

/**
 * Default registry configuration
 */
const DEFAULT_CONFIG: RegistryConfig = {
  registryPath: join(homedir(), '.agentgate', 'sandbox-registry.json'),
  orphanThresholdMs: 5 * 60 * 1000, // 5 minutes
  autoSaveIntervalMs: 30000, // 30 seconds
};

/**
 * Sandbox registry for tracking active sandboxes.
 */
export class SandboxRegistry {
  private static instance: SandboxRegistry | null = null;

  private readonly config: RegistryConfig;
  private entries: Map<string, SandboxRegistryEntry> = new Map();
  private dirty: boolean = false;
  private autoSaveTimer: NodeJS.Timeout | null = null;

  private constructor(config: Partial<RegistryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the singleton instance
   */
  static getInstance(config?: Partial<RegistryConfig>): SandboxRegistry {
    if (!SandboxRegistry.instance) {
      SandboxRegistry.instance = new SandboxRegistry(config);
    }
    return SandboxRegistry.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static resetInstance(): void {
    if (SandboxRegistry.instance) {
      SandboxRegistry.instance.stopAutoSave();
      SandboxRegistry.instance.entries.clear();
    }
    SandboxRegistry.instance = null;
  }

  /**
   * Initialize the registry (load from disk)
   */
  async initialize(): Promise<void> {
    await this.load();
    this.startAutoSave();
    log.info({ entryCount: this.entries.size }, 'Sandbox registry initialized');
  }

  /**
   * Register a new sandbox
   */
  register(
    sandboxId: string,
    type: SandboxType,
    resourceId: string,
    options: {
      runId?: string;
      workOrderId?: string;
      workspacePath?: string;
    } = {}
  ): void {
    const entry: SandboxRegistryEntry = {
      sandboxId,
      type,
      resourceId,
      runId: options.runId,
      workOrderId: options.workOrderId,
      createdAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      status: 'active',
      workspacePath: options.workspacePath,
      cleanupAttempts: 0,
    };

    this.entries.set(sandboxId, entry);
    this.dirty = true;

    log.debug(
      { sandboxId, type, resourceId, runId: options.runId },
      'Sandbox registered'
    );
  }

  /**
   * Update heartbeat for a sandbox
   */
  heartbeat(sandboxId: string): boolean {
    const entry = this.entries.get(sandboxId);
    if (!entry || entry.status !== 'active') {
      return false;
    }

    entry.lastHeartbeat = new Date().toISOString();
    this.dirty = true;
    return true;
  }

  /**
   * Mark a sandbox as terminated
   */
  markTerminated(sandboxId: string): boolean {
    const entry = this.entries.get(sandboxId);
    if (!entry) {
      return false;
    }

    entry.status = 'terminated';
    this.dirty = true;

    log.debug({ sandboxId }, 'Sandbox marked as terminated');
    return true;
  }

  /**
   * Mark a sandbox as orphaned
   */
  markOrphaned(sandboxId: string): boolean {
    const entry = this.entries.get(sandboxId);
    if (!entry) {
      return false;
    }

    entry.status = 'orphaned';
    this.dirty = true;

    log.warn({ sandboxId }, 'Sandbox marked as orphaned');
    return true;
  }

  /**
   * Record a cleanup failure
   */
  recordCleanupFailure(sandboxId: string, error: string): void {
    const entry = this.entries.get(sandboxId);
    if (!entry) {
      return;
    }

    entry.cleanupAttempts++;
    entry.lastCleanupError = error;
    entry.status = 'cleanup_failed';
    this.dirty = true;

    log.error(
      { sandboxId, attempt: entry.cleanupAttempts, error },
      'Sandbox cleanup failed'
    );
  }

  /**
   * Remove an entry from the registry
   */
  remove(sandboxId: string): boolean {
    const existed = this.entries.delete(sandboxId);
    if (existed) {
      this.dirty = true;
      log.debug({ sandboxId }, 'Sandbox removed from registry');
    }
    return existed;
  }

  /**
   * Get a sandbox entry
   */
  get(sandboxId: string): SandboxRegistryEntry | undefined {
    return this.entries.get(sandboxId);
  }

  /**
   * Get all entries
   */
  getAll(): SandboxRegistryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get active entries
   */
  getActive(): SandboxRegistryEntry[] {
    return this.getAll().filter(e => e.status === 'active');
  }

  /**
   * Get orphaned sandboxes based on heartbeat threshold
   */
  getOrphans(): SandboxRegistryEntry[] {
    const now = Date.now();
    const threshold = this.config.orphanThresholdMs;

    return this.getAll().filter(entry => {
      if (entry.status !== 'active') {
        return false;
      }

      const lastHeartbeat = new Date(entry.lastHeartbeat).getTime();
      return (now - lastHeartbeat) > threshold;
    });
  }

  /**
   * Get entries that failed cleanup
   */
  getCleanupFailures(): SandboxRegistryEntry[] {
    return this.getAll().filter(e => e.status === 'cleanup_failed');
  }

  /**
   * Get entry count by status
   */
  getStats(): Record<RegistryStatus, number> {
    const stats: Record<RegistryStatus, number> = {
      active: 0,
      terminated: 0,
      orphaned: 0,
      cleanup_failed: 0,
    };

    for (const entry of this.entries.values()) {
      stats[entry.status]++;
    }

    return stats;
  }

  /**
   * Prune terminated entries older than the threshold
   */
  prune(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let prunedCount = 0;

    for (const [sandboxId, entry] of this.entries) {
      if (entry.status === 'terminated') {
        const createdAt = new Date(entry.createdAt).getTime();
        if ((now - createdAt) > maxAgeMs) {
          this.entries.delete(sandboxId);
          prunedCount++;
        }
      }
    }

    if (prunedCount > 0) {
      this.dirty = true;
      log.info({ prunedCount }, 'Pruned old terminated entries');
    }

    return prunedCount;
  }

  /**
   * Load registry from disk
   */
  async load(): Promise<void> {
    if (!existsSync(this.config.registryPath)) {
      log.debug({ path: this.config.registryPath }, 'Registry file not found, starting empty');
      return;
    }

    try {
      const content = await readFile(this.config.registryPath, 'utf-8');
      const data = JSON.parse(content) as { entries: SandboxRegistryEntry[] };

      this.entries.clear();
      for (const entry of data.entries || []) {
        this.entries.set(entry.sandboxId, entry);
      }

      log.debug({ entryCount: this.entries.size }, 'Registry loaded from disk');
    } catch (error) {
      log.error({ error, path: this.config.registryPath }, 'Failed to load registry');
      // Start with empty registry on load failure
      this.entries.clear();
    }
  }

  /**
   * Save registry to disk
   */
  async save(): Promise<void> {
    if (!this.dirty) {
      return;
    }

    const dir = dirname(this.config.registryPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: Array.from(this.entries.values()),
    };

    const tempPath = `${this.config.registryPath}.tmp`;
    await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');

    // Atomic rename
    const { rename } = await import('node:fs/promises');
    await rename(tempPath, this.config.registryPath);

    this.dirty = false;
    log.debug({ entryCount: this.entries.size }, 'Registry saved to disk');
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.config.autoSaveIntervalMs <= 0) {
      return;
    }

    this.autoSaveTimer = setInterval(() => {
      this.save().catch(error => {
        log.error({ error }, 'Auto-save failed');
      });
    }, this.config.autoSaveIntervalMs);

    // Don't keep process alive just for auto-save
    this.autoSaveTimer.unref();
  }

  /**
   * Stop auto-save timer
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Shutdown the registry (save and stop timers)
   */
  async shutdown(): Promise<void> {
    this.stopAutoSave();
    await this.save();
    log.info('Sandbox registry shutdown');
  }
}

/**
 * Get the sandbox registry singleton
 */
export function getSandboxRegistry(config?: Partial<RegistryConfig>): SandboxRegistry {
  return SandboxRegistry.getInstance(config);
}
