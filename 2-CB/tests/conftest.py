"""
Pytest configuration and fixtures for Campaign Builder tests.
"""

from pathlib import Path

import pytest

from campaign_builder.utils.deps import (
    check_pdf_available,
    check_excel_available,
    check_api_key_configured,
)


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "live_api: marks tests as requiring live API (skipped if no API key)"
    )
    config.addinivalue_line(
        "markers", "requires_pdf: marks tests as requiring PyMuPDF"
    )
    config.addinivalue_line(
        "markers", "requires_excel: marks tests as requiring openpyxl"
    )


# Skip markers
requires_pdf = pytest.mark.skipif(
    not check_pdf_available(),
    reason="PyMuPDF (fitz) not installed"
)

requires_excel = pytest.mark.skipif(
    not check_excel_available(),
    reason="openpyxl not installed"
)

requires_api = pytest.mark.skipif(
    not check_api_key_configured(),
    reason="ANTHROPIC_API_KEY not configured"
)


@pytest.fixture
def fixtures_dir() -> Path:
    """Return the path to the test fixtures directory."""
    return Path(__file__).parent / "fixtures"


@pytest.fixture
def lammps_fixtures(fixtures_dir: Path) -> Path:
    """Return the path to LAMMPS test fixtures."""
    return fixtures_dir / "lammps"


@pytest.fixture
def qe_fixtures(fixtures_dir: Path) -> Path:
    """Return the path to Quantum ESPRESSO test fixtures."""
    return fixtures_dir / "qe"


@pytest.fixture
def document_fixtures(fixtures_dir: Path) -> Path:
    """Return the path to document test fixtures."""
    return fixtures_dir / "documents"


@pytest.fixture
def invalid_fixtures(fixtures_dir: Path) -> Path:
    """Return the path to invalid input test fixtures."""
    return fixtures_dir / "invalid"
