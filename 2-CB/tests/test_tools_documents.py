"""
Tests for document reading tools.

This module tests the PDF, Excel, and CSV reading functionality.
"""

import csv
import tempfile
from pathlib import Path

import pytest

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
from campaign_builder.utils.deps import check_pdf_available, check_excel_available

# Check availability
HAS_PYMUPDF = check_pdf_available()
HAS_OPENPYXL = check_excel_available()

# Skip markers
requires_pdf = pytest.mark.skipif(not HAS_PYMUPDF, reason="PyMuPDF not installed")
requires_excel = pytest.mark.skipif(not HAS_OPENPYXL, reason="openpyxl not installed")


# ============================================================================
# PDF Reader Tests
# ============================================================================


class TestPDFReader:
    """Tests for PDF reading functionality."""

    def test_pdf_read_result_dataclass(self):
        """Test PDFReadResult dataclass creation."""
        result = PDFReadResult(
            success=True,
            text="Test content",
            page_count=5,
            metadata={"title": "Test"},
            extraction_quality="high",
        )
        assert result.success is True
        assert result.text == "Test content"
        assert result.page_count == 5
        assert result.metadata["title"] == "Test"
        assert result.error is None
        assert result.extraction_quality == "high"
        assert result.truncated is False

    def test_pdf_read_result_error(self):
        """Test PDFReadResult with error."""
        result = PDFReadResult(
            success=False,
            error="File not found",
        )
        assert result.success is False
        assert result.error == "File not found"
        assert result.text == ""
        assert result.page_count == 0

    @requires_pdf
    def test_read_pdf_file_not_found(self):
        """Test reading a non-existent PDF file."""
        result = read_pdf("/nonexistent/path/file.pdf")
        assert result.success is False
        assert "not found" in result.error.lower()

    @requires_pdf
    def test_read_pdf_directory_instead_of_file(self, tmp_path):
        """Test reading a directory instead of a file."""
        result = read_pdf(tmp_path)
        assert result.success is False
        assert "directory" in result.error.lower()

    @requires_pdf
    def test_read_pdf_wrong_extension(self, tmp_path):
        """Test reading a file with wrong extension."""
        wrong_file = tmp_path / "test.txt"
        wrong_file.write_text("Not a PDF")
        result = read_pdf(wrong_file)
        assert result.success is False
        assert ".pdf" in result.error.lower()

    @requires_pdf
    def test_read_pdf_empty_file(self, tmp_path):
        """Test reading an empty PDF file."""
        empty_pdf = tmp_path / "empty.pdf"
        empty_pdf.touch()
        result = read_pdf(empty_pdf)
        assert result.success is False
        assert "empty" in result.error.lower()

    @requires_pdf
    def test_read_pdf_accepts_string_path(self, tmp_path):
        """Test that read_pdf accepts string path."""
        fake_pdf = tmp_path / "test.pdf"
        fake_pdf.touch()
        result = read_pdf(str(fake_pdf))
        # Will fail for different reason (empty file), but path handling works
        assert "empty" in result.error.lower()

    def test_read_pdf_with_valid_pdf(self, document_fixtures):
        """Test reading a valid PDF file (if fixture exists)."""
        pdf_path = document_fixtures / "sample.pdf"
        if pdf_path.exists():
            result = read_pdf(pdf_path)
            assert result.success is True
            assert result.page_count > 0
            assert isinstance(result.text, str)
        else:
            pytest.skip("No sample.pdf fixture available")


# ============================================================================
# Excel Reader Tests
# ============================================================================


class TestExcelReader:
    """Tests for Excel reading functionality."""

    def test_sheet_data_dataclass(self):
        """Test SheetData dataclass creation."""
        sheet = SheetData(
            name="Sheet1",
            headers=["A", "B", "C"],
            rows=[["1", "2", "3"], ["4", "5", "6"]],
            row_count=2,
        )
        assert sheet.name == "Sheet1"
        assert sheet.headers == ["A", "B", "C"]
        assert len(sheet.rows) == 2
        assert sheet.row_count == 2

    def test_excel_read_result_dataclass(self):
        """Test ExcelReadResult dataclass creation."""
        sheet = SheetData(name="Sheet1", headers=["A"], rows=[["1"]], row_count=1)
        result = ExcelReadResult(
            success=True,
            sheets=[sheet],
            metadata={"creator": "Test"},
            sheet_names=["Sheet1", "Sheet2"],
        )
        assert result.success is True
        assert len(result.sheets) == 1
        assert result.sheet_names == ["Sheet1", "Sheet2"]
        assert result.error is None

    def test_excel_read_result_error(self):
        """Test ExcelReadResult with error."""
        result = ExcelReadResult(
            success=False,
            error="Invalid file",
        )
        assert result.success is False
        assert result.error == "Invalid file"
        assert result.sheets == []

    @pytest.mark.skipif(HAS_OPENPYXL, reason="Test only runs when openpyxl is NOT installed")
    def test_read_excel_missing_openpyxl(self):
        """Test that read_excel returns helpful error when openpyxl is not installed."""
        result = read_excel("/any/path.xlsx")
        assert result.success is False
        assert "openpyxl" in result.error.lower()
        assert "install" in result.error.lower()

    @pytest.mark.skipif(not HAS_OPENPYXL, reason="openpyxl not installed")
    def test_read_excel_file_not_found(self):
        """Test reading a non-existent Excel file."""
        result = read_excel("/nonexistent/path/file.xlsx")
        assert result.success is False
        assert "not found" in result.error.lower()

    @pytest.mark.skipif(not HAS_OPENPYXL, reason="openpyxl not installed")
    def test_read_excel_directory_instead_of_file(self, tmp_path):
        """Test reading a directory instead of a file."""
        result = read_excel(tmp_path)
        assert result.success is False
        assert "directory" in result.error.lower()

    @pytest.mark.skipif(not HAS_OPENPYXL, reason="openpyxl not installed")
    def test_read_excel_wrong_extension(self, tmp_path):
        """Test reading a file with wrong extension."""
        wrong_file = tmp_path / "test.txt"
        wrong_file.write_text("Not an Excel file")
        result = read_excel(wrong_file)
        assert result.success is False
        assert "extension" in result.error.lower()

    @pytest.mark.skipif(not HAS_OPENPYXL, reason="openpyxl not installed")
    def test_read_excel_empty_file(self, tmp_path):
        """Test reading an empty Excel file."""
        empty_excel = tmp_path / "empty.xlsx"
        empty_excel.touch()
        result = read_excel(empty_excel)
        assert result.success is False
        assert "empty" in result.error.lower()

    @pytest.mark.skipif(not HAS_OPENPYXL, reason="openpyxl not installed")
    def test_read_excel_xls_not_supported(self, tmp_path):
        """Test that .xls format returns appropriate error."""
        old_excel = tmp_path / "old.xls"
        old_excel.write_bytes(b"fake xls content")
        result = read_excel(old_excel)
        assert result.success is False
        assert "xls" in result.error.lower()

    @pytest.mark.skipif(not HAS_OPENPYXL, reason="openpyxl not installed")
    def test_read_excel_accepts_string_path(self, tmp_path):
        """Test that read_excel accepts string path."""
        fake_excel = tmp_path / "test.xlsx"
        fake_excel.touch()
        result = read_excel(str(fake_excel))
        # Will fail for different reason (empty file), but path handling works
        assert "empty" in result.error.lower()

    def test_read_excel_with_valid_file(self, document_fixtures):
        """Test reading a valid Excel file (if fixture exists)."""
        excel_path = document_fixtures / "sample.xlsx"
        if excel_path.exists():
            result = read_excel(excel_path)
            assert result.success is True
            assert len(result.sheets) > 0
            assert len(result.sheet_names) > 0
        else:
            pytest.skip("No sample.xlsx fixture available")

    def test_format_excel_as_table_empty_result(self):
        """Test formatting an empty Excel result."""
        result = ExcelReadResult(success=False, error="Error")
        table = format_excel_as_table(result)
        assert table == ""

    def test_format_excel_as_table_with_data(self):
        """Test formatting Excel data as markdown table."""
        sheet = SheetData(
            name="Sheet1",
            headers=["Name", "Value"],
            rows=[["Test1", "100"], ["Test2", "200"]],
            row_count=2,
        )
        result = ExcelReadResult(success=True, sheets=[sheet])
        table = format_excel_as_table(result)
        assert "Name" in table
        assert "Value" in table
        assert "Test1" in table
        assert "|" in table


# ============================================================================
# CSV Reader Tests
# ============================================================================


class TestCSVReader:
    """Tests for CSV reading functionality."""

    def test_csv_read_result_dataclass(self):
        """Test CSVReadResult dataclass creation."""
        result = CSVReadResult(
            success=True,
            headers=["A", "B", "C"],
            rows=[["1", "2", "3"], ["4", "5", "6"]],
            row_count=2,
            delimiter_used=",",
        )
        assert result.success is True
        assert result.headers == ["A", "B", "C"]
        assert len(result.rows) == 2
        assert result.row_count == 2
        assert result.delimiter_used == ","
        assert result.error is None

    def test_csv_read_result_error(self):
        """Test CSVReadResult with error."""
        result = CSVReadResult(
            success=False,
            error="Invalid file",
        )
        assert result.success is False
        assert result.error == "Invalid file"
        assert result.headers == []
        assert result.rows == []

    def test_read_csv_file_not_found(self):
        """Test reading a non-existent CSV file."""
        result = read_csv("/nonexistent/path/file.csv")
        assert result.success is False
        assert "not found" in result.error.lower()

    def test_read_csv_directory_instead_of_file(self, tmp_path):
        """Test reading a directory instead of a file."""
        result = read_csv(tmp_path)
        assert result.success is False
        assert "directory" in result.error.lower()

    def test_read_csv_empty_file(self, tmp_path):
        """Test reading an empty CSV file."""
        empty_csv = tmp_path / "empty.csv"
        empty_csv.touch()
        result = read_csv(empty_csv)
        assert result.success is False
        assert "empty" in result.error.lower()

    def test_read_csv_simple_comma_delimited(self, tmp_path):
        """Test reading a simple comma-delimited CSV."""
        csv_file = tmp_path / "test.csv"
        csv_file.write_text("name,value,count\nAlpha,100,5\nBeta,200,10\n")
        result = read_csv(csv_file)
        assert result.success is True
        assert result.headers == ["name", "value", "count"]
        assert len(result.rows) == 2
        assert result.rows[0] == ["Alpha", "100", "5"]
        assert result.delimiter_used == ","

    def test_read_csv_tab_delimited(self, tmp_path):
        """Test reading a tab-delimited CSV."""
        csv_file = tmp_path / "test.tsv"
        csv_file.write_text("name\tvalue\tcount\nAlpha\t100\t5\nBeta\t200\t10\n")
        result = read_csv(csv_file)
        assert result.success is True
        assert result.headers == ["name", "value", "count"]
        assert len(result.rows) == 2
        assert result.delimiter_used == "\t"

    def test_read_csv_semicolon_delimited(self, tmp_path):
        """Test reading a semicolon-delimited CSV."""
        csv_file = tmp_path / "test.csv"
        csv_file.write_text("name;value;count\nAlpha;100;5\nBeta;200;10\n")
        result = read_csv(csv_file)
        assert result.success is True
        assert result.headers == ["name", "value", "count"]
        assert result.delimiter_used == ";"

    def test_read_csv_pipe_delimited(self, tmp_path):
        """Test reading a pipe-delimited CSV."""
        csv_file = tmp_path / "test.csv"
        csv_file.write_text("name|value|count\nAlpha|100|5\nBeta|200|10\n")
        result = read_csv(csv_file)
        assert result.success is True
        assert result.delimiter_used == "|"

    def test_read_csv_explicit_delimiter(self, tmp_path):
        """Test reading CSV with explicit delimiter."""
        csv_file = tmp_path / "test.csv"
        csv_file.write_text("name;value;count\nAlpha;100;5\n")
        result = read_csv(csv_file, delimiter=";")
        assert result.success is True
        assert result.delimiter_used == ";"
        assert result.headers == ["name", "value", "count"]

    def test_read_csv_max_rows_limit(self, tmp_path):
        """Test that max_rows limit is respected."""
        csv_file = tmp_path / "test.csv"
        lines = ["id,value"] + [f"{i},{i*10}" for i in range(100)]
        csv_file.write_text("\n".join(lines))
        result = read_csv(csv_file, max_rows=10)
        assert result.success is True
        assert len(result.rows) == 10
        assert result.row_count == 100  # Total data rows (100 data lines after header)
        assert result.truncated is True

    def test_read_csv_column_type_inference_numeric(self, tmp_path):
        """Test column type inference for numeric columns."""
        csv_file = tmp_path / "test.csv"
        csv_file.write_text("id,value\n1,100\n2,200\n3,300\n")
        result = read_csv(csv_file)
        assert result.success is True
        assert result.column_types["id"] == "numeric"
        assert result.column_types["value"] == "numeric"

    def test_read_csv_column_type_inference_text(self, tmp_path):
        """Test column type inference for text columns."""
        csv_file = tmp_path / "test.csv"
        csv_file.write_text("name,city\nAlice,Boston\nBob,Chicago\n")
        result = read_csv(csv_file)
        assert result.success is True
        assert result.column_types["name"] == "text"
        assert result.column_types["city"] == "text"

    def test_read_csv_column_type_inference_mixed(self, tmp_path):
        """Test column type inference for mixed columns."""
        csv_file = tmp_path / "test.csv"
        csv_file.write_text("data\n100\ntext\n200\n")
        result = read_csv(csv_file)
        assert result.success is True
        assert result.column_types["data"] == "mixed"

    def test_read_csv_quoted_fields(self, tmp_path):
        """Test reading CSV with quoted fields containing delimiters."""
        csv_file = tmp_path / "test.csv"
        csv_file.write_text('name,description\n"John","Hello, World"\n')
        result = read_csv(csv_file)
        assert result.success is True
        assert result.rows[0][1] == "Hello, World"

    def test_read_csv_without_header(self, tmp_path):
        """Test reading CSV without header row."""
        csv_file = tmp_path / "test.csv"
        csv_file.write_text("Alpha,100,5\nBeta,200,10\n")
        result = read_csv(csv_file, has_header=False)
        assert result.success is True
        assert result.headers == ["Column1", "Column2", "Column3"]
        assert len(result.rows) == 2
        assert result.rows[0] == ["Alpha", "100", "5"]

    def test_read_csv_accepts_string_path(self, tmp_path):
        """Test that read_csv accepts string path."""
        csv_file = tmp_path / "test.csv"
        csv_file.write_text("a,b\n1,2\n")
        result = read_csv(str(csv_file))
        assert result.success is True

    def test_read_csv_with_utf8_bom(self, tmp_path):
        """Test reading CSV with UTF-8 BOM encoding."""
        csv_file = tmp_path / "test.csv"
        # Write with UTF-8 BOM
        csv_file.write_bytes(b"\xef\xbb\xbfname,value\nTest,100\n")
        result = read_csv(csv_file)
        assert result.success is True
        assert "name" in result.headers

    def test_read_csv_with_latin1_encoding(self, tmp_path):
        """Test reading CSV with Latin-1 encoding."""
        csv_file = tmp_path / "test.csv"
        # Write with Latin-1 encoding (includes special character)
        content = "name,city\nJose,Sao Paulo\n".encode("latin-1")
        csv_file.write_bytes(content)
        result = read_csv(csv_file)
        assert result.success is True

    def test_format_csv_as_table_empty_result(self):
        """Test formatting an empty CSV result."""
        result = CSVReadResult(success=False, error="Error")
        table = format_csv_as_table(result)
        assert table == ""

    def test_format_csv_as_table_with_data(self):
        """Test formatting CSV data as markdown table."""
        result = CSVReadResult(
            success=True,
            headers=["Name", "Value"],
            rows=[["Test1", "100"], ["Test2", "200"]],
            row_count=2,
        )
        table = format_csv_as_table(result)
        assert "Name" in table
        assert "Value" in table
        assert "Test1" in table
        assert "|" in table


# ============================================================================
# Integration Tests
# ============================================================================


class TestDocumentToolsIntegration:
    """Integration tests for document tools."""

    def test_all_tools_importable(self):
        """Test that all document tools can be imported from main module."""
        from campaign_builder.tools import (
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

        # Verify they are callable
        assert callable(read_pdf)
        assert callable(read_excel)
        assert callable(read_csv)
        assert callable(format_excel_as_table)
        assert callable(format_csv_as_table)

    def test_all_result_types_have_success_field(self):
        """Test that all result types have success field."""
        pdf_result = PDFReadResult(success=True)
        excel_result = ExcelReadResult(success=True)
        csv_result = CSVReadResult(success=True)

        assert hasattr(pdf_result, "success")
        assert hasattr(excel_result, "success")
        assert hasattr(csv_result, "success")

    def test_all_result_types_have_error_field(self):
        """Test that all result types have error field."""
        pdf_result = PDFReadResult(success=False, error="Error")
        excel_result = ExcelReadResult(success=False, error="Error")
        csv_result = CSVReadResult(success=False, error="Error")

        assert hasattr(pdf_result, "error")
        assert hasattr(excel_result, "error")
        assert hasattr(csv_result, "error")


# ============================================================================
# Fixtures for creating test files
# ============================================================================


@pytest.fixture
def sample_csv_file(tmp_path):
    """Create a sample CSV file for testing."""
    csv_file = tmp_path / "sample.csv"
    csv_file.write_text("name,epsilon,sigma\nArgon,0.238,3.4\nNeon,0.069,2.79\n")
    return csv_file


@pytest.fixture
def sample_tsv_file(tmp_path):
    """Create a sample TSV file for testing."""
    tsv_file = tmp_path / "sample.tsv"
    tsv_file.write_text("name\tepsilon\tsigma\nArgon\t0.238\t3.4\nNeon\t0.069\t2.79\n")
    return tsv_file


class TestWithFixtures:
    """Tests using pytest fixtures."""

    def test_read_csv_with_fixture(self, sample_csv_file):
        """Test reading CSV using fixture."""
        result = read_csv(sample_csv_file)
        assert result.success is True
        assert result.headers == ["name", "epsilon", "sigma"]
        assert len(result.rows) == 2
        assert result.rows[0][0] == "Argon"

    def test_read_tsv_with_fixture(self, sample_tsv_file):
        """Test reading TSV using fixture."""
        result = read_csv(sample_tsv_file)
        assert result.success is True
        assert result.delimiter_used == "\t"
        assert result.headers == ["name", "epsilon", "sigma"]
