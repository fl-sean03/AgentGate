"""
Utility Tool Wrappers for Agent System.

This module provides utility tools for file operations that agents need.
These complement the SDK's built-in tools when using the raw Anthropic adapter.

Tools registered:
    - read_file: Read text file contents
    - write_file: Write content to a file
    - glob_files: Find files matching a pattern
    - grep_content: Search for patterns in files
    - get_file_info: Get file metadata

Importing this module registers all tools with the default registry.
"""

import fnmatch
import hashlib
import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from ..tool_types import ToolDefinition, ToolError, build_tool_schema, string_param, integer_param
from ..registry import default_registry


logger = logging.getLogger(__name__)


# =============================================================================
# Constants
# =============================================================================

CATEGORY = "utilities"
MAX_OUTPUT_CHARS = 10000
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# Paths that should never be accessed
BLOCKED_PATHS: Set[str] = {
    "/etc/passwd",
    "/etc/shadow",
    "/etc/sudoers",
    "~/.ssh",
    "~/.gnupg",
    "~/.aws",
    "~/.config/gcloud",
}


# =============================================================================
# Security Helpers
# =============================================================================


def _expand_path(path: str) -> Path:
    """Expand user home and resolve path."""
    return Path(os.path.expanduser(path)).resolve()


def _is_safe_path(path: Path, workspace: Optional[Path] = None) -> tuple[bool, str]:
    """Check if a path is safe to access.

    Args:
        path: Path to check
        workspace: Optional workspace directory to restrict to

    Returns:
        Tuple of (is_safe, reason)
    """
    try:
        resolved = path.resolve()
        path_str = str(resolved)

        # Check blocked paths
        for blocked in BLOCKED_PATHS:
            expanded_blocked = str(_expand_path(blocked))
            if path_str.startswith(expanded_blocked):
                return False, f"Access to {blocked} is restricted"

        # Check for directory traversal attempts
        if ".." in str(path):
            # Resolve and check if it's still within expected bounds
            pass  # Already resolved above

        # If workspace is specified, ensure path is within it
        if workspace:
            workspace_resolved = workspace.resolve()
            try:
                resolved.relative_to(workspace_resolved)
            except ValueError:
                return False, f"Path must be within workspace: {workspace}"

        return True, ""

    except Exception as e:
        return False, f"Invalid path: {e}"


def _truncate_output(text: str, max_chars: int = MAX_OUTPUT_CHARS) -> str:
    """Truncate text with indication if too long."""
    if len(text) <= max_chars:
        return text

    half = (max_chars - 50) // 2
    return f"{text[:half]}\n\n[... {len(text) - 2*half} characters truncated ...]\n\n{text[-half:]}"


# =============================================================================
# Read File Tool
# =============================================================================


async def _read_file_handler(args: Dict[str, Any]) -> str:
    """Handler for read_file tool.

    Args:
        args: Tool arguments with 'path', optional 'offset', 'limit'

    Returns:
        File contents
    """
    path_str = args.get("path")
    if not path_str:
        raise ToolError("Missing required parameter: path")

    path = _expand_path(path_str)

    # Security check
    safe, reason = _is_safe_path(path)
    if not safe:
        raise ToolError(reason, recoverable=False)

    if not path.exists():
        raise ToolError(f"File not found: {path}", recoverable=False)

    if not path.is_file():
        raise ToolError(f"Not a file: {path}", recoverable=False)

    # Check file size
    file_size = path.stat().st_size
    if file_size > MAX_FILE_SIZE:
        raise ToolError(f"File too large: {file_size} bytes (max {MAX_FILE_SIZE})")

    offset = args.get("offset", 0)
    limit = args.get("limit")

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()

        if offset > 0:
            lines = lines[offset:]

        if limit:
            lines = lines[:limit]

        content = "".join(lines)
        return _truncate_output(content)

    except Exception as e:
        raise ToolError(f"Error reading file: {e}")


read_file_tool = ToolDefinition(
    name="read_file",
    description="Read the contents of a text file. Returns the file content with line numbers.",
    parameters=build_tool_schema(
        properties={
            "path": string_param("Path to the file to read"),
            "offset": integer_param(
                "Line number to start from (0-indexed)",
                required=False,
                default=0,
                minimum=0,
            ),
            "limit": integer_param(
                "Maximum lines to read",
                required=False,
                minimum=1,
            ),
        },
        required=["path"],
    ),
    handler=_read_file_handler,
    category=CATEGORY,
)


# =============================================================================
# Write File Tool
# =============================================================================


async def _write_file_handler(args: Dict[str, Any]) -> str:
    """Handler for write_file tool.

    Args:
        args: Tool arguments with 'path' and 'content'

    Returns:
        Success confirmation
    """
    path_str = args.get("path")
    if not path_str:
        raise ToolError("Missing required parameter: path")

    content = args.get("content")
    if content is None:
        raise ToolError("Missing required parameter: content")

    path = _expand_path(path_str)

    # Security check
    safe, reason = _is_safe_path(path)
    if not safe:
        raise ToolError(reason, recoverable=False)

    try:
        # Create parent directories if needed
        path.parent.mkdir(parents=True, exist_ok=True)

        # Write content
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

        return f"Successfully wrote {len(content)} characters to {path}"

    except Exception as e:
        raise ToolError(f"Error writing file: {e}")


write_file_tool = ToolDefinition(
    name="write_file",
    description="Write content to a file. Creates parent directories if needed.",
    parameters=build_tool_schema(
        properties={
            "path": string_param("Path to write to"),
            "content": string_param("Content to write"),
        },
        required=["path", "content"],
    ),
    handler=_write_file_handler,
    category=CATEGORY,
)


# =============================================================================
# Glob Files Tool
# =============================================================================


async def _glob_files_handler(args: Dict[str, Any]) -> str:
    """Handler for glob_files tool.

    Args:
        args: Tool arguments with 'pattern', optional 'directory'

    Returns:
        List of matching paths
    """
    pattern = args.get("pattern")
    if not pattern:
        raise ToolError("Missing required parameter: pattern")

    directory = args.get("directory", ".")
    dir_path = _expand_path(directory)

    # Security check
    safe, reason = _is_safe_path(dir_path)
    if not safe:
        raise ToolError(reason, recoverable=False)

    if not dir_path.exists():
        raise ToolError(f"Directory not found: {dir_path}", recoverable=False)

    if not dir_path.is_dir():
        raise ToolError(f"Not a directory: {dir_path}", recoverable=False)

    try:
        matches = list(dir_path.glob(pattern))
        # Limit results
        if len(matches) > 100:
            matches = matches[:100]
            truncated = True
        else:
            truncated = False

        result_lines = [str(m.relative_to(dir_path)) for m in sorted(matches)]

        if truncated:
            result_lines.append(f"\n[Results truncated to first 100 matches]")

        if not result_lines:
            return f"No files matching '{pattern}' in {dir_path}"

        return "\n".join(result_lines)

    except Exception as e:
        raise ToolError(f"Error globbing files: {e}")


glob_files_tool = ToolDefinition(
    name="glob_files",
    description="Find files matching a glob pattern (e.g., '*.data', '**/*.in').",
    parameters=build_tool_schema(
        properties={
            "pattern": string_param("Glob pattern to match"),
            "directory": string_param(
                "Base directory (default: current)",
                required=False,
            ),
        },
        required=["pattern"],
    ),
    handler=_glob_files_handler,
    category=CATEGORY,
)


# =============================================================================
# Grep Content Tool
# =============================================================================


async def _grep_content_handler(args: Dict[str, Any]) -> str:
    """Handler for grep_content tool.

    Args:
        args: Tool arguments with 'pattern', 'path', optional 'max_results'

    Returns:
        Matching lines with file/line numbers
    """
    pattern = args.get("pattern")
    if not pattern:
        raise ToolError("Missing required parameter: pattern")

    path_str = args.get("path")
    if not path_str:
        raise ToolError("Missing required parameter: path")

    path = _expand_path(path_str)
    max_results = args.get("max_results", 50)

    # Security check
    safe, reason = _is_safe_path(path)
    if not safe:
        raise ToolError(reason, recoverable=False)

    if not path.exists():
        raise ToolError(f"Path not found: {path}", recoverable=False)

    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ToolError(f"Invalid regex pattern: {e}")

    results: List[str] = []

    def search_file(file_path: Path) -> None:
        nonlocal results
        if len(results) >= max_results:
            return

        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                for line_num, line in enumerate(f, 1):
                    if regex.search(line):
                        results.append(f"{file_path}:{line_num}: {line.rstrip()}")
                        if len(results) >= max_results:
                            return
        except Exception:
            pass  # Skip files that can't be read

    if path.is_file():
        search_file(path)
    elif path.is_dir():
        for file_path in path.rglob("*"):
            if file_path.is_file():
                search_file(file_path)
                if len(results) >= max_results:
                    break
    else:
        raise ToolError(f"Path is not a file or directory: {path}")

    if not results:
        return f"No matches for pattern '{pattern}' in {path}"

    output = "\n".join(results)
    if len(results) >= max_results:
        output += f"\n\n[Results limited to {max_results} matches]"

    return output


grep_content_tool = ToolDefinition(
    name="grep_content",
    description="Search for a regex pattern in files. Returns matching lines with file paths and line numbers.",
    parameters=build_tool_schema(
        properties={
            "pattern": string_param("Regex pattern to search for"),
            "path": string_param("File or directory to search in"),
            "max_results": integer_param(
                "Maximum matches to return (default: 50)",
                required=False,
                default=50,
                minimum=1,
            ),
        },
        required=["pattern", "path"],
    ),
    handler=_grep_content_handler,
    category=CATEGORY,
)


# =============================================================================
# Get File Info Tool
# =============================================================================


async def _get_file_info_handler(args: Dict[str, Any]) -> str:
    """Handler for get_file_info tool.

    Args:
        args: Tool arguments with 'path'

    Returns:
        JSON with file metadata
    """
    path_str = args.get("path")
    if not path_str:
        raise ToolError("Missing required parameter: path")

    path = _expand_path(path_str)

    # Security check
    safe, reason = _is_safe_path(path)
    if not safe:
        raise ToolError(reason, recoverable=False)

    if not path.exists():
        raise ToolError(f"Path not found: {path}", recoverable=False)

    try:
        stat = path.stat()

        info = {
            "path": str(path),
            "name": path.name,
            "type": "directory" if path.is_dir() else "file",
            "size_bytes": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "created": datetime.fromtimestamp(stat.st_ctime).isoformat(),
        }

        if path.is_file():
            info["extension"] = path.suffix.lower() if path.suffix else None

            # Compute hash for smaller files
            if stat.st_size < 1024 * 1024:  # 1 MB
                hasher = hashlib.sha256()
                with open(path, "rb") as f:
                    hasher.update(f.read())
                info["sha256"] = hasher.hexdigest()

            # Detect if text or binary
            try:
                with open(path, "rb") as f:
                    chunk = f.read(8192)
                    if b"\x00" in chunk:
                        info["content_type"] = "binary"
                    else:
                        info["content_type"] = "text"
            except Exception:
                pass

        return json.dumps(info, indent=2)

    except Exception as e:
        raise ToolError(f"Error getting file info: {e}")


get_file_info_tool = ToolDefinition(
    name="get_file_info",
    description="Get metadata about a file (size, type, modification time, hash).",
    parameters=build_tool_schema(
        properties={
            "path": string_param("Path to the file"),
        },
        required=["path"],
    ),
    handler=_get_file_info_handler,
    category=CATEGORY,
)


# =============================================================================
# Registration
# =============================================================================

# Register all utility tools on import
default_registry.register(read_file_tool)
default_registry.register(write_file_tool)
default_registry.register(glob_files_tool)
default_registry.register(grep_content_tool)
default_registry.register(get_file_info_tool)

logger.debug(f"Registered {CATEGORY} tools: read_file, write_file, glob_files, grep_content, get_file_info")


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    "read_file_tool",
    "write_file_tool",
    "glob_files_tool",
    "grep_content_tool",
    "get_file_info_tool",
]
