/**
 * Usage Store
 * v0.2.31 - Persistent storage for usage records
 *
 * Stores usage data in ~/.agentgate/billing/
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.js';
import { nanoid } from 'nanoid';
import type {
  UsageRecord,
  UsageAggregate,
  UsageQueryFilters,
} from './types.js';

const logger = createLogger('usage-store');

const BILLING_DIR = path.join(os.homedir(), '.agentgate', 'billing');
const USAGE_DIR = path.join(BILLING_DIR, 'usage');

/**
 * Usage Store for billing data persistence
 */
export class UsageStore {
  private static instance: UsageStore | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): UsageStore {
    if (!UsageStore.instance) {
      UsageStore.instance = new UsageStore();
    }
    return UsageStore.instance;
  }

  static resetInstance(): void {
    UsageStore.instance = null;
  }

  /**
   * Initialize the store (create directories)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(USAGE_DIR, { recursive: true });
      this.initialized = true;
      logger.info({ path: BILLING_DIR }, 'Usage store initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize usage store');
      throw error;
    }
  }

  /**
   * Record a usage event
   */
  async recordUsage(
    workOrderId: string,
    runId: string,
    iteration: number,
    data: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens?: number;
      costUsd: number;
      billingMethod: 'api-key' | 'subscription';
      durationMs: number;
      sessionId?: string;
      userId?: string;
    }
  ): Promise<UsageRecord> {
    await this.initialize();

    const record: UsageRecord = {
      id: nanoid(),
      workOrderId,
      runId,
      iteration,
      userId: data.userId,
      model: data.model,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cachedInputTokens: data.cachedInputTokens,
      costUsd: data.costUsd,
      billingMethod: data.billingMethod,
      durationMs: data.durationMs,
      timestamp: new Date(),
      sessionId: data.sessionId,
    };

    // Save to date-partitioned file
    const dateStr = record.timestamp.toISOString().split('T')[0];
    const filePath = path.join(USAGE_DIR, `${dateStr}.jsonl`);

    await fs.appendFile(filePath, JSON.stringify(record) + '\n');

    logger.debug(
      {
        recordId: record.id,
        workOrderId,
        runId,
        iteration,
        costUsd: record.costUsd,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
      },
      'Usage recorded'
    );

    return record;
  }

  /**
   * Query usage records
   */
  async queryUsage(filters: UsageQueryFilters = {}): Promise<UsageRecord[]> {
    await this.initialize();

    const records: UsageRecord[] = [];
    const { startDate, endDate, limit = 1000, offset = 0 } = filters;

    try {
      // List all usage files
      const files = await fs.readdir(USAGE_DIR);
      const jsonlFiles = files
        .filter(f => f.endsWith('.jsonl'))
        .sort()
        .reverse(); // Most recent first

      for (const file of jsonlFiles) {
        // Check date range
        const fileDate = file.replace('.jsonl', '');
        if (startDate && fileDate < startDate.toISOString().split('T')[0]!) continue;
        if (endDate && fileDate > endDate.toISOString().split('T')[0]!) continue;

        const filePath = path.join(USAGE_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const record = JSON.parse(line) as UsageRecord;
            record.timestamp = new Date(record.timestamp);

            // Apply filters
            if (filters.userId && record.userId !== filters.userId) continue;
            if (filters.workOrderId && record.workOrderId !== filters.workOrderId) continue;
            if (filters.runId && record.runId !== filters.runId) continue;
            if (filters.model && record.model !== filters.model) continue;
            if (filters.billingMethod && record.billingMethod !== filters.billingMethod) continue;

            records.push(record);
          } catch {
            logger.warn({ line }, 'Failed to parse usage record');
          }
        }
      }

      // Sort by timestamp descending
      records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Apply pagination
      return records.slice(offset, offset + limit);
    } catch (error) {
      logger.error({ error }, 'Failed to query usage');
      return [];
    }
  }

  /**
   * Get aggregated usage for a time period
   */
  async getUsageAggregate(filters: UsageQueryFilters = {}): Promise<UsageAggregate> {
    const records = await this.queryUsage({ ...filters, limit: 100000 });

    const aggregate: UsageAggregate = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCachedInputTokens: 0,
      totalCostUsd: 0,
      executionCount: records.length,
      workOrderCount: new Set(records.map(r => r.workOrderId)).size,
      totalDurationMs: 0,
      byModel: {},
      periodStart: filters.startDate ?? new Date(0),
      periodEnd: filters.endDate ?? new Date(),
    };

    for (const record of records) {
      aggregate.totalInputTokens += record.inputTokens;
      aggregate.totalOutputTokens += record.outputTokens;
      aggregate.totalCachedInputTokens += record.cachedInputTokens ?? 0;
      aggregate.totalCostUsd += record.costUsd;
      aggregate.totalDurationMs += record.durationMs;

      // Update period bounds
      if (record.timestamp < aggregate.periodStart) {
        aggregate.periodStart = record.timestamp;
      }
      if (record.timestamp > aggregate.periodEnd) {
        aggregate.periodEnd = record.timestamp;
      }

      // Aggregate by model
      if (!aggregate.byModel[record.model]) {
        aggregate.byModel[record.model] = {
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          count: 0,
        };
      }
      const modelStats = aggregate.byModel[record.model]!;
      modelStats.inputTokens += record.inputTokens;
      modelStats.outputTokens += record.outputTokens;
      modelStats.costUsd += record.costUsd;
      modelStats.count += 1;
    }

    // Round cost
    aggregate.totalCostUsd = Math.round(aggregate.totalCostUsd * 1_000_000) / 1_000_000;

    return aggregate;
  }

  /**
   * Get usage for a specific work order
   */
  async getWorkOrderUsage(workOrderId: string): Promise<UsageAggregate> {
    return this.getUsageAggregate({ workOrderId });
  }
}

/**
 * Get the usage store instance
 */
export function getUsageStore(): UsageStore {
  return UsageStore.getInstance();
}
