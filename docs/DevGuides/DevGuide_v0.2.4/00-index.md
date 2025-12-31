# DevGuide v0.2.4: GitHub-Backed Workspaces

**Status**: COMPLETE
**Created**: 2025-12-30
**Target**: Every workspace connected to a GitHub repository

---

## Executive Summary

This DevGuide implements GitHub-backed workspaces, a fundamental architectural change that connects every AgentGate workspace to a GitHub repository. This enables:

- **Persistent state via GitHub** - Repository IS the workspace
- **Branch-per-run workflow** - Agent changes isolated until approved
- **Automatic PR creation** - Easy review and merge process
- **User collaboration** - Pull locally, work alongside agent
- **CI alignment** - Verification mirrors GitHub Actions

**No database required** - GitHub serves as the persistent state store.

---

## Success Criteria

1. Can submit work order with `--github owner/repo` (existing repo)
2. Can submit work order with `--github-new owner/repo` (creates new repo)
3. Always pulls latest from GitHub before starting work
4. Pushes to `agentgate/<run-id>` branch after each iteration
5. Creates PR automatically when verification passes
6. Users can pull same repo locally and push changes
7. Auth command works: `agentgate auth github`
8. All existing tests continue to pass
9. New GitHub tests pass
10. `pnpm typecheck && pnpm lint && pnpm test` all green

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Git Strategy | Branch-per-run | Full audit trail, safe main branch |
| PR Creation | Automatic | Easy review workflow, user control over merge |
| Repo Support | Both new and existing | Maximum flexibility |
| Authentication | Personal Access Token | Simple, immediate setup |
| State Management | Hybrid (JSON + GitHub) | No database, GitHub is source of truth |

---

## Thrust Summary

| # | Thrust | Description | Files | Status |
|---|--------|-------------|-------|--------|
| 1 | GitHub Module Foundation | Octokit client, auth, repo operations | 3 | Complete |
| 2 | Git Operations Enhancement | Push, pull, remote, branch operations | 2 | Complete |
| 3 | Workspace Manager Integration | GitHub workspace types and creation | 3 | Complete |
| 4 | Orchestrator Workflow | Branch creation, push iterations, PR creation | 2 | Complete |
| 5 | CLI Updates | Auth command, --github flags | 3 | Complete |
| 6 | Testing & Documentation | Unit tests, README update | 3 | Complete |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GitHub Repository                           │
│  ┌─────────────┐  ┌─────────────────────────────────────────────┐  │
│  │    main     │  │         agentgate/<run-id>                  │  │
│  │   branch    │  │   (agent work branch)                       │  │
│  └─────────────┘  └─────────────────────────────────────────────┘  │
│         ▲                        │                                  │
│         │                        │ PR (auto-created)                │
│         └────────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
           │                                    ▲
           │ clone/pull                         │ push (each iteration)
           ▼                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                        Local Workspace                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ~/.agentgate/workspaces/<id>/                              │   │
│  │  - Full git repo with remote 'origin'                       │   │
│  │  - Agent makes changes here                                 │   │
│  │  - Verification runs here                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Workflow

### New Repo Workflow
```
1. agentgate submit --prompt "Create API" --github-new owner/my-project
2. → Create GitHub repo via API
3. → Clone to local workspace
4. → Create branch agentgate/<run-id>
5. → Agent works, commits pushed to branch
6. → Verification passes
7. → PR created automatically
8. → User merges when ready
```

### Existing Repo Workflow
```
1. agentgate submit --prompt "Fix bug" --github owner/existing-repo
2. → Clone repo (or pull if already exists)
3. → Pull latest from main
4. → Create branch agentgate/<run-id>
5. → Agent works, commits pushed to branch
6. → Verification passes
7. → PR created automatically
8. → User merges when ready
```

---

## Navigation

- [01-overview.md](./01-overview.md) - Architecture and design decisions
- [02-implementation.md](./02-implementation.md) - Thrust specifications
- [03-appendices.md](./03-appendices.md) - Checklists and file references

---

## Quick Reference

### Authentication Setup
```bash
# Set GitHub token (required: repo scope)
export AGENTGATE_GITHUB_TOKEN=ghp_your_token_here

# Or use the auth command
agentgate auth github --token ghp_your_token_here

# Verify auth
agentgate auth github --status
```

### CLI Usage
```bash
# Existing repo
agentgate submit --prompt "Fix typo in README" --github owner/repo

# New public repo
agentgate submit --prompt "Create Express API" --github-new owner/new-repo

# New private repo
agentgate submit --prompt "Create internal tool" --github-new owner/new-repo --private
```

### Verification Commands
```bash
# Full validation
pnpm typecheck && pnpm lint && pnpm test

# Build
pnpm build

# Test CLI
node dist/index.js --help
```

---

## Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| `@octokit/rest` | ^20.x | GitHub REST API client |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTGATE_GITHUB_TOKEN` | Yes | GitHub PAT with `repo` scope |

---

## Version Information

- **Previous**: v0.2.3 (Complete Lint Cleanup)
- **Current**: v0.2.4 (GitHub-Backed Workspaces)
- **Package Version**: 0.2.4
