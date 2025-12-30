## Vision and why this exists

You’re building a **contained builder**: a workspace-scoped agent that can read/write/execute to fulfill user intent. That’s the “power” part.

You also need a **verification gate** because agent output is not inherently trustworthy. Verification is the “safety + reliability” part. It prevents:

* shipping broken artifacts,
* silent regressions,
* “works on my machine” failures,
* and unreproducible changes.

The MVP proves a single thing: **you can turn intent → concrete changes → verified artifact**, repeatedly, with an audit trail.

This is general-purpose. “CI gate” is just one instance of verification; different projects will have different gates.

---

## Core principles (non-negotiable)

1. **Workspace containment**

* The agent is only allowed to affect the workspace it’s assigned.
* No cross-workspace writes. No hidden shared state.

2. **Hard isolation boundary**

* BUILD can write.
* VERIFY cannot write.
* VERIFY runs only on an immutable snapshot.

3. **Artifact-centric truth**

* The output isn’t “the agent said it worked.”
* The output is a **snapshot + patch + verification report** that anyone can replay.

4. **Verification is the oracle**

* The builder can run preflight checks, but only the verifier’s clean-room results determine PASS/FAIL.

5. **Driver abstraction**

* Claude Code is the first agent implementation, not the architecture.
* Swapping agents later must not change the control plane contract.

---

## What the MVP must demonstrate

You need a demo that is boringly convincing:

### Demonstration outcomes

1. Submit a work order: “Implement X in repo Y.”
2. Agent edits the workspace and runs local preflight.
3. System snapshots the result (immutable identity).
4. Clean-room verifier runs the gate.
5. If fail, builder loops using structured failure feedback.
6. Eventually PASS produces a shippable artifact with audit logs.

### Deliverables for a single run (always produced)

* Immutable snapshot identifier (commit hash or bundle hash)
* Patch/diff between before and after
* Agent logs (everything it printed)
* Verification logs (every command run in clean-room)
* Machine-readable verification report (PASS/FAIL + diagnostics)
* Work order record (what you asked, constraints, time budget, agent used)

If you can’t consistently produce these, you don’t have a system.

---

## System model

### Entities

* **WorkOrder**: “Do this task in this workspace, under these constraints, to satisfy this gate.”
* **Workspace**: directory + state + lease lock.
* **Run**: one attempt to satisfy a WorkOrder (often multiple iterations).
* **Snapshot**: immutable build output of an iteration.
* **Gate Plan**: what must pass (commands + contract checks + fixtures).
* **Verification Report**: authoritative PASS/FAIL against a snapshot.

### State machine

Minimum states:

* QUEUED
* LEASED
* BUILDING
* SNAPSHOTTING
* VERIFYING
* FEEDBACK
* SUCCEEDED
* FAILED
* CANCELED

Rules:

* Only one active lease per workspace.
* VERIFYING always targets a specific snapshot ID.
* FEEDBACK is only generated from verification output.

---

## Architecture (MVP)

You can implement as **one daemon** with internal modules. Keep it local-first.

### Module A — Control plane (submission + status)

Purpose: accept work orders and show results.

MVP options:

* **CLI submission** (fastest, adequate)
* HTTP API (nice, but not required for MVP)

Minimum capabilities:

* Submit work order
* List work orders / runs
* Get run artifacts path
* Cancel work order (best effort)

### Module B — Workspace manager

Responsibilities:

* Create workspace from source (local path or git URL) into a workspace root
* Maintain a lease lock (prevents concurrent modifications)
* Enforce allowed/disallowed paths policy
* Provide “clean checkout” for verification (or pass snapshot to verifier)

Strong recommendation:

* Require or initialize a VCS boundary (git). It simplifies snapshot identity and diffs.

### Module C — Agent driver (Claude Code v1)

Responsibilities:

* Run the agent in “headless automation mode” inside workspace root
* Provide it: the task prompt + gate plan + constraints
* Capture stdout/stderr logs
* Enforce time and iteration budgets
* Return: exit status + locations of logs + any structured output

Important: the driver is not “smart.” It is a controlled process runner.

### Module D — Gate plan resolver (CI ingestion + profile support)

Purpose: give the agent and verifier a **clear definition of done**.

Support two sources:

1. **Verification Profile (canonical, portable)**

* A project-owned file like `verify.yaml` or `agentd/verify.yaml`
* Contains: setup steps, commands, required files, fixtures, timeouts, forbidden behaviors

2. **CI workflow ingestion (optional, but valuable)**

* Read `.github/workflows/*`
* Extract a supported subset (simple linear job with run commands)
* Convert it into the same internal Gate Plan format

Critical rule:

* The gate plan used in VERIFY is authored by the platform/resolver, not editable by the agent during the run.

### Module E — Snapshotter

Responsibilities:

* Capture “before” identity
* After BUILD, freeze “after” identity
* Produce patch
* Store snapshot artifacts for verifier

Snapshot methods (choose one for MVP):

* **Git-based snapshots**: cleanest (before SHA, after SHA, diff)
* Bundle tarball + hash: more universal, slightly more work

### Module F — Verifier (clean-room gate execution)

Responsibilities:

* Accept a snapshot
* Rehydrate it into a fresh directory
* Create a fresh runtime environment (venv now; containers later)
* Execute gate plan:

  * L0 contract checks
  * L1 test commands
  * L2 black-box contract tests using fixtures
  * L3 clean-room execution sanity
* Produce verification report + logs
* Never modify the snapshot; treat it as read-only input

### Module G — Feedback generator

Responsibilities:

* Take raw verifier output and produce a compact, structured failure summary for the agent, including:

  * which step failed (L0/L1/L2/L3)
  * failing command
  * error excerpt (bounded)
  * file references if available
  * expected vs actual if applicable
* This feedback is what enables auto-fix loops.

### Module H — Artifact store

MVP: local filesystem with a predictable layout:

* Workspaces directory
* Runs directory
* Snapshots directory (optional if snapshots are git SHAs in workspace)

Keep it boring. Determinism comes from consistent naming + complete records.

---

## The agent’s operating contract (contained builder)

You want “agent-native.” Make the contract explicit.

### Inputs the agent receives each iteration

* Task prompt (intent)
* Gate plan (definition of done)
* Workspace constraints (allowed paths, forbidden patterns, time budget)
* Prior iteration failure summary (if any)
* Workspace context pointers (where to find manifest/tests/docs)

### Required behaviors

* Do not change gate definition files (unless task explicitly says so and policy allows)
* Do not write outside workspace root
* Prefer minimal diffs; avoid refactors unless needed for passing gate
* Always run preflight commands listed in the gate plan before snapshotting (advisory)
* If preflight fails, fix and retry within BUILD, not after snapshot

### Outputs the agent must leave behind

* Whatever the gate expects (tests, formatting, manifests)
* A short “build notes” artifact inside the run output (what changed, why)

The system, not the agent, is responsible for diffing and recording.

---

## Gate plan design (general and project-agnostic)

Gate plan is just a structured description of “how do we judge this artifact.”

### Gate plan should include

1. **Contract checks**

* Required files/folders
* Schema validation requirements
* Naming conventions / formatting requirements
* Forbidden globs (keys, credentials, giant binaries, etc.)

2. **Environment setup**

* Runtime version(s) and dependency install steps
* Any required system dependencies (MVP: keep minimal)

3. **Test commands**

* One or more commands with timeouts
* Expected exit codes

4. **Black-box conformance tests**

* Inputs/fixtures to run against
* Assertions about produced outputs + metadata

5. **Execution policy**

* Network allowed/forbidden during verify
* Maximum runtime
* Maximum disk usage (optional for MVP)
* Disallowed commands patterns (optional for MVP)

### How to keep it general

* Use the gate plan as a list of generic shell commands + file/schema assertions.
* Avoid coupling to any specific language or toolchain.
* Provide “profiles” per project (python-basic, node-basic, polyglot-basic) if you want, but don’t hardcode.

---

## Why ingest CI at all

CI ingestion is about **aligning incentives**:

* The agent knows what must pass.
* The verifier enforces the same gate clean-room.

But CI configs are complex. For MVP:

* Support a deliberately small subset.
* If unsupported patterns are detected, require the project to provide `verify.yaml`.

That’s how you stay general without building a GitHub Actions interpreter.

---

## Build → Snapshot → Verify loop (detailed execution)

### Step 1: WorkOrder intake

Record:

* workspace source
* agent type (claude-code)
* max iterations
* max wall clock time
* gate plan source preference (verify.yaml first, then CI)
* policy: network allowed? forbidden globs? etc.

### Step 2: Workspace lease + preparation

* Acquire exclusive lock
* Ensure workspace exists / fetch latest (if you support)
* Record baseline identity (“before”)

### Step 3: Resolve gate plan

* If verify profile exists: use it
* Else attempt CI ingestion
* Produce a normalized internal gate plan
* Persist it into run artifacts so everything is replayable

### Step 4: BUILD (agent)

* Provide the agent with:

  * intent
  * gate plan text summary
  * strict constraints
  * file pointers (where contract files live)
* Agent modifies workspace and runs preflight checks (advisory)
* Capture all logs

### Step 5: SNAPSHOT

* Freeze workspace state into an immutable snapshot ID
* Compute patch from before → after
* Persist patch and identities

### Step 6: VERIFY (clean-room)

* Rehydrate snapshot into temp dir
* Recreate fresh env
* Execute gate plan exactly
* Persist logs
* Produce verification report

### Step 7: FEEDBACK / ITERATE

* If PASS: mark SUCCEEDED, release lock
* If FAIL:

  * generate structured failure summary
  * if budgets remain: loop back to BUILD with the summary
  * else: mark FAILED, release lock

---

## Safety and reliability (MVP-grade)

You don’t need perfect sandboxing to prove the concept, but you do need basic guardrails:

### Minimum guardrails

* Workspace root enforcement (never allow paths above root)
* Forbidden glob detection before snapshot and during verify
* Hard timeouts on agent and verify commands
* Clean-room verify directory is throwaway; nothing persists except artifacts
* Network default: **off** during verify (on only when explicitly allowed)

### Later hardening (not MVP)

* Containers for verify and/or build
* Seccomp/AppArmor profiles
* Fine-grained command allowlists

---

## Testing and validation plan (how you prove it works)

This is the part most people skip. Don’t.

### Build a toy repo specifically for system validation

You want a controlled target that makes failures predictable.

Toy repo characteristics:

* Small
* Has a clear “pipeline entrypoint”
* Has at least one black-box fixture test
* Has at least one unit test suite
* Has a simple manifest/schema

### Define 5 end-to-end scenarios (must be automated)

1. **Happy path**

* WorkOrder: add a feature + tests
* Expect: SUCCEEDED, patch exists, snapshot exists, verification report PASS

2. **Unit test failure**

* WorkOrder: change behavior without updating tests
* Expect: FAIL at L1; feedback identifies failing test command

3. **Contract violation**

* WorkOrder: remove or rename required file
* Expect: FAIL at L0; feedback points to missing contract file

4. **Black-box regression**

* WorkOrder: output wrong shape but tests don’t catch it
* Expect: FAIL at L2; this proves why platform-owned contract tests matter

5. **Iterative repair loop**

* Use scenario (2) or (4) but allow 2–3 iterations
* Expect: FAIL then SUCCEED, with both verification reports persisted per iteration

### Add fault-injection tests (reliability)

* Kill daemon mid-VERIFY → restart should mark run failed cleanly (MVP fail-safe)
* Try two simultaneous work orders on same workspace → second must wait or be rejected
* Attempt to write outside workspace root (prompt injection) → must be blocked/detected

### Acceptance criteria for MVP “done”

* Every scenario produces complete artifacts (logs, patch, report)
* Verification results are reproducible by re-running verifier on the same snapshot
* No concurrent workspace corruption
* Failures are actionable (not just log vomit)

---

## Operational guide (how you actually run it)

### Developer workflow

* Put repo in workspaces directory (or supply git URL)
* Write/maintain verify profile (or CI workflow)
* Submit work orders
* Inspect run artifacts
* Promote a passed snapshot (tag/release/export bundle)

### What “promotion” means in MVP

Promotion is simply: “this snapshot passed the gate.”
How you ship it depends on downstream use (MatterStack later, or any runner).

---

## Extensibility roadmap (without changing the core)

Once MVP is stable, you can add:

1. **More drivers**

* OpenCode, Codex, etc.
* Same interface: run in workspace, produce logs, respect constraints

2. **Better isolation**

* Containerized verify first (easy win)
* Then containerized build

3. **Richer gate types**

* Multi-language profiles
* Service dependencies (databases) in verify
* Matrix testing (later)

4. **UI**

* Web dashboard for runs, diffs, reports
* Not needed for MVP proof

---

## The only thing I need you to decide to finalize the dev guide structure

Pick these defaults for MVP (no hedging):

1. Snapshot identity: **git SHA** vs **bundle hash**
2. Clean-room environment: **fresh venv** vs **container**
3. Network during verify: **off** vs **on**
4. Gate source precedence: **verify profile first** vs **CI first**

If you don’t want to think: pick **git SHA + venv + network off + verify profile first**. That’s the fastest path to a credible MVP you can later harden and tailor to MatterStack.
