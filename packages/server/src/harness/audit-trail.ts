/**
 * Audit Trail Module
 *
 * Tracks harness configuration changes across iterations and runs.
 * Provides a complete audit history of what configuration was active
 * at each point in execution.
 *
 * @module harness/audit-trail
 * @since v0.2.16 - Thrust 11
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getAuditDir } from '../artifacts/paths.js';
import { createLogger } from '../utils/logger.js';
import type { ResolvedHarnessConfig } from '../types/harness-config.js';
import { computeConfigHash } from './config-resolver.js';

const logger = createLogger('audit-trail');

/**
 * Represents a change between two configurations.
 */
export interface ConfigChange {
  /** Path to the changed field (e.g., "loopStrategy.maxIterations") */
  path: string;
  /** Previous value */
  previousValue: unknown;
  /** New value */
  newValue: unknown;
}

/**
 * A snapshot of configuration at a specific iteration.
 */
export interface ConfigSnapshot {
  /** Unique snapshot ID */
  id: string;
  /** Associated work order ID */
  workOrderId: string;
  /** Run ID */
  runId: string;
  /** Iteration number (0 for initial) */
  iteration: number;
  /** Timestamp */
  timestamp: Date;
  /** The resolved configuration at this point */
  config: ResolvedHarnessConfig;
  /** Hash of the configuration for comparison */
  configHash: string;
  /** Changes from previous snapshot (null for initial) */
  changesFromPrevious: ConfigChange[] | null;
}

/**
 * Complete audit record for a run.
 */
export interface ConfigAuditRecord {
  /** Run ID */
  runId: string;
  /** Work order ID */
  workOrderId: string;
  /** When the audit record was created */
  createdAt: Date;
  /** When the audit record was last updated */
  updatedAt: Date;
  /** Initial configuration snapshot */
  initialConfig: ConfigSnapshot;
  /** Snapshots for each iteration (if config changed) */
  iterationSnapshots: ConfigSnapshot[];
  /** Final configuration (same as last snapshot if no changes) */
  finalConfig: ConfigSnapshot | null;
  /** Total number of iterations */
  totalIterations: number;
  /** Whether configuration changed during execution */
  configChanged: boolean;
}

/**
 * Compares two configuration objects and returns the differences.
 */
function compareConfigs(
  previous: ResolvedHarnessConfig,
  current: ResolvedHarnessConfig,
  basePath = ''
): ConfigChange[] {
  const changes: ConfigChange[] = [];

  function compare(
    prev: Record<string, unknown>,
    curr: Record<string, unknown>,
    path: string
  ): void {
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);

    for (const key of allKeys) {
      const fullPath = path ? `${path}.${key}` : key;
      const prevValue = prev[key];
      const currValue = curr[key];

      if (prevValue === currValue) {
        continue;
      }

      // Handle nested objects
      if (
        typeof prevValue === 'object' &&
        typeof currValue === 'object' &&
        prevValue !== null &&
        currValue !== null &&
        !Array.isArray(prevValue) &&
        !Array.isArray(currValue)
      ) {
        compare(
          prevValue as Record<string, unknown>,
          currValue as Record<string, unknown>,
          fullPath
        );
        continue;
      }

      // Handle arrays - compare as JSON strings
      if (Array.isArray(prevValue) || Array.isArray(currValue)) {
        if (JSON.stringify(prevValue) !== JSON.stringify(currValue)) {
          changes.push({
            path: fullPath,
            previousValue: prevValue,
            newValue: currValue,
          });
        }
        continue;
      }

      // Primitive values changed
      changes.push({
        path: fullPath,
        previousValue: prevValue,
        newValue: currValue,
      });
    }
  }

  compare(
    previous as unknown as Record<string, unknown>,
    current as unknown as Record<string, unknown>,
    basePath
  );

  return changes;
}

/**
 * Audit Trail manager for tracking configuration changes.
 */
export class AuditTrail {
  private record: ConfigAuditRecord | null = null;
  private lastSnapshot: ConfigSnapshot | null = null;
  private snapshotCounter = 0;

  constructor(
    private readonly workOrderId: string,
    private readonly runId: string
  ) {}

  /**
   * Record the initial configuration for a run.
   */
  recordInitialConfig(config: ResolvedHarnessConfig): ConfigSnapshot {
    const snapshot = this.createSnapshot(config, 0, null);

    this.record = {
      runId: this.runId,
      workOrderId: this.workOrderId,
      createdAt: new Date(),
      updatedAt: new Date(),
      initialConfig: snapshot,
      iterationSnapshots: [],
      finalConfig: null,
      totalIterations: 0,
      configChanged: false,
    };

    this.lastSnapshot = snapshot;

    logger.debug(
      {
        runId: this.runId,
        configHash: snapshot.configHash,
      },
      'Recorded initial configuration'
    );

    return snapshot;
  }

  /**
   * Record configuration for an iteration.
   * Only creates a new snapshot if the config changed.
   */
  recordIterationConfig(
    config: ResolvedHarnessConfig,
    iteration: number
  ): ConfigSnapshot | null {
    if (!this.record || !this.lastSnapshot) {
      throw new Error('Must call recordInitialConfig before recordIterationConfig');
    }

    const currentHash = computeConfigHash(config);

    // Check if config changed
    if (currentHash === this.lastSnapshot.configHash) {
      // No change, just update iteration count
      this.record.totalIterations = iteration;
      this.record.updatedAt = new Date();
      return null;
    }

    // Config changed - create new snapshot
    const changes = compareConfigs(this.lastSnapshot.config, config);
    const snapshot = this.createSnapshot(config, iteration, changes);

    this.record.iterationSnapshots.push(snapshot);
    this.record.configChanged = true;
    this.record.totalIterations = iteration;
    this.record.updatedAt = new Date();
    this.lastSnapshot = snapshot;

    logger.info(
      {
        runId: this.runId,
        iteration,
        changesCount: changes.length,
        configHash: snapshot.configHash,
      },
      'Configuration changed during iteration'
    );

    return snapshot;
  }

  /**
   * Record the final configuration.
   */
  recordFinalConfig(config: ResolvedHarnessConfig, totalIterations: number): ConfigSnapshot {
    if (!this.record) {
      throw new Error('Must call recordInitialConfig before recordFinalConfig');
    }

    const currentHash = computeConfigHash(config);

    // Check if this is different from last snapshot
    if (this.lastSnapshot && currentHash === this.lastSnapshot.configHash) {
      // No change, use last snapshot as final
      this.record.finalConfig = this.lastSnapshot;
      this.record.totalIterations = totalIterations;
      this.record.updatedAt = new Date();
      return this.lastSnapshot;
    }

    // Create final snapshot
    const changes = this.lastSnapshot
      ? compareConfigs(this.lastSnapshot.config, config)
      : null;
    const snapshot = this.createSnapshot(config, totalIterations, changes);

    this.record.finalConfig = snapshot;
    this.record.totalIterations = totalIterations;
    this.record.updatedAt = new Date();

    if (changes && changes.length > 0) {
      this.record.configChanged = true;
    }

    logger.info(
      {
        runId: this.runId,
        totalIterations,
        configChanged: this.record.configChanged,
      },
      'Recorded final configuration'
    );

    return snapshot;
  }

  /**
   * Get the complete audit record.
   */
  getRecord(): ConfigAuditRecord | null {
    return this.record;
  }

  /**
   * Get the initial configuration hash.
   */
  getInitialHash(): string | null {
    return this.record?.initialConfig.configHash ?? null;
  }

  /**
   * Check if configuration changed during execution.
   */
  hasConfigChanged(): boolean {
    return this.record?.configChanged ?? false;
  }

  /**
   * Get the number of configuration changes.
   */
  getChangeCount(): number {
    return this.record?.iterationSnapshots.length ?? 0;
  }

  /**
   * Save the audit record to disk.
   */
  async save(): Promise<void> {
    if (!this.record) {
      logger.warn({ runId: this.runId }, 'No audit record to save');
      return;
    }

    const auditDir = getAuditDir();
    const filePath = path.join(auditDir, `${this.runId}.json`);

    // Ensure audit directory exists
    await fs.mkdir(auditDir, { recursive: true });

    // Serialize with date conversion
    const serialized = JSON.stringify(
      this.record,
      (_, value: unknown) => {
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      },
      2
    );

    await fs.writeFile(filePath, serialized);

    logger.debug(
      {
        runId: this.runId,
        path: filePath,
      },
      'Saved audit record'
    );
  }

  /**
   * Create a snapshot object.
   */
  private createSnapshot(
    config: ResolvedHarnessConfig,
    iteration: number,
    changes: ConfigChange[] | null
  ): ConfigSnapshot {
    this.snapshotCounter++;
    return {
      id: `${this.runId}-snap-${this.snapshotCounter}`,
      workOrderId: this.workOrderId,
      runId: this.runId,
      iteration,
      timestamp: new Date(),
      config,
      configHash: computeConfigHash(config),
      changesFromPrevious: changes,
    };
  }
}

/**
 * Load an audit record from disk.
 */
export async function loadAuditRecord(runId: string): Promise<ConfigAuditRecord | null> {
  const auditDir = getAuditDir();
  const filePath = path.join(auditDir, `${runId}.json`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;

    // Convert date strings back to Date objects
    const convertDates = (obj: Record<string, unknown>): void => {
      for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
          obj[key] = new Date(value);
        } else if (typeof value === 'object' && value !== null) {
          convertDates(value as Record<string, unknown>);
        }
      }
    };

    convertDates(parsed);
    return parsed as unknown as ConfigAuditRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * List all audit records.
 */
export async function listAuditRecords(): Promise<string[]> {
  const auditDir = getAuditDir();

  try {
    const files = await fs.readdir(auditDir);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Delete an audit record.
 */
export async function deleteAuditRecord(runId: string): Promise<boolean> {
  const auditDir = getAuditDir();
  const filePath = path.join(auditDir, `${runId}.json`);

  try {
    await fs.unlink(filePath);
    logger.debug({ runId, path: filePath }, 'Deleted audit record');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Create an audit trail for a run.
 */
export function createAuditTrail(workOrderId: string, runId: string): AuditTrail {
  return new AuditTrail(workOrderId, runId);
}
