# 04: Artifacts & Security - Thrusts 5-6

## Thrust 5: Artifact Management

### 5.1 Objective

Implement proper artifact management for test reports, coverage data, and logs to aid debugging and provide visibility into CI quality.

### 5.2 Background

Current gaps:
- No test result artifacts uploaded on failure
- Coverage reports not persisted
- Logs not easily accessible for debugging
- No CI summary for quick status overview

### 5.3 Subtasks

#### 5.3.1 Upload Test Results on Failure

Add test result artifact upload to the test job:

```yaml
- name: Run tests
  run: pnpm test
  continue-on-error: true
  id: test-run

- name: Upload test results
  if: failure() || steps.test-run.outcome == 'failure'
  uses: actions/upload-artifact@v4
  with:
    name: test-results-${{ matrix.node-version }}-${{ github.run_id }}
    path: |
      packages/*/test-output/
      packages/*/coverage/
    retention-days: 14

- name: Check test result
  if: steps.test-run.outcome == 'failure'
  run: exit 1
```

#### 5.3.2 Configure Test Reporter

Add Vitest reporter for CI-friendly output:

In `packages/server/vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    reporters: process.env.CI
      ? ['default', 'junit']
      : ['default'],
    outputFile: {
      junit: './test-output/junit.xml',
    },
    // ... existing config
  },
});
```

Add junit reporter to package.json:
```json
{
  "devDependencies": {
    "@vitest/reporter-junit": "^1.2.0"
  }
}
```

#### 5.3.3 Implement Coverage Reporting

Add coverage job to CI:

```yaml
coverage:
  name: Coverage
  runs-on: ubuntu-latest
  needs: [test]
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
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
    - name: Build shared
      run: pnpm --filter @agentgate/shared build
    - name: Run coverage
      run: pnpm test:coverage
    - name: Upload to Codecov
      uses: codecov/codecov-action@v4
      with:
        token: ${{ secrets.CODECOV_TOKEN }}
        files: ./packages/*/coverage/lcov.info
        fail_ci_if_error: false
```

#### 5.3.4 Add CI Summary

Create step summaries for visibility:

```yaml
- name: Create CI Summary
  if: always()
  run: |
    echo "## CI Run Summary" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "| Metric | Value |" >> $GITHUB_STEP_SUMMARY
    echo "|--------|-------|" >> $GITHUB_STEP_SUMMARY
    echo "| Node Version | ${{ matrix.node-version }} |" >> $GITHUB_STEP_SUMMARY
    echo "| Platform | ${{ runner.os }} |" >> $GITHUB_STEP_SUMMARY
    echo "| Test Result | ${{ steps.test-run.outcome }} |" >> $GITHUB_STEP_SUMMARY
```

#### 5.3.5 Upload Build Artifacts

For release builds, archive the dist:

```yaml
- name: Upload build artifacts
  uses: actions/upload-artifact@v4
  with:
    name: agentgate-${{ github.sha }}
    path: |
      packages/server/dist/
      packages/dashboard/dist/
      packages/shared/dist/
    retention-days: 30
```

### 5.4 Verification Steps

1. Trigger a failing test and check artifacts:
   ```bash
   # Introduce a temporary failure
   echo "expect(true).toBe(false);" >> packages/server/test/temp.test.ts
   git add -A && git commit -m "test: trigger failure" && git push
   # Check workflow for uploaded artifacts
   gh run view --log-failed
   # Clean up
   git revert HEAD && git push
   ```

2. Check coverage report on main:
   ```bash
   gh run view --job coverage --log
   ```

3. Verify step summaries appear in workflow run

### 5.5 Files Created/Modified

| File | Action |
|------|--------|
| `.github/workflows/ci.yml` | Modified - Artifact uploads |
| `packages/server/vitest.config.ts` | Modified - JUnit reporter |
| `packages/server/package.json` | Modified - Add reporter dep |

---

## Thrust 6: Security Integration

### 6.1 Objective

Integrate security scanning into CI to catch vulnerabilities early and maintain supply chain safety.

### 6.2 Background

Security requirements:
1. Dependency vulnerability scanning
2. Secret detection (GitHub built-in)
3. Static analysis (optional CodeQL)
4. Lockfile integrity verification

### 6.3 Subtasks

#### 6.3.1 Enhance Security Audit Job

Update the security job with proper handling:

```yaml
security:
  name: Security Audit
  runs-on: ubuntu-latest
  permissions:
    security-events: write  # For CodeQL
  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v4
      with:
        version: ${{ env.PNPM_VERSION }}

    - uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'pnpm'

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Run pnpm audit
      run: pnpm audit --audit-level=high
      continue-on-error: true
      id: audit

    - name: Check for critical vulnerabilities
      run: |
        RESULT=$(pnpm audit --json 2>/dev/null | jq '.advisories | length')
        if [ "$RESULT" -gt 0 ]; then
          echo "::warning::Found $RESULT security advisories"
        fi
      continue-on-error: true

    - name: Verify lockfile integrity
      run: |
        # Check if lockfile matches package.json
        pnpm install --frozen-lockfile --ignore-scripts
        if [ $? -ne 0 ]; then
          echo "::error::Lockfile is out of sync with package.json"
          exit 1
        fi

    - name: Upload audit results
      if: steps.audit.outcome == 'failure'
      uses: actions/upload-artifact@v4
      with:
        name: security-audit
        path: |
          pnpm-lock.yaml
        retention-days: 7
```

#### 6.3.2 Add CodeQL Analysis (Optional)

For JavaScript/TypeScript static analysis:

```yaml
codeql:
  name: CodeQL Analysis
  runs-on: ubuntu-latest
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  permissions:
    security-events: write
    actions: read
    contents: read
  steps:
    - uses: actions/checkout@v4

    - name: Initialize CodeQL
      uses: github/codeql-action/init@v3
      with:
        languages: javascript-typescript
        queries: security-extended

    - name: Perform CodeQL Analysis
      uses: github/codeql-action/analyze@v3
      with:
        category: "/language:javascript-typescript"
```

#### 6.3.3 Add Dependency Review for PRs

```yaml
dependency-review:
  name: Dependency Review
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  steps:
    - uses: actions/checkout@v4

    - name: Dependency Review
      uses: actions/dependency-review-action@v4
      with:
        fail-on-severity: high
        allow-licenses: MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause
```

#### 6.3.4 Implement Explicit Permissions

Update all jobs with minimal permissions:

```yaml
permissions:
  contents: read  # Default for most jobs

jobs:
  lint:
    permissions:
      contents: read
    # ...

  test:
    permissions:
      contents: read
      checks: write  # For test reporting
    # ...

  security:
    permissions:
      contents: read
      security-events: write  # For CodeQL
    # ...

  release-ready:
    permissions:
      contents: write  # For tagging
    # ...
```

#### 6.3.5 Add SBOM Generation for Releases

In the release workflow:

```yaml
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with:
    path: .
    output-file: sbom.spdx.json
    format: spdx-json

- name: Upload SBOM
  uses: actions/upload-artifact@v4
  with:
    name: sbom-${{ needs.validate.outputs.version }}
    path: sbom.spdx.json
    retention-days: 90
```

### 6.4 Verification Steps

1. Run security audit locally:
   ```bash
   pnpm audit --audit-level=high
   ```

2. Test lockfile integrity:
   ```bash
   rm -rf node_modules pnpm-lock.yaml
   pnpm install
   git diff pnpm-lock.yaml  # Should be empty
   ```

3. Trigger dependency review on a PR:
   - Add a dependency with known vulnerability
   - Verify PR is flagged

4. Check CodeQL findings in Security tab

### 6.5 Files Created/Modified

| File | Action |
|------|--------|
| `.github/workflows/ci.yml` | Modified - Security jobs |
| `.github/dependabot.yml` | Verify exists |

---

## Thrust 5-6 Verification Checklist

### Artifacts

- [ ] Test results upload on failure
- [ ] JUnit XML generated
- [ ] Coverage reports generated
- [ ] Build artifacts persisted
- [ ] Step summaries visible

### Security

- [ ] pnpm audit runs without blocking
- [ ] Critical vulnerabilities would fail
- [ ] Lockfile integrity verified
- [ ] Permissions are minimal
- [ ] Dependency review blocks bad PRs

---

## Security Considerations

### Secrets Best Practices

| Secret | Scope | Usage |
|--------|-------|-------|
| `GITHUB_TOKEN` | Automatic | Most operations |
| `CODECOV_TOKEN` | Optional | Coverage upload |
| `NPM_TOKEN` | Release only | npm publish |

### Action Pinning Strategy

Use major versions with comment about last verified SHA:

```yaml
# Verified: actions/checkout@v4 = abc123def
- uses: actions/checkout@v4

# Verified: pnpm/action-setup@v4 = xyz789ghi
- uses: pnpm/action-setup@v4
```

### Third-Party Action Review

Only use actions from:
1. GitHub (`actions/*`, `github/*`)
2. Official tool maintainers (`pnpm/*`, `codecov/*`)
3. Well-known security tools (`anchore/*`)

Avoid:
- Personal/unverified actions
- Actions with few stars/users
- Actions without clear security policy
