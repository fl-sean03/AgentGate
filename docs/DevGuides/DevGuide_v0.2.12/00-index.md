# 00: Index - GitHub CI Feedback Loop

## DevGuide v0.2.12

**Title:** GitHub CI Feedback Loop
**Status:** Not Started
**Prerequisites:** v0.2.10 (Recursive Agent Spawning), v0.2.4 (GitHub-Backed Workspaces)

---

## Executive Summary

Implement automated GitHub CI monitoring and feedback loop integration. When an agent creates a PR, the system programmatically monitors GitHub Actions workflow runs. If CI fails, failure logs are parsed and fed back to the agent for remediation. The loop continues until CI passes or max iterations are reached.

---

## Problem Statement

Currently, when an agent creates a PR:
1. The PR triggers GitHub CI workflows
2. No one monitors the CI results programmatically
3. If CI fails, the agent doesn't know
4. PRs sit with failing checks until manually noticed
5. Admin override is required to merge

**Target State:**
1. Agent creates PR → system starts CI monitoring
2. GitHub Actions run → system polls for completion
3. CI passes → PR ready for merge, run succeeds
4. CI fails → logs extracted, formatted as feedback, agent remediates
5. Loop until success or max CI iterations reached

---

## Success Criteria

- [ ] GitHub Actions API integration for workflow monitoring
- [ ] Automatic detection of workflow completion
- [ ] CI failure log parsing and summarization
- [ ] Feedback generation from CI failures
- [ ] Agent remediation loop (build → PR → CI → feedback → build)
- [ ] Configurable CI polling interval and timeout
- [ ] Max CI retry limit to prevent infinite loops
- [ ] Dashboard visibility into CI status

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Orchestrator                              │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌─────────────────┐   │
│  │  Build  │→│ Snapshot │→│ Verify  │→│   PR Created    │   │
│  └─────────┘  └──────────┘  └─────────┘  └────────┬────────┘   │
│       ↑                                           │              │
│       │                                           ↓              │
│  ┌─────────┐                              ┌───────────────┐     │
│  │Feedback │←────────────────────────────│  CI Polling   │     │
│  └─────────┘                              └───────┬───────┘     │
│                                                   │              │
└───────────────────────────────────────────────────┼──────────────┘
                                                    │
                    ┌───────────────────────────────┼───────────────┐
                    │           GitHub              │               │
                    │  ┌────────────────────────────↓────────────┐ │
                    │  │           CI Monitor Service             │ │
                    │  │  ┌─────────┐  ┌──────────┐  ┌─────────┐ │ │
                    │  │  │  Poll   │→│  Parse   │→│ Format  │ │ │
                    │  │  │Workflow │  │  Logs    │  │Feedback │ │ │
                    │  │  └─────────┘  └──────────┘  └─────────┘ │ │
                    │  └──────────────────────────────────────────┘ │
                    │                                               │
                    │  ┌──────────────────────────────────────────┐ │
                    │  │          GitHub Actions API              │ │
                    │  │  • List workflow runs                    │ │
                    │  │  • Get workflow run status               │ │
                    │  │  • Download workflow logs                │ │
                    │  └──────────────────────────────────────────┘ │
                    └───────────────────────────────────────────────┘
```

---

## Thrust Overview

| # | Name | Description | Files |
|---|------|-------------|-------|
| 1 | GitHub Actions Client | API client for GitHub Actions workflows | 2 |
| 2 | Workflow Run Monitor | Poll and track workflow run status | 2 |
| 3 | CI Log Parser | Download and parse failure logs | 2 |
| 4 | Failure Summarizer | Extract actionable feedback from logs | 2 |
| 5 | CI Feedback Integration | Connect CI results to orchestrator feedback loop | 3 |
| 6 | Configuration & Dashboard | CI settings and visibility | 3 |
| 7 | Draft PR Until Verified | Create draft PRs, convert to ready after CI passes | 3 |

---

## Thrust Status

| # | Thrust | Status | Notes |
|---|--------|--------|-------|
| 1 | GitHub Actions Client | ✅ Complete | `actions-client.ts` |
| 2 | Workflow Run Monitor | ✅ Complete | `workflow-monitor.ts` |
| 3 | CI Log Parser | ✅ Complete | `log-downloader.ts`, `log-parser.ts` |
| 4 | Failure Summarizer | ✅ Complete | `failure-summarizer.ts` |
| 5 | CI Feedback Integration | ✅ Complete | PR #37 - `ci-feedback.ts` |
| 6 | Configuration & Dashboard | ✅ Complete | PR #37 - config + health updates |
| 7 | Draft PR Until Verified | ✅ Complete | In orchestrator.ts |

---

## File Map

### New Files

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/github/actions-client.ts` | 1 | GitHub Actions API client |
| `packages/server/src/github/workflow-monitor.ts` | 2 | Poll workflow runs |
| `packages/server/src/github/log-downloader.ts` | 3 | Download workflow logs |
| `packages/server/src/github/log-parser.ts` | 3 | Parse log format |
| `packages/server/src/github/failure-summarizer.ts` | 4 | Extract failure summary |
| `packages/server/src/orchestrator/ci-feedback.ts` | 5 | CI feedback generation |
| `packages/server/test/actions-client.test.ts` | 1 | Unit tests |
| `packages/server/test/workflow-monitor.test.ts` | 2 | Unit tests |
| `packages/server/test/log-parser.test.ts` | 3 | Unit tests |
| `packages/server/test/failure-summarizer.test.ts` | 4 | Unit tests |
| `packages/server/test/ci-feedback.test.ts` | 5 | Integration tests |

### Modified Files

| File | Thrust | Changes |
|------|--------|---------|
| `packages/server/src/orchestrator/run-executor.ts` | 5 | Add CI polling phase |
| `packages/server/src/orchestrator/orchestrator.ts` | 5, 7 | Wire CI feedback loop, draft PR creation |
| `packages/server/src/config/index.ts` | 6 | Add CI configuration |
| `packages/server/src/server/routes/health.ts` | 6 | Add CI status |
| `packages/dashboard/src/components/WorkOrderDetail.tsx` | 6 | Show CI status |
| `packages/server/src/types/github.ts` | 7 | Add `draft` field to PR schema |
| `packages/server/src/workspace/github.ts` | 7 | Add `convertDraftToReady` function |

---

## Quick Reference

### Key Types

```
WorkflowRun {
  id: number
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: 'success' | 'failure' | 'cancelled' | null
  html_url: string
  logs_url: string
  created_at: string
  updated_at: string
}

CIFeedback {
  workflowRunId: number
  conclusion: 'success' | 'failure'
  failedJobs: FailedJob[]
  summary: string
  actionableItems: string[]
  rawLogs?: string
}

FailedJob {
  name: string
  step: string
  errorMessage: string
  logSnippet: string
}
```

### State Machine Flow

```
PR_CREATED
    │
    ↓ CI_POLLING_STARTED
CI_POLLING ←─────────────────┐
    │                        │
    ├─ CI_PASSED ──────→ SUCCEEDED
    │                        │
    ├─ CI_FAILED ──────→ FEEDBACK
    │                        │
    │                        ↓
    │                    BUILDING (with CI feedback)
    │                        │
    │                        ↓
    │                    ... (normal flow)
    │                        │
    │                        ↓
    │                    PR_CREATED
    │                        │
    └────────────────────────┘

    └─ CI_TIMEOUT ─────→ FAILED
```

---

## Navigation

| Document | Contents |
|----------|----------|
| [01-overview.md](./01-overview.md) | Current state, target architecture, design decisions |
| [02-github-api.md](./02-github-api.md) | Thrusts 1-2: GitHub Actions client and workflow monitoring |
| [03-ci-monitor.md](./03-ci-monitor.md) | Thrusts 3-4: Log parsing and failure summarization |
| [04-feedback-loop.md](./04-feedback-loop.md) | Thrusts 5-6: Orchestrator integration and configuration |
| [05-appendices.md](./05-appendices.md) | Work order prompts, checklists, reference |

---

## Dependencies

- GitHub Personal Access Token with `repo` and `actions` scopes
- `@octokit/rest` package (already installed for PR creation)
- Existing state machine with CI_POLLING states (already defined)
