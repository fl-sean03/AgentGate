# 02: GitHub Actions API Integration

## Thrust 1: GitHub Actions Client

### 1.1 Objective

Create a typed client for GitHub Actions API operations needed for CI monitoring.

### 1.2 Background

GitHub Actions API provides endpoints for:
- Listing workflow runs for a repository
- Getting workflow run details
- Downloading workflow run logs

We need a thin wrapper around Octokit that:
- Provides typed responses
- Handles common error cases
- Supports the specific operations we need

### 1.3 Subtasks

#### 1.3.1 Create Actions Client Module

Create `packages/server/src/github/actions-client.ts`:

**Class: ActionsClient**

Constructor accepts:
- `owner`: Repository owner
- `repo`: Repository name
- `token`: GitHub personal access token

**Methods:**

1. `listWorkflowRuns(options)`: List workflow runs
   - Filter by branch, event, status
   - Return typed WorkflowRun array
   - Handle pagination if needed

2. `getWorkflowRun(runId)`: Get single run details
   - Return WorkflowRun with full details
   - Include jobs information

3. `getWorkflowRunJobs(runId)`: Get jobs for a run
   - Return array of Job objects
   - Include step information

4. `downloadWorkflowLogs(runId)`: Download logs
   - Return log content as string
   - Handle zip extraction internally
   - Throw if logs not available

5. `getWorkflowRunForCommit(sha)`: Find run for specific commit
   - Search runs by head_sha
   - Return most recent matching run

#### 1.3.2 Define Types

Create types in the module or in shared types:

**WorkflowRun:**
- id: number
- name: string
- head_branch: string
- head_sha: string
- status: 'queued' | 'in_progress' | 'completed' | 'waiting'
- conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null
- workflow_id: number
- html_url: string
- created_at: string
- updated_at: string
- run_attempt: number

**WorkflowJob:**
- id: number
- name: string
- status: 'queued' | 'in_progress' | 'completed'
- conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null
- started_at: string
- completed_at: string | null
- steps: WorkflowStep[]

**WorkflowStep:**
- name: string
- status: 'queued' | 'in_progress' | 'completed'
- conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null
- number: number

#### 1.3.3 Handle Errors

Wrap Octokit errors with meaningful messages:

- **404**: "Workflow run not found" or "Logs not available yet"
- **403**: "Rate limited" or "Insufficient permissions"
- **401**: "Invalid or expired token"
- **Network errors**: Wrap with retry hint

Create custom error class `ActionsApiError` with:
- Original error
- Status code
- Whether retryable

#### 1.3.4 Add Retry Logic

Implement retry with exponential backoff for:
- Network errors
- Rate limiting (429)
- Server errors (5xx)

Configuration:
- Max retries: 3
- Initial delay: 1000ms
- Backoff multiplier: 2

### 1.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Run `pnpm lint` - no warnings
3. Unit tests pass for all methods
4. Integration test with real GitHub repo (manual)

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/github/actions-client.ts` | Created |
| `packages/server/src/github/index.ts` | Created (exports) |
| `packages/server/test/actions-client.test.ts` | Created |

---

## Thrust 2: Workflow Run Monitor

### 2.1 Objective

Create a service that polls GitHub Actions for workflow run status and detects completion.

### 2.2 Background

After a PR is created, GitHub Actions workflows are triggered. We need to:
- Detect when workflows start
- Poll until completion
- Determine final status (success/failure)
- Handle timeout gracefully

### 2.3 Subtasks

#### 2.3.1 Create Workflow Monitor Module

Create `packages/server/src/github/workflow-monitor.ts`:

**Class: WorkflowMonitor**

Constructor accepts:
- `actionsClient`: ActionsClient instance
- `options`: MonitorOptions

**MonitorOptions:**
- `pollIntervalMs`: Polling interval (default 30000)
- `timeoutMs`: Maximum wait time (default 1800000 = 30 min)
- `onProgress`: Optional callback for status updates

**Methods:**

1. `waitForCompletion(branchOrSha, options)`: Wait for workflow to complete
   - Poll until all workflows complete
   - Return final status with details
   - Throw on timeout
   - Support cancellation via AbortSignal

2. `getLatestRunStatus(branchOrSha)`: Get current status
   - Return aggregate status of all workflows
   - Include individual workflow statuses

3. `cancel()`: Cancel monitoring
   - Stop polling
   - Clean up resources

#### 2.3.2 Implement Polling Logic

The polling algorithm:

1. **Initial Wait**: Wait 10 seconds for workflows to be detected
2. **Find Workflows**: Query for runs matching branch/SHA
3. **Track Runs**: Monitor all triggered workflow runs
4. **Poll Loop**:
   - Check status of all tracked runs
   - If any in_progress/queued, continue polling
   - If all completed, aggregate results
   - If timeout exceeded, throw TimeoutError
5. **Return Result**: MonitorResult with all run details

**Edge Cases:**
- No workflows configured: Treat as success (nothing to check)
- Workflows added after PR: Wait for detection
- Re-runs: Track latest attempt only
- Concurrent workflows: Wait for all to complete

#### 2.3.3 Define Monitor Result Type

**MonitorResult:**
- overallStatus: 'success' | 'failure' | 'timeout' | 'cancelled'
- runs: WorkflowRunResult[]
- durationMs: number
- timedOut: boolean

**WorkflowRunResult:**
- workflowName: string
- runId: number
- status: 'success' | 'failure' | 'cancelled' | 'skipped'
- url: string
- failedJobs: FailedJobInfo[]

**FailedJobInfo:**
- jobName: string
- failedStep: string
- conclusion: string

#### 2.3.4 Implement Progress Reporting

The monitor should emit progress events:

- `workflow_detected`: New workflow run found
- `workflow_status_changed`: Status update
- `polling`: Regular heartbeat with current status
- `completed`: Final result available

Progress callback receives:
- `event`: Event type
- `data`: Event-specific data
- `elapsed`: Time since monitoring started

#### 2.3.5 Handle Concurrent Workflows

GitHub repos often have multiple workflows:
- CI workflow (tests, lint, build)
- Security scanning
- Deploy preview
- etc.

Strategy:
- Track ALL workflows triggered by the commit
- Consider overall success only when ALL pass
- Report all failures in the result

### 2.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Run `pnpm lint` - no warnings
3. Unit tests pass with mocked ActionsClient
4. Test timeout behavior
5. Test cancellation behavior
6. Test with multiple concurrent workflows (mock)

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/github/workflow-monitor.ts` | Created |
| `packages/server/src/github/index.ts` | Modified (add export) |
| `packages/server/test/workflow-monitor.test.ts` | Created |

---

## Testing Requirements

### Actions Client Tests

Test each API method with mocked Octokit:

1. `listWorkflowRuns` - various filters
2. `getWorkflowRun` - success and 404
3. `getWorkflowRunJobs` - with steps
4. `downloadWorkflowLogs` - success and unavailable
5. `getWorkflowRunForCommit` - found and not found
6. Error handling - rate limit, auth, network
7. Retry logic - verify backoff

### Workflow Monitor Tests

Test monitoring scenarios:

1. Single workflow - success
2. Single workflow - failure
3. Multiple workflows - all pass
4. Multiple workflows - one fails
5. Timeout - no completion
6. Cancellation - abort signal
7. No workflows - immediate success
8. Delayed workflow detection
9. Re-run handling

---

## API Reference

### GitHub Actions API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/repos/{owner}/{repo}/actions/runs` | GET | List workflow runs |
| `/repos/{owner}/{repo}/actions/runs/{run_id}` | GET | Get run details |
| `/repos/{owner}/{repo}/actions/runs/{run_id}/jobs` | GET | Get run jobs |
| `/repos/{owner}/{repo}/actions/runs/{run_id}/logs` | GET | Download logs |

### Rate Limits

- Authenticated: 5000 requests/hour
- Each poll cycle: ~2-3 requests (list + details)
- 30-second interval: 120 requests/hour per PR
- Safe margin for dozens of concurrent PRs

### Required Token Scopes

- `repo`: Access to repository
- `actions`: Access to Actions API (implied by `repo` for private repos)
