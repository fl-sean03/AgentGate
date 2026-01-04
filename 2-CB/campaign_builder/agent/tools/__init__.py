"""
Agent Tools Package.

This package contains tool wrappers that register tools with the agent system.
Importing a module from this package registers its tools with the default registry.

Modules:
    - documents: PDF, Excel, CSV reading tools
    - validation: L0-L3 validation tools
    - utilities: File operations (read, write, glob, grep)
"""

# Expose core components for convenience
from ..tool_types import (
    ToolDefinition,
    ToolError,
    ToolHandler,
    string_param,
    number_param,
    integer_param,
    boolean_param,
    enum_param,
    array_param,
    object_param,
    build_tool_schema,
    tool,
)

from ..registry import (
    ToolRegistry,
    default_registry,
    get_default_registry,
    register_tool,
)


__all__ = [
    # Tool definition
    "ToolDefinition",
    "ToolError",
    "ToolHandler",
    # Schema helpers
    "string_param",
    "number_param",
    "integer_param",
    "boolean_param",
    "enum_param",
    "array_param",
    "object_param",
    "build_tool_schema",
    # Decorators
    "tool",
    "register_tool",
    # Registry
    "ToolRegistry",
    "default_registry",
    "get_default_registry",
]
