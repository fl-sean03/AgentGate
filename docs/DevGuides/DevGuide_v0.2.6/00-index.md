# DevGuide v0.2.6: Subscription-Based Agent Driver

## Overview

Add a subscription-aware Claude Code driver that uses the user's Claude Max/Pro subscription instead of API credits, reducing costs for heavy agent workloads. Additionally, simplify the driver architecture to focus on 4 core CLI-based drivers.

---

## Quick Reference

| Attribute | Value |
|-----------|-------|
| Version | 0.2.6 |
| Status | Complete |
| Priority | High |
| Effort | 3-4 hours |

---

## Problem Statement

The current `claude-code` agent driver passes the full environment to Claude Code subprocesses, including `ANTHROPIC_API_KEY`. When this key is present, Claude Code uses API credits (pay-per-token) instead of the user's Pro/Max subscription quota.

For AgentGate users with Max subscriptions, this means:
- Paying API credits when subscription quota is available
- No visibility into which billing method is being used
- No way to explicitly choose subscription-based billing

Additionally, the driver architecture had unnecessary complexity with SDK-based drivers that weren't needed for CLI-focused agent execution.

---

## Solution

Create a subscription-aware driver that:
1. Detects subscription credentials in `~/.claude/.credentials.json`
2. Explicitly excludes `ANTHROPIC_API_KEY` from the subprocess environment
3. Validates subscription availability before execution
4. Provides clear feedback on billing method being used

Simplify drivers to focus on 4 core CLI-based drivers:
1. Claude Code API Driver - Uses `ANTHROPIC_API_KEY` for billing
2. Claude Code Subscription Driver - Uses Max/Pro subscription for billing
3. OpenAI Codex Driver - Uses OpenAI Codex CLI
4. OpenCode Driver - Uses SST OpenCode CLI

---

## Success Criteria

- [x] New `claude-code-subscription` driver that uses Max/Pro subscription
- [x] Detection of valid subscription credentials
- [x] Explicit exclusion of `ANTHROPIC_API_KEY` from subprocess
- [x] CLI option `--agent claude-code-subscription` works
- [x] Clear logging of which billing method is used
- [x] All existing tests pass
- [x] New unit tests for subscription driver
- [x] TypeScript compiles without errors
- [x] Driver architecture simplified to 4 drivers

---

## Thrust Overview

| # | Name | Description |
|---|------|-------------|
| 1 | Subscription Detection | Add utility to detect and validate subscription credentials |
| 2 | Subscription Driver | Create `ClaudeCodeSubscriptionDriver` class |
| 3 | Driver Registration | Register new driver in agent module and CLI |
| 4 | Testing | Unit tests for subscription detection and driver |
| 5 | Driver Simplification | Remove unused SDK drivers, keep 4 core drivers |

---

## Document Navigation

| Document | Contents |
|----------|----------|
| [01-overview.md](./01-overview.md) | Architecture, design decisions, technical background |
| [02-implementation.md](./02-implementation.md) | Detailed thrust specifications |
| [03-appendices.md](./03-appendices.md) | File references, checklists |

---

## Key Files

### New Files
- `src/agent/subscription-detector.ts` - Detect subscription credentials
- `src/agent/claude-code-subscription-driver.ts` - Subscription-based driver
- `src/types/subscription.ts` - Subscription type definitions
- `test/subscription-detector.test.ts` - Unit tests

### Modified Files
- `src/agent/index.ts` - Export new driver, remove unused drivers
- `src/types/work-order.ts` - Add `claude-code-subscription` agent type
- `src/orchestrator/orchestrator.ts` - Handle subscription driver selection
- `test/openai-drivers.test.ts` - Update tests for new driver structure

### Removed Files
- `src/agent/claude-agent-sdk-driver.ts` - Unused SDK driver
- `src/agent/sdk-message-parser.ts` - SDK utilities
- `src/agent/sdk-options-builder.ts` - SDK utilities
- `src/agent/sdk-hooks.ts` - SDK utilities
- `src/agent/openai-agents-driver.ts` - Unused agents driver

---

## Final Driver Architecture

| Driver | Name | Billing Method | CLI Tool |
|--------|------|----------------|----------|
| ClaudeCodeDriver | `claude-code` | API credits | `claude` |
| ClaudeCodeSubscriptionDriver | `claude-code-subscription` | Max/Pro subscription | `claude` |
| OpenAICodexDriver | `openai-codex` | OpenAI API | `codex` |
| OpenCodeDriver | `opencode` | OpenAI API | `opencode` |
