# Appendices

---

## A. File Reference

### Files to Create

| File | Purpose |
|------|---------|
| `src/agent/claude-agent-sdk-driver.ts` | New SDK-based driver implementation |
| `src/agent/sdk-message-parser.ts` | SDK message type guards and parsing |
| `src/agent/sdk-options-builder.ts` | Build SDK Options from AgentRequest |
| `src/agent/sdk-hooks.ts` | Hook utilities for gate integration |
| `test/sdk-message-parser.test.ts` | Unit tests for message parser |

### Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add `@anthropic-ai/claude-agent-sdk` dependency |
| `src/types/agent.ts` | Extend AgentResult with SDK-specific fields |
| `src/types/index.ts` | Export new types |
| `src/agent/index.ts` | Export new driver and utilities |
| `scripts/live-e2e-test.ts` | Use SDK driver for testing |
| `test/e2e-fresh-workspace.test.ts` | Update for SDK driver |

### Files Unchanged

| File | Reason |
|------|--------|
| `src/agent/claude-code-driver.ts` | Keep for backward compatibility |
| `src/agent/command-builder.ts` | Still used by old driver |
| `src/agent/output-parser.ts` | Still used by old driver |
| `src/agent/defaults.ts` | Shared between drivers |
| `src/agent/constraints.ts` | Shared between drivers |

---

## B. SDK Quick Reference

### Installation

```bash
pnpm add @anthropic-ai/claude-agent-sdk
```

### Basic Usage

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Your task here",
  options: {
    cwd: "/path/to/workspace",
    allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    maxTurns: 10
  }
})) {
  console.log(message);
}
```

### Options Type

```typescript
interface Options {
  cwd?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  allowDangerouslySkipPermissions?: boolean;
  maxTurns?: number;
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };
  resume?: string;  // Session ID to resume
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  abortController?: AbortController;
}
```

### Message Types

```typescript
// System init message
type SDKSystemMessage = {
  type: 'system';
  subtype: 'init';
  session_id: string;
  tools: string[];
  model: string;
  permissionMode: PermissionMode;
};

// Assistant response
type SDKAssistantMessage = {
  type: 'assistant';
  uuid: string;
  session_id: string;
  message: {
    content: Array<TextBlock | ToolUseBlock>;
  };
};

// Final result
type SDKResultMessage = {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution';
  session_id: string;
  result?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  total_cost_usd: number;
  num_turns: number;
};
```

### Hook Example

```typescript
const options = {
  hooks: {
    PreToolUse: [{
      matcher: "Bash",
      hooks: [async (input, toolUseId) => {
        const command = input.tool_input?.command;
        if (command?.includes("rm -rf")) {
          return {
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: 'Destructive command blocked'
            }
          };
        }
        return {};
      }]
    }],
    PostToolUse: [{
      matcher: "Edit|Write",
      hooks: [async (input, toolUseId) => {
        console.log(`File changed: ${input.tool_input?.file_path}`);
        return {};
      }]
    }]
  }
};
```

---

## C. Environment Variables

### Required

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### Optional

```bash
# Use Bedrock instead of Anthropic API
CLAUDE_CODE_USE_BEDROCK=1

# Use Vertex AI instead of Anthropic API
CLAUDE_CODE_USE_VERTEX=1
```

---

## D. Error Handling

### SDK Error Types

```typescript
import {
  AbortError,        // Operation was aborted
  CLINotFoundError,  // Claude CLI not available
  ProcessError,      // CLI process failed
} from "@anthropic-ai/claude-agent-sdk";

try {
  for await (const message of query({...})) {
    // ...
  }
} catch (error) {
  if (error instanceof AbortError) {
    // Timeout or manual abort
  } else if (error instanceof ProcessError) {
    // CLI execution failed
    console.error(`Exit code: ${error.exitCode}`);
  }
}
```

### Result Error Subtypes

```typescript
const result = ...; // SDKResultMessage

switch (result.subtype) {
  case 'success':
    // Task completed successfully
    break;
  case 'error_max_turns':
    // Hit turn limit without completing
    break;
  case 'error_during_execution':
    // Error during agent execution
    break;
  case 'error_max_budget_usd':
    // Hit budget limit
    break;
}
```

---

## E. Testing Commands

```bash
# Build project
pnpm build

# Run all tests
pnpm test

# Run specific test file
pnpm vitest run test/sdk-message-parser.test.ts

# Run live E2E test
npx tsx scripts/live-e2e-test.ts

# Type checking
pnpm typecheck
```

---

## F. Migration Checklist

### Pre-Migration

- [ ] Current tests all pass
- [ ] Backup of current implementation
- [ ] SDK package installed successfully
- [ ] API key configured in environment

### Implementation

- [ ] Thrust 1: Dependencies installed
- [ ] Thrust 2: SDK driver created
- [ ] Thrust 3: Types updated
- [ ] Thrust 4: Message parser implemented
- [ ] Thrust 5: Hooks support added
- [ ] Thrust 6: Options builder created
- [ ] Thrust 7: Tests updated
- [ ] Thrust 8: Live E2E validated

### Post-Migration

- [ ] All tests pass
- [ ] Live E2E creates expected files
- [ ] Token usage reported correctly
- [ ] Session ID captured
- [ ] No regressions in functionality
- [ ] Documentation updated

---

## G. Rollback Plan

If issues are encountered, rollback by:

1. Revert to subprocess-based driver in configuration
2. The old `ClaudeCodeDriver` is preserved and functional
3. No breaking changes to `AgentDriver` interface

The factory pattern allows runtime driver selection:

```typescript
function createDriver(type: 'sdk' | 'subprocess'): AgentDriver {
  if (type === 'sdk') {
    return new ClaudeAgentSDKDriver();
  }
  return new ClaudeCodeDriver();
}
```
