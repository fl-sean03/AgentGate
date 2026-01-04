"""
Tests for Campaign Builder schemas.

Tests cover:
    - FileType enum and detection
    - BoxDimensions dataclass
    - FileGuide dataclass and serialization
    - CampaignError dataclass
"""

import tempfile
from pathlib import Path

import pytest

from campaign_builder.schemas import (
    # File types
    FileType,
    detect_file_type,
    # Box dimensions
    BoxDimensions,
    BoxTilt,
    # File guide types
    AtomType,
    PairCoeff,
    BondCoeff,
    AngleCoeff,
    DihedralCoeff,
    Species,
    CriticalSection,
    FileGuide,
    # Error types
    ErrorCode,
    ErrorSeverity,
    CampaignError,
)


# =============================================================================
# FileType Tests
# =============================================================================


class TestFileType:
    """Tests for FileType enum."""

    def test_all_file_types_exist(self):
        """Verify all 17 FileType values exist."""
        expected_types = {
            "LAMMPS_DATA",
            "LAMMPS_INPUT",
            "QE_INPUT",
            "QE_OUTPUT",
            "POSCAR",
            "CIF",
            "XYZ",
            "PDB",
            "PDF",
            "EXCEL",
            "CSV",
            "PYTHON_SCRIPT",
            "SHELL_SCRIPT",
            "JSON",
            "YAML",
            "TEXT",
            "UNKNOWN",
        }
        actual_types = {ft.name for ft in FileType}
        assert actual_types == expected_types

    def test_is_structure_file(self):
        """Test is_structure_file property."""
        assert FileType.LAMMPS_DATA.is_structure_file is True
        assert FileType.POSCAR.is_structure_file is True
        assert FileType.CIF.is_structure_file is True
        assert FileType.XYZ.is_structure_file is True
        assert FileType.PDB.is_structure_file is True
        assert FileType.LAMMPS_INPUT.is_structure_file is False
        assert FileType.PDF.is_structure_file is False

    def test_is_input_script(self):
        """Test is_input_script property."""
        assert FileType.LAMMPS_INPUT.is_input_script is True
        assert FileType.QE_INPUT.is_input_script is True
        assert FileType.LAMMPS_DATA.is_input_script is False
        assert FileType.PDF.is_input_script is False

    def test_is_document(self):
        """Test is_document property."""
        assert FileType.PDF.is_document is True
        assert FileType.EXCEL.is_document is True
        assert FileType.CSV.is_document is True
        assert FileType.LAMMPS_DATA.is_document is False

    def test_is_binary(self):
        """Test is_binary property."""
        assert FileType.PDF.is_binary is True
        assert FileType.EXCEL.is_binary is True
        assert FileType.LAMMPS_DATA.is_binary is False
        assert FileType.CSV.is_binary is False

    def test_get_engine(self):
        """Test get_engine property."""
        assert FileType.LAMMPS_DATA.get_engine == "lammps"
        assert FileType.LAMMPS_INPUT.get_engine == "lammps"
        assert FileType.QE_INPUT.get_engine == "qe"
        assert FileType.QE_OUTPUT.get_engine == "qe"
        assert FileType.PDF.get_engine is None
        assert FileType.UNKNOWN.get_engine is None


class TestDetectFileType:
    """Tests for detect_file_type function."""

    def test_detect_by_extension_lammps_data(self):
        """Test detection of LAMMPS data files by extension."""
        assert detect_file_type(Path("structure.data")) == FileType.LAMMPS_DATA
        assert detect_file_type(Path("molecule.lmp")) == FileType.LAMMPS_DATA

    def test_detect_by_extension_qe(self):
        """Test detection of QE files by extension."""
        assert detect_file_type(Path("input.pwi")) == FileType.QE_INPUT
        assert detect_file_type(Path("output.pwo")) == FileType.QE_OUTPUT
        assert detect_file_type(Path("calc.out")) == FileType.QE_OUTPUT

    def test_detect_by_extension_structure(self):
        """Test detection of structure files by extension."""
        assert detect_file_type(Path("structure.vasp")) == FileType.POSCAR
        assert detect_file_type(Path("structure.poscar")) == FileType.POSCAR
        assert detect_file_type(Path("crystal.cif")) == FileType.CIF
        assert detect_file_type(Path("molecule.xyz")) == FileType.XYZ
        assert detect_file_type(Path("protein.pdb")) == FileType.PDB

    def test_detect_by_extension_documents(self):
        """Test detection of document files by extension."""
        assert detect_file_type(Path("paper.pdf")) == FileType.PDF
        assert detect_file_type(Path("data.xlsx")) == FileType.EXCEL
        assert detect_file_type(Path("data.xls")) == FileType.EXCEL
        assert detect_file_type(Path("table.csv")) == FileType.CSV

    def test_detect_by_extension_code(self):
        """Test detection of code files by extension."""
        assert detect_file_type(Path("script.py")) == FileType.PYTHON_SCRIPT
        assert detect_file_type(Path("run.sh")) == FileType.SHELL_SCRIPT
        assert detect_file_type(Path("run.bash")) == FileType.SHELL_SCRIPT

    def test_detect_by_extension_data_formats(self):
        """Test detection of data format files by extension."""
        assert detect_file_type(Path("config.json")) == FileType.JSON
        assert detect_file_type(Path("settings.yaml")) == FileType.YAML
        assert detect_file_type(Path("settings.yml")) == FileType.YAML
        assert detect_file_type(Path("readme.txt")) == FileType.TEXT

    def test_detect_by_filename_poscar(self):
        """Test detection of POSCAR by exact filename."""
        assert detect_file_type(Path("POSCAR")) == FileType.POSCAR
        assert detect_file_type(Path("CONTCAR")) == FileType.POSCAR
        assert detect_file_type(Path("/some/path/POSCAR")) == FileType.POSCAR

    def test_detect_unknown(self):
        """Test detection returns UNKNOWN for unrecognized files."""
        assert detect_file_type(Path("unknown.abc")) == FileType.UNKNOWN
        assert detect_file_type(Path("noextension")) == FileType.UNKNOWN

    def test_detect_in_file_with_content(self):
        """Test content-based detection for .in files."""
        with tempfile.NamedTemporaryFile(suffix=".in", mode="w", delete=False) as f:
            f.write("&CONTROL\n  calculation = 'scf'\n/\n")
            f.flush()
            assert detect_file_type(Path(f.name)) == FileType.QE_INPUT

        with tempfile.NamedTemporaryFile(suffix=".in", mode="w", delete=False) as f:
            f.write("# LAMMPS input\nunits real\natom_style full\n")
            f.flush()
            assert detect_file_type(Path(f.name)) == FileType.LAMMPS_INPUT

    def test_detect_lammps_file_with_content(self):
        """Test content-based detection for .lammps files."""
        with tempfile.NamedTemporaryFile(suffix=".lammps", mode="w", delete=False) as f:
            f.write("units metal\natom_style atomic\npair_style eam\n")
            f.flush()
            assert detect_file_type(Path(f.name)) == FileType.LAMMPS_INPUT

        with tempfile.NamedTemporaryFile(suffix=".lammps", mode="w", delete=False) as f:
            f.write("LAMMPS data file\n\n100 atoms\n5 atom types\n\n0.0 50.0 xlo xhi\n")
            f.flush()
            assert detect_file_type(Path(f.name)) == FileType.LAMMPS_DATA


# =============================================================================
# BoxDimensions Tests
# =============================================================================


class TestBoxDimensions:
    """Tests for BoxDimensions dataclass."""

    def test_basic_creation(self):
        """Test basic BoxDimensions creation."""
        box = BoxDimensions(
            xlo=0.0, xhi=10.0,
            ylo=0.0, yhi=20.0,
            zlo=0.0, zhi=30.0,
        )
        assert box.xlo == 0.0
        assert box.xhi == 10.0
        assert box.ylo == 0.0
        assert box.yhi == 20.0
        assert box.zlo == 0.0
        assert box.zhi == 30.0

    def test_computed_lengths(self):
        """Test computed length properties."""
        box = BoxDimensions(
            xlo=0.0, xhi=10.0,
            ylo=5.0, yhi=25.0,
            zlo=-10.0, zhi=20.0,
        )
        assert box.lx == 10.0
        assert box.ly == 20.0
        assert box.lz == 30.0

    def test_volume(self):
        """Test volume computation."""
        box = BoxDimensions(
            xlo=0.0, xhi=10.0,
            ylo=0.0, yhi=20.0,
            zlo=0.0, zhi=30.0,
        )
        assert box.volume == 6000.0

    def test_is_triclinic_orthogonal(self):
        """Test is_triclinic for orthogonal box."""
        box = BoxDimensions(
            xlo=0.0, xhi=10.0,
            ylo=0.0, yhi=10.0,
            zlo=0.0, zhi=10.0,
        )
        assert box.is_triclinic is False

    def test_is_triclinic_tilted(self):
        """Test is_triclinic for tilted box."""
        box = BoxDimensions(
            xlo=0.0, xhi=10.0,
            ylo=0.0, yhi=10.0,
            zlo=0.0, zhi=10.0,
            xy=1.0,
        )
        assert box.is_triclinic is True

    def test_to_dict(self):
        """Test to_dict serialization."""
        box = BoxDimensions(
            xlo=0.0, xhi=10.0,
            ylo=0.0, yhi=20.0,
            zlo=0.0, zhi=30.0,
            xy=0.5,
        )
        d = box.to_dict()
        assert d["xlo"] == 0.0
        assert d["xhi"] == 10.0
        assert d["lx"] == 10.0
        assert d["ly"] == 20.0
        assert d["lz"] == 30.0
        assert d["volume"] == 6000.0
        assert d["xy"] == 0.5
        assert "xz" not in d  # None values excluded

    def test_from_dict(self):
        """Test from_dict deserialization."""
        data = {
            "xlo": 0.0, "xhi": 10.0,
            "ylo": 0.0, "yhi": 20.0,
            "zlo": 0.0, "zhi": 30.0,
            "xy": 0.5,
        }
        box = BoxDimensions.from_dict(data)
        assert box.xlo == 0.0
        assert box.xhi == 10.0
        assert box.lx == 10.0
        assert box.xy == 0.5
        assert box.is_triclinic is True

    def test_validation_invalid_bounds(self):
        """Test validation rejects invalid bounds."""
        with pytest.raises(ValueError, match="xhi.*must be greater than xlo"):
            BoxDimensions(
                xlo=10.0, xhi=0.0,  # Invalid
                ylo=0.0, yhi=10.0,
                zlo=0.0, zhi=10.0,
            )


class TestBoxTilt:
    """Tests for BoxTilt dataclass."""

    def test_basic_creation(self):
        """Test basic BoxTilt creation."""
        tilt = BoxTilt(xy=0.1, xz=0.2, yz=0.3)
        assert tilt.xy == 0.1
        assert tilt.xz == 0.2
        assert tilt.yz == 0.3

    def test_to_dict(self):
        """Test to_dict serialization."""
        tilt = BoxTilt(xy=0.1, xz=0.2, yz=0.3)
        d = tilt.to_dict()
        assert d == {"xy": 0.1, "xz": 0.2, "yz": 0.3}

    def test_from_dict(self):
        """Test from_dict deserialization."""
        data = {"xy": 0.1, "xz": 0.2, "yz": 0.3}
        tilt = BoxTilt.from_dict(data)
        assert tilt.xy == 0.1
        assert tilt.xz == 0.2
        assert tilt.yz == 0.3


# =============================================================================
# FileGuide Tests
# =============================================================================


class TestAtomType:
    """Tests for AtomType dataclass."""

    def test_basic_creation(self):
        """Test basic AtomType creation."""
        at = AtomType(id=1, mass=12.011, label="C", element="C", count=100)
        assert at.id == 1
        assert at.mass == 12.011
        assert at.label == "C"
        assert at.element == "C"
        assert at.count == 100

    def test_to_dict(self):
        """Test to_dict serialization."""
        at = AtomType(id=1, mass=12.011, element="C")
        d = at.to_dict()
        assert d["id"] == 1
        assert d["mass"] == 12.011
        assert d["element"] == "C"
        assert "label" not in d  # None excluded

    def test_from_dict(self):
        """Test from_dict deserialization."""
        data = {"id": 1, "mass": 12.011, "element": "C", "count": 100}
        at = AtomType.from_dict(data)
        assert at.id == 1
        assert at.mass == 12.011
        assert at.count == 100


class TestPairCoeff:
    """Tests for PairCoeff dataclass."""

    def test_basic_creation(self):
        """Test basic PairCoeff creation."""
        pc = PairCoeff(type1=1, type2=1, params=[0.1, 3.5], style="lj/cut")
        assert pc.type1 == 1
        assert pc.type2 == 1
        assert pc.params == [0.1, 3.5]
        assert pc.style == "lj/cut"

    def test_serialization_roundtrip(self):
        """Test serialization round-trip."""
        pc = PairCoeff(type1=1, type2=2, params=[0.1, 3.5], comment="C-C")
        d = pc.to_dict()
        pc2 = PairCoeff.from_dict(d)
        assert pc2.type1 == pc.type1
        assert pc2.type2 == pc.type2
        assert pc2.params == pc.params
        assert pc2.comment == pc.comment


class TestSpecies:
    """Tests for Species dataclass."""

    def test_basic_creation(self):
        """Test basic Species creation."""
        sp = Species(symbol="Si", mass=28.0855, pseudopotential="Si.pbe-n-rrkjus_psl.1.0.0.UPF")
        assert sp.symbol == "Si"
        assert sp.mass == 28.0855
        assert "Si" in sp.pseudopotential

    def test_serialization_roundtrip(self):
        """Test serialization round-trip."""
        sp = Species(symbol="Si", mass=28.0855, pseudopotential="Si.UPF")
        d = sp.to_dict()
        sp2 = Species.from_dict(d)
        assert sp2.symbol == sp.symbol
        assert sp2.mass == sp.mass
        assert sp2.pseudopotential == sp.pseudopotential


class TestFileGuide:
    """Tests for FileGuide dataclass."""

    @pytest.fixture
    def minimal_file_guide(self):
        """Create a minimal FileGuide for testing."""
        return FileGuide(
            file_path="/path/to/file.data",
            file_name="file.data",
            file_type=FileType.LAMMPS_DATA,
            file_size_bytes=1024,
            sha256_hash="abc123",
            purpose="Test file",
            summary="A test file for unit tests",
            confidence="high",
            analysis_iterations=1,
        )

    def test_minimal_creation(self, minimal_file_guide):
        """Test creation with only required fields."""
        fg = minimal_file_guide
        assert fg.file_path == "/path/to/file.data"
        assert fg.file_name == "file.data"
        assert fg.file_type == FileType.LAMMPS_DATA
        assert fg.warnings == []
        assert fg.atom_count is None

    def test_optional_fields_default_to_none(self, minimal_file_guide):
        """Test optional fields default to None."""
        fg = minimal_file_guide
        assert fg.line_count is None
        assert fg.atom_types is None
        assert fg.box_dimensions is None

    def test_confidence_validation(self):
        """Test confidence level validation."""
        with pytest.raises(ValueError, match="confidence must be one of"):
            FileGuide(
                file_path="/test",
                file_name="test",
                file_type=FileType.UNKNOWN,
                file_size_bytes=0,
                sha256_hash="abc",
                purpose="test",
                summary="test",
                confidence="invalid",  # Invalid
                analysis_iterations=1,
            )

    def test_required_fields_validation(self):
        """Test required field validation."""
        with pytest.raises(ValueError, match="file_path cannot be empty"):
            FileGuide(
                file_path="",  # Empty
                file_name="test",
                file_type=FileType.UNKNOWN,
                file_size_bytes=0,
                sha256_hash="abc",
                purpose="test",
                summary="test",
                confidence="high",
                analysis_iterations=1,
            )

    def test_to_dict(self, minimal_file_guide):
        """Test to_dict serialization."""
        d = minimal_file_guide.to_dict()
        assert d["file_path"] == "/path/to/file.data"
        assert d["file_type"] == "lammps_data"  # Enum converted to value
        assert "atom_count" not in d  # None values excluded

    def test_from_dict(self, minimal_file_guide):
        """Test from_dict deserialization."""
        d = minimal_file_guide.to_dict()
        fg2 = FileGuide.from_dict(d)
        assert fg2.file_path == minimal_file_guide.file_path
        assert fg2.file_type == minimal_file_guide.file_type
        assert fg2.confidence == minimal_file_guide.confidence

    def test_serialization_roundtrip_lammps(self):
        """Test full serialization round-trip for LAMMPS data."""
        box = BoxDimensions(
            xlo=0.0, xhi=50.0,
            ylo=0.0, yhi=50.0,
            zlo=0.0, zhi=50.0,
        )
        atom_types = [
            AtomType(id=1, mass=12.011, element="C", count=500),
            AtomType(id=2, mass=1.008, element="H", count=1000),
        ]
        pair_coeffs = [
            PairCoeff(type1=1, type2=1, params=[0.07, 3.55]),
            PairCoeff(type1=1, type2=2, params=[0.05, 2.95]),
        ]

        fg = FileGuide(
            file_path="/test/molecule.data",
            file_name="molecule.data",
            file_type=FileType.LAMMPS_DATA,
            file_size_bytes=50000,
            sha256_hash="hash123",
            purpose="Molecular structure",
            summary="Hydrocarbon molecule",
            confidence="high",
            analysis_iterations=2,
            atom_count=1500,
            atom_types_count=2,
            atom_types=atom_types,
            box_dimensions=box,
            pair_style="lj/cut",
            pair_coeffs=pair_coeffs,
            warnings=["Large file"],
        )

        # Serialize and deserialize
        d = fg.to_dict()
        fg2 = FileGuide.from_dict(d)

        # Verify
        assert fg2.atom_count == 1500
        assert fg2.atom_types_count == 2
        assert len(fg2.atom_types) == 2
        assert fg2.atom_types[0].element == "C"
        assert fg2.box_dimensions.volume == 125000.0
        assert len(fg2.pair_coeffs) == 2
        assert fg2.warnings == ["Large file"]

    def test_serialization_roundtrip_qe(self):
        """Test full serialization round-trip for QE input."""
        species = [
            Species(symbol="Si", mass=28.086, pseudopotential="Si.UPF"),
            Species(symbol="O", mass=15.999, pseudopotential="O.UPF"),
        ]

        fg = FileGuide(
            file_path="/test/scf.in",
            file_name="scf.in",
            file_type=FileType.QE_INPUT,
            file_size_bytes=1500,
            sha256_hash="qehash",
            purpose="DFT calculation",
            summary="SCF calculation for SiO2",
            confidence="high",
            analysis_iterations=1,
            calculation="scf",
            nat=9,
            ntyp=2,
            species=species,
            ecutwfc=50.0,
            ecutrho=400.0,
            kpoints_type="automatic",
            kpoints_grid=[4, 4, 4],
        )

        d = fg.to_dict()
        fg2 = FileGuide.from_dict(d)

        assert fg2.calculation == "scf"
        assert fg2.nat == 9
        assert len(fg2.species) == 2
        assert fg2.species[0].symbol == "Si"
        assert fg2.ecutwfc == 50.0
        assert fg2.kpoints_grid == [4, 4, 4]

    def test_to_markdown(self, minimal_file_guide):
        """Test to_markdown output."""
        md = minimal_file_guide.to_markdown()
        assert "## File Guide: file.data" in md
        assert "**Type:** lammps_data" in md
        assert "**Confidence:** high" in md
        assert "### Purpose" in md
        assert "### Summary" in md

    def test_factory_for_lammps_data(self):
        """Test for_lammps_data factory method."""
        with tempfile.NamedTemporaryFile(suffix=".data", delete=False) as f:
            f.write(b"test content")
            f.flush()

            box = BoxDimensions(
                xlo=0.0, xhi=10.0,
                ylo=0.0, yhi=10.0,
                zlo=0.0, zhi=10.0,
            )
            atom_types = [AtomType(id=1, mass=12.0)]

            fg = FileGuide.for_lammps_data(
                file_path=f.name,
                sha256_hash="hash",
                atom_count=100,
                atom_types=atom_types,
                box_dimensions=box,
            )

            assert fg.file_type == FileType.LAMMPS_DATA
            assert fg.atom_count == 100
            assert fg.box_dimensions.volume == 1000.0

    def test_factory_for_qe_input(self):
        """Test for_qe_input factory method."""
        with tempfile.NamedTemporaryFile(suffix=".pwi", delete=False) as f:
            f.write(b"&CONTROL\n/")
            f.flush()

            species = [Species(symbol="Si", mass=28.086, pseudopotential="Si.UPF")]

            fg = FileGuide.for_qe_input(
                file_path=f.name,
                sha256_hash="hash",
                calculation="scf",
                nat=2,
                ntyp=1,
                species=species,
            )

            assert fg.file_type == FileType.QE_INPUT
            assert fg.calculation == "scf"
            assert fg.nat == 2


# =============================================================================
# Error Tests
# =============================================================================


class TestErrorCode:
    """Tests for ErrorCode enum."""

    def test_error_code_values(self):
        """Test error code values match expected format."""
        assert ErrorCode.E101_FILE_NOT_FOUND.value == "E101"
        assert ErrorCode.E201_AGENT_TIMEOUT.value == "E201"
        assert ErrorCode.E301_MISSING_REQUIRED_FIELD.value == "E301"
        assert ErrorCode.E401_PARSE_ERROR.value == "E401"

    def test_error_category(self):
        """Test error category property."""
        assert ErrorCode.E101_FILE_NOT_FOUND.category == "file"
        assert ErrorCode.E201_AGENT_TIMEOUT.category == "agent"
        assert ErrorCode.E301_MISSING_REQUIRED_FIELD.category == "validation"
        assert ErrorCode.E401_PARSE_ERROR.category == "data"

    def test_error_description(self):
        """Test error description property."""
        assert "not found" in ErrorCode.E101_FILE_NOT_FOUND.description.lower()
        assert "timed out" in ErrorCode.E201_AGENT_TIMEOUT.description.lower()


class TestErrorSeverity:
    """Tests for ErrorSeverity enum."""

    def test_severity_values(self):
        """Test severity values."""
        assert ErrorSeverity.INFO.value == "info"
        assert ErrorSeverity.WARNING.value == "warning"
        assert ErrorSeverity.ERROR.value == "error"
        assert ErrorSeverity.FATAL.value == "fatal"

    def test_is_blocking(self):
        """Test is_blocking property."""
        assert ErrorSeverity.INFO.is_blocking is False
        assert ErrorSeverity.WARNING.is_blocking is False
        assert ErrorSeverity.ERROR.is_blocking is True
        assert ErrorSeverity.FATAL.is_blocking is True

    def test_priority(self):
        """Test priority ordering."""
        assert ErrorSeverity.INFO.priority < ErrorSeverity.WARNING.priority
        assert ErrorSeverity.WARNING.priority < ErrorSeverity.ERROR.priority
        assert ErrorSeverity.ERROR.priority < ErrorSeverity.FATAL.priority


class TestCampaignError:
    """Tests for CampaignError dataclass."""

    def test_basic_creation(self):
        """Test basic CampaignError creation."""
        err = CampaignError(
            code=ErrorCode.E101_FILE_NOT_FOUND,
            severity=ErrorSeverity.ERROR,
            message="File not found: test.data",
            file_path="/path/to/test.data",
        )
        assert err.code == ErrorCode.E101_FILE_NOT_FOUND
        assert err.severity == ErrorSeverity.ERROR
        assert "test.data" in err.message

    def test_to_dict(self):
        """Test to_dict serialization."""
        err = CampaignError(
            code=ErrorCode.E101_FILE_NOT_FOUND,
            severity=ErrorSeverity.ERROR,
            message="File not found",
            file_path="/test",
            suggestion="Check path",
        )
        d = err.to_dict()
        assert d["code"] == "E101"
        assert d["severity"] == "error"
        assert d["category"] == "file"
        assert d["suggestion"] == "Check path"

    def test_from_dict(self):
        """Test from_dict deserialization."""
        data = {
            "code": "E101",
            "severity": "error",
            "message": "File not found",
            "file_path": "/test",
        }
        err = CampaignError.from_dict(data)
        assert err.code == ErrorCode.E101_FILE_NOT_FOUND
        assert err.severity == ErrorSeverity.ERROR

    def test_file_not_found_factory(self):
        """Test file_not_found factory method."""
        err = CampaignError.file_not_found("/missing/file.data")
        assert err.code == ErrorCode.E101_FILE_NOT_FOUND
        assert err.severity == ErrorSeverity.ERROR
        assert "missing/file.data" in err.message

    def test_parse_error_factory(self):
        """Test parse_error factory method."""
        err = CampaignError.parse_error(
            "/bad/file.data",
            line_number=42,
            details="Unexpected token",
        )
        assert err.code == ErrorCode.E401_PARSE_ERROR
        assert err.context["line_number"] == 42

    def test_validation_error_factory(self):
        """Test validation_error factory method."""
        err = CampaignError.validation_error(
            field_name="atom_count",
            expected="positive integer",
            actual="-5",
        )
        assert err.code == ErrorCode.E302_INVALID_VALUE
        assert "atom_count" in err.message

    def test_str_representation(self):
        """Test string representation."""
        err = CampaignError(
            code=ErrorCode.E101_FILE_NOT_FOUND,
            severity=ErrorSeverity.ERROR,
            message="File not found",
            file_path="/test/file",
            suggestion="Check path",
        )
        s = str(err)
        assert "[E101]" in s
        assert "ERROR" in s
        assert "File:" in s
        assert "Suggestion:" in s
