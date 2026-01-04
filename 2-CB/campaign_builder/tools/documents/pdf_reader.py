"""
PDF reading tool for Campaign Builder.

This module provides functionality for extracting text and metadata from PDF documents
using PyMuPDF (fitz) library.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional, Union

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None  # type: ignore


@dataclass
class PDFReadResult:
    """Result of reading a PDF file.

    Attributes:
        success: Whether the PDF was read successfully.
        text: Extracted text content from the PDF.
        page_count: Total number of pages in the PDF.
        metadata: PDF metadata (title, author, subject, etc.).
        error: Error message if reading failed, None otherwise.
        extraction_quality: Quality of text extraction ("high", "medium", "low").
        truncated: Whether the text was truncated due to limits.
    """

    success: bool
    text: str = ""
    page_count: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    extraction_quality: str = "unknown"
    truncated: bool = False


def _parse_page_range(pages: Optional[str], max_pages: int) -> list[int]:
    """Parse page range string into list of 0-indexed page numbers.

    Args:
        pages: Page range string like "1-5", "1,3,5", or "1-5,10,15-20".
        max_pages: Maximum number of pages in the document.

    Returns:
        List of 0-indexed page numbers.
    """
    if pages is None:
        return list(range(max_pages))

    result = set()
    parts = pages.split(",")

    for part in parts:
        part = part.strip()
        if not part:
            continue

        if "-" in part:
            # Range like "1-5"
            try:
                start_str, end_str = part.split("-", 1)
                start = int(start_str.strip())
                end = int(end_str.strip())
                if start <= end and start >= 1:
                    for i in range(start - 1, min(end, max_pages)):
                        result.add(i)
            except ValueError:
                continue
        else:
            # Single page like "5"
            try:
                page_num = int(part)
                if 1 <= page_num <= max_pages:
                    result.add(page_num - 1)  # Convert to 0-indexed
            except ValueError:
                continue

    return sorted(result) if result else list(range(max_pages))


def _assess_extraction_quality(text: str, page_count: int) -> str:
    """Assess the quality of text extraction.

    Args:
        text: Extracted text content.
        page_count: Number of pages extracted from.

    Returns:
        Quality assessment: "high", "medium", or "low".
    """
    if page_count == 0:
        return "low"

    # Calculate average characters per page
    avg_chars = len(text) / page_count

    if avg_chars > 100:
        return "high"
    elif avg_chars > 20:
        return "medium"
    else:
        return "low"


def read_pdf(
    file_path: Union[str, Path],
    max_pages: Optional[int] = None,
    pages: Optional[str] = None,
    max_chars: int = 50000,
) -> PDFReadResult:
    """Read text and metadata from a PDF file.

    Args:
        file_path: Path to the PDF file.
        max_pages: Maximum number of pages to read (deprecated, use pages instead).
        pages: Page range like "1-5" or "1,3,7" (optional).
        max_chars: Maximum characters to return (default 50000).

    Returns:
        PDFReadResult containing extracted text, metadata, and status.
    """
    # Check if fitz is available
    if fitz is None:
        return PDFReadResult(
            success=False,
            error="PyMuPDF (fitz) library is not installed. Install with: pip install pymupdf",
        )

    # Convert to Path object
    path = Path(file_path) if isinstance(file_path, str) else file_path

    # Validate file exists
    if not path.exists():
        return PDFReadResult(
            success=False,
            error=f"File not found: {path}",
        )

    # Check file is not a directory
    if path.is_dir():
        return PDFReadResult(
            success=False,
            error=f"Path is a directory, not a file: {path}",
        )

    # Check file extension
    if path.suffix.lower() != ".pdf":
        return PDFReadResult(
            success=False,
            error=f"File does not have .pdf extension: {path}",
        )

    # Check file is not empty
    if path.stat().st_size == 0:
        return PDFReadResult(
            success=False,
            error=f"File is empty: {path}",
        )

    # Check file size (limit to 100MB)
    max_size_mb = 100
    if path.stat().st_size > max_size_mb * 1024 * 1024:
        return PDFReadResult(
            success=False,
            error=f"File size exceeds {max_size_mb}MB limit: {path}",
        )

    try:
        # Open the PDF
        doc = fitz.open(path)
    except Exception as e:
        error_msg = str(e).lower()
        if "password" in error_msg or "encrypted" in error_msg:
            return PDFReadResult(
                success=False,
                error=f"PDF is password protected: {path}",
            )
        return PDFReadResult(
            success=False,
            error=f"Failed to open PDF: {e}",
        )

    try:
        total_pages = len(doc)

        # Extract metadata
        metadata = {}
        if doc.metadata:
            for key in ["title", "author", "subject", "creator", "producer", "creationDate"]:
                value = doc.metadata.get(key)
                if value:
                    metadata[key] = value

        # Determine which pages to read
        if pages is not None:
            page_indices = _parse_page_range(pages, total_pages)
        elif max_pages is not None:
            page_indices = list(range(min(max_pages, total_pages)))
        else:
            page_indices = list(range(total_pages))

        # Extract text from selected pages
        text_parts = []
        total_chars = 0
        truncated = False

        for page_idx in page_indices:
            if page_idx >= total_pages:
                continue

            page = doc[page_idx]
            page_text = page.get_text("text")

            # Add page marker
            page_content = f"\n--- Page {page_idx + 1} ---\n{page_text}"

            # Check character limit
            if total_chars + len(page_content) > max_chars:
                # Truncate at limit
                remaining = max_chars - total_chars
                if remaining > 0:
                    truncated_content = page_content[:remaining]
                    # Try to find last complete sentence
                    last_period = truncated_content.rfind(". ")
                    if last_period > len(truncated_content) // 2:
                        truncated_content = truncated_content[: last_period + 1]
                    text_parts.append(truncated_content)
                text_parts.append(
                    f"\n\n[... Content truncated at {max_chars} characters ...]"
                )
                truncated = True
                break

            text_parts.append(page_content)
            total_chars += len(page_content)

        text = "".join(text_parts).strip()

        # Assess extraction quality
        pages_read = len(page_indices)
        quality = _assess_extraction_quality(text, pages_read)

        # Try to get title from first page if not in metadata
        if "title" not in metadata and total_pages > 0:
            first_page = doc[0]
            blocks = first_page.get_text("blocks")
            if blocks:
                # Get the first text block as potential title
                for block in blocks[:3]:  # Check first 3 blocks
                    if len(block) >= 5 and isinstance(block[4], str):
                        potential_title = block[4].strip()
                        if 10 < len(potential_title) < 200 and "\n" not in potential_title:
                            metadata["inferred_title"] = potential_title
                            break

        doc.close()

        return PDFReadResult(
            success=True,
            text=text,
            page_count=total_pages,
            metadata=metadata,
            extraction_quality=quality,
            truncated=truncated,
        )

    except Exception as e:
        doc.close()
        return PDFReadResult(
            success=False,
            error=f"Error reading PDF content: {e}",
        )
