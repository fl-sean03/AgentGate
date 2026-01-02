# 02: Core Types and Schemas

This document covers Thrust 1: defining the core type definitions and Zod schemas for the Security Policy Engine.

---

## Thrust 1: Core Types and Schemas

### 1.1 Objective

Define the complete Security Policy type system with Zod schemas for validation, supporting sensitivity levels, enforcement actions, detector configuration, allowlist entries, and audit types.

### 1.2 Background

The Security Policy Engine requires a robust type system that:
- Enforces valid configuration at runtime
- Provides type safety for all components
- Supports YAML serialization/deserialization
- Enables policy inheritance and merging

### 1.3 Subtasks

#### 1.3.1 Create Sensitivity Level Enum

Create `packages/server/src/security/types.ts` with the sensitivity level enum:

**SensitivityLevel:**
- `INFO` - Informational only, logged but not blocked
- `WARNING` - Warning level, logged, blocks in strict mode
- `SENSITIVE` - Requires explicit allowlist to proceed
- `RESTRICTED` - Always blocked, no override possible

Define as const object with type export for both runtime and compile-time use.

#### 1.3.2 Create Enforcement Action Enum

**EnforcementAction:**
- `LOG` - Log only, don't block
- `WARN` - Warn user, continue execution
- `BLOCK` - Block execution, require explicit override
- `DENY` - Always block, no override possible

#### 1.3.3 Define Detector Config Types

**DetectorConfig Interface:**
- `type: string` - Detector type identifier (content, entropy, pattern, gitignore)
- `enabled: boolean` - Whether detector is active
- `sensitivity: SensitivityLevel` - Default sensitivity for findings
- `options?: Record<string, unknown>` - Detector-specific options

#### 1.3.4 Define Allowlist Entry Types

**AllowlistEntry Interface:**
- `pattern: string` - Glob pattern or exact path to allow
- `reason: string` - Required justification for allowlisting
- `approvedBy?: string` - Who approved this entry
- `expiresAt?: string` - ISO date for expiration (optional)
- `detectors?: string[]` - Which detectors this applies to (empty = all)

#### 1.3.5 Define Runtime Config Types

**RuntimeConfig Interface:**
- `enabled: boolean` - Enable runtime file access monitoring
- `blockAccess: boolean` - Block access to sensitive files during execution
- `logAccess: boolean` - Log all file access attempts

#### 1.3.6 Define Audit Config Types

**AuditConfig Interface:**
- `enabled: boolean` - Enable audit logging
- `destination: 'file' | 'stdout' | 'syslog' | 'custom'` - Where to write logs
- `path?: string` - Log file path (if destination is 'file')
- `includeContent: boolean` - Include file contents in audit (careful!)
- `retentionDays: number` - Retention period for audit logs

#### 1.3.7 Define Main SecurityPolicy Interface

**SecurityPolicy Interface:**
- `version: '1.0'` - Policy version for compatibility
- `name: string` - Human-readable policy name
- `extends?: string` - Parent policy to inherit from
- `detectors: DetectorConfig[]` - Detector configurations
- `enforcement: Record<SensitivityLevel, EnforcementAction>` - Level to action mapping
- `allowlist: AllowlistEntry[]` - Explicit allowlist entries
- `excludes: string[]` - Files/directories to exclude from scanning
- `runtime: RuntimeConfig` - Runtime enforcement settings
- `audit: AuditConfig` - Audit settings

#### 1.3.8 Define ResolvedSecurityPolicy Interface

Create interface for fully-resolved policy (after inheritance):
- All fields from SecurityPolicy
- `source: string` - Policy name or 'default' or 'inline'
- `inheritanceChain: string[]` - Chain of extended policies
- `resolvedAt: Date` - When policy was resolved
- `hash: string` - Hash for audit comparison

#### 1.3.9 Create Zod Schemas

Create `packages/server/src/security/schemas.ts` with Zod schemas:

**sensitivityLevelSchema** - Enum of sensitivity levels

**enforcementActionSchema** - Enum of enforcement actions

**detectorConfigSchema** - Object schema with:
- type: z.string()
- enabled: z.boolean().default(true)
- sensitivity: sensitivityLevelSchema
- options: z.record(z.unknown()).optional()

**allowlistEntrySchema** - Object schema with:
- pattern: z.string().min(1)
- reason: z.string().min(1) (required for audit)
- approvedBy: z.string().optional()
- expiresAt: z.string().datetime().optional()
- detectors: z.array(z.string()).optional()

**runtimeConfigSchema** - Object schema with defaults:
- enabled: z.boolean().default(true)
- blockAccess: z.boolean().default(true)
- logAccess: z.boolean().default(true)

**auditConfigSchema** - Object schema with defaults:
- enabled: z.boolean().default(true)
- destination: z.enum(['file', 'stdout', 'syslog', 'custom']).default('file')
- path: z.string().optional()
- includeContent: z.boolean().default(false)
- retentionDays: z.number().int().min(1).max(365).default(90)

**enforcementMapSchema** - Record mapping SensitivityLevel to EnforcementAction

**securityPolicySchema** - Main policy schema with:
- version: z.literal('1.0')
- name: z.string().min(1)
- extends: z.string().optional()
- detectors: z.array(detectorConfigSchema).default([])
- enforcement: enforcementMapSchema
- allowlist: z.array(allowlistEntrySchema).default([])
- excludes: z.array(z.string()).default([])
- runtime: runtimeConfigSchema.optional()
- audit: auditConfigSchema.optional()

#### 1.3.10 Create Index Exports

Create `packages/server/src/security/index.ts` that exports:
- All types from types.ts
- All schemas from schemas.ts
- Any utility functions

### 1.4 Verification Steps

1. Create a test file that imports all types and schemas
2. Validate a complete SecurityPolicy object with Zod
3. Verify SensitivityLevel enum values match expected strings
4. Test default values are applied correctly by parsing empty objects
5. Verify type exports compile without errors
6. Run `pnpm typecheck` across the entire project

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/security/types.ts` | Created |
| `packages/server/src/security/schemas.ts` | Created |
| `packages/server/src/security/index.ts` | Created |

---

## Type Reference

### Enums Quick Reference

```
SensitivityLevel: INFO | WARNING | SENSITIVE | RESTRICTED
EnforcementAction: LOG | WARN | BLOCK | DENY
```

### Default Enforcement Mapping

| Sensitivity | Default Action |
|-------------|----------------|
| INFO | LOG |
| WARNING | WARN |
| SENSITIVE | BLOCK |
| RESTRICTED | DENY |

### Default Excludes

The default policy excludes these patterns:
- `**/node_modules/**`
- `**/dist/**`
- `**/.git/**`
- `**/vendor/**`
- `**/__pycache__/**`
- `**/venv/**`
- `**/.venv/**`

### Schema Patterns

**Const Object Pattern:**
```typescript
export const SensitivityLevel = {
  INFO: 'info',
  WARNING: 'warning',
  SENSITIVE: 'sensitive',
  RESTRICTED: 'restricted',
} as const;

export type SensitivityLevel = (typeof SensitivityLevel)[keyof typeof SensitivityLevel];
```

**Zod Enum from Const:**
```typescript
const sensitivityLevelSchema = z.enum([
  SensitivityLevel.INFO,
  SensitivityLevel.WARNING,
  SensitivityLevel.SENSITIVE,
  SensitivityLevel.RESTRICTED,
]);
```

**Optional with Default Pattern:**
```typescript
enabled: z.boolean().default(true),
```
