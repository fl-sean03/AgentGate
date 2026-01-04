# 06: Appendices

Reference materials for DevGuide v0.2.27 implementation.

---

## Appendix A: Master Completion Checklist

### Phase 1: Critical Infrastructure

| Thrust | Name | Status | Verified By | Date |
|--------|------|--------|-------------|------|
| 1 | Write-Ahead State Persistence | [ ] | | |
| 2 | AbortSignal-Based Timeout System | [ ] | | |
| 3 | Atomic Graceful Shutdown | [ ] | | |
| 4 | Guaranteed Sandbox Cleanup | [ ] | | |
| 5 | Merge Conflict Detection | [ ] | | |

**Phase 1 Integration Tests:**
- [ ] Crash recovery with WAL replay
- [ ] Timeout with clean abort
- [ ] Graceful shutdown with SIGTERM
- [ ] Orphan cleanup after SIGKILL
- [ ] Conflict detection with diverged branches

### Phase 2: Robustness & Recovery

| Thrust | Name | Status | Verified By | Date |
|--------|------|--------|-------------|------|
| 6 | Error Propagation Framework | [ ] | | |
| 7 | GitHub Rate Limit Handling | [ ] | | |
| 8 | Process Tracking Persistence | [ ] | | |
| 9 | Deadlock Detection for Spawning | [ ] | | |
| 10 | Resource Limit Enforcement | [ ] | | |

**Phase 2 Integration Tests:**
- [ ] Error propagation through full execution
- [ ] Rate limit backoff and retry
- [ ] Process recovery after crash
- [ ] Spawn cycle detection
- [ ] Memory limit enforcement

### Phase 3: Extensibility

| Thrust | Name | Status | Verified By | Date |
|--------|------|--------|-------------|------|
| 11 | Configuration Registry System | [ ] | | |
| 12 | Plugin Architecture Foundation | [ ] | | |
| 13 | Event Bus for Observability | [ ] | | |
| 14 | Custom Gate Type Support | [ ] | | |
| 15 | Agent Capability Negotiation | [ ] | | |

**Phase 3 Integration Tests:**
- [ ] Config hot reload
- [ ] Plugin load/unload cycle
- [ ] Event emission and handling
- [ ] Custom gate execution
- [ ] Capability-based agent selection

### Phase 4: Developer Experience

| Thrust | Name | Status | Verified By | Date |
|--------|------|--------|-------------|------|
| 16 | Comprehensive CLAUDE.md | [ ] | | |
| 17 | Enhanced Feedback Generator | [ ] | | |
| 18 | Structured Logging Overhaul | [ ] | | |
| 19 | Debug Mode & Dry Runs | [ ] | | |
| 20 | Interactive Development Server | [ ] | | |

**Phase 4 Integration Tests:**
- [ ] Agent understands codebase from CLAUDE.md
- [ ] Feedback under 8KB with prioritization
- [ ] Log correlation across components
- [ ] Dry run produces no side effects
- [ ] Hot reload preserves running work

---

## Appendix B: Complete File Index

### Files Created

| File | Thrust | Purpose |
|------|--------|---------|
| `src/orchestrator/wal.ts` | 1 | Write-ahead log implementation |
| `src/orchestrator/wal.test.ts` | 1 | WAL unit tests |
| `src/utils/timeout.ts` | 2 | Timeout utilities with AbortSignal |
| `src/utils/timeout.test.ts` | 2 | Timeout unit tests |
| `src/control-plane/shutdown-manager.ts` | 3 | Graceful shutdown orchestration |
| `src/control-plane/shutdown-manager.test.ts` | 3 | Shutdown tests |
| `src/sandbox/registry.ts` | 4 | Persistent sandbox tracking |
| `src/sandbox/registry.test.ts` | 4 | Registry unit tests |
| `src/sandbox/orphan-detector.ts` | 4 | Orphan detection and cleanup |
| `src/sandbox/orphan-detector.test.ts` | 4 | Orphan detector tests |
| `src/control-plane/commands/cleanup.ts` | 4 | Cleanup CLI command |
| `src/delivery/conflict-detector.ts` | 5 | Git conflict detection |
| `src/delivery/conflict-detector.test.ts` | 5 | Conflict detection tests |
| `src/feedback/conflict-formatter.ts` | 5 | Format conflict feedback |
| `test/delivery/conflict-scenarios.test.ts` | 5 | Conflict integration tests |
| `src/errors/index.ts` | 6 | Error base classes |
| `src/errors/codes.ts` | 6 | Error code registry |
| `src/errors/factory.ts` | 6 | Error creation utilities |
| `src/errors/errors.test.ts` | 6 | Error system tests |
| `src/github/rate-limiter.ts` | 7 | Rate limit tracking |
| `src/github/retry.ts` | 7 | Retry with backoff |
| `src/github/client.ts` | 7 | Wrapped GitHub client |
| `src/github/rate-limiter.test.ts` | 7 | Rate limiter tests |
| `src/control-plane/process-registry.ts` | 8 | Persistent process tracking |
| `src/control-plane/process-registry.test.ts` | 8 | Registry tests |
| `src/control-plane/commands/processes.ts` | 8 | Process list command |
| `src/orchestrator/spawn-tracker.ts` | 9 | Spawn relationship tracking |
| `src/orchestrator/spawn-tracker.test.ts` | 9 | Spawn tracker tests |
| `src/orchestrator/resource-allocator.ts` | 9 | Resource allocation |
| `src/sandbox/resource-monitor.ts` | 10 | Resource monitoring |
| `src/sandbox/resource-monitor.test.ts` | 10 | Monitor tests |
| `src/feedback/resource-formatter.ts` | 10 | Resource limit feedback |
| `src/config/schema.ts` | 11 | Configuration schema |
| `src/config/registry.ts` | 11 | Configuration registry |
| `src/config/loader.ts` | 11 | Configuration loader |
| `src/config/registry.test.ts` | 11 | Registry tests |
| `src/server/routes/config.ts` | 11 | Config API endpoints |
| `src/control-plane/commands/config.ts` | 11 | Config CLI commands |
| `src/plugins/types.ts` | 12 | Plugin interfaces |
| `src/plugins/manager.ts` | 12 | Plugin lifecycle management |
| `src/plugins/manager.test.ts` | 12 | Plugin manager tests |
| `src/plugins/discovery.ts` | 12 | Plugin discovery |
| `src/plugins/extension-points.ts` | 12 | Extension point registry |
| `src/control-plane/commands/plugins.ts` | 12 | Plugin CLI commands |
| `examples/plugins/hello-world/` | 12 | Example plugin |
| `src/events/bus.ts` | 13 | Event bus implementation |
| `src/events/types.ts` | 13 | Event type definitions |
| `src/events/bus.test.ts` | 13 | Event bus tests |
| `src/events/logger.ts` | 13 | Event logging handler |
| `src/events/metrics.ts` | 13 | Metrics collection |
| `src/server/routes/metrics.ts` | 13 | Metrics endpoint |
| `src/gate/registry.ts` | 14 | Gate type registry |
| `src/gate/registry.test.ts` | 14 | Registry tests |
| `src/gate/builder.ts` | 14 | Gate plan builder |
| `src/gate/aggregator.ts` | 14 | Result aggregation |
| `examples/gates/` | 14 | Example custom gates |
| `src/agent/capabilities.ts` | 15 | Capability definitions |
| `src/agent/matcher.ts` | 15 | Capability matching |
| `src/agent/matcher.test.ts` | 15 | Matcher tests |
| `src/server/routes/agents.ts` | 15 | Capabilities endpoint |
| `CLAUDE.md` | 16 | Agent context document |
| `docs/CLAUDE-detailed.md` | 16 | Extended reference |
| `packages/server/CLAUDE.md` | 16 | Server-specific context |
| `src/feedback/prioritizer.ts` | 17 | Priority calculation |
| `src/feedback/deduplicator.ts` | 17 | Root cause grouping |
| `src/feedback/truncator.ts` | 17 | Smart truncation |
| `src/feedback/patterns.ts` | 17 | Error pattern database |
| `src/feedback/suggestions.ts` | 17 | Fix suggestions |
| `src/utils/logger-factory.ts` | 18 | Logger creation |
| `src/utils/correlation.ts` | 18 | Correlation ID management |
| `src/control-plane/debug-mode.ts` | 19 | Debug mode implementation |
| `src/control-plane/dry-run.ts` | 19 | Dry run execution |
| `src/control-plane/artifacts.ts` | 19 | Artifact management |
| `src/control-plane/commands/step.ts` | 19 | Step command |
| `src/control-plane/commands/inspect.ts` | 19 | Inspect command |
| `src/control-plane/commands/artifacts.ts` | 19 | Artifacts command |
| `src/control-plane/commands/replay.ts` | 19 | Replay command |
| `src/control-plane/dev-mode.ts` | 20 | Development mode setup |
| `src/control-plane/hot-reload.ts` | 20 | Hot reload implementation |
| `src/control-plane/repl.ts` | 20 | REPL implementation |
| `src/control-plane/commands/repl.ts` | 20 | REPL command |
| `src/control-plane/commands/test-harness.ts` | 20 | Harness testing |
| `src/server/routes/dev.ts` | 20 | Dev dashboard routes |
| `src/server/views/dev-dashboard.html` | 20 | Dashboard UI |
| `src/mocks/github-mock.ts` | 20 | GitHub mock |
| `src/mocks/docker-mock.ts` | 20 | Docker mock |
| `src/mocks/agent-mock.ts` | 20 | Agent mock |
| `docs/development/` | 20 | Development documentation |

### Files Modified

| File | Thrusts | Changes |
|------|---------|---------|
| `src/orchestrator/state-machine.ts` | 1, 3 | WAL integration, INTERRUPTED state |
| `src/orchestrator/orchestrator.ts` | 1, 3, 9, 13 | WAL, shutdown, spawn validation, events |
| `src/config/index.ts` | 1, 7, 10, 11 | WAL, rate limit, resource, registry config |
| `src/types/config.ts` | 1, 10 | WAL, resource config types |
| `src/sandbox/docker-provider.ts` | 2, 4, 10 | AbortSignal, registry, limits |
| `src/sandbox/subprocess-provider.ts` | 2, 4, 10 | AbortSignal, registry, limits |
| `src/queue/execution-manager.ts` | 2, 6 | AbortSignal, typed errors |
| `src/agent/claude-code-driver.ts` | 2, 15 | AbortSignal, capabilities |
| `src/agent/claude-code-subscription-driver.ts` | 2, 15 | AbortSignal, capabilities |
| `src/verifier/runner.ts` | 2, 13 | AbortSignal, events |
| `src/sandbox/manager.ts` | 3, 4 | Shutdown, registry |
| `src/control-plane/agent-process-manager.ts` | 3, 8 | Shutdown, registry |
| `src/control-plane/commands/serve.ts` | 3 | Shutdown manager |
| `src/types/run.ts` | 3 | INTERRUPTED state |
| `src/delivery/git-handler.ts` | 5, 6 | Conflict detection, errors |
| `src/types/harness-config.ts` | 5, 9, 15 | Conflict, spawn, capability config |
| `src/utils/logger.ts` | 6, 18 | Error logging, factory |
| `src/server/middleware/error-handler.ts` | 6 | Structured errors |
| `src/sandbox/*.ts` | 6 | Error context |
| `src/delivery/*.ts` | 6 | Replace empty catches |
| `src/workspace/github.ts` | 7 | Wrapped client |
| `src/delivery/pr-handler.ts` | 7 | Wrapped client |
| `src/github/workflow-monitor.ts` | 7 | Wrapped client |
| `src/workspace/lock-manager.ts` | 9 | Lock ordering |
| `src/execution/engine.ts` | 13 | Emit events |
| `src/gate/types.ts` | 14 | Gate type interface |
| `src/types/gate-plan.ts` | 14 | Custom gate support |
| `src/feedback/generator.ts` | 17 | Prioritization, deduplication |
| `src/feedback/generator.test.ts` | 17 | New test cases |
| `src/types/work-order.ts` | 19 | Debug/dryRun flags |

---

## Appendix C: Architecture Diagrams

### C.1 Target State Machine

```
                                    ┌─────────┐
                                    │ QUEUED  │
                                    └────┬────┘
                                         │ lease acquired
                                         ▼
                                    ┌─────────┐
                                    │ LEASED  │
                                    └────┬────┘
                                         │ workspace ready
                                         ▼
                              ┌─────────────────────┐
                              │      BUILDING       │◄─────────────────┐
                              └──────────┬──────────┘                  │
                                         │ agent complete              │
                                         ▼                             │
                              ┌─────────────────────┐                  │
                              │    SNAPSHOTTING     │                  │
                              └──────────┬──────────┘                  │
                                         │ snapshot created            │
                                         ▼                             │
                              ┌─────────────────────┐                  │
                              │      VERIFYING      │                  │
                              └──────────┬──────────┘                  │
                                         │                             │
                        ┌────────────────┼────────────────┐            │
                        │                │                │            │
                        ▼                ▼                ▼            │
                   ┌─────────┐    ┌───────────┐    ┌───────────┐      │
                   │SUCCEEDED│    │  FEEDBACK │────│CI_POLLING │      │
                   └────┬────┘    └─────┬─────┘    └───────────┘      │
                        │               │                              │
                        │               │ iterations remain            │
                        │               └──────────────────────────────┘
                        │
                        ▼
                   ┌──────────┐
                   │PR_CREATED│
                   └──────────┘

                              ┌─────────────┐
          From any state ────►│ INTERRUPTED │◄──── On SIGTERM/shutdown
                              └──────┬──────┘
                                     │ resume
                                     ▼
                                ┌─────────┐
                                │ QUEUED  │
                                └─────────┘

Terminal States: SUCCEEDED, FAILED, CANCELED
Recoverable State: INTERRUPTED
```

### C.2 WAL Integration Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        State Transition                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Intent             2. Execute          3. Complete               │
│  ┌──────────┐         ┌──────────┐        ┌──────────┐             │
│  │  Write   │         │  Apply   │        │  Mark    │             │
│  │  WAL     │────────►│Transition│───────►│  WAL     │             │
│  │  Entry   │         │          │        │ Complete │             │
│  └──────────┘         └──────────┘        └──────────┘             │
│       │                     │                   │                    │
│       ▼                     ▼                   ▼                    │
│  ┌──────────┐         ┌──────────┐        ┌──────────┐             │
│  │  PENDING │         │  State   │        │ APPLIED  │             │
│  │          │         │  File    │        │          │             │
│  └──────────┘         └──────────┘        └──────────┘             │
│                                                                      │
│  On Crash: Replay PENDING entries on startup                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### C.3 Shutdown Sequence

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Graceful Shutdown                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  SIGTERM Received                                                    │
│       │                                                              │
│       ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Phase 1: Stop Accepting Work (Priority 100+)                 │  │
│  │  - Close HTTP listener                                        │  │
│  │  - Reject new work orders                                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│       │ (immediate)                                                  │
│       ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Phase 2: Complete In-Flight (Priority 95)                   │  │
│  │  - Wait for active requests (30s timeout)                     │  │
│  │  - Send SIGTERM to agent processes                            │  │
│  │  - Wait for graceful exit (10s)                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│       │ (timeout or complete)                                        │
│       ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Phase 3: Force Cleanup (Priority 90)                        │  │
│  │  - SIGKILL remaining processes                                │  │
│  │  - Force terminate containers                                 │  │
│  │  - Mark runs as INTERRUPTED                                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│       │ (immediate)                                                  │
│       ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Phase 4: Persist State (Priority 50)                        │  │
│  │  - Flush WAL entries                                          │  │
│  │  - Save registries                                            │  │
│  │  - Close file handles                                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│       │ (5s timeout)                                                 │
│       ▼                                                              │
│  Exit with code 0 (or 1 if timeout exceeded)                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### C.4 Error Propagation

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Error Flow                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Original Error                                                      │
│       │                                                              │
│       ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  wrapError(code, originalError, context)                      │  │
│  │                                                                │  │
│  │  {                                                             │  │
│  │    code: "SANDBOX_CREATION_FAILED",                           │  │
│  │    message: "Failed to create Docker container",              │  │
│  │    context: { image: "node:18", runId: "abc123" },            │  │
│  │    recoverable: true,                                          │  │
│  │    cause: originalError                                        │  │
│  │  }                                                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│       │                                                              │
│       ├──────────────────────────────────────────┐                  │
│       │                                          │                  │
│       ▼                                          ▼                  │
│  ┌──────────────┐                       ┌──────────────┐           │
│  │    Logger    │                       │  API Response│           │
│  │              │                       │              │           │
│  │  [ERROR]     │                       │  HTTP 500    │           │
│  │  code=...    │                       │  { code,     │           │
│  │  context=... │                       │    message,  │           │
│  │  stack=...   │                       │    context } │           │
│  └──────────────┘                       └──────────────┘           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### C.5 Plugin Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Plugin System                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      Plugin Manager                           │  │
│  │  - Load/unload plugins                                        │  │
│  │  - Dependency resolution                                      │  │
│  │  - Lifecycle management                                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│              ┌───────────────┼───────────────┐                      │
│              ▼               ▼               ▼                      │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐          │
│  │ Extension Point│ │ Extension Point│ │ Extension Point│          │
│  │  agent-driver  │ │ gate-runner    │ │ feedback-fmt   │          │
│  └────────────────┘ └────────────────┘ └────────────────┘          │
│              │               │               │                      │
│              ▼               ▼               ▼                      │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐          │
│  │   Plugin A     │ │   Plugin B     │ │   Plugin C     │          │
│  │ Custom Agent   │ │ Security Gate  │ │ Slack Notify   │          │
│  └────────────────┘ └────────────────┘ └────────────────┘          │
│                                                                      │
│  Plugin Context provides:                                            │
│  - Configuration registry access                                     │
│  - Event bus subscription                                            │
│  - Scoped logger                                                     │
│  - Extension point registration                                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Appendix D: Configuration Reference

### D.1 WAL Configuration

```yaml
wal:
  enabled: true                    # Enable write-ahead logging
  directory: ~/.agentgate/wal     # WAL storage location
  retentionDays: 7                # Keep completed entries for N days
  maxEntries: 1000                # Compact after N entries per run
```

### D.2 Timeout Configuration

```yaml
timeouts:
  build: 600000                   # Build phase (10 min)
  snapshot: 60000                 # Snapshot phase (1 min)
  verify: 300000                  # Verify phase (5 min)
  overall: 1800000                # Total run time (30 min)
  gracefulShutdown: 60000         # Shutdown timeout (1 min)
```

### D.3 Resource Limits

```yaml
resources:
  memory:
    limit: 4294967296             # 4GB per sandbox
    warning: 0.8                  # Warn at 80%
  cpu:
    limit: 2                      # 2 CPU cores
  disk:
    limit: 10737418240            # 10GB writes
  files:
    limit: 1000                   # Max open handles
```

### D.4 GitHub Rate Limiting

```yaml
github:
  rateLimit:
    enabled: true
    reservePercent: 10            # Keep 10% buffer
    maxRetries: 5
    baseDelayMs: 1000
```

### D.5 Logging Configuration

```yaml
logging:
  level: INFO                     # Minimum level
  format: pretty                  # pretty | json
  file: null                      # Optional file path
  components:                     # Per-component overrides
    orchestrator: DEBUG
    sandbox: INFO
  redact:                         # Fields to redact
    - password
    - token
    - secret
```

### D.6 Spawn Limits

```yaml
spawning:
  maxDepth: 3                     # Max tree depth
  maxChildren: 5                  # Max children per parent
  maxTotal: 20                    # Max total descendants
  timeoutMultiplier: 0.5          # Reduce timeout per level
```

---

## Appendix E: Error Codes Reference

### E.1 Configuration Errors (CONFIG_*)

| Code | Message | Recoverable |
|------|---------|-------------|
| CONFIG_INVALID | Invalid configuration value | No |
| CONFIG_MISSING | Required configuration missing | No |
| CONFIG_PARSE_ERROR | Failed to parse configuration file | No |

### E.2 Execution Errors (EXEC_*)

| Code | Message | Recoverable |
|------|---------|-------------|
| EXEC_TIMEOUT | Execution exceeded time limit | No |
| EXEC_ABORTED | Execution was aborted | No |
| EXEC_FAILED | Execution failed | Maybe |

### E.3 Sandbox Errors (SANDBOX_*)

| Code | Message | Recoverable |
|------|---------|-------------|
| SANDBOX_CREATION_FAILED | Failed to create sandbox | Yes |
| SANDBOX_EXECUTION_FAILED | Sandbox execution failed | Maybe |
| SANDBOX_CLEANUP_FAILED | Failed to cleanup sandbox | Yes |
| SANDBOX_TIMEOUT | Sandbox operation timed out | Yes |

### E.4 External Service Errors (EXTERNAL_*)

| Code | Message | Recoverable |
|------|---------|-------------|
| GITHUB_RATE_LIMITED | GitHub API rate limit exceeded | Yes |
| GITHUB_AUTH_FAILED | GitHub authentication failed | No |
| GITHUB_NOT_FOUND | GitHub resource not found | No |
| DOCKER_UNAVAILABLE | Docker daemon unavailable | Yes |

### E.5 Resource Errors (RESOURCE_*)

| Code | Message | Recoverable |
|------|---------|-------------|
| RESOURCE_NOT_FOUND | Requested resource not found | No |
| RESOURCE_EXHAUSTED | Resource limit exceeded | No |
| RESOURCE_LOCKED | Resource is locked by another process | Yes |

### E.6 Git Errors (GIT_*)

| Code | Message | Recoverable |
|------|---------|-------------|
| GIT_CONFLICT | Git merge conflict detected | Maybe |
| GIT_PUSH_FAILED | Git push failed | Maybe |
| GIT_CLONE_FAILED | Git clone failed | Yes |

---

## Appendix F: CLI Commands Reference

### F.1 New Commands Added

```bash
# Thrust 4: Cleanup
agentgate cleanup [--dry-run] [--force] [--type docker|subprocess|all]

# Thrust 8: Process Management
agentgate processes [--kill <id>] [--cleanup]

# Thrust 11: Configuration
agentgate config get <path>
agentgate config set <path> <value>
agentgate config list
agentgate config reset
agentgate config validate

# Thrust 12: Plugins
agentgate plugins list
agentgate plugins install <package>
agentgate plugins uninstall <name>
agentgate plugins enable <name>
agentgate plugins disable <name>

# Thrust 19: Debug
agentgate step <runId>
agentgate inspect <runId>
agentgate artifacts <runId> [type]
agentgate replay <runId> [--from <state>] [--mock-agent]

# Thrust 20: Development
agentgate repl
agentgate test-harness <profile> [--sample]
```

### F.2 New Flags Added

```bash
# Debug mode
agentgate serve --debug
agentgate submit --debug <workorder.yaml>

# Dry run mode
agentgate submit --dry-run <workorder.yaml>

# Development mode
agentgate serve --dev

# Mock modes
agentgate serve --mock-github --mock-docker --mock-agent
```

---

## Appendix G: API Endpoints Reference

### G.1 New Endpoints Added

```
# Thrust 11: Configuration
GET  /api/v1/config
PATCH /api/v1/config
POST /api/v1/config/reset

# Thrust 13: Metrics
GET /api/v1/metrics

# Thrust 15: Agent Capabilities
GET /api/v1/agents/capabilities

# Thrust 20: Development Dashboard
GET /dev (when --dev mode)
```

---

## Appendix H: Testing Guidelines

### H.1 Running Tests

```bash
# All tests
pnpm test

# Specific file
pnpm test -- src/orchestrator/wal.test.ts

# Pattern matching
pnpm test -- --grep "WAL"

# With coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

### H.2 Test Categories

| Category | Location | Purpose |
|----------|----------|---------|
| Unit | `src/**/*.test.ts` | Individual functions |
| Integration | `test/**/*.test.ts` | Cross-module flows |
| E2E | `test/e2e/*.test.ts` | Full system tests |

### H.3 Writing Tests for New Features

Each thrust requires tests covering:

1. **Happy path**: Normal operation succeeds
2. **Error cases**: Proper error handling
3. **Edge cases**: Boundary conditions
4. **Recovery**: Crash recovery where applicable

---

## Appendix I: Glossary

| Term | Definition |
|------|------------|
| **Dog Fooding** | Using AgentGate to improve AgentGate itself |
| **Gate** | A verification check that code must pass |
| **Harness** | Configuration for how to run and verify tasks |
| **Iteration** | One cycle of agent work + verification |
| **Run** | An execution of a work order |
| **Sandbox** | Isolated environment for agent execution |
| **Thrust** | A self-contained unit of work in this DevGuide |
| **WAL** | Write-Ahead Log for crash recovery |
| **Work Order** | A request for an agent to complete a task |

---

## Appendix J: References

### J.1 Internal Documentation

- [AGENTS.md](../../../AGENTS.md) - Engineering standards
- [README.md](../../../README.md) - Project overview
- [ExecSummary.md](../../ExecSummary.md) - Vision document

### J.2 Previous DevGuides

- [DevGuide v0.2.26](../DevGuide_v0.2.26/) - GitHub URL support

### J.3 External References

- [AbortController/AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [Write-Ahead Logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- [Graceful Shutdown Patterns](https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/)

---

**End of DevGuide v0.2.27**
