/**
 * Metrics Collector
 * v0.2.25: Prometheus-compatible metrics collection
 *
 * Collects metrics for monitoring:
 * - Counters (runs started, completed, failed)
 * - Histograms (duration distributions)
 * - Gauges (active runs)
 */

import type { Phase } from '../execution/phases/types.js';

/**
 * Metrics collector interface
 */
export interface MetricsCollector {
  // Counters
  incrementRunsStarted(): void;
  incrementRunsCompleted(result: 'succeeded' | 'failed' | 'canceled'): void;
  incrementIterations(): void;
  incrementPhaseExecutions(phase: Phase, success: boolean): void;

  // Histograms
  recordRunDuration(durationMs: number): void;
  recordIterationDuration(durationMs: number): void;
  recordPhaseDuration(phase: Phase, durationMs: number): void;

  // Gauges
  setActiveRuns(count: number): void;

  // Export
  getMetrics(): string; // Prometheus format
  getMetricsObject(): MetricsSnapshot;
}

/**
 * Snapshot of current metrics
 */
export interface MetricsSnapshot {
  counters: Record<string, number>;
  histograms: Record<string, HistogramData>;
  gauges: Record<string, number>;
  timestamp: Date;
}

/**
 * Histogram data
 */
export interface HistogramData {
  sum: number;
  count: number;
  buckets: Record<string, number>;
}

/**
 * Default histogram buckets (in seconds)
 */
const DEFAULT_BUCKETS = [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600];

/**
 * Default metrics collector implementation
 */
export class DefaultMetricsCollector implements MetricsCollector {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();
  private readonly gauges = new Map<string, number>();
  private readonly prefix: string;

  constructor(prefix: string = 'agentgate') {
    this.prefix = prefix;
  }

  // Counters
  incrementRunsStarted(): void {
    this.increment('runs_started_total');
  }

  incrementRunsCompleted(result: 'succeeded' | 'failed' | 'canceled'): void {
    this.increment(`runs_completed_total{result="${result}"}`);
  }

  incrementIterations(): void {
    this.increment('iterations_total');
  }

  incrementPhaseExecutions(phase: Phase, success: boolean): void {
    this.increment(
      `phase_executions_total{phase="${phase}",success="${success}"}`
    );
  }

  // Histograms
  recordRunDuration(durationMs: number): void {
    this.addToHistogram('run_duration_seconds', durationMs / 1000);
  }

  recordIterationDuration(durationMs: number): void {
    this.addToHistogram('iteration_duration_seconds', durationMs / 1000);
  }

  recordPhaseDuration(phase: Phase, durationMs: number): void {
    this.addToHistogram(
      `phase_duration_seconds{phase="${phase}"}`,
      durationMs / 1000
    );
  }

  // Gauges
  setActiveRuns(count: number): void {
    this.gauges.set('active_runs', count);
  }

  // Export as Prometheus format
  getMetrics(): string {
    const lines: string[] = [];

    // Add HELP and TYPE comments for known metrics
    lines.push('# HELP agentgate_runs_started_total Total number of runs started');
    lines.push('# TYPE agentgate_runs_started_total counter');

    // Counters
    for (const [name, value] of this.counters) {
      lines.push(`${this.prefix}_${name} ${value}`);
    }

    lines.push('');
    lines.push('# HELP agentgate_active_runs Number of currently active runs');
    lines.push('# TYPE agentgate_active_runs gauge');

    // Gauges
    for (const [name, value] of this.gauges) {
      lines.push(`${this.prefix}_${name} ${value}`);
    }

    lines.push('');

    // Histogram summaries
    for (const [name, values] of this.histograms) {
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        const count = values.length;

        lines.push(`# HELP ${this.prefix}_${name} Duration histogram`);
        lines.push(`# TYPE ${this.prefix}_${name} histogram`);

        // Add bucket counts
        for (const bucket of DEFAULT_BUCKETS) {
          const bucketCount = values.filter((v) => v <= bucket).length;
          lines.push(
            `${this.prefix}_${name}_bucket{le="${bucket}"} ${bucketCount}`
          );
        }
        lines.push(`${this.prefix}_${name}_bucket{le="+Inf"} ${count}`);
        lines.push(`${this.prefix}_${name}_sum ${sum}`);
        lines.push(`${this.prefix}_${name}_count ${count}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  // Export as object
  getMetricsObject(): MetricsSnapshot {
    const histogramData: Record<string, HistogramData> = {};

    for (const [name, values] of this.histograms) {
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        const buckets: Record<string, number> = {};

        for (const bucket of DEFAULT_BUCKETS) {
          buckets[bucket.toString()] = values.filter((v) => v <= bucket).length;
        }
        buckets['+Inf'] = values.length;

        histogramData[name] = {
          sum,
          count: values.length,
          buckets,
        };
      }
    }

    return {
      counters: Object.fromEntries(this.counters),
      histograms: histogramData,
      gauges: Object.fromEntries(this.gauges),
      timestamp: new Date(),
    };
  }

  // Internal helpers
  private increment(name: string): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }

  private addToHistogram(name: string, value: number): void {
    const values = this.histograms.get(name) ?? [];
    values.push(value);
    this.histograms.set(name, values);
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }
}

/**
 * Singleton instance
 */
let metricsCollectorInstance: MetricsCollector | null = null;

/**
 * Get or create the global metrics collector
 */
export function getMetricsCollector(): MetricsCollector {
  if (!metricsCollectorInstance) {
    metricsCollectorInstance = new DefaultMetricsCollector();
  }
  return metricsCollectorInstance;
}

/**
 * Reset metrics collector (for testing)
 */
export function resetMetricsCollector(): void {
  metricsCollectorInstance = null;
}
