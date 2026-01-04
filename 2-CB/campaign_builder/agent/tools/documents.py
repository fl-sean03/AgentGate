"""
Document Tool Wrappers for Agent System.

This module wraps the existing document reading tools (PDF, Excel, CSV)
as ToolDefinition objects and registers them with the default registry.

Tools registered:
    - read_pdf: Extract text content from PDF files
    - read_excel: Read data from Excel spreadsheets
    - read_csv: Read data from CSV files

Importing this module registers all tools with the default registry.
"""

import logging
from pathlib import Path
from typing import Any, Dict

from campaign_builder.tools.documents import (
    PDFReadResult,
    read_pdf as _read_pdf,
    ExcelReadResult,
    read_excel as _read_excel,
    format_excel_as_table,
    CSVReadResult,
    read_csv as _read_csv,
    format_csv_as_table,
)

from ..tool_types import ToolDefinition, ToolError, build_tool_schema, string_param, integer_param
from ..registry import default_registry


logger = logging.getLogger(__name__)


# =============================================================================
# Constants
# =============================================================================

MAX_OUTPUT_CHARS = 10000
CATEGORY = "documents"


# =============================================================================
# Output Formatting
# =============================================================================


def _truncate_output(text: str, max_chars: int = MAX_OUTPUT_CHARS) -> str:
    """Truncate text with indication if too long.

    Args:
        text: Text to truncate
        max_chars: Maximum characters

    Returns:
        Truncated text with indicator
    """
    if len(text) <= max_chars:
        return text

    half = (max_chars - 50) // 2
    return f"{text[:half]}\n\n[... {len(text) - 2*half} characters truncated ...]\n\n{text[-half:]}"


# =============================================================================
# PDF Tool
# =============================================================================


async def _read_pdf_handler(args: Dict[str, Any]) -> str:
    """Handler for read_pdf tool.

    Args:
        args: Tool arguments with 'path' and optional 'max_pages'

    Returns:
        Extracted PDF text or error message
    """
    path_str = args.get("path")
    if not path_str:
        raise ToolError("Missing required parameter: path")

    path = Path(path_str)
    if not path.exists():
        raise ToolError(f"File not found: {path}", recoverable=False)

    max_pages = args.get("max_pages")

    logger.debug(f"Reading PDF: {path}")
    result: PDFReadResult = _read_pdf(path, max_pages=max_pages)

    if not result.success:
        return f"Error reading PDF: {result.error}"

    # Format output for LLM
    output_parts = []

    if result.metadata.get("title"):
        output_parts.append(f"Title: {result.metadata['title']}")

    output_parts.append(f"Pages: {result.page_count}")
    output_parts.append(f"Extraction quality: {result.extraction_quality}")
    output_parts.append("")
    output_parts.append("Content:")
    output_parts.append(result.text)

    output = "\n".join(output_parts)
    return _truncate_output(output)


read_pdf_tool = ToolDefinition(
    name="read_pdf",
    description="Extract text content from a PDF file. Returns the full text or an error message.",
    parameters=build_tool_schema(
        properties={
            "path": string_param("Absolute or relative path to the PDF file"),
            "max_pages": integer_param(
                "Maximum number of pages to read (default: all)",
                required=False,
                minimum=1,
            ),
        },
        required=["path"],
    ),
    handler=_read_pdf_handler,
    category=CATEGORY,
)


# =============================================================================
# Excel Tool
# =============================================================================


async def _read_excel_handler(args: Dict[str, Any]) -> str:
    """Handler for read_excel tool.

    Args:
        args: Tool arguments with 'path', optional 'sheet_name', 'max_rows'

    Returns:
        Formatted Excel data or error message
    """
    path_str = args.get("path")
    if not path_str:
        raise ToolError("Missing required parameter: path")

    path = Path(path_str)
    if not path.exists():
        raise ToolError(f"File not found: {path}", recoverable=False)

    sheet_name = args.get("sheet_name")
    max_rows = args.get("max_rows", 1000)

    logger.debug(f"Reading Excel: {path}")
    result: ExcelReadResult = _read_excel(path, sheet_name=sheet_name, max_rows=max_rows)

    if not result.success:
        return f"Error reading Excel: {result.error}"

    # Format output for LLM
    output_parts = []

    output_parts.append(f"Sheets: {', '.join(result.sheet_names)}")

    for sheet in result.sheets:
        output_parts.append("")
        output_parts.append(f"## {sheet.name}")
        output_parts.append(f"Rows: {sheet.row_count}, Columns: {len(sheet.headers)}")
        output_parts.append("")

        # Format as markdown table
        table = format_excel_as_table(sheet, max_rows=min(max_rows, 50))
        output_parts.append(table)

    output = "\n".join(output_parts)
    return _truncate_output(output)


read_excel_tool = ToolDefinition(
    name="read_excel",
    description="Read data from an Excel spreadsheet. Returns content as formatted text with markdown tables.",
    parameters=build_tool_schema(
        properties={
            "path": string_param("Path to the Excel file"),
            "sheet_name": string_param(
                "Specific sheet to read (default: first sheet)",
                required=False,
            ),
            "max_rows": integer_param(
                "Maximum rows to read (default: 1000)",
                required=False,
                default=1000,
                minimum=1,
            ),
        },
        required=["path"],
    ),
    handler=_read_excel_handler,
    category=CATEGORY,
)


# =============================================================================
# CSV Tool
# =============================================================================


async def _read_csv_handler(args: Dict[str, Any]) -> str:
    """Handler for read_csv tool.

    Args:
        args: Tool arguments with 'path' and optional 'max_rows'

    Returns:
        Formatted CSV data or error message
    """
    path_str = args.get("path")
    if not path_str:
        raise ToolError("Missing required parameter: path")

    path = Path(path_str)
    if not path.exists():
        raise ToolError(f"File not found: {path}", recoverable=False)

    max_rows = args.get("max_rows", 1000)

    logger.debug(f"Reading CSV: {path}")
    result: CSVReadResult = _read_csv(path, max_rows=max_rows)

    if not result.success:
        return f"Error reading CSV: {result.error}"

    # Format output for LLM
    output_parts = []

    output_parts.append(f"Rows: {result.row_count}, Columns: {len(result.headers)}")
    output_parts.append(f"Delimiter: {repr(result.delimiter)}")

    if result.column_types:
        output_parts.append(f"Column types: {result.column_types}")

    output_parts.append("")

    # Format as markdown table
    table = format_csv_as_table(result, max_rows=min(max_rows, 50))
    output_parts.append(table)

    output = "\n".join(output_parts)
    return _truncate_output(output)


read_csv_tool = ToolDefinition(
    name="read_csv",
    description="Read data from a CSV file. Automatically detects delimiter. Returns content as formatted markdown table.",
    parameters=build_tool_schema(
        properties={
            "path": string_param("Path to the CSV file"),
            "max_rows": integer_param(
                "Maximum rows to read (default: 1000)",
                required=False,
                default=1000,
                minimum=1,
            ),
        },
        required=["path"],
    ),
    handler=_read_csv_handler,
    category=CATEGORY,
)


# =============================================================================
# Registration
# =============================================================================

# Register all document tools on import
default_registry.register(read_pdf_tool)
default_registry.register(read_excel_tool)
default_registry.register(read_csv_tool)

logger.debug(f"Registered {CATEGORY} tools: read_pdf, read_excel, read_csv")


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    "read_pdf_tool",
    "read_excel_tool",
    "read_csv_tool",
]
