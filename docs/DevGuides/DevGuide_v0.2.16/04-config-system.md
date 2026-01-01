# 04: Config System

This document covers Thrusts 7-8: implementing the configuration loading, resolution, and profile management system.

---

## Thrust 7: Config Loader

### 7.1 Objective

Implement YAML profile loading with validation, supporting the `~/.agentgate/harnesses/` directory structure.

### 7.2 Background

The config loader reads YAML profile files, validates them against the HarnessConfig schema, and provides a clean API for loading profiles by name or path.

### 7.3 Subtasks

#### 7.3.1 Add YAML Dependency

Add `yaml` package to `packages/server/package.json`:
- Add to dependencies: `"yaml": "^2.x"`
- Run `pnpm install`

#### 7.3.2 Create Config Loader Module

Create `packages/server/src/harness/config-loader.ts`:

**Define Constants:**
- `HARNESS_DIR` = `~/.agentgate/harnesses`
- `DEFAULT_PROFILE_NAME` = `default`
- `PROFILE_EXTENSION` = `.yaml`

**Define HarnessProfileInfo Interface:**
- `name: string` - Profile name
- `path: string` - Full path to file
- `description: string | null` - From profile
- `extends: string | null` - Parent profile name

#### 7.3.3 Implement Profile Discovery

Create `listProfiles(): Promise<HarnessProfileInfo[]>` function:
- Read directory listing of `HARNESS_DIR`
- Filter for `.yaml` files
- Parse each file to extract metadata (name, description, extends)
- Return array of profile info objects
- Handle missing directory gracefully (return empty array)

#### 7.3.4 Implement Profile Loading

Create `loadProfile(nameOrPath: string): Promise<HarnessConfig>` function:
- If `nameOrPath` is absolute path, load directly
- If `nameOrPath` is relative path with extension, load relative to cwd
- Otherwise, look up in `HARNESS_DIR/{nameOrPath}.yaml`
- Parse YAML content
- Validate against `harnessConfigSchema`
- Return validated HarnessConfig
- Throw descriptive error if file not found or validation fails

#### 7.3.5 Implement Profile Existence Check

Create `profileExists(name: string): Promise<boolean>` function:
- Check if profile file exists in `HARNESS_DIR`
- Return boolean

#### 7.3.6 Implement Profile Saving

Create `saveProfile(name: string, config: HarnessConfig): Promise<void>` function:
- Ensure `HARNESS_DIR` exists
- Serialize config to YAML
- Write to `{HARNESS_DIR}/{name}.yaml`
- Validate before saving

#### 7.3.7 Implement Directory Initialization

Create `ensureHarnessDir(): Promise<void>` function:
- Create `~/.agentgate/harnesses` if it doesn't exist
- Copy default profiles if directory was just created

### 7.4 Verification Steps

1. Create test profile YAML file
2. Test `loadProfile` with valid profile
3. Test `loadProfile` with invalid YAML
4. Test `listProfiles` returns correct list
5. Test `saveProfile` creates valid file
6. Verify error messages are helpful

### 7.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/harness/config-loader.ts` | Created |
| `packages/server/package.json` | Modified - add yaml dependency |

---

## Thrust 8: Config Resolver

### 8.1 Objective

Implement configuration resolution with inheritance support, merging profiles and applying defaults to produce a fully-resolved ResolvedHarnessConfig.

### 8.2 Background

The config resolver handles:
1. Loading the base profile (if specified)
2. Recursively resolving the inheritance chain via `extends`
3. Merging configurations (later overrides earlier)
4. Applying CLI option overrides
5. Filling in defaults for missing values
6. Computing the config hash for audit

### 8.3 Subtasks

#### 8.3.1 Create Config Resolver Module

Create `packages/server/src/harness/config-resolver.ts`:

**Define ResolveOptions Interface:**
- `profileName?: string` - Named profile to load
- `profilePath?: string` - Direct path to profile
- `cliOverrides?: Partial<HarnessConfig>` - CLI option overrides
- `workspacePath?: string` - For relative path resolution

#### 8.3.2 Implement Inheritance Resolution

Create `resolveInheritance(config: HarnessConfig): Promise<HarnessConfig[]>` function:
- Start with the given config
- If `extends` is set, load parent profile
- Recursively resolve parent's `extends`
- Detect circular inheritance (throw error)
- Return array from root to leaf (oldest to newest)

#### 8.3.3 Implement Config Merging

Create `mergeConfigs(configs: HarnessConfig[]): HarnessConfig` function:
- Start with empty config
- For each config in array (root to leaf):
  - Deep merge into result
  - Later values override earlier
- Handle arrays: replace (don't merge)
- Handle objects: recursive merge
- Handle primitives: replace

#### 8.3.4 Implement Default Application

Create `applyDefaults(config: HarnessConfig): ResolvedHarnessConfig` function:
- For each field, apply default if not set
- Ensure all optional fields become required
- Add `source`, `inheritanceChain`, `resolvedAt` metadata
- Compute `configHash` using SHA256 of serialized config

#### 8.3.5 Implement CLI Override Application

Create `applyCLIOverrides(config: HarnessConfig, overrides: Partial<HarnessConfig>): HarnessConfig` function:
- Map CLI options to config paths:
  - `--max-iterations` -> `loopStrategy.maxIterations`
  - `--max-time` -> `limits.maxWallClockSeconds`
  - `--agent` -> `agent.type`
  - `--gate-plan` -> `verification.gatePlanSource`
  - `--wait-for-ci` -> `verification.waitForCI`
  - `--skip-verification` -> `verification.skipLevels`
  - `--network` -> `limits.networkAllowed`
  - `--loop-strategy` -> `loopStrategy.mode`
- Apply overrides to config
- Return modified config

#### 8.3.6 Implement Main Resolve Function

Create `resolveHarnessConfig(options: ResolveOptions): Promise<ResolvedHarnessConfig>` function:
1. Load base config:
   - If `profileName`, load from `~/.agentgate/harnesses/{name}.yaml`
   - If `profilePath`, load from path
   - Otherwise, start with empty config
2. Resolve inheritance chain
3. Merge all configs in chain
4. Apply CLI overrides
5. Apply defaults
6. Validate final config
7. Return ResolvedHarnessConfig

#### 8.3.7 Implement Config Hash Computation

Create `computeConfigHash(config: ResolvedHarnessConfig): string` function:
- Serialize config to deterministic JSON (sorted keys)
- Compute SHA256 hash
- Return first 16 characters

### 8.4 Verification Steps

1. Test resolution with no profile (defaults only)
2. Test resolution with named profile
3. Test inheritance with 2-level chain
4. Test inheritance cycle detection
5. Test CLI override precedence
6. Verify config hash is deterministic

### 8.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/harness/config-resolver.ts` | Created |

---

## Profile Format Reference

### Minimal Profile

```yaml
name: minimal
loopStrategy:
  mode: fixed
  maxIterations: 1
```

### Complete Profile

```yaml
name: full-example
extends: default
description: "Complete example with all options"

loopStrategy:
  mode: hybrid
  maxIterations: 5
  progressTracking: verification-levels
  completionCriteria:
    - verification-pass
    - no-changes
  minVerificationLevel: L1
  acceptPartialAfter: 4
  requireCI: false
  maxCIIterations: 3

agent:
  type: claude-code-subscription
  maxTurns: 100
  permissionMode: bypassPermissions
  timeoutSeconds: 3600

verification:
  gatePlanSource: auto
  skipLevels: []
  waitForCI: false
  ci:
    timeoutSeconds: 1800
    pollIntervalSeconds: 30
    maxIterations: 3

gitOps:
  mode: local
  branchPattern: "agentgate/{workOrderId}"
  draftPR: true
  prTitlePattern: "[AgentGate] {taskSummary}"
  autoMerge: false

limits:
  maxWallClockSeconds: 3600
  networkAllowed: false
  maxDiskMb: 1024
  forbiddenPatterns:
    - "**/.env"
    - "**/.env.*"
    - "**/secrets/**"
```

### Inheritance Example

```yaml
# parent.yaml
name: parent
loopStrategy:
  mode: hybrid
  maxIterations: 5
verification:
  waitForCI: false

# child.yaml
name: child
extends: parent
loopStrategy:
  maxIterations: 10  # Override
verification:
  waitForCI: true    # Override
gitOps:
  mode: github-pr    # Add new section
```

**Resolved child:**
```yaml
loopStrategy:
  mode: hybrid       # From parent
  maxIterations: 10  # From child (override)
verification:
  waitForCI: true    # From child (override)
gitOps:
  mode: github-pr    # From child (new)
```

---

## Default Profiles to Ship

### default.yaml

```yaml
name: default
description: "Balanced hybrid strategy for most use cases"

loopStrategy:
  mode: hybrid
  maxIterations: 5
  progressTracking: verification-levels
  completionCriteria:
    - verification-pass
    - no-changes
  minVerificationLevel: L1

agent:
  type: claude-code-subscription
  maxTurns: 100
  permissionMode: bypassPermissions
  timeoutSeconds: 3600

verification:
  gatePlanSource: auto
  waitForCI: false

gitOps:
  mode: local
  branchPattern: "agentgate/{workOrderId}"

limits:
  maxWallClockSeconds: 3600
  networkAllowed: false
```

### ci-focused.yaml

```yaml
name: ci-focused
extends: default
description: "CI-focused workflow with GitHub integration"

loopStrategy:
  maxIterations: 8
  completionCriteria:
    - ci-pass
    - verification-pass
  requireCI: true
  maxCIIterations: 5

verification:
  gatePlanSource: ci-workflow
  waitForCI: true
  ci:
    timeoutSeconds: 2700
    pollIntervalSeconds: 60
    maxIterations: 5

gitOps:
  mode: github-pr
  draftPR: true
```

### rapid-iteration.yaml

```yaml
name: rapid-iteration
extends: default
description: "Fast iteration with minimal verification"

loopStrategy:
  mode: fixed
  maxIterations: 2

verification:
  skipLevels:
    - L2
    - L3

agent:
  maxTurns: 50
  timeoutSeconds: 1200

limits:
  maxWallClockSeconds: 1800
```

### ralph-style.yaml

```yaml
name: ralph-style
extends: default
description: "Loop until agent signals completion"

loopStrategy:
  mode: ralph
  maxIterations: 15
  blockingExitCode: 2
  loopDetection: true
  similarityThreshold: 0.9
  stateDir: ".agent"

agent:
  maxTurns: 150
  timeoutSeconds: 7200

limits:
  maxWallClockSeconds: 28800
```
