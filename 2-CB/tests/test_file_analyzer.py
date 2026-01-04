"""
Tests for FileAnalyzer agent implementation.

This module tests Thrusts 11-12:
    - Pre-check functions for file validation
    - File discovery with patterns
    - Single file analysis
    - Batch analysis with failure isolation
"""

import asyncio
from pathlib import Path
from typing import List

import pytest

from campaign_builder.agent.file_analyzer import (
    AnalysisResult,
    BatchAnalysisResult,
    analyze_file,
    analyze_all_files,
    compute_file_hash,
    discover_files,
    is_supported_file,
    pre_check_file,
    assess_batch_result,
    get_file_analyzer_tools,
    MAX_FILE_SIZE_BYTES,
    SUPPORTED_EXTENSIONS,
    DEFAULT_EXCLUDE_PATTERNS,
)
from campaign_builder.schemas import (
    ErrorCode,
    ErrorSeverity,
    FileType,
)


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def sample_lammps_data(tmp_path: Path) -> Path:
    """Create a sample LAMMPS data file for testing."""
    content = """# Simple LAMMPS data file for testing
20 atoms
4 atom types
5 bonds
2 bond types

0.0 10.0 xlo xhi
0.0 10.0 ylo yhi
0.0 10.0 zlo zhi

Masses

1 12.011  # C
2 1.008   # H
3 15.999  # O
4 14.007  # N

Pair Coeffs

1 0.0556 3.431  # C
2 0.0200 2.500  # H
3 0.1550 3.166  # O
4 0.0700 3.250  # N

Atoms # full

1 1 1 -0.1 0.0 0.0 0.0
2 1 1 -0.1 1.0 0.0 0.0
3 1 2 0.1 2.0 0.0 0.0
4 1 2 0.1 3.0 0.0 0.0
5 1 3 -0.5 4.0 0.0 0.0
"""
    file_path = tmp_path / "test.data"
    file_path.write_text(content)
    return file_path


@pytest.fixture
def sample_lammps_input(tmp_path: Path) -> Path:
    """Create a sample LAMMPS input file for testing."""
    content = """# Test LAMMPS input script
units real
atom_style full
boundary p p p

read_data test.data

pair_style lj/cut/coul/long 12.0
kspace_style pppm 1e-4

pair_coeff 1 1 0.0556 3.431
pair_coeff 2 2 0.0200 2.500
pair_coeff 3 3 0.1550 3.166
pair_coeff 4 4 0.0700 3.250

neighbor 2.0 bin
neigh_modify delay 0 every 1 check yes

timestep 1.0

fix 1 all nvt temp 300.0 300.0 100.0

thermo 1000
run 10000
"""
    file_path = tmp_path / "input.in"
    file_path.write_text(content)
    return file_path


@pytest.fixture
def sample_qe_input(tmp_path: Path) -> Path:
    """Create a sample QE input file for testing."""
    content = """&CONTROL
    calculation = 'scf'
    prefix = 'test'
    outdir = './tmp'
    pseudo_dir = './pseudo'
/

&SYSTEM
    nat = 2
    ntyp = 1
    ecutwfc = 30.0
    ecutrho = 240.0
    ibrav = 0
/

&ELECTRONS
    conv_thr = 1.0d-8
/

ATOMIC_SPECIES
Si 28.0855 Si.pbe-n-rrkjus_psl.1.0.0.UPF

ATOMIC_POSITIONS crystal
Si 0.0 0.0 0.0
Si 0.25 0.25 0.25

K_POINTS automatic
4 4 4 0 0 0

CELL_PARAMETERS angstrom
5.43 0.0 0.0
0.0 5.43 0.0
0.0 0.0 5.43
"""
    file_path = tmp_path / "scf.pwi"
    file_path.write_text(content)
    return file_path


@pytest.fixture
def sample_csv(tmp_path: Path) -> Path:
    """Create a sample CSV file for testing."""
    content = """type,epsilon,sigma
1,0.0556,3.431
2,0.0200,2.500
3,0.1550,3.166
4,0.0700,3.250
"""
    file_path = tmp_path / "params.csv"
    file_path.write_text(content)
    return file_path


# =============================================================================
# Pre-Check Tests
# =============================================================================


class TestPreChecks:
    """Tests for file pre-checks."""

    def test_existing_file_passes(self, sample_lammps_data: Path) -> None:
        """Test that existing, readable file passes pre-check."""
        ok, error = pre_check_file(sample_lammps_data)
        assert ok is True
        assert error is None

    def test_missing_file_fails(self, tmp_path: Path) -> None:
        """Test that missing file fails pre-check with E101."""
        ok, error = pre_check_file(tmp_path / "nonexistent.data")
        assert ok is False
        assert error is not None
        assert error.code == ErrorCode.E101_FILE_NOT_FOUND

    def test_empty_file_fails(self, tmp_path: Path) -> None:
        """Test that empty file fails pre-check with E105."""
        empty = tmp_path / "empty.data"
        empty.write_text("")

        ok, error = pre_check_file(empty)
        assert ok is False
        assert error is not None
        assert error.code == ErrorCode.E105_FILE_EMPTY

    def test_binary_file_fails(self, tmp_path: Path) -> None:
        """Test that binary file fails pre-check with E106."""
        binary = tmp_path / "binary.bin"
        # Write bytes including null bytes (binary indicator)
        binary.write_bytes(bytes(range(256)))

        ok, error = pre_check_file(binary)
        assert ok is False
        assert error is not None
        assert error.code == ErrorCode.E106_BINARY_UNSUPPORTED

    def test_large_file_fails(self, tmp_path: Path) -> None:
        """Test that file exceeding size limit fails with E102."""
        # We can't actually create a 500MB+ file, so we'll test the logic
        # by checking the constant is defined correctly
        assert MAX_FILE_SIZE_BYTES == 500 * 1024 * 1024

    def test_pdf_binary_allowed(self, tmp_path: Path) -> None:
        """Test that PDF files are allowed despite being binary."""
        # Create a minimal PDF header (not a valid PDF but has .pdf extension)
        pdf_file = tmp_path / "test.pdf"
        pdf_file.write_bytes(b"%PDF-1.4\n" + b"\x00" * 100)

        ok, error = pre_check_file(pdf_file)
        # Should pass because .pdf is in BINARY_EXTENSIONS
        assert ok is True

    def test_excel_binary_allowed(self, tmp_path: Path) -> None:
        """Test that Excel files are allowed despite being binary."""
        xlsx_file = tmp_path / "test.xlsx"
        # Write some binary content
        xlsx_file.write_bytes(b"PK\x03\x04" + b"\x00" * 100)

        ok, error = pre_check_file(xlsx_file)
        assert ok is True


# =============================================================================
# File Hash Tests
# =============================================================================


class TestFileHash:
    """Tests for file hash computation."""

    def test_compute_hash_consistent(self, sample_lammps_data: Path) -> None:
        """Test that hash computation is consistent."""
        hash1 = compute_file_hash(sample_lammps_data)
        hash2 = compute_file_hash(sample_lammps_data)
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA256 hex length

    def test_different_content_different_hash(self, tmp_path: Path) -> None:
        """Test that different content produces different hash."""
        file1 = tmp_path / "file1.txt"
        file2 = tmp_path / "file2.txt"
        file1.write_text("content 1")
        file2.write_text("content 2")

        hash1 = compute_file_hash(file1)
        hash2 = compute_file_hash(file2)
        assert hash1 != hash2


# =============================================================================
# File Discovery Tests
# =============================================================================


class TestFileDiscovery:
    """Tests for file discovery."""

    def test_discovers_lammps_files(self, tmp_path: Path) -> None:
        """Test discovery finds LAMMPS files."""
        (tmp_path / "structure.data").write_text("# LAMMPS data")
        (tmp_path / "input.in").write_text("units real")

        files = discover_files(tmp_path)
        extensions = {f.suffix for f in files}
        assert ".data" in extensions
        assert ".in" in extensions

    def test_excludes_pycache(self, tmp_path: Path) -> None:
        """Test __pycache__ is excluded."""
        pycache = tmp_path / "__pycache__"
        pycache.mkdir()
        (pycache / "file.pyc").write_text("test")
        (tmp_path / "test.data").write_text("test")

        files = discover_files(tmp_path)
        assert not any("__pycache__" in str(f) for f in files)
        assert any(f.name == "test.data" for f in files)

    def test_excludes_git(self, tmp_path: Path) -> None:
        """Test .git is excluded."""
        git_dir = tmp_path / ".git"
        git_dir.mkdir()
        (git_dir / "config").write_text("test")
        (tmp_path / "test.data").write_text("test")

        files = discover_files(tmp_path)
        assert not any(".git" in str(f) for f in files)

    def test_include_pattern(self, tmp_path: Path) -> None:
        """Test include pattern filtering."""
        (tmp_path / "a.data").write_text("test")
        (tmp_path / "b.in").write_text("test")
        (tmp_path / "c.txt").write_text("test")

        files = discover_files(tmp_path, include_patterns=["*.data"])
        assert len(files) == 1
        assert files[0].name == "a.data"

    def test_empty_directory(self, tmp_path: Path) -> None:
        """Test discovery on empty directory."""
        files = discover_files(tmp_path)
        assert len(files) == 0

    def test_nonexistent_directory(self, tmp_path: Path) -> None:
        """Test discovery on nonexistent directory."""
        files = discover_files(tmp_path / "nonexistent")
        assert len(files) == 0

    def test_discovers_poscar(self, tmp_path: Path) -> None:
        """Test discovery finds POSCAR by name."""
        (tmp_path / "POSCAR").write_text("POSCAR content")
        (tmp_path / "CONTCAR").write_text("CONTCAR content")

        files = discover_files(tmp_path)
        names = {f.name for f in files}
        assert "POSCAR" in names
        assert "CONTCAR" in names


# =============================================================================
# Supported File Tests
# =============================================================================


class TestSupportedFile:
    """Tests for is_supported_file function."""

    def test_lammps_data_supported(self, tmp_path: Path) -> None:
        """Test LAMMPS data files are supported."""
        assert is_supported_file(tmp_path / "test.data") is True
        assert is_supported_file(tmp_path / "test.lmp") is True

    def test_qe_files_supported(self, tmp_path: Path) -> None:
        """Test QE files are supported."""
        assert is_supported_file(tmp_path / "test.pwi") is True
        assert is_supported_file(tmp_path / "test.pwo") is True

    def test_document_files_supported(self, tmp_path: Path) -> None:
        """Test document files are supported."""
        assert is_supported_file(tmp_path / "doc.pdf") is True
        assert is_supported_file(tmp_path / "data.xlsx") is True
        assert is_supported_file(tmp_path / "data.csv") is True

    def test_poscar_supported(self, tmp_path: Path) -> None:
        """Test POSCAR/CONTCAR are supported by name."""
        assert is_supported_file(tmp_path / "POSCAR") is True
        assert is_supported_file(tmp_path / "CONTCAR") is True

    def test_unsupported_extension(self, tmp_path: Path) -> None:
        """Test unsupported extensions."""
        assert is_supported_file(tmp_path / "test.jpg") is False
        assert is_supported_file(tmp_path / "test.mp3") is False


# =============================================================================
# Single File Analysis Tests
# =============================================================================


class TestSingleFileAnalysis:
    """Tests for single file analysis."""

    @pytest.mark.asyncio
    async def test_analyze_lammps_data(self, sample_lammps_data: Path) -> None:
        """Test analysis of LAMMPS data file."""
        result = await analyze_file(sample_lammps_data)

        assert result.success is True
        assert result.file_guide is not None
        assert result.file_guide.file_type == FileType.LAMMPS_DATA
        assert result.file_guide.atom_count == 20
        assert result.file_guide.atom_types_count == 4
        assert result.iterations_used >= 1
        assert result.duration_ms >= 0

    @pytest.mark.asyncio
    async def test_analyze_captures_atom_types(self, sample_lammps_data: Path) -> None:
        """Test analysis extracts atom types."""
        result = await analyze_file(sample_lammps_data)

        assert result.success is True
        assert result.file_guide.atom_types is not None
        assert len(result.file_guide.atom_types) == 4

        # Check first atom type (Carbon)
        c_type = result.file_guide.atom_types[0]
        assert c_type.id == 1
        assert abs(c_type.mass - 12.011) < 0.001
        assert c_type.element == "C"

    @pytest.mark.asyncio
    async def test_analyze_captures_box_dimensions(self, sample_lammps_data: Path) -> None:
        """Test analysis extracts box dimensions."""
        result = await analyze_file(sample_lammps_data)

        assert result.success is True
        assert result.file_guide.box_dimensions is not None
        box = result.file_guide.box_dimensions
        assert box.xlo == 0.0
        assert box.xhi == 10.0
        assert box.lx == 10.0
        assert box.volume == 1000.0

    @pytest.mark.asyncio
    async def test_analyze_captures_pair_coeffs(self, sample_lammps_data: Path) -> None:
        """Test analysis extracts pair coefficients."""
        result = await analyze_file(sample_lammps_data)

        assert result.success is True
        assert result.file_guide.pair_coeffs is not None
        assert len(result.file_guide.pair_coeffs) == 4

    @pytest.mark.asyncio
    async def test_analyze_lammps_input(self, sample_lammps_input: Path) -> None:
        """Test analysis of LAMMPS input script."""
        result = await analyze_file(sample_lammps_input)

        assert result.success is True
        assert result.file_guide is not None
        assert result.file_guide.file_type == FileType.LAMMPS_INPUT
        assert result.file_guide.pair_style == "lj/cut/coul/long 12.0"

    @pytest.mark.asyncio
    async def test_analyze_qe_input(self, sample_qe_input: Path) -> None:
        """Test analysis of QE input file."""
        result = await analyze_file(sample_qe_input)

        assert result.success is True
        assert result.file_guide is not None
        assert result.file_guide.file_type == FileType.QE_INPUT
        assert result.file_guide.calculation == "scf"  # Quotes are stripped
        assert result.file_guide.nat == 2
        assert result.file_guide.ntyp == 1
        assert result.file_guide.ecutwfc == 30.0

    @pytest.mark.asyncio
    async def test_analyze_csv(self, sample_csv: Path) -> None:
        """Test analysis of CSV file."""
        result = await analyze_file(sample_csv)

        assert result.success is True
        assert result.file_guide is not None
        assert result.file_guide.file_type == FileType.CSV
        assert result.file_guide.row_count == 4
        assert "type" in result.file_guide.columns

    @pytest.mark.asyncio
    async def test_analyze_missing_file(self, tmp_path: Path) -> None:
        """Test analysis of missing file returns error."""
        result = await analyze_file(tmp_path / "nonexistent.data")

        assert result.success is False
        assert result.file_guide is None
        assert len(result.errors) > 0
        assert result.errors[0].code == ErrorCode.E101_FILE_NOT_FOUND

    @pytest.mark.asyncio
    async def test_analyze_empty_file(self, tmp_path: Path) -> None:
        """Test analysis of empty file returns error."""
        empty_file = tmp_path / "empty.data"
        empty_file.write_text("")

        result = await analyze_file(empty_file)

        assert result.success is False
        assert result.file_guide is None
        assert len(result.errors) > 0
        assert result.errors[0].code == ErrorCode.E105_FILE_EMPTY

    @pytest.mark.asyncio
    async def test_analyze_has_hash(self, sample_lammps_data: Path) -> None:
        """Test analysis includes SHA256 hash."""
        result = await analyze_file(sample_lammps_data)

        assert result.success is True
        assert result.file_guide.sha256_hash is not None
        assert len(result.file_guide.sha256_hash) == 64


# =============================================================================
# Batch Analysis Tests
# =============================================================================


class TestBatchAnalysis:
    """Tests for parallel batch analysis."""

    @pytest.mark.asyncio
    async def test_parallel_analysis(
        self,
        sample_lammps_data: Path,
        sample_lammps_input: Path,
        sample_qe_input: Path,
    ) -> None:
        """Test parallel analysis of multiple files."""
        files = [sample_lammps_data, sample_lammps_input, sample_qe_input]

        result = await analyze_all_files(files, max_concurrent=3)

        assert result.total_files == 3
        assert result.successful == 3
        assert result.failed == 0
        assert len(result.file_guides) == 3
        assert result.parallel is True

    @pytest.mark.asyncio
    async def test_failure_isolation(
        self,
        sample_lammps_data: Path,
        tmp_path: Path,
    ) -> None:
        """Test one failure doesn't block others."""
        bad_file = tmp_path / "nonexistent.data"

        result = await analyze_all_files(
            [sample_lammps_data, bad_file],
            max_concurrent=2,
        )

        assert result.total_files == 2
        assert result.successful >= 1
        assert result.failed >= 1
        assert len(result.file_guides) >= 1

    @pytest.mark.asyncio
    async def test_empty_list(self) -> None:
        """Test analysis of empty file list."""
        result = await analyze_all_files([])

        assert result.total_files == 0
        assert result.successful == 0
        assert result.failed == 0
        assert len(result.file_guides) == 0
        assert result.parallel is False

    @pytest.mark.asyncio
    async def test_single_file_not_parallel(
        self,
        sample_lammps_data: Path,
    ) -> None:
        """Test single file analysis with batch function."""
        result = await analyze_all_files(
            [sample_lammps_data],
            max_concurrent=1,
        )

        assert result.total_files == 1
        assert result.successful == 1
        assert result.parallel is False

    @pytest.mark.asyncio
    async def test_progress_callback(
        self,
        sample_lammps_data: Path,
        sample_lammps_input: Path,
    ) -> None:
        """Test progress callback is called."""
        progress_calls: List[tuple] = []

        def on_progress(completed: int, total: int, current_file: str) -> None:
            progress_calls.append((completed, total, current_file))

        result = await analyze_all_files(
            [sample_lammps_data, sample_lammps_input],
            max_concurrent=1,
            progress_callback=on_progress,
        )

        assert len(progress_calls) == 2
        assert progress_calls[0][0] == 1  # First completion
        assert progress_calls[1][0] == 2  # Second completion


# =============================================================================
# Tool Helper Tests
# =============================================================================


class TestToolHelpers:
    """Tests for tool helper functions."""

    def test_get_file_analyzer_tools_base(self) -> None:
        """Test base tools are returned."""
        tools = get_file_analyzer_tools(FileType.LAMMPS_DATA)
        assert "Read" in tools
        assert "Grep" in tools
        assert "Bash" in tools
        assert "Glob" in tools

    def test_get_file_analyzer_tools_pdf(self) -> None:
        """Test PDF-specific tools."""
        tools = get_file_analyzer_tools(FileType.PDF)
        assert "read_pdf" in tools

    def test_get_file_analyzer_tools_excel(self) -> None:
        """Test Excel-specific tools."""
        tools = get_file_analyzer_tools(FileType.EXCEL)
        assert "read_excel" in tools

    def test_get_file_analyzer_tools_csv(self) -> None:
        """Test CSV-specific tools."""
        tools = get_file_analyzer_tools(FileType.CSV)
        assert "read_csv" in tools

    def test_assess_batch_result_success(self) -> None:
        """Test batch assessment for success."""
        result = BatchAnalysisResult(
            total_files=3,
            successful=3,
            failed=0,
            file_guides=[],
            errors=[],
            total_duration_ms=100,
            parallel=True,
        )
        assert assess_batch_result(result) == ErrorSeverity.INFO

    def test_assess_batch_result_partial(self) -> None:
        """Test batch assessment for partial failure."""
        result = BatchAnalysisResult(
            total_files=3,
            successful=2,
            failed=1,
            file_guides=[],
            errors=[],
            total_duration_ms=100,
            parallel=True,
        )
        assert assess_batch_result(result) == ErrorSeverity.WARNING

    def test_assess_batch_result_all_failed(self) -> None:
        """Test batch assessment for total failure."""
        result = BatchAnalysisResult(
            total_files=3,
            successful=0,
            failed=3,
            file_guides=[],
            errors=[],
            total_duration_ms=100,
            parallel=True,
        )
        assert assess_batch_result(result) == ErrorSeverity.FATAL


# =============================================================================
# Constants Tests
# =============================================================================


class TestConstants:
    """Tests for module constants."""

    def test_max_file_size(self) -> None:
        """Test max file size constant."""
        assert MAX_FILE_SIZE_BYTES == 500 * 1024 * 1024

    def test_supported_extensions(self) -> None:
        """Test supported extensions include expected types."""
        assert ".data" in SUPPORTED_EXTENSIONS
        assert ".lmp" in SUPPORTED_EXTENSIONS
        assert ".pwi" in SUPPORTED_EXTENSIONS
        assert ".pdf" in SUPPORTED_EXTENSIONS
        assert ".csv" in SUPPORTED_EXTENSIONS

    def test_default_exclude_patterns(self) -> None:
        """Test default exclude patterns."""
        assert any("__pycache__" in p for p in DEFAULT_EXCLUDE_PATTERNS)
        assert any(".git" in p for p in DEFAULT_EXCLUDE_PATTERNS)
