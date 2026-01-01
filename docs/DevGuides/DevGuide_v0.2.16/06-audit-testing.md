# 06: Audit Trail & Testing

This document covers Thrusts 11-12: implementing the configuration audit trail and comprehensive testing.

---

## Thrust 11: Audit Trail

### 11.1 Objective

Implement configuration snapshot tracking across iterations, enabling debugging of why runs behaved differently and providing full visibility into resolved configuration.

### 11.2 Background

When debugging agent behavior, it's crucial to know:
- What configuration was active during each iteration?
- Did the configuration change during the run?
- What was the inheritance chain that produced the final config?
- What CLI overrides were applied?

### 11.3 Subtasks

#### 11.3.1 Create Audit Trail Module

Create `packages/server/src/harness/audit-trail.ts`:

**Define AuditStore Class:**
- Constructor accepts `baseDir: string` (default: `~/.agentgate/audit`)
- Store path pattern: `{baseDir}/runs/{runId}/`

**Core Methods:**
- `init(): Promise<void>` - Ensure directories exist
- `snapshotConfig(runId, iteration, config): Promise<ConfigSnapshot>`
- `loadSnapshot(runId, iteration): Promise<ConfigSnapshot | null>`
- `loadAuditRecord(runId): Promise<ConfigAuditRecord | null>`
- `saveAuditRecord(record): Promise<void>`

#### 11.3.2 Implement Config Snapshot Creation

Create `createSnapshot(runId, workOrderId, iteration, config)` function:
- Generate unique snapshot ID
- Compute config hash
- Create ConfigSnapshot object:
  - `id`, `workOrderId`, `runId`, `iteration`
  - `config` (the ResolvedHarnessConfig)
  - `snapshotAt` timestamp
  - `configHash`
- Return snapshot

#### 11.3.3 Implement Change Detection

Create `detectChanges(previous, current)` function:
- Deep compare two ConfigSnapshot objects
- For each difference:
  - Record the path (dot notation)
  - Record previous value
  - Record new value
  - Infer reason (user override, strategy adjustment, etc.)
- Return `ConfigChange[]` or null if no changes

#### 11.3.4 Implement Snapshot Persistence

**Save Snapshot:**
- Serialize snapshot to JSON
- Write to `{baseDir}/runs/{runId}/config-iter-{iteration}.json`
- Also update `config-latest.json` symlink

**Load Snapshot:**
- Read JSON from path
- Parse and validate
- Return ConfigSnapshot

#### 11.3.5 Implement Audit Record Management

**Create Audit Record:**
- At run start: save initial snapshot
- After each iteration: check for changes, save if changed
- At run end: save final snapshot
- Aggregate into ConfigAuditRecord

**Save Audit Record:**
- Write to `{baseDir}/runs/{runId}/audit.json`
- Include all snapshots and metadata

#### 11.3.6 Integrate with Run Executor

In `run-executor.ts`:
- Import `auditStore`
- At run start: `auditStore.snapshotConfig(runId, 0, config)`
- After each iteration: check for changes, snapshot if changed
- At run end: save complete audit record

#### 11.3.7 Add Audit Query Commands

In profile command or new audit command:
- `agentgate audit show <runId>` - Show audit record
- `agentgate audit diff <runId>` - Show config changes
- `agentgate audit config <runId> [iteration]` - Show config at iteration

### 11.4 Verification Steps

1. Execute a run and verify audit record created
2. Verify initial and final snapshots present
3. Modify config mid-run (via strategy) and verify change detected
4. Test loading audit record by run ID
5. Verify config hash is deterministic

### 11.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/harness/audit-trail.ts` | Created |
| `packages/server/src/orchestrator/run-executor.ts` | Modified - add audit calls |
| `packages/server/src/control-plane/commands/audit.ts` | Created (optional) |

---

## Thrust 12: Comprehensive Testing

### 12.1 Objective

Create comprehensive test coverage for all harness system components, ensuring reliability and correctness.

### 12.2 Background

The harness system has multiple components that need testing:
- Type schemas (Zod validation)
- Loop strategies (decision logic)
- Config loading (YAML parsing)
- Config resolution (inheritance, merging)
- Orchestrator integration (end-to-end)
- CLI integration (option parsing)

### 12.3 Subtasks

#### 12.3.1 Create Type Schema Tests

Create `packages/server/test/harness/harness-config.test.ts`:

**Test Cases:**
- Valid HarnessConfig parses correctly
- Invalid config fails with descriptive error
- Discriminated union works for each strategy mode
- Default values applied correctly
- Optional fields handle undefined
- Enum validation works for all enums

#### 12.3.2 Create Strategy Tests

Create `packages/server/test/harness/strategies/` directory:

**fixed-strategy.test.ts:**
- Returns continue for iterations 1 to N-1
- Returns complete on iteration N
- Returns complete when verification passes
- State tracking is accurate

**hybrid-strategy.test.ts:**
- Completion on verification pass
- Completion on no-changes detection
- Loop detection with repeated hashes
- Partial acceptance after N iterations
- Progress tracking accuracy
- Multiple completion criteria handling

**ralph-strategy.test.ts:**
- Completion on agent signal
- Loop detection via similarity
- Max iterations timeout
- Similarity threshold configuration

**custom-strategy.test.ts:**
- Module loading success
- Module not found error
- Invalid strategy interface error
- Delegation of all methods

#### 12.3.3 Create Config Loader Tests

Create `packages/server/test/harness/config-loader.test.ts`:

**Test Cases:**
- Load valid YAML profile
- Handle invalid YAML syntax
- Handle missing file
- List profiles in directory
- Save and reload profile
- Profile existence check

#### 12.3.4 Create Config Resolver Tests

Create `packages/server/test/harness/config-resolver.test.ts`:

**Test Cases:**
- Resolution with no profile (defaults only)
- Resolution with named profile
- Single-level inheritance
- Multi-level inheritance
- Circular inheritance detection
- CLI override precedence
- Config hash determinism

#### 12.3.5 Create Strategy Registry Tests

Create `packages/server/test/harness/strategy-registry.test.ts`:

**Test Cases:**
- All built-in strategies registered
- Create strategy by mode
- Unknown mode throws error
- Available modes list

#### 12.3.6 Create Integration Tests

Create `packages/server/test/harness/integration.test.ts`:

**Test Cases:**
- Full run with hybrid strategy
- Profile inheritance in real run
- CLI override in real run
- Audit trail created correctly
- Strategy state persisted across iterations

#### 12.3.7 Create CLI Tests

Create `packages/server/test/harness/cli.test.ts`:

**Test Cases:**
- `--harness` option parsing
- `--loop-strategy` option parsing
- `--completion` option parsing
- Profile command parsing
- Help text includes new options

#### 12.3.8 Create Test Fixtures

Create test fixtures in `packages/server/test/fixtures/harness/`:
- `valid-profile.yaml` - Complete valid profile
- `minimal-profile.yaml` - Minimal valid profile
- `invalid-yaml.yaml` - Syntax error
- `invalid-schema.yaml` - Valid YAML, invalid schema
- `parent-profile.yaml` - For inheritance testing
- `child-profile.yaml` - Extends parent

### 12.4 Verification Steps

1. Run all harness tests: `pnpm test --filter harness`
2. Verify coverage meets threshold (>80%)
3. All edge cases covered
4. Error messages are helpful
5. Tests are isolated (no side effects)

### 12.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/test/harness/harness-config.test.ts` | Created |
| `packages/server/test/harness/strategies/fixed-strategy.test.ts` | Created |
| `packages/server/test/harness/strategies/hybrid-strategy.test.ts` | Created |
| `packages/server/test/harness/strategies/ralph-strategy.test.ts` | Created |
| `packages/server/test/harness/strategies/custom-strategy.test.ts` | Created |
| `packages/server/test/harness/config-loader.test.ts` | Created |
| `packages/server/test/harness/config-resolver.test.ts` | Created |
| `packages/server/test/harness/strategy-registry.test.ts` | Created |
| `packages/server/test/harness/integration.test.ts` | Created |
| `packages/server/test/harness/cli.test.ts` | Created |
| `packages/server/test/fixtures/harness/*.yaml` | Created |

---

## Test Coverage Requirements

### Unit Test Coverage

| Component | Minimum Coverage |
|-----------|-----------------|
| harness-config.ts | 90% |
| loop-strategy.ts | 90% |
| fixed-strategy.ts | 85% |
| hybrid-strategy.ts | 85% |
| ralph-strategy.ts | 85% |
| custom-strategy.ts | 80% |
| config-loader.ts | 85% |
| config-resolver.ts | 85% |
| strategy-registry.ts | 90% |
| audit-trail.ts | 80% |

### Integration Test Scenarios

| Scenario | Priority |
|----------|----------|
| Default harness (no profile) | P0 |
| Named profile loading | P0 |
| Profile inheritance | P0 |
| CLI override precedence | P0 |
| Hybrid completion detection | P0 |
| Fixed iteration count | P0 |
| Ralph completion signal | P1 |
| Audit trail creation | P1 |
| Custom strategy loading | P2 |

---

## Audit Storage Format

### Directory Structure

```
~/.agentgate/audit/
└── runs/
    └── {runId}/
        ├── audit.json           # Complete audit record
        ├── config-iter-0.json   # Initial config
        ├── config-iter-1.json   # If changed
        ├── config-iter-2.json   # If changed
        ├── config-final.json    # Final config
        └── config-latest.json   # Symlink to latest
```

### audit.json Format

```json
{
  "runId": "abc123",
  "workOrderId": "wo-456",
  "createdAt": "2025-01-01T00:00:00Z",
  "completedAt": "2025-01-01T01:00:00Z",
  "totalIterations": 3,
  "configChanges": 1,
  "initialConfig": {
    "id": "snap-001",
    "iteration": 0,
    "configHash": "a1b2c3d4",
    "config": { ... }
  },
  "iterationSnapshots": [
    {
      "id": "snap-002",
      "iteration": 2,
      "configHash": "e5f6g7h8",
      "config": { ... },
      "changesFromPrevious": [
        {
          "path": "loopStrategy.maxIterations",
          "previousValue": 5,
          "newValue": 3,
          "reason": "Strategy adjusted based on progress",
          "initiator": "strategy"
        }
      ]
    }
  ],
  "finalConfig": {
    "id": "snap-003",
    "iteration": 3,
    "configHash": "e5f6g7h8",
    "config": { ... }
  }
}
```

### Config Snapshot Format

```json
{
  "id": "snap-001",
  "workOrderId": "wo-456",
  "runId": "abc123",
  "iteration": 0,
  "snapshotAt": "2025-01-01T00:00:00Z",
  "configHash": "a1b2c3d4e5f6g7h8",
  "config": {
    "source": "ci-focused",
    "inheritanceChain": ["default", "ci-focused"],
    "resolvedAt": "2025-01-01T00:00:00Z",
    "loopStrategy": { ... },
    "agent": { ... },
    "verification": { ... },
    "gitOps": { ... },
    "limits": { ... }
  },
  "changesFromPrevious": null
}
```
