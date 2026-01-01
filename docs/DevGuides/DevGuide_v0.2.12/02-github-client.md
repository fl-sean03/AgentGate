# 02: GitHub Actions Client

## Thrust 1: GitHub Actions Client

### 1.1 Objective

Create a GitHub Actions API client for interacting with workflow runs.

### 1.2 Background

The GitHub Actions API provides endpoints for:
- Listing workflow runs
- Getting workflow run details
- Downloading workflow logs
- Re-running workflows

We need a type-safe client that wraps these endpoints.

### 1.3 Subtasks

#### 1.3.1 Create Actions Client

Create `packages/server/src/github/actions-client.ts`:

**Class structure:**

The client should wrap the Octokit API:
- Constructor takes Octokit instance or creates one from GITHUB_TOKEN
- Methods for each required operation
- Proper error handling and logging

**Required methods:**

1. `listWorkflowRuns(owner, repo, options?)`: List runs with optional filters
   - Filter by branch, event, status
   - Support pagination
   - Return typed response

2. `getWorkflowRun(owner, repo, runId)`: Get single run details
   - Return full run data including jobs

3. `listJobsForRun(owner, repo, runId)`: Get jobs in a workflow run
   - Return job list with steps

4. `downloadLogs(owner, repo, runId)`: Download run logs
   - Returns raw log text
   - Handles large logs (streaming)

5. `getRunForPR(owner, repo, prNumber)`: Find workflow run for a PR
   - Match by head SHA
   - Return most recent matching run

#### 1.3.2 Create Module Index

Create `packages/server/src/github/index.ts` to export the client and related utilities.

### 1.4 Verification Steps

1. Client instantiates with GITHUB_TOKEN
2. Can list workflow runs for a repo
3. Can get workflow run details
4. Can download workflow logs
5. Error handling works for 404s
6. Rate limiting is respected

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/github/actions-client.ts` | Created |
| `packages/server/src/github/index.ts` | Created |

---

## Thrust 2: Workflow Types

### 2.1 Objective

Define TypeScript types for GitHub Actions workflow data.

### 2.2 Background

Strong typing ensures:
- API responses are properly typed
- Consumer code is type-safe
- Refactoring is safer
- Documentation through types

### 2.3 Subtasks

#### 2.3.1 Create Workflow Types

Create `packages/shared/src/types/github-actions.ts`:

**Workflow Run:**
- id, name, status, conclusion
- head_sha, head_branch
- created_at, updated_at
- jobs_url, logs_url

**Workflow Job:**
- id, name, status, conclusion
- started_at, completed_at
- steps[]

**Workflow Step:**
- name, status, conclusion
- number
- started_at, completed_at

**CI Failure:**
- type: 'build' | 'lint' | 'test' | 'other'
- job: string
- step: string
- message: string
- file?: string
- line?: number
- context: string[] (surrounding lines)

**CI Result:**
- status: 'success' | 'failure' | 'cancelled' | 'pending'
- runId: number
- runUrl: string
- failures: CIFailure[]
- duration: number
- jobs: WorkflowJob[]

#### 2.3.2 Export Types

Update `packages/shared/src/types/index.ts` to export new types.

### 2.4 Verification Steps

1. Types compile without errors
2. Types are exported from shared package
3. Client uses types correctly
4. IDE provides autocomplete

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/shared/src/types/github-actions.ts` | Created |
| `packages/shared/src/types/index.ts` | Modified |
