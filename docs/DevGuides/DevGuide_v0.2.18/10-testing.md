# 10: CLI and Testing

This document covers Thrust 9: implementing CLI commands and comprehensive testing for the Security Policy Engine.

---

## Thrust 9: CLI and Testing

### 9.1 Objective

Implement CLI commands for security management (scan, policy, allowlist) and create comprehensive tests achieving 90%+ coverage on the security module.

### 9.2 Background

The CLI provides user-facing commands for:
- Running security scans independently
- Managing security profiles
- Viewing/managing allowlist entries
- Debugging security issues

Testing ensures:
- All detectors work correctly
- Policy resolution is accurate
- Enforcement logic is sound
- Integration with L0 is seamless

### 9.3 Subtasks

#### 9.3.1 Create Security CLI Commands

Create `packages/server/src/control-plane/commands/security.ts`:

**security scan command:**
- Usage: `agentgate security scan [path] [--profile name] [--verbose]`
- Runs security scan on specified path
- Outputs findings to console
- Returns exit code 1 if blocked findings

**security policy command:**
- Usage: `agentgate security policy [show|validate|list]`
- show: Display resolved policy for current directory
- validate: Validate a policy file
- list: List available profiles

**security allow command:**
- Usage: `agentgate security allow <file> --reason "..." [--expires date]`
- Add file to project allowlist
- Requires reason for audit

**security findings command:**
- Usage: `agentgate security findings [runId]`
- Show security findings for a run
- Query from audit log

#### 9.3.2 Implement CLI Output Formatting

Create `packages/server/src/control-plane/commands/security-output.ts`:

**formatScanResult(result):**
- Format EnforcementResult for console
- Color-coded by severity
- Show file:line for each finding
- Show summary at end

**formatPolicy(policy):**
- Pretty-print security policy
- Show inheritance chain
- Show enabled detectors
- Show allowlist entries

**formatFindings(findings):**
- Table format for findings
- Group by detector
- Sort by severity

#### 9.3.3 Create Unit Tests for Types

Create `packages/server/test/security/types.test.ts`:

**Test SensitivityLevel:**
- Verify all enum values exist
- Test type inference

**Test SecurityPolicy schema:**
- Valid policy passes validation
- Invalid version rejected
- Missing required fields rejected
- Default values applied

**Test AllowlistEntry schema:**
- Reason is required
- expiresAt format validated
- Pattern is required

#### 9.3.4 Create Unit Tests for Policy

Create `packages/server/test/security/policy.test.ts`:

**Test PolicyLoader:**
- Load valid YAML file
- Handle missing file
- Handle invalid YAML
- Handle validation errors

**Test PolicyResolver:**
- Resolve default policy
- Merge with profile policy
- Merge with project policy
- Handle inheritance chain
- Detect circular inheritance

**Test Policy Merging:**
- Scalar override
- Array concatenation
- Detector replacement
- Deep object merge

#### 9.3.5 Create Unit Tests for Detectors

Create `packages/server/test/security/content-detector.test.ts`:

**Test AWS key detection:**
- Valid AWS access key detected
- Masked example not detected
- Key in comment detected
- Key in string detected

**Test GitHub token detection:**
- PAT detected
- OAuth token detected
- Fine-grained token detected

**Test private key detection:**
- RSA key header detected
- EC key header detected
- OpenSSH key detected

**Test file handling:**
- Binary files skipped
- Large files skipped
- Unreadable files skipped

Create `packages/server/test/security/entropy-detector.test.ts`:

**Test entropy calculation:**
- Low entropy string → low value
- High entropy string → high value
- Known entropy values match

**Test threshold filtering:**
- Below threshold not reported
- Above threshold reported
- Edge case at threshold

**Test false positive filtering:**
- UUIDs not reported
- Common patterns filtered

Create `packages/server/test/security/pattern-detector.test.ts`:

**Test pattern matching:**
- Exact match works
- Wildcard match works
- Double wildcard works
- Negation works

**Test gitignore integration:**
- Gitignored files detected
- Tracked sensitive files warned

#### 9.3.6 Create Unit Tests for Enforcement

Create `packages/server/test/security/enforcement.test.ts`:

**Test FindingAggregator:**
- Allowlist filtering works
- Expired allowlist not applied
- Detector-specific allowlist works
- Summary counts accurate

**Test SecurityEnforcementEngine:**
- All detectors run
- Findings aggregated
- Blocked vs warned categorization
- Result structure correct

**Test enforcement mapping:**
- INFO → LOG
- WARNING → WARN
- SENSITIVE → BLOCK
- RESTRICTED → DENY

#### 9.3.7 Create Integration Tests

Create `packages/server/test/security/integration.test.ts`:

**Test full scan flow:**
1. Create temp workspace with test files
2. Add files with known secrets
3. Run full security scan
4. Verify correct findings returned

**Test with allowlist:**
1. Create workspace with secrets
2. Add allowlist for some files
3. Run scan
4. Verify allowlisted files not blocked

**Test with custom policy:**
1. Create workspace with policy file
2. Run scan
3. Verify policy settings applied

**Test L0 integration:**
1. Create workspace
2. Run L0 verification
3. Verify security check included
4. Verify diagnostics correct

#### 9.3.8 Create Test Fixtures

Create `packages/server/test/security/fixtures/`:

**secrets.ts:**
- File with various secrets for testing
- Each secret type represented
- Comments explaining each

**high-entropy.txt:**
- File with high-entropy strings
- Mix of true and false positives

**safe-code.ts:**
- File with no secrets
- Should pass all scans

**project-policy.yaml:**
- Example project policy
- Custom detectors and allowlist

### 9.4 Verification Steps

1. Run `pnpm test packages/server/test/security`
   - All tests pass
   - Coverage > 90%

2. Test CLI commands:
   - `agentgate security scan .` works
   - `agentgate security policy show` works
   - `agentgate security allow file.ts --reason "test"` works

3. Run on AgentGate codebase:
   - Scan AgentGate itself
   - Review findings (should be minimal)
   - Verify no false positives on normal code

4. Run L0 verification:
   - Enable new security engine
   - Run verification on test workspace
   - Verify findings in output

### 9.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/control-plane/commands/security.ts` | Created |
| `packages/server/src/control-plane/commands/security-output.ts` | Created |
| `packages/server/test/security/types.test.ts` | Created |
| `packages/server/test/security/policy.test.ts` | Created |
| `packages/server/test/security/content-detector.test.ts` | Created |
| `packages/server/test/security/entropy-detector.test.ts` | Created |
| `packages/server/test/security/pattern-detector.test.ts` | Created |
| `packages/server/test/security/enforcement.test.ts` | Created |
| `packages/server/test/security/integration.test.ts` | Created |
| `packages/server/test/security/fixtures/*` | Created |

---

## CLI Output Examples

### Security Scan Output

```
$ agentgate security scan ./src

Security Scan Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Policy: my-project (extends: default)
Files scanned: 1,247
Duration: 1.2s

┌────────────────────────────────────────────────────────────────┐
│ BLOCKED: 2 findings require attention                          │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  src/config/api.ts:12                                          │
│  ╭───────────────────────────────────────────────────────────╮ │
│  │ const stripeKey = 'sk_live_****...****';                  │ │
│  ╰───────────────────────────────────────────────────────────╯ │
│  [stripe-secret] Stripe Secret Key detected                    │
│  Sensitivity: RESTRICTED                                       │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ WARNINGS: 3 findings (execution continues)                     │
├────────────────────────────────────────────────────────────────┤
│ • test/fixtures/mock.ts:8 - high-entropy (4.7)                 │
│ • scripts/setup.sh:22 - high-entropy (4.6)                     │
│ • docs/api.md:156 - generic-api-key                            │
└────────────────────────────────────────────────────────────────┘

Summary:
  ├── RESTRICTED: 2
  ├── WARNING: 3
  └── INFO: 12

To allowlist a file:
  agentgate security allow src/config/api.ts --reason "..."
```

### Policy Show Output

```
$ agentgate security policy show

Security Policy: my-project
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Inheritance: default → nodejs-strict → my-project

Detectors:
  ├── content (enabled, RESTRICTED)
  │   └── 15 patterns loaded
  ├── entropy (enabled, WARNING)
  │   └── threshold: 4.5
  ├── pattern (enabled, SENSITIVE)
  │   └── 12 patterns
  └── gitignore (enabled, INFO)

Enforcement:
  INFO       → LOG
  WARNING    → WARN
  SENSITIVE  → BLOCK
  RESTRICTED → DENY

Allowlist (3 entries):
  • test/fixtures/** - Test data (security-team)
  • docs/examples/*.env.example - Example files
  • *.mock.ts - Mock files (dev-team, expires: 2024-12-31)

Excludes:
  • **/node_modules/**
  • **/dist/**
  • **/coverage/**
```

---

## Test Coverage Requirements

### Minimum Coverage by Module

| Module | Min Coverage |
|--------|--------------|
| types.ts | 100% |
| schemas.ts | 95% |
| policy/*.ts | 90% |
| detectors/*.ts | 90% |
| enforcement/*.ts | 90% |
| audit/*.ts | 85% |
| integration/*.ts | 85% |

### Critical Path Coverage

These paths MUST have 100% coverage:
- Enforcement decision logic
- Allowlist filtering
- Sensitivity to action mapping
- Policy merging

### Edge Cases to Test

- Empty workspace (no files)
- Binary-only workspace
- Very large files
- Deeply nested directories
- Circular symlinks
- Permission denied files
- Unicode filenames
- Very long lines
