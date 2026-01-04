# DevGuide v0.3.1: Streaming Standardization

**Thrusts 5-6: Streaming Event Types and Integration Tests**

---

## Thrust 5: Standardize Streaming Events

### 5.1 Objective

Ensure all adapters yield consistent StreamEvent types during streaming operations.

### 5.2 Background

The `interface.py` defines StreamEvent types:
- `StreamEventType.TEXT_DELTA` - Text content chunks
- `StreamEventType.TOOL_START` - Tool execution begins
- `StreamEventType.TOOL_END` - Tool execution completes
- `StreamEventType.ERROR` - Error occurred
- `StreamEventType.COMPLETE` - Stream finished

Current AnthropicAdapter yields different event types:
- `IterationStart`, `IterationEnd`, `Complete`

These need to be mapped to standard types.

### 5.3 Subtasks

#### 5.3.1 Review current streaming implementation

Examine `campaign_builder/agent/adapters/anthropic_raw.py`:
- Find the `stream()` method
- Identify what events are yielded
- Understand the streaming message structure

#### 5.3.2 Map Anthropic events to StreamEvent

Create mapping:
- Text content blocks → `StreamEventType.TEXT_DELTA`
- Tool use blocks start → `StreamEventType.TOOL_START`
- Tool result returned → `StreamEventType.TOOL_END`
- message_stop → `StreamEventType.COMPLETE`
- Error → `StreamEventType.ERROR`

#### 5.3.3 Update AnthropicAdapter stream method

Modify the stream method to:
- Process raw streaming events from Anthropic
- Convert to standard StreamEvent objects
- Yield proper event types with data

#### 5.3.4 Update MockAdapter stream method

Ensure MockAdapter yields same event types:
- Simulate text deltas for response
- Yield COMPLETE at end
- Optionally simulate tool events

#### 5.3.5 Create StreamEvent helper

Add helper function in interface.py:

**create_text_delta(text: str) -> StreamEvent**

**create_tool_start(name: str, input: dict) -> StreamEvent**

**create_tool_end(name: str, output: str) -> StreamEvent**

**create_complete() -> StreamEvent**

### 5.4 Verification Steps

1. Test AnthropicAdapter streaming:
   ```python
   import asyncio
   from campaign_builder.agent.factory import get_best_available_provider

   async def test():
       provider = get_best_available_provider()
       events = []
       async for event in provider.stream("Count 1-5", "Be concise", []):
           events.append(event)
           print(f"{event.event_type.value}: {event.data[:50] if event.data else ''}")

       # Verify event types
       types = [e.event_type.value for e in events]
       assert "text_delta" in types or len([e for e in events if e.data]) > 0
       print("PASSED")

   asyncio.run(test())
   ```

2. Test MockAdapter streaming:
   ```python
   from campaign_builder.agent.adapters.mock import MockAdapter

   async def test():
       mock = MockAdapter(default_response="Hello world")
       events = []
       async for event in mock.stream("test", "test", []):
           events.append(event)
       assert any(e.event_type.value == "complete" for e in events)
       print("PASSED")

   asyncio.run(test())
   ```

### 5.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/interface.py` | Modified | Add StreamEvent helpers |
| `campaign_builder/agent/adapters/anthropic_raw.py` | Modified | Standardize events |
| `campaign_builder/agent/adapters/mock.py` | Modified | Standardize events |

---

## Thrust 6: Streaming Integration Tests

### 6.1 Objective

Create comprehensive tests for streaming functionality across all adapters.

### 6.2 Background

Streaming tests should verify:
- Events are yielded in proper order
- Text content is accumulated correctly
- Tool events are emitted for tool-using queries
- Errors are properly wrapped

### 6.3 Subtasks

#### 6.3.1 Create test file

Create `tests/test_streaming.py` with structure for:
- MockAdapter streaming tests
- AnthropicAdapter streaming tests (live API)
- Event type verification

#### 6.3.2 Test MockAdapter streaming

Test cases:

**test_mock_stream_yields_events**
- Create mock with default response
- Stream and collect events
- Verify at least one event received
- Verify COMPLETE event at end

**test_mock_stream_text_accumulation**
- Stream a response
- Accumulate all text data
- Verify matches default response

#### 6.3.3 Test AnthropicAdapter streaming

Test cases (mark with `@pytest.mark.live_api`):

**test_anthropic_stream_basic**
- Stream simple query
- Verify events received
- Verify text content in events

**test_anthropic_stream_with_tools**
- Stream query with tool
- Verify TOOL_START event (if tools used)
- Verify TOOL_END event
- Verify final response

#### 6.3.4 Test event type consistency

Test cases:

**test_event_types_are_standard**
- Collect events from stream
- Verify all event_type values are valid StreamEventType
- No unexpected types

**test_complete_event_is_last**
- Stream any query
- Verify last event is COMPLETE type

### 6.4 Verification Steps

1. Run streaming tests:
   ```bash
   pytest tests/test_streaming.py -v
   ```
   Expected: Mock tests pass

2. Run live streaming tests:
   ```bash
   pytest tests/test_streaming.py -v -m live_api
   ```
   Expected: All streaming tests pass

3. Verify event accumulation:
   ```bash
   pytest tests/test_streaming.py::test_mock_stream_text_accumulation -v
   ```
   Expected: Text matches expected output

### 6.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `tests/test_streaming.py` | Created | Streaming tests |

---

## Phase 3 Completion Checklist

Before moving to Phase 4, verify:

- [ ] StreamEvent helpers added to interface.py
- [ ] AnthropicAdapter yields standard event types
- [ ] MockAdapter yields standard event types
- [ ] Streaming tests pass for MockAdapter
- [ ] Streaming tests pass for AnthropicAdapter (live)
- [ ] Text accumulation works correctly

---

## Next Document

Continue to [05-integration.md](./05-integration.md) for Thrusts 7-8: Integration testing.
