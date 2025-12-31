# DevGuide v0.2.7: AgentGate Dashboard

**Status**: In Progress
**Created**: 2025-12-31
**Target**: Full-stack dashboard for AgentGate management

---

## Executive Summary

This DevGuide implements a complete web dashboard for AgentGate, with a unique twist: **the frontend is built by AgentGate itself**. This demonstrates AgentGate's capability to autonomously build production software while also providing a useful management interface.

The implementation has two phases, **both built entirely by AgentGate**:
1. **Phase 1**: Submit work orders to add HTTP API server to AgentGate itself
2. **Phase 2**: Submit work orders to build the React frontend in a new repo

**Key Innovation**: AgentGate builds its own HTTP server AND its own dashboard. This is a rigorous end-to-end test of the system's capability to autonomously extend itself.

---

## Success Criteria

### Phase 1: HTTP Server
1. AgentGate runs as HTTP server with `agentgate serve`
2. REST API for work order CRUD operations
3. WebSocket support for real-time status updates
4. Authentication via API key
5. All existing CLI functionality preserved

### Phase 2: Frontend Dashboard
6. React/TypeScript/Vite frontend in separate GitHub repo
7. Built entirely through AgentGate work order submissions
8. Connects to AgentGate HTTP API
9. Full work order management (list, view, submit, cancel)
10. Real-time status updates
11. Responsive design with TailwindCSS

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| HTTP Framework | Fastify | Fast, TypeScript-native, plugin ecosystem |
| Frontend Framework | React + Vite | Industry standard, fast builds, TypeScript support |
| Styling | TailwindCSS | Rapid development, consistent design system |
| State Management | React Query | Excellent for async state, caching, real-time |
| Build Method | AgentGate Work Orders | Proves system capability, dogfooding |
| Repository | Separate Repo | Clean separation, independent deployment |

---

## Thrust Summary

### Phase 1: HTTP Server (Via AgentGate - Same Repo)

| # | Thrust | Description | Work Order |
|---|--------|-------------|------------|
| 1 | HTTP Server Foundation | Fastify server, health endpoints | WO-P1-001 |
| 2 | Work Order API | REST endpoints for work order operations | WO-P1-002 |
| 3 | Real-time Updates | WebSocket for status broadcasting | WO-P1-003 |

### Phase 2: Frontend Dashboard (Via AgentGate - New Repo)

| # | Thrust | Description | Work Order |
|---|--------|-------------|------------|
| 4 | Project Bootstrap | Create React/Vite/TypeScript project | WO-P2-001 |
| 5 | Core Layout | Navigation, header, main content area | WO-P2-002 |
| 6 | Work Order List | Table/cards with filtering, sorting | WO-P2-003 |
| 7 | Work Order Detail | Full details, iteration timeline | WO-P2-004 |
| 8 | Submission Form | Create new work orders | WO-P2-005 |
| 9 | API Integration | Connect to AgentGate HTTP API | WO-P2-006 |
| 10 | Real-time Updates | WebSocket status updates | WO-P2-007 |
| 11 | Polish & Deploy | Error states, loading, documentation | WO-P2-008 |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Browser                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     AgentGate Dashboard (React)                      │    │
│  │  - Work Order List                                                   │    │
│  │  - Work Order Details                                                │    │
│  │  - Submit New Work Orders                                            │    │
│  │  - Real-time Status Updates                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │ REST API + WebSocket
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AgentGate Server (Fastify)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Health API   │  │ Work Order   │  │ WebSocket    │  │ Auth         │    │
│  │ /health      │  │ /api/v1/*    │  │ Server       │  │ Middleware   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                    │                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │              Existing AgentGate Core (Orchestrator)                   │   │
│  │  - Work Order Service                                                 │   │
│  │  - Agent Drivers (Claude Code, OpenAI Codex, OpenCode)               │   │
│  │  - Verification Pipeline                                              │   │
│  │  - GitHub Integration                                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GitHub                                          │
│  - fl-sean03/agentgate-dashboard (Frontend Repo)                            │
│  - Branches: agentgate/<run-id> for each work order                         │
│  - Auto-created PRs for review                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Development Workflow

### Prerequisites
```bash
# Configure GitHub token (required for both phases)
export AGENTGATE_GITHUB_TOKEN=ghp_xxx

# Verify AgentGate CLI is built
pnpm build
```

### Phase 1: HTTP Server (Via AgentGate)
```
1. Submit WO-P1-001: Add Fastify server foundation
2. Wait for PR, validate, merge
3. Pull and rebuild: git pull && pnpm build
4. Submit WO-P1-002: Add Work Order API
5. Wait for PR, validate, merge
6. Pull and rebuild: git pull && pnpm build
7. Submit WO-P1-003: Add WebSocket support
8. Wait for PR, validate, merge
9. Pull and rebuild: git pull && pnpm build
10. Verify: agentgate serve --port 3001
```

### Phase 2: Frontend (Via AgentGate - New Repo)
```
1. Start AgentGate server: agentgate serve --port 3001
2. Submit WO-P2-001: Create project bootstrap (creates new repo)
3. Wait for PR, review, merge
4. Submit WO-P2-002: Add core layout
5. Repeat for each thrust (WO-P2-003 through WO-P2-008)
6. Final: Full dashboard connected to AgentGate API
```

---

## Navigation

- [01-overview.md](./01-overview.md) - Architecture and design decisions
- [02-implementation.md](./02-implementation.md) - HTTP Server thrusts (Phase 1)
- [03-frontend.md](./03-frontend.md) - Frontend thrusts (Phase 2)
- [04-work-order-prompts.md](./04-work-order-prompts.md) - Exact prompts for submissions
- [05-appendices.md](./05-appendices.md) - Checklists and file references

---

## Quick Reference

### Environment Setup
```bash
# GitHub authentication (required for Phase 2)
export AGENTGATE_GITHUB_TOKEN=ghp_your_token_here

# Start server (after Phase 1 complete)
agentgate serve --port 3001

# Submit work order (Phase 2)
agentgate submit \
  --prompt "Create React/Vite/TypeScript project..." \
  --github-new fl-sean03/agentgate-dashboard \
  --template typescript
```

### API Endpoints (After Phase 1)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Server health check |
| GET | /api/v1/work-orders | List all work orders |
| GET | /api/v1/work-orders/:id | Get work order details |
| POST | /api/v1/work-orders | Submit new work order |
| DELETE | /api/v1/work-orders/:id | Cancel work order |
| WS | /ws | WebSocket for real-time updates |

### Verification Commands
```bash
# Full validation (Phase 1)
pnpm typecheck && pnpm lint && pnpm test

# Server test
agentgate serve --port 3001 &
curl http://localhost:3001/health
curl http://localhost:3001/api/v1/work-orders
```

---

## Dependencies Added

### AgentGate (Phase 1)
| Package | Version | Purpose |
|---------|---------|---------|
| `fastify` | ^4.x | HTTP server framework |
| `@fastify/cors` | ^8.x | CORS support |
| `@fastify/websocket` | ^8.x | WebSocket support |

### Dashboard (Phase 2, Created by AgentGate)
| Package | Purpose |
|---------|---------|
| `react` | UI framework |
| `vite` | Build tool |
| `tailwindcss` | Styling |
| `@tanstack/react-query` | Async state management |

---

## Version Information

- **Previous**: v0.2.6 (Subscription-Based Agent Driver)
- **Current**: v0.2.7 (AgentGate Dashboard)
- **Package Version**: 0.2.7
