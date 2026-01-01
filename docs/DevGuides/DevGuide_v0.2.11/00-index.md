# DevGuide v0.2.11: Real-Time Agent Streaming & Dashboard Live View

## Quick Navigation

| Document | Description |
|----------|-------------|
| [01-overview.md](./01-overview.md) | Executive summary, architecture decisions |
| [02-streaming-types.md](./02-streaming-types.md) | Thrusts 1-2: New WebSocket event types, stream parser |
| [03-agent-streaming.md](./03-agent-streaming.md) | Thrusts 3-4: Agent driver refactor, real-time emission |
| [04-dashboard-live.md](./04-dashboard-live.md) | Thrusts 5-6: Live activity panel, run detail streaming |
| [05-events-and-progress.md](./05-events-and-progress.md) | Thrusts 7-8: File change events, progress indicators |
| [06-performance.md](./06-performance.md) | Thrusts 9-10: Rate limiting, buffering, optimization |
| [07-appendices.md](./07-appendices.md) | Work order prompts, checklists, file reference |

---

## Executive Summary

**Goal**: Enable real-time streaming of agent activity to the dashboard, providing complete visibility into what agents are doing as they execute.

**Problem Statement**:
Currently, AgentGate provides only high-level status updates (queued → running → succeeded/failed). Users cannot see:
- Which files the agent is reading/writing
- What bash commands are being executed
- The agent's reasoning and progress
- Real-time file changes

**Solution**:
1. Parse Claude Code's JSON output stream in real-time
2. Emit granular WebSocket events for tool calls, output, and file changes
3. Display live agent activity in the dashboard
4. Provide progress indicators and ETA estimates

---

## Thrust Summary

| # | Thrust | New Files | Modified Files |
|---|--------|-----------|----------------|
| 1 | Agent Event Types | - | `server/websocket/types.ts` |
| 2 | Stream Parser | `agent/stream-parser.ts` | - |
| 3 | Agent Driver Streaming | `agent/streaming-executor.ts` | `agent/claude-code-driver.ts` |
| 4 | WebSocket Emission | - | `server/websocket/broadcaster.ts`, `orchestrator/run-executor.ts` |
| 5 | Live Activity Panel | `dashboard: AgentActivityPanel.tsx` | `dashboard: WorkOrderDetail.tsx` |
| 6 | Run Detail Streaming | `dashboard: RunStreamView.tsx` | `dashboard: hooks/useRunStream.ts` |
| 7 | File Change Events | `agent/file-watcher.ts` | `server/websocket/types.ts` |
| 8 | Progress Indicators | - | `server/websocket/types.ts`, dashboard components |
| 9 | Event Rate Limiting | `server/websocket/rate-limiter.ts` | `server/websocket/broadcaster.ts` |
| 10 | Event Buffering | `server/websocket/event-buffer.ts` | `server/websocket/handler.ts` |

---

## Thrust Status

| # | Thrust | Status | Branch/PR |
|---|--------|--------|-----------|
| 1 | Agent Event Types | ⬜ Not Started | - |
| 2 | Stream Parser | ⬜ Not Started | - |
| 3 | Agent Driver Streaming | ⬜ Not Started | - |
| 4 | WebSocket Emission | ⬜ Not Started | - |
| 5 | Live Activity Panel | ⬜ Not Started | - |
| 6 | Run Detail Streaming | ⬜ Not Started | - |
| 7 | File Change Events | ⬜ Not Started | - |
| 8 | Progress Indicators | ⬜ Not Started | - |
| 9 | Event Rate Limiting | ⬜ Not Started | - |
| 10 | Event Buffering | ⬜ Not Started | - |

---

## Success Criteria

- [ ] Dashboard shows real-time tool calls as agent executes
- [ ] File reads/writes appear instantly in live view
- [ ] Bash command output streams in real-time
- [ ] Agent thinking/output visible as it's generated
- [ ] Progress percentage updates during execution
- [ ] No performance degradation with high event rates
- [ ] WebSocket reconnection handles gracefully
- [ ] All existing tests pass
- [ ] New streaming components have unit tests

---

## Prerequisites

- DevGuide v0.2.10 completed (Thrusts 9-10: Docker, config)
- WebSocket infrastructure functional (`server/websocket/`)
- Dashboard running (`packages/dashboard`)
- All packages build successfully (`pnpm build`)

---

## Implementation Order

Thrusts should be implemented in order, as later thrusts depend on earlier ones:

1. **Thrusts 1-2**: Event types and parsing foundation
2. **Thrusts 3-4**: Server-side streaming infrastructure
3. **Thrusts 5-6**: Dashboard live view components
4. **Thrusts 7-8**: Enhanced events and progress
5. **Thrusts 9-10**: Performance optimization

Each thrust pair can be implemented as a single AgentGate work order.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Current Flow                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Claude Code ──► stdout ──► Buffer ──► Process Complete ──► Status  │
│                    │                                                 │
│                    └── (output lost until completion)                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         New Flow (v0.2.11)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Claude Code ──► stdout ──► Stream Parser ──► Event Emitter         │
│                    │              │                │                 │
│                    │              │                ▼                 │
│                    │              │         Rate Limiter             │
│                    │              │                │                 │
│                    │              ▼                ▼                 │
│                    │        Tool Call Events   Agent Output          │
│                    │              │                │                 │
│                    │              └───────┬────────┘                 │
│                    │                      ▼                          │
│                    │              WebSocket Broadcaster              │
│                    │                      │                          │
│                    │                      ▼                          │
│                    │              Dashboard Live View                │
│                    │                                                 │
│                    └──► Buffer ──► Artifacts (unchanged)             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Parse Claude Code JSON Output

Claude Code with `--output-format json` emits structured events:
- `tool_use`: Agent is calling a tool (Read, Write, Bash, etc.)
- `tool_result`: Result of the tool call
- `text`: Agent thinking/output

Parse these in real-time rather than waiting for completion.

### 2. Rate Limiting Required

Agents can produce hundreds of events per second. Without rate limiting:
- WebSocket connections overwhelmed
- Dashboard becomes unresponsive
- Network bandwidth exhausted

Implement configurable rate limits with smart batching.

### 3. Separate Concerns

- **Stream Parser**: Converts raw stdout to typed events
- **Event Emitter**: Decides what to emit and when
- **Rate Limiter**: Controls event frequency
- **Buffer**: Stores for replay/catch-up

### 4. Dashboard Component Architecture

- **AgentActivityPanel**: Real-time feed of agent actions
- **RunStreamView**: Full streaming output for a run
- **ProgressIndicator**: Visual progress bar with ETA

---

## Event Types Summary

### New Server → Client Events

| Event Type | Description | Frequency |
|------------|-------------|-----------|
| `agent_tool_call` | Agent invoked a tool | Per tool use |
| `agent_tool_result` | Tool returned result | Per tool result |
| `agent_output` | Agent text output | Per message |
| `file_changed` | File created/modified/deleted | Per file change |
| `progress_update` | Completion percentage | Every ~5 seconds |

### Existing Events (Unchanged)

| Event Type | Description |
|------------|-------------|
| `work_order_created` | New work order submitted |
| `work_order_updated` | Status change |
| `run_started` | Run began |
| `run_iteration` | Iteration completed |
| `run_completed` | Run finished successfully |
| `run_failed` | Run failed |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Event latency (stdout → WebSocket) | < 100ms |
| Max events/second to single client | 50 |
| Max batched events per message | 20 |
| WebSocket message size limit | 64KB |
| Memory per active run (buffering) | < 10MB |
| Dashboard render time (100 events) | < 16ms (60fps) |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| High event volume crashes dashboard | Rate limiting, virtualized lists |
| WebSocket disconnection loses events | Event buffer with catch-up on reconnect |
| Large tool results overflow messages | Truncate with "click to expand" |
| Parsing errors crash stream | Graceful error handling, skip invalid |
| Memory leak from event accumulation | Bounded buffers, LRU eviction |
