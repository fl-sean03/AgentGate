# DevGuide v0.2.22: Robust Queue Management Architecture

**Version**: 0.2.22
**Status**: Planning
**Author**: AgentGate Team
**Created**: 2026-01-02

## Executive Summary

This guide defines a complete refactor of AgentGate's queue management system, addressing fundamental architectural issues discovered during v0.2.21-v0.2.23 development:

1. **Race conditions** between periodic cleanup and active execution
2. **Memory exhaustion** from unbounded concurrent work orders
3. **Manual trigger requirement** that's error-prone and doesn't scale
4. **Implicit state management** that's hard to reason about and debug
5. **No retry logic** for transient failures
6. **Poor observability** into queue health and work order lifecycle

## Design Philosophy

This refactor follows three core principles:

1. **Explicit over Implicit**: Every state transition is explicit, logged, and traceable
2. **Fail-Safe by Default**: Resource exhaustion degrades gracefully, never crashes
3. **Zero Manual Intervention**: The system auto-processes work orders without triggers

## Document Structure

| Document | Description |
|----------|-------------|
| [01-overview.md](./01-overview.md) | Architecture overview, design decisions, component diagram |
| [02-thrust-state-machine.md](./02-thrust-state-machine.md) | Work order state machine implementation |
| [03-thrust-scheduler.md](./03-thrust-scheduler.md) | Resource-aware scheduler with backpressure |
| [04-thrust-execution-manager.md](./04-thrust-execution-manager.md) | Sandbox lifecycle and execution tracking |
| [05-thrust-retry-manager.md](./05-thrust-retry-manager.md) | Retry policies and failure handling |
| [06-thrust-observability.md](./06-thrust-observability.md) | Metrics, health checks, and debugging |
| [07-appendix-migration.md](./07-appendix-migration.md) | Migration plan from current implementation |
| [08-appendix-api-reference.md](./08-appendix-api-reference.md) | Complete API documentation |

## Key Architectural Decisions

### Decision 1: Event-Sourced State Machine
**Choice**: Implement explicit state machine with event sourcing
**Rationale**: Current implicit state transitions are the root cause of race conditions and debugging difficulty. Event sourcing provides complete audit trail.

### Decision 2: Resource-Gated Scheduler
**Choice**: Pull-based scheduler that checks resources before claiming work
**Rationale**: Push-based systems can overwhelm resources. Pull-based with resource gates ensures we never exceed capacity.

### Decision 3: In-Process with Pluggable Backend
**Choice**: In-memory implementation with interface supporting Redis/PostgreSQL backends
**Rationale**: No external dependencies for MVP, but architecture supports scaling later.

### Decision 4: Sandbox Ownership Model
**Choice**: Execution manager owns sandbox lifecycle, not work order
**Rationale**: Centralizes resource tracking, prevents cleanup race conditions.

## State Machine Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Work Order Lifecycle                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────┐    claim    ┌───────────┐   ready   ┌─────────┐     │
│   │ PENDING  │ ─────────→  │ PREPARING │ ───────→  │ RUNNING │     │
│   └──────────┘             └───────────┘           └─────────┘     │
│        │                         │                      │           │
│        │ cancel                  │ prepare_failed       │ complete  │
│        ↓                         ↓                      ↓           │
│   ┌──────────┐             ┌───────────┐           ┌─────────┐     │
│   │ CANCELLED│             │  WAITING  │           │COMPLETED│     │
│   └──────────┘             │  _RETRY   │           └─────────┘     │
│                            └───────────┘                            │
│                                  │                                  │
│                                  │ retry / max_retries              │
│                                  ↓                                  │
│                            ┌───────────┐                            │
│                            │  FAILED   │                            │
│                            └───────────┘                            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Control Plane                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │   HTTP API  │────→│  Queue Manager  │────→│ State Machine   │   │
│  │  (Submit)   │     │  (Coordinator)  │     │ (Per WorkOrder) │   │
│  └─────────────┘     └────────┬────────┘     └─────────────────┘   │
│                               │                                     │
│                               ↓                                     │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │  Resource   │←────│    Scheduler    │────→│ Execution Mgr   │   │
│  │  Monitor    │     │  (Pull-based)   │     │ (Owns Sandbox)  │   │
│  └─────────────┘     └─────────────────┘     └─────────────────┘   │
│                               │                                     │
│                               ↓                                     │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │   Retry     │←────│  Event Store    │────→│   Metrics &     │   │
│  │  Manager    │     │  (Audit Trail)  │     │   Telemetry     │   │
│  └─────────────┘     └─────────────────┘     └─────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Success Criteria

1. **Zero race conditions**: No cleanup-execution conflicts
2. **Memory-safe**: Never exceed configured memory limits
3. **Auto-processing**: Work orders execute without manual triggers
4. **Full observability**: Every state transition logged and queryable
5. **Graceful degradation**: System stays responsive under load
6. **Retry resilience**: Transient failures auto-recover
7. **Developer-friendly**: Clear APIs, good error messages, easy debugging

## Verification Plan

- [ ] Unit tests for state machine transitions (100% coverage)
- [ ] Integration tests for scheduler under memory pressure
- [ ] Load test: 100 work orders with 2 concurrent slots
- [ ] Chaos test: Random sandbox failures with retry recovery
- [ ] Memory profiling: No leaks over 24-hour run

## Timeline Thrusts

1. **Thrust 1**: State Machine Foundation
2. **Thrust 2**: Resource-Aware Scheduler
3. **Thrust 3**: Execution Manager Refactor
4. **Thrust 4**: Retry Manager Implementation
5. **Thrust 5**: Observability Layer
6. **Thrust 6**: Migration & Cleanup
