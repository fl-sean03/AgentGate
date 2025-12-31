# DevGuide v0.2.10: Recursive Agent Spawning & Deployment Hardening

## Quick Navigation

| Document | Description |
|----------|-------------|
| [01-overview.md](./01-overview.md) | Executive summary, architecture decisions |
| [02-data-model.md](./02-data-model.md) | Thrusts 1-2: WorkOrder tree extensions, spawn types |
| [03-spawn-mechanism.md](./03-spawn-mechanism.md) | Thrusts 3-4: File-based signaling, CLAUDE.md injection |
| [04-tree-execution.md](./04-tree-execution.md) | Thrusts 5-6: Orchestrator changes, tree coordination |
| [05-integration.md](./05-integration.md) | Thrusts 7-8: Branch merging, conflict resolution |
| [06-deployment.md](./06-deployment.md) | Thrusts 9-10: Docker Compose, configurable limits |
| [07-appendices.md](./07-appendices.md) | Work order prompts, checklists, file reference |
| [08-robustness.md](./08-robustness.md) | Thrusts 11-14: Critical bug fixes, error handling |

---

## Executive Summary

**Goal**: Enable agents to spawn child agents recursively, with automatic branch integration and Docker-based deployment.

**Key Capabilities**:
1. Any agent can spawn child agents by creating `.agentgate/spawn-requests.json`
2. Child work orders execute in parallel with proper branch isolation
3. Integration agent auto-spawns to merge all branches when children complete
4. Configurable limits prevent runaway spawning (depth, children, tree size)
5. Docker Compose enables one-command deployment with 10-50+ concurrent agents

---

## Thrust Summary

| # | Thrust | New Files | Modified Files |
|---|--------|-----------|----------------|
| 1 | WorkOrder Tree Fields | - | `types/work-order.ts` |
| 2 | Spawn Types | `types/spawn.ts` | - |
| 3 | Spawn Processor | `orchestrator/spawn-processor.ts` | - |
| 4 | CLAUDE.md Injection | - | `agent/command-builder.ts` |
| 5 | Tree Coordinator | `orchestrator/tree-coordinator.ts` | - |
| 6 | Run Executor Spawn Detection | - | `orchestrator/run-executor.ts` |
| 7 | Integration Service | `integration/integration-service.ts` | - |
| 8 | Git Merge Operations | - | `workspace/git-ops.ts` |
| 9 | Configurable Limits | - | `orchestrator/orchestrator.ts`, `commands/serve.ts` |
| 10 | Docker Compose | `docker/*`, `docker-compose.yml`, `.env.example` | - |
| 11 | Concurrency Control Fix | - | `orchestrator/orchestrator.ts` |
| 12 | Lease Duration Extension | - | `workspace/lease.ts`, `orchestrator/run-executor.ts` |
| 13 | Error Handling Improvements | - | `run-executor.ts`, `work-order-store.ts` |
| 14 | API Schema Consistency | - | `server/routes/*.ts` |
| 15 | CLI Unification | - | `commands/run.ts`, `cli.ts` |

---

## Success Criteria

- [ ] Agent can spawn children via `.agentgate/spawn-requests.json`
- [ ] Children execute in parallel with branch isolation
- [ ] Integration agent auto-spawns on children completion
- [ ] `AGENTGATE_MAX_CONCURRENT_RUNS=20` works correctly
- [ ] `docker-compose up` starts full system
- [ ] `agentgate status` shows tree view
- [ ] No runaway spawning (limits enforced)
- [ ] All existing tests pass

---

## Prerequisites

- DevGuide v0.2.9 completed (integration tests)
- All packages build successfully (`pnpm build`)
- Git working directory clean

---

## Implementation Order

Thrusts should be implemented in order, as later thrusts depend on earlier ones:

1. **Thrusts 1-2**: Data model foundation
2. **Thrusts 3-4**: Spawn mechanism
3. **Thrusts 5-6**: Tree execution
4. **Thrusts 7-8**: Branch integration
5. **Thrusts 9-10**: Deployment hardening
6. **Thrusts 11-14**: Robustness fixes (critical bugs)

Each thrust pair can be implemented as a single AgentGate work order.
