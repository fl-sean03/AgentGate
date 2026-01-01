# 04: Orchestrator Integration and Configuration

## Thrust 5: CI Feedback Integration

### 5.1 Objective

Connect the CI monitoring system to the orchestrator's feedback loop so CI failures trigger agent remediation.

### 5.2 Background

The orchestrator already has:
- State machine with CI_POLLING state
- Feedback loop for local verification failures
- PR creation after successful verification

What's needed:
- Start CI monitoring after PR creation
- Handle CI results
- Generate feedback from CI failures
- Track CI iteration count
- Resume agent with CI feedback

### 5.3 Subtasks

#### 5.3.1 Create CI Feedback Module

Create `packages/server/src/orchestrator/ci-feedback.ts`:

**Class: CIFeedbackGenerator**

Constructor accepts:
- `workflowMonitor`: WorkflowMonitor
- `logDownloader`: LogDownloader
- `failureSummarizer`: FailureSummarizer

**Methods:**

1. `generateFeedback(monitorResult)`: Create agent feedback
   - Download logs for failed jobs
   - Parse and summarize failures
   - Format as agent prompt
   - Return CIFeedback object

2. `formatForAgent(summary)`: Format feedback for agent
   - Create markdown prompt
   - Include file references
   - Add fix instructions
   - Return string

**CIFeedback Object:**
- type: 'ci_failure'
- workflowRunId: number
- prNumber: number
- summary: CISummary
- prompt: string (formatted for agent)
- previousAttempts: number

#### 5.3.2 Modify Run Executor for CI Phase

Update `packages/server/src/orchestrator/run-executor.ts`:

**Add after PR_CREATED state:**

1. Start CI monitoring with WorkflowMonitor
2. Wait for completion or timeout
3. On success:
   - Transition to SUCCEEDED
   - Mark run complete
4. On failure:
   - Download logs
   - Generate CI feedback
   - Increment CI iteration count
   - Check if max CI iterations exceeded
   - If exceeded: transition to FAILED
   - If not: transition to FEEDBACK with CI context

**New fields on Run:**
- ciIterationCount: number
- maxCiIterations: number
- lastCiFeedback: CIFeedback | null
- ciStartedAt: Date | null

#### 5.3.3 Modify Orchestrator for CI Flow

Update `packages/server/src/orchestrator/orchestrator.ts`:

**Add CI-specific logic:**

1. After PR creation, start CI polling
2. Pass CI feedback to agent on remediation
3. Agent pushes to same branch
4. New commit triggers new CI run
5. Monitor new CI run

**Key difference from local feedback:**
- Don't re-run local verification on CI failure
- Agent should only fix CI-specific issues
- Push triggers new PR checks automatically

#### 5.3.4 Update State Machine Transitions

The state machine already has the transitions, but verify:

**PR_CREATED:**
- CI_POLLING_STARTED → CI_POLLING

**CI_POLLING:**
- CI_PASSED → SUCCEEDED
- CI_FAILED → FEEDBACK
- CI_TIMEOUT → FAILED
- USER_CANCELED → CANCELED
- SYSTEM_ERROR → FAILED

**FEEDBACK (from CI):**
- FEEDBACK_GENERATED → BUILDING (with CI context)

#### 5.3.5 Handle CI Feedback in Build Phase

When the agent starts a new iteration after CI feedback:

1. Include CI failure summary in prompt
2. Tell agent to push to same branch
3. Don't create new PR
4. Agent should:
   - Read the CI feedback
   - Fix the identified issues
   - Run local tests
   - Commit and push to existing branch

**Modified prompt structure:**

```markdown
## Previous CI Failure

Your last commit triggered GitHub Actions CI but it failed.

{CI_FAILURE_SUMMARY}

## Instructions

1. Fix the issues identified above
2. Run `pnpm test` locally to verify
3. Commit your fixes
4. Push to the branch: {BRANCH_NAME}

Do NOT create a new PR. Push to the existing branch to trigger new CI checks.
```

#### 5.3.6 Track CI Iterations Separately

CI iterations are separate from build iterations:

**Build iteration:**
- Local code changes
- Local verification
- Incremented when agent makes changes

**CI iteration:**
- CI runs after PR/push
- CI failure → feedback → fix → push
- Incremented when CI fails and agent remediates

**Max limits:**
- Max build iterations: 5 (default)
- Max CI iterations: 3 (default)
- Total can exceed sum if build succeeds quickly

### 5.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Run `pnpm lint` - no warnings
3. Integration tests with mock GitHub API
4. Test CI success path
5. Test CI failure → feedback → fix path
6. Test max CI iterations exceeded
7. Test CI timeout

### 5.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/orchestrator/ci-feedback.ts` | Created |
| `packages/server/src/orchestrator/run-executor.ts` | Modified |
| `packages/server/src/orchestrator/orchestrator.ts` | Modified |
| `packages/server/src/types/run.ts` | Modified |
| `packages/server/test/ci-feedback.test.ts` | Created |

---

## Thrust 6: Configuration and Dashboard

### 6.1 Objective

Add configuration options for CI monitoring and surface CI status in the dashboard.

### 6.2 Background

Users need to:
- Enable/disable CI monitoring
- Configure polling intervals and timeouts
- Set max retry limits
- See CI status in the dashboard
- Debug CI feedback issues

### 6.3 Subtasks

#### 6.3.1 Add CI Configuration

Update `packages/server/src/config/index.ts`:

**New environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTGATE_CI_ENABLED` | `true` | Enable CI monitoring |
| `AGENTGATE_CI_POLL_INTERVAL_MS` | `30000` | Polling interval |
| `AGENTGATE_CI_TIMEOUT_MS` | `1800000` | Max CI wait time (30 min) |
| `AGENTGATE_CI_MAX_ITERATIONS` | `3` | Max CI remediation attempts |
| `AGENTGATE_CI_SKIP_IF_NO_WORKFLOWS` | `true` | Skip CI check if no workflows |
| `AGENTGATE_CI_LOG_RETENTION_COUNT` | `5` | CI logs to keep per run |

**Validation:**
- Poll interval: 5000-300000 ms
- Timeout: 60000-7200000 ms (1 min - 2 hours)
- Max iterations: 1-10

#### 6.3.2 Add CI Configuration to Zod Schema

Extend the existing config schema:

**CIConfig shape:**
- enabled: boolean
- pollIntervalMs: number
- timeoutMs: number
- maxIterations: number
- skipIfNoWorkflows: boolean
- logRetentionCount: number

**Include in main config:**
- ci: CIConfig

#### 6.3.3 Update Health Endpoint

Update `packages/server/src/server/routes/health.ts`:

**Add CI status to health response:**

```json
{
  "status": "healthy",
  "version": "0.2.12",
  "config": {
    "ci": {
      "enabled": true,
      "pollIntervalMs": 30000,
      "timeoutMs": 1800000,
      "maxIterations": 3
    }
  },
  "activePolling": {
    "count": 2,
    "workOrders": ["wo-123", "wo-456"]
  }
}
```

#### 6.3.4 Update Run Types

Add CI-related fields to Run type:

**New fields:**
- ciEnabled: boolean
- ciIterationCount: number
- maxCiIterations: number
- ciStatus: 'pending' | 'polling' | 'passed' | 'failed' | 'timeout' | null
- lastCiResult: CISummary | null
- ciPollingStartedAt: Date | null
- ciCompletedAt: Date | null
- ciWorkflowUrl: string | null

#### 6.3.5 Update Dashboard Work Order Detail

Update `packages/dashboard/src/components/WorkOrderDetail.tsx`:

**Add CI status section:**

When run is in CI_POLLING state:
- Show "CI Checks Running" indicator
- Display elapsed time
- Link to GitHub Actions page

When CI completes:
- Show pass/fail status
- If failed, show summary of failures
- Show CI iteration count

**New component: CIStatusPanel**
- Status indicator (running/passed/failed)
- Workflow run link
- Elapsed time / completion time
- Failure summary (if applicable)
- CI iteration count (X of 3)

#### 6.3.6 Add CI Events to WebSocket

Update WebSocket events for CI status:

**New event types:**

`ci_polling_started`:
- workOrderId
- runId
- prNumber
- workflowRunId

`ci_status_update`:
- workOrderId
- runId
- status: 'in_progress' | 'completed'
- conclusion: 'success' | 'failure' | null

`ci_completed`:
- workOrderId
- runId
- conclusion: 'success' | 'failure' | 'timeout'
- summary: CISummary (if failure)
- ciIterationCount
- workflowUrl

### 6.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Run `pnpm lint` - no warnings
3. Health endpoint includes CI config
4. Dashboard shows CI status
5. WebSocket emits CI events
6. Configuration validates correctly

### 6.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/config/index.ts` | Modified |
| `packages/server/src/server/routes/health.ts` | Modified |
| `packages/server/src/types/run.ts` | Modified |
| `packages/server/src/server/websocket/types.ts` | Modified |
| `packages/server/src/server/websocket/broadcaster.ts` | Modified |
| `packages/dashboard/src/components/WorkOrderDetail.tsx` | Modified |
| `packages/dashboard/src/components/CIStatusPanel.tsx` | Created |

---

## Full Flow Example

### Scenario: Agent creates PR that fails CI

1. **Build Phase**
   - Agent implements feature
   - Local tests pass
   - Creates PR

2. **CI Polling Phase**
   - State: PR_CREATED → CI_POLLING
   - WorkflowMonitor starts polling
   - Dashboard shows "CI Checks Running"

3. **CI Fails**
   - Workflow completes with failure
   - LogDownloader fetches logs
   - LogParser extracts failures
   - FailureSummarizer creates summary

4. **Feedback Phase**
   - State: CI_POLLING → FEEDBACK
   - CIFeedbackGenerator creates prompt
   - ciIterationCount incremented

5. **Remediation**
   - State: FEEDBACK → BUILDING
   - Agent receives CI feedback
   - Agent fixes issues
   - Agent pushes to same branch

6. **New CI Run**
   - GitHub detects new commit
   - CI runs again
   - State: PR_CREATED → CI_POLLING

7. **CI Passes**
   - Workflow completes successfully
   - State: CI_POLLING → SUCCEEDED
   - Dashboard shows "CI Passed"
   - PR ready for review/merge

---

## Integration Testing

### Mock GitHub API

Create mock server that simulates:
- Workflow runs list
- Workflow run status
- Log download
- Status transitions over time

### Test Scenarios

1. **Happy path**: CI passes on first try
2. **Single failure**: CI fails, agent fixes, CI passes
3. **Multiple failures**: Multiple CI iterations
4. **Max iterations**: Exceed max, run fails
5. **Timeout**: CI takes too long
6. **No workflows**: Repo has no CI configured
7. **Concurrent PRs**: Multiple runs polling simultaneously

---

## Thrust 7: Draft PR Until Verified

### 7.1 Objective

Implement a "Draft PR until verified" workflow where PRs are created as drafts initially and only converted to "Ready for Review" after CI verification passes.

### 7.2 Background

Previously, PRs were created as ready for review immediately after local verification passed. This caused issues:
- PRs could have failing CI checks when reviewers looked at them
- Failed work orders still created reviewable PRs
- No clear signal of CI verification status

**Solution:**
- Create all PRs as drafts initially (`draft: true`)
- After CI passes, convert the draft to "Ready for Review"
- If CI fails, PR remains as draft until remediation succeeds

### 7.3 Implementation

#### 7.3.1 GitHub API for Draft Conversion

GitHub's REST API doesn't have a direct endpoint to convert drafts to ready. Use GraphQL:

```graphql
mutation($pullRequestId: ID!) {
  markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
    pullRequest {
      number
      url
      title
      state
      headRefName
      baseRefName
      isDraft
    }
  }
}
```

#### 7.3.2 New Function: convertDraftToReady

Added to `packages/server/src/workspace/github.ts`:

```typescript
export async function convertDraftToReady(
  client: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<GitHubPullRequest>
```

**Behavior:**
- Uses GraphQL API to mark PR ready for review
- Returns updated PR metadata with `draft: false`
- Handles "not a draft" error gracefully (returns current state)
- Throws on 404 (PR not found) or 422 (validation error)

#### 7.3.3 Orchestrator Changes

Modified `packages/server/src/orchestrator/orchestrator.ts`:

1. **PR Creation**: Changed `draft: false` to `draft: true`
2. **CI Polling**: After `ciStatus.allPassed`, call `convertDraftToReady`
3. **Error Handling**: Log warning if conversion fails, but don't fail the run

#### 7.3.4 Type Updates

Added `draft` field to `GitHubPullRequest` schema:

```typescript
export const gitHubPullRequestSchema = z.object({
  // ... existing fields
  draft: z.boolean().default(false),
});
```

### 7.4 Flow

```
1. Local verification passes
2. PR created as DRAFT
3. CI polling begins
4. CI passes → convertDraftToReady() → PR is READY FOR REVIEW
   CI fails → PR remains DRAFT → feedback loop → agent remediates
5. After remediation, push to same branch triggers new CI
6. Repeat until CI passes or max iterations
```

### 7.5 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Run `pnpm test` - all tests pass
3. Create work order with GitHub workspace and `waitForCI: true`
4. Verify PR is created as draft
5. Verify PR converts to ready after CI passes
6. Verify failed CI leaves PR as draft

### 7.6 Files Modified

| File | Changes |
|------|---------|
| `packages/server/src/types/github.ts` | Added `draft` field to PR schema |
| `packages/server/src/workspace/github.ts` | Added `convertDraftToReady` function, updated return types |
| `packages/server/src/orchestrator/orchestrator.ts` | Create draft PRs, convert after CI passes |
