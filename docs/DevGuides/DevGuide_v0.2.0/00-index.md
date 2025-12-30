# DevGuide v0.2.0: Claude Agent SDK Migration

**Status**: In Progress
**Version**: 0.2.0
**Focus**: Replace subprocess-based CLI execution with official Claude Agent SDK

---

## Executive Summary

Migrate AgentGate from raw `child_process.spawn` execution of the Claude CLI to the official `@anthropic-ai/claude-agent-sdk` TypeScript SDK. This provides a more robust, type-safe, and feature-rich interface for headless agent execution with proper streaming support, hooks, and session management.

---

## Success Criteria

1. Agent execution uses the official TypeScript SDK instead of subprocess spawning
2. All existing tests pass with the new driver implementation
3. Live E2E test successfully creates files using the SDK-based driver
4. Streaming output is properly captured and parsed
5. Session management (resume/continue) works correctly
6. Error handling is robust with typed error classes
7. Hooks infrastructure is in place for future gate integration

---

## Thrust Overview

| # | Thrust | Status | Description |
|---|--------|--------|-------------|
| 1 | Install SDK Dependencies | Pending | Add `@anthropic-ai/claude-agent-sdk` and `zod` |
| 2 | Create SDK-Based Driver | Pending | Implement new driver using `query()` function |
| 3 | Update Type Definitions | Pending | Add SDK message types and update AgentResult |
| 4 | Implement Message Parsing | Pending | Parse SDK messages into structured output |
| 5 | Add Hooks Support | Pending | Implement PreToolUse/PostToolUse hooks infrastructure |
| 6 | Update Command Builder | Pending | Adapt options building for SDK format |
| 7 | Update Tests | Pending | Modify tests for new driver interface |
| 8 | Live E2E Validation | Pending | Validate full workflow with real agent |

---

## Navigation

- [01-overview.md](./01-overview.md) - Architecture comparison and rationale
- [02-implementation.md](./02-implementation.md) - Detailed implementation thrusts
- [03-appendices.md](./03-appendices.md) - File references, SDK API quick reference
- [reports/](./reports/) - Completion reports

---

## Quick Reference

### Current Implementation (v0.1.x)

```typescript
// Raw subprocess spawning
const proc = spawn('claude', args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
proc.stdin?.end();
// Manual stdout/stderr buffering
// Manual timeout handling
// Manual JSON parsing
```

### Target Implementation (v0.2.0)

```typescript
// Official SDK
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: taskPrompt,
  options: {
    cwd: workspacePath,
    allowedTools: ["Read", "Edit", "Write", "Bash"],
    permissionMode: "bypassPermissions",
    maxTurns: 10,
  }
})) {
  // Type-safe message handling
}
```

### Key Benefits

| Aspect | CLI Subprocess | SDK |
|--------|---------------|-----|
| Type Safety | None | Full TypeScript types |
| Streaming | Manual buffering | Async iterators |
| Error Handling | Parse stderr | Typed error classes |
| Session Management | Parse JSON output | Built-in resume/continue |
| Hooks | Not available | PreToolUse, PostToolUse, etc. |
| Timeout | Manual setTimeout | Built-in abort controller |
| Stdin Workaround | Required `proc.stdin.end()` | Not needed |

---

## Dependencies

### New Packages

```json
{
  "@anthropic-ai/claude-agent-sdk": "^0.1.50",
  "zod": "^3.22.4"
}
```

### Compatibility

- Node.js >= 20.0.0 (already required)
- TypeScript >= 5.3.3 (already installed)
- Claude Code CLI bundled with SDK (no separate install needed)

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| SDK is relatively new (v0.1.x) | Pin to specific version, monitor changelog |
| Breaking API changes | Use TypeScript strict mode, comprehensive tests |
| Different output format | Implement adapter layer for backward compat |
| Performance overhead | SDK wraps CLI, minimal overhead expected |
