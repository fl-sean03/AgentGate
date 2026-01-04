# DevGuide v0.2.30: Testing

## Test Strategy

This dogfooding session focused on integration testing through actual API usage rather than unit tests. The goal was to validate the complete flow from work order submission to verification completion.

---

## Test Matrix

### Sandbox Provider Testing

| Provider | Memory | Profile | Result | Notes |
|----------|--------|---------|--------|-------|
| Subprocess | 8GB (host) | agentgate-subprocess.yaml | PASS | Default, no isolation |
| Docker | 2GB (default) | agentgate-dev.yaml | FAIL | OOM (before fix) |
| Docker | 4GB (harness) | agentgate-dev.yaml | PASS | After memory fix |

### API Endpoint Testing

| Endpoint | Method | Tested | Result |
|----------|--------|--------|--------|
| `/api/v1/work-orders` | POST | Yes | PASS (after harnessProfile fix) |
| `/api/v1/work-orders/:id` | GET | Yes | PASS |
| `/api/v1/work-orders/:id/runs` | POST | Yes | PASS |
| `/api/v1/runs` | GET | Yes | PASS |
| `/api/v1/runs/:id` | GET | Yes | PASS |
| `/health` | GET | Yes | PASS |

### Verification Level Testing

| Level | Check | Result | Notes |
|-------|-------|--------|-------|
| L0 | Required files | PASS | |
| L0 | Forbidden patterns | PASS | |
| L1 | Test execution | PASS | |
| L2 | Blackbox testing | PASS | |
| L3 | Debug artifacts | PASS | |
| L3 | Large files | PASS | After .pnpm-store fix |
| L3 | Common mistakes | PASS | |
| L3 | Clean state | PASS | |
| L3 | Test coverage | PASS | |

---

## Test Scenarios

### Scenario 1: Basic Subprocess Execution

**Purpose:** Validate end-to-end flow with minimal configuration

**Steps:**
1. Start server via direct import
2. Submit work order with local workspace
3. Create run
4. Monitor run to completion
5. Verify verification passed

**Request:**
```bash
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -d '{
    "taskPrompt": "Review the README and suggest improvements",
    "workspaceSource": {
      "type": "local",
      "path": "/path/to/agentgate"
    },
    "harness": {
      "profile": "agentgate-subprocess"
    },
    "maxIterations": 1
  }'
```

**Expected Result:** Run completes with verification PASSED
**Actual Result:** PASSED (after fixing bugs #1, #2, #3)

---

### Scenario 2: Docker Execution with Memory Limits

**Purpose:** Validate Docker sandbox with harness-specified memory

**Steps:**
1. Start server
2. Submit work order with Docker profile
3. Create run
4. Monitor for OOM or completion

**Request:**
```bash
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -d '{
    "taskPrompt": "Review the README and suggest improvements",
    "workspaceSource": {
      "type": "local",
      "path": "/path/to/agentgate"
    },
    "harness": {
      "profile": "agentgate-dev"
    },
    "maxIterations": 1
  }'
```

**Expected Result:** Run completes (no OOM)
**First Attempt:** FAILED - Exit code 137 (OOM killed)
**After Fix:** PASSED - Run completed successfully

---

### Scenario 3: Harness Profile Persistence

**Purpose:** Verify harness profile is saved and loaded correctly

**Steps:**
1. Submit work order with specific profile
2. GET work order and verify profile field
3. Create run and verify correct profile used

**Verification:**
```bash
# Submit
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -d '{"harness": {"profile": "agentgate-subprocess"}, ...}'

# Check
curl http://localhost:3001/api/v1/work-orders/{id} | jq '.harnessProfile'
# Expected: "agentgate-subprocess"
```

**First Attempt:** FAILED - harnessProfile not in response
**After Fix:** PASSED - harnessProfile correctly persisted

---

### Scenario 4: L3 Verification Accuracy

**Purpose:** Verify L3 doesn't false-positive on package manager files

**Steps:**
1. Submit work order on repo with .pnpm-store
2. Run to verification stage
3. Check L3 large-files result

**Expected Result:** L3 passes without flagging .pnpm-store
**First Attempt:** WARNED - False positive on .pnpm-store files
**After Fix:** PASSED - "No unexpectedly large files found"

---

## Work Orders Submitted

| ID | Profile | Sandbox | Iterations | Result |
|----|---------|---------|------------|--------|
| 36220a42 | agentgate-subprocess | Subprocess | 1 | FAILED (L3 false positive) |
| be771a2b | agentgate-subprocess | Subprocess | 1 | STUCK (building state) |
| {post-fix-1} | agentgate-subprocess | Subprocess | 1 | PASSED |
| {post-fix-2} | agentgate-dev | Docker | 1 | FAILED (OOM) |
| {post-fix-3} | agentgate-dev | Docker | 1 | PASSED |

---

## Server Startup Methods

### Method 1: CLI (Broken)

```bash
npx agentgate serve --port 3001
# Process exits immediately (Bug #5)
```

### Method 2: Direct Import (Working)

```javascript
node -e "import('./dist/server/index.js').then(async (m) => {
  const app = m.createApp();
  await app.listen({ port: 3001, host: '0.0.0.0' });
  console.log('Server running on http://0.0.0.0:3001');
})"
```

---

## Verification Results

### Pre-Fix Verification Output

```
L3 Sanity Verification:
- debug-artifacts: PASS (No debug artifacts found)
- large-files: WARN (Found 5 large file(s))
  Details: .pnpm-store/v10/files/03/9288d8... (136.3MB), ...
- common-mistakes: PASS
- clean-state: PASS
- test-coverage: PASS
```

### Post-Fix Verification Output

```
L3 Sanity Verification:
- debug-artifacts: PASS (No debug artifacts found)
- large-files: PASS (No unexpectedly large files found)
- common-mistakes: PASS
- clean-state: PASS
- test-coverage: PASS
```

---

## Performance Observations

| Metric | Subprocess | Docker |
|--------|------------|--------|
| Startup time | ~2s | ~10s |
| Memory available | 8GB (host) | 4GB (limited) |
| Network access | Full | Configurable |
| Isolation | None | Container |
| Exit code on OOM | N/A | 137 |

---

## Regression Risk Assessment

| Fixed Bug | Regression Risk | Mitigation |
|-----------|-----------------|------------|
| #1 Date fields | Low | Backward compatible |
| #2 harnessProfile | Low | New field, no breaking |
| #3 L3 exclusions | Low | More permissive |
| #7 Memory limits | Low | Uses existing param |

---

## Pending Tests

### GitHub Repository Source

Tested - requires `AGENTGATE_GITHUB_TOKEN` environment variable.

**Test Result:**
```
GitHubError: GitHub token not configured.
Set AGENTGATE_GITHUB_TOKEN environment variable or run: agentgate auth github
```

This correctly validates that:
- API accepts GitHub source work orders
- Authentication requirement is enforced
- Clear error message provided

**Future testing** (with token configured) would validate:
- Clone from GitHub
- Rate limit handling
- Branch checkout

### CLI Commands

Not fully tested:
- `agentgate init`
- `agentgate submit`
- `agentgate run`
- `agentgate status`

### Edge Cases

- Invalid workspace path (Bug #6)
- Concurrent work orders
- Large task prompts
- Network-disabled sandbox
- Timeout handling

---

## Automated Test Recommendations

Based on dogfooding findings, add these integration tests:

1. **Harness profile round-trip test**
   - Submit with profile, verify persisted

2. **Docker memory limit test**
   - Submit with memory limit, verify container config

3. **L3 package manager exclusion test**
   - Create workspace with .pnpm-store, verify L3 passes

4. **Iteration date field test**
   - Complete iteration, verify valid timestamps

5. **Server lifecycle test**
   - Start server, submit work order, graceful shutdown
