# Testing and Integration

This file contains Thrusts 18-19: Unit testing and end-to-end integration testing.

---

## Thrust 18: Unit Testing

### 18.1 Objective

Implement comprehensive unit tests for all Campaign Builder modules, ensuring each component works correctly in isolation.

### 18.2 Background

Unit tests are essential for:
- Validating individual functions and classes
- Catching regressions early
- Documenting expected behavior
- Enabling safe refactoring

Testing priorities (in order):
1. Core schemas and dataclasses
2. Validation tools
3. Document reading tools
4. File analyzers
5. Campaign planner logic

### 18.3 Subtasks

#### 18.3.1 Set Up Test Infrastructure

**Directory structure:**
```
tests/
├── conftest.py              # Shared fixtures
├── fixtures/                # Test data files
│   ├── lammps/
│   │   ├── simple.data
│   │   ├── large.data
│   │   └── input.in
│   ├── qe/
│   │   ├── scf.pwi
│   │   └── relax.pwi
│   ├── documents/
│   │   ├── paper.pdf
│   │   └── params.xlsx
│   └── invalid/
│       ├── syntax_error.in
│       └── missing_coeffs.data
├── test_schemas.py
├── test_tools_documents.py
├── test_tools_validation.py
├── test_file_analyzer.py
├── test_campaign_planner.py
├── test_orchestration.py
└── test_cli.py
```

**In `conftest.py`:**

```python
"""Shared test fixtures for Campaign Builder tests."""
import pytest
from pathlib import Path

@pytest.fixture
def fixtures_dir() -> Path:
    """Path to test fixtures directory."""
    return Path(__file__).parent / "fixtures"

@pytest.fixture
def lammps_fixtures(fixtures_dir) -> Path:
    """Path to LAMMPS test fixtures."""
    return fixtures_dir / "lammps"

@pytest.fixture
def qe_fixtures(fixtures_dir) -> Path:
    """Path to QE test fixtures."""
    return fixtures_dir / "qe"

@pytest.fixture
def document_fixtures(fixtures_dir) -> Path:
    """Path to document test fixtures."""
    return fixtures_dir / "documents"

@pytest.fixture
def invalid_fixtures(fixtures_dir) -> Path:
    """Path to invalid file fixtures."""
    return fixtures_dir / "invalid"
```

#### 18.3.2 Create Test Fixtures

**LAMMPS simple.data fixture:**
```
# Test LAMMPS data file
20 atoms
4 atom types
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
# ... (minimal atom data for testing)
```

**LAMMPS input.in fixture:**
```
# Test LAMMPS input script
units real
atom_style full
boundary p p p

read_data simple.data

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
```

**QE scf.pwi fixture:**
```
&CONTROL
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
```

#### 18.3.3 Test Core Schemas

**In `test_schemas.py`:**

```python
"""Tests for core schema definitions."""
import pytest
from campaign_builder.schemas import FileType, FileGuide, BoxDimensions

class TestFileType:
    """Tests for FileType enum."""

    def test_lammps_data_detection(self):
        """Test LAMMPS data file extension detection."""
        from campaign_builder.schemas import detect_file_type
        from pathlib import Path

        assert detect_file_type(Path("test.data")) == FileType.LAMMPS_DATA
        assert detect_file_type(Path("test.lmp")) == FileType.LAMMPS_DATA
        assert detect_file_type(Path("test.lammps")) == FileType.LAMMPS_DATA

    def test_lammps_input_detection(self):
        """Test LAMMPS input file detection."""
        from campaign_builder.schemas import detect_file_type
        from pathlib import Path

        assert detect_file_type(Path("in.test")) == FileType.LAMMPS_INPUT
        assert detect_file_type(Path("test.in")) == FileType.LAMMPS_INPUT

    def test_qe_detection(self):
        """Test QE file detection."""
        from campaign_builder.schemas import detect_file_type
        from pathlib import Path

        assert detect_file_type(Path("test.pwi")) == FileType.QE_INPUT
        assert detect_file_type(Path("test.pwo")) == FileType.QE_OUTPUT

    def test_poscar_detection(self):
        """Test POSCAR detection by filename."""
        from campaign_builder.schemas import detect_file_type
        from pathlib import Path

        assert detect_file_type(Path("POSCAR")) == FileType.POSCAR
        assert detect_file_type(Path("CONTCAR")) == FileType.POSCAR

    def test_unknown_extension(self):
        """Test unknown file type detection."""
        from campaign_builder.schemas import detect_file_type
        from pathlib import Path

        assert detect_file_type(Path("test.xyz")) == FileType.OTHER
        assert detect_file_type(Path("test.txt")) == FileType.OTHER


class TestBoxDimensions:
    """Tests for BoxDimensions dataclass."""

    def test_creation(self):
        """Test basic BoxDimensions creation."""
        box = BoxDimensions(
            xlo=0.0, xhi=10.0,
            ylo=0.0, yhi=10.0,
            zlo=0.0, zhi=10.0
        )
        assert box.xhi - box.xlo == 10.0

    def test_volume_calculation(self):
        """Test volume calculation for orthogonal box."""
        box = BoxDimensions(
            xlo=0.0, xhi=10.0,
            ylo=0.0, yhi=10.0,
            zlo=0.0, zhi=10.0
        )
        assert box.volume == 1000.0

    def test_triclinic_box(self):
        """Test triclinic box with tilt factors."""
        box = BoxDimensions(
            xlo=0.0, xhi=10.0,
            ylo=0.0, yhi=10.0,
            zlo=0.0, zhi=10.0,
            xy=1.0, xz=0.0, yz=0.0
        )
        assert box.is_triclinic is True

    def test_to_dict(self):
        """Test serialization to dict."""
        box = BoxDimensions(
            xlo=0.0, xhi=10.0,
            ylo=0.0, yhi=10.0,
            zlo=0.0, zhi=10.0
        )
        d = box.to_dict()
        assert d["xlo"] == 0.0
        assert d["xhi"] == 10.0

    def test_from_dict(self):
        """Test deserialization from dict."""
        d = {"xlo": 0.0, "xhi": 10.0, "ylo": 0.0, "yhi": 10.0, "zlo": 0.0, "zhi": 10.0}
        box = BoxDimensions.from_dict(d)
        assert box.xhi == 10.0


class TestFileGuide:
    """Tests for FileGuide dataclass."""

    def test_minimal_creation(self):
        """Test FileGuide with minimal required fields."""
        fg = FileGuide(
            file_path="/path/to/file.data",
            file_name="file.data",
            file_type=FileType.LAMMPS_DATA,
            file_size_bytes=1024,
            sha256_hash="abc123",
            purpose="Test file",
            summary="A test LAMMPS data file",
            confidence="high",
            analysis_iterations=3
        )
        assert fg.file_name == "file.data"
        assert fg.file_type == FileType.LAMMPS_DATA

    def test_with_atom_types(self):
        """Test FileGuide with atom type information."""
        fg = FileGuide(
            file_path="/path/to/file.data",
            file_name="file.data",
            file_type=FileType.LAMMPS_DATA,
            file_size_bytes=1024,
            sha256_hash="abc123",
            purpose="Test file",
            summary="Test",
            confidence="high",
            analysis_iterations=3,
            atom_count=100,
            atom_types=[
                {"type_id": 1, "mass": 12.011, "label": "C"},
                {"type_id": 2, "mass": 1.008, "label": "H"}
            ]
        )
        assert fg.atom_count == 100
        assert len(fg.atom_types) == 2

    def test_to_dict_round_trip(self):
        """Test serialization and deserialization."""
        original = FileGuide(
            file_path="/path/to/file.data",
            file_name="file.data",
            file_type=FileType.LAMMPS_DATA,
            file_size_bytes=1024,
            sha256_hash="abc123",
            purpose="Test file",
            summary="Test summary",
            confidence="medium",
            analysis_iterations=5,
            atom_count=100
        )

        d = original.to_dict()
        restored = FileGuide.from_dict(d)

        assert restored.file_path == original.file_path
        assert restored.file_type == original.file_type
        assert restored.atom_count == original.atom_count
```

#### 18.3.4 Test Validation Tools

**In `test_tools_validation.py`:**

```python
"""Tests for validation tools."""
import pytest
from pathlib import Path
from campaign_builder.tools.validation import (
    validate_l0,
    validate_l1_lammps,
    validate_l1_qe,
    validate_l2,
    validate_deck
)

class TestL0Validation:
    """Tests for L0 (template completeness) validation."""

    def test_no_placeholders_passes(self, tmp_path):
        """Test file with no placeholders passes L0."""
        test_file = tmp_path / "clean.in"
        test_file.write_text("units real\natom_style full\n")

        result = validate_l0(test_file)
        assert result.passed is True
        assert len(result.placeholders) == 0

    def test_xxx_placeholder_fails(self, tmp_path):
        """Test file with XXX placeholder fails L0."""
        test_file = tmp_path / "placeholder.in"
        test_file.write_text("units real\npair_coeff 1 1 XXX XXX\n")

        result = validate_l0(test_file)
        assert result.passed is False
        assert len(result.placeholders) > 0

    def test_todo_placeholder_fails(self, tmp_path):
        """Test file with TODO placeholder fails L0."""
        test_file = tmp_path / "todo.in"
        test_file.write_text("# TODO: add pair coefficients\n")

        result = validate_l0(test_file)
        assert result.passed is False

    def test_angle_brackets_fail(self, tmp_path):
        """Test file with <placeholder> fails L0."""
        test_file = tmp_path / "brackets.in"
        test_file.write_text("pair_coeff 1 1 <epsilon> <sigma>\n")

        result = validate_l0(test_file)
        assert result.passed is False
        assert "<epsilon>" in str(result.placeholders)


class TestL1LAMMPSValidation:
    """Tests for L1 LAMMPS syntax validation."""

    def test_valid_lammps_input(self, lammps_fixtures):
        """Test valid LAMMPS input passes L1."""
        result = validate_l1_lammps(lammps_fixtures / "input.in")
        assert result.passed is True

    def test_missing_units_fails(self, tmp_path):
        """Test missing units command fails L1."""
        test_file = tmp_path / "no_units.in"
        test_file.write_text("atom_style full\nread_data test.data\n")

        result = validate_l1_lammps(test_file)
        assert result.passed is False
        assert any("units" in str(e).lower() for e in result.errors)

    def test_invalid_command_fails(self, tmp_path):
        """Test invalid command fails L1."""
        test_file = tmp_path / "invalid_cmd.in"
        test_file.write_text("units real\ninvalid_command arg1 arg2\n")

        result = validate_l1_lammps(test_file)
        assert result.passed is False

    def test_duplicate_read_data_fails(self, tmp_path):
        """Test duplicate read_data fails L1."""
        test_file = tmp_path / "dup_read.in"
        test_file.write_text("""
units real
atom_style full
read_data file1.data
read_data file2.data
""")
        result = validate_l1_lammps(test_file)
        assert result.passed is False

    def test_run_before_setup_fails(self, tmp_path):
        """Test run before timestep fails L1."""
        test_file = tmp_path / "early_run.in"
        test_file.write_text("run 1000\nunits real\n")

        result = validate_l1_lammps(test_file)
        assert result.passed is False


class TestL1QEValidation:
    """Tests for L1 QE syntax validation."""

    def test_valid_qe_input(self, qe_fixtures):
        """Test valid QE input passes L1."""
        result = validate_l1_qe(qe_fixtures / "scf.pwi")
        assert result.passed is True

    def test_missing_control_fails(self, tmp_path):
        """Test missing &CONTROL namelist fails L1."""
        test_file = tmp_path / "no_control.pwi"
        test_file.write_text("""
&SYSTEM
    nat = 2
    ntyp = 1
/
""")
        result = validate_l1_qe(test_file)
        assert result.passed is False

    def test_nat_mismatch_fails(self, tmp_path):
        """Test nat mismatch with ATOMIC_POSITIONS fails L1."""
        test_file = tmp_path / "nat_mismatch.pwi"
        test_file.write_text("""
&CONTROL
    calculation = 'scf'
/
&SYSTEM
    nat = 5
    ntyp = 1
/
ATOMIC_POSITIONS crystal
Si 0.0 0.0 0.0
Si 0.25 0.25 0.25
""")
        result = validate_l1_qe(test_file)
        assert result.passed is False
        assert any("nat" in str(e).lower() for e in result.errors)


class TestL2Validation:
    """Tests for L2 engine acceptance validation."""

    @pytest.mark.skipif(
        not Path("/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp").exists(),
        reason="LAMMPS not available"
    )
    def test_lammps_acceptance(self, lammps_fixtures):
        """Test LAMMPS accepts valid input."""
        result = validate_l2(
            lammps_fixtures / "input.in",
            engine="lammps"
        )
        assert result.passed is True

    @pytest.mark.skipif(
        not Path("/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x").exists(),
        reason="QE not available"
    )
    def test_qe_acceptance(self, qe_fixtures):
        """Test QE accepts valid input."""
        result = validate_l2(
            qe_fixtures / "scf.pwi",
            engine="qe"
        )
        assert result.passed is True

    def test_engine_not_found(self, tmp_path):
        """Test graceful handling when engine not found."""
        test_file = tmp_path / "test.in"
        test_file.write_text("units real\n")

        result = validate_l2(
            test_file,
            engine="lammps",
            engine_path="/nonexistent/lmp"
        )
        assert result.skipped is True
        assert "not found" in result.skip_reason.lower()
```

#### 18.3.5 Test Document Reading Tools

**In `test_tools_documents.py`:**

```python
"""Tests for document reading tools."""
import pytest
from pathlib import Path
from campaign_builder.tools.documents import (
    read_pdf,
    read_excel,
    read_csv
)

class TestPDFReader:
    """Tests for PDF reading tool."""

    def test_read_pdf_extracts_text(self, document_fixtures):
        """Test PDF text extraction."""
        pdf_path = document_fixtures / "paper.pdf"
        if not pdf_path.exists():
            pytest.skip("Test PDF not available")

        result = read_pdf(pdf_path)
        assert result.success is True
        assert len(result.text) > 0
        assert result.page_count > 0

    def test_nonexistent_pdf_fails(self, tmp_path):
        """Test handling of nonexistent PDF."""
        result = read_pdf(tmp_path / "nonexistent.pdf")
        assert result.success is False
        assert result.error is not None

    def test_corrupted_pdf_fails(self, tmp_path):
        """Test handling of corrupted PDF."""
        bad_pdf = tmp_path / "bad.pdf"
        bad_pdf.write_bytes(b"not a pdf")

        result = read_pdf(bad_pdf)
        assert result.success is False


class TestExcelReader:
    """Tests for Excel reading tool."""

    def test_read_xlsx(self, document_fixtures):
        """Test XLSX file reading."""
        xlsx_path = document_fixtures / "params.xlsx"
        if not xlsx_path.exists():
            pytest.skip("Test XLSX not available")

        result = read_excel(xlsx_path)
        assert result.success is True
        assert len(result.sheets) > 0

    def test_read_specific_sheet(self, document_fixtures):
        """Test reading specific sheet by name."""
        xlsx_path = document_fixtures / "params.xlsx"
        if not xlsx_path.exists():
            pytest.skip("Test XLSX not available")

        result = read_excel(xlsx_path, sheet_name="Parameters")
        assert result.success is True


class TestCSVReader:
    """Tests for CSV reading tool."""

    def test_read_csv(self, tmp_path):
        """Test CSV file reading."""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("type,epsilon,sigma\n1,0.0556,3.431\n2,0.020,2.5\n")

        result = read_csv(csv_path)
        assert result.success is True
        assert len(result.rows) == 2
        assert result.headers == ["type", "epsilon", "sigma"]

    def test_csv_with_different_delimiter(self, tmp_path):
        """Test CSV with semicolon delimiter."""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("type;epsilon;sigma\n1;0.0556;3.431\n")

        result = read_csv(csv_path, delimiter=";")
        assert result.success is True
        assert result.headers[0] == "type"
```

#### 18.3.6 Test File Analyzer

**In `test_file_analyzer.py`:**

```python
"""Tests for FileAnalyzer agent."""
import pytest
from pathlib import Path
from campaign_builder.agent.file_analyzer import (
    analyze_file,
    analyze_all_files,
    pre_check_file,
    discover_files
)
from campaign_builder.schemas import FileType

class TestPreChecks:
    """Tests for file pre-checks."""

    def test_existing_file_passes(self, lammps_fixtures):
        """Test existing file passes pre-check."""
        ok, error = pre_check_file(lammps_fixtures / "simple.data")
        assert ok is True
        assert error is None

    def test_missing_file_fails(self, tmp_path):
        """Test missing file fails pre-check."""
        ok, error = pre_check_file(tmp_path / "nonexistent.data")
        assert ok is False
        assert error.code.value == "E101"

    def test_empty_file_fails(self, tmp_path):
        """Test empty file fails pre-check."""
        empty = tmp_path / "empty.data"
        empty.write_text("")

        ok, error = pre_check_file(empty)
        assert ok is False
        assert error.code.value == "E105"

    def test_binary_file_fails(self, tmp_path):
        """Test binary file fails pre-check."""
        binary = tmp_path / "binary.bin"
        binary.write_bytes(bytes(range(256)))

        ok, error = pre_check_file(binary)
        assert ok is False
        assert error.code.value == "E106"


class TestFileDiscovery:
    """Tests for file discovery."""

    def test_discovers_lammps_files(self, lammps_fixtures):
        """Test discovery finds LAMMPS files."""
        files = discover_files(lammps_fixtures)
        extensions = {f.suffix for f in files}
        assert ".data" in extensions or ".in" in extensions

    def test_excludes_pycache(self, tmp_path):
        """Test __pycache__ is excluded."""
        pycache = tmp_path / "__pycache__"
        pycache.mkdir()
        (pycache / "file.pyc").write_text("test")
        (tmp_path / "test.data").write_text("test")

        files = discover_files(tmp_path)
        assert not any("__pycache__" in str(f) for f in files)

    def test_include_pattern(self, tmp_path):
        """Test include pattern filtering."""
        (tmp_path / "a.data").write_text("test")
        (tmp_path / "b.in").write_text("test")
        (tmp_path / "c.txt").write_text("test")

        files = discover_files(tmp_path, include_patterns=["*.data"])
        assert len(files) == 1
        assert files[0].name == "a.data"


class TestFileAnalysis:
    """Tests for single file analysis."""

    @pytest.mark.asyncio
    async def test_analyze_lammps_data(self, lammps_fixtures):
        """Test analysis of LAMMPS data file."""
        result = await analyze_file(
            lammps_fixtures / "simple.data",
            max_iterations=10
        )
        assert result.success is True
        assert result.file_guide is not None
        assert result.file_guide.file_type == FileType.LAMMPS_DATA

    @pytest.mark.asyncio
    async def test_analyze_captures_atom_count(self, lammps_fixtures):
        """Test analysis extracts atom count."""
        result = await analyze_file(lammps_fixtures / "simple.data")
        assert result.file_guide.atom_count == 20

    @pytest.mark.asyncio
    async def test_analysis_timeout(self, tmp_path):
        """Test analysis respects timeout."""
        # Create a file that would take long to analyze
        large_file = tmp_path / "large.data"
        large_file.write_text("# header\n" * 1000000)

        result = await analyze_file(
            large_file,
            timeout=1  # Very short timeout
        )
        # Either completes quickly or times out gracefully
        assert result is not None


class TestBatchAnalysis:
    """Tests for parallel batch analysis."""

    @pytest.mark.asyncio
    async def test_parallel_analysis(self, lammps_fixtures):
        """Test parallel analysis of multiple files."""
        files = list(lammps_fixtures.glob("*"))

        result = await analyze_all_files(
            files,
            max_concurrent=3
        )

        assert result.total_files == len(files)
        assert result.successful + result.failed == result.total_files

    @pytest.mark.asyncio
    async def test_failure_isolation(self, tmp_path, lammps_fixtures):
        """Test one failure doesn't block others."""
        good_file = lammps_fixtures / "simple.data"
        bad_file = tmp_path / "nonexistent.data"

        result = await analyze_all_files(
            [good_file, bad_file],
            max_concurrent=2
        )

        assert result.successful >= 1
        assert result.failed >= 1
        assert len(result.file_guides) >= 1
```

#### 18.3.7 Test CLI

**In `test_cli.py`:**

```python
"""Tests for CLI interface."""
import pytest
from click.testing import CliRunner
from campaign_builder.cli import main, create_parser

class TestArgumentParsing:
    """Tests for CLI argument parsing."""

    def test_analyze_requires_workspace(self):
        """Test analyze subcommand requires workspace."""
        runner = CliRunner()
        result = runner.invoke(main, ["analyze"])
        assert result.exit_code != 0
        assert "workspace" in result.output.lower()

    def test_generate_requires_intent(self):
        """Test generate requires intent argument."""
        runner = CliRunner()
        result = runner.invoke(main, ["generate", "/some/path"])
        assert result.exit_code != 0

    def test_help_displays(self):
        """Test help text displays."""
        runner = CliRunner()
        result = runner.invoke(main, ["--help"])
        assert result.exit_code == 0
        assert "campaign-builder" in result.output.lower()

    def test_version_displays(self):
        """Test version displays."""
        runner = CliRunner()
        result = runner.invoke(main, ["--version"])
        assert result.exit_code == 0


class TestAnalyzeCommand:
    """Tests for analyze subcommand."""

    def test_analyze_nonexistent_workspace(self):
        """Test analyze with nonexistent workspace."""
        runner = CliRunner()
        result = runner.invoke(main, ["analyze", "/nonexistent/path"])
        assert result.exit_code != 0
        assert "not a directory" in result.output.lower() or "error" in result.output.lower()

    def test_analyze_empty_workspace(self, tmp_path):
        """Test analyze with empty workspace."""
        runner = CliRunner()
        result = runner.invoke(main, ["analyze", str(tmp_path)])
        assert "no supported files" in result.output.lower()


class TestValidateCommand:
    """Tests for validate subcommand."""

    def test_validate_nonexistent_file(self):
        """Test validate with nonexistent file."""
        runner = CliRunner()
        result = runner.invoke(main, ["validate", "/nonexistent/file.in"])
        assert result.exit_code != 0

    def test_validate_level_option(self, tmp_path):
        """Test validate with level option."""
        test_file = tmp_path / "test.in"
        test_file.write_text("units real\n")

        runner = CliRunner()
        result = runner.invoke(main, ["validate", str(test_file), "--level", "L0"])
        # Should attempt validation regardless of file quality
        assert result.exit_code in [0, 1]
```

### 18.4 Verification Steps

1. **Test infrastructure:**
   - [ ] pytest runs successfully
   - [ ] Fixtures load correctly
   - [ ] conftest.py provides shared fixtures

2. **Schema tests:**
   - [ ] FileType detection works
   - [ ] BoxDimensions calculations correct
   - [ ] FileGuide serialization round-trips

3. **Validation tests:**
   - [ ] L0 placeholder detection works
   - [ ] L1 syntax checks work
   - [ ] L2 engine tests run (when available)

4. **Document tool tests:**
   - [ ] PDF reading tested
   - [ ] Excel reading tested
   - [ ] CSV reading tested

5. **Analyzer tests:**
   - [ ] Pre-checks catch errors
   - [ ] Single file analysis works
   - [ ] Batch analysis parallelizes

6. **CLI tests:**
   - [ ] Argument parsing correct
   - [ ] Error messages helpful
   - [ ] Exit codes correct

### 18.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `tests/conftest.py` | Create | Shared fixtures |
| `tests/fixtures/` | Create | Test data directory |
| `tests/test_schemas.py` | Create | Schema tests |
| `tests/test_tools_validation.py` | Create | Validation tests |
| `tests/test_tools_documents.py` | Create | Document tool tests |
| `tests/test_file_analyzer.py` | Create | Analyzer tests |
| `tests/test_cli.py` | Create | CLI tests |

---

## Thrust 19: End-to-End Integration Testing

### 19.1 Objective

Create comprehensive integration tests that verify the complete Campaign Builder workflow from file input to validated output.

### 19.2 Background

Integration tests verify:
- Components work together correctly
- Full workflows produce expected results
- Error handling works across component boundaries
- Performance meets requirements

### 19.3 Subtasks

#### 19.3.1 Create Integration Test Workspaces

**Create realistic test workspaces:**

```
tests/integration/
├── workspaces/
│   ├── mof_system/           # Complete MOF simulation setup
│   │   ├── mof_structure.data
│   │   ├── existing_input.in
│   │   └── parameters.pdf
│   ├── polymer_melt/         # Polymer system
│   │   ├── polymer.data
│   │   └── forcefield.xlsx
│   └── dft_silicon/          # DFT calculation
│       ├── POSCAR
│       └── reference.pwi
├── test_full_workflow.py
├── test_error_recovery.py
└── test_performance.py
```

#### 19.3.2 Implement Full Workflow Tests

**In `test_full_workflow.py`:**

```python
"""End-to-end workflow integration tests."""
import pytest
from pathlib import Path
from campaign_builder import CampaignBuilder

class TestCompleteWorkflow:
    """Tests for complete Campaign Builder workflow."""

    @pytest.fixture
    def mof_workspace(self) -> Path:
        """Path to MOF test workspace."""
        return Path(__file__).parent / "workspaces" / "mof_system"

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_mof_equilibration_workflow(self, mof_workspace):
        """Test complete workflow for MOF equilibration."""
        builder = CampaignBuilder()

        # Step 1: Analyze workspace
        analysis_result = await builder.analyze(mof_workspace)

        assert analysis_result.successful > 0
        assert len(analysis_result.file_guides) > 0

        # Verify file guides contain expected information
        data_guide = next(
            (fg for fg in analysis_result.file_guides
             if fg.file_type.value == "LAMMPS_DATA"),
            None
        )
        assert data_guide is not None
        assert data_guide.atom_count > 0
        assert data_guide.pair_coefficients is not None

        # Step 2: Generate campaign
        intent = "equilibrate at 300K for 1ns using NVT ensemble"
        campaign_result = await builder.generate(
            file_guides=analysis_result.file_guides,
            intent=intent
        )

        assert campaign_result.success is True
        assert len(campaign_result.generated_files) > 0

        # Step 3: Verify generated files
        for gen_file in campaign_result.generated_files:
            assert gen_file.path.exists()
            content = gen_file.path.read_text()

            # Check no placeholders
            assert "XXX" not in content
            assert "TODO" not in content

            # Check required LAMMPS commands present
            assert "units" in content
            assert "pair_style" in content
            assert "pair_coeff" in content
            assert "fix" in content
            assert "run" in content

        # Step 4: Verify validation passed
        for gen_file in campaign_result.generated_files:
            assert gen_file.validation_result.l0_passed is True
            assert gen_file.validation_result.l1_passed is True

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_parameter_extraction_accuracy(self, mof_workspace):
        """Test that extracted parameters match source files."""
        builder = CampaignBuilder()

        # Analyze workspace
        result = await builder.analyze(mof_workspace)

        # Find the data file guide
        data_guide = next(
            fg for fg in result.file_guides
            if fg.file_type.value == "LAMMPS_DATA"
        )

        # Read original file and verify extracted values
        original = (mof_workspace / "mof_structure.data").read_text()

        # Check atom count matches
        for line in original.split('\n'):
            if 'atoms' in line:
                expected_atoms = int(line.split()[0])
                assert data_guide.atom_count == expected_atoms
                break

        # Check pair coefficients were extracted (not invented)
        for coeff in data_guide.pair_coefficients:
            # Verify coefficient appears in original file
            assert str(coeff["epsilon"]) in original or \
                   str(coeff["sigma"]) in original

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_dft_workflow(self):
        """Test workflow for DFT calculation."""
        dft_workspace = Path(__file__).parent / "workspaces" / "dft_silicon"

        builder = CampaignBuilder()

        # Analyze
        result = await builder.analyze(dft_workspace)
        assert result.successful > 0

        # Generate SCF calculation
        intent = "run SCF calculation with higher k-point density"
        campaign = await builder.generate(
            file_guides=result.file_guides,
            intent=intent
        )

        assert campaign.success is True

        # Verify QE output
        for gen_file in campaign.generated_files:
            if gen_file.path.suffix == ".pwi":
                content = gen_file.path.read_text()
                assert "&CONTROL" in content
                assert "&SYSTEM" in content
                assert "K_POINTS" in content


class TestMultiEngineWorkflow:
    """Tests for workflows involving multiple simulation engines."""

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_mixed_file_workspace(self, tmp_path):
        """Test workspace with both LAMMPS and QE files."""
        # Create mixed workspace
        (tmp_path / "structure.data").write_text(SAMPLE_LAMMPS_DATA)
        (tmp_path / "dft_input.pwi").write_text(SAMPLE_QE_INPUT)

        builder = CampaignBuilder()
        result = await builder.analyze(tmp_path)

        # Should detect both file types
        file_types = {fg.file_type for fg in result.file_guides}
        assert "LAMMPS_DATA" in {ft.value for ft in file_types}
        assert "QE_INPUT" in {ft.value for ft in file_types}
```

#### 19.3.3 Implement Error Recovery Tests

**In `test_error_recovery.py`:**

```python
"""Tests for error handling and recovery."""
import pytest
from pathlib import Path
from campaign_builder import CampaignBuilder

class TestGracefulDegradation:
    """Tests for graceful handling of partial failures."""

    @pytest.mark.asyncio
    async def test_continues_after_file_failure(self, tmp_path):
        """Test analysis continues when one file fails."""
        # Create good and bad files
        (tmp_path / "good.data").write_text(VALID_LAMMPS_DATA)
        (tmp_path / "bad.data").write_bytes(bytes(range(256)))  # Binary garbage

        builder = CampaignBuilder()
        result = await builder.analyze(tmp_path)

        # Should have results despite failure
        assert result.successful >= 1
        assert result.failed >= 1
        assert len(result.file_guides) >= 1

    @pytest.mark.asyncio
    async def test_reports_missing_parameters(self):
        """Test clear reporting when parameters are missing."""
        workspace = Path(__file__).parent / "workspaces" / "incomplete"

        builder = CampaignBuilder()
        analysis = await builder.analyze(workspace)

        # Try to generate with incomplete data
        result = await builder.generate(
            file_guides=analysis.file_guides,
            intent="run NPT simulation"
        )

        # Should fail but with clear message
        assert result.success is False
        assert "missing" in result.error_message.lower()
        assert len(result.missing_parameters) > 0


class TestValidationRepair:
    """Tests for validation failure repair."""

    @pytest.mark.asyncio
    async def test_repairs_syntax_errors(self, tmp_path):
        """Test repair loop fixes syntax errors."""
        # Create workspace with missing pair_coeff
        (tmp_path / "structure.data").write_text(LAMMPS_DATA_WITH_TYPES)

        builder = CampaignBuilder()
        analysis = await builder.analyze(tmp_path)

        result = await builder.generate(
            file_guides=analysis.file_guides,
            intent="run minimization",
            max_repair_attempts=3
        )

        # After repairs, should succeed
        assert result.success is True
        for f in result.generated_files:
            assert f.validation_result.l1_passed is True

    @pytest.mark.asyncio
    async def test_reports_unfixable_errors(self, tmp_path):
        """Test clear reporting when repair fails."""
        # Create workspace missing critical force field info
        (tmp_path / "atoms_only.data").write_text(LAMMPS_DATA_NO_FF)

        builder = CampaignBuilder()
        analysis = await builder.analyze(tmp_path)

        result = await builder.generate(
            file_guides=analysis.file_guides,
            intent="run NVT at 300K",
            max_repair_attempts=3
        )

        # Should fail after max attempts
        assert result.success is False
        assert result.repair_attempts == 3
        assert "force field" in result.error_message.lower() or \
               "pair_coeff" in result.error_message.lower()
```

#### 19.3.4 Implement Performance Tests

**In `test_performance.py`:**

```python
"""Performance and scalability tests."""
import pytest
import time
from pathlib import Path
from campaign_builder import CampaignBuilder

class TestPerformance:
    """Tests for performance requirements."""

    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_large_file_handling(self, tmp_path):
        """Test handling of large LAMMPS data file."""
        # Create large file (100K atoms)
        large_file = tmp_path / "large.data"
        with open(large_file, 'w') as f:
            f.write("# Large test file\n")
            f.write("100000 atoms\n")
            f.write("4 atom types\n")
            f.write("0.0 100.0 xlo xhi\n")
            f.write("0.0 100.0 ylo yhi\n")
            f.write("0.0 100.0 zlo zhi\n")
            f.write("\nMasses\n\n")
            f.write("1 12.0\n2 1.0\n3 16.0\n4 14.0\n")
            f.write("\nPair Coeffs\n\n")
            f.write("1 0.05 3.4\n2 0.02 2.5\n3 0.15 3.1\n4 0.07 3.2\n")
            f.write("\nAtoms\n\n")
            for i in range(100000):
                f.write(f"{i+1} 1 1 0.0 {i%100}.0 {i//100}.0 0.0\n")

        builder = CampaignBuilder()

        start = time.time()
        result = await builder.analyze(tmp_path, timeout_per_file=120)
        duration = time.time() - start

        # Should complete within reasonable time
        assert duration < 120  # 2 minutes max
        assert result.successful == 1

        # Should NOT have read all coordinates
        guide = result.file_guides[0]
        assert guide.atom_count == 100000
        assert "coordinates" not in guide.summary.lower()

    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_parallel_analysis_speedup(self, tmp_path):
        """Test parallel analysis is faster than sequential."""
        # Create 10 files
        for i in range(10):
            (tmp_path / f"file_{i}.data").write_text(SIMPLE_LAMMPS_DATA)

        builder = CampaignBuilder()

        # Sequential timing
        start = time.time()
        await builder.analyze(tmp_path, max_concurrent=1)
        sequential_time = time.time() - start

        # Parallel timing
        start = time.time()
        await builder.analyze(tmp_path, max_concurrent=5)
        parallel_time = time.time() - start

        # Parallel should be significantly faster
        # (at least 2x faster with 5 concurrent)
        assert parallel_time < sequential_time * 0.7

    @pytest.mark.asyncio
    async def test_memory_efficiency(self, tmp_path):
        """Test memory usage stays reasonable."""
        import tracemalloc

        # Create moderate size file
        (tmp_path / "test.data").write_text(MEDIUM_LAMMPS_DATA)

        tracemalloc.start()

        builder = CampaignBuilder()
        await builder.analyze(tmp_path)

        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        # Peak memory should be reasonable (< 500MB)
        assert peak < 500 * 1024 * 1024
```

#### 19.3.5 Implement Regression Tests

**In `test_regressions.py`:**

```python
"""Regression tests for known issues."""
import pytest
from pathlib import Path
from campaign_builder import CampaignBuilder

class TestRegressions:
    """Tests for previously fixed bugs."""

    @pytest.mark.asyncio
    async def test_regression_empty_pair_coeffs(self):
        """Regression: Empty pair_coeff section caused crash."""
        # Bug: Empty Pair Coeffs section caused IndexError
        pass  # Add test when bug is fixed

    @pytest.mark.asyncio
    async def test_regression_unicode_in_comments(self, tmp_path):
        """Regression: Unicode in comments caused encoding error."""
        # Bug: Non-ASCII characters in comments broke parsing
        unicode_file = tmp_path / "unicode.data"
        unicode_file.write_text("# Contains unicode: μ ε σ\n20 atoms\n", encoding='utf-8')

        builder = CampaignBuilder()
        result = await builder.analyze(tmp_path)

        # Should handle gracefully
        assert result is not None
```

### 19.4 Verification Steps

1. **Workflow tests:**
   - [ ] MOF workflow completes successfully
   - [ ] DFT workflow completes successfully
   - [ ] Parameters extracted accurately
   - [ ] No placeholders in output

2. **Error recovery:**
   - [ ] Partial failures handled
   - [ ] Missing parameters reported clearly
   - [ ] Repair loop attempts fixes
   - [ ] Unfixable errors reported

3. **Performance:**
   - [ ] Large files handled within timeout
   - [ ] Parallel speedup achieved
   - [ ] Memory usage reasonable

4. **Regressions:**
   - [ ] Known issues remain fixed
   - [ ] Edge cases handled

### 19.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `tests/integration/` | Create | Integration test directory |
| `tests/integration/workspaces/` | Create | Test workspace data |
| `tests/integration/test_full_workflow.py` | Create | Workflow tests |
| `tests/integration/test_error_recovery.py` | Create | Error handling tests |
| `tests/integration/test_performance.py` | Create | Performance tests |

---

## Running Tests

### Unit Tests

```bash
# Run all unit tests
pytest tests/ -v

# Run specific test file
pytest tests/test_schemas.py -v

# Run with coverage
pytest tests/ --cov=campaign_builder --cov-report=html

# Run only fast tests
pytest tests/ -v -m "not slow"
```

### Integration Tests

```bash
# Run integration tests
pytest tests/integration/ -v -m integration

# Run with real engines (requires LAMMPS/QE)
pytest tests/integration/ -v -m "integration and not mock"
```

### Test Markers

```python
# In pyproject.toml or pytest.ini
[tool.pytest.ini_options]
markers = [
    "slow: marks tests as slow (deselect with '-m \"not slow\"')",
    "integration: marks tests as integration tests",
    "requires_lammps: requires LAMMPS installation",
    "requires_qe: requires QE installation",
]
```

---

## Next Steps

After completing Thrusts 18-19, proceed to [12-appendices.md](./12-appendices.md) for file references and checklists.
