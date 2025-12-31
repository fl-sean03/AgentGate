/**
 * Metrics module for run analytics.
 *
 * This module provides:
 * - MetricsCollector: In-memory collection during run execution
 * - Storage functions: Persist and load metrics from artifacts
 * - Aggregator: Compute run summaries from iteration data
 */

// Re-export types
export {
  Phase,
  MetricsResult,
  phaseSchema,
  phaseMetricsSchema,
  levelMetricsSchema,
  iterationMetricsSchema,
  metricsResultSchema,
  runMetricsSchema,
  type PhaseMetrics,
  type LevelMetrics,
  type IterationMetrics,
  type RunMetrics,
  type MetricsDisplayOptions,
} from '../types/metrics.js';

// Export collector
export { MetricsCollector } from './collector.js';

// Export storage functions
export {
  saveIterationMetrics,
  loadIterationMetrics,
  saveRunMetrics,
  loadRunMetrics,
  getAllIterationMetrics,
  metricsExist,
  ensureMetricsStructure,
} from './storage.js';

// Export aggregator functions
export {
  aggregateRunMetrics,
  computeInProgressMetrics,
} from './aggregator.js';
