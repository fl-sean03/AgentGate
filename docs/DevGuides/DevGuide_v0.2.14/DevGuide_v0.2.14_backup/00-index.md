# 00: Index - Claude Agent SDK Integration

## DevGuide v0.2.14

**Title:** Claude Agent SDK Integration
**Status:** Not Started
**Prerequisites:** v0.2.13 (Container Sandboxing), v0.2.6 (Subscription Driver)

---

## Executive Summary

Integrate the official Claude Agent SDK for API-key-based execution while preserving the CLI subprocess approach for subscription billing. This creates two distinct execution paths:

1. **claude-code-subscription-driver** (existing) - CLI subprocess, uses OAuth subscription
2. **claude-agent-sdk-driver** (new) - SDK integration, uses API key billing

The SDK provides built-in sandboxing, streaming, hooks, and a cleaner programmatic interface.

---

## Problem Statement

Currently, all Claude Code drivers spawn the CLI binary as a subprocess:

| Driver | Billing | Implementation |
|--------|---------|----------------|
| claude-code-driver | API key | CLI subprocess |
| claude-code-subscription-driver | Subscription | CLI subprocess |

**Issues with CLI subprocess for API billing:**
- No built-in sandboxing (SDK has bubblewrap/Seatbelt)
- Manual output parsing (SDK provides structured messages)
- No hook system (SDK has PreToolUse, PostToolUse, etc.)
- Less control over execution (SDK has AbortController, streaming)

**Why not use SDK for subscription?**
- SDK explicitly does NOT support subscription billing
- "We do not allow third party developers to offer Claude.ai login" - Anthropic docs
- CLI subprocess is the only option for Pro/Max subscribers

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Agent Driver Factory                            │
│                                                                          │
│  ┌─────────────────────────┐     ┌─────────────────────────────────┐   │
│  │  ClaudeAgentSDKDriver   │     │  ClaudeCodeSubscriptionDriver   │   │
│  │  (API Key Billing)      │     │  (Subscription Billing)         │   │
│  │                         │     │                                 │   │
│  │  • Uses SDK query()     │     │  • Uses CLI spawn()             │   │
│  │  • Built-in sandbox     │     │  • Container sandbox (v0.2.13)  │   │
│  │  • Streaming messages   │     │  • Output parsing               │   │
│  │  • Native hooks         │     │  • Session via --resume         │   │
│  └───────────┬─────────────┘     └───────────────┬─────────────────┘   │
│              │                                   │                      │
└──────────────┼───────────────────────────────────┼──────────────────────┘
               │                                   │
               ▼                                   ▼
┌──────────────────────────┐     ┌────────────────────────────────────────┐
│  Claude Agent SDK        │     │  Claude CLI Binary                     │
│  @anthropic-ai/claude-   │     │  (spawned as subprocess)               │
│  agent-sdk-typescript    │     │                                        │
│                          │     │  Credentials:                          │
│  Credentials:            │     │  ~/.claude/.credentials.json           │
│  ANTHROPIC_API_KEY       │     │                                        │
└──────────────────────────┘     └────────────────────────────────────────┘
```

---

## Success Criteria

- [ ] Claude Agent SDK integrated as new driver
- [ ] SDK driver uses ANTHROPIC_API_KEY for billing
- [ ] Subscription driver unchanged (CLI subprocess)
- [ ] Streaming message support via async generators
- [ ] Hook system integrated for tool interception
- [ ] Session resume works with SDK
- [ ] Built-in SDK sandboxing available
- [ ] Both drivers pass all existing tests
- [ ] Clear driver selection based on billing preference
- [ ] Dashboard shows billing method

---

## Driver Comparison

| Feature | SDK Driver | Subscription Driver |
|---------|------------|---------------------|
| **Billing** | API key (pay-per-token) | Subscription (flat rate) |
| **Implementation** | SDK `query()` | CLI `spawn()` |
| **Sandboxing** | Built-in (bubblewrap) | Container (v0.2.13) |
| **Streaming** | Native async generator | Parse stdout |
| **Hooks** | Native SDK hooks | Not available |
| **Session Resume** | SDK `resume` param | CLI `--resume` flag |
| **Output** | Structured messages | JSON parsing |
| **Cost Tracking** | SDK provides cost | Estimate from tokens |

---

## Thrust Overview

| # | Name | Description | Files |
|---|------|-------------|-------|
| 1 | SDK Dependencies | Install Claude Agent SDK | 2 |
| 2 | SDK Types | Define SDK-specific types | 2 |
| 3 | Message Parser | Parse SDK message stream | 2 |
| 4 | SDK Driver | Implement ClaudeAgentSDKDriver | 3 |
| 5 | Hooks Integration | Tool interception hooks | 2 |
| 6 | Driver Registry | Update driver selection | 2 |
| 7 | Configuration | SDK-specific config options | 2 |
| 8 | Testing | Comprehensive test coverage | 4 |

---

## File Map

### New Files

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/agent/claude-agent-sdk-driver.ts` | 4 | SDK-based driver |
| `packages/server/src/agent/sdk-message-parser.ts` | 3 | Parse SDK messages |
| `packages/server/src/agent/sdk-options-builder.ts` | 4 | Build SDK options |
| `packages/server/src/agent/sdk-hooks.ts` | 5 | Hook utilities |
| `packages/server/src/types/sdk.ts` | 2 | SDK-specific types |
| `packages/server/test/claude-agent-sdk-driver.test.ts` | 8 | Unit tests |
| `packages/server/test/sdk-integration.test.ts` | 8 | Integration tests |

### Modified Files

| File | Thrust | Changes |
|------|--------|---------|
| `packages/server/package.json` | 1 | Add SDK dependency |
| `packages/server/src/agent/index.ts` | 6 | Export new driver |
| `packages/server/src/agent/registry.ts` | 6 | Register SDK driver |
| `packages/server/src/config/index.ts` | 7 | Add SDK config |
| `packages/server/src/types/index.ts` | 2 | Export SDK types |
| `packages/server/src/types/agent.ts` | 2 | Add SDK capabilities |

---

## Quick Reference

### SDK Query Function

```typescript
import { query, ClaudeAgentOptions } from '@anthropic-ai/claude-agent-sdk';

const result = await query({
  prompt: "Fix the bug in auth.ts",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    maxTurns: 100,
    timeout: 300000,
    hooks: {
      PreToolUse: [{ callback: validateTool }],
      PostToolUse: [{ callback: logToolUse }],
    },
  },
});

for await (const message of result) {
  // Handle streaming messages
}
```

### SDK Message Types

```
SDKSystemMessage   - Session info, tools, model
SDKAssistantMessage - Claude's responses
SDKUserMessage     - User prompts
SDKToolUseMessage  - Tool invocations
SDKToolResultMessage - Tool outputs
SDKResultMessage   - Final result with cost
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Required for SDK |
| `AGENTGATE_SDK_TIMEOUT` | Query timeout (ms) |
| `AGENTGATE_SDK_MAX_TURNS` | Max conversation turns |
| `AGENTGATE_SDK_SANDBOX` | Enable SDK sandbox |

---

## Navigation

| Document | Contents |
|----------|----------|
| [01-overview.md](./01-overview.md) | Current state, SDK architecture, design decisions |
| [02-sdk-setup.md](./02-sdk-setup.md) | Thrusts 1-2: Dependencies and types |
| [03-driver-implementation.md](./03-driver-implementation.md) | Thrusts 3-4: Message parsing and driver |
| [04-hooks-registry.md](./04-hooks-registry.md) | Thrusts 5-6: Hooks and driver registry |
| [05-config-testing.md](./05-config-testing.md) | Thrusts 7-8: Configuration and testing |
| [06-appendices.md](./06-appendices.md) | Checklists, troubleshooting, references |

---

## Dependencies

- `@anthropic-ai/claude-agent-sdk` - Official Claude Agent SDK
- `ANTHROPIC_API_KEY` environment variable
- Node.js 18+ (for async generators)

---

## Important Constraints

### SDK Billing Limitation

The SDK **only** supports API key billing:

> "Unless previously approved, we do not allow third party developers to offer Claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK."

This is why we maintain two drivers:
- **SDK Driver**: For users with API credits
- **Subscription Driver**: For Claude Pro/Max subscribers

### Backward Compatibility

- Existing `claude-code-subscription` agent type unchanged
- New `claude-agent-sdk` agent type added
- Default remains subscription if credentials available
