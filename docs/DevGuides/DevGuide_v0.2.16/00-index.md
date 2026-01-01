# 00: Index - Work Order Harness Configuration

## DevGuide v0.2.16

**Title:** Work Order Harness Configuration System
**Status:** Not Started
**Prerequisites:** v0.2.15 (Production-Grade CI/CD), v0.2.12 (GitHub CI Feedback Loop)

---

## Executive Summary

Implement a configurable harness system that cleanly separates **run-loop control** (AgentGate-owned) from **agent behavior** (repo-native, passthrough). Support named profiles stored in `~/.agentgate/harnesses/`, inline CLI overrides, pluggable loop strategies, and full audit trails of configuration across iterations.

**Key Insight:** Repos often have their own `CLAUDE.md`, MCPs, and agent skills. AgentGate should never inject or modify these - it should only control the run loop, verification, CI behavior, and git operations.

---

## Problem Statement

Current AgentGate work orders have limited configurability:

| Issue | Impact | Solution |
|-------|--------|----------|
| Fixed iteration count only | Wasted iterations or premature stop | Pluggable loop strategies |
| No named profiles | Repetitive CLI flags | Profile system with inheritance |
| No config audit trail | Hard to debug iteration issues | Full config snapshots |
| Scattered CLI options | Hard to remember all flags | Unified HarnessConfig |
| No completion detection | Agent keeps iterating after done | Ralph/Hybrid strategies |

**Research-Backed Design:**

1. **Ralph Wiggum Loop** - Geoffrey Huntley's technique: loop until agent signals completion
2. **Anthropic Harness Pattern** - Two-agent pattern with progress tracking and state bridging
3. **CLAUDE.md Analysis** (328 projects) - Architecture (72.6%), Guidelines (44.8%), Testing (35.4%)

---

## Target Architecture

```
+---------------------------------------------------------------------+
|                       HARNESS CONFIG FLOW                            |
+---------------------------------------------------------------------+
|                                                                      |
|  CLI Options ---+                                                    |
|                 +---> ConfigResolver ---> ResolvedHarnessConfig     |
|  --harness -----+          |                       |                 |
|  profile.yaml              |                       v                 |
|                      inheritance          +----------------+         |
|                      + defaults           | LoopStrategy   |         |
|                                           | Registry       |         |
|                                           +-------+--------+         |
|                                                   |                  |
|                                    +--------------+-------------+    |
|                                    v              v             v    |
|                               Fixed        Hybrid        Ralph       |
|                              Strategy     Strategy      Strategy     |
|                                    |              |             |    |
|                                    +--------------+-------------+    |
|                                                   v                  |
|                                            RunExecutor               |
|                                            (uses strategy            |
|                                             for loop control)        |
|                                                   |                  |
|                                                   v                  |
|                                             AuditTrail               |
|                                           (snapshots config)         |
+---------------------------------------------------------------------+
```

---

## Success Criteria

- [ ] `agentgate submit --harness ci-focused` works with named profile
- [ ] All 4 loop strategies functional: fixed, ralph, hybrid, custom
- [ ] Profile inheritance resolves correctly (`extends: default`)
- [ ] Audit trail captures config snapshots per iteration
- [ ] Existing CLI options continue to work (backwards compatible)
- [ ] Repo-native agent configs (CLAUDE.md, MCPs) passed through unchanged
- [ ] Default hybrid strategy produces better results than fixed iteration
- [ ] Profile management CLI: `agentgate profile list/show/create`

---

## Design Decisions

### 1. Pure Passthrough for Agent Config

AgentGate **never** modifies:
- Repository's CLAUDE.md / agents.md
- Repository's .cursorrules
- Repository's MCP configurations
- Agent's internal prompts

AgentGate only provides:
- Gate plan summary (verification requirements)
- Iteration feedback (what failed, suggestions)

### 2. Default Strategy: Hybrid

Why Hybrid beats alternatives:
- **vs Fixed**: Completion criteria prevent wasted iterations
- **vs Ralph**: Progress tracking prevents infinite loops
- Combines verification levels + no-changes detection + optional CI

### 3. Config Resolution Order

1. CLI inline flags (highest priority)
2. Named profile (`--harness`)
3. Profile inheritance chain (`extends`)
4. Built-in defaults (lowest priority)

---

## Thrust Overview

| # | Name | Description | Files |
|---|------|-------------|-------|
| 1 | Harness Config Types | Define HarnessConfig, LoopStrategyConfig schemas | 3 |
| 2 | Loop Strategy Types | Define LoopStrategy interface, LoopState | 2 |
| 3 | Fixed Strategy | Current iteration behavior as strategy | 2 |
| 4 | Hybrid Strategy | Progress tracking + completion criteria | 2 |
| 5 | Ralph Strategy | Loop-until-complete pattern | 2 |
| 6 | Custom Strategy | Dynamic module loading for user strategies | 2 |
| 7 | Config Loader | YAML parsing and validation | 2 |
| 8 | Config Resolver | Inheritance and default resolution | 2 |
| 9 | Orchestrator Integration | Wire harness into run execution | 3 |
| 10 | CLI Integration | Add --harness and profile commands | 3 |
| 11 | Audit Trail | Config snapshots and change tracking | 2 |
| 12 | Default Profiles | Ship default, ci-focused, rapid, ralph profiles | 4 |

---

## File Map

### New Files (Types)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/types/harness-config.ts` | 1 | HarnessConfig types and Zod schemas |
| `packages/server/src/types/loop-strategy.ts` | 2 | LoopStrategy interface |

### New Files (Harness Module)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/harness/index.ts` | 3-6 | Module exports |
| `packages/server/src/harness/strategy-registry.ts` | 3-6 | Strategy factory registry |
| `packages/server/src/harness/strategies/base-strategy.ts` | 3 | Abstract base class |
| `packages/server/src/harness/strategies/fixed-strategy.ts` | 3 | Fixed iteration strategy |
| `packages/server/src/harness/strategies/hybrid-strategy.ts` | 4 | Hybrid strategy (default) |
| `packages/server/src/harness/strategies/ralph-strategy.ts` | 5 | Ralph loop strategy |
| `packages/server/src/harness/strategies/custom-strategy.ts` | 6 | Custom strategy loader |
| `packages/server/src/harness/config-loader.ts` | 7 | YAML parsing |
| `packages/server/src/harness/config-resolver.ts` | 8 | Inheritance resolution |
| `packages/server/src/harness/config-store.ts` | 8 | Persistence |
| `packages/server/src/harness/audit-trail.ts` | 11 | Audit snapshots |

### New Files (CLI)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/control-plane/commands/profile.ts` | 10 | Profile management CLI |

### Modified Files

| File | Thrust | Changes |
|------|--------|---------|
| `packages/server/src/types/index.ts` | 1-2 | Export new types |
| `packages/server/src/orchestrator/orchestrator.ts` | 9 | Load harness, create strategy |
| `packages/server/src/orchestrator/run-executor.ts` | 9 | Use strategy for loop control |
| `packages/server/src/control-plane/commands/submit.ts` | 10 | Add --harness option |
| `packages/server/src/control-plane/validators.ts` | 10 | Add harness CLI schema |
| `packages/server/src/config/index.ts` | 12 | Add harness defaults |

### Default Profiles

| File | Purpose |
|------|---------|
| `~/.agentgate/harnesses/default.yaml` | Hybrid strategy, balanced |
| `~/.agentgate/harnesses/ci-focused.yaml` | CI as primary gate |
| `~/.agentgate/harnesses/rapid-iteration.yaml` | Fixed 2 iterations |
| `~/.agentgate/harnesses/ralph-style.yaml` | Loop until complete |

---

## Quick Reference

### CLI Usage

```bash
# Use named profile
agentgate submit --harness ci-focused --prompt "..."

# Inline strategy override
agentgate submit --loop-strategy ralph --max-iterations 10 --prompt "..."

# Profile management
agentgate profile list
agentgate profile show ci-focused
agentgate profile create my-profile
```

### Profile YAML Structure

```yaml
name: ci-focused
extends: default
description: "CI-focused workflow with GitHub integration"

loopStrategy:
  mode: hybrid
  maxIterations: 8
  completionCriteria:
    - ci-pass
    - verification-pass
  requireCI: true

verification:
  gatePlanSource: ci-workflow
  waitForCI: true
  ci:
    timeoutSeconds: 2700
    maxIterations: 5

gitOps:
  mode: github-pr
  draftPR: true
```

### Loop Strategy Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `fixed` | Fixed iteration count | Simple tasks, predictable |
| `hybrid` | Progress tracking + completion | Default, best results |
| `ralph` | Loop until complete signal | Long-running, autonomous |
| `custom` | User-defined module | Advanced customization |

---

## Navigation

| Document | Contents |
|----------|----------|
| [01-overview.md](./01-overview.md) | Current state, research, architecture decisions |
| [02-types-schemas.md](./02-types-schemas.md) | Thrusts 1-2: Type definitions |
| [03-loop-strategies.md](./03-loop-strategies.md) | Thrusts 3-6: Strategy implementations |
| [04-config-system.md](./04-config-system.md) | Thrusts 7-8: Config loading and resolution |
| [05-orchestrator-cli.md](./05-orchestrator-cli.md) | Thrusts 9-10: Integration |
| [06-audit-testing.md](./06-audit-testing.md) | Thrusts 11-12: Audit trail and testing |
| [07-appendices.md](./07-appendices.md) | Checklists, troubleshooting, references |

---

## Dependencies

- Existing AgentGate orchestrator and run-executor
- `yaml` package for profile parsing
- `zod` for schema validation (already in use)
- Node.js 18+ (async generators for streaming)

---

## Key Constraints

### Backwards Compatibility

All existing CLI options must continue to work:

| Current Option | New Location | Compatible |
|---------------|--------------|------------|
| `--max-iterations` | `loopStrategy.maxIterations` | Yes |
| `--max-time` | `limits.maxWallClockSeconds` | Yes |
| `--agent` | `agent.type` | Yes |
| `--gate-plan` | `verification.gatePlanSource` | Yes |
| `--wait-for-ci` | `verification.waitForCI` | Yes |
| `--skip-verification` | `verification.skipLevels` | Yes |
| `--network` | `limits.networkAllowed` | Yes |

### Never Inject Agent Config

AgentGate respects repository-native agent configurations:
- CLAUDE.md files are read by the agent, not modified by AgentGate
- MCP servers configured in repo are used as-is
- Agent skills defined in repo are preserved
- .cursorrules and other agent configs are passthrough

---

## Sources

- [Ralph Wiggum Loop](https://ghuntley.com/ralph/) - Geoffrey Huntley's original technique
- [Ralph Orchestrator](https://github.com/mikeyobrien/ralph-orchestrator) - Reference implementation
- [Anthropic Harness Design](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) - Long-running agent patterns
- [Claude Code Configuration Research](https://arxiv.org/html/2511.09268) - Analysis of 328 CLAUDE.md files
