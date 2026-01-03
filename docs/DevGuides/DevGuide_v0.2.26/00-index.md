# DevGuide v0.2.26: ExecutionEngine Integration & Legacy Removal

**Version**: 0.2.26
**Status**: Planning
**Author**: AgentGate Team
**Created**: 2026-01-03
**Prerequisites**: v0.2.25 complete

---

## Executive Summary

v0.2.25 established the modular execution pipeline with phase handlers, ExecutionEngine, and observability. However, the new architecture runs *parallel* to the existing `executeRun()` rather than replacing it. This creates:

1. **Two code paths** - Both `executeRun()` and `ExecutionEngine` exist
2. **Maintenance burden** - Bug fixes must be applied to both paths
3. **Inconsistent behavior** - Edge cases may differ between paths
4. **Confusion** - Developers unsure which path to use

### The Goal

v0.2.26 completes the transition by:

1. **Wiring ExecutionEngine to Orchestrator** - Make it the default execution path
2. **Deprecating executeRun()** - Mark for removal with clear migration path
3. **Removing legacy code** - Clean up the codebase
4. **Full integration testing** - Ensure all workflows work with new engine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    v0.2.25 (Current State)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   WorkOrder → Orchestrator → executeRun()     ← ACTIVE (legacy)        │
│                                                                         │
│   ExecutionEngine → PhaseOrchestrator         ← AVAILABLE (new)        │
│                                                                         │
│   Problem: Two parallel paths, neither fully integrated                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

                              ↓ INTEGRATE ↓

┌─────────────────────────────────────────────────────────────────────────┐
│                    v0.2.26 (Target State)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   WorkOrder → Orchestrator.execute()                                    │
│                      │                                                  │
│                      ├── resolveTaskSpec()                              │
│                      ├── createServiceAdapters()                        │
│                      ├── ExecutionEngine.execute()                      │
│                      │         │                                        │
│                      │         ├── PhaseOrchestrator                    │
│                      │         ├── StateMachine                         │
│                      │         └── ProgressEmitter                      │
│                      │                                                  │
│                      └── DeliveryManager (if GitHub)                    │
│                                                                         │
│   executeRun() → REMOVED                                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [00-index.md](./00-index.md) - This file (overview and status)
2. [01-integration-plan.md](./01-integration-plan.md) - Detailed integration strategy
3. [02-orchestrator-refactor.md](./02-orchestrator-refactor.md) - Orchestrator changes
4. [03-service-wiring.md](./03-service-wiring.md) - Wiring real services
5. [04-legacy-removal.md](./04-legacy-removal.md) - Deprecation and removal
6. [05-testing-strategy.md](./05-testing-strategy.md) - Integration testing
7. [06-migration-guide.md](./06-migration-guide.md) - For downstream consumers

---

## Scope

### In Scope

- Wire ExecutionEngine as default execution path in Orchestrator
- Create real service adapters (not mocks) for:
  - AgentDriver (ClaudeCodeDriver, ClaudeCodeSubscriptionDriver)
  - Snapshotter (captureAfterState)
  - Verifier (verify function)
  - FeedbackGenerator (generateFeedback + formatForAgent)
  - ResultPersister (resultPersister singleton)
- Add deprecation notices to executeRun() and ExecutionCoordinator
- Remove executeRun() after deprecation period
- Integration tests for complete workflows
- Update all tests to use new engine

### Out of Scope

- New features (this is an integration release)
- API changes to TaskSpec
- New delivery manager implementations (GitLab, etc.)
- Performance optimizations (future release)

---

## Success Criteria

1. **All existing tests pass** with new execution path
2. **executeRun() removed** from codebase
3. **No duplicate code paths** for execution
4. **GitHub workflows work** with new engine
5. **Observability intact** - Progress events and metrics flow correctly
6. **Documentation updated** with migration notes

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Callback behavior differs | Medium | High | Extensive integration testing |
| GitHub integration breaks | Medium | High | E2E tests with real GitHub |
| Performance regression | Low | Medium | Benchmarks before/after |
| Missing edge cases | Medium | Medium | Review all executeRun() branches |

---

## Dependencies

- v0.2.25 complete (ExecutionEngine, phase handlers, service adapters)
- All existing tests passing
- GitHub E2E test infrastructure

---

## Timeline

| Phase | Description | Estimated Effort |
|-------|-------------|------------------|
| 1 | Wire real services to adapters | ~2 hours |
| 2 | Refactor Orchestrator to use ExecutionEngine | ~3 hours |
| 3 | Integration testing | ~2 hours |
| 4 | Remove executeRun() | ~1 hour |
| 5 | Documentation and cleanup | ~1 hour |

**Total**: ~9 hours

---

## Document Index

Proceed to read each document in order for complete implementation details.
