# Thrust 2: Phase Handlers

## 2.1 Objective

Extract the monolithic `executeRun()` function into modular, single-responsibility phase handlers. Each phase (build, snapshot, verify, feedback) becomes a dedicated handler class that is independently testable and maintainable.

---

## 2.2 Background

### Current State

`run-executor.ts:executeRun()` is 675 lines handling 8+ responsibilities:

```
executeRun() responsibilities:
├── Run initialization (lines 242-309)
├── Lease renewal setup (lines 267-281)
├── Loop strategy initialization (lines 316-339)
├── Timeout enforcement (lines 348-371)
├── BUILD PHASE (lines 405-490)
│   ├── State transition
│   ├── Streaming callback creation
│   ├── Agent execution
│   ├── Result recording
│   └── Error handling
├── PUSH ITERATION (lines 496-515)
├── SNAPSHOT PHASE (lines 517-540)
├── VERIFY PHASE (lines 541-677)
│   ├── Verification execution
│   ├── PR creation (6 levels of nesting)
│   ├── CI polling
│   └── Success/failure handling
├── DECISION PHASE (lines 679-780)
├── FEEDBACK PHASE (lines 782-837)
└── Cleanup (lines 871-888)
```

### Problems

1. **Cannot test phases independently**: Testing build phase requires mocking verify, feedback, etc.
2. **High cognitive load**: Developer must understand entire flow
3. **Difficult to extend**: Adding new phase behavior touches massive function
4. **Mixed concerns**: Phase logic mixed with state machine, persistence, streaming

---

## 2.3 Subtasks

### 2.3.1 Define Phase Handler Interface

**File Created**: `packages/server/src/execution/phases/types.ts`

**Specification**:

Define common interface for all phase handlers:

```typescript
/**
 * Context provided to phase handlers
 */
interface PhaseContext {
  // Identifiers
  workOrderId: string;
  runId: string;
  iteration: number;

  // Configuration
  taskSpec: ResolvedTaskSpec;
  workspace: Workspace;

  // State (read-only snapshot at phase start)
  run: Readonly<Run>;
  beforeState: BeforeState;

  // Services
  services: PhaseServices;

  // Optional streaming
  streamingCallback?: StreamingEventCallback;
}

/**
 * Services available to phase handlers
 */
interface PhaseServices {
  agentDriver: AgentDriver;
  snapshotter: Snapshotter;
  verifier: Verifier;
  feedbackGenerator: FeedbackGenerator;
  resultPersister: ResultPersister;
  logger: Logger;
}

/**
 * Base result type for all phases
 */
interface PhaseResult {
  success: boolean;
  error?: PhaseError;
  duration: number;
  metadata?: Record<string, unknown>;
}

/**
 * Phase handler interface
 */
interface PhaseHandler<TInput, TResult extends PhaseResult> {
  readonly name: string;
  readonly phase: Phase;

  /**
   * Execute the phase
   */
  execute(context: PhaseContext, input: TInput): Promise<TResult>;

  /**
   * Validate inputs before execution
   */
  validate?(context: PhaseContext, input: TInput): ValidationResult;
}
```

**Design Decisions**:

1. **Immutable Run**: Handlers receive read-only Run to prevent direct mutation
2. **Services Injection**: All external dependencies provided via services
3. **Typed Results**: Each phase has specific result type
4. **Optional Validation**: Handlers can validate inputs before execution

---

### 2.3.2 Create BuildPhaseHandler

**File Created**: `packages/server/src/execution/phases/build.ts`

**Responsibility**: Execute agent to perform build task

**Specification**:

```typescript
interface BuildPhaseInput {
  taskPrompt: string;
  feedback: string | null;
  sessionId: string | null;
}

interface BuildPhaseResult extends PhaseResult {
  sessionId: string;
  agentResult?: AgentResult;
  buildError?: BuildError;
}

class BuildPhaseHandler implements PhaseHandler<BuildPhaseInput, BuildPhaseResult> {
  readonly name = 'build';
  readonly phase = 'build' as const;

  constructor(private readonly options: BuildPhaseOptions) {}

  async execute(
    context: PhaseContext,
    input: BuildPhaseInput
  ): Promise<BuildPhaseResult> {
    const startTime = Date.now();
    const { services, workspace, taskSpec } = context;

    services.logger.info({
      runId: context.runId,
      iteration: context.iteration,
    }, 'Build phase started');

    try {
      // Construct agent request
      const request = this.buildAgentRequest(context, input);

      // Execute agent
      const agentResult = await services.agentDriver.execute(
        request,
        context.streamingCallback
      );

      // Persist agent result
      await this.persistAgentResult(context, agentResult);

      // Check success
      if (!agentResult.success) {
        const buildError = ErrorBuilder.fromAgentResult(
          agentResult,
          context.runId,
          context.iteration
        );

        return {
          success: false,
          sessionId: agentResult.sessionId,
          agentResult,
          buildError,
          duration: Date.now() - startTime,
        };
      }

      return {
        success: true,
        sessionId: agentResult.sessionId,
        agentResult,
        duration: Date.now() - startTime,
      };

    } catch (error) {
      services.logger.error({
        runId: context.runId,
        iteration: context.iteration,
        error,
      }, 'Build phase failed with exception');

      const buildError = ErrorBuilder.fromSystemError(error, {
        runId: context.runId,
        iteration: context.iteration,
        phase: 'build',
      });

      return {
        success: false,
        sessionId: input.sessionId ?? 'unknown',
        buildError,
        duration: Date.now() - startTime,
        error: {
          type: 'exception',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private buildAgentRequest(
    context: PhaseContext,
    input: BuildPhaseInput
  ): AgentRequest {
    return {
      workspacePath: context.workspace.path,
      taskPrompt: input.taskPrompt,
      feedback: input.feedback,
      sessionId: input.sessionId,
      iteration: context.iteration,
      constraints: context.taskSpec.spec.execution.agent.constraints,
      timeoutMs: context.taskSpec.spec.convergence.limits.maxWallClockSeconds
        ? context.taskSpec.spec.convergence.limits.maxWallClockSeconds * 1000
        : undefined,
    };
  }

  private async persistAgentResult(
    context: PhaseContext,
    result: AgentResult
  ): Promise<string | null> {
    try {
      return await context.services.resultPersister.saveAgentResult(
        context.runId,
        context.iteration,
        result
      );
    } catch (error) {
      context.services.logger.error({
        runId: context.runId,
        iteration: context.iteration,
        error,
      }, 'Failed to persist agent result');
      return null;
    }
  }
}
```

**Lines**: ~100 (down from embedded in 675)

**Verification**:
- [ ] Handler executes agent successfully
- [ ] Error classification works for agent failures
- [ ] Persistence failures don't fail the phase
- [ ] Streaming callback passed through

---

### 2.3.3 Create SnapshotPhaseHandler

**File Created**: `packages/server/src/execution/phases/snapshot.ts`

**Responsibility**: Capture git state after agent execution

**Specification**:

```typescript
interface SnapshotPhaseInput {
  beforeState: BeforeState;
}

interface SnapshotPhaseResult extends PhaseResult {
  snapshot?: Snapshot;
}

class SnapshotPhaseHandler implements PhaseHandler<SnapshotPhaseInput, SnapshotPhaseResult> {
  readonly name = 'snapshot';
  readonly phase = 'snapshot' as const;

  async execute(
    context: PhaseContext,
    input: SnapshotPhaseInput
  ): Promise<SnapshotPhaseResult> {
    const startTime = Date.now();
    const { services, workspace, taskSpec } = context;

    services.logger.info({
      runId: context.runId,
      iteration: context.iteration,
    }, 'Snapshot phase started');

    try {
      // Capture after state
      const snapshot = await services.snapshotter.capture(
        workspace.path,
        input.beforeState,
        {
          runId: context.runId,
          iteration: context.iteration,
          taskPrompt: taskSpec.spec.goal.prompt,
        }
      );

      services.logger.info({
        runId: context.runId,
        iteration: context.iteration,
        snapshotId: snapshot.id,
        filesChanged: snapshot.diffs?.length ?? 0,
      }, 'Snapshot captured');

      return {
        success: true,
        snapshot,
        duration: Date.now() - startTime,
      };

    } catch (error) {
      services.logger.error({
        runId: context.runId,
        iteration: context.iteration,
        error,
      }, 'Snapshot phase failed');

      const snapshotError = ErrorBuilder.fromSystemError(error, {
        runId: context.runId,
        iteration: context.iteration,
        phase: 'snapshot',
      });

      return {
        success: false,
        duration: Date.now() - startTime,
        error: {
          type: 'snapshot_failed',
          message: snapshotError.message,
          details: snapshotError.context,
        },
      };
    }
  }
}
```

**Lines**: ~70

**Verification**:
- [ ] Handler captures snapshot correctly
- [ ] Git state changes detected
- [ ] Failures return proper error structure

---

### 2.3.4 Create VerifyPhaseHandler

**File Created**: `packages/server/src/execution/phases/verify.ts`

**Responsibility**: Execute verification gates

**Specification**:

```typescript
interface VerifyPhaseInput {
  snapshot: Snapshot;
  gatePlan: GatePlan;
}

interface VerifyPhaseResult extends PhaseResult {
  report?: VerificationReport;
  gateResults?: GateResult[];
  allPassed: boolean;
}

class VerifyPhaseHandler implements PhaseHandler<VerifyPhaseInput, VerifyPhaseResult> {
  readonly name = 'verify';
  readonly phase = 'verify' as const;

  async execute(
    context: PhaseContext,
    input: VerifyPhaseInput
  ): Promise<VerifyPhaseResult> {
    const startTime = Date.now();
    const { services, taskSpec } = context;

    services.logger.info({
      runId: context.runId,
      iteration: context.iteration,
      gateCount: input.gatePlan.gates?.length ?? 0,
    }, 'Verify phase started');

    try {
      // Execute verification
      const report = await services.verifier.verify(
        input.snapshot,
        input.gatePlan,
        {
          runId: context.runId,
          iteration: context.iteration,
          skip: taskSpec.spec.convergence.gates?.some(g => g.skip) ?? false,
        }
      );

      // Persist verification report
      await this.persistReport(context, report);

      services.logger.info({
        runId: context.runId,
        iteration: context.iteration,
        passed: report.passed,
        l0Passed: report.l0Result?.passed,
        l1Passed: report.l1Result?.passed,
      }, 'Verification complete');

      return {
        success: true,
        report,
        allPassed: report.passed,
        duration: Date.now() - startTime,
        metadata: {
          levelsRun: this.extractLevelsRun(report),
        },
      };

    } catch (error) {
      services.logger.error({
        runId: context.runId,
        iteration: context.iteration,
        error,
      }, 'Verify phase failed');

      return {
        success: false,
        allPassed: false,
        duration: Date.now() - startTime,
        error: {
          type: 'verification_exception',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async persistReport(
    context: PhaseContext,
    report: VerificationReport
  ): Promise<void> {
    try {
      await context.services.resultPersister.saveVerificationReport(
        context.runId,
        context.iteration,
        report
      );
    } catch (error) {
      context.services.logger.error({
        runId: context.runId,
        iteration: context.iteration,
        error,
      }, 'Failed to persist verification report');
    }
  }

  private extractLevelsRun(report: VerificationReport): string[] {
    const levels: string[] = [];
    if (report.l0Result?.checks?.length) levels.push('L0');
    if (report.l1Result?.checks?.length) levels.push('L1');
    if (report.l2Result?.checks?.length) levels.push('L2');
    if (report.l3Result?.checks?.length) levels.push('L3');
    return levels;
  }
}
```

**Lines**: ~100

**Verification**:
- [ ] Handler executes all verification levels
- [ ] Report correctly indicates pass/fail
- [ ] Persistence failures don't fail the phase

---

### 2.3.5 Create FeedbackPhaseHandler

**File Created**: `packages/server/src/execution/phases/feedback.ts`

**Responsibility**: Generate feedback from verification failures

**Specification**:

```typescript
interface FeedbackPhaseInput {
  snapshot: Snapshot;
  verificationReport: VerificationReport;
  gatePlan: GatePlan;
}

interface FeedbackPhaseResult extends PhaseResult {
  feedback?: string;
}

class FeedbackPhaseHandler implements PhaseHandler<FeedbackPhaseInput, FeedbackPhaseResult> {
  readonly name = 'feedback';
  readonly phase = 'feedback' as const;

  async execute(
    context: PhaseContext,
    input: FeedbackPhaseInput
  ): Promise<FeedbackPhaseResult> {
    const startTime = Date.now();
    const { services } = context;

    services.logger.info({
      runId: context.runId,
      iteration: context.iteration,
    }, 'Feedback phase started');

    try {
      const feedback = await services.feedbackGenerator.generate(
        input.snapshot,
        input.verificationReport,
        input.gatePlan,
        {
          runId: context.runId,
          iteration: context.iteration,
        }
      );

      services.logger.info({
        runId: context.runId,
        iteration: context.iteration,
        feedbackLength: feedback.length,
      }, 'Feedback generated');

      return {
        success: true,
        feedback,
        duration: Date.now() - startTime,
      };

    } catch (error) {
      services.logger.error({
        runId: context.runId,
        iteration: context.iteration,
        error,
      }, 'Feedback phase failed');

      // Provide fallback feedback on error
      const fallbackFeedback = this.createFallbackFeedback(input.verificationReport);

      return {
        success: true, // Still success - we have fallback
        feedback: fallbackFeedback,
        duration: Date.now() - startTime,
        metadata: {
          fallback: true,
        },
      };
    }
  }

  private createFallbackFeedback(report: VerificationReport): string {
    const lines: string[] = ['Verification failed. Please review and fix:'];

    if (!report.l0Result?.passed) {
      lines.push('- L0 (Contracts): Type errors or lint issues detected');
    }
    if (!report.l1Result?.passed) {
      lines.push('- L1 (Tests): Unit tests failed');
    }
    if (!report.l2Result?.passed) {
      lines.push('- L2 (Blackbox): Integration tests failed');
    }
    if (!report.l3Result?.passed) {
      lines.push('- L3 (CI): CI checks failed');
    }

    return lines.join('\n');
  }
}
```

**Lines**: ~80

**Verification**:
- [ ] Handler generates feedback from report
- [ ] Fallback feedback works when generator fails
- [ ] Feedback includes actionable information

---

### 2.3.6 Create PhaseOrchestrator

**File Created**: `packages/server/src/execution/phase-orchestrator.ts`

**Responsibility**: Coordinate phase execution sequence

**Specification**:

```typescript
interface PhaseOrchestratorConfig {
  handlers: {
    build: BuildPhaseHandler;
    snapshot: SnapshotPhaseHandler;
    verify: VerifyPhaseHandler;
    feedback: FeedbackPhaseHandler;
  };
}

interface IterationInput {
  taskPrompt: string;
  feedback: string | null;
  sessionId: string | null;
  beforeState: BeforeState;
  gatePlan: GatePlan;
}

interface IterationResult {
  success: boolean;
  phases: {
    build?: BuildPhaseResult;
    snapshot?: SnapshotPhaseResult;
    verify?: VerifyPhaseResult;
    feedback?: FeedbackPhaseResult;
  };
  nextSessionId: string | null;
  nextFeedback: string | null;
  shouldContinue: boolean;
  stateTransition: RunEvent;
}

class PhaseOrchestrator {
  constructor(private readonly config: PhaseOrchestratorConfig) {}

  async executeIteration(
    context: PhaseContext,
    input: IterationInput
  ): Promise<IterationResult> {
    const result: IterationResult = {
      success: false,
      phases: {},
      nextSessionId: null,
      nextFeedback: null,
      shouldContinue: false,
      stateTransition: RunEvent.SYSTEM_ERROR,
    };

    // BUILD PHASE
    const buildResult = await this.config.handlers.build.execute(context, {
      taskPrompt: input.taskPrompt,
      feedback: input.feedback,
      sessionId: input.sessionId,
    });
    result.phases.build = buildResult;
    result.nextSessionId = buildResult.sessionId;

    if (!buildResult.success) {
      result.stateTransition = RunEvent.BUILD_FAILED;
      return result;
    }

    // SNAPSHOT PHASE
    const snapshotResult = await this.config.handlers.snapshot.execute(context, {
      beforeState: input.beforeState,
    });
    result.phases.snapshot = snapshotResult;

    if (!snapshotResult.success || !snapshotResult.snapshot) {
      result.stateTransition = RunEvent.SNAPSHOT_FAILED;
      return result;
    }

    // VERIFY PHASE
    const verifyResult = await this.config.handlers.verify.execute(context, {
      snapshot: snapshotResult.snapshot,
      gatePlan: input.gatePlan,
    });
    result.phases.verify = verifyResult;

    if (verifyResult.allPassed) {
      result.success = true;
      result.stateTransition = RunEvent.VERIFY_PASSED;
      return result;
    }

    // FEEDBACK PHASE (only if verification failed)
    const feedbackResult = await this.config.handlers.feedback.execute(context, {
      snapshot: snapshotResult.snapshot,
      verificationReport: verifyResult.report!,
      gatePlan: input.gatePlan,
    });
    result.phases.feedback = feedbackResult;
    result.nextFeedback = feedbackResult.feedback ?? null;
    result.shouldContinue = true;
    result.stateTransition = RunEvent.VERIFY_FAILED_RETRYABLE;

    return result;
  }
}
```

**Lines**: ~100

**Verification**:
- [ ] Orchestrator sequences phases correctly
- [ ] Early exit on phase failure
- [ ] State transitions returned correctly
- [ ] Results aggregated properly

---

## 2.4 Verification Steps

### Unit Tests

```bash
# Test individual handlers
pnpm --filter @agentgate/server test -- build-phase.test.ts
pnpm --filter @agentgate/server test -- snapshot-phase.test.ts
pnpm --filter @agentgate/server test -- verify-phase.test.ts
pnpm --filter @agentgate/server test -- feedback-phase.test.ts

# Test orchestrator
pnpm --filter @agentgate/server test -- phase-orchestrator.test.ts
```

### Integration Tests

```bash
# Full iteration execution
pnpm --filter @agentgate/server test:integration -- --grep "PhaseOrchestrator"
```

### Behavior Verification

- [ ] Each handler can be tested in isolation with mocked services
- [ ] PhaseOrchestrator correctly sequences handlers
- [ ] Phase failures result in correct state transitions
- [ ] Persistence failures don't block execution

---

## 2.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/execution/phases/types.ts` | Created | Phase handler interfaces |
| `packages/server/src/execution/phases/build.ts` | Created | BuildPhaseHandler |
| `packages/server/src/execution/phases/snapshot.ts` | Created | SnapshotPhaseHandler |
| `packages/server/src/execution/phases/verify.ts` | Created | VerifyPhaseHandler |
| `packages/server/src/execution/phases/feedback.ts` | Created | FeedbackPhaseHandler |
| `packages/server/src/execution/phase-orchestrator.ts` | Created | Phase sequencing |
| `packages/server/src/execution/phases/index.ts` | Created | Module exports |
| `packages/server/test/unit/execution/phases/*.test.ts` | Created | Handler tests |

---

## 2.6 Dependencies

- **Depends on**: Thrust 1 (state machine transitions)
- **Enables**: Thrust 3 (ExecutionEngine uses PhaseOrchestrator)

---

## 2.7 Migration Notes

The new phase handlers will initially be used alongside existing code:

1. Phase handlers created and tested
2. PhaseOrchestrator tested with mocked handlers
3. ExecutionEngine (Thrust 3) integrates PhaseOrchestrator
4. Old executeRun() deprecated

No breaking changes during migration.
