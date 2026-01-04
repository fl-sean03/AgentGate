"""
Tool Registry for Campaign Builder.

Provides a central registry for tool definitions that agents can access.
Tools register themselves on import, making them available to all adapters.

Components:
    - ToolRegistry: Central registry for tool management
    - default_registry: Global singleton instance
    - register_tool: Decorator for auto-registration
"""

import logging
from typing import Callable, Dict, List, Optional

from .tool_types import ToolDefinition, ToolHandler


logger = logging.getLogger(__name__)


# =============================================================================
# Tool Registry
# =============================================================================


class ToolRegistry:
    """Central registry for tool definitions.

    Tools can be registered individually or via decorator.
    The registry provides methods to retrieve tools by name or category.

    Example:
        registry = ToolRegistry()
        registry.register(my_tool)
        tool = registry.get("my_tool")
    """

    def __init__(self) -> None:
        """Initialize an empty registry."""
        self._tools: Dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition) -> None:
        """Register a tool.

        Args:
            tool: The ToolDefinition to register

        Raises:
            ValueError: If a tool with this name is already registered
        """
        if tool.name in self._tools:
            logger.warning(f"Tool '{tool.name}' already registered, overwriting")
        self._tools[tool.name] = tool
        logger.debug(f"Registered tool: {tool.name}")

    def unregister(self, name: str) -> bool:
        """Unregister a tool by name.

        Args:
            name: Name of the tool to unregister

        Returns:
            True if tool was unregistered, False if not found
        """
        if name in self._tools:
            del self._tools[name]
            logger.debug(f"Unregistered tool: {name}")
            return True
        return False

    def get(self, name: str) -> Optional[ToolDefinition]:
        """Get a tool by name.

        Args:
            name: Tool name to look up

        Returns:
            ToolDefinition if found, None otherwise
        """
        return self._tools.get(name)

    def get_required(self, name: str) -> ToolDefinition:
        """Get a tool by name, raising if not found.

        Args:
            name: Tool name to look up

        Returns:
            ToolDefinition

        Raises:
            KeyError: If tool not found
        """
        tool = self._tools.get(name)
        if tool is None:
            raise KeyError(f"Tool not found: {name}")
        return tool

    def list_all(self) -> List[ToolDefinition]:
        """Get all registered tools.

        Returns:
            List of all ToolDefinition objects
        """
        return list(self._tools.values())

    def list_names(self) -> List[str]:
        """Get all registered tool names.

        Returns:
            List of tool names
        """
        return list(self._tools.keys())

    def filter_by_names(self, names: List[str]) -> List[ToolDefinition]:
        """Get tools matching the given names.

        Args:
            names: List of tool names to retrieve

        Returns:
            List of matching ToolDefinition objects (in order requested)
        """
        result = []
        for name in names:
            tool = self._tools.get(name)
            if tool is not None:
                result.append(tool)
        return result

    def filter_by_category(self, category: str) -> List[ToolDefinition]:
        """Get all tools in a category.

        Args:
            category: Category name to filter by

        Returns:
            List of ToolDefinition objects in that category
        """
        return [t for t in self._tools.values() if t.category == category]

    def list_categories(self) -> List[str]:
        """Get all unique categories.

        Returns:
            List of category names (excluding None)
        """
        categories = set()
        for tool in self._tools.values():
            if tool.category is not None:
                categories.add(tool.category)
        return sorted(categories)

    def clear(self) -> None:
        """Remove all registered tools."""
        self._tools.clear()
        logger.debug("Cleared all tools from registry")

    def __len__(self) -> int:
        """Get number of registered tools."""
        return len(self._tools)

    def __contains__(self, name: str) -> bool:
        """Check if a tool is registered."""
        return name in self._tools

    def __iter__(self):
        """Iterate over tool names."""
        return iter(self._tools)


# =============================================================================
# Global Registry Instance
# =============================================================================

# Singleton registry instance
default_registry = ToolRegistry()


def get_default_registry() -> ToolRegistry:
    """Get the default global registry.

    Returns:
        The global ToolRegistry singleton
    """
    return default_registry


# =============================================================================
# Registration Decorator
# =============================================================================


def register_tool(
    name: str,
    description: str,
    parameters: Dict,
    category: Optional[str] = None,
    registry: Optional[ToolRegistry] = None,
) -> Callable[[ToolHandler], ToolDefinition]:
    """Decorator to create and register a tool.

    Creates a ToolDefinition from the decorated function and registers
    it with the specified registry (or the default registry).

    Usage:
        @register_tool("read_pdf", "Extract text from PDF", {...})
        async def read_pdf(args: dict) -> str:
            ...

    Args:
        name: Tool name
        description: Tool description
        parameters: JSON Schema for parameters
        category: Optional category for grouping
        registry: Registry to use (default: default_registry)

    Returns:
        Decorator that wraps a function and registers it
    """
    target_registry = registry or default_registry

    def decorator(func: ToolHandler) -> ToolDefinition:
        tool = ToolDefinition(
            name=name,
            description=description,
            parameters=parameters,
            handler=func,
            category=category,
        )
        target_registry.register(tool)
        return tool

    return decorator


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    "ToolRegistry",
    "default_registry",
    "get_default_registry",
    "register_tool",
]
