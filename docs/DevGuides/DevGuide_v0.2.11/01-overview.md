# 01: Overview - Real-Time Agent Streaming

## Current State

### What Exists

AgentGate has WebSocket infrastructure that broadcasts high-level events:

```
packages/server/src/server/websocket/
├── broadcaster.ts   # EventBroadcaster class
├── handler.ts       # WebSocket connection handler
├── index.ts         # Module exports
└── types.ts         # Event type definitions
```

**Current Event Types:**
- `work_order_created` / `work_order_updated`
- `run_started` / `run_iteration` / `run_completed` / `run_failed`
- `subscription_confirmed` / `unsubscription_confirmed`
- `pong` / `error`

### What's Missing

1. **No agent activity streaming** - Cannot see what agent is doing in real-time
2. **No tool call visibility** - Don't know when agent reads/writes files
3. **No progress indication** - No idea how far along execution is
4. **No file change tracking** - Can't see which files are modified
5. **No output streaming** - Agent thinking only visible after completion

---

## Target State

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Agent Execution Layer                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │ Claude Code  │───►│ Stream       │───►│ Streaming    │           │
│  │ Process      │    │ Parser       │    │ Executor     │           │
│  └──────────────┘    └──────────────┘    └──────────────┘           │
│         │                   │                   │                    │
│         │                   │                   ▼                    │
│         │                   │            ┌──────────────┐           │
│         │                   │            │ File Watcher │           │
│         │                   │            └──────────────┘           │
│         │                   │                   │                    │
└─────────│───────────────────│───────────────────│────────────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Event Processing Layer                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │ Event        │───►│ Rate         │───►│ Event        │           │
│  │ Aggregator   │    │ Limiter      │    │ Buffer       │           │
│  └──────────────┘    └──────────────┘    └──────────────┘           │
│                              │                   │                   │
│                              ▼                   │                   │
│                       ┌──────────────┐          │                   │
│                       │ WebSocket    │◄─────────┘                   │
│                       │ Broadcaster  │   (replay on reconnect)      │
│                       └──────────────┘                              │
│                              │                                       │
└──────────────────────────────│───────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Dashboard Layer                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │ useRunStream │───►│ Agent        │    │ Progress     │           │
│  │ Hook         │    │ Activity     │    │ Indicator    │           │
│  └──────────────┘    │ Panel        │    └──────────────┘           │
│                      └──────────────┘                                │
│                                                                      │
│  ┌──────────────────────────────────────────────────────┐           │
│  │              Run Stream View                          │           │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │           │
│  │  │ Tool    │ │ Output  │ │ Files   │ │ Errors  │    │           │
│  │  │ Calls   │ │ Stream  │ │ Changed │ │ Panel   │    │           │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │           │
│  └──────────────────────────────────────────────────────┘           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Stream Parser (`agent/stream-parser.ts`)

Parses Claude Code's JSON output format in real-time:

**Input (stdout lines):**
```json
{"type":"tool_use","id":"toolu_01","name":"Read","input":{"file_path":"/src/index.ts"}}
{"type":"tool_result","tool_use_id":"toolu_01","content":"export function main()..."}
{"type":"text","text":"I'll create a new function..."}
```

**Output (typed events):**
- `AgentToolCallEvent`
- `AgentToolResultEvent`
- `AgentOutputEvent`

### 2. Streaming Executor (`agent/streaming-executor.ts`)

Wraps subprocess execution to emit events as output arrives:

**Responsibilities:**
- Spawn Claude Code process
- Attach stdout line reader
- Pass lines to stream parser
- Emit parsed events
- Collect final output for artifacts

### 3. Event Rate Limiter (`server/websocket/rate-limiter.ts`)

Controls event flow to prevent overwhelming clients:

**Features:**
- Per-client rate limits
- Smart batching (group related events)
- Priority queuing (errors > tool calls > output)
- Backpressure signaling

### 4. Dashboard Live View (`packages/dashboard/src/components/`)

**AgentActivityPanel:**
- Real-time feed of agent actions
- Color-coded by event type
- Collapsible details
- Auto-scroll with pause

**RunStreamView:**
- Full streaming output display
- Tab-based organization (Tools, Output, Files, Errors)
- Virtualized list for performance
- Search/filter capability

---

## Data Flow Example

**Scenario:** Agent reads a file, writes a modified version

```
1. Agent Process Stdout:
   {"type":"tool_use","name":"Read","input":{"file_path":"src/config.ts"}}

2. Stream Parser:
   → Parses JSON
   → Creates AgentToolCallEvent {tool: "Read", path: "src/config.ts"}

3. Streaming Executor:
   → Receives event
   → Calls broadcaster.emitAgentToolCall(...)

4. Rate Limiter:
   → Checks rate (< 50/sec? pass through)
   → Adds to current batch

5. WebSocket Broadcaster:
   → Finds subscribed connections
   → Sends: {"type":"agent_tool_call","tool":"Read","path":"src/config.ts",...}

6. Dashboard useRunStream:
   → Receives WebSocket message
   → Updates state

7. AgentActivityPanel:
   → Re-renders with new event
   → Shows: "📖 Reading src/config.ts"
```

---

## Integration Points

### With Existing Code

| Component | Integration Method |
|-----------|-------------------|
| `run-executor.ts` | Inject streaming executor, emit events |
| `broadcaster.ts` | Add new emit methods for agent events |
| `types.ts` | Extend with new event type definitions |
| `WorkOrderDetail.tsx` | Add AgentActivityPanel component |

### New Dependencies

| Package | Purpose |
|---------|---------|
| None | Use Node.js built-in readline for streaming |

---

## Configuration

New environment variables (extend `config/index.ts`):

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTGATE_STREAM_ENABLED` | `true` | Enable/disable streaming |
| `AGENTGATE_STREAM_RATE_LIMIT` | `50` | Max events/second per client |
| `AGENTGATE_STREAM_BUFFER_SIZE` | `1000` | Events to buffer for replay |
| `AGENTGATE_STREAM_BATCH_MS` | `100` | Batching window in ms |

---

## Testing Strategy

### Unit Tests

1. **Stream Parser**
   - Parse valid tool_use events
   - Parse valid tool_result events
   - Parse valid text events
   - Handle malformed JSON gracefully
   - Handle unknown event types

2. **Rate Limiter**
   - Respect rate limits
   - Batch events correctly
   - Priority ordering works
   - Backpressure triggers appropriately

3. **Event Buffer**
   - Store events correctly
   - Evict old events when full
   - Replay on reconnect

### Integration Tests

1. **End-to-End Streaming**
   - Start run, verify events stream to WebSocket
   - Verify event order matches stdout order
   - Verify no events dropped under normal load

2. **Dashboard Integration**
   - Connect WebSocket, subscribe to run
   - Verify UI updates with events
   - Verify reconnection works

---

## Rollout Plan

### Phase 1: Foundation (Thrusts 1-4)
- Event types
- Stream parser
- Agent driver refactor
- Basic emission

### Phase 2: Dashboard (Thrusts 5-6)
- Activity panel
- Stream view
- Hook for real-time updates

### Phase 3: Enhancement (Thrusts 7-8)
- File change tracking
- Progress indicators

### Phase 4: Production (Thrusts 9-10)
- Rate limiting
- Buffering
- Performance optimization

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Event latency | < 100ms | Timestamp diff (emit → receive) |
| Dashboard responsiveness | 60fps | Chrome DevTools performance |
| Memory usage | < 50MB increase | Node process monitoring |
| WebSocket reliability | 99.9% | Connection drop rate |
| User satisfaction | Positive feedback | Manual testing |
