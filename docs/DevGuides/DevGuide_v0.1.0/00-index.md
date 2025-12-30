# AgentGate v0.1.0 - Index

**Version**: 0.1.0 (MVP)
**Status**: In Development
**Goal**: Build → Snapshot → Verify loop with Claude Code as the agent driver

---

## Quick Navigation

| Document | Purpose |
|----------|---------|
| [01-overview.md](./01-overview.md) | Architecture, system model, state machine |
| [02-control-plane.md](./02-control-plane.md) | Module A: CLI submission and status |
| [03-workspace-manager.md](./03-workspace-manager.md) | Module B: Workspace lifecycle and leasing |
| [04-agent-driver.md](./04-agent-driver.md) | Module C: Claude Code integration |
| [05-gate-resolver.md](./05-gate-resolver.md) | Module D: Gate plan resolution |
| [06-snapshotter.md](./06-snapshotter.md) | Module E: Git-based snapshots |
| [07-verifier.md](./07-verifier.md) | Module F: Clean-room verification |
| [08-feedback-generator.md](./08-feedback-generator.md) | Module G: Structured failure feedback |
| [09-artifact-store.md](./09-artifact-store.md) | Module H: Local artifact storage |
| [10-integration.md](./10-integration.md) | Full system integration and daemon |
| [11-testing-validation.md](./11-testing-validation.md) | E2E test scenarios and validation |
| [12-appendices.md](./12-appendices.md) | Checklists, file references, schemas |

---

## Scope

AgentGate MVP demonstrates a single, repeatable workflow:

1. **Submit** a work order (intent + constraints)
2. **Build** using Claude Code agent in a contained workspace
3. **Snapshot** the result (immutable git SHA)
4. **Verify** in a clean-room environment
5. **Iterate** on failure with structured feedback
6. **Produce** auditable artifacts on success

---

## Success Criteria

The MVP is complete when:

- [ ] Work orders can be submitted via CLI
- [ ] Claude Code executes tasks in workspace containment
- [ ] Git-based snapshots capture before/after state
- [ ] Clean-room verifier runs gate plan on snapshots
- [ ] Feedback loop enables iterative repair (max 3 iterations)
- [ ] All 5 E2E test scenarios pass
- [ ] Artifacts (logs, patches, reports) persist for audit

---

## Architecture Decisions (MVP Defaults)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Snapshot identity | Git SHA | Simplest, built-in diffing |
| Clean-room environment | Fresh venv | No container overhead for MVP |
| Network during verify | Off (default) | Security, reproducibility |
| Gate source precedence | verify.yaml first | Explicit over inferred |
| Agent driver | Claude Code CLI | Subprocess control, JSON output |
| Language | TypeScript | Type safety, async patterns |

---

## Thrust Overview

### Phase 1: Foundation (Thrusts 1-4)
- Project setup and types
- Workspace manager with git integration
- Artifact store layout
- Control plane CLI skeleton

### Phase 2: Agent Integration (Thrusts 5-7)
- Claude Code driver implementation
- Gate plan resolver (verify.yaml + CI ingestion)
- Snapshotter with git operations

### Phase 3: Verification (Thrusts 8-10)
- Clean-room verifier (L0-L3 checks)
- Feedback generator
- Build-verify loop orchestration

### Phase 4: Integration & Testing (Thrusts 11-14)
- Full daemon integration
- Toy repo for validation
- E2E test scenarios
- Fault injection tests

---

## File Structure (Target)

```
agentgate/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # CLI entry point
│   ├── types/
│   │   ├── index.ts
│   │   ├── work-order.ts
│   │   ├── workspace.ts
│   │   ├── run.ts
│   │   ├── snapshot.ts
│   │   ├── gate-plan.ts
│   │   └── verification.ts
│   ├── control-plane/
│   │   ├── cli.ts
│   │   ├── commands/
│   │   │   ├── submit.ts
│   │   │   ├── status.ts
│   │   │   ├── list.ts
│   │   │   └── cancel.ts
│   │   └── work-order-service.ts
│   ├── workspace/
│   │   ├── manager.ts
│   │   ├── lease.ts
│   │   └── git-ops.ts
│   ├── agent/
│   │   ├── driver.ts
│   │   ├── claude-code-driver.ts
│   │   ├── constraints.ts
│   │   └── output-parser.ts
│   ├── gate/
│   │   ├── resolver.ts
│   │   ├── verify-profile-parser.ts
│   │   ├── ci-ingestion.ts
│   │   └── plan-normalizer.ts
│   ├── snapshot/
│   │   ├── snapshotter.ts
│   │   └── git-snapshot.ts
│   ├── verifier/
│   │   ├── verifier.ts
│   │   ├── clean-room.ts
│   │   ├── l0-contracts.ts
│   │   ├── l1-tests.ts
│   │   ├── l2-blackbox.ts
│   │   └── l3-sanity.ts
│   ├── feedback/
│   │   ├── generator.ts
│   │   └── formatter.ts
│   ├── artifacts/
│   │   ├── store.ts
│   │   └── paths.ts
│   └── orchestrator/
│       ├── daemon.ts
│       ├── run-executor.ts
│       └── state-machine.ts
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│       ├── scenarios/
│       │   ├── happy-path.test.ts
│       │   ├── unit-test-failure.test.ts
│       │   ├── contract-violation.test.ts
│       │   ├── blackbox-regression.test.ts
│       │   └── iterative-repair.test.ts
│       └── fixtures/
│           └── toy-repo/
└── docs/
    └── verify.yaml.example
```

---

## Dependencies

### Runtime
- `commander` - CLI framework
- `simple-git` - Git operations
- `zod` - Schema validation
- `yaml` - YAML parsing
- `pino` - Structured logging
- `execa` - Subprocess execution

### Development
- `typescript`
- `vitest` - Testing
- `eslint` + `prettier`

---

## How to Use This Guide

1. Read [01-overview.md](./01-overview.md) to understand the architecture
2. Execute thrusts sequentially within each document
3. Run verification steps after each thrust
4. Update checklists in [12-appendices.md](./12-appendices.md)
5. Create completion reports in `reports/` directory

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 0.1.0 | 2025-01 | Initial MVP - Build/Snapshot/Verify loop |
