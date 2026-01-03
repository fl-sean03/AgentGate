import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import type { QueueMetrics } from './observability-types.js';

/**
 * Collects and computes queue metrics.
 */
export class MetricsCollector {
  private readonly logger: Logger;

  // Counters
  private totalProcessed = 0;
  private totalCompleted = 0;
  private totalFailed = 0;
  private totalRetries = 0;

  // Duration tracking for percentiles
  private readonly executionDurations: number[] = [];
  private readonly maxDurationHistory = 1000;

  constructor() {
    this.logger = createLogger('metrics-collector');
  }

  /**
   * Record a work order completion.
   */
  recordCompletion(durationMs: number): void {
    this.totalProcessed++;
    this.totalCompleted++;
    this.recordDuration(durationMs);
  }

  /**
   * Record a work order failure.
   */
  recordFailure(durationMs: number): void {
    this.totalProcessed++;
    this.totalFailed++;
    this.recordDuration(durationMs);
  }

  /**
   * Record a retry attempt.
   */
  recordRetry(): void {
    this.totalRetries++;
  }

  /**
   * Record execution duration.
   */
  private recordDuration(durationMs: number): void {
    this.executionDurations.push(durationMs);

    // Keep only recent history
    if (this.executionDurations.length > this.maxDurationHistory) {
      this.executionDurations.shift();
    }
  }

  /**
   * Calculate average duration.
   */
  getAvgDuration(): number {
    if (this.executionDurations.length === 0) return 0;

    const sum = this.executionDurations.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.executionDurations.length);
  }

  /**
   * Calculate p95 duration.
   */
  getP95Duration(): number {
    if (this.executionDurations.length === 0) return 0;

    const sorted = [...this.executionDurations].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index] ?? sorted[sorted.length - 1] ?? 0;
  }

  /**
   * Get current metrics snapshot.
   */
  getMetrics(
    queueDepth: number,
    activeExecutions: number,
    pendingRetries: number,
    memoryUsedMB: number,
    memoryAvailableMB: number
  ): QueueMetrics {
    return {
      queueDepth,
      activeExecutions,
      pendingRetries,
      totalProcessed: this.totalProcessed,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      totalRetries: this.totalRetries,
      avgExecutionDurationMs: this.getAvgDuration(),
      p95ExecutionDurationMs: this.getP95Duration(),
      memoryUsedMB,
      memoryAvailableMB,
      timestamp: new Date(),
    };
  }

  /**
   * Get counters for inspection.
   */
  getCounters(): {
    totalProcessed: number;
    totalCompleted: number;
    totalFailed: number;
    totalRetries: number;
  } {
    return {
      totalProcessed: this.totalProcessed,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      totalRetries: this.totalRetries,
    };
  }

  /**
   * Reset all counters (for testing).
   */
  reset(): void {
    this.totalProcessed = 0;
    this.totalCompleted = 0;
    this.totalFailed = 0;
    this.totalRetries = 0;
    this.executionDurations.length = 0;
  }
}
