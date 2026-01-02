# DevGuide v0.2.23: Queue Robustness Tactical Fixes

**Version**: 0.2.23
**Status**: Ready for Implementation
**Author**: AgentGate Team
**Created**: 2026-01-02
**Reference**: [queue-robustness-v0.2.23.md](../../proposals/queue-robustness-v0.2.23.md)

## Executive Summary

This guide covers **tactical bug fixes** to the existing queue system, addressing immediate operational issues discovered during testing. These fixes are designed to be implemented quickly while the larger architectural refactor (v0.2.22) is being developed.

### Relationship to v0.2.22

| Version | Scope | Timeline | Purpose |
|---------|-------|----------|---------|
| **v0.2.23** (this) | Tactical fixes | Immediate | Fix critical bugs in current system |
| **v0.2.22** | Architectural refactor | Follow-on | Complete queue system overhaul |

v0.2.23 fixes enable the current system to operate reliably while v0.2.22's new architecture is being built and tested.

## Problems Addressed

| # | Problem | Severity | Wave |
|---|---------|----------|------|
| 1 | Cannot cancel running work orders | CRITICAL | 1 |
| 2 | No purge endpoint for work order history | HIGH | 1 |
| 3 | No force kill for stuck processes | CRITICAL | 1 |
| 4 | No timeout enforcement for work orders | HIGH | 1 |
| 5 | Corrupted JSON files in storage | MEDIUM | 1 |
| 6 | Run store orphans (missing run.json) | MEDIUM | 1 |
| 7 | No queue health visibility | MEDIUM | 1 |
| 8 | Workspace source API ignores owner field | HIGH | 1 |
| 9 | No auto-queue processing | CRITICAL | 2 |
| 10 | No stale work order detection | HIGH | 2 |
| 11 | No CLI for queue management | LOW | 3 |

## Document Structure

| Document | Description |
|----------|-------------|
| [01-overview.md](./01-overview.md) | Architecture context and approach |
| [02-thrust-wave1-foundation.md](./02-thrust-wave1-foundation.md) | Wave 1: 8 parallel foundation fixes |
| [03-thrust-wave2-automation.md](./03-thrust-wave2-automation.md) | Wave 2: Auto-queue and stale detection |
| [04-thrust-wave3-cli.md](./04-thrust-wave3-cli.md) | Wave 3: CLI utilities |
| [05-appendix-known-issues.md](./05-appendix-known-issues.md) | Known issues and mitigations |

## Wave Execution Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    Wave Execution Strategy                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Wave 1: Foundation (8 Parallel)                                │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐       │
│  │1.1 │ │1.2 │ │1.3 │ │1.4 │ │1.5 │ │1.6 │ │1.7 │ │1.8 │       │
│  └──┬─┘ └──┬─┘ └──┬─┘ └──┬─┘ └──┬─┘ └──┬─┘ └──┬─┘ └──┬─┘       │
│     └──────┴──────┴──────┴──────┴──────┴──────┴──────┘          │
│                          ↓ Merge All                             │
│  Wave 2: Automation (Sequential)                                │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │ 2.1 Auto-Queue  │ ──→ │ 2.2 Stale Detect│                    │
│  └────────┬────────┘     └────────┬────────┘                    │
│           └──────────────────────┘                              │
│                          ↓ Merge All                             │
│  Wave 3: CLI (Parallel with Wave 2)                             │
│  ┌─────────────────┐                                            │
│  │   3.1 CLI       │                                            │
│  └─────────────────┘                                            │
│                                                                  │
│  Total: 11 tasks across 3 waves                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Critical Configuration

Before implementing, ensure these mitigations are in place:

```bash
# .env configuration for stability
AGENTGATE_SANDBOX_PROVIDER=subprocess
AGENTGATE_MAX_CONCURRENT_RUNS=2  # Prevents OOM
```

**Memory Requirements:**
| Concurrent Runs | Minimum RAM |
|-----------------|-------------|
| 1 | 4GB |
| 2 | 8GB |
| 3 | 12GB |
| 5 | 20GB |

## Success Criteria

- [ ] Cancel running work orders via API
- [ ] Purge work order history via API
- [ ] Force kill stuck processes
- [ ] Work orders auto-timeout after configured duration
- [ ] Corrupted JSON files quarantined on startup
- [ ] Orphaned runs cleaned up on startup
- [ ] Queue health visible via API
- [ ] Workspace source API accepts all input formats
- [ ] Work orders auto-start without manual trigger
- [ ] Stale work orders detected and recovered
- [ ] CLI available for queue management

## Verification Plan

For each wave:
1. Submit all work orders in the wave
2. Trigger with 60-second stagger delay
3. Monitor until completion
4. Run `pnpm typecheck && pnpm test`
5. Merge PRs
6. Proceed to next wave
