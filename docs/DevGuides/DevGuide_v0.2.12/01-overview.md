# 01: Overview

## Current State

AgentGate currently creates PRs on GitHub but has no visibility into CI status:

1. **No CI awareness**: Agent completes, PR is created, but CI might fail
2. **Manual intervention**: User must check GitHub for CI failures
3. **Context lost**: When CI fails, agent context is already gone
4. **No remediation**: Agent cannot fix issues it caused

## Target State

Automated CI feedback loop with agent-driven remediation:

1. **CI monitoring**: Track workflow runs for PRs we create
2. **Failure detection**: Parse logs to extract actionable errors
3. **Context preservation**: Keep agent session for remediation
4. **Automatic retry**: Feed failures back for agent to fix
5. **Iteration tracking**: Limit retries to prevent loops

---

## Integration Points

### With Run Executor

The run executor currently:
1. Executes agent with task prompt
2. Runs verification (L0-L3)
3. Creates PR on success
4. Marks run complete

New flow:
1. Execute agent with task prompt
2. Run verification (L0-L3)
3. Create PR on success
4. **Monitor CI workflow**
5. **If CI fails: parse logs, create remediation prompt**
6. **Re-execute agent with remediation context**
7. **Push to same branch (force push or new commit)**
8. **Repeat until CI passes or max retries**
9. Mark run complete

### With Agent Driver

The remediation prompt must be passed to the same agent session:
- Use `--resume` with session ID to continue conversation
- Provide structured failure information
- Let agent decide how to fix

### With WebSocket Broadcaster

Emit new event types for CI status:
- `ci_workflow_started`: CI kicked off
- `ci_workflow_completed`: CI finished (pass/fail)
- `ci_remediation_started`: Agent is fixing CI failures
- `ci_remediation_attempt`: Attempt number and context

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Run Executor                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   1. Agent executes task                                             │
│   2. Verification passes                                             │
│   3. PR created → prUrl, branchName                                  │
│      │                                                               │
│      ▼                                                               │
│   4. Start CI monitoring loop                                        │
│      │                                                               │
│      └──► WorkflowMonitor.waitForCompletion(owner, repo, pr)        │
│           │                                                          │
│           ├─► Poll: GET /repos/{owner}/{repo}/actions/runs          │
│           │   Filter: head_sha matches PR head                       │
│           │                                                          │
│           └─► Returns: WorkflowRunResult                             │
│               │                                                      │
│               ├── status: 'success' ──► Run complete!                │
│               │                                                      │
│               └── status: 'failure' ──► 5. Download logs             │
│                   │                                                  │
│                   └──► LogDownloader.download(run)                   │
│                        │                                             │
│                        └──► Returns: raw log text                    │
│                             │                                        │
│                             ▼                                        │
│                        6. Parse logs                                 │
│                        LogParser.parse(logs)                         │
│                        │                                             │
│                        └──► Returns: CIFailure[]                     │
│                             │                                        │
│                             ▼                                        │
│                        7. Generate remediation prompt                │
│                        FailureSummarizer.summarize(failures)         │
│                        │                                             │
│                        └──► Returns: remediationPrompt               │
│                             │                                        │
│                             ▼                                        │
│                        8. Resume agent with remediation context      │
│                        AgentDriver.execute({                         │
│                          prompt: remediationPrompt,                  │
│                          sessionId: originalSessionId                │
│                        })                                            │
│                        │                                             │
│                        └──► Loop back to step 3                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Failure Categories

### Build Failures

- TypeScript compilation errors
- Missing dependencies
- Import/export mismatches

### Lint Failures

- ESLint errors
- Prettier formatting issues
- Type checking errors

### Test Failures

- Jest/Vitest assertion failures
- Test timeouts
- Coverage thresholds not met

### Other Failures

- Docker build failures
- E2E test failures
- Custom validation scripts

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTGATE_CI_ENABLED` | `true` | Enable CI monitoring |
| `AGENTGATE_MAX_CI_RETRIES` | `3` | Max remediation attempts |
| `AGENTGATE_CI_POLL_INTERVAL_MS` | `30000` | Poll interval (30s) |
| `AGENTGATE_CI_TIMEOUT_MS` | `1800000` | Max wait time (30min) |
| `AGENTGATE_CI_LOG_MAX_SIZE` | `5242880` | Max log size (5MB) |

### Work Order Options

The `verify.yaml` already has `useGitHubCI: true` option from v0.2.10 Thrust 16.

This DevGuide implements the actual monitoring and remediation.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| CI pass rate after 1 remediation | > 60% |
| CI pass rate after 3 remediations | > 85% |
| Average CI check time | < 5 minutes |
| Log parsing accuracy | > 90% |
| False positive rate | < 5% |
