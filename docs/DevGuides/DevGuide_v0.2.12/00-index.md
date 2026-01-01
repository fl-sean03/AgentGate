# DevGuide v0.2.12: GitHub CI Feedback Loop

## Quick Navigation

| Document | Description |
|----------|-------------|
| [01-overview.md](./01-overview.md) | Executive summary, architecture decisions |
| [02-github-client.md](./02-github-client.md) | Thrusts 1-2: GitHub Actions client, workflow types |
| [03-ci-monitoring.md](./03-ci-monitoring.md) | Thrusts 3-4: Workflow monitor, log downloader |
| [04-log-parsing.md](./04-log-parsing.md) | Thrust 5: Log parser and failure extraction |
| [05-orchestrator-integration.md](./05-orchestrator-integration.md) | Thrust 6: Agent remediation loop |
| [06-appendices.md](./06-appendices.md) | Checklists, work order prompts, file reference |

---

## Executive Summary

**Goal**: Enable automated CI monitoring with intelligent failure detection and agent-driven remediation.

**Problem Statement**:
Currently, when a PR fails CI checks:
1. User must manually check GitHub for failures
2. User must read and interpret log output
3. User must manually feed failure context back to agent
4. No automated retry with remediation context

**Solution**:
1. Monitor GitHub Actions workflow runs for PRs we create
2. Download and parse CI logs when runs fail
3. Extract actionable failure information (test failures, lint errors, build issues)
4. Automatically feed failures back to the executing agent for remediation
5. Track remediation iterations to prevent infinite loops

---

## Thrust Summary

| # | Thrust | New Files | Modified Files |
|---|--------|-----------|----------------|
| 1 | GitHub Actions Client | `github/actions-client.ts` | - |
| 2 | Workflow Types | `types/github-actions.ts` | `types/index.ts` |
| 3 | Workflow Monitor | `github/workflow-monitor.ts` | - |
| 4 | Log Downloader | `github/log-downloader.ts` | - |
| 5 | Log Parser | `github/log-parser.ts`, `github/failure-summarizer.ts` | - |
| 6 | Orchestrator Integration | `github/index.ts` | `orchestrator/run-executor.ts`, `orchestrator/orchestrator.ts` |

---

## Thrust Status

| # | Thrust | Status | Branch/PR |
|---|--------|--------|-----------|
| 1 | GitHub Actions Client | ⬜ Not Started | - |
| 2 | Workflow Types | ⬜ Not Started | - |
| 3 | Workflow Monitor | ⬜ Not Started | - |
| 4 | Log Downloader | ⬜ Not Started | - |
| 5 | Log Parser | ⬜ Not Started | - |
| 6 | Orchestrator Integration | ⬜ Not Started | - |

---

## Success Criteria

- [ ] GitHub Actions client can list workflow runs for a PR
- [ ] Workflow monitor polls for status changes
- [ ] Log downloader fetches full log output
- [ ] Log parser extracts structured failure info
- [ ] Failure summarizer creates actionable remediation prompts
- [ ] Run executor feeds failures back to agent for retry
- [ ] Configurable max CI remediation attempts
- [ ] All existing tests pass
- [ ] New CI module has unit tests

---

## Prerequisites

- DevGuide v0.2.10 completed (recursive spawning)
- DevGuide v0.2.11 completed (real-time streaming)
- GitHub token with `actions:read` scope
- All packages build successfully (`pnpm build`)

---

## Implementation Order

Thrusts should be implemented in order:

1. **Thrusts 1-2**: GitHub client and type foundation
2. **Thrusts 3-4**: Monitoring and log fetching
3. **Thrust 5**: Log parsing and failure extraction
4. **Thrust 6**: Orchestrator integration for remediation loop

Each thrust pair can be implemented as a single AgentGate work order.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                       PR Created by AgentGate                         │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      GitHub Actions Triggered                         │
│                                                                        │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │   Build Job     │    │   Lint Job      │    │   Test Job      │  │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘  │
│           │                      │                      │            │
│           └──────────────────────┼──────────────────────┘            │
│                                  ▼                                    │
│                        Workflow Status: X/✓                          │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
             ┌──────────┐                  ┌──────────┐
             │  Passed  │                  │  Failed  │
             └────┬─────┘                  └────┬─────┘
                  │                             │
                  ▼                             ▼
           ┌───────────┐              ┌─────────────────┐
           │ Complete! │              │ Workflow Monitor│
           └───────────┘              │ (polling)       │
                                      └────────┬────────┘
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │ Log Downloader  │
                                      └────────┬────────┘
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │   Log Parser    │
                                      │ (extract errors)│
                                      └────────┬────────┘
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │ Failure Summary │
                                      │ (LLM optional)  │
                                      └────────┬────────┘
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │  Run Executor   │
                                      │ (agent retry)   │
                                      └─────────────────┘
```

---

## Key Design Decisions

### 1. Polling vs Webhooks

Use polling for simplicity:
- No need for public webhook endpoint
- Works in development and production
- Configurable poll interval (default: 30 seconds)
- Can switch to webhooks in future if needed

### 2. Log Parsing Strategy

Parse logs in phases:
1. **Structural parsing**: Split into jobs and steps
2. **Pattern matching**: Identify known error patterns
3. **Context extraction**: Get surrounding lines for errors
4. **Optional LLM summarization**: Generate human-readable summary

### 3. Remediation Loop

Feed failures back with structured context:
- Original task prompt
- Files changed
- Specific failures
- Suggested fixes (from patterns)

### 4. Configurable Limits

Prevent infinite loops:
- `AGENTGATE_MAX_CI_RETRIES`: Default 3
- `AGENTGATE_CI_POLL_INTERVAL_MS`: Default 30000
- `AGENTGATE_CI_TIMEOUT_MS`: Default 1800000 (30 min)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Rate limiting by GitHub API | Exponential backoff, configurable intervals |
| Large log files | Stream parsing, truncation limits |
| Infinite remediation loops | Hard limit on retry count |
| False positive error detection | Conservative pattern matching |
| Long CI runs | Configurable timeout |
