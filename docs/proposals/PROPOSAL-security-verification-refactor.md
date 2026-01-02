# Proposal: Security Verification System Refactor

**Version:** 1.0
**Status:** Draft
**Author:** Claude
**Date:** 2026-01-02

---

## Executive Summary

This proposal outlines a comprehensive refactor of AgentGate's security verification system. The current "forbidden files" mechanism is replaced with a multi-layered, extensible **Security Policy Engine** that provides:

- Content-based secret detection (not just filename matching)
- Tiered sensitivity levels with configurable enforcement
- Plugin architecture for custom detectors
- Developer-friendly configuration and overrides
- Comprehensive audit logging
- Runtime enforcement with sandboxing integration

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Design Goals](#2-design-goals)
3. [Proposed Architecture](#3-proposed-architecture)
4. [Component Deep Dives](#4-component-deep-dives)
5. [Configuration Schema](#5-configuration-schema)
6. [Migration Strategy](#6-migration-strategy)
7. [Implementation Phases](#7-implementation-phases)
8. [Testing Strategy](#8-testing-strategy)
9. [Appendices](#9-appendices)

---

## 1. Current State Analysis

### 1.1 Current Implementation

```
┌─────────────────────────────────────────────────────────────┐
│                    Current Architecture                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Gate Plan    │───▶│ L0 Verifier  │───▶│ Fast-glob    │  │
│  │ (hardcoded)  │    │ (contracts)  │    │ (pattern)    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                                       │           │
│         │            ┌──────────────┐           │           │
│         └───────────▶│ Path Policy  │◀──────────┘           │
│                      │ (runtime)    │                       │
│                      └──────────────┘                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Current Limitations

| Limitation | Impact | Severity |
|------------|--------|----------|
| Filename-based detection only | Misses hardcoded secrets, false positives on safe files | High |
| Hardcoded patterns | Difficult to customize per-project | Medium |
| No content scanning | Can't detect secrets in arbitrary files | High |
| Binary allow/deny | No nuanced handling (warn vs block) | Medium |
| .gitignore parsing fragile | Breaks on complex patterns | Medium |
| No audit trail | Can't investigate security decisions | High |
| Scattered configuration | Patterns defined in 3+ places | Medium |

### 1.3 Files to Refactor

```
packages/server/src/
├── verifier/
│   ├── l0-contracts.ts          # Main forbidden patterns logic
│   └── types.ts                  # Verification types
├── control-plane/
│   ├── work-order-service.ts     # Default patterns
│   └── commands/submit.ts        # CLI patterns
├── workspace/
│   └── path-policy.ts            # Runtime enforcement
└── gate/
    └── gate-plan.ts              # Gate plan types
```

---

## 2. Design Goals

### 2.1 Primary Goals

1. **Content-Aware Detection**: Scan file contents for actual secrets, not just filenames
2. **Extensibility**: Plugin architecture for custom detectors
3. **Developer Experience**: Clear errors, easy overrides, good defaults
4. **Defense in Depth**: Multiple enforcement layers
5. **Auditability**: Full logging of all security decisions
6. **Performance**: Efficient scanning even for large workspaces

### 2.2 Industry Standards Alignment

| Standard | How We Address It |
|----------|-------------------|
| OWASP Secret Management | Content-based detection, no hardcoded secrets |
| SOC2 Compliance | Audit logging, policy enforcement |
| Zero Trust | Verify at every layer, explicit allowlists |
| Shift Left Security | Early detection in verification pipeline |

### 2.3 Non-Goals

- Full SAST/DAST capabilities (use dedicated tools)
- Encryption/secrets management (use Vault, AWS Secrets Manager)
- Network security (handled by sandbox)

---

## 3. Proposed Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Security Policy Engine                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Policy Layer                                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ Project      │  │ Profile      │  │ Default      │              │   │
│  │  │ Policy       │  │ Policy       │  │ Policy       │              │   │
│  │  │ (.agentgate/ │  │ (~/.agent-   │  │ (built-in)   │              │   │
│  │  │  security.   │  │  gate/       │  │              │              │   │
│  │  │  yaml)       │  │  security/)  │  │              │              │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │   │
│  │         │                 │                 │                       │   │
│  │         └────────────────▶│◀────────────────┘                       │   │
│  │                    ┌──────┴───────┐                                 │   │
│  │                    │ Policy       │                                 │   │
│  │                    │ Resolver     │                                 │   │
│  │                    │ (merge/      │                                 │   │
│  │                    │  inherit)    │                                 │   │
│  │                    └──────┬───────┘                                 │   │
│  └───────────────────────────┼─────────────────────────────────────────┘   │
│                              │                                              │
│  ┌───────────────────────────┼─────────────────────────────────────────┐   │
│  │                    Detection Layer                                   │   │
│  │                           │                                          │   │
│  │    ┌──────────────────────┼──────────────────────────┐              │   │
│  │    │              Detection Engine                    │              │   │
│  │    │                      │                           │              │   │
│  │    │  ┌───────────────────┼───────────────────────┐  │              │   │
│  │    │  │           Detector Registry               │  │              │   │
│  │    │  │                   │                       │  │              │   │
│  │    │  │  ┌────────┐ ┌────────┐ ┌────────┐        │  │              │   │
│  │    │  │  │Pattern │ │Content │ │Entropy │        │  │              │   │
│  │    │  │  │Detector│ │Detector│ │Detector│ ...    │  │              │   │
│  │    │  │  └────────┘ └────────┘ └────────┘        │  │              │   │
│  │    │  │                                           │  │              │   │
│  │    │  └───────────────────────────────────────────┘  │              │   │
│  │    │                      │                           │              │   │
│  │    │              ┌───────┴───────┐                  │              │   │
│  │    │              │   Finding     │                  │              │   │
│  │    │              │   Aggregator  │                  │              │   │
│  │    │              └───────────────┘                  │              │   │
│  │    └──────────────────────────────────────────────────┘              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│  ┌───────────────────────────┼──────────────────────────────────────────┐  │
│  │                    Enforcement Layer                                  │  │
│  │                           │                                           │  │
│  │   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐           │  │
│  │   │ Pre-Execution │  │ Runtime       │  │ Post-Execution│           │  │
│  │   │ Gate          │  │ Monitor       │  │ Audit         │           │  │
│  │   │ (L0 verify)   │  │ (file access) │  │ (report)      │           │  │
│  │   └───────────────┘  └───────────────┘  └───────────────┘           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│  ┌───────────────────────────┼──────────────────────────────────────────┐  │
│  │                     Audit Layer                                       │  │
│  │                           │                                           │  │
│  │              ┌────────────┴────────────┐                             │  │
│  │              │     Audit Logger        │                             │  │
│  │              │ (structured events)     │                             │  │
│  │              └─────────────────────────┘                             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Core Components

| Component | Responsibility |
|-----------|----------------|
| **Policy Layer** | Configuration loading, merging, validation |
| **Detection Layer** | Scan files using pluggable detectors |
| **Enforcement Layer** | Apply policies at different execution stages |
| **Audit Layer** | Log all decisions for compliance/debugging |

---

## 4. Component Deep Dives

### 4.1 Policy Layer

#### 4.1.1 Policy Schema

```typescript
// packages/server/src/security/types.ts

/**
 * Sensitivity levels for detected findings
 */
export enum SensitivityLevel {
  /** Informational only - logged but not blocked */
  INFO = 'info',
  /** Warning - logged, blocks in strict mode */
  WARNING = 'warning',
  /** Sensitive - requires explicit allowlist to proceed */
  SENSITIVE = 'sensitive',
  /** Restricted - always blocked, no override */
  RESTRICTED = 'restricted',
}

/**
 * Actions to take when a finding is detected
 */
export enum EnforcementAction {
  /** Log only, don't block */
  LOG = 'log',
  /** Warn user, continue execution */
  WARN = 'warn',
  /** Block execution, require explicit override */
  BLOCK = 'block',
  /** Always block, no override possible */
  DENY = 'deny',
}

/**
 * A security policy definition
 */
export interface SecurityPolicy {
  /** Policy version for compatibility */
  version: '1.0';

  /** Human-readable policy name */
  name: string;

  /** Optional parent policy to inherit from */
  extends?: string;

  /** Detector configurations */
  detectors: DetectorConfig[];

  /** Sensitivity level to enforcement action mapping */
  enforcement: Record<SensitivityLevel, EnforcementAction>;

  /** Explicit allowlist for specific files/patterns */
  allowlist: AllowlistEntry[];

  /** Files/directories to exclude from scanning */
  excludes: string[];

  /** Runtime enforcement settings */
  runtime: RuntimeConfig;

  /** Audit settings */
  audit: AuditConfig;
}

/**
 * Configuration for a detector
 */
export interface DetectorConfig {
  /** Detector type identifier */
  type: string;

  /** Whether this detector is enabled */
  enabled: boolean;

  /** Sensitivity level for findings from this detector */
  sensitivity: SensitivityLevel;

  /** Detector-specific options */
  options?: Record<string, unknown>;
}

/**
 * Allowlist entry
 */
export interface AllowlistEntry {
  /** Pattern or path to allow */
  pattern: string;

  /** Reason for allowlisting (required for audit) */
  reason: string;

  /** Who approved this allowlist entry */
  approvedBy?: string;

  /** Expiration date (optional) */
  expiresAt?: string;

  /** Which detectors this allowlist applies to (empty = all) */
  detectors?: string[];
}

/**
 * Runtime enforcement configuration
 */
export interface RuntimeConfig {
  /** Enable runtime file access monitoring */
  enabled: boolean;

  /** Block access to sensitive files during execution */
  blockAccess: boolean;

  /** Log all file access attempts */
  logAccess: boolean;
}

/**
 * Audit configuration
 */
export interface AuditConfig {
  /** Enable audit logging */
  enabled: boolean;

  /** Where to write audit logs */
  destination: 'file' | 'stdout' | 'syslog' | 'custom';

  /** Log file path (if destination is 'file') */
  path?: string;

  /** Include file contents in audit (careful with secrets!) */
  includeContent: boolean;

  /** Retention period for audit logs */
  retentionDays: number;
}
```

#### 4.1.2 Policy Resolution

```typescript
// packages/server/src/security/policy-resolver.ts

import { SecurityPolicy, SensitivityLevel, EnforcementAction } from './types.js';
import { loadYamlFile, existsSync } from '../utils/fs.js';
import { deepMerge } from '../utils/objects.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('security:policy-resolver');

/**
 * Default security policy (always applied as base)
 */
export const DEFAULT_POLICY: SecurityPolicy = {
  version: '1.0',
  name: 'default',
  detectors: [
    {
      type: 'pattern',
      enabled: true,
      sensitivity: SensitivityLevel.SENSITIVE,
      options: {
        patterns: [
          '**/credentials.json',
          '**/service-account*.json',
        ],
      },
    },
    {
      type: 'content',
      enabled: true,
      sensitivity: SensitivityLevel.RESTRICTED,
      options: {
        rules: [
          { id: 'aws-access-key', pattern: 'AKIA[0-9A-Z]{16}' },
          { id: 'aws-secret-key', pattern: '[0-9a-zA-Z/+]{40}' },
          { id: 'github-token', pattern: 'gh[pousr]_[A-Za-z0-9_]{36,}' },
          { id: 'private-key', pattern: '-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----' },
          { id: 'stripe-key', pattern: 'sk_live_[0-9a-zA-Z]{24,}' },
          { id: 'slack-token', pattern: 'xox[baprs]-[0-9a-zA-Z-]{10,}' },
        ],
      },
    },
    {
      type: 'entropy',
      enabled: true,
      sensitivity: SensitivityLevel.WARNING,
      options: {
        threshold: 4.5,
        minLength: 20,
        maxLength: 200,
      },
    },
    {
      type: 'gitignore',
      enabled: true,
      sensitivity: SensitivityLevel.INFO,
      options: {
        // Files in .gitignore are informational - not blocked
        treatAs: 'info',
      },
    },
  ],
  enforcement: {
    [SensitivityLevel.INFO]: EnforcementAction.LOG,
    [SensitivityLevel.WARNING]: EnforcementAction.WARN,
    [SensitivityLevel.SENSITIVE]: EnforcementAction.BLOCK,
    [SensitivityLevel.RESTRICTED]: EnforcementAction.DENY,
  },
  allowlist: [],
  excludes: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
    '**/vendor/**',
    '**/__pycache__/**',
    '**/venv/**',
    '**/.venv/**',
  ],
  runtime: {
    enabled: true,
    blockAccess: true,
    logAccess: true,
  },
  audit: {
    enabled: true,
    destination: 'file',
    includeContent: false,
    retentionDays: 90,
  },
};

/**
 * Load and resolve security policy for a workspace
 */
export async function resolveSecurityPolicy(
  workspaceDir: string,
  profileName?: string
): Promise<SecurityPolicy> {
  const policies: SecurityPolicy[] = [DEFAULT_POLICY];

  // Load user profile if specified
  if (profileName) {
    const profilePolicy = await loadProfilePolicy(profileName);
    if (profilePolicy) {
      policies.push(profilePolicy);
    }
  }

  // Load project-level policy
  const projectPolicy = await loadProjectPolicy(workspaceDir);
  if (projectPolicy) {
    policies.push(projectPolicy);
  }

  // Merge all policies (later policies override earlier)
  const resolved = policies.reduce((acc, policy) => mergePolicies(acc, policy), {} as SecurityPolicy);

  logger.debug({
    policiesLoaded: policies.length,
    name: resolved.name,
  }, 'Security policy resolved');

  return resolved;
}

/**
 * Load a named profile from ~/.agentgate/security/
 */
async function loadProfilePolicy(name: string): Promise<SecurityPolicy | null> {
  const profilePath = join(homedir(), '.agentgate', 'security', `${name}.yaml`);

  if (!existsSync(profilePath)) {
    logger.warn({ name, profilePath }, 'Security profile not found');
    return null;
  }

  try {
    return await loadYamlFile<SecurityPolicy>(profilePath);
  } catch (error) {
    logger.error({ error, profilePath }, 'Failed to load security profile');
    return null;
  }
}

/**
 * Load project-level policy from .agentgate/security.yaml
 */
async function loadProjectPolicy(workspaceDir: string): Promise<SecurityPolicy | null> {
  const projectPath = join(workspaceDir, '.agentgate', 'security.yaml');

  if (!existsSync(projectPath)) {
    return null;
  }

  try {
    return await loadYamlFile<SecurityPolicy>(projectPath);
  } catch (error) {
    logger.error({ error, projectPath }, 'Failed to load project security policy');
    return null;
  }
}

/**
 * Merge two policies, with 'override' taking precedence
 */
function mergePolicies(base: SecurityPolicy, override: SecurityPolicy): SecurityPolicy {
  return {
    version: override.version || base.version,
    name: override.name || base.name,
    detectors: mergeDetectors(base.detectors || [], override.detectors || []),
    enforcement: { ...base.enforcement, ...override.enforcement },
    allowlist: [...(base.allowlist || []), ...(override.allowlist || [])],
    excludes: [...new Set([...(base.excludes || []), ...(override.excludes || [])])],
    runtime: { ...base.runtime, ...override.runtime },
    audit: { ...base.audit, ...override.audit },
  };
}

/**
 * Merge detector configurations
 */
function mergeDetectors(base: DetectorConfig[], override: DetectorConfig[]): DetectorConfig[] {
  const merged = new Map<string, DetectorConfig>();

  // Add base detectors
  for (const detector of base) {
    merged.set(detector.type, detector);
  }

  // Override with new detectors
  for (const detector of override) {
    const existing = merged.get(detector.type);
    if (existing) {
      merged.set(detector.type, {
        ...existing,
        ...detector,
        options: { ...existing.options, ...detector.options },
      });
    } else {
      merged.set(detector.type, detector);
    }
  }

  return Array.from(merged.values());
}
```

### 4.2 Detection Layer

#### 4.2.1 Detector Interface

```typescript
// packages/server/src/security/detectors/types.ts

import { SensitivityLevel } from '../types.js';

/**
 * A finding from a detector
 */
export interface Finding {
  /** Unique identifier for this finding type */
  ruleId: string;

  /** Human-readable description */
  message: string;

  /** File where the finding was detected */
  file: string;

  /** Line number (if applicable) */
  line?: number;

  /** Column number (if applicable) */
  column?: number;

  /** The actual secret/sensitive value (masked) */
  match?: string;

  /** Sensitivity level of this finding */
  sensitivity: SensitivityLevel;

  /** Detector that produced this finding */
  detector: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Context provided to detectors
 */
export interface DetectorContext {
  /** Workspace directory */
  workspaceDir: string;

  /** Files to scan (pre-filtered by excludes) */
  files: string[];

  /** Security policy in effect */
  policy: SecurityPolicy;

  /** Allowlisted patterns */
  allowlist: Set<string>;

  /** Signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Interface all detectors must implement
 */
export interface Detector {
  /** Unique identifier for this detector */
  readonly type: string;

  /** Human-readable name */
  readonly name: string;

  /** Description of what this detector finds */
  readonly description: string;

  /**
   * Run detection on the provided context
   */
  detect(ctx: DetectorContext, options: Record<string, unknown>): Promise<Finding[]>;

  /**
   * Validate detector options
   */
  validateOptions(options: Record<string, unknown>): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

#### 4.2.2 Content Detector (Secret Scanning)

```typescript
// packages/server/src/security/detectors/content-detector.ts

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Detector, DetectorContext, Finding, ValidationResult } from './types.js';
import { SensitivityLevel } from '../types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('security:content-detector');

/**
 * Rule for content-based secret detection
 */
interface ContentRule {
  id: string;
  pattern: string;
  description?: string;
  sensitivity?: SensitivityLevel;
}

interface ContentDetectorOptions {
  rules: ContentRule[];
  maxFileSizeBytes?: number;
  binaryExtensions?: string[];
}

const DEFAULT_OPTIONS: Partial<ContentDetectorOptions> = {
  maxFileSizeBytes: 1024 * 1024, // 1MB
  binaryExtensions: [
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
    '.woff', '.woff2', '.ttf', '.eot',
    '.zip', '.tar', '.gz', '.bz2',
    '.exe', '.dll', '.so', '.dylib',
    '.pdf', '.doc', '.docx',
  ],
};

/**
 * Detector that scans file contents for secrets using regex patterns
 */
export class ContentDetector implements Detector {
  readonly type = 'content';
  readonly name = 'Content-Based Secret Detector';
  readonly description = 'Scans file contents for hardcoded secrets, API keys, and credentials';

  async detect(ctx: DetectorContext, options: Record<string, unknown>): Promise<Finding[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options } as ContentDetectorOptions;
    const findings: Finding[] = [];

    // Compile regex patterns once
    const compiledRules = opts.rules.map(rule => ({
      ...rule,
      regex: new RegExp(rule.pattern, 'g'),
    }));

    for (const file of ctx.files) {
      // Skip binary files
      if (this.isBinaryFile(file, opts.binaryExtensions!)) {
        continue;
      }

      try {
        const filePath = join(ctx.workspaceDir, file);
        const content = await this.readFileContent(filePath, opts.maxFileSizeBytes!);

        if (!content) continue;

        // Check each rule
        for (const rule of compiledRules) {
          const matches = content.matchAll(rule.regex);

          for (const match of matches) {
            // Find line number
            const beforeMatch = content.substring(0, match.index);
            const line = beforeMatch.split('\n').length;

            findings.push({
              ruleId: rule.id,
              message: rule.description || `Detected ${rule.id}`,
              file,
              line,
              match: this.maskSecret(match[0]),
              sensitivity: rule.sensitivity || SensitivityLevel.RESTRICTED,
              detector: this.type,
              metadata: {
                patternId: rule.id,
                matchLength: match[0].length,
              },
            });
          }
        }
      } catch (error) {
        logger.warn({ error, file }, 'Failed to scan file');
      }
    }

    return findings;
  }

  validateOptions(options: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];

    if (!options.rules || !Array.isArray(options.rules)) {
      errors.push('rules must be an array');
    } else {
      for (const rule of options.rules as ContentRule[]) {
        if (!rule.id) errors.push('Each rule must have an id');
        if (!rule.pattern) errors.push('Each rule must have a pattern');
        try {
          new RegExp(rule.pattern);
        } catch {
          errors.push(`Invalid regex pattern: ${rule.pattern}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private isBinaryFile(file: string, binaryExtensions: string[]): boolean {
    const ext = file.substring(file.lastIndexOf('.')).toLowerCase();
    return binaryExtensions.includes(ext);
  }

  private async readFileContent(path: string, maxSize: number): Promise<string | null> {
    try {
      const content = await readFile(path, 'utf-8');
      if (content.length > maxSize) {
        logger.debug({ path, size: content.length, maxSize }, 'File too large, skipping');
        return null;
      }
      return content;
    } catch {
      return null;
    }
  }

  private maskSecret(secret: string): string {
    if (secret.length <= 8) {
      return '*'.repeat(secret.length);
    }
    return secret.substring(0, 4) + '*'.repeat(secret.length - 8) + secret.substring(secret.length - 4);
  }
}
```

#### 4.2.3 Entropy Detector (High-Entropy Strings)

```typescript
// packages/server/src/security/detectors/entropy-detector.ts

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Detector, DetectorContext, Finding } from './types.js';
import { SensitivityLevel } from '../types.js';

interface EntropyDetectorOptions {
  threshold: number;      // Shannon entropy threshold (default: 4.5)
  minLength: number;      // Minimum string length to check
  maxLength: number;      // Maximum string length to check
  charset?: 'base64' | 'hex' | 'alphanumeric';
}

/**
 * Detector that finds high-entropy strings (likely secrets)
 */
export class EntropyDetector implements Detector {
  readonly type = 'entropy';
  readonly name = 'High-Entropy String Detector';
  readonly description = 'Detects high-entropy strings that may be secrets';

  async detect(ctx: DetectorContext, options: Record<string, unknown>): Promise<Finding[]> {
    const opts = options as EntropyDetectorOptions;
    const findings: Finding[] = [];

    // Pattern to find potential secrets
    const pattern = /[A-Za-z0-9+/=_-]{20,}/g;

    for (const file of ctx.files) {
      try {
        const filePath = join(ctx.workspaceDir, file);
        const content = await readFile(filePath, 'utf-8');

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const matches = lines[i].matchAll(pattern);

          for (const match of matches) {
            const str = match[0];
            if (str.length < opts.minLength || str.length > opts.maxLength) {
              continue;
            }

            const entropy = this.calculateEntropy(str);
            if (entropy >= opts.threshold) {
              findings.push({
                ruleId: 'high-entropy',
                message: `High-entropy string detected (entropy: ${entropy.toFixed(2)})`,
                file,
                line: i + 1,
                match: this.maskString(str),
                sensitivity: SensitivityLevel.WARNING,
                detector: this.type,
                metadata: { entropy },
              });
            }
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return findings;
  }

  validateOptions(options: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const opts = options as EntropyDetectorOptions;

    if (typeof opts.threshold !== 'number' || opts.threshold < 0 || opts.threshold > 8) {
      errors.push('threshold must be a number between 0 and 8');
    }
    if (typeof opts.minLength !== 'number' || opts.minLength < 1) {
      errors.push('minLength must be a positive number');
    }
    if (typeof opts.maxLength !== 'number' || opts.maxLength < opts.minLength) {
      errors.push('maxLength must be >= minLength');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Calculate Shannon entropy of a string
   */
  private calculateEntropy(str: string): number {
    const freq = new Map<string, number>();
    for (const char of str) {
      freq.set(char, (freq.get(char) || 0) + 1);
    }

    let entropy = 0;
    for (const count of freq.values()) {
      const p = count / str.length;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  private maskString(str: string): string {
    if (str.length <= 8) return '*'.repeat(str.length);
    return str.substring(0, 4) + '...' + str.substring(str.length - 4);
  }
}
```

#### 4.2.4 Detector Registry

```typescript
// packages/server/src/security/detectors/registry.ts

import { Detector } from './types.js';
import { ContentDetector } from './content-detector.js';
import { EntropyDetector } from './entropy-detector.js';
import { PatternDetector } from './pattern-detector.js';
import { GitignoreDetector } from './gitignore-detector.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('security:detector-registry');

/**
 * Registry of available detectors
 */
export class DetectorRegistry {
  private detectors = new Map<string, Detector>();

  constructor() {
    // Register built-in detectors
    this.register(new ContentDetector());
    this.register(new EntropyDetector());
    this.register(new PatternDetector());
    this.register(new GitignoreDetector());
  }

  /**
   * Register a new detector
   */
  register(detector: Detector): void {
    if (this.detectors.has(detector.type)) {
      logger.warn({ type: detector.type }, 'Overwriting existing detector');
    }
    this.detectors.set(detector.type, detector);
    logger.debug({ type: detector.type, name: detector.name }, 'Detector registered');
  }

  /**
   * Get a detector by type
   */
  get(type: string): Detector | undefined {
    return this.detectors.get(type);
  }

  /**
   * Get all registered detectors
   */
  all(): Detector[] {
    return Array.from(this.detectors.values());
  }

  /**
   * Check if a detector type exists
   */
  has(type: string): boolean {
    return this.detectors.has(type);
  }
}

// Singleton registry
export const detectorRegistry = new DetectorRegistry();
```

### 4.3 Enforcement Layer

```typescript
// packages/server/src/security/enforcement/engine.ts

import { Finding, DetectorContext } from '../detectors/types.js';
import { SecurityPolicy, SensitivityLevel, EnforcementAction } from '../types.js';
import { detectorRegistry } from '../detectors/registry.js';
import { auditLogger } from '../audit/logger.js';
import { createLogger } from '../../utils/logger.js';
import fg from 'fast-glob';

const logger = createLogger('security:enforcement');

/**
 * Result of security enforcement
 */
export interface EnforcementResult {
  /** Whether execution should proceed */
  allowed: boolean;

  /** All findings from detection */
  findings: Finding[];

  /** Findings that caused blocking */
  blockedFindings: Finding[];

  /** Findings that were warnings */
  warnedFindings: Finding[];

  /** Summary statistics */
  summary: {
    total: number;
    byLevel: Record<SensitivityLevel, number>;
    byDetector: Record<string, number>;
  };
}

/**
 * Security Enforcement Engine
 */
export class SecurityEnforcementEngine {
  /**
   * Run security checks on a workspace
   */
  async enforce(
    workspaceDir: string,
    policy: SecurityPolicy
  ): Promise<EnforcementResult> {
    const startTime = Date.now();

    // Get files to scan
    const files = await this.getFilesToScan(workspaceDir, policy);
    logger.info({ fileCount: files.length }, 'Starting security scan');

    // Build allowlist set for quick lookup
    const allowlist = new Set(policy.allowlist.map(a => a.pattern));

    // Run all enabled detectors
    const allFindings: Finding[] = [];

    for (const detectorConfig of policy.detectors) {
      if (!detectorConfig.enabled) continue;

      const detector = detectorRegistry.get(detectorConfig.type);
      if (!detector) {
        logger.warn({ type: detectorConfig.type }, 'Unknown detector type');
        continue;
      }

      // Validate options
      const validation = detector.validateOptions(detectorConfig.options || {});
      if (!validation.valid) {
        logger.error({
          detector: detectorConfig.type,
          errors: validation.errors
        }, 'Invalid detector options');
        continue;
      }

      // Run detection
      const ctx: DetectorContext = {
        workspaceDir,
        files,
        policy,
        allowlist,
      };

      try {
        const findings = await detector.detect(ctx, detectorConfig.options || {});

        // Apply sensitivity from config if not set by detector
        for (const finding of findings) {
          if (!finding.sensitivity) {
            finding.sensitivity = detectorConfig.sensitivity;
          }
        }

        allFindings.push(...findings);
      } catch (error) {
        logger.error({ error, detector: detectorConfig.type }, 'Detector failed');
      }
    }

    // Filter out allowlisted findings
    const filteredFindings = this.filterAllowlisted(allFindings, policy.allowlist);

    // Categorize by enforcement action
    const blockedFindings: Finding[] = [];
    const warnedFindings: Finding[] = [];

    for (const finding of filteredFindings) {
      const action = policy.enforcement[finding.sensitivity];

      if (action === EnforcementAction.BLOCK || action === EnforcementAction.DENY) {
        blockedFindings.push(finding);
      } else if (action === EnforcementAction.WARN) {
        warnedFindings.push(finding);
      }
    }

    // Build result
    const result: EnforcementResult = {
      allowed: blockedFindings.length === 0,
      findings: filteredFindings,
      blockedFindings,
      warnedFindings,
      summary: this.buildSummary(filteredFindings),
    };

    // Audit log
    await auditLogger.logEnforcement({
      workspaceDir,
      policy: policy.name,
      result,
      duration: Date.now() - startTime,
    });

    logger.info({
      allowed: result.allowed,
      total: result.summary.total,
      blocked: blockedFindings.length,
      warned: warnedFindings.length,
      duration: Date.now() - startTime,
    }, 'Security enforcement complete');

    return result;
  }

  /**
   * Get list of files to scan, excluding configured patterns
   */
  private async getFilesToScan(workspaceDir: string, policy: SecurityPolicy): Promise<string[]> {
    return fg('**/*', {
      cwd: workspaceDir,
      dot: true,
      onlyFiles: true,
      ignore: policy.excludes,
    });
  }

  /**
   * Filter out findings that match allowlist entries
   */
  private filterAllowlisted(findings: Finding[], allowlist: AllowlistEntry[]): Finding[] {
    return findings.filter(finding => {
      for (const entry of allowlist) {
        // Check if pattern matches
        if (this.matchesPattern(finding.file, entry.pattern)) {
          // Check if allowlist applies to this detector
          if (!entry.detectors || entry.detectors.length === 0 ||
              entry.detectors.includes(finding.detector)) {
            // Check expiration
            if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
              continue; // Expired, don't filter
            }
            return false; // Filter out this finding
          }
        }
      }
      return true; // Keep this finding
    });
  }

  private matchesPattern(file: string, pattern: string): boolean {
    // Simple glob matching - could use minimatch for full glob support
    const regex = new RegExp(
      '^' + pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
      + '$'
    );
    return regex.test(file);
  }

  private buildSummary(findings: Finding[]): EnforcementResult['summary'] {
    const byLevel: Record<SensitivityLevel, number> = {
      [SensitivityLevel.INFO]: 0,
      [SensitivityLevel.WARNING]: 0,
      [SensitivityLevel.SENSITIVE]: 0,
      [SensitivityLevel.RESTRICTED]: 0,
    };
    const byDetector: Record<string, number> = {};

    for (const finding of findings) {
      byLevel[finding.sensitivity]++;
      byDetector[finding.detector] = (byDetector[finding.detector] || 0) + 1;
    }

    return { total: findings.length, byLevel, byDetector };
  }
}

export const securityEngine = new SecurityEnforcementEngine();
```

### 4.4 Audit Layer

```typescript
// packages/server/src/security/audit/logger.ts

import { appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { EnforcementResult } from '../enforcement/engine.js';
import { Finding } from '../detectors/types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('security:audit');

/**
 * Audit event types
 */
export enum AuditEventType {
  ENFORCEMENT = 'enforcement',
  ALLOWLIST_USED = 'allowlist_used',
  OVERRIDE = 'override',
  POLICY_LOADED = 'policy_loaded',
  RUNTIME_ACCESS = 'runtime_access',
}

/**
 * Base audit event
 */
interface BaseAuditEvent {
  timestamp: string;
  type: AuditEventType;
  workspaceDir: string;
  runId?: string;
  workOrderId?: string;
}

/**
 * Enforcement audit event
 */
interface EnforcementAuditEvent extends BaseAuditEvent {
  type: AuditEventType.ENFORCEMENT;
  policy: string;
  allowed: boolean;
  findingCount: number;
  blockedCount: number;
  duration: number;
  findings?: Finding[];  // Only if includeContent is true
}

/**
 * Runtime access audit event
 */
interface RuntimeAccessAuditEvent extends BaseAuditEvent {
  type: AuditEventType.RUNTIME_ACCESS;
  operation: 'read' | 'write' | 'delete';
  path: string;
  allowed: boolean;
  reason?: string;
}

type AuditEvent = EnforcementAuditEvent | RuntimeAccessAuditEvent;

/**
 * Security Audit Logger
 */
export class SecurityAuditLogger {
  private logPath: string;
  private includeContent: boolean;

  constructor(options?: { logPath?: string; includeContent?: boolean }) {
    this.logPath = options?.logPath || join(homedir(), '.agentgate', 'audit', 'security.jsonl');
    this.includeContent = options?.includeContent ?? false;
  }

  /**
   * Log an enforcement result
   */
  async logEnforcement(data: {
    workspaceDir: string;
    policy: string;
    result: EnforcementResult;
    duration: number;
    runId?: string;
    workOrderId?: string;
  }): Promise<void> {
    const event: EnforcementAuditEvent = {
      timestamp: new Date().toISOString(),
      type: AuditEventType.ENFORCEMENT,
      workspaceDir: data.workspaceDir,
      policy: data.policy,
      allowed: data.result.allowed,
      findingCount: data.result.summary.total,
      blockedCount: data.result.blockedFindings.length,
      duration: data.duration,
      runId: data.runId,
      workOrderId: data.workOrderId,
    };

    if (this.includeContent) {
      event.findings = data.result.findings;
    }

    await this.writeEvent(event);
  }

  /**
   * Log a runtime file access
   */
  async logRuntimeAccess(data: {
    workspaceDir: string;
    operation: 'read' | 'write' | 'delete';
    path: string;
    allowed: boolean;
    reason?: string;
    runId?: string;
  }): Promise<void> {
    const event: RuntimeAccessAuditEvent = {
      timestamp: new Date().toISOString(),
      type: AuditEventType.RUNTIME_ACCESS,
      workspaceDir: data.workspaceDir,
      operation: data.operation,
      path: data.path,
      allowed: data.allowed,
      reason: data.reason,
      runId: data.runId,
    };

    await this.writeEvent(event);
  }

  private async writeEvent(event: AuditEvent): Promise<void> {
    try {
      await mkdir(dirname(this.logPath), { recursive: true });
      await appendFile(this.logPath, JSON.stringify(event) + '\n');
    } catch (error) {
      logger.error({ error }, 'Failed to write audit event');
    }
  }
}

export const auditLogger = new SecurityAuditLogger();
```

---

## 5. Configuration Schema

### 5.1 Project-Level Configuration

```yaml
# .agentgate/security.yaml

version: "1.0"
name: "my-project-security"

# Inherit from a named profile
extends: "nodejs-strict"

# Configure detectors
detectors:
  - type: content
    enabled: true
    sensitivity: restricted
    options:
      rules:
        # Add project-specific patterns
        - id: internal-api-key
          pattern: "MYAPP_[A-Z0-9]{32}"
          description: "Internal API key"

  - type: entropy
    enabled: true
    sensitivity: warning
    options:
      threshold: 4.8  # Slightly higher for this project

# Enforcement rules
enforcement:
  info: log
  warning: warn
  sensitive: block
  restricted: deny

# Allowlist specific files
allowlist:
  - pattern: "docs/examples/*.env.example"
    reason: "Example files with placeholder values"
    approvedBy: "security-team"

  - pattern: "test/fixtures/mock-credentials.json"
    reason: "Test fixtures with fake data"
    approvedBy: "dev-team"
    expiresAt: "2026-12-31"
    detectors:
      - content
      - entropy

# Additional excludes
excludes:
  - "**/test-data/**"
  - "**/*.test.ts"

# Runtime settings
runtime:
  enabled: true
  blockAccess: true
  logAccess: true

# Audit settings
audit:
  enabled: true
  destination: file
  path: ".agentgate/audit/security.jsonl"
  includeContent: false
  retentionDays: 90
```

### 5.2 Profile Configuration

```yaml
# ~/.agentgate/security/nodejs-strict.yaml

version: "1.0"
name: "nodejs-strict"
extends: "default"

detectors:
  - type: content
    enabled: true
    sensitivity: restricted
    options:
      rules:
        # NPM tokens
        - id: npm-token
          pattern: "npm_[A-Za-z0-9]{36}"

        # Node.js specific
        - id: jwt-secret
          pattern: "JWT_SECRET=['\"]?[A-Za-z0-9+/=]{32,}['\"]?"

  - type: pattern
    enabled: true
    sensitivity: sensitive
    options:
      patterns:
        - "**/.npmrc"  # NPM config often has tokens
        - "**/yarn.lock"  # Exclude but don't block

enforcement:
  info: log
  warning: warn
  sensitive: block
  restricted: deny

excludes:
  - "**/node_modules/**"
  - "**/coverage/**"
  - "**/.nyc_output/**"
```

---

## 6. Migration Strategy

### 6.1 Phase 1: Parallel Implementation

1. Create new `packages/server/src/security/` directory
2. Implement new system alongside existing code
3. Both systems run during transition
4. Compare results in logs

### 6.2 Phase 2: Feature Flag Rollout

```typescript
// config/features.ts
export const FEATURES = {
  USE_NEW_SECURITY_ENGINE: process.env.AGENTGATE_NEW_SECURITY === 'true',
};

// In L0 verification
if (FEATURES.USE_NEW_SECURITY_ENGINE) {
  return await securityEngine.enforce(workDir, policy);
} else {
  return await legacyForbiddenPatternCheck(workDir, patterns);
}
```

### 6.3 Phase 3: Deprecation

1. Log deprecation warnings for old configuration
2. Provide migration tool for converting old configs
3. Remove legacy code after transition period

---

## 7. Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)

| Task | Effort | Priority |
|------|--------|----------|
| Define type system | 2 days | P0 |
| Implement policy resolver | 3 days | P0 |
| Create detector interface | 1 day | P0 |
| Implement detector registry | 1 day | P0 |
| Create pattern detector | 2 days | P0 |

### Phase 2: Content Detection (Week 2-3)

| Task | Effort | Priority |
|------|--------|----------|
| Implement content detector | 3 days | P0 |
| Implement entropy detector | 2 days | P1 |
| Add secret pattern library | 2 days | P0 |
| Create finding aggregator | 1 day | P0 |

### Phase 3: Enforcement (Week 3-4)

| Task | Effort | Priority |
|------|--------|----------|
| Implement enforcement engine | 3 days | P0 |
| Integrate with L0 verification | 2 days | P0 |
| Add runtime monitoring | 3 days | P1 |
| Create allowlist system | 2 days | P0 |

### Phase 4: Audit & UX (Week 4-5)

| Task | Effort | Priority |
|------|--------|----------|
| Implement audit logger | 2 days | P0 |
| Create CLI output formatting | 2 days | P1 |
| Add configuration validation | 2 days | P0 |
| Write migration tool | 2 days | P1 |

### Phase 5: Testing & Documentation (Week 5-6)

| Task | Effort | Priority |
|------|--------|----------|
| Unit tests (80%+ coverage) | 4 days | P0 |
| Integration tests | 3 days | P0 |
| Documentation | 2 days | P0 |
| Performance benchmarks | 1 day | P1 |

---

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
// test/security/content-detector.test.ts

describe('ContentDetector', () => {
  describe('detect', () => {
    it('should detect AWS access keys', async () => {
      const detector = new ContentDetector();
      const ctx = createMockContext({
        files: ['config.ts'],
        fileContents: {
          'config.ts': 'const key = "AKIAIOSFODNN7EXAMPLE";',
        },
      });

      const findings = await detector.detect(ctx, {
        rules: [{ id: 'aws-access-key', pattern: 'AKIA[0-9A-Z]{16}' }],
      });

      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('aws-access-key');
      expect(findings[0].line).toBe(1);
    });

    it('should not flag masked examples', async () => {
      const detector = new ContentDetector();
      const ctx = createMockContext({
        files: ['docs.md'],
        fileContents: {
          'docs.md': 'Use your key: AKIAXXXXXXXXXXXXXXXX',
        },
      });

      const findings = await detector.detect(ctx, {
        rules: [{ id: 'aws-access-key', pattern: 'AKIA[0-9A-Z]{16}' }],
      });

      expect(findings).toHaveLength(0);
    });

    it('should respect maxFileSizeBytes', async () => {
      const detector = new ContentDetector();
      const ctx = createMockContext({
        files: ['large.txt'],
        fileContents: {
          'large.txt': 'A'.repeat(10 * 1024 * 1024), // 10MB
        },
      });

      const findings = await detector.detect(ctx, {
        rules: [{ id: 'test', pattern: 'A+' }],
        maxFileSizeBytes: 1024 * 1024, // 1MB
      });

      expect(findings).toHaveLength(0); // Skipped
    });
  });
});
```

### 8.2 Integration Tests

```typescript
// test/security/enforcement.integration.test.ts

describe('SecurityEnforcementEngine', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempWorkspace({
      'src/config.ts': `
        export const config = {
          apiKey: 'sk_test_FAKE_KEY_FOR_TESTING',
        };
      `,
      '.env': 'DATABASE_URL=postgres://user:pass@localhost/db',
      '.gitignore': '.env\n',
      '.agentgate/security.yaml': `
        version: "1.0"
        name: test
        allowlist:
          - pattern: ".env"
            reason: "Development config"
      `,
    });
  });

  it('should block hardcoded Stripe keys', async () => {
    const policy = await resolveSecurityPolicy(tempDir);
    const result = await securityEngine.enforce(tempDir, policy);

    expect(result.allowed).toBe(false);
    expect(result.blockedFindings).toContainEqual(
      expect.objectContaining({
        ruleId: 'stripe-key',
        file: 'src/config.ts',
      })
    );
  });

  it('should allow .env when allowlisted', async () => {
    const policy = await resolveSecurityPolicy(tempDir);
    const result = await securityEngine.enforce(tempDir, policy);

    // .env should not appear in blocked findings
    expect(result.blockedFindings).not.toContainEqual(
      expect.objectContaining({ file: '.env' })
    );
  });
});
```

---

## 9. Appendices

### 9.1 Secret Pattern Library

```typescript
// packages/server/src/security/patterns/index.ts

export const BUILTIN_PATTERNS = [
  // AWS
  { id: 'aws-access-key', pattern: 'AKIA[0-9A-Z]{16}', description: 'AWS Access Key ID' },
  { id: 'aws-secret-key', pattern: '(?<![A-Za-z0-9/+])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])', description: 'AWS Secret Key' },

  // GitHub
  { id: 'github-pat', pattern: 'ghp_[A-Za-z0-9]{36}', description: 'GitHub Personal Access Token' },
  { id: 'github-oauth', pattern: 'gho_[A-Za-z0-9]{36}', description: 'GitHub OAuth Token' },
  { id: 'github-app', pattern: 'ghu_[A-Za-z0-9]{36}', description: 'GitHub User-to-Server Token' },
  { id: 'github-refresh', pattern: 'ghr_[A-Za-z0-9]{36}', description: 'GitHub Refresh Token' },

  // Stripe
  { id: 'stripe-publishable', pattern: 'pk_(?:live|test)_[A-Za-z0-9]{24,}', description: 'Stripe Publishable Key' },
  { id: 'stripe-secret', pattern: 'sk_(?:live|test)_[A-Za-z0-9]{24,}', description: 'Stripe Secret Key' },
  { id: 'stripe-restricted', pattern: 'rk_(?:live|test)_[A-Za-z0-9]{24,}', description: 'Stripe Restricted Key' },

  // Slack
  { id: 'slack-token', pattern: 'xox[baprs]-[0-9a-zA-Z-]{10,}', description: 'Slack Token' },
  { id: 'slack-webhook', pattern: 'https://hooks\\.slack\\.com/services/T[A-Z0-9]{8}/B[A-Z0-9]{8,}/[a-zA-Z0-9]{24}', description: 'Slack Webhook' },

  // Private Keys
  { id: 'rsa-private-key', pattern: '-----BEGIN RSA PRIVATE KEY-----', description: 'RSA Private Key' },
  { id: 'ec-private-key', pattern: '-----BEGIN EC PRIVATE KEY-----', description: 'EC Private Key' },
  { id: 'openssh-private-key', pattern: '-----BEGIN OPENSSH PRIVATE KEY-----', description: 'OpenSSH Private Key' },
  { id: 'pgp-private-key', pattern: '-----BEGIN PGP PRIVATE KEY BLOCK-----', description: 'PGP Private Key' },

  // Google
  { id: 'google-api-key', pattern: 'AIza[0-9A-Za-z\\-_]{35}', description: 'Google API Key' },
  { id: 'google-oauth', pattern: '[0-9]+-[0-9A-Za-z_]{32}\\.apps\\.googleusercontent\\.com', description: 'Google OAuth Client ID' },

  // Database
  { id: 'postgres-url', pattern: 'postgres(?:ql)?://[^:]+:[^@]+@[^/]+/\\w+', description: 'PostgreSQL Connection String' },
  { id: 'mongodb-url', pattern: 'mongodb(?:\\+srv)?://[^:]+:[^@]+@[^/]+', description: 'MongoDB Connection String' },
  { id: 'redis-url', pattern: 'redis://[^:]+:[^@]+@[^/]+', description: 'Redis Connection String' },

  // JWT
  { id: 'jwt', pattern: 'eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+', description: 'JSON Web Token' },

  // NPM
  { id: 'npm-token', pattern: 'npm_[A-Za-z0-9]{36}', description: 'NPM Access Token' },

  // Generic API Keys (high false positive rate - use with entropy)
  { id: 'generic-api-key', pattern: '(?:api[_-]?key|apikey|auth[_-]?token)\\s*[=:]\\s*["\']?[A-Za-z0-9_-]{20,}["\']?', description: 'Generic API Key Assignment' },
];
```

### 9.2 CLI Output Design

```
$ agentgate verify --security

🔒 Security Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Policy: my-project-security (extends: nodejs-strict)
Files scanned: 1,247
Duration: 1.2s

┌────────────────────────────────────────────────────────────────┐
│ 🚫 BLOCKED: 2 findings require attention                       │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  src/config/api.ts:12                                         │
│  ╭─────────────────────────────────────────────────────────╮  │
│  │ const stripeKey = 'sk_live_****...****';               │  │
│  ╰─────────────────────────────────────────────────────────╯  │
│  [stripe-secret] Stripe Secret Key detected                   │
│  Sensitivity: RESTRICTED                                      │
│                                                                │
│  src/services/payment.ts:45                                   │
│  ╭─────────────────────────────────────────────────────────╮  │
│  │ apiKey: process.env.STRIPE_KEY || 'sk_test_****...'    │  │
│  ╰─────────────────────────────────────────────────────────╯  │
│  [stripe-secret] Stripe Secret Key detected                   │
│  Sensitivity: RESTRICTED                                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ ⚠️  WARNINGS: 3 findings (execution continues)                 │
├────────────────────────────────────────────────────────────────┤
│ • test/fixtures/mock.ts:8 - high-entropy (4.7)                │
│ • scripts/setup.sh:22 - high-entropy (4.6)                    │
│ • docs/api.md:156 - generic-api-key                           │
└────────────────────────────────────────────────────────────────┘

Summary:
  ├── 🔴 Restricted: 2
  ├── 🟡 Warning: 3
  └── ℹ️  Info: 12

To allowlist a file:
  agentgate security allow src/config/api.ts --reason "Migrating to env vars"

To see all findings:
  agentgate verify --security --verbose
```

---

## Summary

This proposal outlines a comprehensive refactor that transforms the current "forbidden files" mechanism into a robust, extensible **Security Policy Engine**. Key improvements:

1. **Content-aware detection** using regex patterns for actual secrets
2. **Tiered sensitivity levels** with configurable enforcement
3. **Plugin architecture** for custom detectors
4. **Configuration-as-code** at project, profile, and default levels
5. **Comprehensive audit logging** for compliance
6. **Developer-friendly UX** with clear errors and easy overrides
7. **Defense in depth** with pre-execution and runtime enforcement

The 6-week implementation plan provides a structured approach with clear milestones and a migration path that minimizes disruption to existing users.
