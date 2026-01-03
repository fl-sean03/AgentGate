/**
 * Observability Module
 * v0.2.25: Real-time progress and metrics
 */

// Progress Emitter
export {
  DefaultProgressEmitter,
  getProgressEmitter,
  resetProgressEmitter,
  type ProgressEmitter,
  type ProgressEvent,
  type ProgressEventType,
  type ProgressListener,
  type RunStartedEvent,
  type RunCompletedEvent,
  type RunCanceledEvent,
  type RunFailedEvent,
  type IterationStartedEvent,
  type IterationCompletedEvent,
  type PhaseStartedEvent,
  type PhaseCompletedEvent,
  type GateCheckedEvent,
  type DeliveryStartedEvent,
  type DeliveryCompletedEvent,
  type GateSummary,
  type ExecutionMetrics,
} from './progress-emitter.js';

// Metrics Collector
export {
  DefaultMetricsCollector,
  getMetricsCollector,
  resetMetricsCollector,
  type MetricsCollector,
  type MetricsSnapshot,
  type HistogramData,
} from './metrics-collector.js';
