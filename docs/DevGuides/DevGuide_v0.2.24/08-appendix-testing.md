# Appendix B: Testing and Validation Strategy

## Overview

This appendix defines the comprehensive testing strategy for the v0.2.24 architectural changes. Testing is organized in layers from unit tests through integration tests to end-to-end acceptance tests.

---

## Test Pyramid

```
                    ┌───────────────┐
                    │  Acceptance   │  ← 5-10 scenarios
                    │    Tests      │  ← Full TaskSpec → Delivery
                    ├───────────────┤
                    │  Integration  │  ← 20-30 tests
                    │    Tests      │  ← Component interactions
                    ├───────────────┤
                    │               │
                    │    Unit       │  ← 100+ tests
                    │    Tests      │  ← Individual functions
                    │               │
                    └───────────────┘
```

---

## Unit Tests

### Location
```
packages/server/test/unit/
├── task-spec/
│   ├── loader.test.ts
│   ├── resolver.test.ts
│   └── converter.test.ts
├── convergence/
│   ├── controller.test.ts
│   ├── strategies/
│   │   ├── fixed.test.ts
│   │   ├── hybrid.test.ts
│   │   └── ralph.test.ts
│   └── progress.test.ts
├── gate/
│   ├── runners/
│   │   ├── verification.test.ts
│   │   ├── github-actions.test.ts
│   │   └── custom.test.ts
│   ├── pipeline.test.ts
│   └── registry.test.ts
├── execution/
│   ├── workspace-manager.test.ts
│   ├── sandbox-manager.test.ts
│   └── coordinator.test.ts
└── delivery/
    ├── git-manager.test.ts
    ├── pr-manager.test.ts
    └── coordinator.test.ts
```

### Thrust 1: TaskSpec Unit Tests

```typescript
// packages/server/test/unit/task-spec/loader.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskSpecLoader } from '../../../src/task-spec/loader';

describe('TaskSpecLoader', () => {
  let loader: TaskSpecLoader;

  beforeEach(() => {
    loader = new TaskSpecLoader();
  });

  describe('loadFromFile', () => {
    it('loads valid YAML TaskSpec', async () => {
      const spec = await loader.loadFromFile('./fixtures/valid-taskspec.yaml');

      expect(spec.apiVersion).toBe('agentgate.io/v1');
      expect(spec.kind).toBe('TaskSpec');
      expect(spec.metadata.name).toBeDefined();
    });

    it('loads valid JSON TaskSpec', async () => {
      const spec = await loader.loadFromFile('./fixtures/valid-taskspec.json');

      expect(spec.apiVersion).toBe('agentgate.io/v1');
    });

    it('throws on invalid schema', async () => {
      await expect(
        loader.loadFromFile('./fixtures/invalid-taskspec.yaml')
      ).rejects.toThrow('ValidationError');
    });

    it('throws on missing file', async () => {
      await expect(
        loader.loadFromFile('./fixtures/nonexistent.yaml')
      ).rejects.toThrow('FileNotFoundError');
    });
  });

  describe('loadFromObject', () => {
    it('validates and returns TaskSpec', () => {
      const spec = loader.loadFromObject({
        apiVersion: 'agentgate.io/v1',
        kind: 'TaskSpec',
        metadata: { name: 'test' },
        spec: {
          goal: { prompt: 'Test prompt' },
          convergence: {
            strategy: 'fixed',
            gates: [],
            limits: {},
          },
          execution: {
            workspace: { source: 'local', path: '/tmp' },
            agent: { driver: 'claude-code-subscription' },
          },
          delivery: { git: { mode: 'local' } },
        },
      });

      expect(spec.metadata.name).toBe('test');
    });
  });
});
```

```typescript
// packages/server/test/unit/task-spec/converter.test.ts

describe('HarnessConfig to TaskSpec converter', () => {
  describe('convertLoopStrategy', () => {
    it('converts fixed strategy', () => {
      const harness = createHarnessConfig({
        loopStrategy: { mode: 'fixed', maxIterations: 5 },
      });

      const taskSpec = harnessConfigToTaskSpec(harness, {});

      expect(taskSpec.spec.convergence.strategy).toBe('fixed');
      expect(taskSpec.spec.convergence.config?.iterations).toBe(5);
    });

    it('converts hybrid strategy with all options', () => {
      const harness = createHarnessConfig({
        loopStrategy: {
          mode: 'hybrid',
          baseIterations: 3,
          maxBonusIterations: 2,
          progressThreshold: 0.15,
        },
      });

      const taskSpec = harnessConfigToTaskSpec(harness, {});

      expect(taskSpec.spec.convergence.strategy).toBe('hybrid');
      expect(taskSpec.spec.convergence.config?.baseIterations).toBe(3);
      expect(taskSpec.spec.convergence.config?.bonusIterations).toBe(2);
      expect(taskSpec.spec.convergence.config?.progressThreshold).toBe(0.15);
    });

    it('converts ralph strategy', () => {
      const harness = createHarnessConfig({
        loopStrategy: {
          mode: 'ralph',
          convergenceThreshold: 0.05,
          windowSize: 3,
        },
      });

      const taskSpec = harnessConfigToTaskSpec(harness, {});

      expect(taskSpec.spec.convergence.strategy).toBe('ralph');
      expect(taskSpec.spec.convergence.config?.convergenceThreshold).toBe(0.05);
    });
  });

  describe('convertGates', () => {
    it('creates verification gate with all levels', () => {
      const harness = createHarnessConfig({
        verification: { skipLevels: [] },
      });

      const taskSpec = harnessConfigToTaskSpec(harness, {});
      const gate = taskSpec.spec.convergence.gates[0];

      expect(gate.check.type).toBe('verification-levels');
      expect((gate.check as any).levels).toEqual(['L0', 'L1', 'L2', 'L3']);
    });

    it('creates verification gate with skipped levels', () => {
      const harness = createHarnessConfig({
        verification: { skipLevels: ['L0', 'L3'] },
      });

      const taskSpec = harnessConfigToTaskSpec(harness, {});
      const gate = taskSpec.spec.convergence.gates[0];

      expect((gate.check as any).levels).toEqual(['L1', 'L2']);
    });
  });
});
```

### Thrust 2: Convergence Strategy Unit Tests

```typescript
// packages/server/test/unit/convergence/strategies/fixed.test.ts

describe('FixedStrategy', () => {
  let strategy: FixedStrategy;

  beforeEach(async () => {
    strategy = new FixedStrategy();
    await strategy.initialize({ iterations: 3 });
  });

  describe('shouldContinue', () => {
    it('continues until iteration limit', async () => {
      const state = createConvergenceState({ iteration: 1 });

      const decision = await strategy.shouldContinue(state);

      expect(decision.continue).toBe(true);
      expect(decision.reason).toContain('1/3');
    });

    it('stops at iteration limit', async () => {
      const state = createConvergenceState({ iteration: 3 });

      const decision = await strategy.shouldContinue(state);

      expect(decision.continue).toBe(false);
      expect(decision.reason).toContain('3 iterations');
    });

    it('stops early if all gates pass', async () => {
      const state = createConvergenceState({
        iteration: 1,
        gateResults: [{ passed: true }],
      });

      const decision = await strategy.shouldContinue(state);

      expect(decision.continue).toBe(false);
      expect(decision.reason).toContain('gates passed');
    });
  });
});
```

```typescript
// packages/server/test/unit/convergence/strategies/ralph.test.ts

describe('RalphStrategy', () => {
  let strategy: RalphStrategy;

  beforeEach(async () => {
    strategy = new RalphStrategy();
    await strategy.initialize({
      convergenceThreshold: 0.05,
      windowSize: 3,
      minIterations: 1,
      maxIterations: 10,
    });
  });

  describe('completion signal detection', () => {
    it('detects TASK_COMPLETE signal', async () => {
      const state = createConvergenceState({
        iteration: 2,
        agentOutput: 'Done fixing. TASK_COMPLETE',
      });

      const decision = await strategy.shouldContinue(state);

      expect(decision.continue).toBe(false);
      expect(decision.reason).toContain('TASK_COMPLETE');
    });

    it('detects [DONE] signal', async () => {
      const state = createConvergenceState({
        agentOutput: 'All fixed [DONE]',
      });

      const decision = await strategy.shouldContinue(state);

      expect(decision.continue).toBe(false);
    });
  });

  describe('similarity loop detection', () => {
    it('detects similar consecutive outputs', async () => {
      // Simulate 3 similar outputs
      strategy.reset();

      for (let i = 0; i < 3; i++) {
        await strategy.shouldContinue(createConvergenceState({
          iteration: i + 1,
          agentOutput: 'The same output every time',
        }));
      }

      const decision = await strategy.shouldContinue(createConvergenceState({
        iteration: 4,
        agentOutput: 'The same output every time',
      }));

      expect(decision.continue).toBe(false);
      expect(decision.reason).toContain('loop');
    });

    it('continues if outputs vary', async () => {
      strategy.reset();

      const outputs = [
        'First attempt at fixing the code',
        'Second attempt with different approach',
        'Third attempt targeting specific file',
      ];

      let decision;
      for (const output of outputs) {
        decision = await strategy.shouldContinue(createConvergenceState({
          agentOutput: output,
        }));
      }

      expect(decision?.continue).toBe(true);
    });
  });
});
```

### Thrust 3: Gate Runner Unit Tests

```typescript
// packages/server/test/unit/gate/runners/verification.test.ts

describe('VerificationLevelsGateRunner', () => {
  let runner: VerificationLevelsGateRunner;
  let mockVerifier: MockVerifier;

  beforeEach(() => {
    mockVerifier = createMockVerifier();
    runner = new VerificationLevelsGateRunner(mockVerifier);
  });

  describe('run', () => {
    it('runs all specified levels', async () => {
      mockVerifier.verify.mockResolvedValue(createPassingReport());

      const context = createGateContext({
        gate: {
          check: { type: 'verification-levels', levels: ['L0', 'L1'] },
        },
      });

      const result = await runner.run(context);

      expect(result.passed).toBe(true);
      expect(mockVerifier.verify).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ skipLevels: ['L2', 'L3'] }),
        expect.anything()
      );
    });

    it('extracts failures correctly', async () => {
      mockVerifier.verify.mockResolvedValue(createFailingReport({
        l1Result: {
          passed: false,
          checks: [
            { name: 'test', passed: false, message: 'Test failed' },
          ],
        },
      }));

      const result = await runner.run(createGateContext());

      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures?.[0].message).toBe('Test failed');
    });
  });

  describe('generateFeedback', () => {
    it('formats feedback for agent', async () => {
      const result = createFailingGateResult();

      const feedback = await runner.generateFeedback(result);

      expect(feedback.formatted).toContain('Verification Failed');
      expect(feedback.suggestions.length).toBeGreaterThan(0);
    });
  });
});
```

```typescript
// packages/server/test/unit/gate/pipeline.test.ts

describe('GatePipeline', () => {
  let pipeline: DefaultGatePipeline;
  let mockRegistry: MockGateRunnerRegistry;

  beforeEach(() => {
    mockRegistry = createMockRegistry();
  });

  describe('execute', () => {
    it('executes gates in order', async () => {
      const gates = [
        createGate({ name: 'gate1' }),
        createGate({ name: 'gate2' }),
      ];
      pipeline = new DefaultGatePipeline(mockRegistry, gates);

      const result = await pipeline.execute(createGateContext());

      expect(result.results).toHaveLength(2);
      expect(result.results[0].gate).toBe('gate1');
      expect(result.results[1].gate).toBe('gate2');
    });

    it('stops on gate with action: stop', async () => {
      const gates = [
        createGate({ name: 'gate1', onFailure: { action: 'stop' } }),
        createGate({ name: 'gate2' }),
      ];
      mockRegistry.get.mockReturnValue({
        run: vi.fn().mockResolvedValue({ passed: false }),
      });
      pipeline = new DefaultGatePipeline(mockRegistry, gates);

      const result = await pipeline.execute(createGateContext());

      expect(result.passed).toBe(false);
      expect(result.stoppedAt).toBe('gate1');
      expect(result.results).toHaveLength(1);
    });

    it('continues on gate with action: iterate', async () => {
      const gates = [
        createGate({ name: 'gate1', onFailure: { action: 'iterate' } }),
        createGate({ name: 'gate2' }),
      ];
      let callCount = 0;
      mockRegistry.get.mockReturnValue({
        run: vi.fn().mockImplementation(() => ({
          passed: callCount++ === 0 ? false : true,
        })),
      });
      pipeline = new DefaultGatePipeline(mockRegistry, gates);

      const result = await pipeline.execute(createGateContext());

      expect(result.results).toHaveLength(2);
    });

    it('collects feedback from failed gates', async () => {
      const gates = [
        createGate({ name: 'gate1', onFailure: { action: 'iterate', feedback: 'auto' } }),
      ];
      mockRegistry.get.mockReturnValue({
        run: vi.fn().mockResolvedValue({ passed: false }),
        generateFeedback: vi.fn().mockResolvedValue({ formatted: 'Feedback' }),
      });
      pipeline = new DefaultGatePipeline(mockRegistry, gates);

      const result = await pipeline.execute(createGateContext());

      expect(result.feedback).toHaveLength(1);
    });
  });
});
```

---

## Integration Tests

### Location
```
packages/server/test/integration/
├── task-spec-flow.test.ts
├── convergence-gates.test.ts
├── execution-sandbox.test.ts
└── delivery-git.test.ts
```

### TaskSpec Flow Integration

```typescript
// packages/server/test/integration/task-spec-flow.test.ts

describe('TaskSpec Flow Integration', () => {
  it('loads TaskSpec and runs through convergence', async () => {
    // Setup
    const taskSpec = await loader.loadFromFile('./fixtures/integration-taskspec.yaml');
    const controller = new ConvergenceController(taskSpec);

    // Execute
    const result = await controller.run({
      onBuild: mockBuild,
      onSnapshot: mockSnapshot,
      onGateCheck: mockGateCheck,
      onFeedback: mockFeedback,
    });

    // Verify
    expect(result.status).toBe('converged');
    expect(mockBuild).toHaveBeenCalled();
    expect(mockGateCheck).toHaveBeenCalled();
  });

  it('converts legacy HarnessConfig and executes', async () => {
    const harness = await loadLegacyProfile('hybrid-profile');
    const taskSpec = harnessConfigToTaskSpec(harness, {
      taskPrompt: 'Fix types',
    });

    const controller = new ConvergenceController(taskSpec);
    const result = await controller.run(mockContext);

    expect(result.status).toBeDefined();
  });
});
```

### Execution and Sandbox Integration

```typescript
// packages/server/test/integration/execution-sandbox.test.ts

describe('Execution with Sandbox', () => {
  // Skip if Docker not available
  const itDocker = process.env.CI ? it.skip : it;

  itDocker('creates Docker sandbox and runs command', async () => {
    const coordinator = new ExecutionCoordinator(
      new WorkspaceManager(),
      new SandboxManager(),
      new AgentManager()
    );

    const env = await coordinator.setup({
      workspace: { source: 'local', path: '/tmp/test' },
      sandbox: { provider: 'docker', image: 'node:20-slim' },
      agent: { driver: 'claude-code-subscription' },
    });

    try {
      const result = await coordinator.runAgent(env, 'echo "test"');
      expect(result.success).toBe(true);
    } finally {
      await coordinator.teardown(env);
    }
  });

  it('runs with subprocess sandbox', async () => {
    const coordinator = new ExecutionCoordinator(
      new WorkspaceManager(),
      new SandboxManager(),
      new AgentManager()
    );

    const env = await coordinator.setup({
      workspace: { source: 'local', path: '/tmp/test' },
      sandbox: { provider: 'subprocess' },
      agent: { driver: 'claude-code-subscription' },
    });

    try {
      expect(env.sandbox.provider).toBe('subprocess');
    } finally {
      await coordinator.teardown(env);
    }
  });
});
```

---

## Acceptance Tests

### Location
```
packages/server/test/acceptance/
├── full-taskspec-execution.test.ts
├── convergence-scenarios.test.ts
└── delivery-scenarios.test.ts
```

### Full TaskSpec Execution

```typescript
// packages/server/test/acceptance/full-taskspec-execution.test.ts

describe('Full TaskSpec Execution', () => {
  it('executes complete TaskSpec from submission to delivery', async () => {
    // This is an end-to-end test that:
    // 1. Submits a TaskSpec via API
    // 2. Waits for convergence
    // 3. Verifies delivery occurred

    const taskSpec = createTestTaskSpec({
      goal: { prompt: 'Create a hello.txt file' },
      convergence: {
        strategy: 'fixed',
        config: { iterations: 1 },
        gates: [{
          name: 'file-exists',
          check: { type: 'custom', command: 'test -f hello.txt' },
          onFailure: { action: 'stop' },
        }],
      },
      execution: {
        workspace: { source: 'fresh', destPath: tempDir },
        agent: { driver: 'claude-code-subscription' },
      },
      delivery: {
        git: { mode: 'local', autoCommit: true },
      },
    });

    // Submit
    const response = await api.post('/work-orders', { taskSpec });
    expect(response.status).toBe(201);

    const workOrderId = response.body.data.id;

    // Wait for completion
    await waitForStatus(workOrderId, 'succeeded', { timeout: 60000 });

    // Verify
    const status = await api.get(`/work-orders/${workOrderId}`);
    expect(status.body.data.status).toBe('succeeded');

    // Check file was created
    expect(await fs.pathExists(path.join(tempDir, 'hello.txt'))).toBe(true);
  });

  it('handles convergence failure gracefully', async () => {
    const taskSpec = createTestTaskSpec({
      convergence: {
        strategy: 'fixed',
        config: { iterations: 2 },
        gates: [{
          name: 'impossible',
          check: { type: 'custom', command: 'false' },
          onFailure: { action: 'iterate' },
        }],
      },
    });

    const response = await api.post('/work-orders', { taskSpec });
    const workOrderId = response.body.data.id;

    await waitForStatus(workOrderId, 'failed', { timeout: 60000 });

    const status = await api.get(`/work-orders/${workOrderId}`);
    expect(status.body.data.status).toBe('failed');
  });
});
```

---

## Test Coverage Requirements

### Minimum Coverage Targets

| Component | Statement | Branch | Function |
|-----------|-----------|--------|----------|
| task-spec/ | 90% | 85% | 95% |
| convergence/ | 85% | 80% | 90% |
| gate/ | 85% | 80% | 90% |
| execution/ | 80% | 75% | 85% |
| delivery/ | 80% | 75% | 85% |

### Running Coverage

```bash
# Generate coverage report
pnpm --filter @agentgate/server test:coverage

# View HTML report
open packages/server/coverage/index.html
```

---

## Test Fixtures

### Location
```
packages/server/test/fixtures/
├── taskspecs/
│   ├── minimal.yaml
│   ├── full-featured.yaml
│   ├── invalid-schema.yaml
│   └── legacy-harness.yaml
├── verification-reports/
│   ├── all-passed.json
│   ├── l1-failed.json
│   └── l0-failed.json
└── workspaces/
    ├── node-project/
    └── python-project/
```

### Fixture Helpers

```typescript
// packages/server/test/helpers/fixtures.ts

export function createTestTaskSpec(
  overrides: DeepPartial<TaskSpec>
): TaskSpec {
  return merge(defaultTaskSpec, overrides);
}

export function createConvergenceState(
  overrides: Partial<ConvergenceState>
): ConvergenceState {
  return {
    iteration: 1,
    elapsed: 0,
    gateResults: [],
    history: [],
    ...overrides,
  };
}

export function createGateContext(
  overrides: Partial<GateContext>
): GateContext {
  return {
    taskSpec: createTestTaskSpec({}),
    workOrderId: 'test-wo',
    runId: 'test-run',
    iteration: 1,
    snapshot: createSnapshot(),
    workspacePath: '/tmp/test',
    ...overrides,
  };
}
```

---

## Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml

name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test:unit
      - uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    services:
      docker:
        image: docker:dind
        options: --privileged
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test:integration

  acceptance-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test:acceptance
```

---

## Test Commands

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm --filter @agentgate/server test:unit

# Run integration tests only
pnpm --filter @agentgate/server test:integration

# Run acceptance tests only
pnpm --filter @agentgate/server test:acceptance

# Run with coverage
pnpm --filter @agentgate/server test:coverage

# Run specific test file
pnpm --filter @agentgate/server test -- task-spec/loader.test.ts

# Run tests matching pattern
pnpm --filter @agentgate/server test -- --grep "ConvergenceController"

# Watch mode
pnpm --filter @agentgate/server test:watch
```
