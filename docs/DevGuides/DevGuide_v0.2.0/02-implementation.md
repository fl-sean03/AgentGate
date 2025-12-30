# Implementation Thrusts

---

## Thrust 1: Install SDK Dependencies

### 1.1 Objective
Add the official Claude Agent SDK and required dependencies.

### 1.2 Subtasks

#### 1.2.1 Install @anthropic-ai/claude-agent-sdk
Add the SDK package as a dependency. The SDK bundles the Claude Code CLI.

#### 1.2.2 Verify Zod Compatibility
Ensure the existing `zod` version is compatible with SDK requirements (3.22.4+).

### 1.3 Verification Steps
1. Run `pnpm install` completes without errors
2. `@anthropic-ai/claude-agent-sdk` appears in `package.json` dependencies
3. TypeScript can import from `@anthropic-ai/claude-agent-sdk`
4. SDK types are available: `query`, `Options`, `SDKMessage`

### 1.4 Files Modified
| File | Action |
|------|--------|
| `package.json` | Modified - added SDK dependency |
| `pnpm-lock.yaml` | Modified - lockfile updated |

---

## Thrust 2: Create SDK-Based Driver

### 2.1 Objective
Implement a new driver class that uses the SDK's `query()` function.

### 2.2 Subtasks

#### 2.2.1 Create Driver File
Create `src/agent/claude-agent-sdk-driver.ts` with the new driver implementation.

#### 2.2.2 Implement Constructor
Accept configuration options including custom CLI path and environment variables.

#### 2.2.3 Implement isAvailable()
Check SDK availability by attempting to get supported models or account info.

#### 2.2.4 Implement execute()
Use the SDK's `query()` function to execute agent requests:
- Build options from AgentRequest
- Create AbortController for timeout
- Iterate through async generator
- Collect messages and build result
- Handle errors appropriately

#### 2.2.5 Implement Message Collection
Collect different message types during iteration:
- SDKSystemMessage: Extract session_id, tools, model
- SDKAssistantMessage: Track responses
- SDKResultMessage: Extract final result, usage, cost

### 2.3 Verification Steps
1. TypeScript compilation passes
2. Driver can be instantiated
3. `isAvailable()` returns true when SDK is configured
4. Simple prompt execution returns valid result

### 2.4 Files Created
| File | Action |
|------|--------|
| `src/agent/claude-agent-sdk-driver.ts` | Created |

---

## Thrust 3: Update Type Definitions

### 3.1 Objective
Add SDK-specific types and update AgentResult for richer information.

### 3.2 Subtasks

#### 3.2.1 Add Tool Call Types
Define types for tracking tool calls during execution:
- ToolCallRecord with tool name, input, output
- ToolCallSummary for aggregated stats

#### 3.2.2 Extend AgentResult
Add optional fields for SDK-specific data:
- `toolCalls`: Array of tool call records
- `totalCostUsd`: Total cost from result message
- `modelUsage`: Per-model usage breakdown
- `permissionDenials`: Any denied tool uses

#### 3.2.3 Add SDK Config Types
Define configuration types for SDK driver:
- ClaudeAgentSDKDriverConfig
- SDKHooksConfig for hook definitions

### 3.3 Verification Steps
1. All new types are exported from types/index.ts
2. TypeScript compilation passes
3. Types are compatible with SDK message types

### 3.4 Files Modified
| File | Action |
|------|--------|
| `src/types/agent.ts` | Modified - extended types |
| `src/types/index.ts` | Modified - export new types |

---

## Thrust 4: Implement Message Parsing

### 4.1 Objective
Create utilities to parse and aggregate SDK messages.

### 4.2 Subtasks

#### 4.2.1 Create Message Parser Module
Create `src/agent/sdk-message-parser.ts` with parsing utilities.

#### 4.2.2 Implement Message Type Guards
Type guards for each SDK message type:
- `isSystemMessage()`
- `isAssistantMessage()`
- `isResultMessage()`
- `isPartialMessage()`

#### 4.2.3 Implement Result Extraction
Extract final result data from SDKResultMessage:
- Success flag based on subtype
- Result text
- Usage statistics
- Cost information
- Error messages if failed

#### 4.2.4 Implement Tool Call Tracking
Track tool calls from assistant/user message pairs:
- Extract tool use from assistant messages
- Match with tool results from user messages

### 4.3 Verification Steps
1. Parser correctly identifies message types
2. Result extraction works for success and error cases
3. Tool call tracking captures all tool uses

### 4.4 Files Created
| File | Action |
|------|--------|
| `src/agent/sdk-message-parser.ts` | Created |

---

## Thrust 5: Add Hooks Support

### 5.1 Objective
Implement hooks infrastructure for gate integration.

### 5.2 Background
The SDK's hooks system allows intercepting tool calls, which is essential for:
- Validating changes against gate rules
- Logging file modifications for snapshots
- Blocking disallowed operations

### 5.3 Subtasks

#### 5.3.1 Define Hook Types
Create types for hook configuration in AgentGate context.

#### 5.3.2 Create Hook Builders
Utility functions to create common hooks:
- `createToolLoggingHook()`: Log all tool uses
- `createFileChangeHook()`: Track Edit/Write operations
- `createBlockingHook()`: Block specific patterns

#### 5.3.3 Integrate with Driver
Add hooks option to driver configuration and wire into execute().

### 5.4 Verification Steps
1. Hooks can be configured on driver
2. PreToolUse hook fires before tool execution
3. PostToolUse hook fires after tool execution
4. Hooks can block tool calls

### 5.5 Files Created
| File | Action |
|------|--------|
| `src/agent/sdk-hooks.ts` | Created |

### 5.6 Files Modified
| File | Action |
|------|--------|
| `src/agent/claude-agent-sdk-driver.ts` | Modified - hooks integration |

---

## Thrust 6: Update Command Builder

### 6.1 Objective
Adapt the options building logic for SDK format.

### 6.2 Subtasks

#### 6.2.1 Create Options Builder
Create `src/agent/sdk-options-builder.ts` to build SDK Options from AgentRequest.

#### 6.2.2 Map Constraint Fields
Map AgentConstraints to SDK options:
- allowedTools → allowedTools
- disallowedTools → disallowedTools
- maxTurns → maxTurns
- permissionMode → permissionMode + allowDangerouslySkipPermissions
- additionalSystemPrompt → systemPrompt.append

#### 6.2.3 Handle Session Resume
Map sessionId to SDK's resume option.

#### 6.2.4 Handle Context Pointers
If contextPointers.gatePlanPath exists, load and append to system prompt.

### 6.3 Verification Steps
1. Options builder produces valid SDK Options
2. All constraint fields are mapped correctly
3. Session resume works with resume option

### 6.4 Files Created
| File | Action |
|------|--------|
| `src/agent/sdk-options-builder.ts` | Created |

---

## Thrust 7: Update Tests

### 7.1 Objective
Update test suite for the new SDK-based driver.

### 7.2 Subtasks

#### 7.2.1 Add SDK Driver Unit Tests
Create tests for the new driver:
- Constructor and configuration
- Options building
- Message parsing
- Error handling

#### 7.2.2 Update E2E Tests
Modify E2E tests to work with SDK driver:
- Fresh workspace test
- Live execution test

#### 7.2.3 Add Mock SDK Tests
Create mock-based tests for SDK message handling without actual API calls.

### 7.3 Verification Steps
1. All unit tests pass
2. E2E tests pass with SDK driver
3. Coverage remains at acceptable level

### 7.4 Files Modified
| File | Action |
|------|--------|
| `test/agent-driver.test.ts` | Created/Modified |
| `test/sdk-message-parser.test.ts` | Created |
| `test/e2e-fresh-workspace.test.ts` | Modified |

---

## Thrust 8: Live E2E Validation

### 8.1 Objective
Validate the full workflow with real Claude agent execution.

### 8.2 Subtasks

#### 8.2.1 Update Live E2E Script
Modify `scripts/live-e2e-test.ts` to use SDK driver.

#### 8.2.2 Run Full Validation
Execute the live test and verify:
- Workspace creation works
- Agent executes task successfully
- Files are created correctly
- Session ID is captured
- Token usage is reported

#### 8.2.3 Compare Results
Compare SDK driver results with previous subprocess driver results for parity.

### 8.3 Verification Steps
1. Live E2E test passes
2. Calculator file is created with correct content
3. No regressions in functionality
4. Token usage and cost are reported

### 8.4 Files Modified
| File | Action |
|------|--------|
| `scripts/live-e2e-test.ts` | Modified |

---

## Thrust Summary Checklist

- [ ] Thrust 1: Install SDK Dependencies
- [ ] Thrust 2: Create SDK-Based Driver
- [ ] Thrust 3: Update Type Definitions
- [ ] Thrust 4: Implement Message Parsing
- [ ] Thrust 5: Add Hooks Support
- [ ] Thrust 6: Update Command Builder
- [ ] Thrust 7: Update Tests
- [ ] Thrust 8: Live E2E Validation
