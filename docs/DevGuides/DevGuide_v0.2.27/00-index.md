# DevGuide v0.2.27: Dog Fooding Readiness

**Version**: 0.2.27
**Title**: Dog Fooding Readiness - Self-Improvement Infrastructure
**Status**: Not Started
**Estimated Effort**: 5-7 days
**Prerequisites**: v0.2.26 complete (GitHub URL support, Docker sandbox fixes)

---

## Executive Summary

This DevGuide prepares AgentGate for **dog fooding** — the ability to use AgentGate to improve AgentGate itself. This is the ultimate capability test: if the system can reliably modify its own codebase, pass its own verification gates, and deliver working changes, it can handle virtually any software engineering task.

Dog fooding is not just a nice-to-have. It's the **gateway to autonomous improvement**. Once achieved:
- Bug fixes can be automated
- Feature development can be parallelized across agents
- The system can evolve faster than manual development
- We validate every architectural assumption through real use

---

## Success Criteria

### Primary Goal
AgentGate can successfully execute work orders that modify the AgentGate codebase itself, with verification gates catching regressions.

### Specific Outcomes
1. **Safe self-modification**: Agent can modify non-core modules without breaking its own execution
2. **Atomic state management**: Crashes mid-execution can be recovered
3. **Comprehensive feedback**: Agent receives actionable information when verification fails
4. **Resource cleanup guaranteed**: No orphaned containers, processes, or file handles
5. **Agent self-awareness**: Agent knows it's running in a sandbox and behaves accordingly

### Verification
- [ ] Successfully dog food CLAUDE.md creation
- [ ] Successfully dog food test additions for orchestrator
- [ ] Successfully dog food feedback generator improvements
- [ ] All 1800+ existing tests continue to pass
- [ ] No increase in flaky test rate

---

## Document Structure

| File | Focus Area | Thrusts |
|------|------------|---------|
| [01-overview.md](./01-overview.md) | Architecture & Current State | Context for all changes |
| [02-infrastructure.md](./02-infrastructure.md) | Core Infrastructure | Thrusts 1-5: State persistence, timeouts, shutdown |
| [03-robustness.md](./03-robustness.md) | Error Handling & Recovery | Thrusts 6-10: Cleanup, rate limits, error propagation |
| [04-extensibility.md](./04-extensibility.md) | Extensibility Framework | Thrusts 11-15: Plugin system, configuration, hooks |
| [05-developer-experience.md](./05-developer-experience.md) | Developer Experience | Thrusts 16-20: CLAUDE.md, logging, debugging |
| [06-appendices.md](./06-appendices.md) | Reference Materials | Checklists, file index, diagrams |

---

## Thrust Overview

### Phase 1: Critical Infrastructure (Must Do First)

| Thrust | Name | Priority | Est. Hours |
|--------|------|----------|------------|
| 1 | Write-Ahead State Persistence | CRITICAL | 4 |
| 2 | AbortSignal-Based Timeout System | CRITICAL | 3 |
| 3 | Atomic Graceful Shutdown | CRITICAL | 3 |
| 4 | Guaranteed Sandbox Cleanup | CRITICAL | 3 |
| 5 | Merge Conflict Detection | CRITICAL | 2 |

### Phase 2: Robustness & Recovery

| Thrust | Name | Priority | Est. Hours |
|--------|------|----------|------------|
| 6 | Error Propagation Framework | HIGH | 4 |
| 7 | GitHub Rate Limit Handling | HIGH | 3 |
| 8 | Process Tracking Persistence | HIGH | 3 |
| 9 | Deadlock Detection for Spawning | HIGH | 3 |
| 10 | Resource Limit Enforcement | MEDIUM | 3 |

### Phase 3: Extensibility

| Thrust | Name | Priority | Est. Hours |
|--------|------|----------|------------|
| 11 | Configuration Registry System | MEDIUM | 4 |
| 12 | Plugin Architecture Foundation | MEDIUM | 5 |
| 13 | Event Bus for Observability | MEDIUM | 3 |
| 14 | Custom Gate Type Support | MEDIUM | 4 |
| 15 | Agent Capability Negotiation | MEDIUM | 3 |

### Phase 4: Developer Experience

| Thrust | Name | Priority | Est. Hours |
|--------|------|----------|------------|
| 16 | Comprehensive CLAUDE.md | HIGH | 3 |
| 17 | Enhanced Feedback Generator | HIGH | 4 |
| 18 | Structured Logging Overhaul | MEDIUM | 3 |
| 19 | Debug Mode & Dry Runs | MEDIUM | 3 |
| 20 | Interactive Development Server | LOW | 4 |

---

## Dependencies Between Thrusts

```
Phase 1 (Sequential - Infrastructure)
  Thrust 1 ──► Thrust 2 ──► Thrust 3
                              │
  Thrust 4 ◄──────────────────┘
       │
  Thrust 5 (can parallel with 4)

Phase 2 (Parallel after Phase 1)
  Thrust 6 ──► Thrust 7
  Thrust 8 ──► Thrust 9
  Thrust 10 (independent)

Phase 3 (After Phase 2)
  Thrust 11 ──► Thrust 12 ──► Thrust 13
                   │
  Thrust 14 ◄──────┘
  Thrust 15 (after 14)

Phase 4 (Can start after Thrust 6)
  Thrust 16 (independent - can start early)
  Thrust 17 (after Thrust 6)
  Thrust 18 ──► Thrust 19 ──► Thrust 20
```

---

## Quick Start

### For AI Coding Agents

1. Read `01-overview.md` to understand current architecture
2. Execute Phase 1 thrusts sequentially (1 → 2 → 3 → 4 → 5)
3. After Phase 1, thrusts can be parallelized per the dependency graph
4. Run `pnpm test` after each thrust
5. Create completion reports in `reports/`

### For Human Developers

1. Review the overview to understand the goal
2. Pick a thrust from your assigned phase
3. Follow subtasks in order
4. Run verification steps before marking complete
5. Update the checklist in appendices

### Minimum Viable Dog Fooding

To achieve basic dog fooding capability, complete:
- **Thrust 1**: State persistence (prevents data loss)
- **Thrust 3**: Graceful shutdown (prevents corruption)
- **Thrust 4**: Sandbox cleanup (prevents resource leaks)
- **Thrust 16**: CLAUDE.md (agent understanding)

These 4 thrusts unlock safe self-modification for non-core modules.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing tests | Medium | High | Run full suite after each thrust |
| State migration issues | Low | High | Implement backward compatibility |
| Performance regression | Low | Medium | Add benchmarks in verification |
| Circular dependency creation | Medium | Medium | Careful import management |

---

## Out of Scope

The following are explicitly NOT part of this DevGuide:
- UI/Dashboard improvements
- New agent driver implementations
- Kubernetes deployment support
- Multi-node distributed execution
- Authentication/authorization overhaul

These may be addressed in future DevGuides after dog fooding is proven.

---

## References

- [AGENTS.md](../../../AGENTS.md) - Engineering standards
- [README.md](../../../README.md) - Project overview
- [ExecSummary.md](../../ExecSummary.md) - Original vision document
- [v0.2.26 Changes](../DevGuide_v0.2.26/) - Previous version (GitHub URL support)

---

**Next**: [01-overview.md](./01-overview.md) - Architecture & Current State Analysis
