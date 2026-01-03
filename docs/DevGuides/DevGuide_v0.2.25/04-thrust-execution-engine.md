# Thrust 3: Unified ExecutionEngine

## 3.1 Objective

Create a single `ExecutionEngine` that replaces both the legacy `executeRun()` function and the partially-implemented `ExecutionCoordinator`. This engine orchestrates the complete work order execution lifecycle using the modular components from other thrusts.

---

## 3.2 Background

### Current Dual-Stack Problem

**Legacy Path** (production):
```
orchestrator.execute()
  → 15 dynamic imports
  → workspace setup
  → 16 callback definitions
  → executeRun()
    → 675 lines of mixed logic
```

**New Path** (unused):
```
ExecutionCoordinator.execute()
  → workspace provisioning
  → convergence controller
  → gate pipeline
  → delivery coordination
```

These two paths should be one.

### Target Architecture

```
ExecutionEngine.execute()
  → Context creation
  → StateMachine management
  → PhaseOrchestrator delegation
  → ConvergenceController consultation
  → DeliveryManager coordination
  → ProgressEmitter notifications
```

---

## 3.3 Subtasks

### 3.3.1 Define ExecutionEngine Interface

**File Created**: `packages/server/src/execution/engine.ts`

**Specification**:

```typescript
/**
 * Configuration for ExecutionEngine
 */
interface ExecutionEngineConfig {
  // Component dependencies
  stateMachine: StateMachine;
  phaseOrchestrator: PhaseOrchestrator;
  convergenceController: ConvergenceController;
  deliveryManager: DeliveryManager;
  progressEmitter: ProgressEmitter;

  // Services
  workspaceManager: WorkspaceManager;
  agentDriverFactory: AgentDriverFactory;
  resultPersister: ResultPersister;
  logger: Logger;

  // Limits
  defaultTimeoutMs: number;
  maxConcurrentRuns: number;
}

/**
 * Input to execute a work order
 */
interface ExecutionInput {
  workOrder: WorkOrder;
  taskSpec: ResolvedTaskSpec;
  leaseId?: string;
}

/**
 * Result of execution
 */
interface ExecutionResult {
  run: Run;
  iterations: IterationData[];
  deliveryResult?: DeliveryResult;
  metrics: ExecutionMetrics;
}

/**
 * Metrics captured during execution
 */
interface ExecutionMetrics {
  totalDurationMs: number;
  iterationCount: number;
  phaseBreakdown: Record<Phase, number>;
  agentMetrics: {
    totalTokens: number;
    totalCostUsd: number;
    avgIterationMs: number;
  };
}

/**
 * Main execution engine interface
 */
interface ExecutionEngine {
  /**
   * Execute a work order to completion
   */
  execute(input: ExecutionInput): Promise<ExecutionResult>;

  /**
   * Cancel a running execution
   */
  cancel(runId: string, reason: string): Promise<void>;

  /**
   * Get status of running execution
   */
  getStatus(runId: string): ExecutionStatus | null;

  /**
   * Get count of active executions
   */
  getActiveCount(): number;
}
```

---

### 3.3.2 Implement ExecutionEngine Core

**File Created**: `packages/server/src/execution/engine.ts`

**Specification**:

The engine orchestrates all components but contains minimal logic itself:

```typescript
class DefaultExecutionEngine implements ExecutionEngine {
  private readonly activeRuns = new Map<string, ExecutionState>();

  constructor(private readonly config: ExecutionEngineConfig) {}

  async execute(input: ExecutionInput): Promise<ExecutionResult> {
    const { workOrder, taskSpec, leaseId } = input;
    const startTime = Date.now();

    // Check concurrency limit
    if (this.activeRuns.size >= this.config.maxConcurrentRuns) {
      throw new ConcurrencyLimitError(this.config.maxConcurrentRuns);
    }

    // Create execution context
    const context = await this.createContext(input);
    this.activeRuns.set(context.runId, { context, startTime });

    try {
      // Execute main loop
      const result = await this.executeLoop(context);

      // Handle delivery if successful
      if (result.run.state === RunState.SUCCEEDED) {
        result.deliveryResult = await this.executeDelivery(context, result);
      }

      return result;

    } finally {
      this.activeRuns.delete(context.runId);
      await this.cleanup(context, leaseId);
    }
  }

  private async createContext(input: ExecutionInput): Promise<ExecutionContext> {
    const runId = randomUUID();
    const { workOrder, taskSpec } = input;

    // Create run record
    const run = createRun(
      runId,
      workOrder.id,
      taskSpec.spec.execution.workspace.id ?? 'default',
      taskSpec.spec.convergence.limits.maxIterations ?? 3
    );

    // Acquire workspace
    const workspace = await this.config.workspaceManager.acquire(
      taskSpec.spec.execution.workspace
    );

    // Create agent driver
    const agentDriver = this.config.agentDriverFactory.create(
      taskSpec.spec.execution.agent
    );

    // Build services
    const services = this.buildServices(agentDriver);

    // Emit run started
    this.config.progressEmitter.emitRunStarted(workOrder.id, runId);

    return {
      workOrderId: workOrder.id,
      runId,
      taskSpec,
      workspace,
      run,
      services,
      startTime: Date.now(),
      maxWallClockMs: (taskSpec.spec.convergence.limits.maxWallClockSeconds ?? 3600) * 1000,
    };
  }

  private async executeLoop(context: ExecutionContext): Promise<ExecutionResult> {
    const iterations: IterationData[] = [];
    let run = context.run;
    let feedback: string | null = null;
    let sessionId: string | null = null;
    let beforeState = await this.captureBeforeState(context);

    // Transition to LEASED
    run = this.config.stateMachine.transition(run, RunEvent.WORKSPACE_ACQUIRED);
    await this.saveRun(run);

    // Initialize convergence controller
    await this.config.convergenceController.initialize(context.taskSpec.spec.convergence);

    // Main iteration loop
    while (!this.config.stateMachine.isTerminal(run.state)) {
      const iteration = run.iteration;

      // Check timeout
      if (this.isTimedOut(context)) {
        run = this.handleTimeout(context, run);
        break;
      }

      // Emit iteration started
      this.config.progressEmitter.emitIterationStarted(
        context.workOrderId,
        context.runId,
        iteration
      );

      // Transition to BUILDING
      run = this.config.stateMachine.transition(run, RunEvent.BUILD_STARTED);
      await this.saveRun(run);

      // Execute iteration via PhaseOrchestrator
      const phaseContext = this.buildPhaseContext(context, run, iteration);
      const iterationResult = await this.config.phaseOrchestrator.executeIteration(
        phaseContext,
        {
          taskPrompt: context.taskSpec.spec.goal.prompt,
          feedback,
          sessionId,
          beforeState,
          gatePlan: this.resolveGatePlan(context.taskSpec),
        }
      );

      // Record iteration data
      const iterationData = this.buildIterationData(iteration, iterationResult);
      iterations.push(iterationData);
      await this.saveIterationData(context.runId, iteration, iterationData);

      // Apply state transition from phase result
      run = this.config.stateMachine.transition(run, iterationResult.stateTransition);
      await this.saveRun(run);

      // Emit iteration completed
      this.config.progressEmitter.emitIterationCompleted(
        context.workOrderId,
        context.runId,
        iteration,
        iterationResult.success
      );

      // Check if we should continue
      if (!iterationResult.shouldContinue) {
        // Check convergence strategy
        const decision = await this.config.convergenceController.shouldContinue({
          iteration,
          gateResults: this.extractGateResults(iterationResult),
          history: iterations,
        });

        if (!decision.continue) {
          if (iterationResult.success) {
            // Converged successfully
            break;
          } else {
            // Failed to converge
            run = this.config.stateMachine.transition(run, RunEvent.VERIFY_FAILED_TERMINAL);
            run.result = RunResult.FAILED_VERIFICATION;
            run.error = decision.reason;
            await this.saveRun(run);
            break;
          }
        }
      }

      // Prepare for next iteration
      sessionId = iterationResult.nextSessionId;
      feedback = iterationResult.nextFeedback;
      beforeState = this.updateBeforeState(beforeState, iterationResult);
      run.iteration++;
      await this.saveRun(run);
    }

    return {
      run,
      iterations,
      metrics: this.calculateMetrics(context, iterations),
    };
  }

  private async executeDelivery(
    context: ExecutionContext,
    result: ExecutionResult
  ): Promise<DeliveryResult> {
    const deliverySpec = context.taskSpec.spec.delivery;

    return await this.config.deliveryManager.deliver({
      workOrderId: context.workOrderId,
      runId: context.runId,
      workspace: context.workspace,
      run: result.run,
      iterations: result.iterations,
      deliverySpec,
    });
  }

  async cancel(runId: string, reason: string): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) {
      throw new RunNotFoundError(runId);
    }

    const run = this.config.stateMachine.transition(state.context.run, RunEvent.USER_CANCELED);
    await this.saveRun(run);

    this.config.progressEmitter.emitRunCanceled(
      state.context.workOrderId,
      runId,
      reason
    );
  }

  getStatus(runId: string): ExecutionStatus | null {
    const state = this.activeRuns.get(runId);
    if (!state) return null;

    return {
      runId,
      state: state.context.run.state,
      iteration: state.context.run.iteration,
      elapsed: Date.now() - state.startTime,
    };
  }

  getActiveCount(): number {
    return this.activeRuns.size;
  }

  // Helper methods...
  private buildServices(agentDriver: AgentDriver): PhaseServices {
    return {
      agentDriver,
      snapshotter: new Snapshotter(),
      verifier: new Verifier(),
      feedbackGenerator: new FeedbackGenerator(),
      resultPersister: this.config.resultPersister,
      logger: this.config.logger,
    };
  }

  private isTimedOut(context: ExecutionContext): boolean {
    return Date.now() - context.startTime > context.maxWallClockMs;
  }

  private handleTimeout(context: ExecutionContext, run: Run): Run {
    const error = ErrorBuilder.createTimeout(
      Date.now() - context.startTime,
      context.maxWallClockMs,
      { runId: context.runId, iteration: run.iteration }
    );

    run = this.config.stateMachine.transition(run, RunEvent.SYSTEM_ERROR);
    run.result = RunResult.FAILED_ERROR;
    run.error = error.message;
    return run;
  }

  private async cleanup(context: ExecutionContext, leaseId?: string): Promise<void> {
    // Release workspace
    await this.config.workspaceManager.release(context.workspace.id);

    // Release lease if provided
    if (leaseId) {
      const { release } = await import('../workspace/lease.js');
      await release(context.workspace.id);
    }
  }
}
```

**Lines**: ~200 (compared to 675 in executeRun + 595 in orchestrator.execute)

**Key Improvements**:
1. Single execution path
2. Delegates to specialized components
3. Clear separation of concerns
4. Testable with mocked dependencies

---

### 3.3.3 Create Execution Context Types

**File Created**: `packages/server/src/execution/context.ts`

**Specification**:

```typescript
/**
 * Full execution context passed to all components
 */
interface ExecutionContext {
  // Identifiers
  workOrderId: string;
  runId: string;

  // Configuration
  taskSpec: ResolvedTaskSpec;

  // Resources
  workspace: Workspace;
  run: Run;

  // Services
  services: PhaseServices;

  // Timing
  startTime: number;
  maxWallClockMs: number;
}

/**
 * Execution state tracked by engine
 */
interface ExecutionState {
  context: ExecutionContext;
  startTime: number;
}

/**
 * Status of a running execution
 */
interface ExecutionStatus {
  runId: string;
  state: RunState;
  iteration: number;
  elapsed: number;
}
```

---

### 3.3.4 Integrate with Orchestrator

**File Modified**: `packages/server/src/orchestrator/orchestrator.ts`

**Change Description**:

Replace the 595-line `execute()` method with delegation to ExecutionEngine.

**Before**: 595 lines with 15 imports, 16 callbacks, inline logic

**After**:

```typescript
class Orchestrator {
  private readonly engine: ExecutionEngine;

  constructor(config: OrchestratorConfig) {
    this.engine = this.createEngine(config);
  }

  async execute(workOrder: WorkOrder): Promise<Run> {
    // Resolve TaskSpec from work order
    const taskSpec = await this.resolveTaskSpec(workOrder);

    // Acquire lease
    const leaseId = await this.acquireLease(workOrder, taskSpec);

    try {
      // Delegate to engine
      const result = await this.engine.execute({
        workOrder,
        taskSpec,
        leaseId,
      });

      // Update work order status
      await this.updateWorkOrderStatus(workOrder.id, result.run);

      return result.run;

    } catch (error) {
      await this.handleExecutionError(workOrder.id, error);
      throw error;
    }
  }

  private async resolveTaskSpec(workOrder: WorkOrder): Promise<ResolvedTaskSpec> {
    // Convert work order to TaskSpec
    const converter = new HarnessToTaskSpecConverter();
    const harnessConfig = await this.resolveHarnessConfig(workOrder);
    return converter.convert(harnessConfig, workOrder);
  }

  private createEngine(config: OrchestratorConfig): ExecutionEngine {
    return new DefaultExecutionEngine({
      stateMachine: new DefaultStateMachine(),
      phaseOrchestrator: this.createPhaseOrchestrator(),
      convergenceController: new DefaultConvergenceController(),
      deliveryManager: this.createDeliveryManager(config),
      progressEmitter: new DefaultProgressEmitter(),
      workspaceManager: new WorkspaceManager(),
      agentDriverFactory: new AgentDriverFactory(),
      resultPersister: new ResultPersister(),
      logger: createLogger('orchestrator'),
      defaultTimeoutMs: config.defaultTimeoutSeconds * 1000,
      maxConcurrentRuns: config.maxConcurrentRuns,
    });
  }

  // ... other methods
}
```

**Lines**: ~100 (down from 595)

---

### 3.3.5 Deprecate executeRun

**File Modified**: `packages/server/src/orchestrator/run-executor.ts`

**Change Description**:

Add deprecation notice and delegate to ExecutionEngine:

```typescript
/**
 * @deprecated Use ExecutionEngine.execute() instead.
 * This function will be removed in v0.3.0.
 *
 * Maintained for backwards compatibility during migration.
 */
export async function executeRun(options: RunExecutorOptions): Promise<Run> {
  console.warn(
    '[DEPRECATED] executeRun() is deprecated. Use ExecutionEngine.execute() instead.'
  );

  // Create execution engine with legacy options
  const engine = createEngineFromLegacyOptions(options);

  // Convert legacy options to new format
  const input = convertLegacyOptionsToInput(options);

  // Execute via new engine
  const result = await engine.execute(input);

  return result.run;
}
```

This allows gradual migration while maintaining backwards compatibility.

---

## 3.4 Verification Steps

### Unit Tests

```bash
# Test ExecutionEngine
pnpm --filter @agentgate/server test -- execution-engine.test.ts

# Test context creation
pnpm --filter @agentgate/server test -- execution-context.test.ts

# Test integration with components
pnpm --filter @agentgate/server test -- execution-engine-integration.test.ts
```

### Integration Tests

```bash
# Full work order execution
pnpm --filter @agentgate/server test:integration -- --grep "ExecutionEngine"

# Backwards compatibility
pnpm --filter @agentgate/server test:integration -- --grep "executeRun deprecated"
```

### Behavior Verification

- [ ] Single execution path for all work orders
- [ ] Legacy executeRun() still works (with deprecation warning)
- [ ] All components properly integrated
- [ ] Concurrency limits enforced
- [ ] Timeout handling works

---

## 3.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/execution/engine.ts` | Created | ExecutionEngine implementation |
| `packages/server/src/execution/context.ts` | Created | Context type definitions |
| `packages/server/src/orchestrator/orchestrator.ts` | Modified | Delegate to ExecutionEngine |
| `packages/server/src/orchestrator/run-executor.ts` | Modified | Add deprecation, delegate |
| `packages/server/test/unit/execution/engine.test.ts` | Created | Engine tests |

---

## 3.6 Dependencies

- **Depends on**:
  - Thrust 1 (StateMachine)
  - Thrust 2 (PhaseOrchestrator)
  - Thrust 4 (DeliveryManager)
  - Thrust 5 (ProgressEmitter)
- **Enables**: Complete unification of execution paths

---

## 3.7 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing behavior | Medium | High | Extensive integration tests |
| Performance regression | Low | Medium | Benchmark before/after |
| Component integration issues | Medium | Medium | Thorough unit tests per component |
