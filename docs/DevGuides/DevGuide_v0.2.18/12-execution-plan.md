# 12: Execution Plan - Dogfooding v0.2.18

This document describes the strategy for implementing v0.2.18 using AgentGate itself (dogfooding).

---

## Overview

We will use AgentGate to implement its own Security Verification Refactor. This serves two purposes:
1. **Validate the system** - Prove AgentGate can build complex features
2. **Accelerate development** - Leverage AI agents for implementation

---

## Critical Constraint: GitHub Workspace Model

AgentGate clones workspaces from the GitHub repository's **main branch**. This means:

```
Work Order Submitted
        │
        v
AgentGate clones repo from GitHub (main branch)
        │
        v
Agent works on cloned workspace
        │
        v
Agent creates PR with changes
        │
        v
PR must be MERGED TO MAIN before next phase
        │
        v
Next work order can now see previous changes
```

**Implication:** Sequential phases MUST have their PRs merged to main before the next phase begins. Parallel work orders within a phase can run simultaneously, but phases are strictly sequential.

---

## Execution Strategy: 3-Phase Approach

### Phase Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                         PHASE 1                                  │
│                      (Foundation)                                │
│                                                                  │
│   ┌──────────────────┐    ┌──────────────────┐                  │
│   │ Thrust 1         │    │ Thrust 2         │                  │
│   │ Core Types &     │───▶│ Policy Layer     │                  │
│   │ Schemas          │    │                  │                  │
│   └──────────────────┘    └──────────────────┘                  │
│                                                                  │
│   Output: packages/server/src/security/{types,schemas,policy}   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Merge PR to main
                              v
┌─────────────────────────────────────────────────────────────────┐
│                         PHASE 2                                  │
│                    (Detection Layer)                             │
│                                                                  │
│   ┌──────────────────┐                                          │
│   │ Thrust 3         │                                          │
│   │ Content Detector │                                          │
│   │ + Registry       │                                          │
│   └────────┬─────────┘                                          │
│            │                                                     │
│   ┌────────┴────────┐                                           │
│   v                 v                                            │
│   ┌──────────────────┐    ┌──────────────────┐                  │
│   │ Thrust 4         │    │ Thrust 5         │                  │
│   │ Entropy Detector │    │ Pattern Detector │                  │
│   └──────────────────┘    └──────────────────┘                  │
│                                                                  │
│   Output: packages/server/src/security/detectors/*              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Merge PR to main
                              v
┌─────────────────────────────────────────────────────────────────┐
│                         PHASE 3                                  │
│                 (Engine & Integration)                           │
│                                                                  │
│   ┌──────────────────┐    ┌──────────────────┐                  │
│   │ Thrust 6         │───▶│ Thrust 7         │                  │
│   │ Enforcement      │    │ Audit Layer      │                  │
│   │ Engine           │    │                  │                  │
│   └──────────────────┘    └────────┬─────────┘                  │
│                                    │                             │
│                           ┌────────┴────────┐                   │
│                           v                 v                    │
│   ┌──────────────────┐    ┌──────────────────┐                  │
│   │ Thrust 8         │    │ Thrust 9         │                  │
│   │ L0 Integration   │    │ CLI & Testing    │                  │
│   └──────────────────┘    └──────────────────┘                  │
│                                                                  │
│   Output: enforcement/, audit/, integration/, tests             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Merge PR to main
                              v
                    ┌─────────────────┐
                    │   v0.2.18       │
                    │   COMPLETE      │
                    └─────────────────┘
```

---

## Phase Details

### Phase 1: Foundation (Thrusts 1-2)

**Work Order Count:** 1

**Task Prompt:**
```
Implement the Security Policy Engine foundation for AgentGate v0.2.18.

Read the DevGuide at docs/DevGuides/DevGuide_v0.2.18/ for complete specifications.

Implement Thrust 1 (Core Types & Schemas) and Thrust 2 (Policy Layer):

1. Create packages/server/src/security/types.ts with:
   - SensitivityLevel enum (INFO, WARNING, SENSITIVE, RESTRICTED)
   - EnforcementAction enum (LOG, WARN, BLOCK, DENY)
   - DetectorConfig, AllowlistEntry, RuntimeConfig, AuditConfig interfaces
   - SecurityPolicy and ResolvedSecurityPolicy interfaces

2. Create packages/server/src/security/schemas.ts with:
   - Zod schemas for all types
   - Default values configured
   - Validation for all fields

3. Create packages/server/src/security/policy/defaults.ts with:
   - DEFAULT_POLICY constant
   - DEFAULT_SECRET_PATTERNS array (AWS, GitHub, Stripe, etc.)
   - DEFAULT_FORBIDDEN_PATTERNS array

4. Create packages/server/src/security/policy/loader.ts with:
   - loadPolicyFromFile, loadProjectPolicy, loadProfilePolicy functions
   - YAML parsing with js-yaml

5. Create packages/server/src/security/policy/resolver.ts with:
   - resolveSecurityPolicy function
   - Policy merging and inheritance
   - computePolicyHash function

6. Create index.ts files for exports

Run pnpm typecheck and pnpm test to verify.
```

**Expected Files Created:**
- `packages/server/src/security/types.ts`
- `packages/server/src/security/schemas.ts`
- `packages/server/src/security/index.ts`
- `packages/server/src/security/policy/defaults.ts`
- `packages/server/src/security/policy/loader.ts`
- `packages/server/src/security/policy/resolver.ts`
- `packages/server/src/security/policy/index.ts`

**Estimated Duration:** 20-30 minutes

**Success Criteria:**
- All files created
- `pnpm typecheck` passes
- Policy resolution works with test YAML file

---

### Phase 2: Detection Layer (Thrusts 3-5)

**Work Order Count:** 1 (could be 3 parallel, but registry conflict makes single WO safer)

**Task Prompt:**
```
Implement the Security Policy Engine detection layer for AgentGate v0.2.18.

Read the DevGuide at docs/DevGuides/DevGuide_v0.2.18/ for complete specifications.
The foundation (types, schemas, policy) was implemented in Phase 1.

Implement Thrust 3 (Content Detector), Thrust 4 (Entropy Detector), and Thrust 5 (Pattern Detector):

1. Create packages/server/src/security/detectors/types.ts with:
   - Finding interface
   - DetectorContext interface
   - Detector interface
   - ValidationResult interface

2. Create packages/server/src/security/detectors/patterns.ts with:
   - SecretPattern interface
   - BUILTIN_SECRET_PATTERNS array (20+ patterns for AWS, GitHub, Stripe, private keys, database URLs, etc.)

3. Create packages/server/src/security/detectors/content-detector.ts with:
   - ContentDetector class implementing Detector interface
   - detect() method scanning file contents with regex
   - maskSecret() helper to hide actual values
   - Binary file and large file skipping

4. Create packages/server/src/security/detectors/entropy-detector.ts with:
   - EntropyDetector class
   - calculateEntropy() using Shannon entropy formula
   - Configurable threshold (default 4.5)
   - False positive filtering for UUIDs

5. Create packages/server/src/security/detectors/pattern-detector.ts with:
   - PatternDetector class for filename pattern matching
   - Uses fast-glob for matching

6. Create packages/server/src/security/detectors/gitignore-detector.ts with:
   - GitignoreDetector class
   - Parses .gitignore and checks file status

7. Create packages/server/src/security/detectors/registry.ts with:
   - DetectorRegistry class
   - Register all built-in detectors
   - Export singleton detectorRegistry

8. Create packages/server/src/security/detectors/index.ts with exports

Run pnpm typecheck and pnpm test to verify.
```

**Expected Files Created:**
- `packages/server/src/security/detectors/types.ts`
- `packages/server/src/security/detectors/patterns.ts`
- `packages/server/src/security/detectors/content-detector.ts`
- `packages/server/src/security/detectors/entropy-detector.ts`
- `packages/server/src/security/detectors/pattern-detector.ts`
- `packages/server/src/security/detectors/gitignore-detector.ts`
- `packages/server/src/security/detectors/registry.ts`
- `packages/server/src/security/detectors/index.ts`

**Estimated Duration:** 40-60 minutes

**Success Criteria:**
- All detectors implemented
- Registry contains all 4 detectors
- Content detector catches test secrets
- Entropy detector calculates correct values

---

### Phase 3: Engine, Integration & Testing (Thrusts 6-9)

**Work Order Count:** 1

**Task Prompt:**
```
Implement the Security Policy Engine enforcement, audit, integration, and testing for AgentGate v0.2.18.

Read the DevGuide at docs/DevGuides/DevGuide_v0.2.18/ for complete specifications.
Phase 1 (types, policy) and Phase 2 (detectors) are already implemented.

Implement Thrust 6 (Enforcement), Thrust 7 (Audit), Thrust 8 (L0 Integration), and Thrust 9 (Testing):

THRUST 6 - Enforcement Engine:
1. Create packages/server/src/security/enforcement/types.ts with EnforcementResult, EnforcementSummary
2. Create packages/server/src/security/enforcement/aggregator.ts with FindingAggregator class
3. Create packages/server/src/security/enforcement/engine.ts with SecurityEnforcementEngine class
   - enforce() method that runs all detectors, aggregates findings, applies allowlist
   - Export singleton securityEngine

THRUST 7 - Audit Layer:
4. Create packages/server/src/security/audit/types.ts with AuditEventType enum and event interfaces
5. Create packages/server/src/security/audit/logger.ts with SecurityAuditLogger class
   - JSONL file output
   - Log rotation support

THRUST 8 - L0 Integration:
6. Create packages/server/src/security/integration/l0-bridge.ts with runSecurityVerification()
7. Create packages/server/src/security/integration/feature-flags.ts with SECURITY_ENGINE_ENABLED
8. Modify packages/server/src/verifier/l0-contracts.ts to use new security engine when flag enabled
9. Keep existing checkForbiddenPatterns for backwards compatibility

THRUST 9 - Testing:
10. Create packages/server/test/security/content-detector.test.ts
11. Create packages/server/test/security/entropy-detector.test.ts
12. Create packages/server/test/security/enforcement.test.ts
13. Create packages/server/test/security/integration.test.ts
14. Create test fixtures with known secrets for testing

Run pnpm typecheck, pnpm test, and pnpm build to verify everything works.
Ensure 90%+ test coverage on the security module.
```

**Expected Files Created:**
- `packages/server/src/security/enforcement/types.ts`
- `packages/server/src/security/enforcement/aggregator.ts`
- `packages/server/src/security/enforcement/engine.ts`
- `packages/server/src/security/enforcement/index.ts`
- `packages/server/src/security/audit/types.ts`
- `packages/server/src/security/audit/logger.ts`
- `packages/server/src/security/audit/index.ts`
- `packages/server/src/security/integration/l0-bridge.ts`
- `packages/server/src/security/integration/feature-flags.ts`
- `packages/server/src/security/integration/index.ts`
- `packages/server/test/security/*.test.ts`
- `packages/server/test/security/fixtures/*`

**Modified Files:**
- `packages/server/src/verifier/l0-contracts.ts`
- `packages/server/src/security/index.ts`

**Estimated Duration:** 50-70 minutes

**Success Criteria:**
- Enforcement engine aggregates findings correctly
- Audit logs written to JSONL
- L0 verification uses new engine when flag enabled
- All tests pass with 90%+ coverage
- `pnpm build` succeeds

---

## Execution Timeline

```
Time 0:00  ─────────────────────────────────────────────────────────
           │
           ▼
           Submit Phase 1 Work Order (Thrusts 1-2)
           │
Time 0:30  ─────────────────────────────────────────────────────────
           │
           ▼
           Phase 1 Complete → Review PR → Merge to main
           │
Time 0:45  ─────────────────────────────────────────────────────────
           │
           ▼
           Submit Phase 2 Work Order (Thrusts 3-5)
           │
Time 1:45  ─────────────────────────────────────────────────────────
           │
           ▼
           Phase 2 Complete → Review PR → Merge to main
           │
Time 2:00  ─────────────────────────────────────────────────────────
           │
           ▼
           Submit Phase 3 Work Order (Thrusts 6-9)
           │
Time 3:00  ─────────────────────────────────────────────────────────
           │
           ▼
           Phase 3 Complete → Review PR → Merge to main
           │
Time 3:15  ─────────────────────────────────────────────────────────
           │
           ▼
           v0.2.18 COMPLETE
```

**Total Estimated Time:** 2.5-3.5 hours

---

## Work Order Submission Details

### API Endpoint

```
POST http://localhost:3001/api/v1/work-orders
Content-Type: application/json
```

### Request Body Template

```json
{
  "taskPrompt": "<task prompt from above>",
  "workspaceSource": {
    "type": "github",
    "repo": "fl-sean03/AgentGate",
    "branch": "main"
  },
  "agentType": "claude-code-subscription"
}
```

### Monitoring

```bash
# Check work order status
curl http://localhost:3001/api/v1/work-orders/{id} | jq '.data.status'

# Stream run events
curl -N http://localhost:3001/api/v1/runs/{runId}/stream
```

---

## Post-Phase Workflow

After each phase completes:

1. **Review the PR** created by AgentGate
   - Check file structure matches DevGuide
   - Verify tests pass
   - Look for any issues

2. **Merge to main**
   ```bash
   gh pr merge <PR_NUMBER> --merge
   ```

3. **Pull latest main locally** (for verification)
   ```bash
   git pull origin main
   pnpm install
   pnpm typecheck
   pnpm test
   ```

4. **Submit next phase** work order

---

## Rollback Strategy

If a phase fails:

1. **Close the failed PR** without merging
2. **Analyze the failure** - check agent output, verification results
3. **Adjust the task prompt** if needed
4. **Resubmit the work order** with corrections

If a merged phase has issues:

1. **Create a hotfix branch** from main
2. **Fix issues manually** or with a new work order
3. **Merge hotfix** before proceeding

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Phase 1 Success | First attempt |
| Phase 2 Success | ≤2 attempts |
| Phase 3 Success | ≤2 attempts |
| Total Duration | <4 hours |
| Test Coverage | >90% |
| Build Status | Passing |

---

## Notes for Future Dogfooding

Lessons learned from this implementation:

1. **Phase boundaries matter** - Group thrusts that share files
2. **Merge before next phase** - GitHub workspace model requires it
3. **Clear task prompts** - Reference DevGuide, list specific files
4. **Verification steps** - Include typecheck, test, build in prompts
5. **Feature flags for integration** - Allow gradual rollout
