# DevGuide v0.2.6: Subscription-Based Agent Driver

## Overview

Add a subscription-aware Claude Code driver that uses the user's Claude Max/Pro subscription instead of API credits, reducing costs for heavy agent workloads.

---

## Quick Reference

| Attribute | Value |
|-----------|-------|
| Version | 0.2.6 |
| Status | In Progress |
| Priority | High |
| Estimated Effort | 2-3 hours |

---

## Problem Statement

The current `claude-code` agent driver passes the full environment to Claude Code subprocesses, including `ANTHROPIC_API_KEY`. When this key is present, Claude Code uses API credits (pay-per-token) instead of the user's Pro/Max subscription quota.

For AgentGate users with Max subscriptions, this means:
- Paying API credits when subscription quota is available
- No visibility into which billing method is being used
- No way to explicitly choose subscription-based billing

---

## Solution

Create a subscription-aware driver that:
1. Detects subscription credentials in `~/.claude/.credentials.json`
2. Explicitly excludes `ANTHROPIC_API_KEY` from the subprocess environment
3. Validates subscription availability before execution
4. Provides clear feedback on billing method being used

---

## Success Criteria

- [ ] New `claude-code-subscription` driver that uses Max/Pro subscription
- [ ] Detection of valid subscription credentials
- [ ] Explicit exclusion of `ANTHROPIC_API_KEY` from subprocess
- [ ] CLI option `--agent claude-code-subscription` works
- [ ] Clear logging of which billing method is used
- [ ] All existing tests pass
- [ ] New unit tests for subscription driver
- [ ] TypeScript compiles without errors

---

## Thrust Overview

| # | Name | Description |
|---|------|-------------|
| 1 | Subscription Detection | Add utility to detect and validate subscription credentials |
| 2 | Subscription Driver | Create `ClaudeCodeSubscriptionDriver` class |
| 3 | Driver Registration | Register new driver in agent module and CLI |
| 4 | Testing | Unit tests for subscription detection and driver |

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
- `test/subscription-detector.test.ts` - Unit tests

### Modified Files
- `src/agent/index.ts` - Export new driver
- `src/control-plane/commands/submit.ts` - Add agent type option
- `src/types/agent.ts` - Add subscription types (if needed)
