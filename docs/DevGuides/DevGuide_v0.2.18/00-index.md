# 00: Index - Security Verification Refactor

## DevGuide v0.2.18

**Title:** Security Verification System Refactor
**Status:** Not Started (Blocked by v0.2.17)
**Prerequisites:** v0.2.17 (Comprehensive API Extension)

---

## Executive Summary

Refactor AgentGate's security verification from simple "forbidden files" pattern matching into a comprehensive **Security Policy Engine** with content-based secret detection, tiered sensitivity levels, plugin architecture, and audit logging.

**Key Insight:** The current filename-based forbidden patterns miss actual secrets in file contents and provide no nuanced handling (warn vs block). A content-aware, extensible security system is required for production use.

---

## Problem Statement

The current L0 verification has critical limitations:

| Limitation | Impact | Severity |
|------------|--------|----------|
| Filename-based detection only | Misses hardcoded secrets in source files | Critical |
| Hardcoded patterns | Difficult to customize per-project | High |
| No content scanning | Can't detect AWS keys, tokens, private keys | Critical |
| Binary allow/deny | No warn vs block distinction | Medium |
| Scattered configuration | Patterns defined in 3+ places | Medium |
| No audit trail | Can't investigate security decisions | High |
| .gitignore parsing fragile | Breaks on complex patterns | Medium |

**Impact:**
- Secrets can leak into agent-generated code
- No way to allowlist legitimate test fixtures
- No audit trail for compliance
- Developers can't customize security per-project

---

## Target Architecture

```
+-----------------------------------------------------------------------+
|                    SECURITY POLICY ENGINE                              |
+-----------------------------------------------------------------------+
|                                                                        |
|  +-----------------------------------------------------------------+  |
|  |                      POLICY LAYER                                |  |
|  |  +------------+  +------------+  +------------+                  |  |
|  |  | Project    |  | Profile    |  | Default    |                  |  |
|  |  | Policy     |  | Policy     |  | Policy     |                  |  |
|  |  | (.agent-   |  | (~/.agent- |  | (built-in) |                  |  |
|  |  |  gate/)    |  |  gate/)    |  |            |                  |  |
|  |  +-----+------+  +-----+------+  +-----+------+                  |  |
|  |        |               |               |                         |  |
|  |        +--------> RESOLVER <-----------+                         |  |
|  +-----------------------------------------------------------------+  |
|                              |                                         |
|  +-----------------------------------------------------------------+  |
|  |                    DETECTION LAYER                               |  |
|  |  +-------------+  +-------------+  +-------------+               |  |
|  |  | Content     |  | Entropy     |  | Pattern     |   ...         |  |
|  |  | Detector    |  | Detector    |  | Detector    |               |  |
|  |  +-------------+  +-------------+  +-------------+               |  |
|  |                           |                                      |  |
|  |              +------------v-----------+                          |  |
|  |              |   Finding Aggregator   |                          |  |
|  |              +------------------------+                          |  |
|  +-----------------------------------------------------------------+  |
|                              |                                         |
|  +-----------------------------------------------------------------+  |
|  |                   ENFORCEMENT LAYER                              |  |
|  |  +-------------+  +-------------+  +-------------+               |  |
|  |  | Pre-Exec    |  | Runtime     |  | Post-Exec   |               |  |
|  |  | Gate (L0)   |  | Monitor     |  | Audit       |               |  |
|  |  +-------------+  +-------------+  +-------------+               |  |
|  +-----------------------------------------------------------------+  |
|                              |                                         |
|  +-----------------------------------------------------------------+  |
|  |                      AUDIT LAYER                                 |  |
|  |              +------------------------+                          |  |
|  |              |    Security Audit      |                          |  |
|  |              |    Logger (JSONL)      |                          |  |
|  |              +------------------------+                          |  |
|  +-----------------------------------------------------------------+  |
|                                                                        |
+-----------------------------------------------------------------------+
```

---

## Success Criteria

- [ ] Content-based secret detection catches AWS keys, GitHub tokens, Stripe keys, private keys
- [ ] 4-tier sensitivity levels: INFO, WARNING, SENSITIVE, RESTRICTED
- [ ] Detector plugin interface allows custom detectors
- [ ] Project-level `.agentgate/security.yaml` configuration
- [ ] User-level profile configuration in `~/.agentgate/security/`
- [ ] Allowlist system with reasons, approvers, expiration
- [ ] Audit logging for all security decisions
- [ ] Backwards compatible with existing L0 verification
- [ ] 90%+ test coverage on security module
- [ ] CLI output clearly shows blocked vs warned findings

---

## Design Decisions

### 1. Content-Aware Detection

Scan actual file contents using regex patterns for known secret formats (AWS keys, tokens, private keys). Supplement with entropy detection for random-looking strings.

### 2. Tiered Sensitivity Levels

| Level | Action | Override |
|-------|--------|----------|
| INFO | Log only | N/A |
| WARNING | Warn, continue | N/A |
| SENSITIVE | Block, allow override | With allowlist |
| RESTRICTED | Always block | Never |

### 3. Plugin Architecture

Detectors implement a common interface, registered in a central registry. Built-in detectors: pattern, content, entropy, gitignore.

### 4. YAML Configuration

Human-readable YAML files for security policy at project and user levels, with inheritance support.

### 5. Audit-First

All security decisions logged to JSONL files with full context for compliance and debugging.

---

## Thrust Overview

| # | Name | Description | Files |
|---|------|-------------|-------|
| 1 | Core Types & Schemas | Security policy types, sensitivity levels, detector interface | 3 |
| 2 | Policy Layer | Policy resolver, config loading, inheritance | 3 |
| 3 | Content Detector | Regex-based secret scanning with pattern library | 2 |
| 4 | Entropy Detector | Shannon entropy detection for high-entropy strings | 1 |
| 5 | Pattern Detector | File pattern matching (gitignore-style) | 2 |
| 6 | Enforcement Engine | Aggregate findings, apply policy, determine action | 2 |
| 7 | Audit Layer | Security audit logging, event types | 2 |
| 8 | L0 Integration | Replace forbidden patterns with Security Engine | 3 |
| 9 | CLI & Testing | Security commands, comprehensive tests | 4 |

---

## File Map

### New Files (Security Core)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/security/types.ts` | 1 | Security policy types, enums |
| `packages/server/src/security/schemas.ts` | 1 | Zod schemas for validation |
| `packages/server/src/security/index.ts` | 1 | Public exports |

### New Files (Policy Layer)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/security/policy/resolver.ts` | 2 | Policy resolution and inheritance |
| `packages/server/src/security/policy/loader.ts` | 2 | Load policies from filesystem |
| `packages/server/src/security/policy/defaults.ts` | 2 | Default policy definition |

### New Files (Detectors)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/security/detectors/types.ts` | 3 | Detector interface |
| `packages/server/src/security/detectors/registry.ts` | 3 | Detector registry |
| `packages/server/src/security/detectors/content-detector.ts` | 3 | Regex-based secret scanner |
| `packages/server/src/security/detectors/patterns.ts` | 3 | Built-in secret patterns |
| `packages/server/src/security/detectors/entropy-detector.ts` | 4 | Entropy-based detection |
| `packages/server/src/security/detectors/pattern-detector.ts` | 5 | File pattern matching |
| `packages/server/src/security/detectors/gitignore-detector.ts` | 5 | Gitignore-aware detection |

### New Files (Enforcement)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/security/enforcement/engine.ts` | 6 | Enforcement engine |
| `packages/server/src/security/enforcement/aggregator.ts` | 6 | Finding aggregation |

### New Files (Audit)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/security/audit/logger.ts` | 7 | Audit event logger |
| `packages/server/src/security/audit/types.ts` | 7 | Audit event types |

### Modified Files

| File | Thrust | Changes |
|------|--------|---------|
| `packages/server/src/verifier/l0-contracts.ts` | 8 | Replace forbidden patterns with Security Engine |
| `packages/server/src/verifier/types.ts` | 8 | Add security-related types |
| `packages/server/src/control-plane/work-order-service.ts` | 8 | Integrate security policy |

### New Files (Tests)

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/test/security/content-detector.test.ts` | 9 | Content detector tests |
| `packages/server/test/security/entropy-detector.test.ts` | 9 | Entropy detector tests |
| `packages/server/test/security/enforcement.test.ts` | 9 | Enforcement engine tests |
| `packages/server/test/security/integration.test.ts` | 9 | Full integration tests |

---

## Quick Reference

### Sensitivity Levels

```
INFO       -> Log only, no action
WARNING    -> Warn user, continue execution
SENSITIVE  -> Block unless allowlisted
RESTRICTED -> Always block, no override
```

### Security Policy Example

```yaml
# .agentgate/security.yaml
version: "1.0"
name: "my-project"

detectors:
  - type: content
    enabled: true
    sensitivity: restricted

  - type: entropy
    enabled: true
    sensitivity: warning
    options:
      threshold: 4.5

allowlist:
  - pattern: "test/fixtures/**"
    reason: "Test data with fake secrets"
    approvedBy: "security-team"

excludes:
  - "**/node_modules/**"
  - "**/dist/**"
```

### Finding Format

```json
{
  "ruleId": "aws-access-key",
  "message": "AWS Access Key ID detected",
  "file": "src/config.ts",
  "line": 12,
  "match": "AKIA****...****XXXX",
  "sensitivity": "restricted",
  "detector": "content"
}
```

---

## Navigation

| Document | Contents |
|----------|----------|
| [01-overview.md](./01-overview.md) | Current state, gap analysis, architecture |
| [02-core-types.md](./02-core-types.md) | Thrust 1: Types and schemas |
| [03-policy-layer.md](./03-policy-layer.md) | Thrust 2: Policy resolution |
| [04-content-detector.md](./04-content-detector.md) | Thrust 3: Content detection |
| [05-entropy-detector.md](./05-entropy-detector.md) | Thrust 4: Entropy detection |
| [06-pattern-detector.md](./06-pattern-detector.md) | Thrust 5: Pattern detection |
| [07-enforcement.md](./07-enforcement.md) | Thrust 6: Enforcement engine |
| [08-audit-layer.md](./08-audit-layer.md) | Thrust 7: Audit logging |
| [09-integration.md](./09-integration.md) | Thrust 8: L0 integration |
| [10-testing.md](./10-testing.md) | Thrust 9: CLI and testing |
| [11-appendices.md](./11-appendices.md) | Checklists, patterns, references |
| [12-execution-plan.md](./12-execution-plan.md) | Dogfooding execution strategy |

---

## Dependencies

- Existing L0 verification system (to be refactored)
- `fast-glob` for file pattern matching (already in use)
- `zod` for schema validation (already in use)
- `js-yaml` for YAML config parsing (already in use)
- Node.js `crypto` for hashing

---

## Key Constraints

### Backwards Compatibility

Existing work orders must continue to work:
- Default security policy applied if none specified
- No new required configuration fields
- Existing forbidden patterns migrated to default policy

### Performance

Security scanning must be efficient:
- Skip binary files (images, fonts, etc.)
- Limit file size for content scanning (1MB default)
- Parallel detector execution where possible
- Cache compiled regex patterns

### Security

The security system itself must be secure:
- Audit logs don't contain actual secrets (masked)
- Configuration files validated before use
- No eval() or dynamic code execution

---

## Sources

- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [TruffleHog Patterns](https://github.com/trufflesecurity/trufflehog) - Secret detection patterns
- [GitLeaks](https://github.com/gitleaks/gitleaks) - Git secret scanner patterns
- [v0.2.17 DevGuide](../DevGuide_v0.2.17/00-index.md) - API extension (prerequisite)
