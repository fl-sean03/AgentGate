# DevGuide v0.3.0: Agent Adapters

**Thrusts 4-6: Claude SDK, Anthropic Raw, Mock Adapters**

---

## Thrust 4: Claude Agent SDK Adapter

### 4.1 Objective

Implement an adapter that uses the official Claude Agent SDK (`claude-agent-sdk`) to handle agentic interactions, leveraging its built-in tool handling and session management.

### 4.2 Background

The Claude Agent SDK (version 0.1.18+) provides:
- Built-in tools (Read, Write, Glob, Grep, Bash)
- Automatic agentic loop handling
- Session and conversation management
- MCP server integration for custom tools
- Streaming support

The SDK bundles a Claude Code CLI that handles the actual LLM interaction. Our adapter translates between our AgentProvider interface and the SDK's API.

**Verified capabilities (tested 2025-12-28):**
- Basic queries work: `query(prompt="What is 2+2?")` returns correct answer
- Built-in tools work: Read tool successfully reads files
- Tool calls visible in message stream
- SystemMessage, AssistantMessage, ResultMessage flow confirmed

**Known limitations:**
- Custom MCP tools may have transport timing issues
- Workaround: Use built-in tools or raw Anthropic adapter for custom tools

### 4.3 Subtasks

#### 4.3.1 Create the adapter module

Create `campaign_builder/agent/adapters/claude_sdk.py` with:

**ClaudeSDKAdapter class (extends AgentProvider):**

Constructor:
- Accepts AgentConfig
- Stores configuration for later use
- Does NOT connect immediately (lazy initialization)

**run() method implementation:**

The run method must:
1. Convert ToolDefinition list to SDK format
2. Create ClaudeAgentOptions with:
   - cwd set to working directory
   - allowed_tools list
   - mcp_servers if custom tools needed
3. Call query() with prompt and options
4. Iterate through response messages
5. Extract tool calls from ToolUseBlock messages
6. Extract final text from TextBlock messages
7. Build and return AgentResult

**Message types to handle:**
- SystemMessage: Initial system information
- AssistantMessage: Contains TextBlock and ToolUseBlock
- UserMessage: Tool results being sent back
- ResultMessage: Final completion signal

#### 4.3.2 Implement tool conversion

Convert ToolDefinition to Claude SDK format:
- If using built-in tools, just pass names to allowed_tools
- If using custom tools, create MCP server with @tool decorator

**Built-in tool mapping:**
| Our Name | SDK Name |
|----------|----------|
| read_file | Read |
| write_file | Write |
| glob_files | Glob |
| grep_content | Grep |
| run_command | Bash |

For custom tools, the adapter should:
1. Wrap each ToolDefinition.handler with @tool decorator
2. Create MCP server with create_sdk_mcp_server()
3. Add to mcp_servers in options

#### 4.3.3 Implement streaming

**stream() method implementation:**

The stream method must:
1. Set up same options as run()
2. Iterate through query() response
3. Yield appropriate StreamEvent for each message type:
   - TextBlock → TextDelta
   - ToolUseBlock start → ToolStart
   - ToolResultBlock → ToolEnd
4. At end, yield Complete with final AgentResult

#### 4.3.4 Error handling

Handle SDK-specific errors:
- CLINotFoundError: Claude CLI not found → raise ProviderNotAvailable
- CLIConnectionError: Connection issue → retry or raise
- ProcessError: CLI crashed → log and raise
- Timeout: Exceeded time limit → return partial result

#### 4.3.5 Availability check

**is_available() method:**
- Check that claude-agent-sdk is importable
- Check that ANTHROPIC_API_KEY is set
- Optionally verify API key is valid (with caching)

### 4.4 Verification Steps

1. Verify adapter instantiation:
   ```
   python -c "
   from campaign_builder.agent.adapters.claude_sdk import ClaudeSDKAdapter
   from campaign_builder.agent.config import load_config
   adapter = ClaudeSDKAdapter(load_config())
   print(f'Name: {adapter.get_provider_name()}')
   print(f'Available: {adapter.is_available()}')
   "
   ```
   Expected: `Name: claude_sdk`, `Available: True`

2. Test basic query (requires API key):
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.adapters.claude_sdk import ClaudeSDKAdapter
   from campaign_builder.agent.config import load_config

   async def test():
       adapter = ClaudeSDKAdapter(load_config())
       result = await adapter.run(
           prompt='What is 2+2? Reply with just the number.',
           system_prompt='You are a calculator.',
           tools=[]
       )
       print(f'Success: {result.success}')
       print(f'Content: {result.content}')

   asyncio.run(test())
   "
   ```
   Expected: `Success: True`, `Content: 4`

3. Test with file reading:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.adapters.claude_sdk import ClaudeSDKAdapter
   from campaign_builder.agent.config import load_config

   async def test():
       adapter = ClaudeSDKAdapter(load_config())
       result = await adapter.run(
           prompt='Read /tmp/test_workspace/test.data and count the atoms',
           system_prompt='You analyze simulation files.',
           tools=[]  # Uses built-in Read tool
       )
       print(f'Success: {result.success}')
       print(f'Tool calls: {len(result.tool_calls)}')
       print(f'Content preview: {result.content[:100]}')

   asyncio.run(test())
   "
   ```
   Expected: Success with tool calls and atom count in content

4. Run adapter tests:
   ```
   pytest tests/test_adapter_claude_sdk.py -v
   ```
   Expected: All tests pass

### 4.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/adapters/__init__.py` | Created | Adapters package |
| `campaign_builder/agent/adapters/claude_sdk.py` | Created | Claude SDK adapter |
| `tests/test_adapter_claude_sdk.py` | Created | Adapter tests |

---

## Thrust 5: Anthropic Raw Adapter

### 5.1 Objective

Implement an adapter that uses the raw Anthropic Python SDK with a manual agentic loop, providing a fallback when the Claude Agent SDK has issues.

### 5.2 Background

The raw Anthropic SDK (`anthropic` package) provides direct API access without the CLI wrapper. This means:
- We must implement our own tool calling loop
- We have full control over the interaction
- Custom tools work without MCP complexity
- Useful as fallback or for simpler deployments

**Verified capabilities (tested 2025-12-28):**
- API connection works with key from .env
- Tool definitions in JSON Schema format work
- Agentic loop completes correctly
- Custom tool handlers execute successfully

### 5.3 Subtasks

#### 5.3.1 Create the adapter module

Create `campaign_builder/agent/adapters/anthropic_raw.py` with:

**AnthropicAdapter class (extends AgentProvider):**

Constructor:
- Accepts AgentConfig
- Creates anthropic.Anthropic client with API key
- Stores config for use in requests

#### 5.3.2 Implement the agentic loop

**run() method implementation:**

The core loop structure:

1. **Initialize:**
   - Convert ToolDefinition list to Anthropic tool format
   - Create initial messages list with user prompt
   - Set iteration counter to 0

2. **Loop while iterations < max_iterations:**
   - Call client.messages.create() with:
     - model from config
     - system prompt
     - messages list
     - tools list
     - max_tokens from config
   - Check stop_reason:
     - "end_turn" → Break loop, agent is done
     - "tool_use" → Process tool calls, continue
     - "max_tokens" → Log warning, continue
   - Process response content blocks
   - Increment iteration counter

3. **Process tool calls:**
   - For each ToolUseBlock in response:
     - Find matching ToolDefinition by name
     - Call handler with input arguments
     - Record ToolCall in results
     - Create tool_result message
   - Append assistant message and tool results to messages

4. **Build result:**
   - Extract final text from last response
   - Compile all tool calls
   - Calculate duration
   - Return AgentResult

#### 5.3.3 Tool format conversion

Convert ToolDefinition to Anthropic format:

Each tool becomes a dict with:
- `name`: Tool name
- `description`: Tool description
- `input_schema`: The JSON Schema (pass through directly)

Tool results format:
```python
{
    "role": "user",
    "content": [
        {
            "type": "tool_result",
            "tool_use_id": tool_block.id,
            "content": result_string
        }
    ]
}
```

#### 5.3.4 Implement streaming

**stream() method implementation:**

Use client.messages.stream() instead of create():
1. Create streaming context
2. Iterate through stream events
3. Yield StreamEvent for each:
   - content_block_delta with text → TextDelta
   - content_block_start with tool_use → ToolStart
   - Handle tool calls between stream segments
4. Continue loop if tool_use, else complete

#### 5.3.5 Error handling

Handle Anthropic-specific errors:
- APIConnectionError: Network issue → retry with backoff
- RateLimitError: Too many requests → exponential backoff
- APIStatusError: API error → check status code, handle appropriately
- AuthenticationError: Bad API key → raise clear error

Implement retry logic:
- Max 3 retries for transient errors
- Exponential backoff: 1s, 2s, 4s
- No retry for authentication errors

### 5.4 Verification Steps

1. Verify adapter instantiation:
   ```
   python -c "
   from campaign_builder.agent.adapters.anthropic_raw import AnthropicAdapter
   from campaign_builder.agent.config import load_config
   adapter = AnthropicAdapter(load_config())
   print(f'Name: {adapter.get_provider_name()}')
   print(f'Available: {adapter.is_available()}')
   "
   ```
   Expected: `Name: anthropic`, `Available: True`

2. Test basic query:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.adapters.anthropic_raw import AnthropicAdapter
   from campaign_builder.agent.config import load_config

   async def test():
       adapter = AnthropicAdapter(load_config())
       result = await adapter.run(
           prompt='What is 2+2? Reply with just the number.',
           system_prompt='You are a calculator.',
           tools=[]
       )
       print(f'Success: {result.success}')
       print(f'Content: {result.content}')
       print(f'Iterations: {result.iterations}')

   asyncio.run(test())
   "
   ```
   Expected: Success with "4" content, 1 iteration

3. Test with custom tool:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.adapters.anthropic_raw import AnthropicAdapter
   from campaign_builder.agent.config import load_config
   from campaign_builder.agent.tools import ToolDefinition

   async def read_file(args):
       with open(args['path']) as f:
           return f.read()

   tool = ToolDefinition(
       name='read_file',
       description='Read a file',
       parameters={
           'type': 'object',
           'properties': {'path': {'type': 'string'}},
           'required': ['path']
       },
       handler=read_file
   )

   async def test():
       adapter = AnthropicAdapter(load_config())
       result = await adapter.run(
           prompt='Read /tmp/test_workspace/test.data and count atoms',
           system_prompt='You analyze files.',
           tools=[tool]
       )
       print(f'Success: {result.success}')
       print(f'Tool calls: {len(result.tool_calls)}')
       print(f'Iterations: {result.iterations}')

   asyncio.run(test())
   "
   ```
   Expected: Success with 1+ tool calls, 2 iterations

4. Run adapter tests:
   ```
   pytest tests/test_adapter_anthropic.py -v
   ```
   Expected: All tests pass

### 5.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/adapters/anthropic_raw.py` | Created | Raw Anthropic adapter |
| `tests/test_adapter_anthropic.py` | Created | Adapter tests |

---

## Thrust 6: Mock Adapter

### 6.1 Objective

Implement a mock adapter that returns deterministic responses without making API calls, enabling fast unit testing and offline development.

### 6.2 Background

The mock adapter is essential for:
- Unit tests that shouldn't call real APIs
- CI/CD pipelines without API keys
- Offline development
- Debugging tool interactions

The mock should simulate realistic behavior:
- Process tool calls (actually execute handlers)
- Return sensible responses based on prompts
- Track all interactions for assertions

### 6.3 Subtasks

#### 6.3.1 Create the adapter module

Create `campaign_builder/agent/adapters/mock.py` with:

**MockAdapter class (extends AgentProvider):**

Constructor:
- Accepts AgentConfig
- Accepts optional response_map for custom responses
- Accepts optional tool_responses for mocked tool results

Configuration options:
- `auto_execute_tools: bool = True` - Whether to actually run tool handlers
- `default_response: str = "Mock response"` - Default when no match
- `simulate_iterations: int = 1` - How many iterations to simulate

#### 6.3.2 Response matching

Implement response matching based on prompt content:

**Built-in matchers:**
- If prompt contains "count" and "atoms" → return "20 atoms"
- If prompt contains "analyze" and ".data" → return mock FileGuide JSON
- If prompt contains "generate" and "LAMMPS" → return mock input script
- If prompt contains "validate" → return mock validation result

**Custom response map:**
```python
MockAdapter(response_map={
    r"what is \d+\+\d+": "4",
    r"read.*\.pdf": "PDF content here",
})
```

#### 6.3.3 Tool execution

The mock adapter should:
1. If auto_execute_tools is True:
   - Actually call tool handlers with inputs
   - Record real outputs in ToolCall
2. If auto_execute_tools is False:
   - Use tool_responses map for mocked outputs
   - Return predefined strings

This allows testing:
- Tool handler logic (real execution)
- Agent logic independent of tools (mocked execution)

#### 6.3.4 Interaction recording

Keep track of all interactions for test assertions:

**MockAdapter.interactions list:**
Each entry contains:
- `timestamp: datetime`
- `prompt: str`
- `system_prompt: str`
- `tools_provided: List[str]`
- `tools_called: List[ToolCall]`
- `response: str`

**Helper methods:**
- `get_last_interaction() -> Interaction`
- `get_tool_calls() -> List[ToolCall]`
- `reset() -> None` - Clear interaction history
- `assert_tool_called(name: str) -> None` - Assertion helper

#### 6.3.5 Streaming simulation

For stream() method:
- Yield TextDelta events with chunks of the response
- Simulate realistic delays (configurable)
- If tools would be called, yield ToolStart/ToolEnd events

### 6.4 Verification Steps

1. Verify mock instantiation:
   ```
   python -c "
   from campaign_builder.agent.adapters.mock import MockAdapter
   adapter = MockAdapter()
   print(f'Name: {adapter.get_provider_name()}')
   print(f'Available: {adapter.is_available()}')
   "
   ```
   Expected: `Name: mock`, `Available: True`

2. Test default response:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.adapters.mock import MockAdapter

   async def test():
       adapter = MockAdapter()
       result = await adapter.run(
           prompt='Hello',
           system_prompt='Be helpful',
           tools=[]
       )
       print(f'Success: {result.success}')
       print(f'Content: {result.content}')
       print(f'Iterations: {result.iterations}')

   asyncio.run(test())
   "
   ```
   Expected: Success with default response

3. Test custom response map:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.adapters.mock import MockAdapter

   async def test():
       adapter = MockAdapter(response_map={
           r'count.*atoms': '42 atoms in the file'
       })
       result = await adapter.run(
           prompt='count the atoms please',
           system_prompt='Analyze files',
           tools=[]
       )
       print(f'Content: {result.content}')

   asyncio.run(test())
   "
   ```
   Expected: "42 atoms in the file"

4. Test tool recording:
   ```
   python -c "
   import asyncio
   from campaign_builder.agent.adapters.mock import MockAdapter
   from campaign_builder.agent.tools import ToolDefinition

   async def test():
       async def my_tool(args):
           return 'tool result'

       tool = ToolDefinition('test', 'A test', {'type': 'object'}, my_tool)
       adapter = MockAdapter(auto_execute_tools=True)
       # Configure to simulate tool call
       result = await adapter.run(
           prompt='use test tool',
           system_prompt='Use tools',
           tools=[tool]
       )
       print(f'Interactions: {len(adapter.interactions)}')

   asyncio.run(test())
   "
   ```
   Expected: Interaction recorded

5. Run adapter tests:
   ```
   pytest tests/test_adapter_mock.py -v
   ```
   Expected: All tests pass

### 6.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/adapters/mock.py` | Created | Mock adapter |
| `tests/test_adapter_mock.py` | Created | Mock adapter tests |

---

## Phase 2 Completion Checklist

Before moving to Phase 3, verify:

- [ ] `adapters/__init__.py` exists and exports all adapters
- [ ] ClaudeSDKAdapter implements AgentProvider fully
- [ ] ClaudeSDKAdapter passes all tests
- [ ] AnthropicAdapter implements AgentProvider fully
- [ ] AnthropicAdapter passes all tests with real API
- [ ] MockAdapter implements AgentProvider fully
- [ ] MockAdapter works without API key
- [ ] Factory returns correct adapter for each provider name
- [ ] All adapters handle errors gracefully
- [ ] Streaming works for all adapters

---

## Next Document

Continue to [04-tools.md](./04-tools.md) for Thrusts 7-9: Migrating existing tools to the new registration system.
