# DevGuide v0.2.7: Appendices

This document contains checklists, file references, and additional resources.

---

## A. Master Checklist

### Prerequisites

- [ ] GitHub token configured: `AGENTGATE_GITHUB_TOKEN`
- [ ] Claude subscription credentials exist: `~/.claude/.credentials.json`
- [ ] AgentGate built: `pnpm build`
- [ ] CLI works: `node dist/index.js --help`

### Phase 1: HTTP Server

| Work Order | Status | PR | Merged | Validated | Tests |
|------------|--------|-----|--------|-----------|-------|
| WO-P1-001: Server Foundation | ✅ | - | ✅ | ✅ | ❌ |
| WO-P1-002: Work Order API | ✅ | #8 | ✅ | ✅ | ❌ |
| WO-P1-003: WebSocket Support | ✅ | #13 | ✅ | ✅ | ❌ |

### Phase 1 Hotfixes

| Work Order | Status | PR | Merged | Description |
|------------|--------|-----|--------|-------------|
| WO-HF-001: Status Bug Fix | ✅ | #12 | ✅ | Fix QUEUED → RUNNING transition |
| WO-HF-002: dotenv Support | ✅ | #11 | ✅ | Auto-load .env file |
| WO-HF-003: WebSocket | ✅ | #13 | ✅ | Real-time updates |

### Standards Enhancement (Pre-Phase 2)

| Work Order | Status | PR | Merged | Description |
|------------|--------|-----|--------|-------------|
| WO-CLI-001: exec command | ✅ | #16 | ✅ | Queue + run in one step |
| WO-STD-001: AGENTS.md Injection | ✅ | #15 | ✅ | Inject engineering standards into agent prompts |
| WO-STD-002: Missing Tests | ✅ | #18 | ✅ | Add tests for all Phase 1 features |
| WO-STD-003: Test Coverage Check | ✅ | #17 | ✅ | L3 sanity check for test files |

### Test Files Added in Standards Enhancement

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `test/server-app.test.ts` | 14 | Fastify app creation, CORS, error handling |
| `test/routes-health.test.ts` | 17 | Health endpoints |
| `test/routes-work-orders.test.ts` | 21 | Work order CRUD API |
| `test/middleware-auth.test.ts` | 18 | API key authentication |
| `test/agent-standards.test.ts` | 19 | AGENTS.md loading and injection |
| `test/cli-exec.test.ts` | 10 | exec command |
| `test/l3-sanity-coverage.test.ts` | 8 | L3 test coverage verification |

### Phase 1 Validation

- [ ] `agentgate serve --port 3001` starts
- [ ] `GET /health` returns OK
- [ ] `GET /api/v1/work-orders` returns list
- [ ] `POST /api/v1/work-orders` creates order (with auth)
- [ ] `DELETE /api/v1/work-orders/:id` cancels order
- [ ] WebSocket connects at `/ws`
- [ ] Events broadcast on status change

### Phase 2: Frontend Dashboard

| Work Order | Status | PR | Merged | Validated |
|------------|--------|-----|--------|-----------|
| WO-P2-001: Project Bootstrap | ⬜ | - | ⬜ | ⬜ |
| WO-P2-002: Core Layout | ⬜ | - | ⬜ | ⬜ |
| WO-P2-003: Work Order List | ⬜ | - | ⬜ | ⬜ |
| WO-P2-004: Work Order Detail | ⬜ | - | ⬜ | ⬜ |
| WO-P2-005: Submission Form | ⬜ | - | ⬜ | ⬜ |
| WO-P2-006: API Integration | ⬜ | - | ⬜ | ⬜ |
| WO-P2-007: Real-time Updates | ⬜ | - | ⬜ | ⬜ |
| WO-P2-008: Polish & Deploy | ⬜ | - | ⬜ | ⬜ |

### Phase 2 Validation

- [ ] Dashboard cloned and `pnpm install` works
- [ ] `pnpm dev` starts dev server
- [ ] Work order list loads from API
- [ ] Can submit new work order
- [ ] Work order detail shows full info
- [ ] Real-time updates when status changes
- [ ] Navigation between pages works
- [ ] Mobile responsive

### Final Integration

- [ ] Dashboard connects to AgentGate server
- [ ] End-to-end: Submit via dashboard → Agent runs → Updates live
- [ ] All features work as expected

---

## B. File Reference - Phase 1 (AgentGate)

### New Files

| File | Purpose | Thrust |
|------|---------|--------|
| `src/server/types.ts` | Server configuration types | 1 |
| `src/server/app.ts` | Fastify app factory | 1 |
| `src/server/index.ts` | Server entry point | 1 |
| `src/server/routes/health.ts` | Health check endpoints | 1 |
| `src/server/types/api.ts` | API request/response types | 2 |
| `src/server/middleware/auth.ts` | API key authentication | 2 |
| `src/server/routes/work-orders.ts` | Work order CRUD routes | 2 |
| `src/server/routes/runs.ts` | Run query routes | 2 |
| `src/server/websocket/types.ts` | WebSocket message types | 3 |
| `src/server/websocket/broadcaster.ts` | Event broadcaster | 3 |
| `src/server/websocket/handler.ts` | WebSocket handler | 3 |
| `src/server/websocket/index.ts` | WebSocket exports | 3 |
| `src/control-plane/commands/serve.ts` | Serve CLI command | 1 |

### Modified Files

| File | Changes | Thrust |
|------|---------|--------|
| `package.json` | Add fastify dependencies | 1 |
| `src/control-plane/cli.ts` | Register serve command | 1 |
| `src/server/app.ts` | Register routes, WebSocket | 2, 3 |
| `src/orchestrator/orchestrator.ts` | Emit events to broadcaster | 3 |

---

## C. File Reference - Phase 2 (Dashboard)

### Core Structure

| File | Purpose | Thrust |
|------|---------|--------|
| `package.json` | Project config, dependencies | 4 |
| `vite.config.ts` | Vite configuration | 4 |
| `tailwind.config.js` | Tailwind configuration | 4 |
| `tsconfig.json` | TypeScript config | 4 |
| `verify.yaml` | AgentGate verification | 4 |
| `.env.example` | Environment template | 6 |

### Components

| File | Purpose | Thrust |
|------|---------|--------|
| `src/components/layout/Layout.tsx` | Main layout wrapper | 5 |
| `src/components/layout/Sidebar.tsx` | Navigation sidebar | 5 |
| `src/components/layout/Header.tsx` | Top header | 5 |
| `src/components/work-orders/WorkOrderCard.tsx` | Work order card | 6 |
| `src/components/work-orders/WorkOrderList.tsx` | Work order grid | 6 |
| `src/components/work-orders/StatusBadge.tsx` | Status indicator | 6 |
| `src/components/work-orders/WorkOrderHeader.tsx` | Detail header | 7 |
| `src/components/work-orders/WorkOrderInfo.tsx` | Detail info | 7 |
| `src/components/work-orders/WorkOrderTimeline.tsx` | Run timeline | 7 |
| `src/components/runs/RunCard.tsx` | Run summary | 7 |
| `src/components/runs/IterationCard.tsx` | Iteration details | 7 |
| `src/components/forms/WorkOrderForm.tsx` | Submission form | 8 |
| `src/components/common/Modal.tsx` | Modal component | 8 |
| `src/components/common/LoadingSpinner.tsx` | Loading indicator | 11 |
| `src/components/common/ErrorDisplay.tsx` | Error message | 11 |
| `src/components/common/ConnectionStatus.tsx` | WS status | 10 |

### Hooks

| File | Purpose | Thrust |
|------|---------|--------|
| `src/hooks/useWorkOrders.ts` | List work orders | 9 |
| `src/hooks/useWorkOrder.ts` | Get single work order | 9 |
| `src/hooks/useCreateWorkOrder.ts` | Create mutation | 9 |
| `src/hooks/useCancelWorkOrder.ts` | Cancel mutation | 9 |
| `src/hooks/useWebSocket.ts` | WebSocket connection | 10 |

### API

| File | Purpose | Thrust |
|------|---------|--------|
| `src/api/client.ts` | HTTP client | 9 |
| `src/api/work-orders.ts` | Work order API | 9 |
| `src/api/runs.ts` | Run API | 9 |
| `src/api/websocket.ts` | WebSocket client | 10 |

### Pages

| File | Purpose | Thrust |
|------|---------|--------|
| `src/pages/Dashboard.tsx` | Home dashboard | 5, 11 |
| `src/pages/WorkOrders.tsx` | Work order list | 6 |
| `src/pages/WorkOrderDetail.tsx` | Work order detail | 7 |
| `src/pages/Runs.tsx` | Run list | 5 |
| `src/pages/RunDetail.tsx` | Run detail | 5 |
| `src/pages/Settings.tsx` | Settings | 9 |
| `src/pages/NotFound.tsx` | 404 page | 11 |

---

## D. API Reference

### REST Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /health | No | Health check |
| GET | /health/ready | No | Readiness check |
| GET | /health/live | No | Liveness check |
| GET | /api/v1/work-orders | No | List work orders |
| GET | /api/v1/work-orders/:id | No | Get work order |
| POST | /api/v1/work-orders | Yes | Create work order |
| DELETE | /api/v1/work-orders/:id | Yes | Cancel work order |
| GET | /api/v1/runs | No | List runs |
| GET | /api/v1/runs/:id | No | Get run |
| WS | /ws | No | WebSocket connection |

### Request/Response Examples

**Create Work Order**
```http
POST /api/v1/work-orders
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "taskPrompt": "Create a REST API with Express",
  "workspaceSource": {
    "type": "github-new",
    "owner": "fl-sean03",
    "repoName": "my-api"
  },
  "agentType": "claude-code-subscription",
  "maxIterations": 3,
  "maxWallClockSeconds": 3600
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "id": "wo-abc123",
    "taskPrompt": "Create a REST API with Express",
    "status": "queued",
    "createdAt": "2025-12-31T00:00:00Z"
  }
}
```

### WebSocket Messages

**Subscribe**
```json
{
  "type": "subscribe",
  "payload": { "workOrderId": "wo-abc123" }
}
```

**Status Update**
```json
{
  "type": "workorder:updated",
  "payload": {
    "workOrderId": "wo-abc123",
    "status": "running",
    "runId": "run-xyz789"
  },
  "timestamp": "2025-12-31T00:00:00Z"
}
```

---

## E. Troubleshooting

### Phase 1 Issues

| Issue | Solution |
|-------|----------|
| `fastify` not found | Run `pnpm install` |
| Port already in use | Use `--port <other>` |
| Auth fails | Check `--api-key` option |
| WebSocket won't connect | Verify CORS origin |

### Phase 2 Issues

| Issue | Solution |
|-------|----------|
| TypeScript errors | Check `tsconfig.json` |
| Tailwind not working | Verify `postcss.config.js` |
| API requests fail | Check `VITE_API_URL` in `.env` |
| WebSocket disconnects | Check CORS and server status |

### Work Order Issues

| Issue | Solution |
|-------|----------|
| Work order queued but not starting | Check agent driver availability |
| Verification fails | Review test output in run details |
| PR not created | Check GitHub token permissions |
| Wrong files modified | Review prompt specificity |

---

## F. Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.2.7 | 2025-12-31 | AgentGate Dashboard implementation |
| 0.2.6 | 2025-12-31 | Subscription-based billing |
| 0.2.5 | 2025-12-30 | Run analytics & metrics |
| 0.2.4 | 2025-12-30 | GitHub-backed workspaces |

---

## G. Resources

### Documentation

- [AgentGate README](../../../README.md)
- [DevGuides README](../README.md)
- [Fastify Documentation](https://fastify.dev/)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Tailwind CSS Documentation](https://tailwindcss.com/)

### Related DevGuides

- [v0.2.6 - Subscription Driver](../DevGuide_v0.2.6/00-index.md)
- [v0.2.4 - GitHub Workspaces](../DevGuide_v0.2.4/00-index.md)

---

## H. Glossary

| Term | Definition |
|------|------------|
| Work Order | A task submitted to AgentGate for agent execution |
| Run | A single execution of a work order |
| Iteration | One cycle of build-verify-feedback within a run |
| Gate Plan | Verification requirements for a workspace |
| Thrust | A focused unit of work in a DevGuide |
| Driver | Agent backend (Claude Code, OpenAI Codex, etc.) |
| Broadcaster | WebSocket event distribution component |
