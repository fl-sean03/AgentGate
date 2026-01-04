# 05: Developer Experience Thrusts

These thrusts focus on making AgentGate easier to develop, debug, and operate. They enable faster iteration cycles and better visibility into system behavior.

---

## Thrust 16: Comprehensive CLAUDE.md

### 16.1 Objective

Create a CLAUDE.md file that provides AI coding agents with complete context about the AgentGate codebase, enabling effective self-improvement.

### 16.2 Background

When an AI agent works on AgentGate, it needs to understand:

- Project structure and module boundaries
- Coding conventions and patterns
- What files are safe to modify vs critical
- Testing requirements and how to run them
- Common pitfalls and edge cases
- The execution context (sandbox, verification, etc.)

Without this, the agent makes suboptimal decisions and may introduce bugs.

### 16.3 Subtasks

#### 16.3.1 Create Project Overview Section

Write CLAUDE.md section covering:

- What AgentGate is and its purpose
- High-level architecture (reference 01-overview.md diagram)
- Key concepts: work orders, runs, gates, verification levels
- Module boundaries and responsibilities
- Entry points for different operations

This section should give an agent enough context to understand where to look for any given task.

#### 16.3.2 Document Module Structure

For each major module, document:

- **Orchestrator**: State machine, run lifecycle, WAL
- **Execution**: Engine, phases, sandbox providers
- **Verification**: Levels L0-L3, gate runners, feedback
- **Delivery**: Git operations, PR creation, conflict handling
- **Control Plane**: CLI, server, WebSocket
- **Infrastructure**: Config, types, utilities

Include key files, their purposes, and dependencies.

#### 16.3.3 Document Coding Conventions

Capture conventions:

- TypeScript style: strict mode, explicit types, no any
- Error handling: Use AgentGateError hierarchy
- Async patterns: AbortSignal for cancellation
- Testing: Unit tests for new functions, integration tests for flows
- Naming: camelCase for functions, PascalCase for types/classes
- Imports: Prefer relative imports within modules, absolute across modules

#### 16.3.4 Document Safe Modification Zones

Categorize files by modification risk:

**Safe to Modify** (low risk of breaking core):
- `src/feedback/*` - Feedback formatting
- `src/utils/*` - Utilities (with tests)
- Test files
- Documentation
- Example harnesses

**Caution Required** (could affect execution):
- `src/verifier/*` - Verification logic
- `src/delivery/*` - Git/PR operations
- `src/sandbox/*` - Sandbox providers

**Critical** (requires extensive testing):
- `src/orchestrator/*` - State machine, coordination
- `src/queue/*` - Execution queue
- `src/control-plane/*` - Server, CLI

#### 16.3.5 Document Testing Requirements

Testing guidance:

- Run `pnpm test` before every commit
- Run `pnpm lint` to check for warnings
- New functions require unit tests
- Modified behavior requires updated tests
- Integration tests for cross-module changes
- How to run specific test files or patterns

#### 16.3.6 Document Self-Awareness Context

When agent is executing within AgentGate:

- Environment variables indicating sandbox context
- Resource limits in effect
- Which operations are forbidden
- How to read verification feedback
- How to interpret test failures
- What to do when hitting rate limits

### 16.4 Verification Steps

1. Have an AI agent read CLAUDE.md
2. Ask agent to explain project structure
3. Verify explanation matches reality
4. Ask agent to locate specific functionality
5. Verify agent finds correct files
6. Have agent make a small change following conventions
7. Verify conventions were followed
8. Run `pnpm test` - all tests pass

### 16.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `CLAUDE.md` | Created | Comprehensive agent context |
| `docs/CLAUDE-detailed.md` | Created | Extended reference (linked from CLAUDE.md) |
| `packages/server/CLAUDE.md` | Created | Server-specific context |

---

## Thrust 17: Enhanced Feedback Generator

### 17.1 Objective

Improve the feedback generator to produce more actionable, prioritized, and deduplicated feedback for agents.

### 17.2 Background

Current feedback issues:

- Limited to 10 failures (arbitrary truncation)
- No prioritization (important failures may be cut)
- No deduplication (same root cause reported multiple times)
- Generic categorization misses patterns
- Large outputs overwhelm agent context

### 17.3 Subtasks

#### 17.3.1 Implement Failure Prioritization

Create prioritization system:

- **Critical**: Build failures, type errors, crashes
- **High**: Test failures, assertion errors
- **Medium**: Linting errors, warnings
- **Low**: Style issues, suggestions

Priority affects ordering and truncation decisions.

#### 17.3.2 Implement Root Cause Deduplication

Group failures by likely root cause:

- Same file + similar line = probably related
- Same error type across files = systematic issue
- Import errors cascade = single root cause
- Test failures from same source = single fix

Present grouped failures with count and representative examples.

#### 17.3.3 Add Smart Truncation

Replace fixed limit with intelligent truncation:

- Always include at least one example per category
- Prioritize unique failures over duplicates
- Configurable total size limit (default: 8KB)
- Include summary of truncated failures
- Link to full log for complete details

#### 17.3.4 Improve Error Categorization

Add pattern-based categorization:

- TypeScript errors: Parse error codes (TS2345, etc.)
- Test failures: Parse assertion messages
- Build errors: Recognize common build tool output
- Runtime errors: Parse stack traces
- Linting: Parse ESLint output format

Each category has specific formatting and suggestions.

#### 17.3.5 Add Suggested Fixes

For common error patterns, suggest fixes:

- Missing import: "Consider importing X from 'module'"
- Type mismatch: "Expected X, got Y. Check the function signature"
- Test assertion: "Expected X but received Y. Check the test data"
- Build error: "Module not found. Run `pnpm install`"

Suggestions should be actionable, not generic.

#### 17.3.6 Add Feedback Analytics

Track feedback patterns:

- Most common error types
- Errors that persist across iterations
- Errors that agents successfully fix
- Average feedback size per run

Use analytics to improve categorization and suggestions over time.

### 17.4 Verification Steps

1. Create test with 50 failures of various types
2. Generate feedback
3. Verify feedback is under 8KB
4. Verify all categories represented
5. Verify duplicates grouped
6. Verify suggestions present for known patterns
7. Verify summary includes truncated failure count
8. Run `pnpm test` - all tests pass

### 17.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/feedback/generator.ts` | Modified | Add prioritization, deduplication |
| `src/feedback/prioritizer.ts` | Created | Priority calculation |
| `src/feedback/deduplicator.ts` | Created | Root cause grouping |
| `src/feedback/truncator.ts` | Created | Smart truncation |
| `src/feedback/patterns.ts` | Created | Error pattern database |
| `src/feedback/suggestions.ts` | Created | Fix suggestions |
| `src/feedback/generator.test.ts` | Modified | Add new test cases |

---

## Thrust 18: Structured Logging Overhaul

### 18.1 Objective

Implement structured logging throughout the codebase with consistent format, correlation IDs, and configurable verbosity.

### 18.2 Background

Current logging issues:

- Inconsistent log formats
- No correlation between related logs
- Debug logs mixed with info
- No structured data for parsing
- Hard to filter by component

### 18.3 Subtasks

#### 18.3.1 Create Logger Factory

Create `src/utils/logger-factory.ts`:

- `createLogger(component: string)` - Create scoped logger
- Each logger prefixes component name
- Support for correlation ID injection
- Consistent timestamp format (ISO 8601)
- Structured JSON output option

#### 18.3.2 Define Log Levels

Implement log levels:

- **ERROR**: Failures requiring attention
- **WARN**: Unexpected but handled conditions
- **INFO**: Normal operation milestones
- **DEBUG**: Detailed operation information
- **TRACE**: Very detailed debugging (off by default)

Each level has color coding for terminal output.

#### 18.3.3 Add Correlation IDs

Implement correlation tracking:

- Generate unique ID per work order
- Pass ID through entire execution chain
- Include ID in all log entries
- Enable filtering logs by correlation ID
- Store correlation in async context (AsyncLocalStorage)

#### 18.3.4 Add Structured Fields

All log entries include:

- `timestamp`: ISO 8601 timestamp
- `level`: Log level
- `component`: Source component
- `correlationId`: Work order correlation
- `message`: Human-readable message
- `data`: Optional structured data object

Output formats: pretty (terminal), JSON (file/streaming).

#### 18.3.5 Migrate Existing Logging

Replace all `console.log` and current logger calls:

- Identify all logging statements
- Replace with appropriate level and component
- Add structured data where applicable
- Remove redundant timestamps (logger adds them)
- Remove redundant prefixes (component handles this)

#### 18.3.6 Add Log Configuration

Configuration options:

- `logging.level` - Minimum level to output (default: INFO)
- `logging.format` - Output format: pretty | json (default: pretty)
- `logging.file` - Optional file output path
- `logging.components` - Per-component level overrides
- `logging.redact` - Fields to redact (passwords, tokens)

### 18.4 Verification Steps

1. Start server with DEBUG level
2. Submit work order
3. Verify all logs have consistent format
4. Verify correlation ID consistent across logs
5. Filter logs by component
6. Switch to JSON format, verify parseable
7. Verify sensitive fields redacted
8. Run `pnpm test` - all tests pass

### 18.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/utils/logger-factory.ts` | Created | Logger creation |
| `src/utils/correlation.ts` | Created | Correlation ID management |
| `src/utils/logger.ts` | Modified | Integrate factory, levels |
| `src/config/index.ts` | Modified | Add logging config |
| `src/orchestrator/*.ts` | Modified | Use structured logging |
| `src/queue/*.ts` | Modified | Use structured logging |
| `src/sandbox/*.ts` | Modified | Use structured logging |
| `src/delivery/*.ts` | Modified | Use structured logging |
| `src/verifier/*.ts` | Modified | Use structured logging |

---

## Thrust 19: Debug Mode & Dry Runs

### 19.1 Objective

Add debug mode for detailed execution tracing and dry run mode for testing work orders without side effects.

### 19.2 Background

Debugging issues is difficult because:

- Can't see what agent is doing in real-time
- Can't test work orders without executing them
- No way to step through verification
- No way to inspect intermediate state

### 19.3 Subtasks

#### 19.3.1 Implement Debug Mode

Add `--debug` flag to CLI and `debug: true` to API:

- Enable TRACE level logging
- Capture all agent input/output
- Log every state transition with details
- Save execution artifacts for inspection
- Enable breakpoints at key phases (optional)

#### 19.3.2 Implement Dry Run Mode

Add `--dry-run` flag and `dryRun: true` to API:

- Validate work order without executing
- Simulate state transitions
- Report what would happen at each phase
- No actual agent execution
- No git operations
- No PR creation

Return detailed plan of what would happen.

#### 19.3.3 Add Phase Stepping

Enable step-by-step execution:

- `agentgate step <runId>` - Execute next phase only
- `agentgate inspect <runId>` - Show current state
- `agentgate resume <runId>` - Continue to completion
- `agentgate abort <runId>` - Abort with cleanup

Useful for debugging verification failures.

#### 19.3.4 Add Artifact Inspection

Save and expose execution artifacts:

- Agent prompts and responses
- Verification command outputs
- Git diff at each snapshot
- Test output files
- Resource usage metrics

Artifacts stored in `~/.agentgate/artifacts/<runId>/`.

CLI command: `agentgate artifacts <runId> [type]`

#### 19.3.5 Add State Inspection

Expose run state for debugging:

- `agentgate state <runId>` - Current state and history
- `agentgate state <runId> --timeline` - State timeline
- `agentgate state <runId> --diff` - Changes between states
- `agentgate state <runId> --export` - Export for bug reports

#### 19.3.6 Add Replay Capability

Enable replaying a run:

- `agentgate replay <runId>` - Re-run with same inputs
- `agentgate replay <runId> --from <state>` - Start from state
- `agentgate replay <runId> --mock-agent` - Use recorded responses

Useful for reproducing and fixing issues.

### 19.4 Verification Steps

1. Submit work order with `--debug`
2. Verify trace-level logs appear
3. Verify artifacts saved
4. Submit work order with `--dry-run`
5. Verify no side effects (no container, no git ops)
6. Verify detailed plan returned
7. Use step mode to advance through phases
8. Verify inspect shows correct state at each step
9. Run `pnpm test` - all tests pass

### 19.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/control-plane/debug-mode.ts` | Created | Debug mode implementation |
| `src/control-plane/dry-run.ts` | Created | Dry run execution |
| `src/control-plane/artifacts.ts` | Created | Artifact management |
| `src/control-plane/commands/step.ts` | Created | Step command |
| `src/control-plane/commands/inspect.ts` | Created | Inspect command |
| `src/control-plane/commands/artifacts.ts` | Created | Artifacts command |
| `src/control-plane/commands/replay.ts` | Created | Replay command |
| `src/orchestrator/orchestrator.ts` | Modified | Support debug/dry-run |
| `src/types/work-order.ts` | Modified | Add debug/dryRun flags |

---

## Thrust 20: Interactive Development Server

### 20.1 Objective

Create an interactive development mode that enables rapid iteration on AgentGate and harness configurations.

### 20.2 Background

Development iteration is slow because:

- Must restart server for code changes
- No REPL for testing functions
- Hard to test harness changes
- No visualization of system state

### 20.3 Subtasks

#### 20.3.1 Implement Hot Reload

Add hot reload for development:

- Watch source files for changes
- Reload affected modules without restart
- Preserve in-flight work orders (if possible)
- Clear require cache for changed modules
- Re-register routes on reload

Use `--dev` flag to enable.

#### 20.3.2 Create Development Dashboard

Add web-based development dashboard:

- Real-time system state visualization
- Active work orders and their states
- Log stream with filtering
- Configuration editor
- Harness profile testing

Accessible at `http://localhost:8377/dev` when in dev mode.

#### 20.3.3 Add REPL Mode

Create interactive REPL:

- `agentgate repl` - Start REPL session
- Access to all AgentGate modules
- Execute functions directly
- Inspect internal state
- Submit test work orders
- Pre-loaded with common utilities

#### 20.3.4 Add Harness Testing Mode

Enable testing harness configurations:

- `agentgate test-harness <profile>` - Validate profile
- `agentgate test-harness <profile> --sample` - Run sample task
- Show validation errors with suggestions
- Test against sample repository
- Report gate compatibility

#### 20.3.5 Add Mock Modes

Enable mocking external dependencies:

- `--mock-github` - Use mock GitHub API
- `--mock-docker` - Simulate container execution
- `--mock-agent` - Use predefined agent responses

Mock modes enable:
- Testing without credentials
- Faster iteration
- Deterministic results for debugging

#### 20.3.6 Create Development Documentation

Document development workflow:

- How to set up development environment
- How to run in development mode
- How to use hot reload effectively
- How to write and test changes
- How to contribute to AgentGate

Include in `docs/development/` directory.

### 20.4 Verification Steps

1. Start server with `--dev` flag
2. Modify a source file
3. Verify hot reload occurs
4. Verify running work orders unaffected
5. Access development dashboard
6. Verify state visualization accurate
7. Start REPL session
8. Execute a function, verify result
9. Test harness profile with test mode
10. Run `pnpm test` - all tests pass

### 20.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/control-plane/dev-mode.ts` | Created | Development mode setup |
| `src/control-plane/hot-reload.ts` | Created | Hot reload implementation |
| `src/control-plane/repl.ts` | Created | REPL implementation |
| `src/control-plane/commands/repl.ts` | Created | REPL command |
| `src/control-plane/commands/test-harness.ts` | Created | Harness testing |
| `src/server/routes/dev.ts` | Created | Dev dashboard routes |
| `src/server/views/dev-dashboard.html` | Created | Dashboard UI |
| `src/mocks/github-mock.ts` | Created | GitHub mock |
| `src/mocks/docker-mock.ts` | Created | Docker mock |
| `src/mocks/agent-mock.ts` | Created | Agent mock |
| `docs/development/` | Created | Development documentation |

---

## Phase 4 Completion Checklist

- [ ] Thrust 16: CLAUDE.md complete and accurate
- [ ] Thrust 17: Enhanced feedback with prioritization and deduplication
- [ ] Thrust 18: Structured logging throughout codebase
- [ ] Thrust 19: Debug mode and dry run working
- [ ] Thrust 20: Interactive development server operational
- [ ] All existing tests still pass
- [ ] No new lint warnings
- [ ] Documentation updated for new features

---

## Dog Fooding Readiness Summary

After completing all 20 thrusts, AgentGate will be ready for self-improvement:

### Minimum Viable (Thrusts 1, 3, 4, 16)
- State persistence prevents data loss
- Graceful shutdown prevents corruption
- Sandbox cleanup prevents resource leaks
- CLAUDE.md enables agent understanding

### Full Capability (All Thrusts)
- Robust error handling and recovery
- Rate limiting for external services
- Extensible plugin architecture
- Comprehensive feedback for agents
- Full debugging and development tools

### First Dog Fooding Targets
1. Create CLAUDE.md (Thrust 16 - safe, isolated)
2. Add tests for orchestrator (safe, just tests)
3. Improve feedback generator (Thrust 17 - low risk)
4. Fix empty catch blocks (Thrust 6 - systematic)

---

**Next**: [06-appendices.md](./06-appendices.md) - Reference Materials
