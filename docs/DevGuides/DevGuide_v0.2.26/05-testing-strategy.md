# 05: Testing Strategy

## Overview

This document outlines the testing strategy for v0.2.26 to ensure the ExecutionEngine integration doesn't break existing functionality.

---

## Test Categories

### 1. Unit Tests

Test individual components in isolation.

| Component | Test File | Focus Areas |
|-----------|-----------|-------------|
| ExecutionEngine | `test/execution/engine.test.ts` | State transitions, iteration loop, timeout handling |
| PhaseOrchestrator | `test/execution/phases/orchestrator.test.ts` | Phase sequencing, error handling |
| BuildPhaseHandler | `test/execution/phases/build-handler.test.ts` | Agent request construction, result handling |
| VerifyPhaseHandler | `test/execution/phases/verify-handler.test.ts` | Gate execution, pass/fail logic |
| ServiceAdapters | `test/execution/service-adapters.test.ts` | Correct delegation to real implementations |
| EngineBridge | `test/orchestrator/engine-bridge.test.ts` | Service creation, TaskSpec resolution |

### 2. Integration Tests

Test components working together.

| Scenario | Test File | Focus Areas |
|----------|-----------|-------------|
| Full execution flow | `test/integration/execution-flow.test.ts` | WorkOrder → Run completion |
| GitHub integration | `test/integration/github-flow.test.ts` | PR creation, CI polling |
| Error handling | `test/integration/error-handling.test.ts` | Failures propagate correctly |
| Cancellation | `test/integration/cancellation.test.ts` | Runs can be canceled mid-execution |

### 3. E2E Tests

Test against real external services.

| Scenario | Test File | Requirements |
|----------|-----------|--------------|
| GitHub E2E | `test/e2e/github-e2e.test.ts` | Real GitHub token |
| Full run | `test/e2e/full-run.test.ts` | Claude API access |

---

## Test Plan

### Phase 1: Unit Tests for New Code

Before integration, ensure new code works in isolation.

```typescript
// test/orchestrator/engine-bridge.test.ts
describe('EngineBridge', () => {
  describe('createServicesFromCallbacks', () => {
    it('should create AgentDriver from ClaudeCodeDriver', () => {
      const mockDriver = createMockClaudeCodeDriver();
      const services = createServicesFromCallbacks({
        driver: mockDriver,
        workspace: mockWorkspace,
        gatePlan: mockGatePlan,
        workOrder: mockWorkOrder,
        spawnLimits: null,
      });

      expect(services.agentDriver).toBeDefined();
      expect(services.agentDriver.execute).toBeInstanceOf(Function);
    });

    it('should create Snapshotter that calls captureAfterState', async () => {
      const services = createServicesFromCallbacks({ ... });
      const snapshot = await services.snapshotter.capture(
        '/workspace',
        mockBeforeState,
        { runId: 'run-1', iteration: 1, taskPrompt: 'test' }
      );

      expect(snapshot.id).toBeDefined();
      expect(snapshot.runId).toBe('run-1');
    });

    it('should create Verifier that calls verify function', async () => {
      const services = createServicesFromCallbacks({ ... });
      const report = await services.verifier.verify(
        mockSnapshot,
        mockGatePlan,
        { runId: 'run-1', iteration: 1 }
      );

      expect(report.passed).toBeDefined();
    });

    it('should create FeedbackGenerator that formats output', async () => {
      const services = createServicesFromCallbacks({ ... });
      const feedback = await services.feedbackGenerator.generate(
        mockSnapshot,
        mockFailedReport,
        mockGatePlan,
        { runId: 'run-1', iteration: 1 }
      );

      expect(feedback).toContain('failed');
    });
  });
});
```

### Phase 2: Integration Tests

Test the complete flow from Orchestrator to ExecutionEngine.

```typescript
// test/integration/execution-flow.test.ts
describe('Execution Flow Integration', () => {
  it('should execute work order through new engine', async () => {
    const orchestrator = createOrchestrator();
    const workOrder = createTestWorkOrder({
      taskPrompt: 'Add a hello world function',
      maxIterations: 2,
    });

    const run = await orchestrator.execute(workOrder);

    expect(run.state).toBe(RunState.SUCCEEDED);
    expect(run.iteration).toBeGreaterThanOrEqual(1);
  });

  it('should handle verification failure with retry', async () => {
    const orchestrator = createOrchestrator();
    const workOrder = createTestWorkOrder({
      taskPrompt: 'Fix the failing test',
      maxIterations: 3,
    });

    // Mock verifier to fail first, pass second
    mockVerifier.mockReturnValueOnce({ passed: false });
    mockVerifier.mockReturnValueOnce({ passed: true });

    const run = await orchestrator.execute(workOrder);

    expect(run.state).toBe(RunState.SUCCEEDED);
    expect(run.iteration).toBe(2); // Took two tries
  });

  it('should fail after max iterations exhausted', async () => {
    const orchestrator = createOrchestrator();
    const workOrder = createTestWorkOrder({
      taskPrompt: 'Impossible task',
      maxIterations: 2,
    });

    // Mock verifier to always fail
    mockVerifier.mockReturnValue({ passed: false });

    const run = await orchestrator.execute(workOrder);

    expect(run.state).toBe(RunState.FAILED);
    expect(run.result).toBe(RunResult.FAILED_VERIFICATION);
    expect(run.iteration).toBe(2);
  });

  it('should emit progress events', async () => {
    const events: ProgressEvent[] = [];
    const unsubscribe = getProgressEmitter().subscribe((e) => events.push(e));

    const orchestrator = createOrchestrator();
    await orchestrator.execute(workOrder);

    unsubscribe();

    expect(events).toContainEqual(expect.objectContaining({ type: 'run_started' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'iteration_started' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'run_completed' }));
  });

  it('should collect metrics', async () => {
    const collector = getMetricsCollector();
    const startRuns = collector.getRunsStarted();

    const orchestrator = createOrchestrator();
    await orchestrator.execute(workOrder);

    expect(collector.getRunsStarted()).toBe(startRuns + 1);
    expect(collector.getRunsCompleted('succeeded')).toBeGreaterThan(0);
  });
});
```

### Phase 3: Regression Tests

Ensure existing tests still pass with new engine.

```bash
# Run all existing tests
pnpm test

# Expected: 1767+ tests pass, 25 skipped (GitHub E2E)
```

### Phase 4: GitHub E2E Tests

If GitHub token is available, run E2E tests.

```typescript
// test/e2e/github-e2e.test.ts
describe.skipIf(!hasGitHubToken)('GitHub E2E', () => {
  it('should create PR and poll CI', async () => {
    const orchestrator = createOrchestrator();
    const workOrder = createGitHubWorkOrder({
      owner: 'test-org',
      repo: 'test-repo',
      taskPrompt: 'Fix the README typo',
      waitForCI: true,
    });

    const run = await orchestrator.execute(workOrder);

    expect(run.state).toBe(RunState.SUCCEEDED);
    expect(run.gitHubPrUrl).toBeDefined();
  });
});
```

---

## Test Coverage Goals

| Area | Current | Target |
|------|---------|--------|
| ExecutionEngine | 0% | 80%+ |
| PhaseHandlers | 0% | 80%+ |
| ServiceAdapters | 0% | 70%+ |
| EngineBridge | 0% | 80%+ |
| Integration | 60% | 80%+ |
| Overall | 75% | 80%+ |

---

## Mocking Strategy

### Mock ClaudeCodeDriver

```typescript
function createMockClaudeCodeDriver(): ClaudeCodeDriver {
  return {
    execute: vi.fn().mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: 'Task completed',
      stderr: '',
      sessionId: 'session-123',
      durationMs: 1000,
      tokensUsed: 500,
    }),
    isAvailable: vi.fn().mockReturnValue(true),
  };
}
```

### Mock Verifier

```typescript
function createMockVerifier(passed = true): typeof verify {
  return vi.fn().mockResolvedValue({
    id: randomUUID(),
    passed,
    l0Result: { level: 'L0', passed, checks: [], duration: 10 },
    l1Result: { level: 'L1', passed, checks: [], duration: 100 },
    l2Result: { level: 'L2', passed: true, checks: [], duration: 0 },
    l3Result: { level: 'L3', passed: true, checks: [], duration: 0 },
    totalDuration: 110,
    createdAt: new Date(),
  });
}
```

### Mock Snapshotter

```typescript
function createMockSnapshotter(): Snapshotter {
  return {
    capture: vi.fn().mockResolvedValue({
      id: randomUUID(),
      runId: 'run-1',
      iteration: 1,
      beforeSha: 'abc123',
      afterSha: 'def456',
      branch: 'main',
      commitMessage: 'Test commit',
      filesChanged: 3,
      insertions: 10,
      deletions: 2,
      createdAt: new Date(),
    }),
  };
}
```

---

## Continuous Integration

Add new test jobs to CI workflow:

```yaml
# .github/workflows/test.yml
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    env:
      AGENTGATE_GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test:e2e
```

---

## Test Execution Commands

```bash
# Run all tests
pnpm test

# Run only unit tests
pnpm test:unit

# Run only integration tests
pnpm test:integration

# Run E2E tests (requires GitHub token)
AGENTGATE_GITHUB_TOKEN=xxx pnpm test:e2e

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch
```
