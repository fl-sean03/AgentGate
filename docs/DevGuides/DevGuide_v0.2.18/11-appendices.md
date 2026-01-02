# 11: Appendices

## A. Implementation Checklist

### Thrust 1: Core Types and Schemas
- [ ] Create `packages/server/src/security/types.ts`
  - [ ] SensitivityLevel enum
  - [ ] EnforcementAction enum
  - [ ] DetectorConfig interface
  - [ ] AllowlistEntry interface
  - [ ] RuntimeConfig interface
  - [ ] AuditConfig interface
  - [ ] SecurityPolicy interface
  - [ ] ResolvedSecurityPolicy interface
- [ ] Create `packages/server/src/security/schemas.ts`
  - [ ] Zod schemas for all types
  - [ ] Default values configured
  - [ ] Validation error messages
- [ ] Create `packages/server/src/security/index.ts`
- [ ] Run `pnpm typecheck`

### Thrust 2: Policy Layer
- [ ] Create `packages/server/src/security/policy/defaults.ts`
  - [ ] DEFAULT_POLICY constant
  - [ ] DEFAULT_SECRET_PATTERNS array
  - [ ] DEFAULT_FORBIDDEN_PATTERNS array
- [ ] Create `packages/server/src/security/policy/loader.ts`
  - [ ] loadPolicyFromFile function
  - [ ] loadProjectPolicy function
  - [ ] loadProfilePolicy function
  - [ ] listAvailableProfiles function
- [ ] Create `packages/server/src/security/policy/resolver.ts`
  - [ ] resolveSecurityPolicy function
  - [ ] mergePolicies function
  - [ ] handleInheritance function
  - [ ] computePolicyHash function
- [ ] Create `packages/server/src/security/policy/index.ts`

### Thrust 3: Content Detector
- [ ] Create `packages/server/src/security/detectors/types.ts`
  - [ ] Finding interface
  - [ ] DetectorContext interface
  - [ ] Detector interface
  - [ ] ValidationResult interface
- [ ] Create `packages/server/src/security/detectors/patterns.ts`
  - [ ] SecretPattern interface
  - [ ] BUILTIN_SECRET_PATTERNS array (20+ patterns)
  - [ ] compilePatterns function
- [ ] Create `packages/server/src/security/detectors/content-detector.ts`
  - [ ] ContentDetector class
  - [ ] detect method
  - [ ] validateOptions method
  - [ ] maskSecret helper
  - [ ] getLineNumber helper
- [ ] Create `packages/server/src/security/detectors/registry.ts`
  - [ ] DetectorRegistry class
  - [ ] Global detectorRegistry singleton
- [ ] Create `packages/server/src/security/detectors/index.ts`

### Thrust 4: Entropy Detector
- [ ] Create `packages/server/src/security/detectors/entropy-detector.ts`
  - [ ] EntropyDetector class
  - [ ] calculateEntropy function
  - [ ] False positive filtering
- [ ] Register in detectorRegistry

### Thrust 5: Pattern Detector
- [ ] Create `packages/server/src/security/detectors/pattern-detector.ts`
  - [ ] PatternDetector class
  - [ ] Glob pattern matching
- [ ] Create `packages/server/src/security/detectors/gitignore-detector.ts`
  - [ ] GitignoreDetector class
  - [ ] parseGitignore function
  - [ ] isIgnored helper
- [ ] Register both in detectorRegistry

### Thrust 6: Enforcement Engine
- [ ] Create `packages/server/src/security/enforcement/types.ts`
  - [ ] EnforcementResult interface
  - [ ] EnforcementSummary interface
- [ ] Create `packages/server/src/security/enforcement/aggregator.ts`
  - [ ] FindingAggregator class
  - [ ] Allowlist filtering
  - [ ] Summary building
- [ ] Create `packages/server/src/security/enforcement/engine.ts`
  - [ ] SecurityEnforcementEngine class
  - [ ] enforce method
  - [ ] Global securityEngine singleton
- [ ] Create `packages/server/src/security/enforcement/index.ts`

### Thrust 7: Audit Layer
- [ ] Create `packages/server/src/security/audit/types.ts`
  - [ ] AuditEventType enum
  - [ ] Event interfaces for each type
- [ ] Create `packages/server/src/security/audit/logger.ts`
  - [ ] SecurityAuditLogger class
  - [ ] JSONL output
  - [ ] Log rotation
- [ ] Create `packages/server/src/security/audit/index.ts`
- [ ] Integrate with enforcement engine

### Thrust 8: L0 Integration
- [ ] Create `packages/server/src/security/integration/l0-bridge.ts`
  - [ ] runSecurityVerification function
  - [ ] mapEnforcementToCheckResult function
- [ ] Create `packages/server/src/security/integration/feature-flags.ts`
  - [ ] SECURITY_ENGINE_ENABLED constant
- [ ] Modify `packages/server/src/verifier/l0-contracts.ts`
  - [ ] Add feature flag check
  - [ ] Call new security engine when enabled
- [ ] Modify `packages/server/src/verifier/types.ts`
  - [ ] Add security-related types
- [ ] Modify work-order-service.ts
  - [ ] Support securityProfile field

### Thrust 9: CLI and Testing
- [ ] Create CLI commands
  - [ ] `security scan`
  - [ ] `security policy`
  - [ ] `security allow`
  - [ ] `security findings`
- [ ] Create unit tests (90%+ coverage)
  - [ ] types.test.ts
  - [ ] policy.test.ts
  - [ ] content-detector.test.ts
  - [ ] entropy-detector.test.ts
  - [ ] pattern-detector.test.ts
  - [ ] enforcement.test.ts
  - [ ] integration.test.ts
- [ ] Create test fixtures
- [ ] Run full test suite

---

## B. File Reference

### New Files Created

```
packages/server/src/security/
├── index.ts                           # Main exports
├── types.ts                           # Core type definitions
├── schemas.ts                         # Zod validation schemas
├── policy/
│   ├── index.ts                       # Policy module exports
│   ├── defaults.ts                    # Default policy + patterns
│   ├── loader.ts                      # YAML policy loading
│   └── resolver.ts                    # Policy resolution + merge
├── detectors/
│   ├── index.ts                       # Detector module exports
│   ├── types.ts                       # Detector interfaces
│   ├── registry.ts                    # Detector registry
│   ├── patterns.ts                    # Built-in secret patterns
│   ├── content-detector.ts            # Regex-based detection
│   ├── entropy-detector.ts            # Shannon entropy detection
│   ├── pattern-detector.ts            # File pattern matching
│   └── gitignore-detector.ts          # Gitignore-aware detection
├── enforcement/
│   ├── index.ts                       # Enforcement module exports
│   ├── types.ts                       # Result types
│   ├── aggregator.ts                  # Finding aggregation
│   └── engine.ts                      # Main enforcement engine
├── audit/
│   ├── index.ts                       # Audit module exports
│   ├── types.ts                       # Audit event types
│   └── logger.ts                      # JSONL audit logger
└── integration/
    ├── index.ts                       # Integration exports
    ├── l0-bridge.ts                   # L0 verification bridge
    └── feature-flags.ts               # Feature flag control
```

### Test Files Created

```
packages/server/test/security/
├── types.test.ts
├── policy.test.ts
├── content-detector.test.ts
├── entropy-detector.test.ts
├── pattern-detector.test.ts
├── enforcement.test.ts
├── integration.test.ts
└── fixtures/
    ├── secrets.ts
    ├── high-entropy.txt
    ├── safe-code.ts
    └── project-policy.yaml
```

### Modified Files

```
packages/server/src/
├── verifier/
│   ├── l0-contracts.ts               # Add security engine call
│   └── types.ts                      # Add security types
├── control-plane/
│   ├── work-order-service.ts         # Add security profile support
│   └── commands/
│       └── security.ts               # New CLI commands
└── gate/
    └── gate-plan.ts                  # Deprecate forbiddenPatterns
```

---

## C. Secret Pattern Reference

### AWS

| ID | Pattern | Example |
|----|---------|---------|
| `aws-access-key-id` | `AKIA[0-9A-Z]{16}` | AKIAIOSFODNN7EXAMPLE |
| `aws-secret-key` | 40-char base64 | wJalrXUtnFEMI/K7MDENG... |

### GitHub

| ID | Pattern | Example |
|----|---------|---------|
| `github-pat` | `ghp_[A-Za-z0-9]{36}` | ghp_xxxx...xxxx |
| `github-oauth` | `gho_[A-Za-z0-9]{36}` | gho_xxxx...xxxx |
| `github-fine-grained` | `github_pat_...` | github_pat_xxxx...xxxx |

### Stripe

| ID | Pattern | Example |
|----|---------|---------|
| `stripe-secret` | `sk_live_[A-Za-z0-9]{24,}` | sk_test_EXAMPLE... |
| `stripe-publishable` | `pk_live_[A-Za-z0-9]{24,}` | pk_live_xxxx... |

### Private Keys

| ID | Pattern | Example |
|----|---------|---------|
| `rsa-private-key` | `-----BEGIN RSA PRIVATE KEY-----` | N/A |
| `ec-private-key` | `-----BEGIN EC PRIVATE KEY-----` | N/A |
| `openssh-private-key` | `-----BEGIN OPENSSH PRIVATE KEY-----` | N/A |

### Database URLs

| ID | Pattern | Example |
|----|---------|---------|
| `postgres-url` | `postgres://...` | postgres://user:pass@host/db |
| `mongodb-url` | `mongodb://...` | mongodb://user:pass@host/db |
| `redis-url` | `redis://...` | redis://user:pass@host |

---

## D. Configuration Examples

### Minimal Project Policy

```yaml
# .agentgate/security.yaml
version: "1.0"
name: "my-project"

allowlist:
  - pattern: "test/fixtures/**"
    reason: "Test data with mock credentials"
```

### Strict Policy

```yaml
version: "1.0"
name: "strict"

detectors:
  - type: content
    enabled: true
    sensitivity: restricted

  - type: entropy
    enabled: true
    sensitivity: sensitive
    options:
      threshold: 4.0  # Lower = more sensitive

enforcement:
  info: warn
  warning: block
  sensitive: deny
  restricted: deny

audit:
  enabled: true
  includeContent: true
```

### Development Policy

```yaml
version: "1.0"
name: "dev"
extends: "default"

detectors:
  - type: entropy
    enabled: false  # Too many false positives in dev

allowlist:
  - pattern: ".env.local"
    reason: "Local development config"
  - pattern: "**/*.mock.*"
    reason: "Mock files for testing"

enforcement:
  warning: log  # Don't block on warnings
```

---

## E. Troubleshooting

### Common Issues

**Issue: Scan taking too long**
- Check file count: `find . -type f | wc -l`
- Add excludes for large directories
- Increase maxFileSizeBytes if many small files

**Issue: False positives on high-entropy**
- Increase entropy threshold (4.5 → 5.0)
- Add specific patterns to allowlist
- Disable entropy detector if not needed

**Issue: Policy not loading**
- Check YAML syntax: `agentgate security policy validate`
- Verify file location: `.agentgate/security.yaml`
- Check file permissions

**Issue: Allowlist not working**
- Verify pattern syntax (use globs)
- Check if allowlist entry expired
- Verify detector name matches

### Debug Commands

```bash
# Show resolved policy
agentgate security policy show --verbose

# Dry-run scan (no blocking)
agentgate security scan . --dry-run

# Show why file was blocked
agentgate security explain src/config.ts

# List all detected secrets (masked)
agentgate security scan . --format json | jq '.findings'
```

---

## F. Migration Checklist

### From Legacy Forbidden Patterns

1. [ ] Enable new security engine: `AGENTGATE_NEW_SECURITY=true`
2. [ ] Create project policy with current patterns:
   ```yaml
   version: "1.0"
   name: "migrated"
   detectors:
     - type: pattern
       options:
         patterns:
           # Copy from gate plan forbiddenPatterns
   ```
3. [ ] Run scan and compare results
4. [ ] Add allowlist entries as needed
5. [ ] Remove forbiddenPatterns from gate plan
6. [ ] Set new security as default

### Testing Migration

```bash
# Run with old system
AGENTGATE_NEW_SECURITY=false agentgate verify /path/to/workspace

# Run with new system
AGENTGATE_NEW_SECURITY=true agentgate verify /path/to/workspace

# Compare outputs
diff old-result.json new-result.json
```

---

## G. Performance Benchmarks

### Expected Performance

| Workspace Size | Files | Expected Duration |
|---------------|-------|-------------------|
| Small | < 100 | < 200ms |
| Medium | 100-1,000 | 200ms - 2s |
| Large | 1,000-10,000 | 2s - 10s |
| Very Large | > 10,000 | 10s - 30s |

### Optimization Tips

1. **Add excludes** for large directories:
   ```yaml
   excludes:
     - "**/node_modules/**"
     - "**/dist/**"
     - "**/.git/**"
     - "**/vendor/**"
   ```

2. **Reduce max file size** if not scanning large files:
   ```yaml
   detectors:
     - type: content
       options:
         maxFileSizeBytes: 102400  # 100KB
   ```

3. **Disable unused detectors**:
   ```yaml
   detectors:
     - type: entropy
       enabled: false
   ```

---

## H. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01-XX | Initial implementation |

---

## I. References

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [TruffleHog](https://github.com/trufflesecurity/trufflehog) - Secret detection patterns
- [GitLeaks](https://github.com/gitleaks/gitleaks) - Git secret scanner
- [Shannon Entropy](https://en.wikipedia.org/wiki/Entropy_(information_theory))
- [Fast-glob](https://github.com/mrmlnc/fast-glob) - File pattern matching
- [Zod](https://github.com/colinhacks/zod) - TypeScript schema validation
