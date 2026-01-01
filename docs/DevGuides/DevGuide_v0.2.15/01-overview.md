# 01: Overview - CI/CD System Analysis

## Current State Analysis

### Repository Structure

AgentGate is a **pnpm monorepo** with three packages:

```
agentgate/
├── packages/
│   ├── server/      # Core CLI and server (@agentgate/server)
│   ├── dashboard/   # React dashboard (@agentgate/dashboard)
│   └── shared/      # Shared types (@agentgate/shared)
├── .github/
│   └── workflows/
│       ├── ci.yml       # Main CI workflow
│       └── release.yml  # Release automation
├── package.json         # Root workspace config
└── pnpm-workspace.yaml  # Workspace definition
```

### Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | 18, 20, 22 |
| Package Manager | pnpm | 9.x |
| Test Framework | Vitest | 1.x, 2.x, 4.x |
| Linter | ESLint | 8.x, 9.x |
| Type System | TypeScript | 5.x |
| Build Tool | tsc, Vite | - |
| Container | Docker | Optional |

### Test Framework Versions

Note: Each package uses different Vitest versions:

| Package | Vitest Version |
|---------|---------------|
| server | 1.2.0 |
| shared | 2.1.8 |
| dashboard | 4.0.16 |

This version skew is intentional (each package evolves independently) but may cause subtle compatibility issues.

---

## Current CI Workflow Analysis

### Existing `ci.yml` Structure

The current workflow has 10 jobs:

```yaml
jobs:
  lint:        # ESLint all packages
  typecheck:   # TypeScript all packages
  test:        # Vitest matrix (Node 18/20/22)
  build:       # Build all packages
  cli-test:    # CLI smoke tests
  platform-test: # Ubuntu/macOS/Windows
  security:    # pnpm audit
  deps:        # Dependency check
  docs:        # Documentation check
  ci-status:   # Final aggregation
```

### Issues Identified

#### 1. Contract Test Package Resolution

**File:** `test/contract/work-orders.contract.test.ts`
**Error:** `Failed to resolve entry for package "@agentgate/shared"`

**Root Cause:** The test imports `@agentgate/shared` but the package isn't built before tests run. In the workspace, TypeScript resolves via `workspace:*` but Vitest needs compiled output.

**Solution:** Ensure `pnpm build` runs before `pnpm test` or configure Vitest to resolve workspace packages via source.

#### 2. Platform Path Differences

**Files:**
- `test/streaming-executor.test.ts:342`
- `test/sandbox/subprocess-provider.test.ts:127,139`

**Error:** `expected '/private/tmp/...' to be '/tmp/...'`

**Root Cause:**
- On macOS, `/tmp` is a symlink to `/private/tmp`
- The `pwd` command resolves symlinks
- Tests compare raw paths without normalization

**Solution:** Use `fs.realpath()` to normalize paths before comparison.

#### 3. Windows Path Issues

**Error:** Expected `/tmp/sandbox-test-...` to be `C:\Users\RUNNER~1\AppData\Local\Temp\...`

**Root Cause:** Windows uses different temp directory and path separators.

**Solution:** Use `path.normalize()` and compare normalized paths.

---

## Test Suite Categorization

### Unit Tests (33 files, ~550 tests)

Tests that verify individual functions/classes in isolation using mocks.

**Characteristics:**
- Heavy use of `vi.mock()` for dependency isolation
- Fast execution (< 100ms per test)
- No external dependencies
- Process.env manipulation

**Representative Files:**
| File | Tests | Description |
|------|-------|-------------|
| config.test.ts | 86 | Environment variable parsing |
| rate-limiter.test.ts | 62 | Token bucket algorithm |
| stream-parser.test.ts | 47 | JSON stream parsing |
| event-buffer.test.ts | 44 | Ring buffer behavior |

**Reliability:** HIGH - Deterministic, no I/O

### Integration Tests (8 files, ~207 tests)

Tests that verify multiple components working together.

**Characteristics:**
- Real file system operations
- Temporary directory creation/cleanup
- May require Docker
- Moderate execution time (1-5s per test)

**Representative Files:**
| File | Tests | Description |
|------|-------|-------------|
| integration-service.test.ts | 38 | Git merge operations |
| sandbox/subprocess-provider.test.ts | 39 | Process management |
| sandbox/docker-provider.test.ts | 33 | Container execution |
| git-ops.test.ts | 22 | Git operations |

**Reliability:** MEDIUM - File system and process operations

### E2E Tests (5 files, ~47 tests)

Full system flow tests requiring real infrastructure.

**Characteristics:**
- Skip if environment variables not set
- 60-120 second timeouts
- Real GitHub API calls
- Full server startup/teardown

**Representative Files:**
| File | Tests | Description |
|------|-------|-------------|
| e2e/github-e2e.test.ts | 28 | GitHub API workflows |
| e2e/work-order-lifecycle.test.ts | 6 | Full work order flow |
| e2e/multi-iteration.test.ts | 3 | Agent iterations |

**Reliability:** LOW - External dependencies, network

### Contract Tests (1 file, 15 tests)

API contract validation against shared schemas.

**File:** `test/contract/work-orders.contract.test.ts`

**Characteristics:**
- Validates API responses match shared types
- Tests error response formats
- Uses Fastify test injection

**Reliability:** HIGH (once package resolution fixed)

---

## CI Performance Analysis

### Current Timing (Estimated)

| Stage | Duration | Blocking |
|-------|----------|----------|
| Checkout + Setup | 30s | Yes |
| pnpm install | 45s | Yes |
| lint | 30s | Yes |
| typecheck | 45s | Yes |
| Unit tests | 60s | Yes |
| Integration tests | 120s | Partial |
| Build | 45s | Yes |
| CLI tests | 30s | No |
| Platform tests | 180s | Parallel |
| E2E tests | 600s | No |

**Total Serial:** ~8 minutes (without E2E)
**Total Parallel:** ~5 minutes (optimized)

### Bottlenecks

1. **Sequential dependency installs** - Each job installs pnpm separately
2. **No build caching** - TypeScript recompiles fully each run
3. **E2E in main workflow** - Slows down PR feedback

---

## Design Decisions

### Decision 1: Tiered Testing

**Decision:** Split tests into tiers with different run frequencies.

| Tier | Tests | When | Max Time |
|------|-------|------|----------|
| 1 | lint, typecheck, format | Every PR/push | 2 min |
| 2 | Unit tests | Every PR/push | 5 min |
| 3 | Integration + Platform | Every PR/push | 10 min |
| 4 | E2E | Nightly + Release | 20 min |

**Rationale:** Fast feedback for common issues, comprehensive testing before release.

### Decision 2: Path Normalization Strategy

**Decision:** Use `fs.realpath()` for path comparisons in tests.

```typescript
// Before (fails on macOS)
expect(result.stdout.trim()).toBe('/tmp');

// After (works everywhere)
const expected = await fs.realpath(tempDir);
expect(result.stdout.trim()).toBe(expected);
```

**Rationale:** Handles symlinks (macOS `/tmp` -> `/private/tmp`) and normalizes paths.

### Decision 3: Shared Package Resolution

**Decision:** Build shared package before running tests.

**Options Considered:**
1. ❌ Skip contract tests - Violates "green by truth"
2. ❌ Inline shared types - Duplicates code
3. ✅ Build order in CI - Clean solution
4. ❌ Vitest alias config - Complex maintenance

**Implementation:**
```yaml
- name: Build shared package first
  run: pnpm --filter @agentgate/shared build

- name: Run tests
  run: pnpm test
```

### Decision 4: Required Checks

**Decision:** Gate merges on these checks only:

1. `lint` - Code quality
2. `typecheck` - Type safety
3. `test (Node 20)` - Primary runtime
4. `build` - Produces artifacts
5. `ci-status` - Aggregate check

**Not Required (but reported):**
- Security audit (may have unfixable warnings)
- Coverage (informational)
- E2E tests (external dependencies)

### Decision 5: Action Version Pinning

**Decision:** Pin to major versions with SHA comments.

```yaml
- uses: actions/checkout@v4         # SHA: abc123...
- uses: pnpm/action-setup@v4        # SHA: def456...
- uses: actions/setup-node@v4       # SHA: ghi789...
```

**Rationale:** Balance between security (pinned) and maintenance (major versions).

---

## Security Considerations

### Permissions

Each job should declare minimal permissions:

```yaml
permissions:
  contents: read        # Default for most jobs

# Only for release:
permissions:
  contents: write       # Create releases
  packages: write       # Publish to npm
```

### Secrets Required

| Secret | Purpose | Required |
|--------|---------|----------|
| `GITHUB_TOKEN` | Default token | Auto |
| `NPM_TOKEN` | npm publish | Release only |
| `CODECOV_TOKEN` | Coverage upload | Optional |
| `AGENTGATE_GITHUB_TOKEN` | E2E tests | E2E only |

### Supply Chain Safety

1. Pin action versions
2. Use `--frozen-lockfile` for installs
3. Run `pnpm audit` in CI
4. Consider SBOM generation for releases

---

## Implementation Priorities

### Phase 1: Fix Failing Tests (Thrust 1-2)
Make CI green with minimal changes.

### Phase 2: Optimize Workflow (Thrust 3-4)
Speed up feedback loop, improve reliability.

### Phase 3: Add Observability (Thrust 5-6)
Artifacts, coverage, security scanning.

### Phase 4: Release Automation (Thrust 7)
Automated versioning and publishing.
