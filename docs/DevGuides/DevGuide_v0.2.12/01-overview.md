# 01: Overview - GitHub CI Feedback Loop

## Current State

### What Works

1. **PR Creation**: Agents can create PRs via GitHub API (v0.2.4)
2. **State Machine**: CI_POLLING and CI_FAILED states exist
3. **Feedback Loop**: Local verification failures trigger agent remediation
4. **GitHub Integration**: Octokit client configured for repo operations

### What's Missing

1. **No CI Monitoring**: After PR creation, the system doesn't poll GitHub Actions
2. **No Log Retrieval**: Cannot download workflow run logs programmatically
3. **No Failure Parsing**: Cannot extract actionable info from CI failures
4. **No CI Feedback**: CI failures don't trigger agent remediation
5. **Manual Intervention**: Admin override required for failing PRs

### Current Flow (Broken)

```
Agent builds → Verification passes → PR created → ???
                                                   │
                                                   ↓
                                            (Nothing happens)
                                                   │
                                                   ↓
                                        Human checks PR manually
                                                   │
                                                   ↓
                                        Admin merge with override
```

---

## Target State

### Complete CI Feedback Loop

```
Agent builds → Verification passes → PR created
                                          │
                                          ↓
                                   CI Monitor starts
                                          │
                                          ↓
                              Poll GitHub Actions (every 30s)
                                          │
                            ┌─────────────┴─────────────┐
                            │                           │
                            ↓                           ↓
                      CI PASSED                    CI FAILED
                            │                           │
                            ↓                           ↓
                    Run SUCCEEDED              Download logs
                            │                           │
                            ↓                           ↓
                    Ready for merge           Parse failures
                                                        │
                                                        ↓
                                              Generate feedback
                                                        │
                                                        ↓
                                              Agent remediates
                                                        │
                                                        ↓
                                                New commit → Push
                                                        │
                                                        ↓
                                              CI runs again...
                                                        │
                                                        └──→ (loop)
```

### Key Capabilities

1. **Automatic Polling**: Start polling when PR is created
2. **Smart Log Parsing**: Extract only relevant failure information
3. **Actionable Feedback**: Format failures as agent-friendly instructions
4. **Iteration Limits**: Max CI retries to prevent infinite loops
5. **Timeout Handling**: Fail gracefully if CI takes too long
6. **Dashboard Visibility**: Show CI status in real-time

---

## Design Decisions

### 1. Polling vs Webhooks

**Decision: Polling**

| Approach | Pros | Cons |
|----------|------|------|
| **Polling** | Simple, no infrastructure, works anywhere | Latency, API rate limits |
| **Webhooks** | Real-time, efficient | Requires public endpoint, webhook setup |

**Rationale:**
- AgentGate runs locally or in containers without guaranteed public endpoints
- GitHub Actions have generous API rate limits (5000/hour with token)
- 30-second polling interval is acceptable for CI runs that take minutes
- Simpler to implement and maintain

### 2. Log Storage

**Decision: In-memory with optional persistence**

- Keep last N CI logs in memory per work order
- Optionally persist to `.agentgate/ci-logs/` for debugging
- Don't persist full logs by default (can be large)
- Always store parsed failure summaries

### 3. Feedback Format

**Decision: Structured markdown with actionable items**

```markdown
## CI Failure Report

### Failed Jobs

#### 1. Tests (Node 20)
**Step:** Run tests
**Error:**
```
FAIL test/git-ops.test.ts > Git Operations > merge operations
Error: pathspec 'main' did not match any file(s) known to git
```

### Action Items

1. The test assumes a 'main' branch exists but the test creates repos without one
2. Update git-ops.test.ts to create 'main' branch in test setup
3. Run `pnpm test` locally to verify fix

### Full Log
<details>
<summary>Click to expand</summary>
[truncated log content]
</details>
```

### 4. Retry Strategy

**Decision: Exponential backoff with max retries**

- First CI failure: Immediate feedback
- Subsequent failures: Agent gets full context of previous attempts
- Max CI iterations: Configurable (default 3)
- After max: Run fails with all CI feedback collected

### 5. Branch Management

**Decision: Push to same branch, no new PRs**

- Agent fixes issues and pushes to the existing PR branch
- GitHub Actions automatically re-run on new commits
- Preserves PR conversation and review comments
- Avoids PR proliferation

---

## Integration Points

### 1. Orchestrator

**File:** `packages/server/src/orchestrator/orchestrator.ts`

The orchestrator needs to:
- Start CI monitoring after PR creation
- Handle CI results (pass/fail/timeout)
- Generate CI feedback for agent remediation
- Track CI iteration count separately from build iterations

### 2. Run Executor

**File:** `packages/server/src/orchestrator/run-executor.ts`

After the VERIFYING phase creates a PR:
- Transition to CI_POLLING state
- Start workflow monitor
- Wait for CI completion
- On failure: transition to FEEDBACK with CI context
- On success: transition to SUCCEEDED

### 3. State Machine

**File:** `packages/server/src/orchestrator/state-machine.ts`

States already exist:
- `PR_CREATED` → `CI_POLLING_STARTED` → `CI_POLLING`
- `CI_POLLING` → `CI_PASSED` → `SUCCEEDED`
- `CI_POLLING` → `CI_FAILED` → `FEEDBACK`
- `CI_POLLING` → `CI_TIMEOUT` → `FAILED`

No state machine changes needed - only implementation.

### 4. Configuration

**File:** `packages/server/src/config/index.ts`

New configuration options:
- `AGENTGATE_CI_ENABLED`: Enable/disable CI monitoring
- `AGENTGATE_CI_POLL_INTERVAL_MS`: Polling interval (default 30000)
- `AGENTGATE_CI_TIMEOUT_MINUTES`: Max wait time (default 30)
- `AGENTGATE_CI_MAX_RETRIES`: Max CI remediation attempts (default 3)
- `AGENTGATE_CI_LOG_RETENTION`: Number of logs to keep (default 5)

### 5. GitHub Client

**File:** `packages/server/src/github/` (new module)

New GitHub operations:
- List workflow runs for a commit/branch
- Get workflow run status
- Download workflow run logs
- Parse log archive (zip format)

---

## Error Handling

### API Errors

| Error | Response |
|-------|----------|
| Rate limited | Back off exponentially, log warning |
| Network error | Retry with backoff |
| Auth error | Fail run with clear message |
| 404 (workflow not found) | Wait and retry (may not exist yet) |

### CI Errors

| Scenario | Response |
|----------|----------|
| CI never starts | Timeout after configured duration |
| CI cancelled externally | Treat as failure, include in feedback |
| Workflow not found | Check if repo has workflows, fail with message |
| Logs unavailable | Proceed with minimal feedback |

### Feedback Errors

| Scenario | Response |
|----------|----------|
| Log parsing fails | Include raw log snippet |
| Summary generation fails | Use raw error messages |
| Agent remediation fails | Count toward max iterations |

---

## Security Considerations

1. **Token Scope**: Requires `repo` and `actions` scopes
2. **Log Content**: Logs may contain secrets if workflow leaks them
3. **Rate Limiting**: Respect GitHub API limits
4. **Repo Access**: Only access repos the token has access to

---

## Performance Considerations

1. **Polling Overhead**: 30s interval = 2 API calls/minute per active PR
2. **Log Size**: Workflow logs can be 10-100MB compressed
3. **Memory**: Keep only parsed summaries in memory
4. **Concurrent PRs**: Each PR polls independently

---

## Testing Strategy

### Unit Tests

- Actions client: Mock Octokit responses
- Log parser: Real log samples
- Failure summarizer: Various failure patterns
- Workflow monitor: State transitions

### Integration Tests

- Full CI feedback loop with mock GitHub
- Timeout handling
- Retry logic
- Multiple concurrent PRs

### E2E Tests (Manual)

- Create PR that fails CI
- Verify feedback generated
- Verify agent fixes issue
- Verify CI passes on retry
