"""
CSV reading tool for Campaign Builder.

This module provides functionality for reading CSV files with automatic
delimiter detection and encoding handling.
"""

import csv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional, Union


@dataclass
class CSVReadResult:
    """Result of reading a CSV file.

    Attributes:
        success: Whether the CSV file was read successfully.
        headers: List of column headers.
        rows: List of row data (each row is a list of values).
        row_count: Total number of data rows in the file.
        error: Error message if reading failed, None otherwise.
        delimiter_used: The delimiter that was used for parsing.
        column_types: Dict mapping column name to inferred type.
        truncated: Whether rows were truncated due to limits.
        encoding_used: The encoding used to read the file.
    """

    success: bool
    headers: list[str] = field(default_factory=list)
    rows: list[list[str]] = field(default_factory=list)
    row_count: int = 0
    error: Optional[str] = None
    delimiter_used: str = ","
    column_types: dict[str, str] = field(default_factory=dict)
    truncated: bool = False
    encoding_used: str = "utf-8"


def _detect_encoding(file_path: Path) -> str:
    """Detect the encoding of a file.

    Args:
        file_path: Path to the file.

    Returns:
        Detected encoding string.
    """
    # Try common encodings in order of likelihood
    encodings = ["utf-8-sig", "utf-8", "latin-1", "cp1252", "ascii"]

    for encoding in encodings:
        try:
            with open(file_path, encoding=encoding) as f:
                # Try to read first 10KB
                f.read(10240)
            return encoding
        except (UnicodeDecodeError, UnicodeError):
            continue

    # Default to latin-1 which can read any byte sequence
    return "latin-1"


def _detect_delimiter(sample_lines: list[str]) -> str:
    """Detect the delimiter used in CSV content.

    Args:
        sample_lines: First few lines of the file.

    Returns:
        Detected delimiter character.
    """
    if not sample_lines:
        return ","

    # Common delimiters to try
    delimiters = [",", "\t", ";", "|", " "]

    best_delimiter = ","
    best_consistency = 0
    best_count = 0

    for delimiter in delimiters:
        counts = []
        for line in sample_lines:
            if line.strip():
                count = line.count(delimiter)
                counts.append(count)

        if not counts:
            continue

        # Check consistency (all lines have same count)
        if len(set(counts)) == 1 and counts[0] > 0:
            # Perfect consistency
            if counts[0] > best_count or (counts[0] == best_count and delimiter == ","):
                best_delimiter = delimiter
                best_consistency = 1.0
                best_count = counts[0]
        elif len(counts) > 1:
            # Calculate consistency ratio
            avg_count = sum(counts) / len(counts)
            if avg_count > 0:
                variance = sum((c - avg_count) ** 2 for c in counts) / len(counts)
                consistency = 1 / (1 + variance)
                if consistency > best_consistency or (
                    consistency == best_consistency and avg_count > best_count
                ):
                    best_delimiter = delimiter
                    best_consistency = consistency
                    best_count = avg_count

    return best_delimiter


def _infer_column_type(values: list[str]) -> str:
    """Infer the data type of a column based on sample values.

    Args:
        values: List of string values from the column.

    Returns:
        Type string: "numeric", "text", "mixed", or "empty".
    """
    # Filter out None/empty values
    non_empty = [v for v in values if v is not None and v.strip() != ""]

    if not non_empty:
        return "empty"

    # Sample up to 20 values
    sample = non_empty[:20]

    numeric_count = 0

    for value in sample:
        # Try to parse as number
        try:
            # Handle common numeric formats
            clean_value = value.replace(",", "").replace(" ", "")
            float(clean_value)
            numeric_count += 1
        except (ValueError, AttributeError):
            pass

    total = len(sample)
    if numeric_count == total:
        return "numeric"
    elif numeric_count == 0:
        return "text"
    else:
        return "mixed"


def _format_as_table(headers: list[str], rows: list[list[str]], max_col_width: int = 30) -> str:
    """Format data as a markdown table.

    Args:
        headers: List of column headers.
        rows: List of row data.
        max_col_width: Maximum column width.

    Returns:
        Formatted markdown table string.
    """
    if not headers:
        return ""

    # Calculate column widths
    col_widths = []
    for i, header in enumerate(headers):
        max_width = len(str(header))
        for row in rows:
            if i < len(row):
                cell_len = len(str(row[i]))
                max_width = max(max_width, min(cell_len, max_col_width))
        col_widths.append(min(max_width, max_col_width))

    # Build header row
    header_cells = []
    for i, header in enumerate(headers):
        cell = str(header)[: col_widths[i]].ljust(col_widths[i])
        header_cells.append(cell)
    header_line = "| " + " | ".join(header_cells) + " |"

    # Build separator
    separator_cells = ["-" * w for w in col_widths]
    separator_line = "|" + "|".join(separator_cells) + "|"

    # Build data rows
    data_lines = []
    for row in rows:
        row_cells = []
        for i, width in enumerate(col_widths):
            if i < len(row):
                cell_value = str(row[i])
                if len(cell_value) > width:
                    cell_value = cell_value[: width - 3] + "..."
                cell = cell_value.ljust(width)
            else:
                cell = " " * width
            row_cells.append(cell)
        data_lines.append("| " + " | ".join(row_cells) + " |")

    return "\n".join([header_line, separator_line] + data_lines)


def read_csv(
    file_path: Union[str, Path],
    delimiter: Optional[str] = None,
    max_rows: int = 1000,
    has_header: bool = True,
) -> CSVReadResult:
    """Read data from a CSV file.

    Args:
        file_path: Path to the CSV file.
        delimiter: Field separator. If None, auto-detect.
        max_rows: Maximum number of data rows to read (default 1000).
        has_header: Whether the first row contains headers (default True).

    Returns:
        CSVReadResult containing parsed data and metadata.
    """
    # Convert to Path object
    path = Path(file_path) if isinstance(file_path, str) else file_path

    # Validate file exists
    if not path.exists():
        return CSVReadResult(
            success=False,
            error=f"File not found: {path}",
        )

    # Check file is not a directory
    if path.is_dir():
        return CSVReadResult(
            success=False,
            error=f"Path is a directory, not a file: {path}",
        )

    # Check file extension (but allow other extensions like .tsv, .txt)
    suffix = path.suffix.lower()
    if suffix not in [".csv", ".tsv", ".txt", ""]:
        return CSVReadResult(
            success=False,
            error=f"File does not have a typical CSV extension (.csv, .tsv, .txt): {path}",
        )

    # Check file is not empty
    if path.stat().st_size == 0:
        return CSVReadResult(
            success=False,
            error=f"File is empty: {path}",
        )

    # Detect encoding
    encoding = _detect_encoding(path)

    try:
        # Read file content for delimiter detection
        with open(path, encoding=encoding) as f:
            sample_lines = []
            for _ in range(5):
                line = f.readline()
                if not line:
                    break
                sample_lines.append(line)

        # Detect delimiter if not specified
        if delimiter is None:
            delimiter = _detect_delimiter(sample_lines)

        # Read CSV content
        with open(path, encoding=encoding, newline="") as f:
            reader = csv.reader(f, delimiter=delimiter)

            all_rows = []
            for row in reader:
                all_rows.append(row)

        if not all_rows:
            return CSVReadResult(
                success=True,
                headers=[],
                rows=[],
                row_count=0,
                delimiter_used=delimiter,
                encoding_used=encoding,
            )

        # Extract headers
        if has_header:
            headers = all_rows[0] if all_rows else []
            # Clean up headers
            headers = [h.strip() if h else f"Column{i + 1}" for i, h in enumerate(headers)]
            # Fill empty headers
            headers = [h if h else f"Column{i + 1}" for i, h in enumerate(headers)]
            data_rows = all_rows[1:]
        else:
            # Generate column headers
            if all_rows:
                num_cols = max(len(row) for row in all_rows)
                headers = [f"Column{i + 1}" for i in range(num_cols)]
            else:
                headers = []
            data_rows = all_rows

        total_data_rows = len(data_rows)
        truncated = False

        if len(data_rows) > max_rows:
            data_rows = data_rows[:max_rows]
            truncated = True

        # Infer column types
        column_types = {}
        for col_idx, header in enumerate(headers):
            col_values = [row[col_idx] if col_idx < len(row) else "" for row in data_rows]
            col_type = _infer_column_type(col_values)
            column_types[header] = col_type

        return CSVReadResult(
            success=True,
            headers=headers,
            rows=data_rows,
            row_count=total_data_rows,
            delimiter_used=delimiter,
            column_types=column_types,
            truncated=truncated,
            encoding_used=encoding,
        )

    except csv.Error as e:
        return CSVReadResult(
            success=False,
            error=f"CSV parsing error: {e}",
        )
    except Exception as e:
        return CSVReadResult(
            success=False,
            error=f"Error reading CSV file: {e}",
        )


def format_csv_as_table(result: CSVReadResult) -> str:
    """Format CSV data as a markdown table.

    Args:
        result: CSVReadResult from read_csv.

    Returns:
        Formatted markdown table string.
    """
    if not result.success:
        return ""

    return _format_as_table(result.headers, result.rows)
