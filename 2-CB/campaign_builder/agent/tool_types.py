"""
Tool Definition System for Campaign Builder.

This module provides a unified way to define tools that can be used by any
LLM adapter. Tools are defined once with their schema and handler, then
adapters convert them to their native format.

Components:
    - ToolDefinition: Defines a tool with name, description, schema, and handler
    - ToolError: Exception for tool execution failures
    - Parameter schema helpers: Convenience functions for building JSON schemas
"""

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional, Union


# =============================================================================
# Exceptions
# =============================================================================


class ToolError(Exception):
    """Exception raised when a tool execution fails.

    Attributes:
        message: Error description
        recoverable: Whether the LLM should retry with different input
    """

    def __init__(self, message: str, recoverable: bool = True):
        """Initialize ToolError.

        Args:
            message: Error description
            recoverable: Whether the LLM should retry (default: True)
        """
        super().__init__(message)
        self.message = message
        self.recoverable = recoverable


# =============================================================================
# Tool Definition
# =============================================================================


# Type for tool handlers - async function that takes dict and returns str
ToolHandler = Callable[[Dict[str, Any]], Awaitable[str]]


@dataclass
class ToolDefinition:
    """Definition of a tool that can be used by LLM agents.

    A tool is defined once with:
    - A unique name
    - A description (shown to the LLM)
    - A JSON Schema for parameters
    - An async handler function

    Adapters convert this to their native tool format.

    Attributes:
        name: Unique tool identifier (e.g., "read_pdf")
        description: What the tool does (shown to LLM)
        parameters: JSON Schema for input parameters
        handler: Async function that executes the tool
        category: Optional category for grouping (e.g., "documents", "validation")
    """
    name: str
    description: str
    parameters: Dict[str, Any]
    handler: ToolHandler
    category: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the tool definition."""
        if not self.name:
            raise ValueError("Tool name cannot be empty")
        if not self.description:
            raise ValueError("Tool description cannot be empty")
        if not callable(self.handler):
            raise ValueError("Tool handler must be callable")

    def to_anthropic_format(self) -> Dict[str, Any]:
        """Convert to Anthropic API tool format.

        Returns:
            Dict with name, description, input_schema for Anthropic API
        """
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters,
        }

    def to_openai_format(self) -> Dict[str, Any]:
        """Convert to OpenAI API function format.

        Returns:
            Dict with type, function for OpenAI API
        """
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


# =============================================================================
# Parameter Schema Helpers
# =============================================================================


def string_param(
    description: str,
    required: bool = True,
    default: Optional[str] = None,
    enum: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Create a JSON Schema for a string parameter.

    Args:
        description: Parameter description
        required: Whether the parameter is required (for documentation)
        default: Default value if not provided
        enum: List of allowed values

    Returns:
        JSON Schema dict for a string parameter
    """
    schema: Dict[str, Any] = {
        "type": "string",
        "description": description,
    }
    if default is not None:
        schema["default"] = default
    if enum is not None:
        schema["enum"] = enum
    return schema


def number_param(
    description: str,
    required: bool = True,
    default: Optional[Union[int, float]] = None,
    minimum: Optional[Union[int, float]] = None,
    maximum: Optional[Union[int, float]] = None,
) -> Dict[str, Any]:
    """Create a JSON Schema for a number parameter.

    Args:
        description: Parameter description
        required: Whether the parameter is required (for documentation)
        default: Default value if not provided
        minimum: Minimum allowed value
        maximum: Maximum allowed value

    Returns:
        JSON Schema dict for a number parameter
    """
    schema: Dict[str, Any] = {
        "type": "number",
        "description": description,
    }
    if default is not None:
        schema["default"] = default
    if minimum is not None:
        schema["minimum"] = minimum
    if maximum is not None:
        schema["maximum"] = maximum
    return schema


def integer_param(
    description: str,
    required: bool = True,
    default: Optional[int] = None,
    minimum: Optional[int] = None,
    maximum: Optional[int] = None,
) -> Dict[str, Any]:
    """Create a JSON Schema for an integer parameter.

    Args:
        description: Parameter description
        required: Whether the parameter is required (for documentation)
        default: Default value if not provided
        minimum: Minimum allowed value
        maximum: Maximum allowed value

    Returns:
        JSON Schema dict for an integer parameter
    """
    schema: Dict[str, Any] = {
        "type": "integer",
        "description": description,
    }
    if default is not None:
        schema["default"] = default
    if minimum is not None:
        schema["minimum"] = minimum
    if maximum is not None:
        schema["maximum"] = maximum
    return schema


def boolean_param(
    description: str,
    required: bool = True,
    default: Optional[bool] = None,
) -> Dict[str, Any]:
    """Create a JSON Schema for a boolean parameter.

    Args:
        description: Parameter description
        required: Whether the parameter is required (for documentation)
        default: Default value if not provided

    Returns:
        JSON Schema dict for a boolean parameter
    """
    schema: Dict[str, Any] = {
        "type": "boolean",
        "description": description,
    }
    if default is not None:
        schema["default"] = default
    return schema


def enum_param(
    description: str,
    values: List[str],
    required: bool = True,
    default: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a JSON Schema for an enum parameter.

    Args:
        description: Parameter description
        values: List of allowed values
        required: Whether the parameter is required (for documentation)
        default: Default value if not provided

    Returns:
        JSON Schema dict for an enum parameter
    """
    schema: Dict[str, Any] = {
        "type": "string",
        "description": description,
        "enum": values,
    }
    if default is not None:
        schema["default"] = default
    return schema


def array_param(
    description: str,
    items: Dict[str, Any],
    required: bool = True,
    min_items: Optional[int] = None,
    max_items: Optional[int] = None,
) -> Dict[str, Any]:
    """Create a JSON Schema for an array parameter.

    Args:
        description: Parameter description
        items: JSON Schema for array items
        required: Whether the parameter is required (for documentation)
        min_items: Minimum number of items
        max_items: Maximum number of items

    Returns:
        JSON Schema dict for an array parameter
    """
    schema: Dict[str, Any] = {
        "type": "array",
        "description": description,
        "items": items,
    }
    if min_items is not None:
        schema["minItems"] = min_items
    if max_items is not None:
        schema["maxItems"] = max_items
    return schema


def object_param(
    description: str,
    properties: Dict[str, Dict[str, Any]],
    required_props: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Create a JSON Schema for an object parameter.

    Args:
        description: Parameter description
        properties: Dict mapping property names to their schemas
        required_props: List of required property names

    Returns:
        JSON Schema dict for an object parameter
    """
    schema: Dict[str, Any] = {
        "type": "object",
        "description": description,
        "properties": properties,
    }
    if required_props:
        schema["required"] = required_props
    return schema


def build_tool_schema(
    properties: Dict[str, Dict[str, Any]],
    required: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Build a complete tool parameter schema.

    Args:
        properties: Dict mapping parameter names to their schemas
        required: List of required parameter names

    Returns:
        Complete JSON Schema for tool parameters
    """
    schema: Dict[str, Any] = {
        "type": "object",
        "properties": properties,
    }
    if required:
        schema["required"] = required
    return schema


# =============================================================================
# Tool Decorator
# =============================================================================


def tool(
    name: str,
    description: str,
    parameters: Dict[str, Any],
    category: Optional[str] = None,
) -> Callable[[ToolHandler], ToolDefinition]:
    """Decorator to create a ToolDefinition from a function.

    Usage:
        @tool("read_pdf", "Extract text from PDF", {...})
        async def read_pdf(args: dict) -> str:
            ...

    Args:
        name: Tool name
        description: Tool description
        parameters: JSON Schema for parameters
        category: Optional category for grouping

    Returns:
        Decorator that wraps a function as a ToolDefinition
    """
    def decorator(func: ToolHandler) -> ToolDefinition:
        return ToolDefinition(
            name=name,
            description=description,
            parameters=parameters,
            handler=func,
            category=category,
        )
    return decorator


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    # Core types
    "ToolDefinition",
    "ToolError",
    "ToolHandler",
    # Parameter helpers
    "string_param",
    "number_param",
    "integer_param",
    "boolean_param",
    "enum_param",
    "array_param",
    "object_param",
    "build_tool_schema",
    # Decorator
    "tool",
]
