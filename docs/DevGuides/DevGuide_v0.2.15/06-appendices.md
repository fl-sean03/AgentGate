# 06: Appendices

## A. Implementation Checklist

### Thrust 1: Fix Contract Tests

- [ ] Build shared package before tests in CI
- [ ] Verify contract tests pass locally
- [ ] Verify contract tests pass in CI

### Thrust 2: Fix Platform Tests

- [ ] Add fs.realpath() to streaming-executor.test.ts
- [ ] Add fs.realpath() to subprocess-provider.test.ts (workspace cwd)
- [ ] Add fs.realpath() to subprocess-provider.test.ts (custom cwd)
- [ ] Verify tests pass on macOS
- [ ] Verify tests pass on Windows

### Thrust 3: CI Workflow Optimization

- [ ] Implement job tiering
- [ ] Add dependency caching
- [ ] Add build caching
- [ ] Add concurrency control
- [ ] Create nightly workflow
- [ ] Reduce PR feedback time to < 5 min

### Thrust 4: Test Reliability

- [ ] Replace wait() with vi.waitFor()
- [ ] Increase CI timeouts
- [ ] Add cleanup retry logic
- [ ] Isolate environment variables
- [ ] Verify 10 consecutive runs pass

### Thrust 5: Artifact Management

- [ ] Upload test results on failure
- [ ] Configure JUnit reporter
- [ ] Add coverage reporting
- [ ] Add CI summary
- [ ] Upload build artifacts

### Thrust 6: Security Integration

- [ ] Enhance security audit job
- [ ] Add dependency review for PRs
- [ ] Implement explicit permissions
- [ ] Add SBOM generation

### Thrust 7: Release Automation

- [ ] Enhance version validation
- [ ] Improve changelog generation
- [ ] Add release verification
- [ ] Configure npm publish channels
- [ ] Add release summary

---

## B. Command Reference

### Local Development

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @agentgate/server test
pnpm --filter @agentgate/shared test
pnpm --filter @agentgate/dashboard test

# Run specific test file
pnpm --filter @agentgate/server test test/file-watcher.test.ts

# Run with coverage
pnpm test:coverage

# Build all packages
pnpm build

# Build specific package
pnpm --filter @agentgate/shared build

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format check
pnpm format:check
```

### CI/GitHub Actions

```bash
# Watch workflow run
gh run watch

# View failed logs
gh run view <run-id> --log-failed

# List recent runs
gh run list --limit 10

# Download artifacts
gh run download <run-id>

# Manually trigger workflow
gh workflow run ci.yml

# Trigger release
gh workflow run release.yml -f version=0.3.0
```

### Git Operations

```bash
# Create release tag
git tag v0.3.0
git push origin v0.3.0

# Delete tag (if needed)
git tag -d v0.3.0
git push origin :refs/tags/v0.3.0

# View commit history for changelog
git log --pretty=format:"- %s (%h)" v0.2.7..HEAD
```

---

## C. Troubleshooting Guide

### Issue: Contract tests fail with package resolution error

**Symptom:**
```
Error: Failed to resolve entry for package "@agentgate/shared"
```

**Solutions:**

1. Build shared package first:
   ```bash
   pnpm --filter @agentgate/shared build
   pnpm --filter @agentgate/server test
   ```

2. Clean and rebuild:
   ```bash
   pnpm clean
   pnpm build
   pnpm test
   ```

3. Check workspace configuration in `pnpm-workspace.yaml`

### Issue: Path comparison fails on macOS

**Symptom:**
```
expected '/private/tmp/...' to be '/tmp/...'
```

**Solution:**
Use `fs.realpath()` to resolve symlinks:
```typescript
const expected = await fs.realpath(tempDir);
expect(result.stdout.trim()).toBe(expected);
```

### Issue: Tests timeout on CI

**Symptom:**
```
Test timed out in 30000ms
```

**Solutions:**

1. Increase timeout in vitest.config.ts:
   ```typescript
   testTimeout: process.env.CI ? 60000 : 30000,
   ```

2. Use `vi.useRealTimers()` before async operations

3. Check for hanging promises in tests

### Issue: Flaky file watcher tests

**Symptom:**
Tests pass locally but fail randomly in CI.

**Solutions:**

1. Replace `wait()` with `vi.waitFor()`:
   ```typescript
   await vi.waitFor(() => {
     expect(events.length).toBeGreaterThan(0);
   }, { timeout: 2000 });
   ```

2. Increase debounce time for CI

3. Use `recursive: false` for compatibility

### Issue: Git tests leave orphaned directories

**Symptom:**
`test-output/` directory fills up with old test directories.

**Solutions:**

1. Add retry logic to cleanup:
   ```typescript
   afterEach(async () => {
     for (let i = 0; i < 3; i++) {
       try {
         await rm(testDir, { recursive: true, force: true });
         break;
       } catch { await wait(100 * (i + 1)); }
     }
   });
   ```

2. Add periodic cleanup in CI

### Issue: CI runs are slow

**Symptom:**
PR feedback takes > 10 minutes.

**Solutions:**

1. Enable caching:
   ```yaml
   - uses: actions/setup-node@v4
     with:
       cache: 'pnpm'
   ```

2. Run only Node 20 on PRs
3. Use job concurrency limits
4. Move E2E tests to nightly

### Issue: Security audit has false positives

**Symptom:**
pnpm audit reports vulnerabilities in dev dependencies.

**Solutions:**

1. Use `--audit-level=high` to filter
2. Add exceptions for dev-only packages
3. Document acceptable risks
4. Use `pnpm audit --prod` for production deps only

---

## D. CI Workflow File Reference

### Main CI Workflow Structure

```
.github/workflows/ci.yml
├── name: CI
├── on: [push, pull_request]
├── concurrency: cancel-in-progress
└── jobs:
    ├── lint          # Tier 1: Fast checks
    ├── typecheck     # Tier 1: Fast checks
    ├── test          # Tier 2: Core tests
    ├── build         # Tier 2: Build verification
    ├── platform-test # Tier 3: Extended tests
    ├── security      # Tier 3: Security checks
    └── ci-status     # Final gate
```

### Nightly Workflow Structure

```
.github/workflows/nightly.yml
├── name: Nightly
├── on: schedule (4 AM UTC)
└── jobs:
    ├── full-matrix    # All Node versions
    ├── e2e-tests      # GitHub API tests
    └── platform-full  # All OS × Node combinations
```

### Release Workflow Structure

```
.github/workflows/release.yml
├── name: Release
├── on: tag push (v*)
└── jobs:
    ├── validate       # Version check
    ├── build          # Build + test
    ├── github-release # Create release
    ├── npm-publish    # Publish to npm
    └── notify         # Summary
```

---

## E. Environment Variables

### CI Environment

| Variable | Purpose | Default |
|----------|---------|---------|
| `CI` | Indicates CI environment | `true` |
| `NODE_ENV` | Node environment | `test` |
| `GITHUB_TOKEN` | GitHub API access | Auto |

### Test Environment

| Variable | Purpose | Default |
|----------|---------|---------|
| `AGENTGATE_GITHUB_TOKEN` | E2E GitHub tests | - |
| `AGENTGATE_TEST_TIMEOUT` | Override timeout | - |

### Release Environment

| Variable | Purpose | Required |
|----------|---------|----------|
| `NPM_TOKEN` | npm publish | Yes |
| `CODECOV_TOKEN` | Coverage upload | Optional |

---

## F. File Changes Summary

### Modified Files

| File | Thrusts | Purpose |
|------|---------|---------|
| `.github/workflows/ci.yml` | 1,3,5,6 | Main CI workflow |
| `.github/workflows/release.yml` | 7 | Release automation |
| `packages/server/vitest.config.ts` | 1,4,5 | Test configuration |
| `packages/server/test/streaming-executor.test.ts` | 2 | Path fix |
| `packages/server/test/sandbox/subprocess-provider.test.ts` | 2 | Path fix |
| `packages/server/test/file-watcher.test.ts` | 4 | Reliability |
| `packages/server/test/event-buffer.test.ts` | 4 | Reliability |
| `packages/server/test/git-ops.test.ts` | 4 | Cleanup |
| `packages/server/test/config.test.ts` | 4 | Env isolation |

### New Files

| File | Thrust | Purpose |
|------|--------|---------|
| `.github/workflows/nightly.yml` | 3 | Nightly tests |

---

## G. Metrics & Targets

### CI Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| PR lint/typecheck | < 3 min | TBD |
| PR unit tests | < 5 min | TBD |
| Full matrix | < 15 min | TBD |
| Platform tests | < 10 min | TBD |
| E2E tests | < 20 min | TBD |

### Quality Targets

| Metric | Target | Current |
|--------|--------|---------|
| Test pass rate | 100% | TBD |
| Flaky test rate | 0% | TBD |
| Coverage | > 70% | TBD |
| Critical vulns | 0 | TBD |

---

## H. Related Documentation

- [DevGuide README](../README.md) - DevGuide system overview
- [DevGuide v0.2.14](../DevGuide_v0.2.14/00-index.md) - Claude Agent SDK
- [DevGuide v0.2.13](../DevGuide_v0.2.13/00-index.md) - Container Sandboxing
- [AGENTS.md](/AGENTS.md) - Agent configuration
- [README.md](/README.md) - Project overview
