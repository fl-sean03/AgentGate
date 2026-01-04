"""
Agent Interface - Abstract base classes and data types for LLM provider abstraction.

This module defines the contract between Campaign Builder's agents and LLM providers.
All adapters (Claude SDK, Anthropic Raw, Mock) implement the AgentProvider interface.

Components:
    - AgentProvider: Abstract base class for LLM adapters
    - AgentResult: Standardized result from agent execution
    - ToolCall: Record of a single tool invocation
    - AgentConfig: Configuration for agent behavior
    - StreamEvent types: Events yielded during streaming
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Callable, Dict, List, Optional, Union


# =============================================================================
# Configuration
# =============================================================================


@dataclass
class AgentConfig:
    """Configuration for agent behavior.

    Attributes:
        max_iterations: Maximum tool-calling rounds before stopping
        timeout: Timeout in seconds for the entire operation
        model: Model identifier (e.g., "claude-sonnet-4-20250514")
        temperature: Sampling temperature (0.0 = deterministic)
        max_tokens: Maximum tokens in response
        working_directory: Directory for file operations
    """
    max_iterations: int = 10
    timeout: int = 120
    model: str = "claude-sonnet-4-20250514"
    temperature: float = 0.0
    max_tokens: int = 4096
    working_directory: Optional[str] = None


# =============================================================================
# Result Types
# =============================================================================


@dataclass
class ToolCall:
    """Record of a single tool invocation.

    Attributes:
        id: Unique identifier for this tool call
        name: Name of the tool that was called
        input: Arguments passed to the tool
        output: Result returned by the tool
        duration_ms: How long the tool took to execute
        error: Error message if tool failed (None if successful)
    """
    id: str
    name: str
    input: Dict[str, Any]
    output: str
    duration_ms: int = 0
    error: Optional[str] = None

    @property
    def success(self) -> bool:
        """Whether the tool call succeeded."""
        return self.error is None


@dataclass
class AgentResult:
    """Standardized result from agent execution.

    Attributes:
        success: Whether the agent completed successfully
        content: The final text response from the agent
        tool_calls: All tool calls made during execution
        iterations: Number of LLM round-trips
        duration_ms: Total execution time in milliseconds
        usage: Token usage statistics (input_tokens, output_tokens)
        raw_response: Provider-specific response object for debugging
        error: Error message if failed
    """
    success: bool
    content: str
    tool_calls: List[ToolCall] = field(default_factory=list)
    iterations: int = 1
    duration_ms: int = 0
    usage: Optional[Dict[str, int]] = None
    raw_response: Any = None
    error: Optional[str] = None


# =============================================================================
# Stream Events
# =============================================================================


@dataclass
class TextDelta:
    """Partial text being generated."""
    text: str


@dataclass
class ToolStart:
    """Tool execution beginning."""
    id: str
    name: str
    input: Dict[str, Any]


@dataclass
class ToolEnd:
    """Tool execution complete."""
    id: str
    name: str
    output: str
    error: Optional[str] = None


@dataclass
class IterationStart:
    """New LLM round-trip starting."""
    iteration: int


@dataclass
class IterationEnd:
    """LLM round-trip complete."""
    iteration: int


@dataclass
class Complete:
    """Final result when agent completes."""
    result: AgentResult


# Union type for all stream events
StreamEvent = Union[TextDelta, ToolStart, ToolEnd, IterationStart, IterationEnd, Complete]


# =============================================================================
# Forward reference for ToolDefinition (defined in tools.py)
# =============================================================================

# Type alias - actual ToolDefinition is in tools.py to avoid circular imports
ToolDefinitionType = Any  # Will be ToolDefinition when imported


# =============================================================================
# Agent Provider Abstract Base Class
# =============================================================================


class AgentProvider(ABC):
    """Abstract base class for LLM provider adapters.

    All adapters (ClaudeSDKAdapter, AnthropicAdapter, MockAdapter) must
    implement this interface to work with Campaign Builder's agents.

    The run() method executes the agentic loop until completion or max iterations.
    The stream() method provides real-time feedback during execution.
    """

    def __init__(self, config: Optional[AgentConfig] = None):
        """Initialize the provider with configuration.

        Args:
            config: Agent configuration. Uses defaults if None.
        """
        self.config = config or AgentConfig()

    @abstractmethod
    async def run(
        self,
        prompt: str,
        system_prompt: str,
        tools: List[ToolDefinitionType],
        **kwargs: Any,
    ) -> AgentResult:
        """Execute the agentic loop until completion.

        Args:
            prompt: User prompt (what to do)
            system_prompt: System prompt (how to behave)
            tools: List of ToolDefinition objects available to the agent
            **kwargs: Provider-specific options

        Returns:
            AgentResult with final content and all tool calls
        """
        pass

    @abstractmethod
    async def stream(
        self,
        prompt: str,
        system_prompt: str,
        tools: List[ToolDefinitionType],
        **kwargs: Any,
    ) -> AsyncIterator[StreamEvent]:
        """Execute with real-time streaming of events.

        Args:
            prompt: User prompt (what to do)
            system_prompt: System prompt (how to behave)
            tools: List of ToolDefinition objects available to the agent
            **kwargs: Provider-specific options

        Yields:
            StreamEvent objects as they occur
        """
        # This needs to be a generator, so we yield nothing if not overridden
        # Subclasses must implement this properly
        if False:  # pragma: no cover
            yield Complete(AgentResult(success=False, content="Not implemented"))

    @abstractmethod
    def get_provider_name(self) -> str:
        """Get the name of this provider.

        Returns:
            Provider name (e.g., "claude_sdk", "anthropic", "mock")
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this provider is available.

        Returns:
            True if the provider can be used (dependencies installed, API key set, etc.)
        """
        pass


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    # Configuration
    "AgentConfig",
    # Result types
    "AgentResult",
    "ToolCall",
    # Stream events
    "TextDelta",
    "ToolStart",
    "ToolEnd",
    "IterationStart",
    "IterationEnd",
    "Complete",
    "StreamEvent",
    # Abstract base
    "AgentProvider",
]
