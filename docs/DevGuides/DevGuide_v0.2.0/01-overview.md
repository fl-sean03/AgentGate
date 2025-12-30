# Architecture Overview

---

## Current State (v0.1.x)

AgentGate v0.1.x uses a subprocess-based approach to execute Claude Code:

### ClaudeCodeDriver Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ClaudeCodeDriver                          │
├─────────────────────────────────────────────────────────────┤
│  execute(request: AgentRequest): Promise<AgentResult>       │
│    │                                                         │
│    ├─► buildClaudeCommand(request) → string[]               │
│    │     └─ Builds CLI args: -p, --max-turns, etc.          │
│    │                                                         │
│    ├─► spawn('claude', args, { cwd, env, stdio })           │
│    │     └─ Raw child_process.spawn                          │
│    │                                                         │
│    ├─► proc.stdin.end()  ← Required workaround              │
│    │                                                         │
│    ├─► Buffer stdout/stderr manually                         │
│    │                                                         │
│    ├─► setTimeout for timeout handling                       │
│    │                                                         │
│    └─► parseOutput(stdout) → JSON                            │
│          └─ Manual JSON extraction from output               │
└─────────────────────────────────────────────────────────────┘
```

### Issues with Current Approach

1. **No Type Safety**: CLI output is untyped JSON, requires manual parsing
2. **Stdin Workaround**: Claude CLI hangs without `proc.stdin.end()`
3. **Manual Buffering**: Must collect stdout/stderr chunks manually
4. **No Streaming**: Wait for full output, can't process incrementally
5. **Limited Error Info**: Only exit codes and stderr text
6. **No Hooks**: Can't intercept tool calls for gate enforcement
7. **Session Management**: Must parse JSON to extract session ID

---

## Target State (v0.2.0)

AgentGate v0.2.0 uses the official Claude Agent SDK:

### SDK-Based Driver Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  ClaudeAgentSDKDriver                        │
├─────────────────────────────────────────────────────────────┤
│  execute(request: AgentRequest): Promise<AgentResult>       │
│    │                                                         │
│    ├─► Build Options object                                  │
│    │     ├─ cwd: workspacePath                              │
│    │     ├─ allowedTools: [...]                             │
│    │     ├─ permissionMode: 'bypassPermissions'             │
│    │     ├─ maxTurns: N                                     │
│    │     └─ hooks: { PreToolUse: [...], PostToolUse: [...] }│
│    │                                                         │
│    ├─► query({ prompt, options })                            │
│    │     └─ Returns AsyncGenerator<SDKMessage>               │
│    │                                                         │
│    ├─► for await (const msg of query(...))                   │
│    │     ├─ SDKSystemMessage (init)                          │
│    │     ├─ SDKAssistantMessage (responses)                  │
│    │     ├─ SDKUserMessage (tool results)                    │
│    │     └─ SDKResultMessage (final result)                  │
│    │                                                         │
│    └─► Return typed AgentResult                              │
│          ├─ success: boolean                                 │
│          ├─ result: string                                   │
│          ├─ sessionId: string                                │
│          ├─ tokensUsed: { input, output }                    │
│          └─ toolCalls: ToolCallRecord[]                      │
└─────────────────────────────────────────────────────────────┘
```

### Benefits of SDK Approach

1. **Full Type Safety**: All messages are typed with TypeScript
2. **Async Iterators**: Native streaming support
3. **Built-in Abort**: AbortController for cancellation/timeout
4. **Hooks System**: Intercept tool calls for validation
5. **Session Management**: Built-in resume/continue support
6. **Structured Output**: JSON schema validation for results
7. **Error Classes**: Typed errors for different failure modes

---

## SDK Message Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Message Timeline                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. SDKSystemMessage (type: 'system', subtype: 'init')      │
│     └─ session_id, tools, model, permissionMode             │
│                                                              │
│  2. SDKAssistantMessage (type: 'assistant')                 │
│     └─ message.content: TextBlock | ToolUseBlock            │
│                                                              │
│  3. SDKUserMessage (type: 'user') [tool result]             │
│     └─ message.content: ToolResultBlock                     │
│                                                              │
│  ... [repeat 2-3 for each turn] ...                         │
│                                                              │
│  N. SDKResultMessage (type: 'result')                       │
│     ├─ subtype: 'success' | 'error_max_turns' | ...         │
│     ├─ result: string (final text)                          │
│     ├─ session_id: string                                   │
│     ├─ usage: { input_tokens, output_tokens, ... }          │
│     ├─ total_cost_usd: number                               │
│     └─ num_turns: number                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Hooks for Gate Integration

The SDK's hooks system enables future gate enforcement:

### PreToolUse Hook

```typescript
hooks: {
  PreToolUse: [{
    matcher: "Edit|Write|Bash",
    hooks: [async (input, toolUseId) => {
      // Validate tool call against gate rules
      // Return { permissionDecision: 'allow' | 'deny' }
    }]
  }]
}
```

### PostToolUse Hook

```typescript
hooks: {
  PostToolUse: [{
    matcher: "Edit|Write",
    hooks: [async (input, toolUseId) => {
      // Log file changes for snapshot tracking
      // Return { additionalContext: "File modified" }
    }]
  }]
}
```

---

## Options Mapping

| AgentRequest Field | SDK Options Field |
|--------------------|-------------------|
| `workspacePath` | `cwd` |
| `taskPrompt` | `prompt` |
| `constraints.maxTurns` | `maxTurns` |
| `constraints.allowedTools` | `allowedTools` |
| `constraints.disallowedTools` | `disallowedTools` |
| `constraints.permissionMode` | `permissionMode` |
| `constraints.additionalSystemPrompt` | `systemPrompt.append` |
| `sessionId` | `resume` |
| `timeoutMs` | `abortController` (setTimeout) |

---

## Driver Interface

Both drivers implement the same `AgentDriver` interface:

```typescript
interface AgentDriver {
  readonly name: string;
  readonly version: string;

  isAvailable(): Promise<boolean>;
  getCapabilities(): DriverCapabilities;
  execute(request: AgentRequest): Promise<AgentResult>;
}
```

This allows swapping implementations without changing consuming code.

---

## Migration Strategy

1. **Create New Driver**: `ClaudeAgentSDKDriver` alongside existing
2. **Factory Pattern**: Select driver based on configuration
3. **Feature Parity**: Ensure all existing functionality works
4. **Deprecate Old**: Mark subprocess driver as deprecated
5. **Remove Later**: Delete subprocess driver in future version
