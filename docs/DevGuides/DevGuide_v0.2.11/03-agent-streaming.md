# 03: Agent Driver Streaming

## Thrust 3: Agent Driver Refactor

### 3.1 Objective

Refactor the Claude Code agent driver to stream output in real-time rather than buffering until completion.

### 3.2 Background

Current flow in `agent/claude-code-driver.ts`:
1. Spawn subprocess with `execa`
2. Wait for process to complete
3. Collect all stdout
4. Parse and return result

New flow:
1. Spawn subprocess
2. Attach line-by-line reader to stdout
3. Parse each line immediately
4. Emit events as they arrive
5. Also collect for final result

### 3.3 Subtasks

#### 3.3.1 Create StreamingExecutor Class

Create `packages/server/src/agent/streaming-executor.ts`:

**Constructor parameters:**
- `workOrderId`: String
- `runId`: String
- `eventEmitter`: EventEmitter or callback function
- `options`: StreamingOptions

**StreamingOptions:**
- `emitToolCalls`: Boolean (default true)
- `emitToolResults`: Boolean (default true)
- `emitOutput`: Boolean (default true)
- `progressIntervalMs`: Number (default 5000)

#### 3.3.2 Implement Execute Method

Create main execution method:

```typescript
async execute(
  command: string,
  args: string[],
  options: ExecaOptions
): Promise<ExecutionResult>
```

**Behavior:**
1. Spawn process with `execa`
2. Create readline interface on stdout
3. Create StreamParser instance
4. Iterate over parsed events
5. Emit each event via callback
6. Collect events for final result
7. Wait for process completion
8. Return combined result

#### 3.3.3 Handle Stderr

Also stream stderr for error visibility:

- Parse stderr lines
- Emit as special error events
- Include in final result

#### 3.3.4 Implement Cancellation

Support cancelling long-running executions:

- Accept AbortSignal in options
- Kill subprocess on abort
- Emit cancellation event
- Clean up readline interface

#### 3.3.5 Update Claude Code Driver

Modify `claude-code-driver.ts` to use StreamingExecutor:

**Changes:**
- Import StreamingExecutor
- Accept event callback in run method
- Pass callback to StreamingExecutor
- Maintain backward compatibility (callback optional)

#### 3.3.6 Update Subscription Driver

Apply same changes to `claude-code-subscription-driver.ts`:

- Use StreamingExecutor
- Accept and pass event callback

### 3.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Run `pnpm lint` - no warnings
3. Create unit tests for StreamingExecutor
4. Test with real Claude Code execution (manual)
5. Verify events emit in correct order
6. Verify final result matches non-streaming version

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/agent/streaming-executor.ts` | Created |
| `packages/server/src/agent/claude-code-driver.ts` | Modified |
| `packages/server/src/agent/claude-code-subscription-driver.ts` | Modified |
| `packages/server/test/streaming-executor.test.ts` | Created |

---

## Thrust 4: WebSocket Event Emission

### 4.1 Objective

Connect the streaming executor to the WebSocket broadcaster, emitting events to subscribed clients.

### 4.2 Background

The run-executor orchestrates agent execution. It needs to:
1. Create event callback for StreamingExecutor
2. Pass events to WebSocket broadcaster
3. Respect client subscription preferences

### 4.3 Subtasks

#### 4.3.1 Add Emit Methods to Broadcaster

Extend `EventBroadcaster` in `broadcaster.ts`:

**New methods:**
- `emitAgentToolCall(event: AgentToolCallEvent)`
- `emitAgentToolResult(event: AgentToolResultEvent)`
- `emitAgentOutput(event: AgentOutputEvent)`
- `emitFileChanged(event: FileChangedEvent)`
- `emitProgressUpdate(event: ProgressUpdateEvent)`

**Implementation:**
- Each method creates properly typed event
- Calls `broadcast(event, workOrderId)`
- Respects per-connection subscription filters

#### 4.3.2 Track Subscription Preferences

Update connection subscription tracking:

**Extend WebSocketConnection:**
- Add `preferences` field with filter settings
- Parse preferences from SubscribeMessage
- Default all to true if not specified

**Filter in broadcast:**
- Check connection preferences before sending
- Skip events client doesn't want

#### 4.3.3 Update Run Executor

Modify `run-executor.ts` to emit streaming events:

**Changes:**
1. Accept EventBroadcaster in constructor or method
2. Create callback for streaming events
3. Pass callback to agent driver
4. In callback, call appropriate broadcaster method

#### 4.3.4 Integrate with Orchestrator

Ensure orchestrator passes broadcaster to run-executor:

**Changes to orchestrator.ts:**
- Import/inject EventBroadcaster instance
- Pass to run-executor creation
- Ensure single broadcaster instance for server

#### 4.3.5 Handle High-Frequency Events

Implement basic throttling in emission:

- Track last emit time per event type
- Debounce output events (100ms)
- Batch rapid tool calls
- Never throttle errors

### 4.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Run `pnpm lint` - no warnings
3. Integration test: Start server, submit work order, verify WebSocket events
4. Manual test: Connect with wscat, subscribe, observe events
5. Verify event order matches execution order

### 4.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/server/websocket/broadcaster.ts` | Modified |
| `packages/server/src/server/websocket/types.ts` | Modified |
| `packages/server/src/orchestrator/run-executor.ts` | Modified |
| `packages/server/src/orchestrator/orchestrator.ts` | Modified |
| `packages/server/test/websocket-streaming.test.ts` | Created |

---

## Integration Testing

### WebSocket Streaming Test

```typescript
describe('WebSocket Streaming', () => {
  let app: FastifyInstance;
  let ws: WebSocket;

  beforeEach(async () => {
    app = await createApp();
    await app.listen({ port: 0 });
  });

  afterEach(async () => {
    ws?.close();
    await app.close();
  });

  it('should stream agent tool calls', async () => {
    const port = (app.server.address() as any).port;
    ws = new WebSocket(`ws://localhost:${port}/ws`);

    await waitForOpen(ws);

    // Subscribe to a work order
    ws.send(JSON.stringify({
      type: 'subscribe',
      workOrderId: 'test-wo-id'
    }));

    // Wait for subscription confirmation
    const confirmMsg = await waitForMessage(ws);
    expect(confirmMsg.type).toBe('subscription_confirmed');

    // Trigger a run (mock or real)
    // ...

    // Collect events
    const events = await collectMessages(ws, 10, 5000);

    // Verify tool call events received
    const toolCalls = events.filter(e => e.type === 'agent_tool_call');
    expect(toolCalls.length).toBeGreaterThan(0);
  });

  it('should respect subscription filters', async () => {
    // Subscribe with output disabled
    ws.send(JSON.stringify({
      type: 'subscribe',
      workOrderId: 'test-wo-id',
      includeOutput: false
    }));

    // Trigger run
    // ...

    // Verify no output events received
    const events = await collectMessages(ws, 10, 5000);
    const outputEvents = events.filter(e => e.type === 'agent_output');
    expect(outputEvents.length).toBe(0);
  });
});
```

### Streaming Executor Test

```typescript
describe('StreamingExecutor', () => {
  it('should emit events as subprocess runs', async () => {
    const events: ParsedEvent[] = [];
    const executor = new StreamingExecutor({
      workOrderId: 'wo-1',
      runId: 'run-1',
      eventEmitter: (event) => events.push(event)
    });

    // Execute a simple echo command
    await executor.execute('echo', ['{"type":"text","text":"Hello"}']);

    expect(events.length).toBeGreaterThan(0);
  });

  it('should support cancellation', async () => {
    const controller = new AbortController();
    const executor = new StreamingExecutor({...});

    const promise = executor.execute('sleep', ['10'], {
      signal: controller.signal
    });

    // Cancel after 100ms
    setTimeout(() => controller.abort(), 100);

    await expect(promise).rejects.toThrow('cancelled');
  });
});
```
