# 05: Appendices

## A. Work Order Prompts

### Thrusts 1-2: GitHub Actions Client & Workflow Monitor

```
Implement Thrusts 1-2 from DevGuide v0.2.12 (GitHub Actions Client & Workflow Monitor).

READ docs/DevGuides/DevGuide_v0.2.12/02-github-api.md for specifications.

## Thrust 1: GitHub Actions Client

1. Create `packages/server/src/github/actions-client.ts`:
   - ActionsClient class wrapping Octokit
   - listWorkflowRuns method with filters
   - getWorkflowRun method for single run
   - getWorkflowRunJobs method
   - downloadWorkflowLogs method (handles zip)
   - getWorkflowRunForCommit method
   - ActionsApiError custom error class
   - Retry logic with exponential backoff

2. Create `packages/server/src/github/index.ts`:
   - Export ActionsClient
   - Export types

## Thrust 2: Workflow Monitor

3. Create `packages/server/src/github/workflow-monitor.ts`:
   - WorkflowMonitor class
   - waitForCompletion method (polls until done)
   - getLatestRunStatus method
   - cancel method with cleanup
   - Progress callback support
   - MonitorResult type with all details
   - Handle multiple concurrent workflows
   - Timeout handling

4. Create tests:
   - `packages/server/test/actions-client.test.ts`
   - `packages/server/test/workflow-monitor.test.ts`

## Validation

- pnpm typecheck
- pnpm lint
- pnpm test

Create a PR with title: "feat: add GitHub Actions client and workflow monitor (v0.2.12 Thrusts 1-2)"
```

### Thrusts 3-4: Log Parser & Failure Summarizer

```
Implement Thrusts 3-4 from DevGuide v0.2.12 (Log Parser & Failure Summarizer).

READ docs/DevGuides/DevGuide_v0.2.12/03-ci-monitor.md for specifications.

## Thrust 3: Log Parser

1. Create `packages/server/src/github/log-downloader.ts`:
   - LogDownloader class
   - downloadLogs method (fetches and extracts zip)
   - getLogsForJob method
   - Handle zip extraction in memory

2. Create `packages/server/src/github/log-parser.ts`:
   - LogParser class
   - parse method (identify steps, timestamps)
   - findFailures method
   - extractErrorContext method
   - ANSI code stripping
   - Handle common failure patterns (vitest, TypeScript, ESLint)

## Thrust 4: Failure Summarizer

3. Create `packages/server/src/github/failure-summarizer.ts`:
   - FailureSummarizer class
   - summarize method (aggregate all failures)
   - summarizeJob method
   - generateActionItems method
   - formatAsMarkdown method
   - Error categorization (test, lint, typecheck, build)
   - Smart truncation for large logs
   - Deduplication of repeated errors

4. Update `packages/server/src/github/index.ts`:
   - Export all new classes

5. Create tests:
   - `packages/server/test/log-parser.test.ts`
   - `packages/server/test/failure-summarizer.test.ts`

## Validation

- pnpm typecheck
- pnpm lint
- pnpm test

Create a PR with title: "feat: add CI log parser and failure summarizer (v0.2.12 Thrusts 3-4)"
```

### Thrusts 5-6: Integration & Configuration

```
Implement Thrusts 5-6 from DevGuide v0.2.12 (CI Feedback Integration & Configuration).

READ docs/DevGuides/DevGuide_v0.2.12/04-feedback-loop.md for specifications.

## Thrust 5: CI Feedback Integration

1. Create `packages/server/src/orchestrator/ci-feedback.ts`:
   - CIFeedbackGenerator class
   - generateFeedback method
   - formatForAgent method
   - CIFeedback type definition

2. Update `packages/server/src/orchestrator/run-executor.ts`:
   - Add CI polling phase after PR creation
   - Handle CI success → SUCCEEDED
   - Handle CI failure → FEEDBACK with CI context
   - Track ciIterationCount separately
   - Check maxCiIterations limit

3. Update `packages/server/src/orchestrator/orchestrator.ts`:
   - Initialize CI components
   - Wire CI feedback to agent remediation
   - Pass CI feedback to build phase

4. Update `packages/server/src/types/run.ts`:
   - Add ciIterationCount field
   - Add maxCiIterations field
   - Add ciStatus field
   - Add lastCiResult field
   - Add ciWorkflowUrl field

## Thrust 6: Configuration & Dashboard

5. Update `packages/server/src/config/index.ts`:
   - Add AGENTGATE_CI_ENABLED
   - Add AGENTGATE_CI_POLL_INTERVAL_MS
   - Add AGENTGATE_CI_TIMEOUT_MS
   - Add AGENTGATE_CI_MAX_ITERATIONS
   - Add validation

6. Update `packages/server/src/server/routes/health.ts`:
   - Include CI config in response
   - Include active polling count

7. Update WebSocket types and broadcaster:
   - Add ci_polling_started event
   - Add ci_status_update event
   - Add ci_completed event

8. Create `packages/dashboard/src/components/CIStatusPanel.tsx`:
   - Status indicator (running/passed/failed)
   - Workflow link
   - Elapsed time
   - Failure summary display
   - Iteration count

9. Update `packages/dashboard/src/components/WorkOrderDetail.tsx`:
   - Include CIStatusPanel when CI is active
   - Show CI completion status

10. Create tests:
    - `packages/server/test/ci-feedback.test.ts`

## Validation

- pnpm typecheck
- pnpm lint
- pnpm test

Create a PR with title: "feat: implement CI feedback loop integration (v0.2.12 Thrusts 5-6)"
```

---

## B. Implementation Checklist

### Thrust 1: GitHub Actions Client
- [ ] ActionsClient class created
- [ ] listWorkflowRuns method implemented
- [ ] getWorkflowRun method implemented
- [ ] getWorkflowRunJobs method implemented
- [ ] downloadWorkflowLogs method implemented
- [ ] getWorkflowRunForCommit method implemented
- [ ] ActionsApiError class created
- [ ] Retry logic implemented
- [ ] Types defined (WorkflowRun, WorkflowJob, WorkflowStep)
- [ ] index.ts exports
- [ ] Unit tests written
- [ ] All tests pass

### Thrust 2: Workflow Monitor
- [ ] WorkflowMonitor class created
- [ ] waitForCompletion method implemented
- [ ] getLatestRunStatus method implemented
- [ ] cancel method implemented
- [ ] Progress callback support
- [ ] MonitorResult type defined
- [ ] Multiple workflow handling
- [ ] Timeout handling
- [ ] Cancellation via AbortSignal
- [ ] Unit tests written
- [ ] All tests pass

### Thrust 3: CI Log Parser
- [ ] LogDownloader class created
- [ ] downloadLogs method (zip extraction)
- [ ] getLogsForJob method
- [ ] LogParser class created
- [ ] parse method implemented
- [ ] findFailures method implemented
- [ ] extractErrorContext method implemented
- [ ] ANSI code stripping
- [ ] Vitest pattern detection
- [ ] TypeScript error pattern
- [ ] ESLint pattern detection
- [ ] Unit tests with sample logs
- [ ] All tests pass

### Thrust 4: Failure Summarizer
- [ ] FailureSummarizer class created
- [ ] summarize method implemented
- [ ] summarizeJob method implemented
- [ ] generateActionItems method implemented
- [ ] Error categorization
- [ ] Markdown formatting
- [ ] Smart truncation
- [ ] Deduplication logic
- [ ] ActionItem type defined
- [ ] Unit tests written
- [ ] All tests pass

### Thrust 5: CI Feedback Integration
- [ ] CIFeedbackGenerator class created
- [ ] generateFeedback method implemented
- [ ] formatForAgent method implemented
- [ ] run-executor.ts CI polling phase
- [ ] CI success handling
- [ ] CI failure handling
- [ ] ciIterationCount tracking
- [ ] maxCiIterations check
- [ ] orchestrator.ts wiring
- [ ] Run type updated
- [ ] Integration tests written
- [ ] All tests pass

### Thrust 6: Configuration & Dashboard
- [ ] CI config variables added
- [ ] Config validation
- [ ] Health endpoint updated
- [ ] WebSocket CI events added
- [ ] Broadcaster updated
- [ ] CIStatusPanel component created
- [ ] WorkOrderDetail updated
- [ ] Dashboard typecheck passes
- [ ] Dashboard lint passes
- [ ] All tests pass

---

## C. File Reference

### New Files

| File | Purpose |
|------|---------|
| `packages/server/src/github/actions-client.ts` | GitHub Actions API wrapper |
| `packages/server/src/github/workflow-monitor.ts` | Poll workflow runs |
| `packages/server/src/github/log-downloader.ts` | Download workflow logs |
| `packages/server/src/github/log-parser.ts` | Parse log format |
| `packages/server/src/github/failure-summarizer.ts` | Summarize failures |
| `packages/server/src/github/index.ts` | Module exports |
| `packages/server/src/orchestrator/ci-feedback.ts` | CI feedback generation |
| `packages/dashboard/src/components/CIStatusPanel.tsx` | CI status display |
| `packages/server/test/actions-client.test.ts` | Unit tests |
| `packages/server/test/workflow-monitor.test.ts` | Unit tests |
| `packages/server/test/log-parser.test.ts` | Unit tests |
| `packages/server/test/failure-summarizer.test.ts` | Unit tests |
| `packages/server/test/ci-feedback.test.ts` | Integration tests |

### Modified Files

| File | Changes |
|------|---------|
| `packages/server/src/orchestrator/run-executor.ts` | CI polling phase |
| `packages/server/src/orchestrator/orchestrator.ts` | CI feedback wiring |
| `packages/server/src/types/run.ts` | CI fields |
| `packages/server/src/config/index.ts` | CI configuration |
| `packages/server/src/server/routes/health.ts` | CI status |
| `packages/server/src/server/websocket/types.ts` | CI events |
| `packages/server/src/server/websocket/broadcaster.ts` | CI event emission |
| `packages/dashboard/src/components/WorkOrderDetail.tsx` | CI panel |

---

## D. Configuration Reference

### Environment Variables

| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `AGENTGATE_CI_ENABLED` | `true` | boolean | Enable CI monitoring |
| `AGENTGATE_CI_POLL_INTERVAL_MS` | `30000` | 5000-300000 | Polling interval |
| `AGENTGATE_CI_TIMEOUT_MS` | `1800000` | 60000-7200000 | Max wait time |
| `AGENTGATE_CI_MAX_ITERATIONS` | `3` | 1-10 | Max CI remediation attempts |
| `AGENTGATE_CI_SKIP_IF_NO_WORKFLOWS` | `true` | boolean | Skip if no workflows |
| `AGENTGATE_CI_LOG_RETENTION_COUNT` | `5` | 1-20 | Logs to keep per run |

### GitHub Token Requirements

Required scopes:
- `repo` - Access to repository
- `actions` - Access to Actions API (implied by `repo`)

### WebSocket Events

| Event | Payload |
|-------|---------|
| `ci_polling_started` | workOrderId, runId, prNumber, workflowRunId |
| `ci_status_update` | workOrderId, runId, status, conclusion |
| `ci_completed` | workOrderId, runId, conclusion, summary, ciIterationCount, workflowUrl |

---

## E. State Machine Reference

### States

| State | Description |
|-------|-------------|
| `PR_CREATED` | PR created, waiting to start CI |
| `CI_POLLING` | Actively polling GitHub Actions |
| `FEEDBACK` | Generating feedback (local or CI) |

### Events

| Event | From | To |
|-------|------|-----|
| `CI_POLLING_STARTED` | PR_CREATED | CI_POLLING |
| `CI_PASSED` | CI_POLLING | SUCCEEDED |
| `CI_FAILED` | CI_POLLING | FEEDBACK |
| `CI_TIMEOUT` | CI_POLLING | FAILED |

### Transitions

```
VERIFYING
    │
    ├─ VERIFY_PASSED ──────────────────────────────────→ SUCCEEDED
    │                                                    (if CI disabled)
    │
    └─ PR_CREATED ──────→ PR_CREATED
                              │
                              ↓ CI_POLLING_STARTED
                         CI_POLLING ←───────────────────┐
                              │                         │
                              ├─ CI_PASSED ──→ SUCCEEDED│
                              │                         │
                              ├─ CI_FAILED ──→ FEEDBACK │
                              │                    │    │
                              │                    ↓    │
                              │               BUILDING  │
                              │                    │    │
                              │                    ↓    │
                              │               PR_CREATED─┘
                              │
                              └─ CI_TIMEOUT ──→ FAILED
```

---

## F. Error Codes

| Code | Description | Recovery |
|------|-------------|----------|
| `CI_TIMEOUT` | CI exceeded max wait time | Increase timeout or investigate slow CI |
| `CI_MAX_ITERATIONS` | Exceeded max CI retry attempts | Manual intervention needed |
| `CI_LOG_UNAVAILABLE` | Could not download logs | Minimal feedback, continue |
| `CI_PARSE_ERROR` | Could not parse logs | Raw log snippet provided |
| `GITHUB_RATE_LIMITED` | API rate limit hit | Back off and retry |
| `GITHUB_AUTH_ERROR` | Token invalid or expired | Check token configuration |

---

## G. Testing with Mock GitHub

### Mock Server Setup

For integration tests, create mock responses:

**List Workflow Runs:**
```json
{
  "workflow_runs": [
    {
      "id": 123456,
      "name": "CI",
      "status": "completed",
      "conclusion": "failure",
      "head_sha": "abc123"
    }
  ]
}
```

**Workflow Jobs:**
```json
{
  "jobs": [
    {
      "id": 789,
      "name": "Tests",
      "status": "completed",
      "conclusion": "failure",
      "steps": [
        { "name": "Run tests", "conclusion": "failure" }
      ]
    }
  ]
}
```

### Sample Log Content

Store sample logs in `packages/server/test/fixtures/ci-logs/`:
- `vitest-failure.log`
- `typescript-errors.log`
- `eslint-errors.log`
- `build-failure.log`
- `success.log`
