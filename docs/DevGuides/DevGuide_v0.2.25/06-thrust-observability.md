# Thrust 5: Observability

## 5.1 Objective

Add comprehensive observability to the execution pipeline through a `ProgressEmitter` that provides real-time visibility into execution progress, iteration status, and phase timings.

---

## 5.2 Background

### Current State

Limited visibility during execution:
- Logs exist but require log access
- No real-time progress for dashboards
- Iteration progress not exposed
- Phase timings not tracked systematically

### Target State

Rich observability through:
- Progress events per iteration
- Phase timing events
- Real-time WebSocket integration
- Metrics for monitoring
- Structured logging with correlation IDs

---

## 5.3 Subtasks

### 5.3.1 Define ProgressEmitter Interface

**File Created**: `packages/server/src/observability/progress-emitter.ts`

**Specification**:

```typescript
/**
 * Event types emitted during execution
 */
type ProgressEventType =
  | 'run_started'
  | 'run_completed'
  | 'run_canceled'
  | 'run_failed'
  | 'iteration_started'
  | 'iteration_completed'
  | 'phase_started'
  | 'phase_completed'
  | 'gate_checked'
  | 'delivery_started'
  | 'delivery_completed';

/**
 * Base event structure
 */
interface ProgressEvent {
  type: ProgressEventType;
  timestamp: Date;
  workOrderId: string;
  runId: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Run lifecycle events
 */
interface RunStartedEvent extends ProgressEvent {
  type: 'run_started';
  taskSpec: {
    goal: string;
    strategy: string;
    maxIterations: number;
  };
}

interface RunCompletedEvent extends ProgressEvent {
  type: 'run_completed';
  result: 'succeeded' | 'failed' | 'canceled';
  iterations: number;
  durationMs: number;
  metrics: ExecutionMetrics;
}

/**
 * Iteration events
 */
interface IterationStartedEvent extends ProgressEvent {
  type: 'iteration_started';
  iteration: number;
  maxIterations: number;
  feedback?: string;
}

interface IterationCompletedEvent extends ProgressEvent {
  type: 'iteration_completed';
  iteration: number;
  success: boolean;
  phaseTimings: Record<Phase, number>;
  gateResults: GateSummary[];
}

/**
 * Phase events
 */
interface PhaseStartedEvent extends ProgressEvent {
  type: 'phase_started';
  iteration: number;
  phase: Phase;
}

interface PhaseCompletedEvent extends ProgressEvent {
  type: 'phase_completed';
  iteration: number;
  phase: Phase;
  success: boolean;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

/**
 * Progress emitter interface
 */
interface ProgressEmitter {
  // Run events
  emitRunStarted(workOrderId: string, runId: string, taskSpec: ResolvedTaskSpec): void;
  emitRunCompleted(workOrderId: string, runId: string, result: RunResult, metrics: ExecutionMetrics): void;
  emitRunCanceled(workOrderId: string, runId: string, reason: string): void;
  emitRunFailed(workOrderId: string, runId: string, error: string): void;

  // Iteration events
  emitIterationStarted(workOrderId: string, runId: string, iteration: number, feedback?: string): void;
  emitIterationCompleted(workOrderId: string, runId: string, iteration: number, success: boolean, timings: PhaseTimings): void;

  // Phase events
  emitPhaseStarted(workOrderId: string, runId: string, iteration: number, phase: Phase): void;
  emitPhaseCompleted(workOrderId: string, runId: string, iteration: number, phase: Phase, success: boolean, durationMs: number): void;

  // Gate events
  emitGateChecked(workOrderId: string, runId: string, iteration: number, gate: string, passed: boolean): void;

  // Delivery events
  emitDeliveryStarted(workOrderId: string, runId: string): void;
  emitDeliveryCompleted(workOrderId: string, runId: string, result: DeliveryResult): void;

  // Subscription
  subscribe(listener: ProgressListener): () => void;
}

type ProgressListener = (event: ProgressEvent) => void;
```

---

### 5.3.2 Implement DefaultProgressEmitter

**File Created**: `packages/server/src/observability/progress-emitter.ts`

**Specification**:

```typescript
class DefaultProgressEmitter implements ProgressEmitter {
  private readonly listeners = new Set<ProgressListener>();
  private readonly logger = createLogger('progress-emitter');

  emitRunStarted(workOrderId: string, runId: string, taskSpec: ResolvedTaskSpec): void {
    this.emit({
      type: 'run_started',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      taskSpec: {
        goal: taskSpec.spec.goal.prompt.slice(0, 100),
        strategy: taskSpec.spec.convergence.strategy,
        maxIterations: taskSpec.spec.convergence.limits.maxIterations ?? 3,
      },
    });
  }

  emitRunCompleted(
    workOrderId: string,
    runId: string,
    result: RunResult,
    metrics: ExecutionMetrics
  ): void {
    this.emit({
      type: 'run_completed',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      result: this.mapResult(result),
      iterations: metrics.iterationCount,
      durationMs: metrics.totalDurationMs,
      metrics,
    });
  }

  emitIterationStarted(
    workOrderId: string,
    runId: string,
    iteration: number,
    feedback?: string
  ): void {
    this.emit({
      type: 'iteration_started',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      iteration,
      maxIterations: 0, // Will be filled by caller
      feedback,
    });
  }

  emitIterationCompleted(
    workOrderId: string,
    runId: string,
    iteration: number,
    success: boolean,
    timings: PhaseTimings
  ): void {
    this.emit({
      type: 'iteration_completed',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      iteration,
      success,
      phaseTimings: timings,
      gateResults: [],
    });
  }

  emitPhaseStarted(
    workOrderId: string,
    runId: string,
    iteration: number,
    phase: Phase
  ): void {
    this.emit({
      type: 'phase_started',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      iteration,
      phase,
    });
  }

  emitPhaseCompleted(
    workOrderId: string,
    runId: string,
    iteration: number,
    phase: Phase,
    success: boolean,
    durationMs: number
  ): void {
    this.emit({
      type: 'phase_completed',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      iteration,
      phase,
      success,
      durationMs,
    });
  }

  emitGateChecked(
    workOrderId: string,
    runId: string,
    iteration: number,
    gate: string,
    passed: boolean
  ): void {
    this.emit({
      type: 'gate_checked',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      iteration,
      gate,
      passed,
    });
  }

  emitDeliveryStarted(workOrderId: string, runId: string): void {
    this.emit({
      type: 'delivery_started',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
    });
  }

  emitDeliveryCompleted(workOrderId: string, runId: string, result: DeliveryResult): void {
    this.emit({
      type: 'delivery_completed',
      timestamp: new Date(),
      workOrderId,
      runId,
      correlationId: runId,
      metadata: {
        success: result.success,
        prUrl: result.prResult?.prUrl,
        ciStatus: result.ciResult?.status,
      },
    });
  }

  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ProgressEvent): void {
    // Log the event
    this.logger.info({
      eventType: event.type,
      workOrderId: event.workOrderId,
      runId: event.runId,
      ...event.metadata,
    }, `Progress: ${event.type}`);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.error({ error }, 'Progress listener error');
      }
    }
  }

  private mapResult(result: RunResult): 'succeeded' | 'failed' | 'canceled' {
    switch (result) {
      case RunResult.PASSED:
        return 'succeeded';
      case RunResult.CANCELED:
        return 'canceled';
      default:
        return 'failed';
    }
  }
}

// Singleton instance
export const progressEmitter = new DefaultProgressEmitter();
```

---

### 5.3.3 Integrate with WebSocket Broadcaster

**File Modified**: `packages/server/src/server/websocket/broadcaster.ts`

**Change Description**:

Connect ProgressEmitter to existing WebSocket broadcaster:

```typescript
class EventBroadcaster {
  constructor(private readonly progressEmitter: ProgressEmitter) {
    this.subscribeToProgress();
  }

  private subscribeToProgress(): void {
    this.progressEmitter.subscribe((event) => {
      // Map progress events to WebSocket events
      switch (event.type) {
        case 'iteration_started':
          this.broadcast('iteration:started', {
            workOrderId: event.workOrderId,
            runId: event.runId,
            iteration: (event as IterationStartedEvent).iteration,
          });
          break;

        case 'iteration_completed':
          this.broadcast('iteration:completed', {
            workOrderId: event.workOrderId,
            runId: event.runId,
            iteration: (event as IterationCompletedEvent).iteration,
            success: (event as IterationCompletedEvent).success,
          });
          break;

        case 'phase_completed':
          this.broadcast('phase:completed', {
            workOrderId: event.workOrderId,
            runId: event.runId,
            phase: (event as PhaseCompletedEvent).phase,
            durationMs: (event as PhaseCompletedEvent).durationMs,
          });
          break;

        case 'run_completed':
          this.broadcast('run:completed', {
            workOrderId: event.workOrderId,
            runId: event.runId,
            result: (event as RunCompletedEvent).result,
            metrics: (event as RunCompletedEvent).metrics,
          });
          break;
      }
    });
  }
}
```

---

### 5.3.4 Create Metrics Collector

**File Created**: `packages/server/src/observability/metrics.ts`

**Specification**:

Collect metrics for monitoring (Prometheus-compatible):

```typescript
interface MetricsCollector {
  // Counters
  incrementRunsStarted(): void;
  incrementRunsCompleted(result: 'succeeded' | 'failed' | 'canceled'): void;
  incrementIterations(): void;

  // Histograms
  recordRunDuration(durationMs: number): void;
  recordIterationDuration(durationMs: number): void;
  recordPhaseDuration(phase: Phase, durationMs: number): void;

  // Gauges
  setActiveRuns(count: number): void;

  // Export
  getMetrics(): string;  // Prometheus format
}

class DefaultMetricsCollector implements MetricsCollector {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();
  private readonly gauges = new Map<string, number>();

  incrementRunsStarted(): void {
    this.increment('runs_started_total');
  }

  incrementRunsCompleted(result: 'succeeded' | 'failed' | 'canceled'): void {
    this.increment(`runs_completed_total{result="${result}"}`);
  }

  incrementIterations(): void {
    this.increment('iterations_total');
  }

  recordRunDuration(durationMs: number): void {
    this.addToHistogram('run_duration_seconds', durationMs / 1000);
  }

  recordIterationDuration(durationMs: number): void {
    this.addToHistogram('iteration_duration_seconds', durationMs / 1000);
  }

  recordPhaseDuration(phase: Phase, durationMs: number): void {
    this.addToHistogram(`phase_duration_seconds{phase="${phase}"}`, durationMs / 1000);
  }

  setActiveRuns(count: number): void {
    this.gauges.set('active_runs', count);
  }

  getMetrics(): string {
    const lines: string[] = [];

    // Counters
    for (const [name, value] of this.counters) {
      lines.push(`agentgate_${name} ${value}`);
    }

    // Gauges
    for (const [name, value] of this.gauges) {
      lines.push(`agentgate_${name} ${value}`);
    }

    // Histogram summaries (simplified)
    for (const [name, values] of this.histograms) {
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        const count = values.length;
        lines.push(`agentgate_${name}_sum ${sum}`);
        lines.push(`agentgate_${name}_count ${count}`);
      }
    }

    return lines.join('\n');
  }

  private increment(name: string): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }

  private addToHistogram(name: string, value: number): void {
    const values = this.histograms.get(name) ?? [];
    values.push(value);
    this.histograms.set(name, values);
  }
}

// Singleton
export const metricsCollector = new DefaultMetricsCollector();
```

---

### 5.3.5 Add Metrics Endpoint

**File Modified**: `packages/server/src/server/routes/health.ts`

**Change Description**:

Add `/metrics` endpoint:

```typescript
router.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metricsCollector.getMetrics());
});
```

---

### 5.3.6 Enhance Structured Logging

**File Modified**: `packages/server/src/utils/logger.ts`

**Change Description**:

Add correlation ID support:

```typescript
interface LogContext {
  workOrderId?: string;
  runId?: string;
  iteration?: number;
  phase?: Phase;
  correlationId?: string;
}

function createLogger(module: string): Logger {
  return {
    info: (context: LogContext, message: string) => {
      console.log(JSON.stringify({
        level: 'info',
        module,
        message,
        timestamp: new Date().toISOString(),
        ...context,
      }));
    },
    // ... other levels
  };
}

// Context propagation helper
function withContext<T>(context: LogContext, fn: () => T): T {
  // Async local storage for context propagation
  return asyncLocalStorage.run(context, fn);
}
```

---

## 5.4 Verification Steps

### Unit Tests

```bash
# Test progress emitter
pnpm --filter @agentgate/server test -- progress-emitter.test.ts

# Test metrics collector
pnpm --filter @agentgate/server test -- metrics.test.ts
```

### Integration Tests

```bash
# Test WebSocket integration
pnpm --filter @agentgate/server test:integration -- --grep "WebSocket progress"

# Test metrics endpoint
pnpm --filter @agentgate/server test:integration -- --grep "metrics endpoint"
```

### Behavior Verification

- [ ] Events emitted for all phases
- [ ] WebSocket broadcasts work
- [ ] Metrics endpoint returns valid Prometheus format
- [ ] Correlation IDs propagate correctly

---

## 5.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/observability/progress-emitter.ts` | Created | ProgressEmitter implementation |
| `packages/server/src/observability/metrics.ts` | Created | MetricsCollector |
| `packages/server/src/observability/index.ts` | Created | Module exports |
| `packages/server/src/server/websocket/broadcaster.ts` | Modified | Connect to ProgressEmitter |
| `packages/server/src/server/routes/health.ts` | Modified | Add /metrics endpoint |
| `packages/server/src/utils/logger.ts` | Modified | Correlation ID support |

---

## 5.6 Dependencies

- **Depends on**: Nothing (can be done in parallel)
- **Enables**: Thrust 3 (ExecutionEngine uses ProgressEmitter)

---

## 5.7 Dashboard Integration

The dashboard can subscribe to progress events via WebSocket:

```typescript
// Dashboard client
const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('message', (data) => {
  const event = JSON.parse(data);

  switch (event.type) {
    case 'iteration:completed':
      updateIterationProgress(event.iteration, event.success);
      break;
    case 'phase:completed':
      updatePhaseIndicator(event.phase, event.durationMs);
      break;
    case 'run:completed':
      showRunResult(event.result, event.metrics);
      break;
  }
});
```
