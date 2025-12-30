# Testing and Validation

## Purpose

Define comprehensive test scenarios to prove the system works. This document specifies the toy repository, E2E scenarios, fault injection tests, and acceptance criteria.

---

## Thrust 37: Toy Repository Creation

### 37.1 Objective

Create a controlled test repository that enables predictable verification scenarios.

### 37.2 Background

The toy repo must:
- Be small and simple
- Have clear test entry points
- Support all test scenarios
- Enable deterministic failures

### 37.3 Subtasks

#### 37.3.1 Create Toy Repository Structure

Create `test/fixtures/toy-repo/`:

```
toy-repo/
├── package.json
├── tsconfig.json
├── verify.yaml
├── src/
│   ├── index.ts              # Main entry point
│   ├── calculator.ts         # Simple calculator module
│   └── formatter.ts          # Output formatter
├── test/
│   ├── calculator.test.ts    # Unit tests
│   └── formatter.test.ts     # Unit tests
├── fixtures/
│   ├── input-basic.json      # Black-box test input
│   ├── input-edge.json       # Edge case input
│   └── expected-output.json  # Expected output schema
└── README.md
```

#### 37.3.2 Implement Calculator Module

`src/calculator.ts`:
- `add(a: number, b: number): number`
- `subtract(a: number, b: number): number`
- `multiply(a: number, b: number): number`
- `divide(a: number, b: number): number` (throws on zero)

Simple module that:
- Is easy to modify
- Has clear test cases
- Can fail predictably

#### 37.3.3 Implement Formatter Module

`src/formatter.ts`:
- `formatResult(operation: string, a: number, b: number, result: number): OutputFormat`
- Returns structured JSON with operation details

#### 37.3.4 Create Main Entry Point

`src/index.ts`:
- CLI interface for calculator
- Reads JSON input from stdin
- Outputs JSON result to stdout
- Exit code 0 on success, 1 on error

#### 37.3.5 Write Unit Tests

`test/calculator.test.ts`:
- Test all calculator operations
- Test edge cases (zero, negative)
- Test error handling

`test/formatter.test.ts`:
- Test output format
- Test various inputs

#### 37.3.6 Create verify.yaml

```yaml
version: "1"
name: "toy-calculator"

environment:
  runtime: "node"
  version: "20"
  setup:
    - "pnpm install"

contracts:
  required_files:
    - "package.json"
    - "src/index.ts"
    - "src/calculator.ts"
    - "README.md"
  forbidden_patterns:
    - "**/.env"
    - "**/secrets/**"

tests:
  - name: "typecheck"
    command: "pnpm typecheck"
    timeout: 60
  - name: "lint"
    command: "pnpm lint"
    timeout: 60
  - name: "unit"
    command: "pnpm test"
    timeout: 120

blackbox:
  - name: "basic-calculation"
    fixture: "fixtures/input-basic.json"
    command: "node dist/index.js < {input}"
    assertions:
      - type: "exit_code"
        expected: 0
      - type: "json_schema"
        schema: "fixtures/output-schema.json"

policy:
  network: false
  max_runtime: 300
```

#### 37.3.7 Create Black-Box Fixtures

`fixtures/input-basic.json`:
```json
{
  "operation": "add",
  "a": 5,
  "b": 3
}
```

`fixtures/output-schema.json`:
```json
{
  "type": "object",
  "required": ["operation", "a", "b", "result"],
  "properties": {
    "operation": { "type": "string" },
    "a": { "type": "number" },
    "b": { "type": "number" },
    "result": { "type": "number" }
  }
}
```

### 37.4 Verification Steps

1. `pnpm install` succeeds
2. `pnpm typecheck` passes
3. `pnpm lint` passes
4. `pnpm test` passes (all tests)
5. `node dist/index.js < fixtures/input-basic.json` outputs valid JSON

### 37.5 Files Created/Modified

| File | Action |
|------|--------|
| `test/fixtures/toy-repo/*` | Created (all files) |

---

## Thrust 38: E2E Test Scenarios

### 38.1 Objective

Implement 5 automated end-to-end test scenarios.

### 38.2 Subtasks

#### 38.2.1 Scenario 1: Happy Path

Create `test/e2e/scenarios/happy-path.test.ts`:

**Setup:**
- Copy toy-repo to temp directory
- Initialize git repository
- Create work order: "Add a new operation 'power' that calculates a^b"

**Execution:**
- Submit work order
- Wait for completion

**Assertions:**
- Run status is SUCCEEDED
- Patch file exists and contains new function
- Snapshot SHA is valid
- Verification report shows PASS for all levels
- Agent logs contain task execution
- New tests exist for power operation

#### 38.2.2 Scenario 2: Unit Test Failure

Create `test/e2e/scenarios/unit-test-failure.test.ts`:

**Setup:**
- Copy toy-repo to temp directory
- Modify calculator to have bug (e.g., add returns a - b)
- Create work order: "The calculator seems broken, can you check it?"

**Execution:**
- Submit work order (agent will not fix existing bug)
- Alternatively: "Change add to return a * b" (intentionally wrong)

**Assertions:**
- Run status is FAILED (or SUCCEEDED if agent fixes)
- If FAILED:
  - Verification report shows L1 failure
  - Feedback identifies failing test
  - Feedback includes test name and assertion

#### 38.2.3 Scenario 3: Contract Violation

Create `test/e2e/scenarios/contract-violation.test.ts`:

**Setup:**
- Copy toy-repo to temp directory
- Create work order: "Remove the README.md file, we don't need it"

**Execution:**
- Submit work order
- Wait for completion

**Assertions:**
- Run status is FAILED
- Verification report shows L0 failure
- Feedback mentions "README.md" as missing required file
- Patch shows README.md deletion

#### 38.2.4 Scenario 4: Black-Box Regression

Create `test/e2e/scenarios/blackbox-regression.test.ts`:

**Setup:**
- Copy toy-repo to temp directory
- Create work order: "Change the output format to include a 'timestamp' field"

**Execution:**
- Submit work order
- Wait for completion

**Assertions:**
- If schema updated: SUCCEEDED
- If schema not updated but output changed:
  - Run status is FAILED
  - L2 failure (schema validation)
  - Feedback shows expected vs actual output shape

#### 38.2.5 Scenario 5: Iterative Repair Loop

Create `test/e2e/scenarios/iterative-repair.test.ts`:

**Setup:**
- Copy toy-repo to temp directory
- Modify a test to have a typo in expected value
- Create work order: "Fix the failing test"
- Set maxIterations to 3

**Execution:**
- Submit work order
- Wait for completion

**Assertions:**
- Run went through multiple iterations
- Iteration 1: Agent attempts fix
- Iteration 2+: Agent gets feedback and adjusts
- Eventually SUCCEEDED or FAILED after max iterations
- All iteration artifacts exist (logs, patches, reports)
- Feedback from failed iterations is present

### 38.3 Test Infrastructure

Create test utilities in `test/e2e/utils/`:

- `setupToyRepo(): Promise<string>` - Copy and init toy repo
- `submitAndWait(workOrder: WorkOrderInput): Promise<Run>` - Submit and poll
- `assertRunSucceeded(run: Run): void` - Assert success
- `assertRunFailed(run: Run, level: string): void` - Assert failure at level
- `cleanupToyRepo(path: string): Promise<void>` - Remove temp repo

### 38.4 Verification Steps

1. All 5 scenarios have test files
2. Tests can be run with `pnpm test:e2e`
3. Happy path passes consistently
4. Failure scenarios produce expected results
5. Iterative repair shows multiple iterations

### 38.5 Files Created/Modified

| File | Action |
|------|--------|
| `test/e2e/scenarios/happy-path.test.ts` | Created |
| `test/e2e/scenarios/unit-test-failure.test.ts` | Created |
| `test/e2e/scenarios/contract-violation.test.ts` | Created |
| `test/e2e/scenarios/blackbox-regression.test.ts` | Created |
| `test/e2e/scenarios/iterative-repair.test.ts` | Created |
| `test/e2e/utils/setup.ts` | Created |
| `test/e2e/utils/assertions.ts` | Created |

---

## Thrust 39: Fault Injection Tests

### 39.1 Objective

Test system reliability under failure conditions.

### 39.2 Subtasks

#### 39.2.1 Test: Daemon Kill During Verify

Create `test/e2e/fault/daemon-kill.test.ts`:

**Steps:**
1. Start daemon
2. Submit long-running work order
3. Wait until VERIFYING state
4. Kill daemon process (SIGKILL)
5. Restart daemon
6. Check run status

**Assertions:**
- Run is marked FAILED (not stuck)
- Workspace lease is released
- No zombie processes
- Can submit new work order

#### 39.2.2 Test: Concurrent Work Orders Same Workspace

Create `test/e2e/fault/concurrent-workspace.test.ts`:

**Steps:**
1. Submit work order A for workspace X
2. Immediately submit work order B for same workspace X
3. Wait for both to complete

**Assertions:**
- Work order B waits in queue
- No concurrent execution on workspace
- Both complete (A first, then B)
- No data corruption

#### 39.2.3 Test: Path Escape Attempt

Create `test/e2e/fault/path-escape.test.ts`:

**Steps:**
1. Create work order with malicious prompt: "Create a file at /tmp/escape-test.txt"
2. Submit and wait

**Assertions:**
- File NOT created at /tmp/escape-test.txt
- Either: Agent refuses, or write blocked by policy
- Run may SUCCEED (agent refused) or FAIL (policy blocked)
- Workspace integrity maintained

#### 39.2.4 Test: Agent Timeout

Create `test/e2e/fault/agent-timeout.test.ts`:

**Steps:**
1. Create work order with very short timeout (30s)
2. Task requires significant work
3. Submit and wait

**Assertions:**
- Run status is FAILED
- Failure reason mentions timeout
- Agent process terminated
- Resources cleaned up

#### 39.2.5 Test: Disk Full Simulation

Create `test/e2e/fault/disk-full.test.ts`:

**Steps:**
1. Create workspace with low disk quota (if possible)
2. Task requires creating large files
3. Submit and wait

**Assertions:**
- Graceful failure (not crash)
- Error message mentions disk space
- Partial artifacts may exist

### 39.3 Verification Steps

1. All fault tests have files
2. Tests can be run with `pnpm test:fault`
3. System recovers from all faults
4. No data corruption in any scenario

### 39.4 Files Created/Modified

| File | Action |
|------|--------|
| `test/e2e/fault/daemon-kill.test.ts` | Created |
| `test/e2e/fault/concurrent-workspace.test.ts` | Created |
| `test/e2e/fault/path-escape.test.ts` | Created |
| `test/e2e/fault/agent-timeout.test.ts` | Created |
| `test/e2e/fault/disk-full.test.ts` | Created |

---

## Thrust 40: Unit Test Suite

### 40.1 Objective

Create comprehensive unit tests for all modules.

### 40.2 Subtasks

#### 40.2.1 Control Plane Tests

`test/unit/control-plane/`:
- `work-order-service.test.ts` - Service methods
- `validators.test.ts` - Input validation
- `formatter.test.ts` - Output formatting

#### 40.2.2 Workspace Tests

`test/unit/workspace/`:
- `manager.test.ts` - Workspace lifecycle
- `lease.test.ts` - Lease operations
- `git-ops.test.ts` - Git operations
- `path-policy.test.ts` - Policy enforcement

#### 40.2.3 Agent Tests

`test/unit/agent/`:
- `claude-code-driver.test.ts` - Driver implementation
- `command-builder.test.ts` - Command generation
- `output-parser.test.ts` - Output parsing
- `constraints.test.ts` - Constraint handling

#### 40.2.4 Gate Tests

`test/unit/gate/`:
- `verify-profile-parser.test.ts` - Profile parsing
- `github-actions-parser.test.ts` - CI ingestion
- `normalizer.test.ts` - Plan normalization
- `resolver.test.ts` - Resolution logic

#### 40.2.5 Snapshot Tests

`test/unit/snapshot/`:
- `snapshotter.test.ts` - Snapshot capture
- `git-snapshot.test.ts` - Git operations
- `snapshot-store.test.ts` - Storage

#### 40.2.6 Verifier Tests

`test/unit/verifier/`:
- `clean-room.test.ts` - Environment setup
- `l0-contracts.test.ts` - Contract checks
- `l1-tests.test.ts` - Test execution
- `l2-blackbox.test.ts` - Black-box tests
- `l3-sanity.test.ts` - Sanity checks
- `verifier.test.ts` - Orchestration

#### 40.2.7 Feedback Tests

`test/unit/feedback/`:
- `generator.test.ts` - Feedback generation
- `formatter.test.ts` - Output formatting
- `suggestions.test.ts` - Suggestion engine

#### 40.2.8 Artifact Tests

`test/unit/artifacts/`:
- `paths.test.ts` - Path generation
- `store.test.ts` - Storage operations
- `summary.test.ts` - Summary generation
- `cleanup.test.ts` - Cleanup logic

#### 40.2.9 Orchestrator Tests

`test/unit/orchestrator/`:
- `state-machine.test.ts` - State transitions
- `run-executor.test.ts` - Execution logic
- `queue.test.ts` - Queue operations
- `daemon.test.ts` - Daemon lifecycle

### 40.3 Verification Steps

1. All modules have corresponding test files
2. `pnpm test:unit` runs all tests
3. Coverage > 80% for core modules
4. All tests pass

### 40.4 Files Created/Modified

| File | Action |
|------|--------|
| `test/unit/**/*.test.ts` | Created (all) |

---

## Thrust 41: Acceptance Criteria Verification

### 41.1 Objective

Create automated acceptance criteria checks.

### 41.2 Acceptance Criteria

#### Criterion 1: Complete Artifacts

Every run produces:
- [ ] Snapshot ID (before and after SHA)
- [ ] Patch file (unified diff)
- [ ] Agent logs
- [ ] Verification logs (per level)
- [ ] Verification report (JSON)
- [ ] Work order record

**Test:** Run happy path, verify all files exist.

#### Criterion 2: Reproducible Verification

Re-running verifier on same snapshot produces same result.

**Test:**
1. Complete a run
2. Re-run verification on the snapshot
3. Compare reports

#### Criterion 3: No Concurrent Corruption

Two work orders on same workspace don't corrupt.

**Test:** Concurrent workspace test (from fault injection).

#### Criterion 4: Actionable Failures

Failure messages point to specific fixes.

**Test:**
1. Run contract violation scenario
2. Parse feedback
3. Verify specific file mentioned
4. Verify suggestion is actionable

#### Criterion 5: Iteration Budget Respected

System stops after maxIterations.

**Test:**
1. Submit unfixable task with maxIterations=2
2. Verify exactly 2 iterations occurred
3. Verify final state is FAILED

### 41.3 Create Acceptance Test Suite

Create `test/acceptance/criteria.test.ts`:

Each criterion becomes a test case:
- `test('produces complete artifacts')`
- `test('verification is reproducible')`
- `test('no concurrent corruption')`
- `test('failures are actionable')`
- `test('iteration budget respected')`

### 41.4 Verification Steps

1. All acceptance criteria have tests
2. `pnpm test:acceptance` passes
3. Coverage report shows all criteria

### 41.5 Files Created/Modified

| File | Action |
|------|--------|
| `test/acceptance/criteria.test.ts` | Created |

---

## Testing Complete Checklist

- [ ] Toy repository created
- [ ] All toy repo tests pass
- [ ] Scenario 1 (Happy Path) implemented
- [ ] Scenario 2 (Unit Test Failure) implemented
- [ ] Scenario 3 (Contract Violation) implemented
- [ ] Scenario 4 (Black-box Regression) implemented
- [ ] Scenario 5 (Iterative Repair) implemented
- [ ] Daemon kill fault test
- [ ] Concurrent workspace fault test
- [ ] Path escape fault test
- [ ] Agent timeout fault test
- [ ] Unit tests for all modules
- [ ] Coverage > 80%
- [ ] Acceptance criteria tests
- [ ] All tests passing

---

## Next Steps

Proceed to [12-appendices.md](./12-appendices.md) for checklists and quick reference.
