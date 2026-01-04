"""
Tools for Campaign Builder.

This module provides utilities for:
    - Document parsing (PDF, Excel, CSV)
    - Input file validation
    - Campaign generation
"""

from campaign_builder.tools.documents import (
    CSVReadResult,
    ExcelReadResult,
    PDFReadResult,
    SheetData,
    format_csv_as_table,
    format_excel_as_table,
    read_csv,
    read_excel,
    read_pdf,
)

__all__ = [
    # Document tools
    "PDFReadResult",
    "read_pdf",
    "SheetData",
    "ExcelReadResult",
    "read_excel",
    "format_excel_as_table",
    "CSVReadResult",
    "read_csv",
    "format_csv_as_table",
]
