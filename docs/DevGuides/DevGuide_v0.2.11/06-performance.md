# 06: Performance Optimization

## Thrust 9: Event Rate Limiting

### 9.1 Objective

Implement rate limiting to prevent overwhelming WebSocket clients with high-frequency events.

### 9.2 Background

During intense agent activity:
- Claude can make dozens of tool calls per minute
- Agent output can generate hundreds of text events
- File watcher can fire on every save

Without rate limiting:
- WebSocket messages pile up
- Client JavaScript event loop blocks
- Dashboard becomes unresponsive
- Network bandwidth exhausted

### 9.3 Subtasks

#### 9.3.1 Create RateLimiter Module

Create `packages/server/src/server/websocket/rate-limiter.ts`:

**Configuration:**
- `maxEventsPerSecond`: Number (default 50)
- `batchWindowMs`: Number (default 100)
- `priorityLevels`: Map of event type to priority

**Interface:**
```typescript
class RateLimiter {
  constructor(options: RateLimiterOptions);
  submit(event: ServerMessage): void;
  onBatch(callback: (events: ServerMessage[]) => void): void;
  flush(): void;
  stop(): void;
}
```

#### 9.3.2 Implement Token Bucket Algorithm

Use token bucket for smooth rate limiting:

**Algorithm:**
- Bucket capacity = maxEventsPerSecond
- Refill rate = maxEventsPerSecond per second
- Each event consumes 1 token
- When bucket empty, queue events
- Periodic flush of queued events

#### 9.3.3 Implement Priority Queuing

Different events have different priorities:

**Priority levels:**
1. **Critical** (always send immediately):
   - `error`
   - `run_failed`
   - `run_completed`

2. **High** (prefer over lower):
   - `agent_tool_call`
   - `file_changed`
   - `progress_update`

3. **Normal**:
   - `agent_tool_result`

4. **Low** (batch aggressively):
   - `agent_output`

**Behavior:**
- Critical bypasses rate limit
- When limited, drop lowest priority first
- Within priority, FIFO

#### 9.3.4 Implement Smart Batching

Batch related events together:

**Batching rules:**
- Consecutive output events → single event with combined text
- Multiple file changes → single event with file list
- Tool call + immediate result → combined event

#### 9.3.5 Integrate with Broadcaster

Modify broadcaster to use rate limiter:

**Changes:**
- Create RateLimiter per connection
- Route events through limiter
- Limiter calls actual send
- Handle limiter cleanup on disconnect

#### 9.3.6 Add Configuration

Add rate limit configuration to `config/index.ts`:

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTGATE_STREAM_RATE_LIMIT` | 50 | Max events/second |
| `AGENTGATE_STREAM_BATCH_WINDOW` | 100 | Batch window in ms |
| `AGENTGATE_STREAM_PRIORITY_ENABLED` | true | Enable priority queuing |

### 9.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Unit tests for RateLimiter
3. Load test: Generate 1000 events/second, verify client receives ~50
4. Verify critical events bypass limit
5. Verify batching combines output events

### 9.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/server/websocket/rate-limiter.ts` | Created |
| `packages/server/src/server/websocket/broadcaster.ts` | Modified |
| `packages/server/src/config/index.ts` | Modified |
| `packages/server/test/rate-limiter.test.ts` | Created |

---

## Thrust 10: Event Buffering

### 10.1 Objective

Buffer recent events to support replay on reconnection and catch-up for late subscribers.

### 10.2 Background

WebSocket connections can drop. When client reconnects:
- They've missed events during disconnection
- Need to catch up to current state
- Don't want to replay entire history

Event buffer provides:
- Limited history storage
- Efficient retrieval by work order
- Automatic cleanup of old events

### 10.3 Subtasks

#### 10.3.1 Create EventBuffer Module

Create `packages/server/src/server/websocket/event-buffer.ts`:

**Configuration:**
- `maxEventsPerWorkOrder`: Number (default 1000)
- `maxTotalEvents`: Number (default 10000)
- `retentionMinutes`: Number (default 60)

**Interface:**
```typescript
class EventBuffer {
  constructor(options: EventBufferOptions);
  add(event: ServerMessage, workOrderId: string): void;
  getEvents(workOrderId: string, since?: Date): ServerMessage[];
  getLatestEvents(workOrderId: string, count: number): ServerMessage[];
  clear(workOrderId: string): void;
  clearOlderThan(date: Date): void;
}
```

#### 10.3.2 Implement Ring Buffer Storage

Use ring buffer per work order:

**Structure:**
```typescript
Map<workOrderId, {
  events: ServerMessage[]; // Fixed-size array
  head: number;           // Write position
  count: number;          // Actual event count
}>
```

**Operations:**
- Add: O(1)
- Get recent N: O(N)
- Get since timestamp: O(N) with binary search

#### 10.3.3 Implement LRU Eviction

When total events exceed limit:

**Strategy:**
1. Track last access time per work order
2. When limit reached, find least recently accessed
3. Remove oldest events from that work order
4. Continue until under limit

#### 10.3.4 Implement Time-Based Cleanup

Periodic cleanup of old events:

**Process:**
1. Run every 5 minutes
2. Find events older than retentionMinutes
3. Remove from buffer
4. Log cleanup stats

#### 10.3.5 Add Replay Support to Handler

Modify WebSocket handler for replay on subscribe:

**New subscribe options:**
- `replaySince`: ISO timestamp - replay events since this time
- `replayCount`: Number - replay last N events

**Flow:**
1. Client subscribes with replay options
2. Handler queries EventBuffer
3. Send buffered events first
4. Then stream live events

#### 10.3.6 Handle Reconnection

Support seamless reconnection:

**Client sends:**
```json
{
  "type": "subscribe",
  "workOrderId": "wo-123",
  "replaySince": "2024-01-01T12:00:00Z"
}
```

**Server responds:**
1. Confirmation
2. Buffered events since timestamp
3. Continue with live stream

### 10.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Unit tests for EventBuffer
3. Test: Subscribe, receive events, disconnect, reconnect with replay
4. Verify no duplicate events
5. Verify memory usage stays bounded

### 10.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/server/websocket/event-buffer.ts` | Created |
| `packages/server/src/server/websocket/handler.ts` | Modified |
| `packages/server/src/server/websocket/types.ts` | Modified |
| `packages/server/test/event-buffer.test.ts` | Created |

---

## Testing Requirements

### RateLimiter Tests

```typescript
describe('RateLimiter', () => {
  it('should pass events under rate limit', async () => {
    const batches: ServerMessage[][] = [];
    const limiter = new RateLimiter({ maxEventsPerSecond: 100 });
    limiter.onBatch(batch => batches.push(batch));

    for (let i = 0; i < 10; i++) {
      limiter.submit({ type: 'agent_output', ... });
    }
    limiter.flush();

    expect(batches.flat()).toHaveLength(10);
  });

  it('should limit events over rate', async () => {
    const batches: ServerMessage[][] = [];
    const limiter = new RateLimiter({ maxEventsPerSecond: 10 });
    limiter.onBatch(batch => batches.push(batch));

    // Submit 100 events instantly
    for (let i = 0; i < 100; i++) {
      limiter.submit({ type: 'agent_output', ... });
    }

    // Wait for rate limiting to apply
    await wait(1000);
    limiter.flush();

    // Should have received ~10-20, not 100
    expect(batches.flat().length).toBeLessThan(30);
  });

  it('should prioritize critical events', async () => {
    const batches: ServerMessage[][] = [];
    const limiter = new RateLimiter({ maxEventsPerSecond: 5 });
    limiter.onBatch(batch => batches.push(batch));

    // Submit many low priority, then one critical
    for (let i = 0; i < 100; i++) {
      limiter.submit({ type: 'agent_output', ... });
    }
    limiter.submit({ type: 'run_failed', ... }); // Critical

    limiter.flush();

    // Critical should be in first batch
    const firstBatch = batches[0];
    expect(firstBatch.some(e => e.type === 'run_failed')).toBe(true);
  });
});
```

### EventBuffer Tests

```typescript
describe('EventBuffer', () => {
  it('should store and retrieve events', () => {
    const buffer = new EventBuffer({ maxEventsPerWorkOrder: 100 });
    const event = { type: 'agent_output', workOrderId: 'wo-1', ... };

    buffer.add(event, 'wo-1');
    const events = buffer.getEvents('wo-1');

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });

  it('should evict old events when full', () => {
    const buffer = new EventBuffer({ maxEventsPerWorkOrder: 5 });

    for (let i = 0; i < 10; i++) {
      buffer.add({ type: 'agent_output', id: i, ... }, 'wo-1');
    }

    const events = buffer.getEvents('wo-1');
    expect(events).toHaveLength(5);
    // Should have events 5-9, not 0-4
    expect(events[0].id).toBe(5);
  });

  it('should filter by timestamp', () => {
    const buffer = new EventBuffer();
    const now = new Date();

    buffer.add({ timestamp: new Date(now - 1000).toISOString(), ... }, 'wo-1');
    buffer.add({ timestamp: now.toISOString(), ... }, 'wo-1');

    const events = buffer.getEvents('wo-1', new Date(now - 500));
    expect(events).toHaveLength(1);
  });

  it('should handle multiple work orders', () => {
    const buffer = new EventBuffer();

    buffer.add({ id: 1, ... }, 'wo-1');
    buffer.add({ id: 2, ... }, 'wo-2');

    expect(buffer.getEvents('wo-1')).toHaveLength(1);
    expect(buffer.getEvents('wo-2')).toHaveLength(1);
  });
});
```

---

## Performance Benchmarks

### Target Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Rate limiter throughput | 10,000 events/sec | Benchmark test |
| Buffer add latency | < 1ms | Benchmark test |
| Buffer query latency | < 10ms for 1000 events | Benchmark test |
| Memory per 1000 events | < 1MB | Heap snapshot |
| WebSocket message latency | < 50ms p99 | End-to-end timing |

### Benchmark Tests

```typescript
describe('Performance', () => {
  it('rate limiter handles high throughput', () => {
    const limiter = new RateLimiter({ maxEventsPerSecond: 1000 });
    const start = performance.now();

    for (let i = 0; i < 10000; i++) {
      limiter.submit({ type: 'agent_output', ... });
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000); // < 1 second for 10k events
  });

  it('buffer handles many events', () => {
    const buffer = new EventBuffer({ maxEventsPerWorkOrder: 10000 });
    const start = performance.now();

    for (let i = 0; i < 10000; i++) {
      buffer.add({ type: 'agent_output', ... }, 'wo-1');
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100); // < 100ms for 10k adds
  });
});
```
