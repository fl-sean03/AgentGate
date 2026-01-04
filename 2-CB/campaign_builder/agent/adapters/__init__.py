"""
Agent Adapters Package.

This package contains adapters that implement the AgentProvider interface
for different LLM backends:

- ClaudeSDKAdapter: Uses the official Claude Agent SDK
- AnthropicAdapter: Uses the raw Anthropic Python SDK with manual tool loop
- MockAdapter: Returns deterministic responses for testing

Usage:
    from campaign_builder.agent.adapters import ClaudeSDKAdapter, AnthropicAdapter, MockAdapter

    # Or use the factory
    from campaign_builder.agent.factory import get_provider
    provider = get_provider()  # Gets based on AGENT_PROVIDER env var
"""

from typing import TYPE_CHECKING

# Lazy imports to avoid circular dependencies and optional dependency issues
if TYPE_CHECKING:
    from .claude_sdk import ClaudeSDKAdapter
    from .anthropic_raw import AnthropicAdapter
    from .mock import MockAdapter


def __getattr__(name: str):
    """Lazy import adapters on first access."""
    if name == "ClaudeSDKAdapter":
        from .claude_sdk import ClaudeSDKAdapter
        return ClaudeSDKAdapter
    elif name == "AnthropicAdapter":
        from .anthropic_raw import AnthropicAdapter
        return AnthropicAdapter
    elif name == "MockAdapter":
        from .mock import MockAdapter
        return MockAdapter
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "ClaudeSDKAdapter",
    "AnthropicAdapter",
    "MockAdapter",
]
