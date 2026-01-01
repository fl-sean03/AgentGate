# 07: Appendices

## A. Work Order Prompts

### Thrusts 1-2: Streaming Types & Parser

```
Implement Thrusts 1-2 from DevGuide v0.2.11 (Streaming Types & Parser).

READ docs/DevGuides/DevGuide_v0.2.11/02-streaming-types.md for specifications.

## Thrust 1: Agent Event Types

1. Update `packages/server/src/server/websocket/types.ts`:
   - Add AgentToolCallEvent interface
   - Add AgentToolResultEvent interface
   - Add AgentOutputEvent interface
   - Add FileChangedEvent interface
   - Add ProgressUpdateEvent interface
   - Update ServerMessage union to include new types
   - Add subscription filter options to SubscribeMessage

## Thrust 2: Stream Parser

2. Create `packages/server/src/agent/stream-parser.ts`:
   - StreamParser class that parses Claude Code JSON output
   - Handle tool_use, tool_result, and text events
   - Factory methods for creating typed events
   - Async generator for streaming interface

3. Create `packages/server/test/stream-parser.test.ts`:
   - Test parsing valid tool_use JSON
   - Test parsing valid tool_result JSON
   - Test parsing text output
   - Test handling malformed JSON
   - Test handling unknown event types

## Validation

- pnpm typecheck
- pnpm lint
- pnpm test

Create a PR with title: "feat: add agent streaming event types and parser (v0.2.11 Thrusts 1-2)"
```

### Thrusts 3-4: Agent Driver Streaming

```
Implement Thrusts 3-4 from DevGuide v0.2.11 (Agent Driver Streaming).

READ docs/DevGuides/DevGuide_v0.2.11/03-agent-streaming.md for specifications.

## Thrust 3: Agent Driver Refactor

1. Create `packages/server/src/agent/streaming-executor.ts`:
   - StreamingExecutor class wrapping subprocess execution
   - Real-time stdout parsing with readline
   - Event emission via callback
   - Support for cancellation via AbortSignal

2. Update `packages/server/src/agent/claude-code-driver.ts`:
   - Accept event callback in run method
   - Use StreamingExecutor for subprocess execution
   - Maintain backward compatibility

3. Update `packages/server/src/agent/claude-code-subscription-driver.ts`:
   - Same changes as claude-code-driver.ts

## Thrust 4: WebSocket Emission

4. Update `packages/server/src/server/websocket/broadcaster.ts`:
   - Add emitAgentToolCall method
   - Add emitAgentToolResult method
   - Add emitAgentOutput method
   - Add emitFileChanged method
   - Add emitProgressUpdate method
   - Track subscription preferences per connection

5. Update `packages/server/src/orchestrator/run-executor.ts`:
   - Accept EventBroadcaster reference
   - Create streaming event callback
   - Pass callback to agent driver

6. Create `packages/server/test/streaming-executor.test.ts`
7. Create `packages/server/test/websocket-streaming.test.ts`

## Validation

- pnpm typecheck
- pnpm lint
- pnpm test

Create a PR with title: "feat: implement agent streaming infrastructure (v0.2.11 Thrusts 3-4)"
```

### Thrusts 5-6: Dashboard Live View

```
Implement Thrusts 5-6 from DevGuide v0.2.11 (Dashboard Live View).

READ docs/DevGuides/DevGuide_v0.2.11/04-dashboard-live.md for specifications.

## Thrust 5: Live Activity Panel

1. Create `packages/dashboard/src/hooks/useWebSocket.ts`:
   - WebSocket connection management
   - Reconnection with exponential backoff
   - Message parsing

2. Create `packages/dashboard/src/hooks/useRunStream.ts`:
   - Subscribe to work order events
   - Maintain event history
   - Provide event stream state

3. Create `packages/dashboard/src/components/AgentActivityPanel.tsx`:
   - Virtualized event list (react-window)
   - Auto-scroll with pause on scroll up
   - Color-coded events by type
   - Collapsible event details

4. Create `packages/dashboard/src/components/EventCard.tsx`:
   - Single event display
   - Icon, summary, timestamp
   - Expandable details

5. Update `packages/dashboard/src/components/WorkOrderDetail.tsx`:
   - Add Live Activity section
   - Show when work order is running

## Thrust 6: Run Detail Streaming

6. Create `packages/dashboard/src/components/RunStreamView.tsx`:
   - Tabbed interface (Activity, Tools, Output, Files, Errors)

7. Create tab components:
   - ToolCallsTab.tsx
   - OutputTab.tsx
   - FilesTab.tsx
   - ErrorsTab.tsx

8. Create `packages/dashboard/src/components/ProgressHeader.tsx`:
   - Progress bar
   - Phase display
   - ETA

## Validation

- pnpm typecheck
- pnpm lint
- Test manually in browser

Create a PR with title: "feat: implement dashboard live streaming view (v0.2.11 Thrusts 5-6)"
```

---

## B. Implementation Checklist

### Thrust 1: Agent Event Types
- [ ] AgentToolCallEvent interface defined
- [ ] AgentToolResultEvent interface defined
- [ ] AgentOutputEvent interface defined
- [ ] FileChangedEvent interface defined
- [ ] ProgressUpdateEvent interface defined
- [ ] ServerMessage union updated
- [ ] SubscribeMessage filters added
- [ ] Typecheck passes
- [ ] Lint passes

### Thrust 2: Stream Parser
- [ ] stream-parser.ts created
- [ ] StreamParser class implemented
- [ ] Tool use parsing works
- [ ] Tool result parsing works
- [ ] Text output parsing works
- [ ] Malformed JSON handled gracefully
- [ ] Factory methods created
- [ ] Async generator interface
- [ ] Unit tests written
- [ ] All tests pass

### Thrust 3: Agent Driver Streaming
- [ ] streaming-executor.ts created
- [ ] StreamingExecutor class implemented
- [ ] Real-time stdout parsing
- [ ] Event emission working
- [ ] Cancellation support
- [ ] claude-code-driver.ts updated
- [ ] claude-code-subscription-driver.ts updated
- [ ] Backward compatibility maintained
- [ ] Unit tests written
- [ ] All tests pass

### Thrust 4: WebSocket Emission
- [ ] emitAgentToolCall added
- [ ] emitAgentToolResult added
- [ ] emitAgentOutput added
- [ ] emitFileChanged added
- [ ] emitProgressUpdate added
- [ ] Subscription preferences tracked
- [ ] run-executor.ts updated
- [ ] orchestrator.ts updated
- [ ] Integration tests written
- [ ] All tests pass

### Thrust 5: Live Activity Panel
- [ ] useWebSocket.ts created
- [ ] useRunStream.ts created
- [ ] AgentActivityPanel.tsx created
- [ ] EventCard.tsx created
- [ ] WorkOrderDetail.tsx updated
- [ ] Virtualization working
- [ ] Auto-scroll working
- [ ] Color coding correct
- [ ] Manual testing passed

### Thrust 6: Run Detail Streaming
- [ ] RunStreamView.tsx created
- [ ] ToolCallsTab.tsx created
- [ ] OutputTab.tsx created
- [ ] FilesTab.tsx created
- [ ] ErrorsTab.tsx created
- [ ] ProgressHeader.tsx created
- [ ] Tabs switching works
- [ ] Real-time updates work
- [ ] Manual testing passed

### Thrust 7: File Change Events
- [ ] file-watcher.ts created
- [ ] FileWatcher class implemented
- [ ] Chokidar integration
- [ ] Ignore patterns working
- [ ] Debouncing working
- [ ] Integration with StreamingExecutor
- [ ] Unit tests written
- [ ] All tests pass

### Thrust 8: Progress Indicators
- [ ] progress-tracker.ts created
- [ ] ProgressTracker class implemented
- [ ] Phase detection working
- [ ] Percentage estimation
- [ ] Periodic emission
- [ ] Dashboard integration
- [ ] Unit tests written
- [ ] All tests pass

### Thrust 9: Event Rate Limiting
- [ ] rate-limiter.ts created
- [ ] RateLimiter class implemented
- [ ] Token bucket algorithm
- [ ] Priority queuing
- [ ] Smart batching
- [ ] Broadcaster integration
- [ ] Configuration added
- [ ] Unit tests written
- [ ] All tests pass

### Thrust 10: Event Buffering
- [ ] event-buffer.ts created
- [ ] EventBuffer class implemented
- [ ] Ring buffer storage
- [ ] LRU eviction
- [ ] Time-based cleanup
- [ ] Replay support in handler
- [ ] Reconnection handling
- [ ] Unit tests written
- [ ] All tests pass

---

## C. File Reference

### New Files

| File | Purpose |
|------|---------|
| `packages/server/src/agent/stream-parser.ts` | Parse Claude Code JSON output |
| `packages/server/src/agent/streaming-executor.ts` | Real-time subprocess execution |
| `packages/server/src/agent/file-watcher.ts` | Watch workspace for file changes |
| `packages/server/src/agent/progress-tracker.ts` | Track and estimate progress |
| `packages/server/src/server/websocket/rate-limiter.ts` | Rate limit outgoing events |
| `packages/server/src/server/websocket/event-buffer.ts` | Buffer events for replay |
| `packages/dashboard/src/hooks/useWebSocket.ts` | WebSocket connection hook |
| `packages/dashboard/src/hooks/useRunStream.ts` | Event stream subscription hook |
| `packages/dashboard/src/components/AgentActivityPanel.tsx` | Live activity display |
| `packages/dashboard/src/components/EventCard.tsx` | Single event card |
| `packages/dashboard/src/components/RunStreamView.tsx` | Tabbed run detail view |
| `packages/dashboard/src/components/ToolCallsTab.tsx` | Tool calls tab |
| `packages/dashboard/src/components/OutputTab.tsx` | Agent output tab |
| `packages/dashboard/src/components/FilesTab.tsx` | File changes tab |
| `packages/dashboard/src/components/ErrorsTab.tsx` | Errors tab |
| `packages/dashboard/src/components/ProgressHeader.tsx` | Progress indicator |

### Modified Files

| File | Changes |
|------|---------|
| `packages/server/src/server/websocket/types.ts` | Add new event types |
| `packages/server/src/server/websocket/broadcaster.ts` | Add emit methods, rate limiting |
| `packages/server/src/server/websocket/handler.ts` | Add replay support |
| `packages/server/src/agent/claude-code-driver.ts` | Use streaming executor |
| `packages/server/src/agent/claude-code-subscription-driver.ts` | Use streaming executor |
| `packages/server/src/orchestrator/run-executor.ts` | Add event callback |
| `packages/server/src/orchestrator/orchestrator.ts` | Pass broadcaster |
| `packages/server/src/config/index.ts` | Add streaming configuration |
| `packages/dashboard/src/components/WorkOrderDetail.tsx` | Add live activity panel |

### Test Files

| File | Tests |
|------|-------|
| `packages/server/test/stream-parser.test.ts` | Stream parser unit tests |
| `packages/server/test/streaming-executor.test.ts` | Streaming executor tests |
| `packages/server/test/file-watcher.test.ts` | File watcher tests |
| `packages/server/test/progress-tracker.test.ts` | Progress tracker tests |
| `packages/server/test/rate-limiter.test.ts` | Rate limiter tests |
| `packages/server/test/event-buffer.test.ts` | Event buffer tests |
| `packages/server/test/websocket-streaming.test.ts` | Integration tests |

---

## D. Dependencies

### New Dependencies (if needed)

| Package | Version | Purpose |
|---------|---------|---------|
| `chokidar` | ^3.5.3 | File watching (if not already installed) |
| `react-window` | ^1.8.10 | Virtualized lists in dashboard |

### Verify Existing Dependencies

These should already be installed:
- `readline` (Node.js built-in)
- `nanoid` (ID generation)
- `ws` (WebSocket)

---

## E. Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTGATE_STREAM_ENABLED` | `true` | Enable streaming events |
| `AGENTGATE_STREAM_RATE_LIMIT` | `50` | Max events/second to client |
| `AGENTGATE_STREAM_BATCH_WINDOW` | `100` | Batching window in ms |
| `AGENTGATE_STREAM_BUFFER_SIZE` | `1000` | Events to buffer per work order |
| `AGENTGATE_STREAM_BUFFER_RETENTION` | `60` | Minutes to retain events |
| `AGENTGATE_STREAM_PROGRESS_INTERVAL` | `5000` | Progress update interval ms |

### WebSocket Endpoints

| Endpoint | Purpose |
|----------|---------|
| `ws://localhost:3001/ws` | Main WebSocket endpoint |

### Client Message Types

| Type | Description |
|------|-------------|
| `subscribe` | Subscribe to work order events |
| `unsubscribe` | Unsubscribe from work order |
| `ping` | Keep-alive ping |

### Server Message Types

| Type | Description |
|------|-------------|
| `subscription_confirmed` | Subscription successful |
| `unsubscription_confirmed` | Unsubscription successful |
| `pong` | Response to ping |
| `error` | Error message |
| `work_order_created` | New work order |
| `work_order_updated` | Status change |
| `run_started` | Run began |
| `run_iteration` | Iteration complete |
| `run_completed` | Run succeeded |
| `run_failed` | Run failed |
| `agent_tool_call` | Agent invoked tool |
| `agent_tool_result` | Tool returned result |
| `agent_output` | Agent text output |
| `file_changed` | File created/modified/deleted |
| `progress_update` | Progress percentage |
