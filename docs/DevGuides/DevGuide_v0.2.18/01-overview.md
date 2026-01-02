# 01: Overview - Security Verification Refactor

## Current State Analysis

### Existing Implementation

The current security verification lives in L0 contract verification:

**Location:** `packages/server/src/verifier/l0-contracts.ts`

**Current Flow:**
```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Gate Plan    │───▶│ L0 Verifier  │───▶│ Fast-glob    │
│ (hardcoded)  │    │ (contracts)  │    │ (patterns)   │
└──────────────┘    └──────────────┘    └──────────────┘
       │                                       │
       │            ┌──────────────┐           │
       └───────────▶│ Path Policy  │◀──────────┘
                    │ (runtime)    │
                    └──────────────┘
```

### Current Forbidden Patterns

Default forbidden patterns are hardcoded in multiple places:

```typescript
// packages/server/src/control-plane/work-order-service.ts
const DEFAULT_FORBIDDEN_PATTERNS = [
  '**/.env',
  '**/.env.*',
  '**/credentials.json',
  '**/service-account*.json',
  '**/*.pem',
  '**/*.key',
  '**/id_rsa*',
  '**/id_ed25519*',
];
```

### How checkForbiddenPatterns Works

```typescript
async function checkForbiddenPatterns(
  workDir: string,
  forbiddenPatterns: string[],
  ctx: VerifyContext
): Promise<CheckResult> {
  // Build ignore patterns
  const ignorePatterns = ['**/node_modules/**', '**/dist/**', '**/.git/**'];

  // Read .gitignore to exclude already-ignored files
  try {
    const gitignoreContent = await readFile(join(workDir, '.gitignore'), 'utf-8');
    // Parse and add to ignorePatterns
  } catch { /* continue without */ }

  // Use fast-glob to find matches
  const matches = await fg(forbiddenPatterns, {
    cwd: workDir,
    dot: true,
    onlyFiles: true,
    ignore: ignorePatterns,
  });

  // If matches found, fail verification
  if (matches.length > 0) {
    return { passed: false, ... };
  }
}
```

### Limitations Analysis

| Limitation | Description | Example |
|------------|-------------|---------|
| **Filename-only** | Only checks file names/paths, not contents | `config.ts` with `const key = "sk_live_..."` passes |
| **Binary decisions** | No distinction between warn and block | `.env.example` blocked same as `.env` |
| **No allowlisting** | Cannot exempt legitimate files | Test fixtures always fail |
| **Hardcoded patterns** | Difficult to customize | Must modify source code |
| **No content scanning** | Can't detect secrets in arbitrary files | AWS keys in any `.ts` file |
| **No audit trail** | No record of security decisions | Compliance issues |
| **Scattered config** | Patterns in 3+ places | Inconsistent behavior |

---

## Gap Analysis

### Detection Capabilities

| Secret Type | Current Detection | Proposed Detection |
|-------------|------------------|-------------------|
| `.env` files | Filename only | Filename + content scan |
| AWS Access Keys | Not detected | Regex: `AKIA[0-9A-Z]{16}` |
| AWS Secret Keys | Not detected | Regex: 40-char base64 |
| GitHub Tokens | Not detected | Regex: `gh[pousr]_[A-Za-z0-9]{36,}` |
| Private Keys | `*.pem`, `*.key` only | `-----BEGIN...PRIVATE KEY-----` |
| Stripe Keys | Not detected | Regex: `sk_live_[A-Za-z0-9]{24,}` |
| Slack Tokens | Not detected | Regex: `xox[baprs]-...` |
| Database URLs | Not detected | Regex: `postgres://...:...@` |
| High-entropy strings | Not detected | Shannon entropy > 4.5 |

### Configuration Capabilities

| Capability | Current | Proposed |
|------------|---------|----------|
| Project config | None | `.agentgate/security.yaml` |
| User profiles | None | `~/.agentgate/security/*.yaml` |
| Allowlisting | None | Per-file with reason, approver, expiry |
| Sensitivity levels | None | INFO, WARNING, SENSITIVE, RESTRICTED |
| Custom detectors | None | Plugin interface |

### Audit Capabilities

| Capability | Current | Proposed |
|------------|---------|----------|
| Decision logging | None | JSONL audit log |
| Finding details | None | Full context per finding |
| Policy snapshots | None | Config at time of scan |
| Runtime access | None | File access logging |

---

## Target Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Security Policy Engine                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Policy Layer                           │  │
│  │                                                            │  │
│  │   PolicyResolver    PolicyLoader    DefaultPolicy          │  │
│  │   (merge/inherit)   (YAML files)    (built-in)             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │                    Detection Layer                         │  │
│  │                           │                                │  │
│  │  ┌────────────────────────v─────────────────────────────┐ │  │
│  │  │               Detector Registry                       │ │  │
│  │  │                                                       │ │  │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │ │  │
│  │  │  │Content  │ │Entropy  │ │Pattern  │ │Gitignore│    │ │  │
│  │  │  │Detector │ │Detector │ │Detector │ │Detector │    │ │  │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │ │  │
│  │  └───────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │                  Enforcement Layer                         │  │
│  │                           │                                │  │
│  │        SecurityEnforcementEngine.enforce()                 │  │
│  │        - Run all enabled detectors                         │  │
│  │        - Aggregate findings                                │  │
│  │        - Apply allowlist                                   │  │
│  │        - Determine action per sensitivity                  │  │
│  │        - Return EnforcementResult                          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │                     Audit Layer                            │  │
│  │                           │                                │  │
│  │        SecurityAuditLogger                                 │  │
│  │        - Log enforcement decisions                         │  │
│  │        - Log runtime file access                           │  │
│  │        - JSONL output format                               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Work Order Submitted
   │
   v
2. Resolve Security Policy
   ├── Load default policy
   ├── Load user profile (if specified)
   ├── Load project policy (if exists)
   └── Merge with inheritance
   │
   v
3. Pre-Execution Security Scan (L0)
   ├── Get list of files (respecting excludes)
   ├── Run each enabled detector
   │   ├── ContentDetector (regex patterns)
   │   ├── EntropyDetector (high-entropy strings)
   │   ├── PatternDetector (filename patterns)
   │   └── GitignoreDetector (check if tracked)
   ├── Aggregate all findings
   ├── Apply allowlist rules
   └── Determine enforcement action
   │
   v
4. Enforcement Decision
   ├── If BLOCKED findings: Fail L0 verification
   ├── If WARNED findings: Log and continue
   └── If INFO findings: Log only
   │
   v
5. Audit Logging
   └── Write enforcement event to audit log
```

---

## Security Policy Structure

### Policy Hierarchy

```
Default Policy (built-in)
    │
    └── User Profile (~/.agentgate/security/profile.yaml)
            │
            └── Project Policy (.agentgate/security.yaml)
                    │
                    └── Inline Overrides (API/CLI)
```

Each level can:
- Override parent settings
- Add new detectors
- Add allowlist entries
- Modify enforcement rules

### Policy Schema

```yaml
version: "1.0"
name: string
extends: string (optional)

detectors:
  - type: content | entropy | pattern | gitignore
    enabled: boolean
    sensitivity: info | warning | sensitive | restricted
    options: { detector-specific }

enforcement:
  info: log
  warning: warn
  sensitive: block
  restricted: deny

allowlist:
  - pattern: string (glob)
    reason: string (required)
    approvedBy: string (optional)
    expiresAt: string (ISO date, optional)
    detectors: string[] (optional, empty = all)

excludes:
  - string (glob patterns)

runtime:
  enabled: boolean
  blockAccess: boolean
  logAccess: boolean

audit:
  enabled: boolean
  destination: file | stdout | syslog
  path: string (if file)
  includeContent: boolean
  retentionDays: number
```

---

## Detector Interface

### Base Interface

Every detector implements:

```typescript
interface Detector {
  readonly type: string;          // Unique identifier
  readonly name: string;          // Human-readable name
  readonly description: string;   // What it detects

  detect(ctx: DetectorContext, options: Record<string, unknown>): Promise<Finding[]>;
  validateOptions(options: Record<string, unknown>): ValidationResult;
}
```

### Finding Structure

```typescript
interface Finding {
  ruleId: string;              // e.g., "aws-access-key"
  message: string;             // Human-readable description
  file: string;                // Relative path
  line?: number;               // Line number (1-indexed)
  column?: number;             // Column number (1-indexed)
  match?: string;              // Masked match value
  sensitivity: SensitivityLevel;
  detector: string;            // Detector type
  metadata?: Record<string, unknown>;
}
```

### Built-in Detectors

| Detector | Purpose | Sensitivity |
|----------|---------|-------------|
| `content` | Regex-based secret scanning | RESTRICTED |
| `entropy` | High-entropy string detection | WARNING |
| `pattern` | Filename pattern matching | SENSITIVE |
| `gitignore` | Detect untracked sensitive files | INFO |

---

## Integration Points

### L0 Verification Integration

The existing `verifyL0` function calls `checkForbiddenPatterns`. This will be replaced:

```typescript
// Before (l0-contracts.ts)
const forbiddenResult = await checkForbiddenPatterns(workDir, patterns, ctx);

// After
const securityResult = await securityEngine.enforce(workDir, resolvedPolicy);
const forbiddenResult = mapSecurityToCheckResult(securityResult);
```

### Work Order Service Integration

Security policy resolution happens at work order submission:

```typescript
// work-order-service.ts
async submitWorkOrder(request: CreateWorkOrderRequest) {
  // Resolve security policy
  const securityPolicy = await resolveSecurityPolicy(
    workspaceDir,
    request.securityProfile
  );

  // Store policy with work order
  const workOrder = {
    ...request,
    securityPolicy: securityPolicy.name,
    securityPolicyHash: securityPolicy.hash,
  };
}
```

### Runtime Integration

During agent execution, file access can be monitored:

```typescript
// path-policy.ts
async isAllowed(path: string, operation: 'read' | 'write'): Promise<boolean> {
  // Check against security policy
  const finding = await securityEngine.checkPath(path, operation);

  if (finding) {
    await auditLogger.logRuntimeAccess({
      path,
      operation,
      allowed: false,
      reason: finding.message,
    });
    return false;
  }

  return true;
}
```

---

## Migration Strategy

### Phase 1: Parallel Implementation

1. Create new `packages/server/src/security/` module
2. Implement all components
3. Add comprehensive tests
4. Both systems run during transition

### Phase 2: Integration

1. Add feature flag: `AGENTGATE_NEW_SECURITY=true`
2. L0 verification uses new system when enabled
3. Compare results with old system in logs
4. Monitor for discrepancies

### Phase 3: Cutover

1. Make new system the default
2. Deprecate old `checkForbiddenPatterns`
3. Remove feature flag
4. Clean up old code

### Backwards Compatibility

- Default policy includes all current forbidden patterns
- No new required configuration
- Existing work orders work unchanged
- API responses maintain same structure

---

## Error Handling

### Error Types

| Error | Description | Handling |
|-------|-------------|----------|
| Policy not found | Named profile doesn't exist | Warn and use default |
| Invalid policy | YAML parse or validation error | Fail with details |
| Detector error | Detector throws during scan | Log and continue |
| File access error | Can't read file for scanning | Skip file, log warning |

### Graceful Degradation

- If project policy invalid: Use default
- If detector fails: Skip that detector
- If file unreadable: Skip file (not block)
- If audit logging fails: Log error, continue

---

## Performance Considerations

### File Scanning Optimization

- Skip binary files (by extension)
- Limit file size (1MB default)
- Compile regexes once, reuse
- Run detectors in parallel

### Caching Strategy

- Cache compiled regex patterns
- Cache resolved policies (per work order)
- Cache file type detection

### Expected Performance

| File Count | Expected Duration |
|------------|-------------------|
| 100 files | < 500ms |
| 1,000 files | < 2s |
| 10,000 files | < 10s |

---

## Testing Strategy

### Unit Tests

| Component | Test Focus |
|-----------|------------|
| ContentDetector | Pattern matching, edge cases |
| EntropyDetector | Threshold calibration |
| PolicyResolver | Inheritance, merging |
| EnforcementEngine | Decision logic |
| AuditLogger | Event formatting |

### Integration Tests

| Scenario | Verification |
|----------|--------------|
| Full scan workflow | Policy → Detect → Enforce → Audit |
| Allowlist exemption | Allowlisted files not blocked |
| Policy inheritance | Child overrides parent correctly |
| L0 integration | Security findings in L0 report |

### Fixture-Based Tests

Create test fixtures with:
- Known secrets (AWS keys, tokens)
- High-entropy strings
- Allowlisted files
- Edge cases (binary files, large files)
