# 11: Thrust 10 - Event-Driven Architecture

## Overview

Refactor the orchestrator to emit events for key operations, decoupling persistence, notification, and metrics from core execution logic.

---

## Current State

### Direct Coupling in Orchestrator

**Location:** `packages/server/src/orchestrator/orchestrator.ts`

```typescript
// Orchestrator directly calls everything
async executeIteration() {
  const result = await driver.execute();

  // Direct call to save
  await saveRun(run);

  // Direct call to broadcast
  this.broadcaster.broadcast({ type: 'iteration-complete', ... });

  // Direct call to metrics (if we had it)
  await recordMetrics(result);

  // Direct call to audit
  await auditTrail.record({ ... });
}
```

### Problems

1. **Tight coupling** - Orchestrator knows about every subsystem
2. **Hard to extend** - Adding new listener requires modifying orchestrator
3. **Ordering issues** - Must ensure persistence before notification
4. **Testing complexity** - Must mock many dependencies
5. **No pluggability** - Can't easily add/remove listeners

---

## Target State

### Event-Driven Flow

```typescript
// Orchestrator emits events, doesn't know about subscribers
async executeIteration() {
  const result = await driver.execute();

  // Just emit event
  this.emit('agent:complete', { runId, iteration, result });

  // Verification
  const report = await verify();
  this.emit('verification:complete', { runId, iteration, report });

  // Decision
  const decision = await strategy.onIterationComplete(event);
  this.emit('iteration:complete', { runId, iteration, decision });
}

// Subscribers handle their own concerns
resultPersister.on('agent:complete', saveAgentResult);
broadcaster.on('iteration:complete', notifyClients);
metricsCollector.on('agent:complete', recordMetrics);
```

---

## Event Definitions

**File:** `packages/server/src/orchestrator/events.ts`

```typescript
import { AgentResult } from '../types/agent.js';
import { VerificationReport } from '../verifier/types.js';
import { LoopDecision } from '../types/loop-strategy.js';
import { BuildError } from '../types/build-error.js';

/**
 * All orchestrator events.
 */
export enum OrchestratorEvent {
  // Run lifecycle
  RUN_QUEUED = 'run:queued',
  RUN_STARTED = 'run:started',
  RUN_COMPLETE = 'run:complete',
  RUN_FAILED = 'run:failed',

  // Iteration lifecycle
  ITERATION_STARTED = 'iteration:started',
  ITERATION_COMPLETE = 'iteration:complete',

  // Agent execution
  AGENT_STARTED = 'agent:started',
  AGENT_COMPLETE = 'agent:complete',
  AGENT_FAILED = 'agent:failed',

  // Verification
  VERIFICATION_STARTED = 'verification:started',
  VERIFICATION_COMPLETE = 'verification:complete',

  // Workspace
  WORKSPACE_ACQUIRED = 'workspace:acquired',
  WORKSPACE_RELEASED = 'workspace:released',
  SNAPSHOT_CREATED = 'snapshot:created',
  SNAPSHOT_RESTORED = 'snapshot:restored',

  // GitHub
  PR_CREATED = 'pr:created',
  PR_MERGED = 'pr:merged',

  // Strategy
  STRATEGY_DECISION = 'strategy:decision',
}

/**
 * Base event interface.
 */
export interface BaseEvent {
  timestamp: Date;
  runId: string;
  workOrderId: string;
}

/**
 * Run started event.
 */
export interface RunStartedEvent extends BaseEvent {
  iteration: number;
  maxIterations: number;
  harnessConfig: HarnessConfig;
}

/**
 * Run complete event.
 */
export interface RunCompleteEvent extends BaseEvent {
  result: 'succeeded' | 'failed';
  totalIterations: number;
  durationMs: number;
  prUrl: string | null;
  error: BuildError | null;
}

/**
 * Iteration started event.
 */
export interface IterationStartedEvent extends BaseEvent {
  iteration: number;
  feedback: string | null;
}

/**
 * Iteration complete event.
 */
export interface IterationCompleteEvent extends BaseEvent {
  iteration: number;
  agentSuccess: boolean;
  verificationPassed: boolean | null;
  decision: LoopDecision;
  durationMs: number;
}

/**
 * Agent complete event.
 */
export interface AgentCompleteEvent extends BaseEvent {
  iteration: number;
  result: AgentResult;
  resultFile: string;
}

/**
 * Agent failed event.
 */
export interface AgentFailedEvent extends BaseEvent {
  iteration: number;
  error: BuildError;
  resultFile: string;
}

/**
 * Verification complete event.
 */
export interface VerificationCompleteEvent extends BaseEvent {
  iteration: number;
  report: VerificationReport;
  reportFile: string;
}

/**
 * PR created event.
 */
export interface PRCreatedEvent extends BaseEvent {
  prUrl: string;
  branchName: string;
  title: string;
}

/**
 * Event map for type-safe event handling.
 */
export interface OrchestratorEventMap {
  [OrchestratorEvent.RUN_STARTED]: RunStartedEvent;
  [OrchestratorEvent.RUN_COMPLETE]: RunCompleteEvent;
  [OrchestratorEvent.ITERATION_STARTED]: IterationStartedEvent;
  [OrchestratorEvent.ITERATION_COMPLETE]: IterationCompleteEvent;
  [OrchestratorEvent.AGENT_COMPLETE]: AgentCompleteEvent;
  [OrchestratorEvent.AGENT_FAILED]: AgentFailedEvent;
  [OrchestratorEvent.VERIFICATION_COMPLETE]: VerificationCompleteEvent;
  [OrchestratorEvent.PR_CREATED]: PRCreatedEvent;
}
```

---

## Implementation

### Step 1: Create Typed EventEmitter

**File:** `packages/server/src/orchestrator/typed-emitter.ts`

```typescript
import { EventEmitter } from 'node:events';

/**
 * Type-safe EventEmitter with generic event map.
 */
export class TypedEventEmitter<T extends Record<string, any>> {
  private emitter = new EventEmitter();

  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.on(event as string, listener);
    return this;
  }

  once<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.once(event as string, listener);
    return this;
  }

  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.off(event as string, listener);
    return this;
  }

  emit<K extends keyof T>(event: K, data: T[K]): boolean {
    return this.emitter.emit(event as string, data);
  }

  listenerCount<K extends keyof T>(event: K): number {
    return this.emitter.listenerCount(event as string);
  }

  removeAllListeners<K extends keyof T>(event?: K): this {
    if (event) {
      this.emitter.removeAllListeners(event as string);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }
}
```

### Step 2: Refactor Orchestrator

**File:** `packages/server/src/orchestrator/orchestrator.ts`

```typescript
import { TypedEventEmitter } from './typed-emitter.js';
import {
  OrchestratorEvent,
  OrchestratorEventMap,
  AgentCompleteEvent,
  IterationCompleteEvent,
} from './events.js';

export class Orchestrator extends TypedEventEmitter<OrchestratorEventMap> {
  private resultPersister: ResultPersister;

  constructor() {
    super();
    this.resultPersister = new ResultPersister();

    // Subscribe internal listeners
    this.setupInternalListeners();
  }

  private setupInternalListeners(): void {
    // Persistence listener
    this.on(OrchestratorEvent.AGENT_COMPLETE, async (event) => {
      try {
        await this.resultPersister.saveAgentResult(
          event.runId,
          event.iteration,
          event.result
        );
      } catch (error) {
        log.error({ error }, 'Failed to persist agent result');
      }
    });

    this.on(OrchestratorEvent.VERIFICATION_COMPLETE, async (event) => {
      try {
        await this.resultPersister.saveVerificationReport(
          event.runId,
          event.iteration,
          event.report
        );
      } catch (error) {
        log.error({ error }, 'Failed to persist verification report');
      }
    });
  }

  async executeIteration(run: Run, iteration: number): Promise<void> {
    // Emit iteration start
    this.emit(OrchestratorEvent.ITERATION_STARTED, {
      timestamp: new Date(),
      runId: run.id,
      workOrderId: run.workOrderId,
      iteration,
      feedback: run.currentFeedback,
    });

    // Execute agent
    const agentResult = await this.driver.execute({...});

    // Persist result file first
    const resultFile = await this.resultPersister.saveAgentResult(
      run.id,
      iteration,
      agentResult
    );

    // Emit agent complete
    this.emit(OrchestratorEvent.AGENT_COMPLETE, {
      timestamp: new Date(),
      runId: run.id,
      workOrderId: run.workOrderId,
      iteration,
      result: agentResult,
      resultFile,
    });

    if (!agentResult.success) {
      const buildError = errorBuilder.fromAgentResult(agentResult, resultFile);
      this.emit(OrchestratorEvent.AGENT_FAILED, {
        timestamp: new Date(),
        runId: run.id,
        workOrderId: run.workOrderId,
        iteration,
        error: buildError,
        resultFile,
      });
      return;
    }

    // Verification
    const report = await this.verifier.verify({...});
    const reportFile = await this.resultPersister.saveVerificationReport(
      run.id,
      iteration,
      report
    );

    this.emit(OrchestratorEvent.VERIFICATION_COMPLETE, {
      timestamp: new Date(),
      runId: run.id,
      workOrderId: run.workOrderId,
      iteration,
      report,
      reportFile,
    });

    // Strategy decision
    const decision = await strategy.onIterationComplete({...});

    this.emit(OrchestratorEvent.ITERATION_COMPLETE, {
      timestamp: new Date(),
      runId: run.id,
      workOrderId: run.workOrderId,
      iteration,
      agentSuccess: agentResult.success,
      verificationPassed: report.overall.passed,
      decision,
      durationMs: Date.now() - iterationStart,
    });
  }
}
```

### Step 3: Create Event Subscribers

**File:** `packages/server/src/orchestrator/subscribers/broadcaster-subscriber.ts`

```typescript
import { Orchestrator } from '../orchestrator.js';
import { OrchestratorEvent } from '../events.js';
import { EventBroadcaster } from '../../server/broadcaster.js';

/**
 * Subscribes to orchestrator events and broadcasts to SSE clients.
 */
export function subscribeBroadcaster(
  orchestrator: Orchestrator,
  broadcaster: EventBroadcaster
): void {
  orchestrator.on(OrchestratorEvent.RUN_STARTED, (event) => {
    broadcaster.broadcast({
      type: 'run-started',
      runId: event.runId,
      timestamp: event.timestamp.toISOString(),
    });
  });

  orchestrator.on(OrchestratorEvent.ITERATION_COMPLETE, (event) => {
    broadcaster.broadcast({
      type: 'iteration-complete',
      runId: event.runId,
      iteration: event.iteration,
      verificationPassed: event.verificationPassed,
      timestamp: event.timestamp.toISOString(),
    });
  });

  orchestrator.on(OrchestratorEvent.RUN_COMPLETE, (event) => {
    broadcaster.broadcast({
      type: 'run-complete',
      runId: event.runId,
      result: event.result,
      prUrl: event.prUrl,
      timestamp: event.timestamp.toISOString(),
    });
  });
}
```

**File:** `packages/server/src/orchestrator/subscribers/metrics-subscriber.ts`

```typescript
import { Orchestrator } from '../orchestrator.js';
import { OrchestratorEvent } from '../events.js';
import { createLogger } from '../../logging/index.js';

const log = createLogger('metrics');

/**
 * Subscribes to orchestrator events and records metrics.
 */
export function subscribeMetrics(orchestrator: Orchestrator): void {
  orchestrator.on(OrchestratorEvent.AGENT_COMPLETE, (event) => {
    const result = event.result;
    log.info({
      metric: 'agent_execution',
      runId: event.runId,
      iteration: event.iteration,
      durationMs: result.durationMs,
      tokensUsed: result.tokensUsed?.total,
      costUsd: result.totalCostUsd,
      success: result.success,
    });
  });

  orchestrator.on(OrchestratorEvent.RUN_COMPLETE, (event) => {
    log.info({
      metric: 'run_complete',
      runId: event.runId,
      result: event.result,
      totalIterations: event.totalIterations,
      durationMs: event.durationMs,
    });
  });
}
```

**File:** `packages/server/src/orchestrator/subscribers/audit-subscriber.ts`

```typescript
import { Orchestrator } from '../orchestrator.js';
import { OrchestratorEvent } from '../events.js';
import { auditTrail } from '../../audit/trail.js';

/**
 * Subscribes to orchestrator events and records audit entries.
 */
export function subscribeAudit(orchestrator: Orchestrator): void {
  orchestrator.on(OrchestratorEvent.RUN_STARTED, async (event) => {
    await auditTrail.record({
      type: 'run_started',
      runId: event.runId,
      workOrderId: event.workOrderId,
      timestamp: event.timestamp,
      config: event.harnessConfig,
    });
  });

  orchestrator.on(OrchestratorEvent.RUN_COMPLETE, async (event) => {
    await auditTrail.record({
      type: 'run_complete',
      runId: event.runId,
      workOrderId: event.workOrderId,
      timestamp: event.timestamp,
      result: event.result,
      error: event.error,
    });
  });
}
```

### Step 4: Wire Up Subscribers

**File:** `packages/server/src/orchestrator/setup.ts`

```typescript
import { Orchestrator } from './orchestrator.js';
import { subscribeBroadcaster } from './subscribers/broadcaster-subscriber.js';
import { subscribeMetrics } from './subscribers/metrics-subscriber.js';
import { subscribeAudit } from './subscribers/audit-subscriber.js';
import { EventBroadcaster } from '../server/broadcaster.js';

/**
 * Set up orchestrator with all event subscribers.
 */
export function setupOrchestrator(broadcaster: EventBroadcaster): Orchestrator {
  const orchestrator = new Orchestrator();

  // Subscribe all listeners
  subscribeBroadcaster(orchestrator, broadcaster);
  subscribeMetrics(orchestrator);
  subscribeAudit(orchestrator);

  return orchestrator;
}
```

---

## Testing

### Unit Tests

**File:** `packages/server/test/orchestrator-events.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { OrchestratorEvent } from '../src/orchestrator/events.js';

describe('Orchestrator Events', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator();
  });

  describe('emit and subscribe', () => {
    it('should emit events to subscribers', () => {
      const handler = vi.fn();
      orchestrator.on(OrchestratorEvent.RUN_STARTED, handler);

      orchestrator.emit(OrchestratorEvent.RUN_STARTED, {
        timestamp: new Date(),
        runId: 'run-1',
        workOrderId: 'wo-1',
        iteration: 0,
        maxIterations: 3,
        harnessConfig: {} as any,
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 'run-1' })
      );
    });

    it('should support multiple subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      orchestrator.on(OrchestratorEvent.AGENT_COMPLETE, handler1);
      orchestrator.on(OrchestratorEvent.AGENT_COMPLETE, handler2);

      orchestrator.emit(OrchestratorEvent.AGENT_COMPLETE, {
        timestamp: new Date(),
        runId: 'run-1',
        workOrderId: 'wo-1',
        iteration: 0,
        result: {} as any,
        resultFile: 'agent-0.json',
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe correctly', () => {
      const handler = vi.fn();
      orchestrator.on(OrchestratorEvent.RUN_COMPLETE, handler);
      orchestrator.off(OrchestratorEvent.RUN_COMPLETE, handler);

      orchestrator.emit(OrchestratorEvent.RUN_COMPLETE, {
        timestamp: new Date(),
        runId: 'run-1',
        workOrderId: 'wo-1',
        result: 'succeeded',
        totalIterations: 1,
        durationMs: 5000,
        prUrl: null,
        error: null,
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('subscriber modules', () => {
    it('should call broadcaster on run complete', () => {
      const broadcast = vi.fn();
      const broadcaster = { broadcast } as any;

      subscribeBroadcaster(orchestrator, broadcaster);

      orchestrator.emit(OrchestratorEvent.RUN_COMPLETE, {
        timestamp: new Date(),
        runId: 'run-1',
        workOrderId: 'wo-1',
        result: 'succeeded',
        totalIterations: 1,
        durationMs: 5000,
        prUrl: 'https://github.com/...',
        error: null,
      });

      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'run-complete',
          runId: 'run-1',
          result: 'succeeded',
        })
      );
    });
  });
});
```

---

## Verification Checklist

- [ ] `OrchestratorEvent` enum defines all events
- [ ] Event interfaces defined with full type safety
- [ ] `OrchestratorEventMap` maps events to payloads
- [ ] `TypedEventEmitter` provides type-safe emit/on
- [ ] Orchestrator extends TypedEventEmitter
- [ ] Events emitted at key execution points
- [ ] `subscribeBroadcaster` handles SSE notifications
- [ ] `subscribeMetrics` records execution metrics
- [ ] `subscribeAudit` records audit entries
- [ ] `setupOrchestrator` wires all subscribers
- [ ] Events include timestamp and context
- [ ] Unit tests verify event emission
- [ ] Subscribers are decoupled from orchestrator

---

## Benefits

1. **Decoupling** - Orchestrator doesn't know about subscribers
2. **Extensibility** - Add new subscribers without modifying core
3. **Testability** - Test orchestrator and subscribers independently
4. **Type safety** - Events are fully typed
5. **Observability** - Clear event stream for debugging
6. **Pluggability** - Enable/disable subscribers via config
