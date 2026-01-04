/**
 * Write-Ahead Log (WAL) for state persistence.
 * Ensures state transitions are never lost, even during crashes.
 *
 * (v0.2.27 - Thrust 1: Write-Ahead State Persistence)
 */

import { readFile, writeFile, appendFile, readdir, mkdir, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { RunState, RunEvent, type Run } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('wal');

/**
 * WAL entry status
 */
export const WALStatus = {
  PENDING: 'pending',
  APPLIED: 'applied',
  ROLLED_BACK: 'rolled_back',
} as const;

export type WALStatus = (typeof WALStatus)[keyof typeof WALStatus];

/**
 * WAL entry interface
 */
export interface WALEntry {
  /** Unique entry ID */
  id: string;
  /** Timestamp when entry was created */
  timestamp: string;
  /** Run ID this entry belongs to */
  runId: string;
  /** State before transition */
  previousState: RunState;
  /** Target state after transition */
  targetState: RunState;
  /** Event that triggered the transition */
  event: RunEvent;
  /** Current status of the entry */
  status: WALStatus;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * WAL configuration
 */
export interface WALConfig {
  /** Enable WAL (default: true) */
  enabled: boolean;
  /** WAL directory (default: ~/.agentgate/wal) */
  directory: string;
  /** Retention days for completed entries (default: 7) */
  retentionDays: number;
  /** Maximum entries per run before compaction (default: 1000) */
  maxEntriesPerRun: number;
}

/**
 * Default WAL configuration
 */
export const DEFAULT_WAL_CONFIG: WALConfig = {
  enabled: true,
  directory: join(homedir(), '.agentgate', 'wal'),
  retentionDays: 7,
  maxEntriesPerRun: 1000,
};

/**
 * Get WAL configuration from environment or defaults
 */
export function getWALConfig(): WALConfig {
  return {
    enabled: process.env.AGENTGATE_WAL_ENABLED !== 'false',
    directory: process.env.AGENTGATE_WAL_DIRECTORY || DEFAULT_WAL_CONFIG.directory,
    retentionDays: parseInt(process.env.AGENTGATE_WAL_RETENTION_DAYS || '') || DEFAULT_WAL_CONFIG.retentionDays,
    maxEntriesPerRun: parseInt(process.env.AGENTGATE_WAL_MAX_ENTRIES || '') || DEFAULT_WAL_CONFIG.maxEntriesPerRun,
  };
}

/**
 * Get the WAL file path for a run
 */
export function getWALFilePath(runId: string, config?: WALConfig): string {
  const walConfig = config || getWALConfig();
  return join(walConfig.directory, `${runId}.wal.jsonl`);
}

/**
 * Ensure WAL directory exists
 */
export async function ensureWALDirectory(config?: WALConfig): Promise<void> {
  const walConfig = config || getWALConfig();
  if (!existsSync(walConfig.directory)) {
    await mkdir(walConfig.directory, { recursive: true });
    log.debug({ directory: walConfig.directory }, 'Created WAL directory');
  }
}

/**
 * Create a new WAL entry
 */
export function createWALEntry(
  runId: string,
  previousState: RunState,
  targetState: RunState,
  event: RunEvent,
  metadata?: Record<string, unknown>
): WALEntry {
  const entry: WALEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    runId,
    previousState,
    targetState,
    event,
    status: WALStatus.PENDING,
  };
  if (metadata !== undefined) {
    entry.metadata = metadata;
  }
  return entry;
}

/**
 * Append a WAL entry to the log file
 */
export async function appendWALEntry(entry: WALEntry, config?: WALConfig): Promise<void> {
  const walConfig = config || getWALConfig();

  if (!walConfig.enabled) {
    log.trace({ entryId: entry.id }, 'WAL disabled, skipping entry');
    return;
  }

  await ensureWALDirectory(walConfig);

  const walFile = getWALFilePath(entry.runId, walConfig);
  const line = JSON.stringify(entry) + '\n';

  await appendFile(walFile, line, 'utf-8');

  log.debug(
    {
      entryId: entry.id,
      runId: entry.runId,
      from: entry.previousState,
      to: entry.targetState,
      event: entry.event,
    },
    'WAL entry appended'
  );
}

/**
 * Update the status of a WAL entry
 */
export async function updateWALEntryStatus(
  runId: string,
  entryId: string,
  status: WALStatus,
  config?: WALConfig
): Promise<void> {
  const walConfig = config || getWALConfig();

  if (!walConfig.enabled) {
    return;
  }

  const walFile = getWALFilePath(runId, walConfig);

  try {
    const content = await readFile(walFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);

    const updatedLines = lines.map(line => {
      const entry = JSON.parse(line) as WALEntry;
      if (entry.id === entryId) {
        return JSON.stringify({ ...entry, status });
      }
      return line;
    });

    // Write to temp file then rename for atomicity
    const tempFile = walFile + '.tmp';
    await writeFile(tempFile, updatedLines.join('\n') + '\n', 'utf-8');
    await rename(tempFile, walFile);

    log.debug({ entryId, runId, status }, 'WAL entry status updated');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      log.warn({ runId, entryId }, 'WAL file not found when updating status');
      return;
    }
    throw error;
  }
}

/**
 * Mark a WAL entry as applied
 */
export async function markWALComplete(runId: string, entryId: string, config?: WALConfig): Promise<void> {
  await updateWALEntryStatus(runId, entryId, WALStatus.APPLIED, config);
}

/**
 * Mark a WAL entry as rolled back
 */
export async function markWALRolledBack(runId: string, entryId: string, config?: WALConfig): Promise<void> {
  await updateWALEntryStatus(runId, entryId, WALStatus.ROLLED_BACK, config);
}

/**
 * Read all WAL entries for a run
 */
export async function readWALEntries(runId: string, config?: WALConfig): Promise<WALEntry[]> {
  const walConfig = config || getWALConfig();
  const walFile = getWALFilePath(runId, walConfig);

  try {
    const content = await readFile(walFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);

    return lines.map(line => JSON.parse(line) as WALEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Get pending WAL entries for a run
 */
export async function getPendingWALEntries(runId: string, config?: WALConfig): Promise<WALEntry[]> {
  const entries = await readWALEntries(runId, config);
  return entries.filter(entry => entry.status === WALStatus.PENDING);
}

/**
 * Get all pending WAL entries across all runs
 */
export async function getAllPendingWALEntries(config?: WALConfig): Promise<WALEntry[]> {
  const walConfig = config || getWALConfig();

  if (!walConfig.enabled) {
    return [];
  }

  await ensureWALDirectory(walConfig);

  const allPending: WALEntry[] = [];

  try {
    const files = await readdir(walConfig.directory);
    const walFiles = files.filter(f => f.endsWith('.wal.jsonl'));

    for (const file of walFiles) {
      const runId = file.replace('.wal.jsonl', '');
      const pending = await getPendingWALEntries(runId, walConfig);
      allPending.push(...pending);
    }

    // Sort by timestamp ascending (oldest first for replay)
    allPending.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return allPending;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Result of WAL recovery
 */
export interface WALRecoveryResult {
  /** Number of pending entries found */
  pendingCount: number;
  /** Number of entries successfully recovered */
  recoveredCount: number;
  /** Number of entries that failed to recover */
  failedCount: number;
  /** Run IDs that had pending entries */
  affectedRunIds: string[];
  /** Errors encountered during recovery */
  errors: Array<{ entryId: string; runId: string; error: string }>;
}

/**
 * Recover from WAL on startup.
 * Finds all pending entries and attempts to complete or roll them back.
 *
 * @param recoverFn Function to call to recover a specific entry (provided by caller)
 */
export async function recoverFromWAL(
  recoverFn: (entry: WALEntry) => Promise<boolean>,
  config?: WALConfig
): Promise<WALRecoveryResult> {
  const walConfig = config || getWALConfig();

  const result: WALRecoveryResult = {
    pendingCount: 0,
    recoveredCount: 0,
    failedCount: 0,
    affectedRunIds: [],
    errors: [],
  };

  if (!walConfig.enabled) {
    log.info('WAL is disabled, skipping recovery');
    return result;
  }

  log.info('Starting WAL recovery...');

  const pendingEntries = await getAllPendingWALEntries(walConfig);
  result.pendingCount = pendingEntries.length;

  if (pendingEntries.length === 0) {
    log.info('No pending WAL entries found, recovery complete');
    return result;
  }

  log.warn({ count: pendingEntries.length }, 'Found pending WAL entries, attempting recovery');

  // Track affected runs
  const affectedRunIds = new Set<string>();

  for (const entry of pendingEntries) {
    affectedRunIds.add(entry.runId);

    try {
      const success = await recoverFn(entry);

      if (success) {
        await markWALComplete(entry.runId, entry.id, walConfig);
        result.recoveredCount++;
        log.info(
          { entryId: entry.id, runId: entry.runId, event: entry.event },
          'WAL entry recovered successfully'
        );
      } else {
        await markWALRolledBack(entry.runId, entry.id, walConfig);
        result.failedCount++;
        log.warn(
          { entryId: entry.id, runId: entry.runId, event: entry.event },
          'WAL entry recovery failed, marked as rolled back'
        );
      }
    } catch (error) {
      result.failedCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push({
        entryId: entry.id,
        runId: entry.runId,
        error: errorMessage,
      });

      // Mark as rolled back on error
      try {
        await markWALRolledBack(entry.runId, entry.id, walConfig);
      } catch {
        // Ignore secondary errors
      }

      log.error(
        { entryId: entry.id, runId: entry.runId, error: errorMessage },
        'Error during WAL recovery'
      );
    }
  }

  result.affectedRunIds = Array.from(affectedRunIds);

  log.info(
    {
      pending: result.pendingCount,
      recovered: result.recoveredCount,
      failed: result.failedCount,
      affectedRuns: result.affectedRunIds.length,
    },
    'WAL recovery complete'
  );

  return result;
}

/**
 * Clean up old WAL files based on retention policy
 */
export async function cleanupOldWALFiles(config?: WALConfig): Promise<number> {
  const walConfig = config || getWALConfig();

  if (!walConfig.enabled) {
    return 0;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - walConfig.retentionDays);

  let deletedCount = 0;

  try {
    const files = await readdir(walConfig.directory);
    const walFiles = files.filter(f => f.endsWith('.wal.jsonl'));

    for (const file of walFiles) {
      const walFilePath = join(walConfig.directory, file);
      const entries = await readWALEntries(file.replace('.wal.jsonl', ''), walConfig);

      // Check if all entries are old and not pending
      const allOldAndComplete = entries.every(entry => {
        if (entry.status === WALStatus.PENDING) {
          return false; // Don't delete files with pending entries
        }
        const entryDate = new Date(entry.timestamp);
        return entryDate < cutoffDate;
      });

      if (allOldAndComplete && entries.length > 0) {
        await unlink(walFilePath);
        deletedCount++;
        log.debug({ file }, 'Deleted old WAL file');
      }
    }

    if (deletedCount > 0) {
      log.info({ deletedCount, retentionDays: walConfig.retentionDays }, 'WAL cleanup complete');
    }

    return deletedCount;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error({ error }, 'Error during WAL cleanup');
    }
    return 0;
  }
}

/**
 * Compact WAL file by removing rolled-back entries
 */
export async function compactWALFile(runId: string, config?: WALConfig): Promise<number> {
  const walConfig = config || getWALConfig();
  const walFile = getWALFilePath(runId, walConfig);

  try {
    const entries = await readWALEntries(runId, walConfig);

    if (entries.length < walConfig.maxEntriesPerRun) {
      return 0; // No compaction needed
    }

    // Keep only applied entries (remove rolled back ones)
    const compactedEntries = entries.filter(
      entry => entry.status !== WALStatus.ROLLED_BACK
    );

    const removedCount = entries.length - compactedEntries.length;

    if (removedCount > 0) {
      const tempFile = walFile + '.tmp';
      const content = compactedEntries.map(e => JSON.stringify(e)).join('\n') + '\n';
      await writeFile(tempFile, content, 'utf-8');
      await rename(tempFile, walFile);

      log.info({ runId, removedCount }, 'WAL file compacted');
    }

    return removedCount;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}

/**
 * Write-ahead transition: logs intent before applying transition.
 * This is the main function to use for state transitions with WAL.
 *
 * @param run Current run
 * @param event Event to apply
 * @param applyFn Function that applies the transition and persists state
 * @returns The WAL entry ID (for marking complete after persistence)
 */
export async function writeAheadTransition(
  run: Run,
  event: RunEvent,
  targetState: RunState,
  metadata?: Record<string, unknown>,
  config?: WALConfig
): Promise<string> {
  const walConfig = config || getWALConfig();

  const entry = createWALEntry(
    run.id,
    run.state,
    targetState,
    event,
    metadata
  );

  await appendWALEntry(entry, walConfig);

  return entry.id;
}
