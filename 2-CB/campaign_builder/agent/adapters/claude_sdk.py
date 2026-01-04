"""
Claude Agent SDK Adapter.

This adapter uses the official Claude Agent SDK (claude-agent-sdk) to handle
agentic interactions. It leverages the SDK's built-in tool handling and
session management.

The SDK provides:
- Built-in tools (Read, Write, Glob, Grep, Bash)
- Automatic agentic loop handling
- Streaming support
"""

import logging
import os
import time
from typing import Any, AsyncIterator, Dict, List, Optional

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


# Try to import Claude SDK
try:
    from claude_code_sdk import query, ClaudeCodeOptions
    HAS_CLAUDE_SDK = True
except ImportError:
    HAS_CLAUDE_SDK = False
    query = None
    ClaudeCodeOptions = None


class ClaudeSDKAdapter(AgentProvider):
    """Adapter using the official Claude Agent SDK.

    This adapter uses the Claude Code SDK to run agentic queries. The SDK
    handles the agentic loop automatically, including tool execution and
    iteration management.

    The SDK uses Claude Code CLI under the hood, which provides built-in
    tools like Read, Write, Glob, Grep, and Bash.
    """

    def __init__(self, config: Optional[AgentConfig] = None):
        """Initialize the Claude SDK adapter.

        Args:
            config: Agent configuration
        """
        super().__init__(config)
        self._api_key = os.environ.get("ANTHROPIC_API_KEY")

    def get_provider_name(self) -> str:
        """Get the provider name."""
        return "claude_sdk"

    def is_available(self) -> bool:
        """Check if the Claude SDK is available."""
        if not HAS_CLAUDE_SDK:
            logger.debug("Claude SDK not installed")
            return False

        if not self._api_key:
            logger.debug("ANTHROPIC_API_KEY not set")
            return False

        return True

    def _convert_tools_to_allowed_list(
        self, tools: List[ToolDefinition]
    ) -> List[str]:
        """Convert ToolDefinitions to SDK allowed_tools list.

        The Claude SDK uses string names for built-in tools.
        Custom tools need MCP server setup.

        Args:
            tools: List of ToolDefinition objects

        Returns:
            List of tool names to allow
        """
        # Built-in tool mapping from our names to SDK names
        builtin_mapping = {
            "read_file": "Read",
            "write_file": "Write",
            "glob_files": "Glob",
            "grep_content": "Grep",
            "run_command": "Bash",
        }

        allowed = []
        for tool in tools:
            sdk_name = builtin_mapping.get(tool.name)
            if sdk_name:
                allowed.append(sdk_name)
            else:
                # Custom tool - would need MCP setup
                logger.debug(f"Custom tool {tool.name} not supported in SDK adapter")

        # Always include common built-in tools
        default_tools = ["Read", "Glob", "Grep"]
        for t in default_tools:
            if t not in allowed:
                allowed.append(t)

        return allowed

    async def run(
        self,
        prompt: str,
        system_prompt: str,
        tools: List[ToolDefinition],
        **kwargs: Any,
    ) -> AgentResult:
        """Execute the agentic loop using Claude SDK.

        Args:
            prompt: User prompt
            system_prompt: System prompt
            tools: List of available tools
            **kwargs: Additional options

        Returns:
            AgentResult with final content and tool calls
        """
        if not self.is_available():
            return AgentResult(
                success=False,
                content="",
                error="Claude SDK not available. Check installation and API key.",
            )

        start_time = time.time()
        tool_calls: List[ToolCall] = []
        iterations = 0
        final_content = ""

        try:
            # Build SDK options
            cwd = self.config.working_directory or os.getcwd()
            allowed_tools = self._convert_tools_to_allowed_list(tools)

            options = ClaudeCodeOptions(
                cwd=cwd,
                allowed_tools=allowed_tools,
                system_prompt=system_prompt,
                max_turns=self.config.max_iterations,
            )

            # Execute query
            logger.info(f"Running Claude SDK query with {len(allowed_tools)} tools")

            # The SDK returns an async iterator of messages
            async for message in query(prompt=prompt, options=options):
                # Process different message types
                msg_type = type(message).__name__

                if msg_type == "AssistantMessage":
                    iterations += 1
                    # Extract content from message
                    for block in getattr(message, "content", []):
                        block_type = type(block).__name__
                        if block_type == "TextBlock":
                            final_content += getattr(block, "text", "")
                        elif block_type == "ToolUseBlock":
                            tool_calls.append(ToolCall(
                                id=getattr(block, "id", ""),
                                name=getattr(block, "name", ""),
                                input=getattr(block, "input", {}),
                                output="",  # Filled in by ToolResult
                            ))

                elif msg_type == "ToolResultMessage" or msg_type == "UserMessage":
                    # Tool results come back as user messages
                    for block in getattr(message, "content", []):
                        block_type = type(block).__name__
                        if block_type == "ToolResultBlock":
                            # Match with pending tool call
                            tool_use_id = getattr(block, "tool_use_id", "")
                            result_content = getattr(block, "content", "")
                            for tc in tool_calls:
                                if tc.id == tool_use_id:
                                    tc.output = str(result_content)
                                    break

                elif msg_type == "ResultMessage":
                    # Final result
                    pass

            duration_ms = int((time.time() - start_time) * 1000)

            return AgentResult(
                success=True,
                content=final_content.strip(),
                tool_calls=tool_calls,
                iterations=iterations,
                duration_ms=duration_ms,
            )

        except Exception as e:
            logger.exception("Claude SDK query failed")
            duration_ms = int((time.time() - start_time) * 1000)
            return AgentResult(
                success=False,
                content="",
                tool_calls=tool_calls,
                iterations=iterations,
                duration_ms=duration_ms,
                error=str(e),
            )

    async def stream(
        self,
        prompt: str,
        system_prompt: str,
        tools: List[ToolDefinition],
        **kwargs: Any,
    ) -> AsyncIterator[StreamEvent]:
        """Execute with streaming of events.

        Args:
            prompt: User prompt
            system_prompt: System prompt
            tools: List of available tools
            **kwargs: Additional options

        Yields:
            StreamEvent objects as they occur
        """
        if not self.is_available():
            yield Complete(AgentResult(
                success=False,
                content="",
                error="Claude SDK not available",
            ))
            return

        start_time = time.time()
        tool_calls: List[ToolCall] = []
        iterations = 0
        final_content = ""

        try:
            cwd = self.config.working_directory or os.getcwd()
            allowed_tools = self._convert_tools_to_allowed_list(tools)

            options = ClaudeCodeOptions(
                cwd=cwd,
                allowed_tools=allowed_tools,
                system_prompt=system_prompt,
                max_turns=self.config.max_iterations,
            )

            async for message in query(prompt=prompt, options=options):
                msg_type = type(message).__name__

                if msg_type == "AssistantMessage":
                    iterations += 1
                    yield IterationStart(iteration=iterations)

                    for block in getattr(message, "content", []):
                        block_type = type(block).__name__
                        if block_type == "TextBlock":
                            text = getattr(block, "text", "")
                            final_content += text
                            yield TextDelta(text=text)
                        elif block_type == "ToolUseBlock":
                            tool_id = getattr(block, "id", "")
                            tool_name = getattr(block, "name", "")
                            tool_input = getattr(block, "input", {})
                            tool_calls.append(ToolCall(
                                id=tool_id,
                                name=tool_name,
                                input=tool_input,
                                output="",
                            ))
                            yield ToolStart(
                                id=tool_id,
                                name=tool_name,
                                input=tool_input,
                            )

                    yield IterationEnd(iteration=iterations)

                elif msg_type == "ToolResultMessage" or msg_type == "UserMessage":
                    for block in getattr(message, "content", []):
                        block_type = type(block).__name__
                        if block_type == "ToolResultBlock":
                            tool_use_id = getattr(block, "tool_use_id", "")
                            result_content = str(getattr(block, "content", ""))
                            for tc in tool_calls:
                                if tc.id == tool_use_id:
                                    tc.output = result_content
                                    yield ToolEnd(
                                        id=tool_use_id,
                                        name=tc.name,
                                        output=result_content,
                                    )
                                    break

            duration_ms = int((time.time() - start_time) * 1000)
            yield Complete(AgentResult(
                success=True,
                content=final_content.strip(),
                tool_calls=tool_calls,
                iterations=iterations,
                duration_ms=duration_ms,
            ))

        except Exception as e:
            logger.exception("Claude SDK streaming failed")
            duration_ms = int((time.time() - start_time) * 1000)
            yield Complete(AgentResult(
                success=False,
                content=final_content,
                tool_calls=tool_calls,
                iterations=iterations,
                duration_ms=duration_ms,
                error=str(e),
            ))


# =============================================================================
# Exports
# =============================================================================

__all__ = ["ClaudeSDKAdapter"]
