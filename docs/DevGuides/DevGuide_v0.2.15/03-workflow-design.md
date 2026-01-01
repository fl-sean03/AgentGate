# 03: Workflow Design - Thrusts 3-4

## Thrust 3: CI Workflow Optimization

### 3.1 Objective

Restructure the CI workflow for faster feedback while maintaining comprehensive coverage.

### 3.2 Background

Current workflow issues:
- All jobs run on every push, even when unnecessary
- E2E tests block PR feedback
- Each job reinstalls dependencies separately
- No caching strategy for build artifacts

### 3.3 Subtasks

#### 3.3.1 Implement Job Tiering

Restructure `.github/workflows/ci.yml` with clear tiers:

**Tier 1: Fast Checks (Always run, block merge)**
- lint
- typecheck
- format:check (add this)

**Tier 2: Core Tests (Always run, block merge)**
- Unit tests (Node 20 only for PR, matrix for main)
- Contract tests
- Build verification

**Tier 3: Extended Tests (Run for main/PR, optional wait)**
- Platform tests (ubuntu/macos/windows)
- Node version matrix (18/20/22)

**Tier 4: E2E Tests (Nightly/Release only)**
- GitHub API tests
- Full workflow tests

#### 3.3.2 Add Dependency Caching

Leverage pnpm's caching with GitHub Actions:

```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v4
  with:
    version: ${{ env.PNPM_VERSION }}

- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: ${{ env.NODE_VERSION }}
    cache: 'pnpm'  # This caches pnpm store

- name: Get pnpm store directory
  shell: bash
  run: |
    echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

- name: Setup pnpm cache
  uses: actions/cache@v4
  with:
    path: ${{ env.STORE_PATH }}
    key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
    restore-keys: |
      ${{ runner.os }}-pnpm-store-
```

#### 3.3.3 Add Build Caching

Cache TypeScript build output:

```yaml
- name: Cache TypeScript build
  uses: actions/cache@v4
  with:
    path: |
      packages/*/dist
      packages/*/.tsbuildinfo
    key: ${{ runner.os }}-tsc-${{ hashFiles('**/tsconfig.json', 'packages/*/src/**') }}
    restore-keys: |
      ${{ runner.os }}-tsc-
```

#### 3.3.4 Add Concurrency Control

Prevent redundant runs on same PR:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true
```

#### 3.3.5 Create Nightly Workflow

Create `.github/workflows/nightly.yml` for comprehensive testing:

```yaml
name: Nightly

on:
  schedule:
    - cron: '0 4 * * *'  # 4 AM UTC daily
  workflow_dispatch:

jobs:
  full-matrix:
    name: Full Test Matrix
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: ['18', '20', '22']
    steps:
      # ... full test run

  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule' || github.event.inputs.run_e2e == 'true'
    steps:
      # ... e2e tests with secrets

  platform-full:
    name: Full Platform Tests
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: ['18', '20', '22']
    runs-on: ${{ matrix.os }}
    steps:
      # ... comprehensive platform tests
```

### 3.4 Verification Steps

1. Push a PR and measure time to first feedback
   - Target: < 3 minutes for lint/typecheck
   - Target: < 5 minutes for unit tests

2. Cancel a running workflow and push new changes
   - Old run should be cancelled
   - New run should start fresh

3. Check cache effectiveness:
   ```bash
   gh run view <run-id> --log | grep "Cache restored"
   ```

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `.github/workflows/ci.yml` | Modified - Restructured |
| `.github/workflows/nightly.yml` | Created - E2E tests |

---

## Thrust 4: Test Reliability Improvements

### 4.1 Objective

Eliminate flaky tests and timing-related failures.

### 4.2 Background

Identified reliability issues:
1. Tests using `wait()` with hard-coded delays
2. Event buffer tests with race conditions
3. File watcher tests sensitive to fs timing
4. Git tests creating too many temporary directories

### 4.3 Subtasks

#### 4.3.1 Replace Hard Waits with Event-Based Checks

**Current Pattern (Bad):**
```typescript
await writeFile(join(tempDir, 'test.txt'), 'content');
await wait(200);  // Hope this is enough
expect(events.length).toBeGreaterThan(0);
```

**Fixed Pattern (Good):**
```typescript
await writeFile(join(tempDir, 'test.txt'), 'content');

// Wait for specific condition with timeout
await vi.waitFor(() => {
  expect(events.length).toBeGreaterThan(0);
}, { timeout: 1000 });
```

Or use a helper:
```typescript
async function waitForCondition(
  condition: () => boolean,
  timeout = 1000,
  interval = 50
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Condition not met within timeout');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}
```

#### 4.3.2 Fix File Watcher Test Reliability

In `test/file-watcher.test.ts`:

**Current:**
```typescript
await writeFile(join(tempDir, 'test.txt'), 'hello');
await wait(200);
```

**Fixed:**
```typescript
await writeFile(join(tempDir, 'test.txt'), 'hello');

// Use vi.waitFor for reliable async expectations
await vi.waitFor(
  () => {
    expect(events.length).toBeGreaterThanOrEqual(1);
  },
  { timeout: 2000, interval: 50 }
);
```

#### 4.3.3 Increase Test Timeouts for CI

CI runners are slower than local machines. Add timeout buffers:

In `packages/server/vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    testTimeout: process.env.CI ? 60000 : 30000,
    hookTimeout: process.env.CI ? 60000 : 30000,
    // ...
  },
});
```

#### 4.3.4 Improve Git Test Cleanup

In `test/git-ops.test.ts`:

Add retry logic for cleanup:
```typescript
afterEach(async () => {
  // Retry cleanup with exponential backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await rm(testDir, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 2) {
        console.warn(`Failed to cleanup ${testDir}:`, error);
      }
      await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
    }
  }
});
```

#### 4.3.5 Isolate Environment Variables

Tests that modify `process.env` should restore values:

```typescript
describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should parse AGENTGATE_MAX_CONCURRENT_RUNS', () => {
    process.env.AGENTGATE_MAX_CONCURRENT_RUNS = '20';
    // ... test
  });
});
```

Or use Vitest's built-in:
```typescript
describe('config', () => {
  beforeEach(() => {
    vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', '20');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});
```

#### 4.3.6 Add Test Isolation Verification

Add a check that tests clean up after themselves:

```typescript
// In vitest.setup.ts or similar
afterAll(async () => {
  // Check for orphaned test directories
  const testOutputDir = path.join(__dirname, 'test-output');
  try {
    const contents = await fs.readdir(testOutputDir);
    if (contents.length > 0) {
      console.warn(`Warning: ${contents.length} orphaned directories in test-output`);
    }
  } catch {
    // Directory doesn't exist, that's fine
  }
});
```

### 4.4 Verification Steps

1. Run tests 10 times locally to check for flakiness:
   ```bash
   for i in {1..10}; do
     pnpm --filter @agentgate/server test && echo "Run $i: PASS" || echo "Run $i: FAIL"
   done
   ```

2. Check file watcher tests specifically:
   ```bash
   for i in {1..5}; do
     pnpm --filter @agentgate/server test test/file-watcher.test.ts
   done
   ```

3. Verify event buffer tests:
   ```bash
   pnpm --filter @agentgate/server test test/event-buffer.test.ts
   ```

### 4.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/vitest.config.ts` | Modified - CI timeouts |
| `packages/server/test/file-watcher.test.ts` | Modified - waitFor pattern |
| `packages/server/test/event-buffer.test.ts` | Modified - waitFor pattern |
| `packages/server/test/git-ops.test.ts` | Modified - cleanup retry |
| `packages/server/test/config.test.ts` | Modified - env isolation |

---

## Updated Workflow Structure

After implementing Thrusts 3-4, the workflow should look like:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '9'

jobs:
  # ============================================================================
  # TIER 1: Fast Checks (Always required)
  # ============================================================================
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  typecheck:
    name: TypeScript
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  # ============================================================================
  # TIER 2: Core Tests (Required, blocks merge)
  # ============================================================================
  test:
    name: Tests (Node ${{ matrix.node-version }})
    runs-on: ubuntu-latest
    needs: [lint, typecheck]
    strategy:
      fail-fast: false
      matrix:
        node-version: ${{ github.event_name == 'pull_request' && fromJson('["20"]') || fromJson('["18", "20", "22"]') }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Configure Git
        run: |
          git config --global user.email "ci@agentgate.dev"
          git config --global user.name "AgentGate CI"
      - name: Build shared package
        run: pnpm --filter @agentgate/shared build
      - name: Run tests
        run: pnpm test
        env:
          CI: true

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: packages/*/dist/
          retention-days: 7

  # ============================================================================
  # TIER 3: Extended Tests (Run in parallel, don't block)
  # ============================================================================
  platform-test:
    name: Platform (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    needs: [lint, typecheck]
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Configure Git
        run: |
          git config --global user.email "ci@agentgate.dev"
          git config --global user.name "AgentGate CI"
      - name: Build shared package
        run: pnpm --filter @agentgate/shared build
      - name: Run server tests
        run: pnpm --filter @agentgate/server test
        env:
          CI: true

  # ============================================================================
  # Status Check
  # ============================================================================
  ci-status:
    name: CI Status
    runs-on: ubuntu-latest
    if: always()
    needs: [lint, typecheck, test, build]
    steps:
      - name: Check status
        run: |
          if [[ "${{ needs.lint.result }}" == "failure" ]] || \
             [[ "${{ needs.typecheck.result }}" == "failure" ]] || \
             [[ "${{ needs.test.result }}" == "failure" ]] || \
             [[ "${{ needs.build.result }}" == "failure" ]]; then
            echo "::error::Required CI checks failed"
            exit 1
          fi
          echo "All required checks passed"
```

---

## Thrust 3-4 Verification Checklist

- [ ] Workflow runs faster on PRs (< 5 min)
- [ ] Full matrix runs only on main branch
- [ ] Cache hits are logged in workflow output
- [ ] Flaky tests pass consistently (10 consecutive runs)
- [ ] Platform tests pass on all three OSes
- [ ] Nightly workflow triggers at scheduled time
