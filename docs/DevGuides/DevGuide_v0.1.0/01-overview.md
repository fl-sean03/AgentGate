# AgentGate v0.1.0 - Overview

## Executive Summary

AgentGate is a **contained builder** with a **verification gate**. It turns user intent into concrete changes, verifies those changes in a clean-room environment, and produces auditable artifacts.

The MVP proves: **intent → changes → verified artifact**, repeatedly, with an audit trail.

---

## Problem Statement

AI coding agents produce output that is not inherently trustworthy. Without verification:
- Broken artifacts ship
- Silent regressions occur
- "Works on my machine" failures proliferate
- Changes become unreproducible

AgentGate solves this by separating BUILD (can write) from VERIFY (cannot write, runs on immutable snapshot).

---

## Core Principles

### 1. Workspace Containment
- Agent affects only its assigned workspace
- No cross-workspace writes
- No hidden shared state

### 2. Hard Isolation Boundary
- BUILD phase: agent can write
- VERIFY phase: read-only, immutable snapshot
- Verifier runs in clean-room (fresh venv, isolated directory)

### 3. Artifact-Centric Truth
- Output is not "agent said it worked"
- Output is: snapshot + patch + verification report
- Anyone can replay verification

### 4. Verification is the Oracle
- Builder runs preflight checks (advisory)
- Only verifier's clean-room results determine PASS/FAIL

### 5. Driver Abstraction
- Claude Code is first implementation
- Swapping agents must not change control plane contract

---

## System Model

### Entities

| Entity | Description |
|--------|-------------|
| **WorkOrder** | Task + workspace + constraints + gate definition |
| **Workspace** | Directory + state + exclusive lease lock |
| **Run** | One attempt to satisfy a WorkOrder (may have iterations) |
| **Iteration** | Single BUILD → SNAPSHOT → VERIFY cycle within a Run |
| **Snapshot** | Immutable build output (git SHA) |
| **GatePlan** | What must pass (commands, contracts, fixtures, timeouts) |
| **VerificationReport** | Authoritative PASS/FAIL with diagnostics |

### State Machine

```
QUEUED → LEASED → BUILDING → SNAPSHOTTING → VERIFYING
                                               ↓
                              FEEDBACK ← ─ ─ ─ ┘ (if FAIL)
                                 ↓
                              BUILDING (retry)
                                 ...
                              SUCCEEDED | FAILED | CANCELED
```

**States:**

| State | Description |
|-------|-------------|
| QUEUED | Work order received, awaiting workspace |
| LEASED | Workspace lock acquired |
| BUILDING | Agent executing task |
| SNAPSHOTTING | Capturing git SHA and patch |
| VERIFYING | Clean-room running gate plan |
| FEEDBACK | Generating structured failure summary |
| SUCCEEDED | Gate passed, artifacts produced |
| FAILED | Budget exhausted or unrecoverable |
| CANCELED | User or system terminated |

**Rules:**
- Only one active lease per workspace
- VERIFYING always targets a specific snapshot ID
- FEEDBACK generated only from verification output

---

## Architecture Overview

Single daemon with internal modules, local-first design.

```
┌─────────────────────────────────────────────────────────────────┐
│                         AgentGate Daemon                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐   │
│  │  Module A   │   │  Module B   │   │      Module C       │   │
│  │Control Plane│──▶│  Workspace  │──▶│    Agent Driver     │   │
│  │    (CLI)    │   │   Manager   │   │   (Claude Code)     │   │
│  └─────────────┘   └─────────────┘   └─────────────────────┘   │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐   │
│  │  Module D   │   │  Module E   │   │      Module F       │   │
│  │Gate Resolver│   │ Snapshotter │──▶│      Verifier       │   │
│  │             │   │   (Git)     │   │   (Clean-room)      │   │
│  └─────────────┘   └─────────────┘   └─────────────────────┘   │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐   │
│  │  Module G   │   │  Module H   │   │    Orchestrator     │   │
│  │  Feedback   │◀──│  Artifact   │◀──│   (State Machine)   │   │
│  │  Generator  │   │    Store    │   │                     │   │
│  └─────────────┘   └─────────────┘   └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module Summary

### Module A: Control Plane
- Accept work orders via CLI
- Show run status and artifacts
- Cancel work orders

### Module B: Workspace Manager
- Create/initialize workspaces from source
- Maintain exclusive lease locks
- Enforce path policies
- Provide clean checkout for verification

### Module C: Agent Driver (Claude Code)
- Run Claude Code in headless mode
- Provide task prompt + gate plan + constraints
- Capture stdout/stderr logs
- Enforce time and iteration budgets
- Return exit status + structured output

### Module D: Gate Plan Resolver
- Parse `verify.yaml` (primary source)
- Ingest CI workflows as fallback
- Produce normalized internal gate plan
- Gate plan immutable during run

### Module E: Snapshotter
- Capture "before" git SHA
- Freeze "after" git SHA post-BUILD
- Produce unified diff (patch)
- Store snapshot identifiers

### Module F: Verifier
- Rehydrate snapshot into fresh directory
- Create fresh venv environment
- Execute gate plan (L0-L3 checks)
- Produce verification report
- Never modify snapshot (read-only)

### Module G: Feedback Generator
- Parse verifier output
- Produce structured failure summary
- Include: failing step, command, error excerpt, file refs
- Enable auto-fix loops

### Module H: Artifact Store
- Local filesystem with predictable layout
- Workspaces, runs, snapshots directories
- Deterministic naming
- Complete records for reproducibility

---

## Gate Plan Levels

| Level | Name | Description |
|-------|------|-------------|
| L0 | Contract Checks | Required files, schemas, forbidden globs |
| L1 | Test Commands | Unit/integration tests with exit codes |
| L2 | Black-box Tests | Fixture-based conformance testing |
| L3 | Sanity Checks | Clean-room execution verification |

---

## Build → Verify Loop

### Step 1: WorkOrder Intake
- Record: workspace source, agent type, max iterations, time budget
- Record: gate plan source, execution policies

### Step 2: Workspace Lease
- Acquire exclusive lock
- Initialize/fetch workspace
- Record baseline ("before" SHA)

### Step 3: Gate Plan Resolution
- Load `verify.yaml` if exists
- Fall back to CI ingestion
- Normalize to internal format
- Persist in run artifacts

### Step 4: BUILD (Agent)
- Provide: intent, gate plan summary, constraints, file pointers
- Agent modifies workspace
- Agent runs preflight checks (advisory)
- Capture all logs

### Step 5: SNAPSHOT
- Freeze workspace to git SHA
- Compute patch (before → after)
- Persist identifiers

### Step 6: VERIFY (Clean-room)
- Rehydrate snapshot to temp directory
- Create fresh venv
- Execute L0 → L3 checks
- Persist logs
- Produce verification report

### Step 7: FEEDBACK / ITERATE
- If PASS: mark SUCCEEDED, release lock
- If FAIL and budget remains:
  - Generate structured feedback
  - Loop to BUILD with feedback
- If FAIL and budget exhausted: mark FAILED, release lock

---

## Deliverables Per Run

Every run produces (regardless of outcome):

| Artifact | Description |
|----------|-------------|
| Snapshot ID | Git SHA (before and after) |
| Patch | Unified diff of changes |
| Agent Logs | Everything Claude Code printed |
| Verification Logs | All commands run in clean-room |
| Verification Report | PASS/FAIL + diagnostics (machine-readable) |
| Work Order Record | Task, constraints, budget, agent used |
| Feedback (if failed) | Structured failure summary |

---

## Security Guardrails (MVP)

| Guardrail | Implementation |
|-----------|----------------|
| Workspace root enforcement | No paths above root allowed |
| Forbidden glob detection | Block secrets, credentials |
| Hard timeouts | Agent and verify commands |
| Throwaway verify directory | Nothing persists except artifacts |
| Network default OFF | Verify runs without network |

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (Node.js) |
| CLI Framework | Commander |
| Git Operations | simple-git |
| Subprocess | execa |
| Validation | Zod |
| Configuration | YAML |
| Logging | Pino |
| Testing | Vitest |

---

## Next Steps

Proceed to [02-control-plane.md](./02-control-plane.md) to begin implementation with Module A.
