# Module D: Gate Plan Resolver

## Purpose

Give the agent and verifier a clear definition of done. The gate plan resolver loads, parses, and normalizes verification requirements from multiple sources.

---

## Thrust 12: Verify Profile Parser

### 12.1 Objective

Implement the parser for `verify.yaml` — the canonical, portable verification profile.

### 12.2 Background

The verify profile is the primary gate plan source. It's explicit, version-controlled, and owned by the project. Format:

```yaml
version: "1"
name: "my-project"

environment:
  runtime: "node"
  version: "20"
  setup:
    - "pnpm install"

contracts:
  required_files:
    - "package.json"
    - "src/index.ts"
    - "README.md"
  required_schemas:
    - file: "package.json"
      schema: "json"
      rules:
        - has_field: "name"
        - has_field: "version"
  forbidden_patterns:
    - "**/.env"
    - "**/secrets/**"

tests:
  - name: "lint"
    command: "pnpm lint"
    timeout: 60
  - name: "unit"
    command: "pnpm test"
    timeout: 300
  - name: "typecheck"
    command: "pnpm typecheck"
    timeout: 120

blackbox:
  - name: "output-shape"
    fixture: "fixtures/sample-input.json"
    command: "node dist/index.js < {input}"
    assertions:
      - type: "json_schema"
        schema: "fixtures/output-schema.json"
      - type: "exit_code"
        expected: 0

policy:
  network: false
  max_runtime: 600
  max_disk_mb: 100
```

### 12.3 Subtasks

#### 12.3.1 Define Verify Profile Schema

Create `src/gate/verify-profile-schema.ts`:

Use Zod to define the complete schema:
- `version`: string (currently "1")
- `name`: string (project name)
- `environment`: EnvironmentConfig
- `contracts`: ContractConfig
- `tests`: TestConfig[]
- `blackbox`: BlackboxConfig[]
- `policy`: PolicyConfig

Each nested type fully validated with defaults.

#### 12.3.2 Implement Profile Parser

Create `src/gate/verify-profile-parser.ts`:

Functions:
- `parseVerifyProfile(content: string): VerifyProfile` - Parse YAML string
- `loadVerifyProfile(workspacePath: string): Promise<VerifyProfile | null>` - Load from workspace
- `validateProfile(profile: unknown): VerifyProfile` - Validate against schema
- `findProfilePath(workspacePath: string): Promise<string | null>` - Search for profile

Search locations (in order):
1. `verify.yaml`
2. `.agentgate/verify.yaml`
3. `agentgate/verify.yaml`

#### 12.3.3 Handle Profile Errors

Error types:
- `ProfileNotFoundError` - No verify.yaml found
- `ProfileParseError` - Invalid YAML syntax
- `ProfileValidationError` - Schema validation failed

Include helpful error messages with line numbers for YAML errors.

### 12.4 Verification Steps

1. Parse valid verify.yaml - returns complete profile
2. Parse invalid YAML - throws ProfileParseError with line number
3. Parse incomplete profile - fills in defaults
4. Missing profile - returns null (not error)
5. Invalid schema - throws ProfileValidationError

### 12.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/gate/verify-profile-schema.ts` | Created |
| `agentgate/src/gate/verify-profile-parser.ts` | Created |
| `agentgate/src/gate/errors.ts` | Created |

---

## Thrust 13: CI Workflow Ingestion

### 13.1 Objective

Extract gate plans from existing CI configurations as a fallback.

### 13.2 Background

Many projects already have CI configured. Instead of requiring verify.yaml, AgentGate can ingest simple CI workflows. Support is limited to a safe subset.

Supported CI systems (MVP):
- GitHub Actions (`.github/workflows/*.yml`)

### 13.3 Subtasks

#### 13.3.1 Create CI Ingestion Module

Create `src/gate/ci-ingestion.ts`:

Functions:
- `ingestCIWorkflows(workspacePath: string): Promise<GatePlan | null>` - Main entry
- `findCIConfigs(workspacePath: string): Promise<CIConfig[]>` - Discover CI files
- `parseGitHubActions(path: string): Promise<GatePlan | null>` - Parse GHA workflow

#### 13.3.2 Implement GitHub Actions Parser

Create `src/gate/github-actions-parser.ts`:

Parse `.github/workflows/*.yml`:
- Extract jobs with simple `run` steps
- Convert `run` commands to test commands
- Extract `strategy.matrix` for environment hints
- Ignore complex actions (uses: actions/*)

Supported patterns:
- Single-job workflows
- Sequential `run` steps
- Simple environment variables
- Node.js setup actions (extract version)

Unsupported (fall back to verify.yaml):
- Matrix builds
- Service containers
- Secrets usage
- Conditional steps
- Complex expressions

#### 13.3.3 Detect Unsupported Patterns

When unsupported patterns are found:
- Log warning with details
- Return null (require verify.yaml)
- Provide migration hint

#### 13.3.4 Convert to Internal Format

Transform parsed CI to GatePlan:
- CI `run` commands become `tests` entries
- CI `strategy.matrix` hints at environment
- Set sensible defaults for missing fields

### 13.4 Verification Steps

1. Parse simple GHA workflow - extracts run commands
2. Parse complex workflow - returns null with warning
3. Extract Node version from setup-node - correct version
4. No CI config - returns null
5. Multiple workflows - merges commands

### 13.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/gate/ci-ingestion.ts` | Created |
| `agentgate/src/gate/github-actions-parser.ts` | Created |

---

## Thrust 14: Gate Plan Normalizer

### 14.1 Objective

Normalize all gate plan sources into a single internal format.

### 14.2 Subtasks

#### 14.2.1 Define Internal Gate Plan Format

Create `src/gate/plan.ts`:

Internal `GatePlan` structure:
- `id`: string
- `source`: 'verify-profile' | 'ci-workflow' | 'default'
- `sourceFile`: string | null

- `environment`:
  - `runtime`: 'node' | 'python' | 'generic'
  - `runtimeVersion`: string | null
  - `setupCommands`: Command[]

- `contracts`:
  - `requiredFiles`: string[]
  - `requiredSchemas`: SchemaCheck[]
  - `forbiddenPatterns`: string[]
  - `namingConventions`: NamingRule[]

- `tests`: Command[]
  - Each: `name`, `command`, `timeout`, `expectedExit`

- `blackbox`: BlackboxTest[]
  - Each: `name`, `fixture`, `command`, `assertions`

- `policy`:
  - `networkAllowed`: boolean
  - `maxRuntimeSeconds`: number
  - `maxDiskMb`: number
  - `disallowedCommands`: string[]

#### 14.2.2 Create Normalizer

Create `src/gate/normalizer.ts`:

Functions:
- `normalizeFromProfile(profile: VerifyProfile): GatePlan`
- `normalizeFromCI(ciPlan: CIPlan): GatePlan`
- `createDefaultPlan(): GatePlan`
- `mergePlans(base: GatePlan, override: Partial<GatePlan>): GatePlan`

Default plan (when no source available):
- No contract checks
- Run `npm test` or `pnpm test` if package.json exists
- Network off
- 10 minute max runtime

#### 14.2.3 Implement Gate Plan Resolver

Create `src/gate/resolver.ts`:

Main resolver function:
- `resolveGatePlan(workspacePath: string, preference: GatePlanSource): Promise<GatePlan>`

Resolution order (for 'auto'):
1. Look for verify.yaml → normalize
2. Look for CI configs → ingest and normalize
3. Detect project type → create default
4. Fall back to empty plan

#### 14.2.4 Create Human-Readable Summary

Function to generate agent-readable gate summary:
- `generateGateSummary(plan: GatePlan): string`

Output format:
```
Gate Plan: my-project (from verify.yaml)

Required Files:
- package.json
- src/index.ts
- README.md

Forbidden Patterns:
- **/.env
- **/secrets/**

Tests:
1. lint: pnpm lint (timeout: 60s)
2. unit: pnpm test (timeout: 300s)
3. typecheck: pnpm typecheck (timeout: 120s)

Black-box Tests:
1. output-shape: Validates output JSON schema

Policy:
- Network: disabled
- Max runtime: 600s
```

### 14.3 Verification Steps

1. Resolve from verify.yaml - uses profile
2. Resolve with no profile, has CI - uses CI
3. Resolve with nothing - uses default
4. Human summary is readable and complete
5. Gate plan persists to JSON correctly

### 14.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/gate/plan.ts` | Created |
| `agentgate/src/gate/normalizer.ts` | Created |
| `agentgate/src/gate/resolver.ts` | Created |
| `agentgate/src/gate/summary.ts` | Created |
| `agentgate/src/gate/index.ts` | Created |

---

## Module D Complete Checklist

- [ ] Verify profile schema defined
- [ ] Profile parser implemented
- [ ] Profile validation with good errors
- [ ] GitHub Actions parser working
- [ ] Unsupported CI patterns detected
- [ ] Internal gate plan format defined
- [ ] Normalizer converts all sources
- [ ] Resolver with preference order
- [ ] Human-readable summary generated
- [ ] Unit tests passing

---

## Next Steps

Proceed to [06-snapshotter.md](./06-snapshotter.md) for Module E implementation.
