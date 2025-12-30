# Module F: Verifier (Clean-Room Gate Execution)

## Purpose

Execute gate plan checks on an immutable snapshot in a fresh environment. The verifier is the authoritative oracle — its results determine PASS/FAIL.

---

## Thrust 18: Clean-Room Environment

### 18.1 Objective

Implement isolated execution environment for verification.

### 18.2 Background

Clean-room verification ensures:
- No pollution from build environment
- Reproducible results
- Security isolation
- Read-only access to snapshot

For MVP, we use fresh Python venv or Node.js environment. Containers are future hardening.

### 18.3 Subtasks

#### 18.3.1 Create Clean-Room Manager

Create `src/verifier/clean-room.ts`:

The manager provides:
- `create(snapshot: Snapshot, gatePlan: GatePlan): Promise<CleanRoom>` - Create environment
- `destroy(cleanRoom: CleanRoom): Promise<void>` - Tear down environment
- `execute(cleanRoom: CleanRoom, command: Command): Promise<CommandResult>` - Run command

`CleanRoom` structure:
- `id`: string
- `snapshotId`: string
- `workDir`: string (temp directory path)
- `envDir`: string (venv/node_modules path)
- `runtime`: 'node' | 'python' | 'generic'
- `runtimeVersion`: string
- `createdAt`: Date
- `env`: Record<string, string> (environment variables)

#### 18.3.2 Implement Snapshot Extraction

Extract snapshot to clean-room:
1. Create temp directory for clean-room
2. Extract snapshot using git archive (from original workspace)
3. Verify extraction matches snapshot SHA
4. Set directory permissions (read-only for source, write for outputs)

#### 18.3.3 Implement Node.js Environment Setup

For Node.js projects:
1. Detect package manager (npm, pnpm, yarn)
2. Run install command with cache disabled
3. Set up PATH to include node_modules/.bin
4. Capture setup logs

Setup commands:
- npm: `npm ci --no-audit --no-fund`
- pnpm: `pnpm install --frozen-lockfile`
- yarn: `yarn install --frozen-lockfile`

#### 18.3.4 Implement Python Environment Setup

For Python projects:
1. Create fresh venv: `python -m venv .venv`
2. Activate and install: `pip install -r requirements.txt`
3. Or for pyproject.toml: `pip install .`
4. Set up PATH to include venv/bin
5. Capture setup logs

#### 18.3.5 Implement Generic Environment

For unknown project types:
- No special setup
- Use system PATH
- Log warning about limited verification

#### 18.3.6 Network Isolation

Disable network access during verification:
- Set `http_proxy`/`https_proxy` to invalid values
- For containers (future): use `--network none`
- If network explicitly allowed, skip isolation

### 18.4 Verification Steps

1. Create Node.js clean-room - dependencies installed
2. Create Python clean-room - venv created with deps
3. Execute command in clean-room - returns result
4. Network blocked by default - requests fail
5. Clean-room destroyed - temp directory removed

### 18.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/verifier/clean-room.ts` | Created |
| `agentgate/src/verifier/environments/node.ts` | Created |
| `agentgate/src/verifier/environments/python.ts` | Created |
| `agentgate/src/verifier/environments/generic.ts` | Created |
| `agentgate/src/verifier/index.ts` | Created |

---

## Thrust 19: L0 Contract Checks

### 19.1 Objective

Implement Level 0 verification: structural contract checks.

### 19.2 Background

L0 checks verify the artifact structure without execution:
- Required files exist
- Schemas are valid
- Forbidden patterns absent
- Naming conventions followed

L0 is fast and catches obvious problems before running tests.

### 19.3 Subtasks

#### 19.3.1 Create L0 Verifier

Create `src/verifier/l0-contracts.ts`:

Main function:
- `verifyContracts(cleanRoom: CleanRoom, contracts: ContractConfig): Promise<L0Result>`

`L0Result` structure:
- `passed`: boolean
- `checks`: ContractCheck[]
- `failures`: ContractFailure[]
- `duration`: number

#### 19.3.2 Implement Required Files Check

Function `checkRequiredFiles`:
- For each required file path, verify existence
- Support glob patterns (e.g., `src/**/*.ts`)
- Report missing files with exact paths

#### 19.3.3 Implement Schema Validation

Function `checkSchemas`:
- Load JSON/YAML files
- Validate against schema rules:
  - `has_field`: Field exists
  - `field_type`: Field has expected type
  - `matches_regex`: Field matches pattern
  - `json_schema`: Full JSON Schema validation

Use `ajv` for JSON Schema validation.

#### 19.3.4 Implement Forbidden Pattern Check

Function `checkForbiddenPatterns`:
- Scan clean-room directory for forbidden globs
- Use fast-glob for pattern matching
- Report any matching files as violations

#### 19.3.5 Implement Naming Convention Check

Function `checkNamingConventions`:
- Verify file naming patterns (e.g., kebab-case for files)
- Check directory structure conventions
- Report violations with suggestions

### 19.4 Verification Steps

1. All required files present - L0 passes
2. Missing required file - L0 fails with clear message
3. Schema violation - L0 fails with field details
4. Forbidden file exists - L0 fails with file path
5. Empty contracts config - L0 passes (no checks)

### 19.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/verifier/l0-contracts.ts` | Created |
| `agentgate/package.json` | Modified (add ajv) |

---

## Thrust 20: L1 Test Commands

### 20.1 Objective

Implement Level 1 verification: test command execution.

### 20.2 Background

L1 runs the project's own test commands:
- Unit tests
- Lint checks
- Type checking
- Build verification

These are the commands defined in verify.yaml or extracted from CI.

### 20.3 Subtasks

#### 20.3.1 Create L1 Verifier

Create `src/verifier/l1-tests.ts`:

Main function:
- `verifyTests(cleanRoom: CleanRoom, tests: TestCommand[]): Promise<L1Result>`

`L1Result` structure:
- `passed`: boolean
- `results`: TestResult[]
- `duration`: number

`TestResult` structure:
- `name`: string
- `command`: string
- `exitCode`: number
- `expectedExit`: number
- `passed`: boolean
- `stdout`: string
- `stderr`: string
- `duration`: number

#### 20.3.2 Implement Test Execution

For each test command:
1. Log test start
2. Execute command in clean-room with timeout
3. Capture stdout/stderr
4. Compare exit code to expected
5. Record result
6. Continue to next test (don't stop on failure)

#### 20.3.3 Handle Test Timeouts

When test exceeds timeout:
- Kill process with SIGTERM
- Wait 5 seconds
- Kill with SIGKILL if still running
- Mark as failed with timeout reason

#### 20.3.4 Parse Test Output

Attempt to parse common test output formats:
- Jest/Vitest: Extract test counts, failures
- pytest: Extract test counts, failures
- Generic: Count exit code only

Store parsed summaries in result metadata.

### 20.4 Verification Steps

1. All tests pass - L1 passes
2. One test fails - L1 fails with details
3. Test times out - marked as timeout failure
4. Empty test list - L1 passes (no tests)
5. Non-zero expected exit - handles correctly

### 20.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/verifier/l1-tests.ts` | Created |

---

## Thrust 21: L2 Black-Box Tests

### 21.1 Objective

Implement Level 2 verification: fixture-based conformance tests.

### 21.2 Background

L2 tests run the built artifact against known fixtures:
- Input files with expected outputs
- API contract verification
- Schema conformance
- Output shape validation

These are platform-owned tests, not project tests.

### 21.3 Subtasks

#### 21.3.1 Create L2 Verifier

Create `src/verifier/l2-blackbox.ts`:

Main function:
- `verifyBlackbox(cleanRoom: CleanRoom, tests: BlackboxTest[]): Promise<L2Result>`

`L2Result` structure:
- `passed`: boolean
- `results`: BlackboxResult[]
- `duration`: number

`BlackboxResult` structure:
- `name`: string
- `fixture`: string
- `passed`: boolean
- `assertions`: AssertionResult[]
- `actualOutput`: string
- `duration`: number

#### 21.3.2 Implement Fixture Loading

Load fixtures from clean-room:
- Support JSON, YAML, text fixtures
- Substitute `{input}` placeholder in commands
- Handle fixture file not found errors

#### 21.3.3 Implement Assertion Types

Support assertion types:
- `exit_code`: Expected exit code
- `json_schema`: Output validates against JSON Schema
- `contains`: Output contains substring
- `matches_regex`: Output matches pattern
- `equals_file`: Output equals fixture file content
- `json_equals`: JSON output equals expected (ignoring order)

#### 21.3.4 Execute Black-Box Tests

For each black-box test:
1. Load input fixture
2. Build command with substitutions
3. Execute in clean-room
4. Capture output
5. Run all assertions
6. Record results

### 21.4 Verification Steps

1. All assertions pass - L2 passes
2. Schema assertion fails - shows schema error
3. Exit code wrong - L2 fails with codes
4. Fixture not found - test fails with clear error
5. No black-box tests - L2 passes

### 21.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/verifier/l2-blackbox.ts` | Created |
| `agentgate/src/verifier/assertions.ts` | Created |

---

## Thrust 22: L3 Sanity Checks

### 22.1 Objective

Implement Level 3 verification: clean-room execution sanity.

### 22.2 Background

L3 verifies the verification itself:
- Clean-room properly isolated
- No unexpected side effects
- Execution completed cleanly
- Resource limits respected

### 22.3 Subtasks

#### 22.3.1 Create L3 Verifier

Create `src/verifier/l3-sanity.ts`:

Main function:
- `verifySanity(cleanRoom: CleanRoom, policy: ExecutionPolicy): Promise<L3Result>`

`L3Result` structure:
- `passed`: boolean
- `checks`: SanityCheck[]
- `warnings`: string[]
- `duration`: number

#### 22.3.2 Implement Isolation Check

Verify clean-room isolation:
- No writes outside work directory
- No network connections (if disabled)
- No process spawning outside expectations
- Environment variables as expected

#### 22.3.3 Implement Resource Check

Verify resource limits:
- Disk usage within limits
- Memory usage reasonable
- Total runtime within budget
- No zombie processes

#### 22.3.4 Implement Artifact Check

Verify expected artifacts exist:
- Build outputs present (if applicable)
- No unexpected large files
- No temporary files left behind

### 22.4 Verification Steps

1. Clean execution - L3 passes
2. Writes outside directory - L3 fails (if detectable)
3. Resource limit exceeded - L3 fails with usage
4. All sanity checks pass - L3 passes

### 22.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/verifier/l3-sanity.ts` | Created |

---

## Thrust 23: Verification Orchestration

### 23.1 Objective

Combine all verification levels into a single orchestrated flow.

### 23.2 Subtasks

#### 23.2.1 Create Verifier Orchestrator

Create `src/verifier/verifier.ts`:

Main function:
- `verify(snapshot: Snapshot, gatePlan: GatePlan): Promise<VerificationReport>`

Orchestration flow:
1. Create clean-room
2. Run environment setup
3. Execute L0 contract checks
4. If L0 passes, execute L1 tests
5. If L1 passes, execute L2 black-box tests
6. Execute L3 sanity checks (always)
7. Compile verification report
8. Destroy clean-room
9. Return report

#### 23.2.2 Implement Early Exit on Failure

Optimization: stop early on critical failures:
- L0 failure: Skip L1, L2 (structure broken)
- L1 failure: Continue to L2 (may provide more info)
- Configurable: `stopOnFirstFailure` option

#### 23.2.3 Implement Verification Logging

Comprehensive logging:
- Log each phase start/end with timing
- Capture all command outputs
- Store logs in run artifacts
- Include structured log entries

#### 23.2.4 Create Verification Report

Compile final report:
- Overall PASS/FAIL status
- Results from each level
- Diagnostics for failures
- Timing breakdown
- Resource usage summary

Store report as JSON in artifacts.

### 23.3 Verification Steps

1. Full verification passes - report shows PASS
2. L0 fails - stops early, report shows L0 failure
3. L1 fails - continues to L2, report shows both
4. All levels run - complete timing in report
5. Clean-room cleaned up after verification

### 23.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/verifier/verifier.ts` | Created |

---

## Module F Complete Checklist

- [ ] Clean-room manager created
- [ ] Node.js environment setup working
- [ ] Python environment setup working
- [ ] Network isolation implemented
- [ ] L0 contract checks complete
- [ ] L1 test execution working
- [ ] L2 black-box tests implemented
- [ ] L3 sanity checks implemented
- [ ] Verifier orchestrator complete
- [ ] Verification report generation
- [ ] Logging comprehensive
- [ ] Unit tests passing

---

## Next Steps

Proceed to [08-feedback-generator.md](./08-feedback-generator.md) for Module G implementation.
