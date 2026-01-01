# 02: Streaming Types & Parser

## Thrust 1: Agent Event Types

### 1.1 Objective

Extend the WebSocket event type system to include granular agent activity events.

### 1.2 Background

The current `server/websocket/types.ts` defines high-level events. We need to add:
- Tool call events (Read, Write, Edit, Bash, Grep, Glob)
- Tool result events
- Agent output events
- File change events
- Progress update events

### 1.3 Subtasks

#### 1.3.1 Define AgentToolCallEvent

Add a new interface for when the agent invokes a tool:

**Fields:**
- `type`: Literal `'agent_tool_call'`
- `workOrderId`: String - which work order
- `runId`: String - which run
- `toolUseId`: String - unique ID for this tool invocation
- `tool`: Enum - `'Read' | 'Write' | 'Edit' | 'Bash' | 'Grep' | 'Glob' | 'WebFetch' | 'WebSearch' | 'Other'`
- `input`: Record - tool-specific input (file path, command, pattern, etc.)
- `timestamp`: String - ISO timestamp

#### 1.3.2 Define AgentToolResultEvent

Add interface for tool execution results:

**Fields:**
- `type`: Literal `'agent_tool_result'`
- `workOrderId`: String
- `runId`: String
- `toolUseId`: String - matches the tool call
- `success`: Boolean - did the tool succeed
- `contentPreview`: String - first 500 chars of result (truncated)
- `contentLength`: Number - full length of result
- `durationMs`: Number - how long the tool took
- `timestamp`: String

#### 1.3.3 Define AgentOutputEvent

Add interface for agent text output (thinking, explanations):

**Fields:**
- `type`: Literal `'agent_output'`
- `workOrderId`: String
- `runId`: String
- `content`: String - the text output
- `timestamp`: String

#### 1.3.4 Define FileChangedEvent

Add interface for file system changes:

**Fields:**
- `type`: Literal `'file_changed'`
- `workOrderId`: String
- `runId`: String
- `path`: String - relative path from workspace root
- `action`: Enum - `'created' | 'modified' | 'deleted'`
- `sizeBytes`: Number | undefined - new size (undefined for deleted)
- `timestamp`: String

#### 1.3.5 Define ProgressUpdateEvent

Add interface for progress updates:

**Fields:**
- `type`: Literal `'progress_update'`
- `workOrderId`: String
- `runId`: String
- `percentage`: Number - 0-100
- `currentPhase`: String - e.g., "Reading files", "Writing code", "Running tests"
- `toolCallCount`: Number - how many tool calls so far
- `elapsedSeconds`: Number
- `estimatedRemainingSeconds`: Number | undefined
- `timestamp`: String

#### 1.3.6 Update ServerMessage Union

Add all new event types to the `ServerMessage` union type.

#### 1.3.7 Add Client Subscribe Options

Extend `SubscribeMessage` to allow filtering:

**New optional fields:**
- `includeToolCalls`: Boolean (default true)
- `includeToolResults`: Boolean (default true)
- `includeOutput`: Boolean (default true)
- `includeFileChanges`: Boolean (default true)
- `includeProgress`: Boolean (default true)

### 1.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Run `pnpm lint` - no warnings
3. Import new types in a test file and verify autocomplete works
4. Verify `ServerMessage` union includes all new types

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/server/websocket/types.ts` | Modified |

---

## Thrust 2: Stream Parser

### 2.1 Objective

Create a parser that converts Claude Code's JSON stdout into typed events.

### 2.2 Background

Claude Code with `--output-format json` emits JSON lines to stdout:

```json
{"type":"system","subtype":"init","cwd":"/workspace","session_id":"..."}
{"type":"assistant","message":{"type":"text","text":"I'll help you..."}}
{"type":"assistant","message":{"type":"tool_use","id":"toolu_01","name":"Read","input":{...}}}
{"type":"user","message":{"type":"tool_result","tool_use_id":"toolu_01","content":"..."}}
```

The parser must:
1. Handle line-by-line JSON parsing
2. Extract relevant events
3. Convert to our typed event format
4. Handle malformed input gracefully

### 2.3 Subtasks

#### 2.3.1 Create stream-parser.ts Module

Create `packages/server/src/agent/stream-parser.ts` with:

**Exports:**
- `StreamParser` class
- `ParsedEvent` type (union of all parsed event types)
- `ParserOptions` interface

#### 2.3.2 Implement Line Parser

Create method to parse a single JSON line:

**Behavior:**
- Attempt JSON.parse
- On failure, return null (don't throw)
- Log warning for malformed lines
- Return typed event or null for unrecognized types

#### 2.3.3 Implement Tool Use Detection

Detect and extract tool use events from assistant messages:

**Extract:**
- Tool name (Read, Write, Edit, Bash, etc.)
- Tool use ID
- Input parameters
- Generate unique event ID

#### 2.3.4 Implement Tool Result Detection

Detect and extract tool results from user messages:

**Extract:**
- Tool use ID (for correlation)
- Success/failure status
- Content (truncated for preview)
- Content length

#### 2.3.5 Implement Text Output Detection

Detect and extract text output from assistant messages:

**Extract:**
- Text content
- Filter out purely internal/system messages

#### 2.3.6 Create Event Factory Methods

Create factory methods that produce typed events with all required fields:

- `createToolCallEvent(workOrderId, runId, toolData)`
- `createToolResultEvent(workOrderId, runId, resultData)`
- `createOutputEvent(workOrderId, runId, text)`

#### 2.3.7 Implement Streaming Interface

Create method that accepts a readline interface and emits events:

```typescript
async *parseStream(
  readline: readline.Interface,
  workOrderId: string,
  runId: string
): AsyncGenerator<ParsedEvent>
```

**Behavior:**
- Yield events as lines are parsed
- Track tool call timing (for duration calculation)
- Handle stream errors gracefully

#### 2.3.8 Add Progress Estimation

Track execution progress based on:
- Number of tool calls
- Time elapsed
- Heuristics based on task type

Generate periodic `ProgressUpdateEvent` (configurable interval).

### 2.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Create unit tests in `packages/server/test/stream-parser.test.ts`:
   - Test parsing valid tool_use JSON
   - Test parsing valid tool_result JSON
   - Test parsing text output
   - Test handling malformed JSON
   - Test handling unknown event types
   - Test progress estimation
3. All tests pass with `pnpm test`

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/agent/stream-parser.ts` | Created |
| `packages/server/test/stream-parser.test.ts` | Created |

---

## Testing Requirements

### Stream Parser Unit Tests

```typescript
describe('StreamParser', () => {
  describe('parseToolUse', () => {
    it('should parse Read tool call')
    it('should parse Write tool call')
    it('should parse Bash tool call with command')
    it('should extract tool use ID')
    it('should handle missing input fields')
  });

  describe('parseToolResult', () => {
    it('should parse successful result')
    it('should parse error result')
    it('should truncate long content')
    it('should track content length')
    it('should correlate with tool call ID')
  });

  describe('parseText', () => {
    it('should extract assistant text')
    it('should ignore system messages')
    it('should handle empty text')
  });

  describe('parseLine', () => {
    it('should handle valid JSON')
    it('should return null for invalid JSON')
    it('should log warning for malformed input')
    it('should return null for unknown types')
  });

  describe('parseStream', () => {
    it('should yield events in order')
    it('should track tool call timing')
    it('should emit progress updates')
    it('should handle stream errors')
  });
});
```

### Event Type Tests

```typescript
describe('AgentEventTypes', () => {
  it('should include all new types in ServerMessage')
  it('should validate AgentToolCallEvent structure')
  it('should validate AgentToolResultEvent structure')
  it('should validate SubscribeMessage with filters')
});
```
