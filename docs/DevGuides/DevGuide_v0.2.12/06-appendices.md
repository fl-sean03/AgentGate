# 06: Appendices

## Master Checklist

### Thrust 1: GitHub Actions Client
- [ ] Create `packages/server/src/github/actions-client.ts`
- [ ] Implement `listWorkflowRuns()`
- [ ] Implement `getWorkflowRun()`
- [ ] Implement `listJobsForRun()`
- [ ] Implement `downloadLogs()`
- [ ] Implement `getRunForPR()`
- [ ] Add error handling
- [ ] Create module index

### Thrust 2: Workflow Types
- [ ] Create `packages/shared/src/types/github-actions.ts`
- [ ] Define WorkflowRun type
- [ ] Define WorkflowJob type
- [ ] Define WorkflowStep type
- [ ] Define CIFailure type
- [ ] Define CIResult type
- [ ] Export from types/index.ts
- [ ] Build shared package

### Thrust 3: Workflow Monitor
- [ ] Create `packages/server/src/github/workflow-monitor.ts`
- [ ] Implement `waitForCompletion()`
- [ ] Handle polling with configurable interval
- [ ] Handle timeout
- [ ] Handle cancellation via AbortSignal
- [ ] Handle multiple workflows
- [ ] Add logging

### Thrust 4: Log Downloader
- [ ] Create `packages/server/src/github/log-downloader.ts`
- [ ] Implement `downloadLogs()`
- [ ] Handle ZIP extraction
- [ ] Organize logs by job/step
- [ ] Handle large logs
- [ ] Implement truncation
- [ ] Add streaming support

### Thrust 5: Log Parser
- [ ] Create `packages/server/src/github/log-parser.ts`
- [ ] Implement TypeScript error parsing
- [ ] Implement ESLint error parsing
- [ ] Implement test failure parsing
- [ ] Implement generic error parsing
- [ ] Create `packages/server/src/github/failure-summarizer.ts`
- [ ] Implement `summarize()`
- [ ] Group errors by type
- [ ] Truncate if too many errors

### Thrust 6: Orchestrator Integration
- [ ] Update run-executor.ts with CI loop
- [ ] Add CI status to run result
- [ ] Add CI events to websocket types
- [ ] Update orchestrator for CI states
- [ ] Add CI config options
- [ ] Update .env.example
- [ ] Export from github/index.ts

---

## Work Order Prompts

### Thrusts 1-2: GitHub Client & Types

```
Implement GitHub Actions client and workflow types for AgentGate v0.2.12.

Read the DevGuide at docs/DevGuides/DevGuide_v0.2.12/02-github-client.md for full specifications.

Create:
1. packages/server/src/github/actions-client.ts - GitHub Actions API client
2. packages/shared/src/types/github-actions.ts - TypeScript types for workflows
3. packages/server/src/github/index.ts - Module exports

The client should wrap Octokit and provide methods for:
- Listing workflow runs
- Getting run details
- Listing jobs
- Downloading logs
- Finding runs for PRs

Include proper error handling and TypeScript types throughout.
Run pnpm typecheck and pnpm lint after implementation.
```

### Thrusts 3-4: Monitoring & Log Download

```
Implement workflow monitoring and log downloading for AgentGate v0.2.12.

Read the DevGuide at docs/DevGuides/DevGuide_v0.2.12/03-ci-monitoring.md for full specifications.

Create:
1. packages/server/src/github/workflow-monitor.ts - Polls for CI completion
2. packages/server/src/github/log-downloader.ts - Downloads and extracts logs

The monitor should:
- Poll at configurable intervals
- Wait for all workflows to complete
- Support timeout and cancellation
- Return structured CI result

The downloader should:
- Fetch log archive from GitHub
- Extract and organize by job/step
- Handle large logs with truncation

Update the github/index.ts exports.
Run pnpm typecheck and pnpm lint after implementation.
```

### Thrust 5: Log Parsing

```
Implement log parsing and failure summarization for AgentGate v0.2.12.

Read the DevGuide at docs/DevGuides/DevGuide_v0.2.12/04-log-parsing.md for full specifications.

Create:
1. packages/server/src/github/log-parser.ts - Extracts structured failures from logs
2. packages/server/src/github/failure-summarizer.ts - Creates remediation prompts

The parser should recognize:
- TypeScript compiler errors
- ESLint errors
- Vitest/Jest test failures
- Generic stack traces

The summarizer should:
- Group errors by type
- Create actionable remediation prompt
- Include original context
- Truncate if too many errors

Include unit tests for the parser patterns.
Run pnpm typecheck, pnpm lint, and pnpm test after implementation.
```

### Thrust 6: Orchestrator Integration

```
Integrate CI monitoring into the AgentGate orchestrator for v0.2.12.

Read the DevGuide at docs/DevGuides/DevGuide_v0.2.12/05-orchestrator-integration.md for full specifications.

Modify:
1. packages/server/src/orchestrator/run-executor.ts - Add CI loop after PR creation
2. packages/server/src/orchestrator/orchestrator.ts - Add CI status handling
3. packages/shared/src/types/websocket.ts - Add CI event types
4. packages/shared/src/types/run.ts - Add CI fields to run result
5. packages/server/src/config/index.ts - Add CI configuration
6. .env.example - Document CI environment variables

The CI loop should:
- Monitor workflow status after PR creation
- Download and parse logs on failure
- Generate remediation prompt
- Resume agent with fix context
- Push fixes and repeat
- Limit retries to prevent infinite loops

Emit WebSocket events for CI progress.
Run pnpm typecheck, pnpm lint, and pnpm test after implementation.
```

---

## File Reference

### New Files

| Path | Purpose |
|------|---------|
| `packages/server/src/github/actions-client.ts` | GitHub Actions API client |
| `packages/server/src/github/workflow-monitor.ts` | Poll for CI completion |
| `packages/server/src/github/log-downloader.ts` | Download workflow logs |
| `packages/server/src/github/log-parser.ts` | Parse logs for failures |
| `packages/server/src/github/failure-summarizer.ts` | Create remediation prompts |
| `packages/server/src/github/index.ts` | Module exports |
| `packages/shared/src/types/github-actions.ts` | GitHub Actions types |

### Modified Files

| Path | Changes |
|------|---------|
| `packages/server/src/orchestrator/run-executor.ts` | Add CI monitoring loop |
| `packages/server/src/orchestrator/orchestrator.ts` | Add CI status handling |
| `packages/shared/src/types/websocket.ts` | Add CI event types |
| `packages/shared/src/types/run.ts` | Add CI fields |
| `packages/shared/src/types/index.ts` | Export new types |
| `packages/server/src/config/index.ts` | Add CI config options |
| `.env.example` | Document CI variables |

---

## Testing Considerations

### Unit Tests

| Component | Test File |
|-----------|-----------|
| ActionsClient | `test/github/actions-client.test.ts` |
| WorkflowMonitor | `test/github/workflow-monitor.test.ts` |
| LogDownloader | `test/github/log-downloader.test.ts` |
| LogParser | `test/github/log-parser.test.ts` |
| FailureSummarizer | `test/github/failure-summarizer.test.ts` |

### Integration Tests

| Test | Description |
|------|-------------|
| CI loop success | PR passes CI on first try |
| CI loop remediation | PR fails, agent fixes, passes |
| CI loop exhausted | PR fails after max attempts |
| No CI workflows | Handle repos without CI |

### Mocking

For unit tests, mock:
- Octokit API responses
- Log file contents
- Agent driver execution

For integration tests, consider:
- GitHub API sandbox
- Real workflow runs (slow)
- Recorded fixtures

---

## Troubleshooting

### "No workflows found for SHA"

**Symptoms:**
- Monitor times out waiting for workflows
- No workflow runs appear

**Causes:**
- Workflow not triggered for PRs
- Branch protection preventing runs
- GitHub Actions disabled on repo

**Solutions:**
1. Check repository Settings > Actions
2. Verify workflow trigger includes `pull_request`
3. Check branch protection settings

### "Rate limit exceeded"

**Symptoms:**
- API calls fail with 403
- "API rate limit exceeded" message

**Solutions:**
1. Increase poll interval
2. Use authenticated requests (higher limits)
3. Implement exponential backoff

### "Log download failed"

**Symptoms:**
- Cannot fetch workflow logs
- 404 error on logs endpoint

**Causes:**
- Logs not yet available (run still active)
- Logs expired (90 day retention)
- Permission issues

**Solutions:**
1. Wait for workflow to complete
2. Check GITHUB_TOKEN permissions
3. Verify run exists

### "Remediation loop not stopping"

**Symptoms:**
- Agent keeps trying to fix
- Max attempts exceeded
- Infinite loop behavior

**Solutions:**
1. Verify `AGENTGATE_MAX_CI_RETRIES` is set
2. Check if same error keeps recurring
3. Review remediation prompts for clarity
