# DevGuide v0.3.0: Foundation Layer

**Thrusts 1-3: Interface, Tools, Configuration**

---

## Thrust 1: Agent Interface Definition

### 1.1 Objective

Create an abstract interface that defines the contract between Campaign Builder's agents (FileAnalyzer, CampaignPlanner) and the underlying LLM providers (Claude SDK, raw Anthropic, mock).

### 1.2 Background

The Agent Interface is the heart of the abstraction layer. It must:
- Be simple enough that implementing a new adapter is straightforward
- Be complete enough that all agent functionality is supported
- Support both synchronous (run) and streaming (stream) operations
- Handle tool definitions in a provider-agnostic way

The interface lives in `campaign_builder/agent/interface.py` and consists of three main components:
1. **AgentProvider** - Abstract base class that adapters implement
2. **AgentResult** - Standardized result returned by all providers
3. **ToolCall** - Record of a tool invocation

### 1.3 Subtasks

#### 1.3.1 Create the interface module

Create the file `campaign_builder/agent/interface.py` with the following components:

**AgentResult dataclass:**
- `success: bool` - Whether the agent completed successfully
- `content: str` - The final text response from the agent
- `tool_calls: List[ToolCall]` - All tool calls made during execution
- `iterations: int` - Number of LLM round-trips
- `duration_ms: int` - Total execution time in milliseconds
- `usage: Optional[dict]` - Token usage statistics (input, output tokens)
- `raw_response: Any` - Provider-specific response object for debugging

**ToolCall dataclass:**
- `id: str` - Unique identifier for the tool call
- `name: str` - Name of the tool that was called
- `input: dict` - Arguments passed to the tool
- `output: str` - Result returned by the tool
- `duration_ms: int` - How long the tool took to execute
- `error: Optional[str]` - Error message if tool failed

**AgentProvider abstract class:**

Methods to implement:
- `async run(prompt, system_prompt, tools, **kwargs) -> AgentResult`
- `async stream(prompt, system_prompt, tools, **kwargs) -> AsyncIterator[StreamEvent]`
- `get_provider_name() -> str`
- `is_available() -> bool`

The `run` method is the core functionality. It:
- Takes a user prompt (what to do)
- Takes a system prompt (how to behave)
- Takes a list of ToolDefinition objects
- Executes the agentic loop until completion or max iterations
- Returns AgentResult with all information

The `stream` method is optional for real-time feedback. It yields events as they happen.

#### 1.3.2 Define StreamEvent types

Create dataclasses for streaming events that adapters can yield:
- `TextDelta(text: str)` - Partial text being generated
- `ToolStart(name: str, input: dict)` - Tool execution beginning
- `ToolEnd(name: str, output: str)` - Tool execution complete
- `IterationStart(iteration: int)` - New LLM round-trip starting
- `IterationEnd(iteration: int)` - LLM round-trip complete
- `Complete(result: AgentResult)` - Final result

#### 1.3.3 Add configuration dataclass

Create AgentConfig dataclass for provider configuration:
- `max_iterations: int = 10` - Maximum tool-calling rounds
- `timeout: int = 120` - Timeout in seconds
- `model: str = "claude-sonnet-4-20250514"` - Model identifier
- `temperature: float = 0.0` - Sampling temperature
- `max_tokens: int = 4096` - Maximum response tokens

### 1.4 Verification Steps

1. Import the interface module without errors:
   ```
   python -c "from campaign_builder.agent.interface import AgentProvider, AgentResult, ToolCall"
   ```
   Expected: No import errors

2. Verify AgentProvider cannot be instantiated directly:
   ```
   python -c "from campaign_builder.agent.interface import AgentProvider; AgentProvider()"
   ```
   Expected: TypeError about abstract methods

3. Run unit tests for interface:
   ```
   pytest tests/test_agent_interface.py -v
   ```
   Expected: All tests pass

### 1.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/interface.py` | Created | Abstract interface definitions |
| `tests/test_agent_interface.py` | Created | Interface contract tests |

---

## Thrust 2: Tool Definition System

### 2.1 Objective

Create a unified tool definition system that allows tools to be defined once and used by any adapter.

### 2.2 Background

Different LLM providers have different tool/function calling formats:
- Claude uses JSON Schema for input_schema
- OpenAI uses a similar but slightly different format
- Claude Agent SDK uses its @tool decorator

The ToolDefinition system normalizes this. A tool is defined once with:
- A name
- A description
- A JSON Schema for parameters
- A Python async function handler

Adapters then convert ToolDefinition to their native format.

### 2.3 Subtasks

#### 2.3.1 Create ToolDefinition dataclass

Create in `campaign_builder/agent/tools.py`:

**ToolDefinition dataclass:**
- `name: str` - Unique tool identifier (e.g., "read_pdf")
- `description: str` - What the tool does (shown to LLM)
- `parameters: dict` - JSON Schema for input parameters
- `handler: Callable[[dict], Awaitable[str]]` - Async function that executes the tool

The handler function:
- Receives a dict of validated parameters
- Returns a string (tool output)
- Can raise ToolError for graceful error handling

**ToolError exception:**
- `message: str` - Error description
- `recoverable: bool` - Whether LLM should retry

#### 2.3.2 Create ToolRegistry class

Create in `campaign_builder/agent/registry.py`:

**ToolRegistry class:**
- `register(tool: ToolDefinition) -> None` - Add tool to registry
- `get(name: str) -> Optional[ToolDefinition]` - Get tool by name
- `list_all() -> List[ToolDefinition]` - Get all registered tools
- `list_names() -> List[str]` - Get all tool names
- `filter_by_names(names: List[str]) -> List[ToolDefinition]` - Get subset of tools

**Global registry instance:**
- Create a singleton `default_registry` that tools register to
- Provide `register_tool` function decorator for convenience

#### 2.3.3 Create tool decorator

Create a convenience decorator in `campaign_builder/agent/tools.py`:

The decorator should:
- Take name, description, and parameters as arguments
- Wrap an async function
- Create a ToolDefinition
- Optionally auto-register to default registry

Example usage (documentation only, not code):
```
@register_tool("read_pdf", "Extract text from PDF", {"path": str})
async def read_pdf(args: dict) -> str:
    # Implementation
    return extracted_text
```

#### 2.3.4 Define parameter schema helpers

Create helpers for common parameter patterns:
- `string_param(description)` - Returns JSON Schema for string
- `number_param(description)` - Returns JSON Schema for number
- `boolean_param(description)` - Returns JSON Schema for boolean
- `enum_param(description, values)` - Returns JSON Schema for enum
- `object_param(description, properties)` - Returns JSON Schema for object

### 2.4 Verification Steps

1. Create and register a test tool:
   ```
   python -c "
   from campaign_builder.agent.tools import ToolDefinition
   from campaign_builder.agent.registry import ToolRegistry

   async def handler(args):
       return 'test'

   tool = ToolDefinition(
       name='test_tool',
       description='A test tool',
       parameters={'type': 'object', 'properties': {}},
       handler=handler
   )

   registry = ToolRegistry()
   registry.register(tool)
   print(registry.list_names())
   "
   ```
   Expected: `['test_tool']`

2. Verify schema helpers work:
   ```
   python -c "
   from campaign_builder.agent.tools import string_param
   print(string_param('A test string'))
   "
   ```
   Expected: `{'type': 'string', 'description': 'A test string'}`

3. Run unit tests:
   ```
   pytest tests/test_agent_tools.py -v
   ```
   Expected: All tests pass

### 2.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/tools.py` | Created | ToolDefinition and helpers |
| `campaign_builder/agent/registry.py` | Created | ToolRegistry class |
| `tests/test_agent_tools.py` | Created | Tool system tests |

---

## Thrust 3: Configuration and Factory

### 3.1 Objective

Create a configuration system that reads environment variables and a factory function that returns the appropriate AgentProvider.

### 3.2 Background

The factory pattern allows the rest of the codebase to request an AgentProvider without knowing which implementation is being used. Configuration determines:
- Which provider to use (claude_sdk, anthropic, mock)
- API keys and authentication
- Model selection
- Timeout and iteration limits

### 3.3 Subtasks

#### 3.3.1 Create configuration module

Create `campaign_builder/agent/config.py` with:

**AgentEnvironment dataclass:**
- `provider: str` - Provider name from AGENT_PROVIDER env var
- `api_key: Optional[str]` - API key from ANTHROPIC_API_KEY
- `model: str` - Model from CLAUDE_MODEL env var
- `max_iterations: int` - From AGENT_MAX_ITERATIONS
- `timeout: int` - From AGENT_TIMEOUT
- `working_directory: Path` - Current working directory

**load_config() function:**
- Reads from environment variables
- Uses python-dotenv to load .env file
- Returns AgentEnvironment with defaults for missing values

**Default values:**
- provider: "claude_sdk"
- model: "claude-sonnet-4-20250514"
- max_iterations: 10
- timeout: 120

#### 3.3.2 Create factory module

Create `campaign_builder/agent/factory.py` with:

**get_provider(config: Optional[AgentEnvironment] = None) -> AgentProvider:**
- If config is None, calls load_config()
- Based on config.provider, instantiates appropriate adapter:
  - "claude_sdk" → ClaudeSDKAdapter
  - "anthropic" → AnthropicAdapter
  - "mock" → MockAdapter
- Passes config to adapter constructor
- Returns the adapter instance

**Provider registry:**
- Dictionary mapping provider names to adapter classes
- Allows registration of custom providers
- Provides list_providers() function

#### 3.3.3 Add validation

The factory should validate:
- Provider name is recognized
- API key is present for providers that need it
- Model name is valid format
- Timeout and iterations are positive

Validation errors should raise ConfigurationError with clear messages.

#### 3.3.4 Environment file documentation

Update `.env` file with all configuration options and documentation comments.

### 3.4 Verification Steps

1. Load default configuration:
   ```
   python -c "
   from campaign_builder.agent.config import load_config
   config = load_config()
   print(f'Provider: {config.provider}')
   print(f'Model: {config.model}')
   "
   ```
   Expected: Shows configured values

2. Get provider from factory:
   ```
   python -c "
   from campaign_builder.agent.factory import get_provider
   provider = get_provider()
   print(f'Provider: {provider.get_provider_name()}')
   print(f'Available: {provider.is_available()}')
   "
   ```
   Expected: Shows provider name and availability

3. Test with mock provider:
   ```
   AGENT_PROVIDER=mock python -c "
   from campaign_builder.agent.factory import get_provider
   provider = get_provider()
   print(provider.get_provider_name())
   "
   ```
   Expected: `mock`

4. Run unit tests:
   ```
   pytest tests/test_agent_config.py tests/test_agent_factory.py -v
   ```
   Expected: All tests pass

### 3.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `campaign_builder/agent/config.py` | Created | Configuration loading |
| `campaign_builder/agent/factory.py` | Created | Provider factory |
| `.env` | Modified | Add all configuration options |
| `tests/test_agent_config.py` | Created | Configuration tests |
| `tests/test_agent_factory.py` | Created | Factory tests |

---

## Phase 1 Completion Checklist

Before moving to Phase 2, verify:

- [ ] `interface.py` exists with AgentProvider, AgentResult, ToolCall
- [ ] AgentProvider is abstract and cannot be instantiated
- [ ] `tools.py` exists with ToolDefinition and helpers
- [ ] `registry.py` exists with ToolRegistry
- [ ] Tools can be registered and retrieved
- [ ] `config.py` exists with load_config()
- [ ] `factory.py` exists with get_provider()
- [ ] Factory returns different providers based on config
- [ ] All unit tests pass
- [ ] No existing tests are broken

---

## Next Document

Continue to [03-adapters.md](./03-adapters.md) for Thrusts 4-6: Claude SDK, Anthropic Raw, and Mock adapter implementations.
