"""
Anthropic Raw SDK Adapter.

This adapter uses the raw Anthropic Python SDK with a manual agentic loop.
It provides full control over the interaction and works well with custom tools.

The manual loop:
1. Send message with tools
2. If response has tool_use, execute tools and send results
3. Repeat until end_turn or max iterations
"""

import asyncio
import logging
import os
import time
import uuid
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
from ..tool_types import ToolDefinition, ToolError


logger = logging.getLogger(__name__)


# Try to import Anthropic SDK
try:
    import anthropic
    from anthropic.types import (
        Message,
        TextBlock,
        ToolUseBlock,
    )
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False
    anthropic = None
    Message = None
    TextBlock = None
    ToolUseBlock = None


class AnthropicAdapter(AgentProvider):
    """Adapter using the raw Anthropic Python SDK.

    This adapter implements the agentic loop manually, giving full control
    over tool execution and error handling. It works well with custom tools
    since they can be executed directly without MCP server setup.

    The loop continues until:
    - stop_reason is "end_turn"
    - max_iterations is reached
    - An unrecoverable error occurs
    """

    def __init__(self, config: Optional[AgentConfig] = None):
        """Initialize the Anthropic adapter.

        Args:
            config: Agent configuration
        """
        super().__init__(config)
        self._api_key = os.environ.get("ANTHROPIC_API_KEY")
        self._client: Optional[anthropic.Anthropic] = None

    def _get_client(self) -> "anthropic.Anthropic":
        """Get or create the Anthropic client."""
        if self._client is None:
            if not HAS_ANTHROPIC:
                raise RuntimeError("Anthropic SDK not installed")
            self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

    def get_provider_name(self) -> str:
        """Get the provider name."""
        return "anthropic"

    def is_available(self) -> bool:
        """Check if Anthropic SDK is available."""
        if not HAS_ANTHROPIC:
            logger.debug("Anthropic SDK not installed")
            return False

        if not self._api_key:
            logger.debug("ANTHROPIC_API_KEY not set")
            return False

        return True

    def _convert_tools_to_anthropic_format(
        self, tools: List[ToolDefinition]
    ) -> List[Dict[str, Any]]:
        """Convert ToolDefinitions to Anthropic API format.

        Args:
            tools: List of ToolDefinition objects

        Returns:
            List of tool dicts for Anthropic API
        """
        return [tool.to_anthropic_format() for tool in tools]

    def _find_tool(self, name: str, tools: List[ToolDefinition]) -> Optional[ToolDefinition]:
        """Find a tool by name."""
        for tool in tools:
            if tool.name == name:
                return tool
        return None

    def _extract_usage(self, response: "Message") -> Optional[Dict[str, int]]:
        """Extract usage statistics from Anthropic response.

        Args:
            response: Anthropic Message response

        Returns:
            Dict with input_tokens and output_tokens, or None
        """
        if not hasattr(response, "usage") or response.usage is None:
            return None
        return {
            "input_tokens": getattr(response.usage, "input_tokens", 0),
            "output_tokens": getattr(response.usage, "output_tokens", 0),
        }

    async def _execute_tool(
        self, tool: ToolDefinition, input_args: Dict[str, Any]
    ) -> str:
        """Execute a tool and return the result.

        Args:
            tool: The tool to execute
            input_args: Arguments for the tool

        Returns:
            Tool output as string
        """
        start_time = time.time()
        try:
            result = await tool.handler(input_args)
            duration_ms = int((time.time() - start_time) * 1000)
            logger.debug(f"Tool {tool.name} completed in {duration_ms}ms")
            return result
        except ToolError as e:
            logger.warning(f"Tool {tool.name} failed: {e.message}")
            return f"Error: {e.message}"
        except Exception as e:
            logger.exception(f"Tool {tool.name} raised exception")
            return f"Error: {str(e)}"

    async def run(
        self,
        prompt: str,
        system_prompt: str,
        tools: List[ToolDefinition],
        **kwargs: Any,
    ) -> AgentResult:
        """Execute the agentic loop manually.

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
                error="Anthropic SDK not available. Check installation and API key.",
            )

        start_time = time.time()
        all_tool_calls: List[ToolCall] = []
        iterations = 0
        final_content = ""

        # Convert tools to Anthropic format
        anthropic_tools = self._convert_tools_to_anthropic_format(tools)

        # Initialize messages
        messages = [{"role": "user", "content": prompt}]

        client = self._get_client()

        try:
            while iterations < self.config.max_iterations:
                iterations += 1
                logger.debug(f"Iteration {iterations}/{self.config.max_iterations}")

                # Make API call - only pass tools if we have them
                create_kwargs = {
                    "model": self.config.model,
                    "max_tokens": self.config.max_tokens,
                    "system": system_prompt,
                    "messages": messages,
                }
                if anthropic_tools:
                    create_kwargs["tools"] = anthropic_tools

                response = client.messages.create(**create_kwargs)

                # Process response content
                assistant_content = []
                pending_tool_calls: List[Dict[str, Any]] = []

                for block in response.content:
                    if isinstance(block, TextBlock):
                        final_content += block.text
                        assistant_content.append({
                            "type": "text",
                            "text": block.text,
                        })
                    elif isinstance(block, ToolUseBlock):
                        assistant_content.append({
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": block.input,
                        })
                        pending_tool_calls.append({
                            "id": block.id,
                            "name": block.name,
                            "input": block.input,
                        })

                # Add assistant message to history
                messages.append({
                    "role": "assistant",
                    "content": assistant_content,
                })

                # Check stop reason
                if response.stop_reason == "end_turn":
                    logger.debug("Agent finished (end_turn)")
                    break

                if response.stop_reason == "max_tokens":
                    logger.warning("Response truncated (max_tokens)")
                    # Continue to process any tool calls

                # Execute tool calls if any
                if pending_tool_calls:
                    tool_results = []
                    for tc in pending_tool_calls:
                        tool = self._find_tool(tc["name"], tools)
                        if tool:
                            tool_start = time.time()
                            output = await self._execute_tool(tool, tc["input"])
                            duration_ms = int((time.time() - tool_start) * 1000)

                            all_tool_calls.append(ToolCall(
                                id=tc["id"],
                                name=tc["name"],
                                input=tc["input"],
                                output=output,
                                duration_ms=duration_ms,
                            ))

                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": tc["id"],
                                "content": output,
                            })
                        else:
                            # Tool not found
                            all_tool_calls.append(ToolCall(
                                id=tc["id"],
                                name=tc["name"],
                                input=tc["input"],
                                output="",
                                error=f"Tool '{tc['name']}' not found",
                            ))
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": tc["id"],
                                "content": f"Error: Tool '{tc['name']}' not found",
                                "is_error": True,
                            })

                    # Add tool results as user message
                    messages.append({
                        "role": "user",
                        "content": tool_results,
                    })
                else:
                    # No tool calls and not end_turn - shouldn't happen normally
                    logger.debug(f"No tool calls, stop_reason={response.stop_reason}")
                    break

            duration_ms = int((time.time() - start_time) * 1000)

            return AgentResult(
                success=True,
                content=final_content.strip(),
                tool_calls=all_tool_calls,
                iterations=iterations,
                duration_ms=duration_ms,
usage=self._extract_usage(response) if response else None,
            )

        except anthropic.AuthenticationError as e:
            logger.error(f"Authentication failed: {e}")
            return AgentResult(
                success=False,
                content="",
                tool_calls=all_tool_calls,
                iterations=iterations,
                duration_ms=int((time.time() - start_time) * 1000),
                error=f"Authentication failed: {e}",
            )

        except anthropic.RateLimitError as e:
            logger.error(f"Rate limit exceeded: {e}")
            return AgentResult(
                success=False,
                content=final_content,
                tool_calls=all_tool_calls,
                iterations=iterations,
                duration_ms=int((time.time() - start_time) * 1000),
                error=f"Rate limit exceeded: {e}",
            )

        except anthropic.APIConnectionError as e:
            logger.error(f"API connection error: {e}")
            return AgentResult(
                success=False,
                content=final_content,
                tool_calls=all_tool_calls,
                iterations=iterations,
                duration_ms=int((time.time() - start_time) * 1000),
                error=f"API connection error: {e}",
            )

        except Exception as e:
            logger.exception("Anthropic API call failed")
            return AgentResult(
                success=False,
                content=final_content,
                tool_calls=all_tool_calls,
                iterations=iterations,
                duration_ms=int((time.time() - start_time) * 1000),
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
                error="Anthropic SDK not available",
            ))
            return

        start_time = time.time()
        all_tool_calls: List[ToolCall] = []
        iterations = 0
        final_content = ""

        anthropic_tools = self._convert_tools_to_anthropic_format(tools)
        messages = [{"role": "user", "content": prompt}]

        client = self._get_client()

        try:
            while iterations < self.config.max_iterations:
                iterations += 1
                yield IterationStart(iteration=iterations)

                # Use streaming API - only pass tools if we have them
                stream_kwargs = {
                    "model": self.config.model,
                    "max_tokens": self.config.max_tokens,
                    "system": system_prompt,
                    "messages": messages,
                }
                if anthropic_tools:
                    stream_kwargs["tools"] = anthropic_tools

                with client.messages.stream(**stream_kwargs) as stream:
                    assistant_content = []
                    pending_tool_calls: List[Dict[str, Any]] = []
                    current_text = ""
                    current_tool: Optional[Dict[str, Any]] = None

                    for event in stream:
                        event_type = type(event).__name__

                        if event_type == "ContentBlockStart":
                            block = event.content_block
                            if hasattr(block, "text"):
                                current_text = ""
                            elif hasattr(block, "id"):
                                current_tool = {
                                    "id": block.id,
                                    "name": block.name,
                                    "input": {},
                                }
                                yield ToolStart(
                                    id=block.id,
                                    name=block.name,
                                    input={},
                                )

                        elif event_type == "ContentBlockDelta":
                            delta = event.delta
                            if hasattr(delta, "text"):
                                current_text += delta.text
                                final_content += delta.text
                                yield TextDelta(text=delta.text)
                            elif hasattr(delta, "partial_json") and current_tool:
                                # Tool input is being streamed
                                pass

                        elif event_type == "ContentBlockStop":
                            if current_text:
                                assistant_content.append({
                                    "type": "text",
                                    "text": current_text,
                                })
                                current_text = ""
                            elif current_tool:
                                # Finalize tool call
                                final_input = stream.current_message_snapshot.content[-1].input if hasattr(stream.current_message_snapshot.content[-1], "input") else {}
                                current_tool["input"] = final_input
                                assistant_content.append({
                                    "type": "tool_use",
                                    "id": current_tool["id"],
                                    "name": current_tool["name"],
                                    "input": current_tool["input"],
                                })
                                pending_tool_calls.append(current_tool)
                                current_tool = None

                    # Get final message
                    response = stream.get_final_message()

                # Add assistant message to history
                messages.append({
                    "role": "assistant",
                    "content": assistant_content,
                })

                yield IterationEnd(iteration=iterations)

                # Check stop reason
                if response.stop_reason == "end_turn":
                    break

                # Execute tool calls
                if pending_tool_calls:
                    tool_results = []
                    for tc in pending_tool_calls:
                        tool = self._find_tool(tc["name"], tools)
                        if tool:
                            tool_start = time.time()
                            output = await self._execute_tool(tool, tc["input"])
                            duration_ms = int((time.time() - tool_start) * 1000)

                            all_tool_calls.append(ToolCall(
                                id=tc["id"],
                                name=tc["name"],
                                input=tc["input"],
                                output=output,
                                duration_ms=duration_ms,
                            ))

                            yield ToolEnd(
                                id=tc["id"],
                                name=tc["name"],
                                output=output,
                            )

                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": tc["id"],
                                "content": output,
                            })
                        else:
                            error_msg = f"Tool '{tc['name']}' not found"
                            all_tool_calls.append(ToolCall(
                                id=tc["id"],
                                name=tc["name"],
                                input=tc["input"],
                                output="",
                                error=error_msg,
                            ))
                            yield ToolEnd(
                                id=tc["id"],
                                name=tc["name"],
                                output="",
                                error=error_msg,
                            )
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": tc["id"],
                                "content": f"Error: {error_msg}",
                                "is_error": True,
                            })

                    messages.append({
                        "role": "user",
                        "content": tool_results,
                    })
                else:
                    break

            duration_ms = int((time.time() - start_time) * 1000)
            yield Complete(AgentResult(
                success=True,
                content=final_content.strip(),
                tool_calls=all_tool_calls,
                iterations=iterations,
                duration_ms=duration_ms,
            ))

        except Exception as e:
            logger.exception("Anthropic streaming failed")
            duration_ms = int((time.time() - start_time) * 1000)
            yield Complete(AgentResult(
                success=False,
                content=final_content,
                tool_calls=all_tool_calls,
                iterations=iterations,
                duration_ms=duration_ms,
                error=str(e),
            ))


# =============================================================================
# Exports
# =============================================================================

__all__ = ["AnthropicAdapter"]
