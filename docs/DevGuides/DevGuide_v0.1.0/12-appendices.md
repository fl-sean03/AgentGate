# Appendices

## Quick Reference

### CLI Commands

```bash
# Work Order Management
agentgate submit -t "task" -w /path/to/workspace    # Submit work order
agentgate status <work-order-id>                     # Check status
agentgate list                                       # List all work orders
agentgate list --status failed                       # Filter by status
agentgate cancel <work-order-id>                     # Cancel work order

# Daemon Control
agentgate daemon start                               # Start daemon (foreground)
agentgate daemon status                              # Show daemon status
agentgate daemon stop                                # Stop daemon

# Utilities
agentgate cleanup                                    # Clean old artifacts
agentgate config                                     # Show configuration
```

### Run States

| State | Description | Next States |
|-------|-------------|-------------|
| QUEUED | Waiting for workspace | LEASED, CANCELED |
| LEASED | Workspace acquired | BUILDING, FAILED, CANCELED |
| BUILDING | Agent executing | SNAPSHOTTING, FAILED, CANCELED |
| SNAPSHOTTING | Capturing changes | VERIFYING, FAILED |
| VERIFYING | Running gate checks | SUCCEEDED, FEEDBACK, FAILED |
| FEEDBACK | Generating retry info | BUILDING, FAILED |
| SUCCEEDED | Gate passed (terminal) | - |
| FAILED | Run failed (terminal) | - |
| CANCELED | Canceled (terminal) | - |

### Verification Levels

| Level | Name | Checks |
|-------|------|--------|
| L0 | Contract | Required files, forbidden patterns, schemas |
| L1 | Tests | Unit tests, lint, typecheck |
| L2 | Black-box | Fixture-based conformance |
| L3 | Sanity | Isolation, resources, cleanup |

---

## File Reference

### Source Files by Module

#### Control Plane (Module A)
| File | Purpose |
|------|---------|
| `src/index.ts` | CLI entry point |
| `src/control-plane/cli.ts` | Commander setup |
| `src/control-plane/commands/submit.ts` | Submit command |
| `src/control-plane/commands/status.ts` | Status command |
| `src/control-plane/commands/list.ts` | List command |
| `src/control-plane/commands/cancel.ts` | Cancel command |
| `src/control-plane/commands/daemon.ts` | Daemon commands |
| `src/control-plane/work-order-service.ts` | Work order logic |
| `src/control-plane/work-order-store.ts` | Persistence |
| `src/control-plane/validators.ts` | Input validation |
| `src/control-plane/formatter.ts` | Output formatting |

#### Workspace Manager (Module B)
| File | Purpose |
|------|---------|
| `src/workspace/manager.ts` | Workspace lifecycle |
| `src/workspace/lease.ts` | Lease management |
| `src/workspace/git-ops.ts` | Git operations |
| `src/workspace/path-policy.ts` | Path enforcement |
| `src/workspace/workspace-store.ts` | Persistence |
| `src/workspace/checkout.ts` | Clean checkout |

#### Agent Driver (Module C)
| File | Purpose |
|------|---------|
| `src/agent/driver.ts` | Abstract interface |
| `src/agent/registry.ts` | Driver registry |
| `src/agent/claude-code-driver.ts` | Claude Code impl |
| `src/agent/command-builder.ts` | CLI args builder |
| `src/agent/output-parser.ts` | Response parsing |
| `src/agent/constraints.ts` | Constraint system |
| `src/agent/defaults.ts` | Default constraints |

#### Gate Resolver (Module D)
| File | Purpose |
|------|---------|
| `src/gate/verify-profile-schema.ts` | Profile schema |
| `src/gate/verify-profile-parser.ts` | Profile parser |
| `src/gate/ci-ingestion.ts` | CI ingestion |
| `src/gate/github-actions-parser.ts` | GHA parser |
| `src/gate/plan.ts` | Internal format |
| `src/gate/normalizer.ts` | Normalization |
| `src/gate/resolver.ts` | Resolution logic |
| `src/gate/summary.ts` | Human summary |
| `src/gate/errors.ts` | Error types |

#### Snapshotter (Module E)
| File | Purpose |
|------|---------|
| `src/snapshot/snapshotter.ts` | Main service |
| `src/snapshot/git-snapshot.ts` | Git operations |
| `src/snapshot/snapshot-store.ts` | Persistence |

#### Verifier (Module F)
| File | Purpose |
|------|---------|
| `src/verifier/verifier.ts` | Main orchestrator |
| `src/verifier/clean-room.ts` | Environment mgmt |
| `src/verifier/environments/node.ts` | Node.js setup |
| `src/verifier/environments/python.ts` | Python setup |
| `src/verifier/environments/generic.ts` | Generic setup |
| `src/verifier/l0-contracts.ts` | Contract checks |
| `src/verifier/l1-tests.ts` | Test execution |
| `src/verifier/l2-blackbox.ts` | Black-box tests |
| `src/verifier/l3-sanity.ts` | Sanity checks |
| `src/verifier/assertions.ts` | Assertion types |

#### Feedback Generator (Module G)
| File | Purpose |
|------|---------|
| `src/feedback/types.ts` | Type definitions |
| `src/feedback/generator.ts` | Main generator |
| `src/feedback/formatter.ts` | Output formats |
| `src/feedback/suggestions.ts` | Suggestion engine |

#### Artifact Store (Module H)
| File | Purpose |
|------|---------|
| `src/artifacts/paths.ts` | Path generation |
| `src/artifacts/store.ts` | Storage service |
| `src/artifacts/json.ts` | JSON utilities |
| `src/artifacts/summary.ts` | Summary generation |
| `src/artifacts/cleanup.ts` | Cleanup service |

#### Orchestrator
| File | Purpose |
|------|---------|
| `src/orchestrator/state-machine.ts` | State machine |
| `src/orchestrator/run-executor.ts` | Execution loop |
| `src/orchestrator/queue.ts` | Work order queue |
| `src/orchestrator/daemon.ts` | Daemon process |

#### Types
| File | Purpose |
|------|---------|
| `src/types/work-order.ts` | WorkOrder types |
| `src/types/workspace.ts` | Workspace types |
| `src/types/run.ts` | Run types |
| `src/types/snapshot.ts` | Snapshot types |
| `src/types/gate-plan.ts` | GatePlan types |
| `src/types/verification.ts` | Verification types |
| `src/types/agent.ts` | Agent types |
| `src/types/state.ts` | State machine types |
| `src/types/summary.ts` | Summary types |

#### Utilities
| File | Purpose |
|------|---------|
| `src/utils/logger.ts` | Logging setup |
| `src/utils/temp.ts` | Temp directories |
| `src/app.ts` | Module wiring |
| `src/config.ts` | Configuration |

---

## Implementation Checklist

### Phase 1: Foundation (Thrusts 1-4)

- [ ] **Thrust 1: Project Setup**
  - [ ] Initialize package.json
  - [ ] Configure TypeScript
  - [ ] Install dependencies
  - [ ] Create type definitions
  - [ ] Create index barrel

- [ ] **Thrust 2: CLI Framework**
  - [ ] Create CLI entry point
  - [ ] Implement submit command
  - [ ] Implement status command
  - [ ] Implement list command
  - [ ] Implement cancel command

- [ ] **Thrust 3: Work Order Service**
  - [ ] Create service class
  - [ ] Implement validation
  - [ ] Implement persistence
  - [ ] Set up logging

- [ ] **Thrust 4: CLI Formatting**
  - [ ] Create formatter module
  - [ ] Implement status colors
  - [ ] Add progress indicators

### Phase 2: Workspace & Agent (Thrusts 5-11)

- [ ] **Thrust 5: Workspace Lifecycle**
  - [ ] Create workspace manager
  - [ ] Implement source handlers
  - [ ] Create git operations
  - [ ] Implement persistence

- [ ] **Thrust 6: Workspace Leasing**
  - [ ] Create lease manager
  - [ ] Implement persistence
  - [ ] Add heartbeat
  - [ ] Integrate with manager

- [ ] **Thrust 7: Path Policy**
  - [ ] Create policy module
  - [ ] Implement validation
  - [ ] Add forbidden detection
  - [ ] Create policy config

- [ ] **Thrust 8: Clean Checkout**
  - [ ] Implement extraction
  - [ ] Create temp management
  - [ ] Add cleanup

- [ ] **Thrust 9: Driver Interface**
  - [ ] Define interface
  - [ ] Define context pointers
  - [ ] Create registry

- [ ] **Thrust 10: Claude Code Driver**
  - [ ] Create driver class
  - [ ] Build command args
  - [ ] Implement execution
  - [ ] Parse output
  - [ ] Support sessions

- [ ] **Thrust 11: Constraints**
  - [ ] Define types
  - [ ] Create defaults
  - [ ] Implement merging
  - [ ] Validate conflicts

### Phase 3: Gate & Snapshot (Thrusts 12-17)

- [ ] **Thrust 12: Verify Profile**
  - [ ] Define schema
  - [ ] Implement parser
  - [ ] Handle errors

- [ ] **Thrust 13: CI Ingestion**
  - [ ] Create ingestion module
  - [ ] Parse GitHub Actions
  - [ ] Detect unsupported

- [ ] **Thrust 14: Gate Normalizer**
  - [ ] Define internal format
  - [ ] Create normalizer
  - [ ] Implement resolver
  - [ ] Generate summary

- [ ] **Thrust 15: Snapshot Capture**
  - [ ] Create service
  - [ ] Capture before state
  - [ ] Capture after state
  - [ ] Generate patch

- [ ] **Thrust 16: Git Snapshot Ops**
  - [ ] Create commit
  - [ ] Get diff stats
  - [ ] Handle edge cases

- [ ] **Thrust 17: Snapshot Storage**
  - [ ] Create store
  - [ ] Implement validation
  - [ ] Link to runs

### Phase 4: Verification (Thrusts 18-23)

- [ ] **Thrust 18: Clean-Room**
  - [ ] Create manager
  - [ ] Extract snapshots
  - [ ] Set up Node.js
  - [ ] Set up Python
  - [ ] Isolate network

- [ ] **Thrust 19: L0 Contracts**
  - [ ] Create verifier
  - [ ] Check required files
  - [ ] Validate schemas
  - [ ] Check forbidden
  - [ ] Check naming

- [ ] **Thrust 20: L1 Tests**
  - [ ] Create verifier
  - [ ] Execute commands
  - [ ] Handle timeouts
  - [ ] Parse output

- [ ] **Thrust 21: L2 Black-Box**
  - [ ] Create verifier
  - [ ] Load fixtures
  - [ ] Implement assertions
  - [ ] Execute tests

- [ ] **Thrust 22: L3 Sanity**
  - [ ] Create verifier
  - [ ] Check isolation
  - [ ] Check resources
  - [ ] Check artifacts

- [ ] **Thrust 23: Orchestration**
  - [ ] Create orchestrator
  - [ ] Implement early exit
  - [ ] Add logging
  - [ ] Generate report

### Phase 5: Feedback & Artifacts (Thrusts 24-31)

- [ ] **Thrust 24: Feedback Structure**
  - [ ] Define types

- [ ] **Thrust 25: Feedback Generation**
  - [ ] Create generator
  - [ ] Extract L0 failures
  - [ ] Extract L1 failures
  - [ ] Extract L2 failures
  - [ ] Extract L3 failures

- [ ] **Thrust 26: Feedback Formatting**
  - [ ] Create formatter
  - [ ] Agent format
  - [ ] Truncation logic

- [ ] **Thrust 27: Suggestions**
  - [ ] Create engine
  - [ ] Define patterns
  - [ ] Match failures

- [ ] **Thrust 28: Directory Layout**
  - [ ] Define structure
  - [ ] Create path generator
  - [ ] Ensure directories

- [ ] **Thrust 29: Artifact Store**
  - [ ] Create store
  - [ ] Implement save
  - [ ] Implement load
  - [ ] Implement list

- [ ] **Thrust 30: Run Summary**
  - [ ] Define structure
  - [ ] Create generator
  - [ ] Format report

- [ ] **Thrust 31: Cleanup**
  - [ ] Create service
  - [ ] Implement policy
  - [ ] Safe deletion

### Phase 6: Integration (Thrusts 32-36)

- [ ] **Thrust 32: State Machine**
  - [ ] Define states
  - [ ] Define transitions
  - [ ] Implement logic
  - [ ] Add persistence
  - [ ] Handle recovery

- [ ] **Thrust 33: Run Executor**
  - [ ] Create executor
  - [ ] Implement loop
  - [ ] Implement iteration
  - [ ] Add cancellation
  - [ ] Handle errors

- [ ] **Thrust 34: Queue**
  - [ ] Create manager
  - [ ] Per-workspace queuing
  - [ ] Persistence
  - [ ] Events

- [ ] **Thrust 35: Daemon**
  - [ ] Create entry point
  - [ ] Process loop
  - [ ] Signal handling
  - [ ] Health check
  - [ ] CLI integration

- [ ] **Thrust 36: Full Integration**
  - [ ] Wire modules
  - [ ] Update CLI
  - [ ] Configuration
  - [ ] Manual test

### Phase 7: Testing (Thrusts 37-41)

- [ ] **Thrust 37: Toy Repo**
  - [ ] Create structure
  - [ ] Implement modules
  - [ ] Write tests
  - [ ] Create fixtures
  - [ ] Write verify.yaml

- [ ] **Thrust 38: E2E Scenarios**
  - [ ] Happy path
  - [ ] Unit test failure
  - [ ] Contract violation
  - [ ] Black-box regression
  - [ ] Iterative repair

- [ ] **Thrust 39: Fault Injection**
  - [ ] Daemon kill
  - [ ] Concurrent workspace
  - [ ] Path escape
  - [ ] Agent timeout
  - [ ] Disk full

- [ ] **Thrust 40: Unit Tests**
  - [ ] Control plane tests
  - [ ] Workspace tests
  - [ ] Agent tests
  - [ ] Gate tests
  - [ ] Snapshot tests
  - [ ] Verifier tests
  - [ ] Feedback tests
  - [ ] Artifact tests
  - [ ] Orchestrator tests

- [ ] **Thrust 41: Acceptance**
  - [ ] Complete artifacts
  - [ ] Reproducible verification
  - [ ] No corruption
  - [ ] Actionable failures
  - [ ] Budget respected

---

## verify.yaml Schema Reference

```yaml
# Version of the verify profile schema
version: "1"

# Project name
name: string

# Environment configuration
environment:
  runtime: "node" | "python" | "generic"
  version: string (optional)
  setup:
    - string[]  # Setup commands

# Contract checks (L0)
contracts:
  required_files:
    - string[]  # File paths or globs
  required_schemas:
    - file: string
      schema: "json" | "yaml"
      rules:
        - has_field: string
        - field_type: { field: string, type: string }
        - matches_regex: { field: string, pattern: string }
        - json_schema: string (path to schema file)
  forbidden_patterns:
    - string[]  # Globs for forbidden files
  naming_conventions:
    - pattern: string
      rule: "kebab-case" | "snake_case" | "camelCase"

# Test commands (L1)
tests:
  - name: string
    command: string
    timeout: number (seconds)
    expected_exit: number (default: 0)

# Black-box tests (L2)
blackbox:
  - name: string
    fixture: string (path)
    command: string ({input} placeholder)
    assertions:
      - type: "exit_code"
        expected: number
      - type: "json_schema"
        schema: string (path)
      - type: "contains"
        value: string
      - type: "matches_regex"
        pattern: string
      - type: "equals_file"
        file: string (path)
      - type: "json_equals"
        expected: object | string (path)

# Execution policy
policy:
  network: boolean (default: false)
  max_runtime: number (seconds)
  max_disk_mb: number (optional)
  disallowed_commands:
    - string[]  # Patterns for blocked commands
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTGATE_ROOT` | Override ~/.agentgate | `~/.agentgate` |
| `AGENTGATE_LOG_LEVEL` | Log verbosity | `info` |
| `AGENTGATE_POLL_INTERVAL` | Queue poll interval (ms) | `1000` |
| `AGENTGATE_DEFAULT_TIMEOUT` | Default work order timeout | `3600` |
| `AGENTGATE_MAX_ITERATIONS` | Default max iterations | `3` |
| `CLAUDE_CODE_PATH` | Path to Claude Code binary | `claude` |

---

## Troubleshooting

### Common Issues

**"Workspace already leased"**
- Another run is using the workspace
- Wait for completion or cancel the other run
- Check for stale leases: `ls ~/.agentgate/leases/`

**"Claude Code not found"**
- Ensure Claude Code CLI is installed
- Check PATH includes claude binary
- Set `CLAUDE_CODE_PATH` if needed

**"Verification failed at L0"**
- Check required files exist
- Remove forbidden files
- Verify schema compliance

**"Agent timeout"**
- Increase timeout in work order
- Simplify task
- Check for infinite loops

**"Clean-room setup failed"**
- Check Node.js/Python version
- Verify network access for package install
- Check disk space

---

## Glossary

| Term | Definition |
|------|------------|
| **Work Order** | Request to perform a task in a workspace |
| **Workspace** | Directory with git repo where agent operates |
| **Run** | Single attempt to satisfy a work order |
| **Iteration** | One BUILD → SNAPSHOT → VERIFY cycle |
| **Snapshot** | Immutable state captured as git SHA |
| **Gate Plan** | Specification of verification requirements |
| **Clean-Room** | Isolated environment for verification |
| **Lease** | Exclusive lock on a workspace |
| **Driver** | Implementation that runs a specific agent |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2025-01 | Initial MVP |

---

*End of DevGuide v0.1.0*
