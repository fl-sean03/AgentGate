# Module C: Agent Driver (Claude Code)

## Purpose

Run the agent in headless automation mode inside the workspace. The driver is a controlled process runner, not "smart" — it executes Claude Code and captures results.

---

## Thrust 9: Driver Interface Definition

### 9.1 Objective

Define the abstract driver interface that all agent implementations must satisfy.

### 9.2 Background

AgentGate is agent-agnostic by design. Claude Code is the first implementation, but the architecture supports swapping agents. The driver interface defines the contract.

### 9.3 Subtasks

#### 9.3.1 Define Driver Interface

Create `src/agent/driver.ts`:

Abstract interface `AgentDriver`:
- `name`: string - Driver identifier
- `version`: string - Driver version
- `execute(request: AgentRequest): Promise<AgentResult>` - Run the agent
- `isAvailable(): Promise<boolean>` - Check if agent is installed/accessible
- `getCapabilities(): DriverCapabilities` - Report what the driver supports

`AgentRequest` structure:
- `workspacePath`: string - Absolute path to workspace root
- `taskPrompt`: string - User intent
- `gatePlanSummary`: string - Human-readable gate plan
- `constraints`: AgentConstraints - Execution constraints
- `priorFeedback`: string | null - Feedback from previous iteration
- `contextPointers`: ContextPointers - Where to find key files
- `timeoutMs`: number - Max execution time

`AgentResult` structure:
- `success`: boolean - Agent completed without crash
- `exitCode`: number - Process exit code
- `stdout`: string - Standard output
- `stderr`: string - Standard error
- `structuredOutput`: object | null - Parsed JSON if available
- `sessionId`: string | null - For session resumption
- `tokensUsed`: TokenUsage | null - Token consumption
- `durationMs`: number - Execution duration

`AgentConstraints` structure:
- `allowedTools`: string[] - Tools the agent may use
- `disallowedTools`: string[] - Explicitly blocked tools
- `maxTurns`: number - Maximum agentic turns
- `permissionMode`: 'plan' | 'acceptEdits' | 'bypassPermissions'

#### 9.3.2 Define Context Pointers

`ContextPointers` provides the agent with file locations:
- `manifestPath`: string | null - Package.json, pyproject.toml, etc.
- `testsPath`: string | null - Test directory
- `docsPath`: string | null - Documentation directory
- `gatePlanPath`: string | null - verify.yaml location
- `srcPath`: string | null - Source code root

#### 9.3.3 Create Driver Registry

Create `src/agent/registry.ts`:

The registry manages available drivers:
- `register(driver: AgentDriver): void` - Register a driver
- `get(name: string): AgentDriver | null` - Get driver by name
- `list(): AgentDriver[]` - List all registered drivers
- `getDefault(): AgentDriver` - Get default driver (claude-code)

### 9.4 Verification Steps

1. Driver interface compiles without errors
2. Mock driver implements interface correctly
3. Registry registers and retrieves drivers
4. Default driver returns claude-code driver

### 9.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/agent/driver.ts` | Created |
| `agentgate/src/agent/registry.ts` | Created |
| `agentgate/src/agent/index.ts` | Created |
| `agentgate/src/types/agent.ts` | Created |

---

## Thrust 10: Claude Code Driver Implementation

### 10.1 Objective

Implement the Claude Code driver using the CLI in headless mode.

### 10.2 Background

Claude Code CLI provides headless execution via the `-p` flag:
- `-p <prompt>` - Non-interactive mode
- `--output-format json` - Structured output
- `--allowedTools` - Tool restrictions
- `--max-turns` - Iteration limit
- `--append-system-prompt` - Add constraints

### 10.3 Subtasks

#### 10.3.1 Create Claude Code Driver

Create `src/agent/claude-code-driver.ts`:

Implement `AgentDriver` interface:
- Set `name` to 'claude-code'
- Set `version` from `claude --version` output
- Implement `execute()` using execa to run CLI
- Implement `isAvailable()` by checking `which claude`
- Implement `getCapabilities()` with supported features

#### 10.3.2 Build Command Arguments

Create `src/agent/command-builder.ts`:

Function `buildClaudeCommand(request: AgentRequest): string[]`:

Required arguments:
- `-p` with the full prompt (task + context)
- `--output-format json`
- `--max-turns` from constraints

Conditional arguments:
- `--allowedTools` if constraints specify
- `--disallowedTools` if constraints specify
- `--append-system-prompt` with constraints text
- `--dangerously-skip-permissions` only in specific modes
- `--add-dir` for additional directories

Build the full prompt:
```
Task: {taskPrompt}

Gate Plan:
{gatePlanSummary}

Workspace Context:
- Manifest: {manifestPath}
- Tests: {testsPath}
- Source: {srcPath}

Constraints:
- Stay within workspace root
- Do not modify gate definition files
- Run preflight checks before completing
- Minimize diffs; avoid unnecessary refactors

{priorFeedback ? "Previous Iteration Feedback:\n" + priorFeedback : ""}
```

#### 10.3.3 Implement Process Execution

Execute Claude Code as subprocess:
- Use `execa` for process management
- Set working directory to workspace path
- Set timeout from request
- Capture stdout/stderr streams
- Handle process signals (SIGTERM, SIGKILL)
- Parse JSON output on success

Error handling:
- Timeout: Kill process, return timeout error
- Crash: Return stderr and exit code
- Invalid output: Log warning, return raw output

#### 10.3.4 Parse Structured Output

Create `src/agent/output-parser.ts`:

Parse Claude Code JSON output:
- `result`: Main text output
- `session_id`: For continuation
- `usage`: Token counts
- `structured_output`: If JSON schema was used

Handle malformed JSON gracefully:
- Try to extract partial JSON
- Fall back to raw text
- Log parsing errors

#### 10.3.5 Implement Session Resumption

For iterative repair, support session continuation:
- Store session_id from first execution
- On retry, use `--resume <session_id>` flag
- Maintains conversation context across iterations

### 10.4 Verification Steps

1. Check Claude Code availability - returns true if installed
2. Execute simple prompt - returns result with JSON output
3. Execute with tool restrictions - respects allowedTools
4. Execute with timeout - process killed after timeout
5. Resume session - continues from previous context

### 10.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/agent/claude-code-driver.ts` | Created |
| `agentgate/src/agent/command-builder.ts` | Created |
| `agentgate/src/agent/output-parser.ts` | Created |

---

## Thrust 11: Agent Constraints System

### 11.1 Objective

Implement the constraint system that limits agent behavior.

### 11.2 Subtasks

#### 11.2.1 Define Constraint Types

Create `src/agent/constraints.ts`:

Constraint categories:
- **Tool constraints**: What tools the agent can use
- **Path constraints**: Where the agent can read/write
- **Time constraints**: Execution time limits
- **Behavior constraints**: Rules injected via system prompt

#### 11.2.2 Create Default Constraints

Define default safe constraints for AgentGate:

Default allowed tools:
- `Read` - File reading
- `Edit` - File editing
- `Write` - File creation
- `Glob` - File finding
- `Grep` - Content search
- `Bash` - Shell commands (restricted)

Default disallowed tools:
- `Bash(rm -rf:*)` - Prevent recursive deletion
- `Bash(curl:*)` - No network calls
- `Bash(wget:*)` - No downloads
- `Bash(ssh:*)` - No remote access

Default behavior constraints (system prompt):
- Stay within workspace root
- Do not modify verify.yaml or CI configs unless explicitly asked
- Run `pnpm test` or equivalent before completing
- Prefer minimal changes
- Create build notes artifact

#### 11.2.3 Implement Constraint Merging

Function to merge default + custom constraints:
- Custom allowedTools replaces default
- Custom disallowedTools adds to default
- Custom timeout overrides default
- Behavior constraints are concatenated

#### 11.2.4 Validate Constraint Conflicts

Check for conflicting constraints:
- Tool both allowed and disallowed
- Timeout less than minimum (60s)
- Invalid tool names

### 11.3 Verification Steps

1. Default constraints include safe defaults
2. Custom constraints override defaults correctly
3. Conflicting constraints raise error
4. Constraints serialize to CLI arguments correctly

### 11.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/agent/constraints.ts` | Created |
| `agentgate/src/agent/defaults.ts` | Created |

---

## Module C Complete Checklist

- [ ] Driver interface defined
- [ ] Driver registry implemented
- [ ] Claude Code driver created
- [ ] Command builder working
- [ ] Process execution with timeout
- [ ] JSON output parsing
- [ ] Session resumption support
- [ ] Constraint system implemented
- [ ] Default constraints defined
- [ ] Constraint merging working
- [ ] Unit tests passing

---

## Next Steps

Proceed to [05-gate-resolver.md](./05-gate-resolver.md) for Module D implementation.
