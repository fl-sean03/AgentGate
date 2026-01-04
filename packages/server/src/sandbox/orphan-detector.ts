/**
 * Orphan Detector - Detects and cleans up orphaned sandboxes.
 * Runs on startup and periodically to clean up sandboxes from crashes.
 *
 * (v0.2.27 - Thrust 4: Guaranteed Sandbox Cleanup)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '../utils/logger.js';
import { getSandboxRegistry, type SandboxRegistryEntry } from './registry.js';
import { sleep } from '../utils/timeout.js';

const execAsync = promisify(exec);
const log = createLogger('orphan-detector');

/**
 * Orphan cleanup result
 */
export interface OrphanCleanupResult {
  /** Number of orphans detected */
  orphansDetected: number;
  /** Number successfully cleaned up */
  cleanedUp: number;
  /** Number that failed cleanup */
  failed: number;
  /** Details of failures */
  failures: Array<{ sandboxId: string; error: string }>;
  /** Time taken in milliseconds */
  durationMs: number;
}

/**
 * Cleanup configuration
 */
export interface CleanupConfig {
  /** Maximum retry attempts for cleanup */
  maxRetries: number;
  /** Base delay between retries in milliseconds */
  baseRetryDelayMs: number;
  /** Use exponential backoff */
  exponentialBackoff: boolean;
  /** Docker container stop timeout in seconds */
  dockerStopTimeoutSeconds: number;
}

const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  maxRetries: 3,
  baseRetryDelayMs: 5000,
  exponentialBackoff: true,
  dockerStopTimeoutSeconds: 10,
};

/**
 * Check if a Docker container exists
 */
async function dockerContainerExists(containerId: string): Promise<boolean> {
  try {
    await execAsync(`docker inspect ${containerId}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop and remove a Docker container
 */
async function cleanupDockerContainer(
  containerId: string,
  timeoutSeconds: number
): Promise<void> {
  // Try graceful stop first
  try {
    await execAsync(`docker stop -t ${timeoutSeconds} ${containerId}`);
  } catch {
    // Container might already be stopped
  }

  // Remove container
  await execAsync(`docker rm -f ${containerId}`);
}

/**
 * Check if a process exists
 */
async function processExists(pid: string): Promise<boolean> {
  try {
    process.kill(parseInt(pid, 10), 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a process
 */
async function killProcess(pid: string): Promise<void> {
  const pidNum = parseInt(pid, 10);

  // Try SIGTERM first
  try {
    process.kill(pidNum, 'SIGTERM');
    // Wait a bit for graceful shutdown
    await sleep(2000);

    // Check if still running
    if (await processExists(pid)) {
      // Force kill
      process.kill(pidNum, 'SIGKILL');
    }
  } catch {
    // Process might already be dead
  }
}

/**
 * Cleanup a single sandbox with retries
 */
async function cleanupSandbox(
  entry: SandboxRegistryEntry,
  config: CleanupConfig
): Promise<boolean> {
  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      if (entry.type === 'docker') {
        // Check if container still exists
        if (await dockerContainerExists(entry.resourceId)) {
          await cleanupDockerContainer(entry.resourceId, config.dockerStopTimeoutSeconds);
          log.info({ sandboxId: entry.sandboxId, containerId: entry.resourceId }, 'Docker container cleaned up');
        } else {
          log.debug({ sandboxId: entry.sandboxId }, 'Docker container already gone');
        }
      } else if (entry.type === 'subprocess') {
        // Check if process still exists
        if (await processExists(entry.resourceId)) {
          await killProcess(entry.resourceId);
          log.info({ sandboxId: entry.sandboxId, pid: entry.resourceId }, 'Subprocess killed');
        } else {
          log.debug({ sandboxId: entry.sandboxId }, 'Subprocess already gone');
        }
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.warn(
        { sandboxId: entry.sandboxId, attempt: attempt + 1, error: errorMessage },
        'Cleanup attempt failed'
      );

      if (attempt < config.maxRetries - 1) {
        const delay = config.exponentialBackoff
          ? config.baseRetryDelayMs * Math.pow(2, attempt)
          : config.baseRetryDelayMs;
        await sleep(delay);
      } else {
        // Record failure in registry
        getSandboxRegistry().recordCleanupFailure(entry.sandboxId, errorMessage);
      }
    }
  }

  return false;
}

/**
 * Detect and cleanup orphaned sandboxes
 */
export async function detectAndCleanupOrphans(
  config: Partial<CleanupConfig> = {}
): Promise<OrphanCleanupResult> {
  const startTime = Date.now();
  const cleanupConfig = { ...DEFAULT_CLEANUP_CONFIG, ...config };
  const registry = getSandboxRegistry();

  const result: OrphanCleanupResult = {
    orphansDetected: 0,
    cleanedUp: 0,
    failed: 0,
    failures: [],
    durationMs: 0,
  };

  // Get orphans from registry
  const orphans = registry.getOrphans();
  result.orphansDetected = orphans.length;

  if (orphans.length === 0) {
    log.debug('No orphaned sandboxes detected');
    result.durationMs = Date.now() - startTime;
    return result;
  }

  log.warn({ count: orphans.length }, 'Detected orphaned sandboxes');

  // Mark as orphaned first
  for (const orphan of orphans) {
    registry.markOrphaned(orphan.sandboxId);
  }

  // Cleanup each orphan
  for (const orphan of orphans) {
    const success = await cleanupSandbox(orphan, cleanupConfig);

    if (success) {
      registry.markTerminated(orphan.sandboxId);
      result.cleanedUp++;
    } else {
      result.failed++;
      result.failures.push({
        sandboxId: orphan.sandboxId,
        error: orphan.lastCleanupError || 'Unknown error',
      });
    }
  }

  // Save registry
  await registry.save();

  result.durationMs = Date.now() - startTime;

  log.info(
    {
      detected: result.orphansDetected,
      cleanedUp: result.cleanedUp,
      failed: result.failed,
      durationMs: result.durationMs,
    },
    'Orphan cleanup complete'
  );

  return result;
}

/**
 * Run startup cleanup
 */
export async function runStartupCleanup(
  config: Partial<CleanupConfig> = {}
): Promise<OrphanCleanupResult> {
  log.info('Running startup orphan cleanup');

  const registry = getSandboxRegistry();
  await registry.initialize();

  // Also prune old terminated entries
  registry.prune();

  return detectAndCleanupOrphans(config);
}

/**
 * Cleanup a specific sandbox by ID
 */
export async function cleanupSandboxById(
  sandboxId: string,
  config: Partial<CleanupConfig> = {}
): Promise<boolean> {
  const registry = getSandboxRegistry();
  const entry = registry.get(sandboxId);

  if (!entry) {
    log.warn({ sandboxId }, 'Sandbox not found in registry');
    return false;
  }

  const cleanupConfig = { ...DEFAULT_CLEANUP_CONFIG, ...config };
  const success = await cleanupSandbox(entry, cleanupConfig);

  if (success) {
    registry.markTerminated(sandboxId);
    await registry.save();
  }

  return success;
}

/**
 * Force cleanup all sandboxes (for emergency situations)
 */
export async function forceCleanupAll(
  config: Partial<CleanupConfig> = {}
): Promise<OrphanCleanupResult> {
  const startTime = Date.now();
  const cleanupConfig = { ...DEFAULT_CLEANUP_CONFIG, ...config };
  const registry = getSandboxRegistry();

  const result: OrphanCleanupResult = {
    orphansDetected: 0,
    cleanedUp: 0,
    failed: 0,
    failures: [],
    durationMs: 0,
  };

  // Get all active sandboxes
  const active = registry.getActive();
  result.orphansDetected = active.length;

  log.warn({ count: active.length }, 'Force cleanup of all active sandboxes');

  for (const entry of active) {
    const success = await cleanupSandbox(entry, cleanupConfig);

    if (success) {
      registry.markTerminated(entry.sandboxId);
      result.cleanedUp++;
    } else {
      result.failed++;
      result.failures.push({
        sandboxId: entry.sandboxId,
        error: entry.lastCleanupError || 'Unknown error',
      });
    }
  }

  await registry.save();

  result.durationMs = Date.now() - startTime;

  log.info(
    {
      total: result.orphansDetected,
      cleanedUp: result.cleanedUp,
      failed: result.failed,
    },
    'Force cleanup complete'
  );

  return result;
}

/**
 * Get cleanup statistics
 */
export function getCleanupStats(): {
  active: number;
  terminated: number;
  orphaned: number;
  cleanup_failed: number;
} {
  return getSandboxRegistry().getStats();
}
