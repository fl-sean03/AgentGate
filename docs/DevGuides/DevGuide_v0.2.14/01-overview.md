# 01: Overview - Claude Agent SDK Integration

## Current State Analysis

### Existing Driver Architecture

AgentGate currently has four drivers, all using subprocess spawning:

| Driver | Status | Implementation |
|--------|--------|----------------|
| `claude-code-subscription-driver` | Active, Primary | CLI subprocess |
| `claude-code-driver` | Active | CLI subprocess |
| `openai-codex-driver` | Active | OpenAI SDK |
| `opencode-driver` | Active | OpenCode SDK |

The Claude drivers spawn the CLI binary:

```typescript
const proc = spawn('claude', args, {
  cwd: request.workspacePath,
  env: cleanEnv,
});
```

### Why Add SDK Driver?

The Claude Agent SDK provides significant advantages for API-key users:

| Feature | CLI Subprocess | Agent SDK |
|---------|---------------|-----------|
| Sandboxing | None (v0.2.13 adds Docker) | Built-in (bubblewrap/Seatbelt) |
| Message streaming | Parse stdout JSON | Native async generator |
| Tool hooks | Not available | PreToolUse, PostToolUse, etc. |
| Error handling | Exit codes + stderr | Structured exceptions |
| Cost tracking | Estimate | Exact from SDK |
| Session management | --resume flag | SDK resume parameter |
| Type safety | Parse JSON output | Full TypeScript types |

### SDK vs Subscription: The Billing Split

**Critical constraint:** The SDK does not support subscription billing.

```
User has...              →  Use this driver
─────────────────────────────────────────────
ANTHROPIC_API_KEY        →  ClaudeAgentSDKDriver
Claude Pro/Max subscription → ClaudeCodeSubscriptionDriver
```

This DevGuide adds the SDK driver as an **alternative**, not a replacement.

---

## Claude Agent SDK Overview

### What the SDK Provides

The Claude Agent SDK is the programmatic interface to Claude Code:

**Core function - `query()`:**
- Takes a prompt and options
- Returns an async generator of messages
- Handles the full agent loop internally
- Manages tools, context, and session

**Built-in tools:**
- File operations (Read, Write, Edit, Glob, Grep)
- Bash command execution
- Web search and fetch
- Notebook editing

**Hooks system:**
- PreToolUse - Validate/block before tool runs
- PostToolUse - Log/process after tool completes
- Notification - Handle system notifications
- Stop - Custom stop conditions

### SDK Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Application                         │
│                                                              │
│  const result = query({ prompt, options });                 │
│  for await (const msg of result) { ... }                    │
│                                                              │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Claude Agent SDK                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Query     │  │   Hooks     │  │   Sandbox           │  │
│  │   Manager   │  │   System    │  │   (bubblewrap)      │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                    │              │
│         └────────────────┼────────────────────┘              │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Runtime                       │
│  • Tool execution                                            │
│  • Context management                                        │
│  • Model interaction                                         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Anthropic API                             │
│  • ANTHROPIC_API_KEY authentication                         │
│  • Token-based billing                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Design Decisions

### Decision 1: New Driver, Not Replacement

**Options:**
1. Replace claude-code-driver with SDK
2. Add SDK as new driver alongside existing
3. Make SDK the only option

**Decision:** Add as new driver (option 2).

**Rationale:**
- Subscription users must keep using CLI subprocess
- API users get SDK benefits
- No breaking changes
- Clear separation of concerns

### Decision 2: Driver Naming

**Options:**
1. `claude-agent-sdk` (matches SDK name)
2. `claude-code-api` (describes billing)
3. `claude-sdk` (short)

**Decision:** `claude-agent-sdk`

**Rationale:**
- Matches official SDK package name
- Clear distinction from subscription driver
- Indicates it's using the SDK, not CLI

### Decision 3: Streaming vs Batch

**Options:**
1. Collect all messages, return at end
2. Stream messages as they arrive
3. Hybrid with progress callbacks

**Decision:** Stream messages with collection.

**Rationale:**
- SDK naturally streams via async generator
- Collect messages for AgentResult compatibility
- Enable future real-time dashboard updates

### Decision 4: SDK Sandbox vs Container Sandbox

**Options:**
1. Use only SDK sandbox (bubblewrap)
2. Use only container sandbox (v0.2.13)
3. Allow both, configurable

**Decision:** Configurable, SDK sandbox by default for SDK driver.

**Rationale:**
- SDK sandbox is optimized for Claude Code
- Container sandbox provides stronger isolation
- Let users choose based on security needs
- SDK sandbox has less overhead

### Decision 5: Hook Integration

**Options:**
1. Expose all SDK hooks to driver interface
2. Use hooks internally only
3. Map hooks to existing patterns

**Decision:** Use hooks internally, expose key ones.

**Rationale:**
- PreToolUse for validation/logging
- PostToolUse for file change tracking
- Don't overwhelm driver interface
- Gate integration via hooks

---

## Integration with AgentGate

### How SDK Driver Fits

The SDK driver implements the same `AgentDriver` interface:

```typescript
interface AgentDriver {
  name: string;
  isAvailable(): Promise<boolean>;
  getCapabilities(): DriverCapabilities;
  execute(request: AgentRequest): Promise<AgentResult>;
}
```

This ensures:
- Orchestrator works unchanged
- Run executor works unchanged
- All existing flows continue

### Mapping AgentRequest to SDK Options

| AgentRequest field | SDK Option |
|-------------------|------------|
| taskPrompt | prompt |
| constraints.maxTurns | maxTurns |
| timeoutMs | AbortController timeout |
| sessionId | resume |
| workspacePath | (set as cwd) |

### Mapping SDK Result to AgentResult

| SDK Message | AgentResult field |
|-------------|-------------------|
| SDKSystemMessage.session_id | sessionId |
| SDKResultMessage.usage | tokensUsed |
| SDKResultMessage.cost | (new: totalCost) |
| SDKAssistantMessage[] | structuredOutput |
| Exit status | success, exitCode |

---

## Capability Differences

### SDK Driver Capabilities

```typescript
const SDK_CAPABILITIES: DriverCapabilities = {
  supportsSessionResume: true,
  supportsStructuredOutput: true,
  supportsToolRestriction: true,
  supportsTimeout: true,
  supportsHooks: true,           // NEW
  supportsSandbox: true,         // Built-in
  supportsStreaming: true,       // NEW
  supportsCostTracking: true,    // NEW
  maxTurns: 100,
  billingMethod: 'api-key',      // NEW
};
```

### Extended AgentResult

```typescript
interface AgentResult {
  // Existing fields...

  // New SDK-specific fields
  totalCostUsd?: number;         // Exact cost from SDK
  toolCalls?: ToolCallRecord[];  // Detailed tool usage
  streamedMessages?: SDKMessage[]; // Raw message stream
}
```

---

## References

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Agent SDK TypeScript GitHub](https://github.com/anthropics/claude-agent-sdk-typescript)
- [SDK Hooks Documentation](https://platform.claude.com/docs/en/agent-sdk/hooks)
- [SDK Quickstart](https://platform.claude.com/docs/en/agent-sdk/quickstart)
