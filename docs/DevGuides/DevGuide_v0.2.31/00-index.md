# DevGuide v0.2.31: OSS/SaaS Repository Split & Development Infrastructure

**Status**: Planning
**Target Version**: 0.2.31
**Theme**: Establish dual-repo architecture with proper development and deployment workflows

---

## Quick Navigation

| File | Description |
|------|-------------|
| [00-index.md](./00-index.md) | This file - master index |
| [01-overview.md](./01-overview.md) | Workshop/Storefront model, architecture |
| [02-thrusts-foundation.md](./02-thrusts-foundation.md) | Thrusts 1-3: Development environment setup |
| [03-thrusts-separation.md](./03-thrusts-separation.md) | Thrusts 4-6: Repository separation |
| [04-thrusts-deployment.md](./04-thrusts-deployment.md) | Thrusts 7-9: Production deployment |
| [05-thrusts-automation.md](./05-thrusts-automation.md) | Thrusts 10-12: Continuous improvement system |
| [06-appendices.md](./06-appendices.md) | Checklists, inventories, reference |
| [07-home-server-deployment.md](./07-home-server-deployment.md) | Guide for home server operator |

---

## Executive Summary

This DevGuide establishes:

1. **Two Repositories**: Public OSS (`agentgate`) and Private SaaS (`agentgate-internal`)
2. **Workshop Model**: All development happens on laptop, both repos cloned locally
3. **Storefront Model**: Home server runs production SaaS, pulls from GitHub
4. **Continuous Improvement**: Future automation for self-improving codebase

---

## The Mental Model

```
LAPTOP (Workshop)                    HOME SERVER (Storefront)
├── Where you build                  ├── Where it runs
├── Both repos cloned                ├── Pulls from GitHub
├── Edit, test, debug                ├── Production deployment
├── Fast iteration                   ├── Always-on service
└── Push when ready                  └── Auto-updates (optional)
```

---

## Thrust Summary

### Phase 1: Foundation (Thrusts 1-3)

| # | Thrust | Description |
|---|--------|-------------|
| 1 | Development Environment | Set up laptop with both repos, local testing |
| 2 | Private Repo Creation | Create agentgate-internal on GitHub |
| 3 | Local Integration Testing | Verify OSS imports work in Internal |

### Phase 2: Separation (Thrusts 4-6)

| # | Thrust | Description |
|---|--------|-------------|
| 4 | SaaS Package Migration | Move dashboard, web to private repo |
| 5 | OSS Cleanup | Remove SaaS code, simplify billing |
| 6 | TUI Simplification | Remove credit/auth from terminal UI |

### Phase 3: Deployment (Thrusts 7-9)

| # | Thrust | Description |
|---|--------|-------------|
| 7 | Home Server Setup | Docker, systemd, basic deployment |
| 8 | CI/CD Pipelines | Separate CI for each repo, auto-deploy |
| 9 | Monitoring & Logs | Health checks, log aggregation |

### Phase 4: Automation (Thrusts 10-12) - Future

| # | Thrust | Description |
|---|--------|-------------|
| 10 | Task Scheduler | Queue system for automated work |
| 11 | Discovery Plugins | GitHub issues, deps, test failures |
| 12 | Continuous Worker | Always-running improvement daemon |

---

## Success Criteria

### Must Have

1. OSS repo works standalone (clone, install, run with user's API keys)
2. Internal repo imports OSS and adds SaaS layer
3. Development workflow is fast (edit on laptop, test locally)
4. Home server runs production SaaS reliably

### Should Have

5. Auto-deploy when pushing to main
6. OSS updates automatically flow to Internal
7. Clear documentation for both repos

### Nice to Have

8. Continuous improvement system running
9. Slack/Discord notifications for automated PRs

---

## Environment Overview

### Laptop (Development Machine)

```
~/Workspace/main/
├── 43-AgentGate/                 # OSS - cloned from GitHub
│   ├── packages/server/          # Core orchestration
│   ├── packages/shared/          # Types
│   └── packages/tui/             # Terminal UI
│
└── 44-AgentGate-Internal/        # Private - cloned from GitHub
    ├── packages/saas-server/     # Extended server
    ├── packages/dashboard/       # Customer UI
    ├── packages/web/             # Marketing site
    └── packages/scheduler/       # (Future) Task automation
```

### Home Server (Production)

```
/opt/agentgate/
├── docker-compose.yml            # Service definitions
├── .env                          # Production secrets
└── data/                         # Persistent storage
    ├── runs/                     # Work order artifacts
    └── billing/                  # Usage data
```

---

## Development Cycle

```
1. DEVELOP (Laptop)
   └── Edit code, run tests, start local server

2. TEST (Laptop)
   └── Submit test work orders to localhost:3001

3. DEBUG (Laptop)
   └── See logs immediately, fix issues, iterate

4. PUSH (Laptop → GitHub)
   └── git commit, push when working

5. DEPLOY (GitHub → Home Server)
   └── Auto-pull or manual deploy

6. MONITOR (Home Server)
   └── Check production health, view metrics
```

---

## Dependencies

- Node.js 20+, pnpm 8+
- Docker (for home server deployment)
- GitHub account (for private repo)
- Claude Code or API key (for agent execution)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking OSS users | Tag `pre-split-v0.2.31` before any deletion |
| Internal/OSS sync drift | Dependabot or renovate for auto-updates |
| Home server downtime | Docker restart policies, health checks |
| Development confusion | Clear CONTRIBUTING.md in each repo |

---

## Quick Start (After This DevGuide)

### Developer (on laptop)

```bash
cd ~/Workspace/main
git clone git@github.com:org/agentgate.git 43-AgentGate
git clone git@github.com:org/agentgate-internal.git 44-AgentGate-Internal
cd 43-AgentGate && pnpm install && pnpm test
cd ../44-AgentGate-Internal && pnpm install && pnpm test
```

### Home Server Operator

See [07-home-server-deployment.md](./07-home-server-deployment.md)
