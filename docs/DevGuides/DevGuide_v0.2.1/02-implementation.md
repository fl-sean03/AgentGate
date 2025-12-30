# DevGuide v0.2.1: Implementation Thrusts

---

## Thrust 1: Install Dependencies

### 1.1 Objective
Add OpenAI SDK packages to the project.

### 1.2 Subtasks

#### 1.2.1 Install OpenAI Codex SDK
Add `@openai/codex-sdk` package which provides programmatic access to the Codex coding agent.

#### 1.2.2 Install OpenAI Agents SDK
Add `@openai/agents` package which provides the agent framework with tools and guardrails.

#### 1.2.3 Install Zod
Add `zod` package (version 3.x) for schema validation in Agents SDK tools.

### 1.3 Verification Steps
1. Run `pnpm install` - should complete without errors
2. Run `pnpm build` - should compile successfully
3. Check `node_modules/@openai/codex-sdk` exists
4. Check `node_modules/@openai/agents` exists

### 1.4 Files Modified
| File | Action |
|------|--------|
| `package.json` | Modified - add dependencies |
| `pnpm-lock.yaml` | Modified - lock file updated |

---

## Thrust 2: OpenAI Codex SDK Driver

### 2.1 Objective
Implement an agent driver that uses the OpenAI Codex SDK for code-focused tasks.

### 2.2 Background
The Codex SDK wraps the Codex CLI binary, communicating via JSONL over stdin/stdout. It provides thread-based execution with session persistence.

### 2.3 Subtasks

#### 2.3.1 Create Driver File
Create `src/agent/openai-codex-driver.ts` implementing `AgentDriver` interface.

#### 2.3.2 Implement Configuration
Define `OpenAICodexDriverConfig` interface with:
- `defaultTimeoutMs` - execution timeout
- `workingDirectory` - optional override for cwd
- `debugEvents` - enable event logging

#### 2.3.3 Implement isAvailable
Check for:
- `@openai/codex-sdk` package availability
- `OPENAI_API_KEY` environment variable

#### 2.3.4 Implement getCapabilities
Return capabilities:
- `supportsSessionResume: true` (via threadId)
- `supportsStructuredOutput: true`
- `supportsToolRestriction: false` (Codex controls its tools)
- `supportsTimeout: true`
- `maxTurns: 100`

#### 2.3.5 Implement execute Method
1. Create `Codex` instance
2. Start or resume thread based on `request.sessionId`
3. Build prompt from `request.taskPrompt` with gate plan context
4. Execute via `thread.run()` or `thread.runStreamed()`
5. Collect events and build `AgentResult`
6. Handle timeout via AbortController if supported

#### 2.3.6 Create Result Mapper
Map Codex SDK response to `AgentResult`:
- `turn.finalResponse` → `stdout`
- `turn.items` → extract tool calls if needed
- Thread ID → `sessionId`

### 2.4 Verification Steps
1. TypeScript compiles without errors
2. Driver exports from `src/agent/index.ts`
3. Can instantiate driver: `new OpenAICodexDriver()`

### 2.5 Files Created/Modified
| File | Action |
|------|--------|
| `src/agent/openai-codex-driver.ts` | Created |

---

## Thrust 3: OpenAI Agents SDK Driver

### 3.1 Objective
Implement an agent driver using the OpenAI Agents SDK for general agent workflows.

### 3.2 Background
The Agents SDK is provider-agnostic and supports custom tools with Zod schemas. It uses an agent loop pattern with handoffs and guardrails.

### 3.3 Subtasks

#### 3.3.1 Create Driver File
Create `src/agent/openai-agents-driver.ts` implementing `AgentDriver` interface.

#### 3.3.2 Implement Configuration
Define `OpenAIAgentsDriverConfig` interface with:
- `defaultTimeoutMs` - execution timeout
- `model` - model to use (default from env)
- `debugMode` - enable debug logging

#### 3.3.3 Create Agent Tools
Implement tools that map to AgentGate's allowed tools:
- `read_file` - Read file contents
- `write_file` - Write file contents
- `edit_file` - Edit file with search/replace
- `run_command` - Execute shell command
- `glob_files` - Find files by pattern
- `grep_search` - Search file contents

Each tool uses Zod schema for parameters.

#### 3.3.4 Implement isAvailable
Check for:
- `@openai/agents` package availability
- `OPENAI_API_KEY` environment variable

#### 3.3.5 Implement getCapabilities
Return capabilities:
- `supportsSessionResume: false` (stateless by default)
- `supportsStructuredOutput: true` (via outputType)
- `supportsToolRestriction: true` (custom tool list)
- `supportsTimeout: true`
- `maxTurns: 50`

#### 3.3.6 Implement execute Method
1. Create `Agent` instance with instructions and tools
2. Build system prompt from request context
3. Execute via `run(agent, prompt, { maxTurns })`
4. Extract `result.finalOutput` for response
5. Handle errors and timeout

#### 3.3.7 Create File Operation Tools
Implement the core coding tools:
- Use `fs` module for file operations
- Execute commands via `child_process`
- Apply workspace path restrictions

### 3.4 Verification Steps
1. TypeScript compiles without errors
2. Driver exports from `src/agent/index.ts`
3. Can instantiate driver: `new OpenAIAgentsDriver()`
4. Tools have valid Zod schemas

### 3.5 Files Created/Modified
| File | Action |
|------|--------|
| `src/agent/openai-agents-driver.ts` | Created |
| `src/agent/openai-agents-tools.ts` | Created |

---

## Thrust 4: Update Registry and Exports

### 4.1 Objective
Register new drivers and update module exports.

### 4.2 Subtasks

#### 4.2.1 Update Index Exports
Add exports for new drivers in `src/agent/index.ts`.

#### 4.2.2 Auto-Register Available Drivers
Modify initialization to:
1. Check each driver's `isAvailable()`
2. Register available drivers
3. Set default based on priority

#### 4.2.3 Add Driver Constants
Add capability constants for each provider in `defaults.ts`.

### 4.3 Verification Steps
1. `import { OpenAICodexDriver } from './agent'` works
2. `import { OpenAIAgentsDriver } from './agent'` works
3. Registry lists all available drivers

### 4.4 Files Modified
| File | Action |
|------|--------|
| `src/agent/index.ts` | Modified |
| `src/agent/defaults.ts` | Modified |

---

## Thrust 5: Environment Configuration

### 5.1 Objective
Ensure API keys are properly loaded from environment.

### 5.2 Subtasks

#### 5.2.1 Document Environment Variables
Update or create documentation for required env vars:
- `ANTHROPIC_API_KEY` - Claude SDK
- `OPENAI_API_KEY` - Codex and Agents SDK
- `OPENAI_API_MODEL` - Default model selection

#### 5.2.2 Add Environment Validation
Create utility to check required env vars for each driver.

### 5.3 Verification Steps
1. Driver `isAvailable()` returns false without API key
2. Driver `isAvailable()` returns true with API key

### 5.4 Files Modified
| File | Action |
|------|--------|
| `.env.example` | Created |

---

## Thrust 6: Unit Tests

### 6.1 Objective
Add unit tests for new drivers.

### 6.2 Subtasks

#### 6.2.1 Codex Driver Tests
Test in `test/openai-codex-driver.test.ts`:
- Driver instantiation
- Capability reporting
- Availability check (mock API key)
- Request building

#### 6.2.2 Agents Driver Tests
Test in `test/openai-agents-driver.test.ts`:
- Driver instantiation
- Capability reporting
- Availability check (mock API key)
- Tool schema validation

### 6.3 Verification Steps
1. Run `pnpm test` - all tests pass
2. New test files are executed

### 6.4 Files Created
| File | Action |
|------|--------|
| `test/openai-codex-driver.test.ts` | Created |
| `test/openai-agents-driver.test.ts` | Created |

---

## Thrust 7: E2E Validation

### 7.1 Objective
Validate drivers with real API calls.

### 7.2 Subtasks

#### 7.2.1 Create Codex E2E Test
Create `scripts/live-codex-test.ts`:
- Create workspace with CLAUDE.md
- Execute calculator task
- Verify file creation

#### 7.2.2 Create Agents SDK E2E Test
Create `scripts/live-agents-test.ts`:
- Create workspace
- Execute simple file creation task
- Verify output

### 7.3 Verification Steps
1. Run `npx tsx scripts/live-codex-test.ts` - creates calculator.ts
2. Run `npx tsx scripts/live-agents-test.ts` - creates expected file
3. Both complete without errors

### 7.4 Files Created
| File | Action |
|------|--------|
| `scripts/live-codex-test.ts` | Created |
| `scripts/live-agents-test.ts` | Created |
