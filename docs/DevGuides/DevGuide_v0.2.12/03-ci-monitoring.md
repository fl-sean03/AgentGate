# 03: CI Monitoring

## Thrust 3: Workflow Monitor

### 3.1 Objective

Create a workflow monitor that polls for CI status and waits for completion.

### 3.2 Background

After creating a PR, GitHub Actions workflows run automatically. We need to:
- Wait for workflows to start (may take a few seconds)
- Poll for status until complete
- Handle timeouts and failures
- Support cancellation

### 3.3 Subtasks

#### 3.3.1 Create Workflow Monitor

Create `packages/server/src/github/workflow-monitor.ts`:

**Class structure:**

The monitor should:
- Accept ActionsClient in constructor
- Provide method to wait for workflow completion
- Use configurable poll interval
- Support AbortSignal for cancellation

**Primary method:**

`waitForCompletion(owner, repo, headSha, options?)`:
- Poll until all workflows for the SHA complete
- Options: timeout, pollInterval, signal
- Return CIResult with pass/fail and job details

**Polling strategy:**

1. Initial delay (5s) to let workflows start
2. Poll at configured interval (default 30s)
3. Check all runs matching head SHA
4. Wait for all to reach terminal state
5. Aggregate results

**State machine:**

```
PENDING ─► STARTED ─► RUNNING ─┬─► SUCCESS
                               │
                               ├─► FAILURE
                               │
                               └─► CANCELLED
```

#### 3.3.2 Handle Edge Cases

**Workflow not started:**
- Wait up to 60s for first workflow to appear
- Return error if no workflows found

**Multiple workflows:**
- Track all workflows for the SHA
- Only complete when ALL are done
- Failure in any = overall failure

**Workflow cancelled:**
- Treat as failure
- Include cancellation reason if available

### 3.4 Verification Steps

1. Monitor waits for workflow to start
2. Monitor returns success for passing CI
3. Monitor returns failure for failing CI
4. Monitor times out after configured duration
5. Monitor can be cancelled via AbortSignal
6. Multiple workflows are tracked correctly

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/github/workflow-monitor.ts` | Created |

---

## Thrust 4: Log Downloader

### 4.1 Objective

Create a log downloader that fetches workflow run logs.

### 4.2 Background

GitHub provides logs via:
- `/repos/{owner}/{repo}/actions/runs/{run_id}/logs` - ZIP of all logs
- Individual job logs via jobs API

We need to download and extract relevant log content.

### 4.3 Subtasks

#### 4.3.1 Create Log Downloader

Create `packages/server/src/github/log-downloader.ts`:

**Class structure:**

The downloader should:
- Accept ActionsClient in constructor
- Download logs for a workflow run
- Extract and organize by job

**Primary method:**

`downloadLogs(owner, repo, runId)`:
- Download log archive
- Extract to temp directory
- Parse log files
- Return structured log data

**Log structure:**

GitHub logs are organized as:
```
logs/
├── job1/
│   ├── 1_Step Name.txt
│   ├── 2_Another Step.txt
│   └── ...
├── job2/
│   └── ...
```

**Return format:**

Return a structured object:
- Map of job name to step logs
- Each step has name, log content, status

#### 4.3.2 Handle Large Logs

**Streaming:**
- Don't load entire log into memory
- Stream processing for large files

**Truncation:**
- Configurable max size per log
- Keep head and tail with "... truncated ..." marker

**Filtering:**
- Only keep relevant log sections
- Focus on error output

### 4.4 Verification Steps

1. Downloader fetches logs for a run
2. Logs are extracted and organized
3. Large logs are handled without OOM
4. Truncation works correctly
5. Empty logs are handled

### 4.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/github/log-downloader.ts` | Created |
