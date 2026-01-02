# 03: Policy Layer

This document covers Thrust 2: implementing the policy resolution, loading, and inheritance system.

---

## Thrust 2: Policy Layer

### 2.1 Objective

Implement the policy resolution system that loads, merges, and resolves security policies from multiple sources (default, user profile, project) with inheritance support.

### 2.2 Background

Security policies can be defined at three levels:
1. **Default** - Built-in policy shipped with AgentGate
2. **User Profile** - User-specific policies in `~/.agentgate/security/`
3. **Project** - Project-specific policy in `.agentgate/security.yaml`

Each level can extend another policy, and properties are merged with later policies overriding earlier ones.

### 2.3 Subtasks

#### 2.3.1 Create Default Policy

Create `packages/server/src/security/policy/defaults.ts`:

**DEFAULT_POLICY constant:**
- version: '1.0'
- name: 'default'
- detectors array with:
  - Pattern detector (enabled, SENSITIVE) for credential files
  - Content detector (enabled, RESTRICTED) with secret patterns
  - Entropy detector (enabled, WARNING) with threshold 4.5
  - Gitignore detector (enabled, INFO)
- enforcement mapping (default: INFO→LOG, WARNING→WARN, SENSITIVE→BLOCK, RESTRICTED→DENY)
- allowlist: empty array
- excludes: standard patterns (node_modules, dist, .git, etc.)
- runtime: enabled, blockAccess true, logAccess true
- audit: enabled, file destination, no content, 90 days retention

**DEFAULT_SECRET_PATTERNS array:**
List of objects with id, pattern, and description for:
- AWS Access Key ID: `AKIA[0-9A-Z]{16}`
- AWS Secret Key: 40-char base64-like
- GitHub PAT: `ghp_[A-Za-z0-9]{36}`
- GitHub OAuth: `gho_[A-Za-z0-9]{36}`
- Stripe Secret: `sk_live_[A-Za-z0-9]{24,}`
- Stripe Publishable: `pk_live_[A-Za-z0-9]{24,}`
- Private Keys: `-----BEGIN .*PRIVATE KEY-----`
- Slack Token: `xox[baprs]-[0-9a-zA-Z-]{10,}`
- Google API Key: `AIza[0-9A-Za-z\-_]{35}`
- PostgreSQL URL: `postgres(?:ql)?://[^:]+:[^@]+@`
- MongoDB URL: `mongodb(?:\+srv)?://[^:]+:[^@]+@`
- Redis URL: `redis://[^:]+:[^@]+@`
- JWT Token: `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`
- NPM Token: `npm_[A-Za-z0-9]{36}`

**DEFAULT_FORBIDDEN_PATTERNS array:**
- `**/.env`
- `**/.env.*`
- `**/credentials.json`
- `**/service-account*.json`
- `**/*.pem`
- `**/*.key`
- `**/id_rsa*`
- `**/id_ed25519*`
- `**/.npmrc`

#### 2.3.2 Create Policy Loader

Create `packages/server/src/security/policy/loader.ts`:

**loadPolicyFromFile function:**
- Takes file path as argument
- Reads YAML file content
- Parses with js-yaml
- Validates with securityPolicySchema
- Returns validated SecurityPolicy or throws error

**loadProjectPolicy function:**
- Takes workspace directory as argument
- Looks for `.agentgate/security.yaml`
- If not found, returns null
- If found, calls loadPolicyFromFile
- Logs warning on parse/validation error, returns null

**loadProfilePolicy function:**
- Takes profile name as argument
- Looks for `~/.agentgate/security/{name}.yaml`
- If not found, logs warning, returns null
- If found, calls loadPolicyFromFile
- Returns validated policy or null on error

**listAvailableProfiles function:**
- Scans `~/.agentgate/security/` directory
- Returns array of profile names (without .yaml extension)

#### 2.3.3 Create Policy Resolver

Create `packages/server/src/security/policy/resolver.ts`:

**resolveSecurityPolicy function:**
- Takes workspaceDir and optional profileName
- Returns Promise<ResolvedSecurityPolicy>
- Algorithm:
  1. Start with DEFAULT_POLICY
  2. If profileName specified, load and merge profile policy
  3. Load and merge project policy if exists
  4. Build inheritance chain
  5. Compute policy hash
  6. Return resolved policy with metadata

**mergePolicies function:**
- Takes base policy and override policy
- Returns merged policy
- Merge rules:
  - Scalars: override wins
  - Arrays: concatenate (allowlist, excludes) or replace (detectors)
  - Objects: deep merge

**mergeDetectors function:**
- Takes base and override detector arrays
- For each detector type, override config replaces base
- New detector types from override are added
- Returns merged array

**handleInheritance function:**
- Takes policy and inheritance chain
- If policy has `extends`, recursively load and merge parent
- Track inheritance chain to detect cycles
- Throw error on circular inheritance

**computePolicyHash function:**
- Takes resolved policy
- Serialize to JSON (sorted keys)
- Compute SHA-256 hash
- Return hex string

#### 2.3.4 Create Policy Index

Create `packages/server/src/security/policy/index.ts`:
- Export all functions from loader.ts
- Export all functions from resolver.ts
- Export DEFAULT_POLICY from defaults.ts

### 2.4 Verification Steps

1. Load the default policy and verify all fields are present
2. Create a test YAML file and load it with loadPolicyFromFile
3. Test policy merging with two policies
4. Test inheritance with a policy that extends another
5. Test circular inheritance detection
6. Verify computePolicyHash produces consistent output
7. Run integration test: resolve policy with project + profile

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/security/policy/defaults.ts` | Created |
| `packages/server/src/security/policy/loader.ts` | Created |
| `packages/server/src/security/policy/resolver.ts` | Created |
| `packages/server/src/security/policy/index.ts` | Created |
| `packages/server/src/security/index.ts` | Modified - export policy module |

---

## Policy Merge Rules

### Scalar Values

Override policy value wins:
```yaml
# Base
name: "base-policy"
# Override
name: "my-project"
# Result
name: "my-project"
```

### Detector Arrays

Override detector replaces base detector of same type:
```yaml
# Base
detectors:
  - type: content
    enabled: true
    sensitivity: restricted
# Override
detectors:
  - type: content
    enabled: false
# Result
detectors:
  - type: content
    enabled: false
    sensitivity: restricted  # Inherited from base
```

### Allowlist Arrays

Entries are concatenated:
```yaml
# Base
allowlist:
  - pattern: "test/**"
    reason: "Test files"
# Override
allowlist:
  - pattern: "docs/**"
    reason: "Documentation"
# Result
allowlist:
  - pattern: "test/**"
    reason: "Test files"
  - pattern: "docs/**"
    reason: "Documentation"
```

### Exclude Arrays

Patterns are merged (deduplicated):
```yaml
# Base
excludes:
  - "**/node_modules/**"
# Override
excludes:
  - "**/dist/**"
# Result
excludes:
  - "**/node_modules/**"
  - "**/dist/**"
```

### Enforcement Map

Override values win per-key:
```yaml
# Base
enforcement:
  info: log
  warning: warn
# Override
enforcement:
  warning: block  # Override just this key
# Result
enforcement:
  info: log
  warning: block
```

---

## Configuration File Locations

### Project Policy

Location: `{workspaceDir}/.agentgate/security.yaml`

This is the project-specific security configuration. It's checked into version control and applies to all runs against this workspace.

### User Profiles

Location: `~/.agentgate/security/{profile-name}.yaml`

User-specific profiles that can be referenced by name. Useful for:
- Different security levels (strict, relaxed)
- Team-specific configurations
- CI vs local development

### Profile Discovery

When a profile is requested:
1. Check `~/.agentgate/security/{name}.yaml`
2. If not found, check if it's a built-in profile name
3. If still not found, log warning and use default

### Built-in Profiles

The following profile names are reserved:
- `default` - The built-in default policy
- `strict` - Maximum security (all detectors, no allowlist)
- `relaxed` - Minimum security (warnings only)
