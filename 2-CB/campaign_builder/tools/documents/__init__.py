"""
Document parsing tools for Campaign Builder.

This module provides parsers for:
    - PDF documents (using PyMuPDF)
    - Excel spreadsheets (using openpyxl)
    - CSV files (using Python's csv module)
"""

from campaign_builder.tools.documents.csv_reader import (
    CSVReadResult,
    format_csv_as_table,
    read_csv,
)
from campaign_builder.tools.documents.excel_reader import (
    ExcelReadResult,
    SheetData,
    format_excel_as_table,
    read_excel,
)
from campaign_builder.tools.documents.pdf_reader import (
    PDFReadResult,
    read_pdf,
)

__all__ = [
    # PDF reader
    "PDFReadResult",
    "read_pdf",
    # Excel reader
    "SheetData",
    "ExcelReadResult",
    "read_excel",
    "format_excel_as_table",
    # CSV reader
    "CSVReadResult",
    "read_csv",
    "format_csv_as_table",
]
