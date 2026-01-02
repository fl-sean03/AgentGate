# 09: L0 Integration

This document covers Thrust 8: integrating the Security Policy Engine with the existing L0 verification system.

---

## Thrust 8: L0 Integration

### 8.1 Objective

Replace the existing `checkForbiddenPatterns` function in L0 verification with the new Security Policy Engine while maintaining backwards compatibility and ensuring a smooth migration path.

### 8.2 Background

The current L0 verification includes a `checkForbiddenPatterns` function that:
- Uses fast-glob to find files matching forbidden patterns
- Respects .gitignore patterns
- Returns a CheckResult with pass/fail

The new Security Policy Engine provides:
- Multiple detection methods (content, entropy, pattern)
- Policy-based configuration
- Allowlist support
- Audit logging

The integration must:
- Use the Security Engine instead of raw pattern matching
- Map EnforcementResult to CheckResult format
- Support gradual rollout via feature flag
- Maintain existing test compatibility

### 8.3 Subtasks

#### 8.3.1 Create Integration Bridge

Create `packages/server/src/security/integration/l0-bridge.ts`:

**runSecurityVerification function:**
- Takes workDir, policy (optional), and VerifyContext
- Resolves security policy if not provided
- Runs SecurityEnforcementEngine.enforce()
- Maps result to CheckResult format
- Returns CheckResult

**mapEnforcementToCheckResult(result, ctx):**
- Create CheckResult from EnforcementResult
- Map findings to diagnostics in VerifyContext
- Return CheckResult with:
  - name: 'security-verification'
  - passed: result.allowed
  - message: summary of findings
  - details: formatted finding list

**addSecurityDiagnostics(result, ctx):**
- For each blocked finding:
  - Add to ctx.diagnostics with level L0
  - Include file path and line number
  - Include masked match value

#### 8.3.2 Add Feature Flag

Create `packages/server/src/security/integration/feature-flags.ts`:

**SECURITY_ENGINE_ENABLED constant:**
- Read from `process.env.AGENTGATE_NEW_SECURITY`
- Default: false (use legacy during rollout)

**isSecurityEngineEnabled function:**
- Return SECURITY_ENGINE_ENABLED value
- Allow override via function parameter

#### 8.3.3 Modify L0 Contracts

Modify `packages/server/src/verifier/l0-contracts.ts`:

**In verifyL0 function:**
1. Check if new security engine is enabled
2. If enabled:
   - Call runSecurityVerification()
   - Push result to checks array
3. If disabled:
   - Call existing checkForbiddenPatterns()
   - Push result to checks array

**Keep checkForbiddenPatterns for now:**
- Don't delete during transition
- Mark as deprecated with comment
- Will be removed in future version

#### 8.3.4 Modify Work Order Service

Modify `packages/server/src/control-plane/work-order-service.ts`:

**In submitWorkOrder:**
1. If security profile specified in request:
   - Store profile name with work order
2. If project has .agentgate/security.yaml:
   - Note in work order metadata

**Add securityProfile field to WorkOrder:**
- Optional string field
- References profile name

#### 8.3.5 Update Types

Modify `packages/server/src/verifier/types.ts`:

**Add SecurityDiagnostic type:**
- Extends base Diagnostic
- Includes security-specific fields:
  - ruleId
  - detector
  - sensitivity

**Add to VerifyContext:**
- securityPolicy?: string (policy name used)
- securityFindings?: Finding[] (detailed findings)

#### 8.3.6 Update Gate Plan Types

Modify `packages/server/src/gate/gate-plan.ts`:

**Add to GatePlan.contracts:**
- securityProfile?: string (profile to use)
- securityOverrides?: Partial<SecurityPolicy> (inline overrides)

**Deprecate forbiddenPatterns:**
- Keep for backwards compatibility
- Add deprecation notice in types
- Map to security policy during resolution

### 8.4 Verification Steps

1. Run L0 verification with AGENTGATE_NEW_SECURITY=false
   - Verify old behavior works unchanged
2. Run L0 verification with AGENTGATE_NEW_SECURITY=true
   - Verify new security engine is used
   - Verify findings appear in diagnostics
3. Create work order with security profile
   - Verify profile is used during verification
4. Create project with .agentgate/security.yaml
   - Verify project policy is loaded
5. Test allowlist:
   - Add allowlist entry
   - Verify previously blocked file now passes
6. Compare results:
   - Run same workspace with both engines
   - Verify similar detection (new should find more)

### 8.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/security/integration/l0-bridge.ts` | Created |
| `packages/server/src/security/integration/feature-flags.ts` | Created |
| `packages/server/src/security/integration/index.ts` | Created |
| `packages/server/src/verifier/l0-contracts.ts` | Modified |
| `packages/server/src/verifier/types.ts` | Modified |
| `packages/server/src/control-plane/work-order-service.ts` | Modified |
| `packages/server/src/gate/gate-plan.ts` | Modified |

---

## Migration Path

### Phase 1: Parallel Running (This Thrust)

```
┌──────────────────────────────────────────────────────┐
│                    L0 Verification                    │
├──────────────────────────────────────────────────────┤
│                                                       │
│  if (AGENTGATE_NEW_SECURITY) {                       │
│    // New Security Engine                             │
│    result = await runSecurityVerification(...)        │
│  } else {                                             │
│    // Legacy pattern matching                         │
│    result = await checkForbiddenPatterns(...)         │
│  }                                                    │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### Phase 2: Default Enable

- Set AGENTGATE_NEW_SECURITY default to true
- Keep legacy code for fallback
- Monitor for issues

### Phase 3: Legacy Removal

- Remove checkForbiddenPatterns function
- Remove feature flag
- Update all documentation

---

## Backwards Compatibility

### Work Orders Without Security Config

For work orders that don't specify security profile:
1. Use default security policy
2. Default policy includes all current forbidden patterns
3. Behavior is effectively the same

### Gate Plans With forbiddenPatterns

If gate plan specifies forbiddenPatterns:
1. Log deprecation warning
2. Convert to security policy:
   - Create pattern detector config
   - Use SENSITIVE sensitivity
3. Merge with default policy

### API Responses

L0 verification response format unchanged:
- CheckResult format maintained
- passed/failed semantics unchanged
- Details format similar

---

## Result Mapping

### EnforcementResult to CheckResult

```
EnforcementResult                    CheckResult
─────────────────                    ───────────
allowed: true              →         passed: true
allowed: false             →         passed: false
findings.length            →         (used in message)
blockedFindings            →         (converted to details)
summary.total              →         (used in message)
```

### Message Format

**When passed:**
```
Security verification passed (scanned {N} files, {M} warnings)
```

**When failed:**
```
Security verification failed: {N} blocked finding(s)
```

### Details Format

```
Blocked findings:
  - src/config.ts:12 [aws-access-key] AWS Access Key ID detected
  - src/db.ts:5 [postgres-url] PostgreSQL connection string detected

Warnings:
  - src/utils.ts:45 [high-entropy] High-entropy string (4.7 bits)
```

---

## Environment Variables

### AGENTGATE_NEW_SECURITY

Enable the new security engine:
```bash
export AGENTGATE_NEW_SECURITY=true
```

### AGENTGATE_SECURITY_AUDIT

Enable audit logging (separate from engine):
```bash
export AGENTGATE_SECURITY_AUDIT=true
```

### AGENTGATE_SECURITY_STRICT

Enable strict mode (warnings become blocks):
```bash
export AGENTGATE_SECURITY_STRICT=true
```
