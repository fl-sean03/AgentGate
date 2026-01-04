"""
Mock Adapter for Testing.

This adapter returns deterministic responses without making API calls.
It's essential for:
- Unit tests that shouldn't call real APIs
- CI/CD pipelines without API keys
- Offline development
- Debugging tool interactions

The mock can execute tool handlers for real, or return mocked results.
"""

import asyncio
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, AsyncIterator, Dict, List, Optional, Pattern

from ..interface import (
    AgentConfig,
    AgentProvider,
    AgentResult,
    Complete,
    IterationEnd,
    IterationStart,
    StreamEvent,
    TextDelta,
    ToolCall,
    ToolEnd,
    ToolStart,
)
from ..tool_types import ToolDefinition


logger = logging.getLogger(__name__)


# =============================================================================
# Interaction Recording
# =============================================================================


@dataclass
class Interaction:
    """Record of a single interaction with the mock adapter.

    Attributes:
        timestamp: When the interaction occurred
        prompt: User prompt
        system_prompt: System prompt
        tools_provided: Names of tools provided
        tools_called: Tool calls that were made
        response: The response returned
    """
    timestamp: datetime
    prompt: str
    system_prompt: str
    tools_provided: List[str]
    tools_called: List[ToolCall]
    response: str


# =============================================================================
# Mock Adapter
# =============================================================================


class MockAdapter(AgentProvider):
    """Mock adapter for testing without API calls.

    Features:
    - Pattern-based response matching
    - Optional real tool execution
    - Interaction recording for assertions
    - Configurable tool call simulation

    Configuration:
        response_map: Dict mapping regex patterns to responses
        auto_execute_tools: Whether to run tool handlers (default: True)
        tool_responses: Mocked tool outputs (used when auto_execute_tools=False)
        default_response: Response when no pattern matches
        simulate_iterations: Number of iterations to simulate
    """

    def __init__(
        self,
        config: Optional[AgentConfig] = None,
        response_map: Optional[Dict[str, str]] = None,
        auto_execute_tools: bool = True,
        tool_responses: Optional[Dict[str, str]] = None,
        default_response: str = "Mock response",
        simulate_iterations: int = 1,
        simulate_tool_calls: Optional[List[Dict[str, Any]]] = None,
    ):
        """Initialize the mock adapter.

        Args:
            config: Agent configuration
            response_map: Dict mapping regex patterns to responses
            auto_execute_tools: Whether to actually run tool handlers
            tool_responses: Mocked tool outputs when not executing
            default_response: Response when no pattern matches
            simulate_iterations: Number of iterations to simulate
            simulate_tool_calls: Tool calls to simulate
        """
        super().__init__(config)
        self.response_map = response_map or {}
        self.auto_execute_tools = auto_execute_tools
        self.tool_responses = tool_responses or {}
        self.default_response = default_response
        self.simulate_iterations = simulate_iterations
        self.simulate_tool_calls = simulate_tool_calls or []

        # Compiled patterns for matching
        self._compiled_patterns: List[tuple[Pattern, str]] = []
        for pattern, response in self.response_map.items():
            try:
                self._compiled_patterns.append((re.compile(pattern, re.IGNORECASE), response))
            except re.error as e:
                logger.warning(f"Invalid regex pattern '{pattern}': {e}")

        # Interaction history
        self.interactions: List[Interaction] = []

        # Built-in response patterns for common scenarios
        self._builtin_patterns = [
            (re.compile(r"count.*atoms", re.I), "20 atoms in the file"),
            (re.compile(r"analyze.*\.data", re.I), '{"file_type": "lammps_data", "atom_count": 20}'),
            (re.compile(r"generate.*lammps", re.I), "# LAMMPS input script\nunits real\natom_style full\nrun 1000"),
            (re.compile(r"validate", re.I), '{"passed": true, "errors": [], "warnings": []}'),
            (re.compile(r"what is (\d+)\s*\+\s*(\d+)", re.I), self._calculate_sum),
        ]

    def _calculate_sum(self, match: re.Match) -> str:
        """Calculate sum from regex match."""
        a = int(match.group(1))
        b = int(match.group(2))
        return str(a + b)

    def get_provider_name(self) -> str:
        """Get the provider name."""
        return "mock"

    def is_available(self) -> bool:
        """Mock is always available."""
        return True

    def _find_response(self, prompt: str) -> str:
        """Find a response matching the prompt.

        Args:
            prompt: The user prompt

        Returns:
            Matching response or default
        """
        # Check custom patterns first
        for pattern, response in self._compiled_patterns:
            if pattern.search(prompt):
                logger.debug(f"Matched custom pattern: {pattern.pattern}")
                return response

        # Check built-in patterns
        for pattern, response in self._builtin_patterns:
            match = pattern.search(prompt)
            if match:
                logger.debug(f"Matched builtin pattern: {pattern.pattern}")
                if callable(response):
                    return response(match)
                return response

        return self.default_response

    def _find_tool(self, name: str, tools: List[ToolDefinition]) -> Optional[ToolDefinition]:
        """Find a tool by name."""
        for tool in tools:
            if tool.name == name:
                return tool
        return None

    async def _execute_tool(
        self, tool: ToolDefinition, input_args: Dict[str, Any]
    ) -> str:
        """Execute a tool (real or mocked).

        Args:
            tool: The tool to execute
            input_args: Arguments for the tool

        Returns:
            Tool output
        """
        if self.auto_execute_tools:
            # Actually run the handler
            try:
                return await tool.handler(input_args)
            except Exception as e:
                logger.warning(f"Tool {tool.name} failed: {e}")
                return f"Error: {e}"
        else:
            # Return mocked response
            return self.tool_responses.get(tool.name, f"Mocked result for {tool.name}")

    async def run(
        self,
        prompt: str,
        system_prompt: str,
        tools: List[ToolDefinition],
        **kwargs: Any,
    ) -> AgentResult:
        """Execute mock query.

        Args:
            prompt: User prompt
            system_prompt: System prompt
            tools: List of available tools
            **kwargs: Additional options

        Returns:
            AgentResult with mock content
        """
        start_time = time.time()
        tool_calls: List[ToolCall] = []

        # Simulate iterations
        iterations = self.simulate_iterations

        # Simulate tool calls if configured
        for tc_config in self.simulate_tool_calls:
            tool_name = tc_config.get("name", "mock_tool")
            tool_input = tc_config.get("input", {})

            tool = self._find_tool(tool_name, tools)
            if tool:
                output = await self._execute_tool(tool, tool_input)
            else:
                output = self.tool_responses.get(tool_name, f"Mock output for {tool_name}")

            tool_calls.append(ToolCall(
                id=str(uuid.uuid4()),
                name=tool_name,
                input=tool_input,
                output=output,
                duration_ms=10,  # Simulated duration
            ))

        # Find response
        response = self._find_response(prompt)

        duration_ms = int((time.time() - start_time) * 1000)

        # Record interaction
        self.interactions.append(Interaction(
            timestamp=datetime.now(),
            prompt=prompt,
            system_prompt=system_prompt,
            tools_provided=[t.name for t in tools],
            tools_called=tool_calls,
            response=response,
        ))

        return AgentResult(
            success=True,
            content=response,
            tool_calls=tool_calls,
            iterations=iterations,
            duration_ms=duration_ms,
        )

    async def stream(
        self,
        prompt: str,
        system_prompt: str,
        tools: List[ToolDefinition],
        **kwargs: Any,
    ) -> AsyncIterator[StreamEvent]:
        """Execute mock query with streaming simulation.

        Args:
            prompt: User prompt
            system_prompt: System prompt
            tools: List of available tools
            **kwargs: Additional options

        Yields:
            StreamEvent objects simulating real streaming
        """
        start_time = time.time()
        tool_calls: List[ToolCall] = []

        yield IterationStart(iteration=1)

        # Simulate tool calls
        for tc_config in self.simulate_tool_calls:
            tool_name = tc_config.get("name", "mock_tool")
            tool_input = tc_config.get("input", {})
            tool_id = str(uuid.uuid4())

            yield ToolStart(id=tool_id, name=tool_name, input=tool_input)

            tool = self._find_tool(tool_name, tools)
            if tool:
                output = await self._execute_tool(tool, tool_input)
            else:
                output = self.tool_responses.get(tool_name, f"Mock output for {tool_name}")

            tool_calls.append(ToolCall(
                id=tool_id,
                name=tool_name,
                input=tool_input,
                output=output,
                duration_ms=10,
            ))

            yield ToolEnd(id=tool_id, name=tool_name, output=output)

        # Find and stream response in chunks
        response = self._find_response(prompt)
        chunk_size = 20

        for i in range(0, len(response), chunk_size):
            chunk = response[i:i + chunk_size]
            yield TextDelta(text=chunk)
            await asyncio.sleep(0.01)  # Small delay to simulate streaming

        yield IterationEnd(iteration=1)

        duration_ms = int((time.time() - start_time) * 1000)

        # Record interaction
        self.interactions.append(Interaction(
            timestamp=datetime.now(),
            prompt=prompt,
            system_prompt=system_prompt,
            tools_provided=[t.name for t in tools],
            tools_called=tool_calls,
            response=response,
        ))

        yield Complete(AgentResult(
            success=True,
            content=response,
            tool_calls=tool_calls,
            iterations=self.simulate_iterations,
            duration_ms=duration_ms,
        ))

    # =========================================================================
    # Helper Methods for Testing
    # =========================================================================

    def get_last_interaction(self) -> Optional[Interaction]:
        """Get the most recent interaction.

        Returns:
            Last Interaction or None if no interactions
        """
        return self.interactions[-1] if self.interactions else None

    def get_all_tool_calls(self) -> List[ToolCall]:
        """Get all tool calls from all interactions.

        Returns:
            List of all ToolCall objects
        """
        result = []
        for interaction in self.interactions:
            result.extend(interaction.tools_called)
        return result

    def reset(self) -> None:
        """Clear interaction history."""
        self.interactions.clear()
        logger.debug("Mock adapter interactions cleared")

    def assert_tool_called(self, name: str) -> None:
        """Assert that a tool was called.

        Args:
            name: Tool name to check

        Raises:
            AssertionError: If tool was not called
        """
        for interaction in self.interactions:
            for tc in interaction.tools_called:
                if tc.name == name:
                    return
        raise AssertionError(f"Tool '{name}' was not called")

    def assert_tool_not_called(self, name: str) -> None:
        """Assert that a tool was not called.

        Args:
            name: Tool name to check

        Raises:
            AssertionError: If tool was called
        """
        for interaction in self.interactions:
            for tc in interaction.tools_called:
                if tc.name == name:
                    raise AssertionError(f"Tool '{name}' was called unexpectedly")

    def set_response(self, pattern: str, response: str) -> None:
        """Add or update a response pattern.

        Args:
            pattern: Regex pattern to match
            response: Response to return
        """
        self.response_map[pattern] = response
        try:
            self._compiled_patterns.append((re.compile(pattern, re.IGNORECASE), response))
        except re.error as e:
            logger.warning(f"Invalid regex pattern '{pattern}': {e}")

    def set_tool_response(self, tool_name: str, response: str) -> None:
        """Set a mocked response for a tool.

        Args:
            tool_name: Name of the tool
            response: Response to return
        """
        self.tool_responses[tool_name] = response


# =============================================================================
# Exports
# =============================================================================

__all__ = ["MockAdapter", "Interaction"]
