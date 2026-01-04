"""
Dependency checking utilities for Campaign Builder.

Provides functions to check availability of optional dependencies
like PyMuPDF (fitz) and openpyxl for PDF/Excel reading.
"""


def check_pdf_available() -> bool:
    """Check if PyMuPDF (fitz) is available for PDF reading.

    Returns:
        True if PyMuPDF is installed, False otherwise
    """
    try:
        import fitz  # noqa: F401
        return True
    except ImportError:
        return False


def check_excel_available() -> bool:
    """Check if openpyxl is available for Excel reading.

    Returns:
        True if openpyxl is installed, False otherwise
    """
    try:
        import openpyxl  # noqa: F401
        return True
    except ImportError:
        return False


def check_anthropic_available() -> bool:
    """Check if anthropic library is available.

    Returns:
        True if anthropic is installed, False otherwise
    """
    try:
        import anthropic  # noqa: F401
        return True
    except ImportError:
        return False


def check_api_key_configured() -> bool:
    """Check if ANTHROPIC_API_KEY is configured.

    Returns:
        True if API key is set, False otherwise
    """
    import os
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    return bool(key and key.strip() and not key.startswith("sk-ant-invalid"))


__all__ = [
    "check_pdf_available",
    "check_excel_available",
    "check_anthropic_available",
    "check_api_key_configured",
]
