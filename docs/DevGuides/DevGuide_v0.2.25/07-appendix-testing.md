# Appendix A: Testing and Validation Strategy

## Overview

This appendix defines the comprehensive testing strategy for v0.2.25. The focus is on:
1. **State machine completeness** - Every transition tested
2. **Phase handler isolation** - Each handler testable independently
3. **Integration verification** - Components work together
4. **Bug #65 prevention** - Specific scenarios that caused the bug

---

## Test Pyramid

```
                    ┌───────────────────┐
                    │   E2E Scenarios   │  ← 5-10 scenarios
                    │   (Bug #65, etc)  │
                    ├───────────────────┤
                    │   Integration     │  ← 20-30 tests
                    │   (Component)     │
                    ├───────────────────┤
                    │                   │
                    │   Unit Tests      │  ← 150+ tests
                    │   (Functions)     │
                    │                   │
                    └───────────────────┘
```

---

## Test Locations

```
packages/server/test/
├── unit/
│   ├── orchestrator/
│   │   ├── state-machine.test.ts           # Existing
│   │   ├── state-machine-complete.test.ts  # NEW: Full coverage
│   │   └── state-machine-validator.test.ts # NEW: Validation
│   ├── execution/
│   │   ├── engine.test.ts                  # NEW
│   │   ├── context.test.ts                 # NEW
│   │   └── phases/
│   │       ├── build.test.ts               # NEW
│   │       ├── snapshot.test.ts            # NEW
│   │       ├── verify.test.ts              # NEW
│   │       └── feedback.test.ts            # NEW
│   ├── delivery/
│   │   ├── github.test.ts                  # NEW
│   │   ├── local.test.ts                   # NEW
│   │   └── registry.test.ts                # NEW
│   └── observability/
│       ├── progress-emitter.test.ts        # NEW
│       └── metrics.test.ts                 # NEW
├── integration/
│   ├── execution-engine.test.ts            # NEW
│   ├── phase-orchestrator.test.ts          # NEW
│   ├── delivery-github.test.ts             # NEW
│   └── bug-65-scenario.test.ts             # NEW: Regression test
└── e2e/
    └── work-order-lifecycle.test.ts        # Existing, enhanced
```

---

## State Machine Tests

### Complete Transition Coverage

Every (state, event) pair must be tested:

```typescript
// packages/server/test/unit/orchestrator/state-machine-complete.test.ts

describe('State Machine Complete Coverage', () => {
  // Helper to create run in specific state
  function createRunInState(targetState: RunState): Run {
    let run = createRun('run-1', 'wo-1', 'ws-1', 3);

    const pathToState: Record<RunState, RunEvent[]> = {
      [RunState.QUEUED]: [],
      [RunState.LEASED]: [RunEvent.WORKSPACE_ACQUIRED],
      [RunState.BUILDING]: [RunEvent.WORKSPACE_ACQUIRED, RunEvent.BUILD_STARTED],
      [RunState.SNAPSHOTTING]: [
        RunEvent.WORKSPACE_ACQUIRED,
        RunEvent.BUILD_STARTED,
        RunEvent.BUILD_COMPLETED,
      ],
      [RunState.VERIFYING]: [
        RunEvent.WORKSPACE_ACQUIRED,
        RunEvent.BUILD_STARTED,
        RunEvent.BUILD_COMPLETED,
        RunEvent.SNAPSHOT_COMPLETED,
      ],
      [RunState.FEEDBACK]: [
        RunEvent.WORKSPACE_ACQUIRED,
        RunEvent.BUILD_STARTED,
        RunEvent.BUILD_COMPLETED,
        RunEvent.SNAPSHOT_COMPLETED,
        RunEvent.VERIFY_FAILED_RETRYABLE,
      ],
      [RunState.PR_CREATED]: [
        RunEvent.WORKSPACE_ACQUIRED,
        RunEvent.BUILD_STARTED,
        RunEvent.BUILD_COMPLETED,
        RunEvent.SNAPSHOT_COMPLETED,
        RunEvent.PR_CREATED,
      ],
      [RunState.CI_POLLING]: [
        RunEvent.WORKSPACE_ACQUIRED,
        RunEvent.BUILD_STARTED,
        RunEvent.BUILD_COMPLETED,
        RunEvent.SNAPSHOT_COMPLETED,
        RunEvent.PR_CREATED,
        RunEvent.CI_POLLING_STARTED,
      ],
      [RunState.SUCCEEDED]: [
        RunEvent.WORKSPACE_ACQUIRED,
        RunEvent.BUILD_STARTED,
        RunEvent.BUILD_COMPLETED,
        RunEvent.SNAPSHOT_COMPLETED,
        RunEvent.VERIFY_PASSED,
      ],
      [RunState.FAILED]: [RunEvent.SYSTEM_ERROR],
      [RunState.CANCELED]: [RunEvent.USER_CANCELED],
    };

    for (const event of pathToState[targetState]) {
      run = applyTransition(run, event);
    }

    return run;
  }

  describe('QUEUED state', () => {
    const validEvents = [
      RunEvent.WORKSPACE_ACQUIRED,
      RunEvent.USER_CANCELED,
      RunEvent.SYSTEM_ERROR,
    ];

    const invalidEvents = Object.values(RunEvent).filter(
      e => !validEvents.includes(e)
    );

    it.each(validEvents)('allows %s transition', (event) => {
      const run = createRunInState(RunState.QUEUED);
      expect(() => applyTransition(run, event)).not.toThrow();
    });

    it.each(invalidEvents)('rejects %s transition', (event) => {
      const run = createRunInState(RunState.QUEUED);
      expect(() => applyTransition(run, event)).toThrow(/Invalid transition/);
    });
  });

  describe('FEEDBACK state (Bug #65 related)', () => {
    it('allows FEEDBACK_GENERATED transition', () => {
      const run = createRunInState(RunState.FEEDBACK);
      const newRun = applyTransition(run, RunEvent.FEEDBACK_GENERATED);
      expect(newRun.state).toBe(RunState.BUILDING);
    });

    it('allows VERIFY_FAILED_TERMINAL transition (Bug #65 fix)', () => {
      const run = createRunInState(RunState.FEEDBACK);
      const newRun = applyTransition(run, RunEvent.VERIFY_FAILED_TERMINAL);
      expect(newRun.state).toBe(RunState.FAILED);
    });

    it('allows USER_CANCELED transition', () => {
      const run = createRunInState(RunState.FEEDBACK);
      const newRun = applyTransition(run, RunEvent.USER_CANCELED);
      expect(newRun.state).toBe(RunState.CANCELED);
    });

    it('allows SYSTEM_ERROR transition', () => {
      const run = createRunInState(RunState.FEEDBACK);
      const newRun = applyTransition(run, RunEvent.SYSTEM_ERROR);
      expect(newRun.state).toBe(RunState.FAILED);
    });
  });

  describe('PR_CREATED state (v0.2.22 fix)', () => {
    it('allows VERIFY_PASSED when CI not configured', () => {
      const run = createRunInState(RunState.PR_CREATED);
      const newRun = applyTransition(run, RunEvent.VERIFY_PASSED);
      expect(newRun.state).toBe(RunState.SUCCEEDED);
      expect(newRun.result).toBe(RunResult.PASSED);
    });

    it('allows CI_POLLING_STARTED when CI configured', () => {
      const run = createRunInState(RunState.PR_CREATED);
      const newRun = applyTransition(run, RunEvent.CI_POLLING_STARTED);
      expect(newRun.state).toBe(RunState.CI_POLLING);
    });
  });

  // Test all states systematically...
});
```

### State Machine Validator Tests

```typescript
// packages/server/test/unit/orchestrator/state-machine-validator.test.ts

describe('StateMachineValidator', () => {
  let validator: StateMachineValidator;

  beforeEach(() => {
    validator = new StateMachineValidator(transitions);
  });

  describe('validateStateCompleteness', () => {
    it('reports no issues for valid state machine', () => {
      const result = validator.validateStateCompleteness();
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('detects missing entry transitions', () => {
      const brokenTransitions = {
        ...transitions,
        [RunState.BUILDING]: {}, // No way to enter BUILDING
      };
      const brokenValidator = new StateMachineValidator(brokenTransitions);

      const result = brokenValidator.validateStateCompleteness();
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          type: 'missing_entry',
          state: RunState.BUILDING,
        })
      );
    });
  });

  describe('findUnreachableStates', () => {
    it('finds no unreachable states in valid machine', () => {
      const unreachable = validator.findUnreachableStates();
      expect(unreachable).toEqual([]);
    });
  });

  describe('enumeratePaths', () => {
    it('includes happy path', () => {
      const paths = validator.enumeratePaths();
      const happyPath = paths.find(p =>
        p.endState === RunState.SUCCEEDED &&
        p.steps.includes(RunEvent.VERIFY_PASSED)
      );
      expect(happyPath).toBeDefined();
    });

    it('includes PR + no CI path', () => {
      const paths = validator.enumeratePaths();
      const prNoCIPath = paths.find(p =>
        p.endState === RunState.SUCCEEDED &&
        p.steps.includes(RunEvent.PR_CREATED) &&
        !p.steps.includes(RunEvent.CI_POLLING_STARTED)
      );
      expect(prNoCIPath).toBeDefined();
    });
  });
});
```

---

## Phase Handler Tests

### Build Phase Handler

```typescript
// packages/server/test/unit/execution/phases/build.test.ts

describe('BuildPhaseHandler', () => {
  let handler: BuildPhaseHandler;
  let mockServices: MockPhaseServices;

  beforeEach(() => {
    mockServices = createMockPhaseServices();
    handler = new BuildPhaseHandler();
  });

  describe('execute', () => {
    it('returns success when agent succeeds', async () => {
      mockServices.agentDriver.execute.mockResolvedValue({
        success: true,
        sessionId: 'session-123',
        model: 'claude-3',
        tokensUsed: { input: 100, output: 200 },
      });

      const context = createPhaseContext({ services: mockServices });
      const result = await handler.execute(context, {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('session-123');
      expect(mockServices.resultPersister.saveAgentResult).toHaveBeenCalled();
    });

    it('returns failure with error classification when agent fails', async () => {
      mockServices.agentDriver.execute.mockResolvedValue({
        success: false,
        sessionId: 'session-123',
        exitCode: 1,
        stderr: 'Command failed',
      });

      const context = createPhaseContext({ services: mockServices });
      const result = await handler.execute(context, {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      });

      expect(result.success).toBe(false);
      expect(result.buildError).toBeDefined();
      expect(result.buildError?.type).toBe(BuildErrorType.AGENT_CRASH);
    });

    it('handles exception with SYSTEM_ERROR classification', async () => {
      mockServices.agentDriver.execute.mockRejectedValue(
        new Error('Network timeout')
      );

      const context = createPhaseContext({ services: mockServices });
      const result = await handler.execute(context, {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      });

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('exception');
    });

    it('continues even if persistence fails', async () => {
      mockServices.agentDriver.execute.mockResolvedValue({
        success: true,
        sessionId: 'session-123',
      });
      mockServices.resultPersister.saveAgentResult.mockRejectedValue(
        new Error('Disk full')
      );

      const context = createPhaseContext({ services: mockServices });
      const result = await handler.execute(context, {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      });

      // Phase succeeds even if persistence fails
      expect(result.success).toBe(true);
      expect(mockServices.logger.error).toHaveBeenCalled();
    });
  });
});
```

---

## Bug #65 Regression Tests

### Dedicated Scenario Test

```typescript
// packages/server/test/integration/bug-65-scenario.test.ts

describe('Bug #65 Regression', () => {
  describe('Scenario: CI fails after PR creation with retry disabled', () => {
    it('should fail with FAILED_VERIFICATION, not FAILED_ERROR', async () => {
      // Setup: Create engine with mocked components
      const engine = createTestExecutionEngine({
        // Mock agent to succeed
        agentDriver: {
          execute: vi.fn().mockResolvedValue({ success: true, sessionId: 's1' }),
        },
        // Mock verification to pass
        verifier: {
          verify: vi.fn().mockResolvedValue({ passed: true }),
        },
        // Mock PR creation to succeed
        deliveryManager: {
          deliver: vi.fn().mockResolvedValue({
            success: false, // CI fails
            prResult: { prUrl: 'http://pr', prNumber: 1 },
            ciResult: { status: 'failed', feedback: 'Tests failed' },
          }),
        },
      });

      // Create work order with CI enabled but retry disabled
      const workOrder = createTestWorkOrder({
        waitForCI: true,
      });

      const taskSpec = createTestTaskSpec({
        convergence: {
          strategy: 'fixed',
          limits: { maxIterations: 1 },
          config: {
            ciRetryEnabled: false, // This is the key: retry disabled
          },
        },
      });

      // Execute
      const result = await engine.execute({ workOrder, taskSpec });

      // Assert: Should be FAILED_VERIFICATION, NOT FAILED_ERROR
      expect(result.run.state).toBe(RunState.FAILED);
      expect(result.run.result).toBe(RunResult.FAILED_VERIFICATION);
      expect(result.run.result).not.toBe(RunResult.FAILED_ERROR);
      expect(result.run.error).toContain('CI');
    });
  });

  describe('Scenario: PR created, no CI configured', () => {
    it('should succeed via VERIFY_PASSED from PR_CREATED state', async () => {
      const stateMachine = new DefaultStateMachine();

      // Get to PR_CREATED state
      let run = createRun('run-1', 'wo-1', 'ws-1', 3);
      run = stateMachine.transition(run, RunEvent.WORKSPACE_ACQUIRED);
      run = stateMachine.transition(run, RunEvent.BUILD_STARTED);
      run = stateMachine.transition(run, RunEvent.BUILD_COMPLETED);
      run = stateMachine.transition(run, RunEvent.SNAPSHOT_COMPLETED);
      run = stateMachine.transition(run, RunEvent.PR_CREATED);

      expect(run.state).toBe(RunState.PR_CREATED);

      // Now try to succeed without CI (v0.2.22 fix)
      run = stateMachine.transition(run, RunEvent.VERIFY_PASSED);

      expect(run.state).toBe(RunState.SUCCEEDED);
      expect(run.result).toBe(RunResult.PASSED);
    });
  });

  describe('Scenario: Snapshot fails', () => {
    it('should fail with SNAPSHOT_FAILED, not SYSTEM_ERROR', async () => {
      const engine = createTestExecutionEngine({
        agentDriver: {
          execute: vi.fn().mockResolvedValue({ success: true }),
        },
        snapshotter: {
          capture: vi.fn().mockRejectedValue(new Error('Git error')),
        },
      });

      const result = await engine.execute({
        workOrder: createTestWorkOrder(),
        taskSpec: createTestTaskSpec(),
      });

      expect(result.run.state).toBe(RunState.FAILED);
      // With the fix, should be SNAPSHOT_FAILED event, not SYSTEM_ERROR
      expect(result.run.error).toContain('snapshot');
    });
  });
});
```

---

## Integration Tests

### ExecutionEngine Integration

```typescript
// packages/server/test/integration/execution-engine.test.ts

describe('ExecutionEngine Integration', () => {
  let engine: ExecutionEngine;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentgate-test-'));
    engine = createIntegrationTestEngine({ workspaceDir: tempDir });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it('executes full happy path', async () => {
    const workOrder = createTestWorkOrder({
      taskPrompt: 'Create a hello.txt file with "Hello World"',
    });

    const taskSpec = createTestTaskSpec({
      convergence: {
        strategy: 'fixed',
        limits: { maxIterations: 1 },
        gates: [
          {
            name: 'file-exists',
            check: { type: 'custom', command: 'test -f hello.txt' },
          },
        ],
      },
    });

    const result = await engine.execute({ workOrder, taskSpec });

    expect(result.run.state).toBe(RunState.SUCCEEDED);
    expect(result.iterations.length).toBe(1);
    expect(await fs.pathExists(path.join(tempDir, 'hello.txt'))).toBe(true);
  });

  it('respects max iterations', async () => {
    const workOrder = createTestWorkOrder({
      taskPrompt: 'Impossible task',
    });

    const taskSpec = createTestTaskSpec({
      convergence: {
        strategy: 'fixed',
        limits: { maxIterations: 3 },
        gates: [
          {
            name: 'always-fail',
            check: { type: 'custom', command: 'false' },
            onFailure: { action: 'iterate' },
          },
        ],
      },
    });

    const result = await engine.execute({ workOrder, taskSpec });

    expect(result.run.state).toBe(RunState.FAILED);
    expect(result.iterations.length).toBe(3);
  });

  it('handles cancellation', async () => {
    const workOrder = createTestWorkOrder();
    const taskSpec = createTestTaskSpec({
      convergence: {
        limits: { maxIterations: 10 },
      },
    });

    // Start execution
    const promise = engine.execute({ workOrder, taskSpec });

    // Cancel after short delay
    await new Promise(r => setTimeout(r, 100));
    await engine.cancel(workOrder.id, 'Test cancellation');

    const result = await promise;
    expect(result.run.state).toBe(RunState.CANCELED);
  });
});
```

---

## Test Commands

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm --filter @agentgate/server test:unit

# Run specific test file
pnpm --filter @agentgate/server test -- state-machine-complete.test.ts

# Run tests matching pattern
pnpm --filter @agentgate/server test -- --grep "Bug 65"

# Run integration tests
pnpm --filter @agentgate/server test:integration

# Run with coverage
pnpm --filter @agentgate/server test:coverage

# Watch mode
pnpm --filter @agentgate/server test:watch
```

---

## Coverage Requirements

| Component | Minimum Coverage |
|-----------|------------------|
| state-machine.ts | 100% |
| execution/engine.ts | 90% |
| execution/phases/*.ts | 85% |
| delivery/*.ts | 80% |
| observability/*.ts | 80% |

---

## CI Integration

```yaml
# .github/workflows/test.yml additions

jobs:
  state-machine-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm build
      - run: pnpm --filter @agentgate/server test -- state-machine
      - name: Verify 100% coverage on state-machine
        run: |
          pnpm --filter @agentgate/server test:coverage -- state-machine
          # Check coverage threshold
          cat packages/server/coverage/coverage-summary.json | \
            jq '.total.statements.pct >= 100'

  bug-regression-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm build
      - run: pnpm --filter @agentgate/server test -- bug-65
```
