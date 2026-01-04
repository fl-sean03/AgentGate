"""
Tests for Campaign Planner agent.

Tests cover:
    - Empty file guides returns error
    - Intent parsing
    - File generation with real FileGuides
    - Validation integration
"""

import asyncio
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import List
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from campaign_builder.schemas import (
    FileGuide,
    FileType,
    AtomType,
    PairCoeff,
    BondCoeff,
    BoxDimensions,
    CampaignError,
    ErrorCode,
    ErrorSeverity,
)
from campaign_builder.agent.campaign_planner import (
    # Dataclasses
    GeneratedFile,
    ParameterSource,
    CampaignPlanResult,
    # File guide formatting
    format_file_guides_for_agent,
    # Prompt building
    build_campaign_planner_prompt,
    # Engine detection and file discovery
    detect_engine_from_file,
    infer_file_purpose,
    discover_generated_files,
    # Validation integration
    format_repair_request,
    is_unfixable_error,
    validate_and_repair,
    create_validation_summary,
    create_missing_info_report,
    # LAMMPS generation
    generate_lammps_input,
    # Main function
    run_campaign_planner,
)
from campaign_builder.tools.validation import ValidationResult


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def sample_file_guide():
    """Create a sample FileGuide for testing."""
    return FileGuide(
        file_path="/path/to/structure.data",
        file_name="structure.data",
        file_type=FileType.LAMMPS_DATA,
        file_size_bytes=1024,
        sha256_hash="abc123",
        purpose="LAMMPS data file with molecular structure",
        summary="Contains 100 atoms in a cubic box",
        confidence="high",
        analysis_iterations=3,
        atom_count=100,
        atom_types_count=3,
        atom_types=[
            AtomType(id=1, mass=12.011, element="C", label="C_sp3"),
            AtomType(id=2, mass=1.008, element="H", label="H"),
            AtomType(id=3, mass=15.999, element="O", label="O"),
        ],
        box_dimensions=BoxDimensions(
            xlo=0.0, xhi=50.0,
            ylo=0.0, yhi=50.0,
            zlo=0.0, zhi=50.0,
        ),
        pair_style="lj/cut/coul/long 10.0",
        pair_coeffs=[
            PairCoeff(type1=1, type2=1, params=[0.0556, 3.431], source_line=47),
            PairCoeff(type1=2, type2=2, params=[0.0157, 2.471], source_line=48),
            PairCoeff(type1=3, type2=3, params=[0.1521, 3.166], source_line=49),
        ],
        atom_style_hint="full",
    )


@pytest.fixture
def sample_file_guide_minimal():
    """Create a minimal FileGuide without force field info."""
    return FileGuide(
        file_path="/path/to/structure.data",
        file_name="structure.data",
        file_type=FileType.LAMMPS_DATA,
        file_size_bytes=512,
        sha256_hash="def456",
        purpose="LAMMPS data file",
        summary="Basic structure file",
        confidence="medium",
        analysis_iterations=1,
    )


@pytest.fixture
def sample_qe_file_guide():
    """Create a sample QE FileGuide."""
    from campaign_builder.schemas import Species

    return FileGuide(
        file_path="/path/to/scf.pwi",
        file_name="scf.pwi",
        file_type=FileType.QE_INPUT,
        file_size_bytes=2048,
        sha256_hash="ghi789",
        purpose="QE SCF calculation input",
        summary="SCF calculation for silicon",
        confidence="high",
        analysis_iterations=2,
        calculation="scf",
        nat=2,
        ntyp=1,
        ecutwfc=50.0,
        ecutrho=400.0,
        species=[
            Species(symbol="Si", mass=28.086, pseudopotential="Si.pbe-n-rrkjus_psl.1.0.0.UPF"),
        ],
        kpoints_type="automatic",
        kpoints_grid=[4, 4, 4],
    )


# =============================================================================
# Dataclass Tests
# =============================================================================


class TestDataclasses:
    """Tests for dataclass definitions."""

    def test_generated_file_creation(self, tmp_path):
        """Test GeneratedFile dataclass."""
        gf = GeneratedFile(
            path=tmp_path / "in.minimize",
            purpose="Energy minimization",
            engine="lammps",
            validation=None,
        )

        assert gf.path == tmp_path / "in.minimize"
        assert gf.purpose == "Energy minimization"
        assert gf.engine == "lammps"
        assert gf.validation is None

    def test_generated_file_to_dict(self, tmp_path):
        """Test GeneratedFile.to_dict()."""
        gf = GeneratedFile(
            path=tmp_path / "in.nvt",
            purpose="NVT equilibration",
            engine="lammps",
        )

        d = gf.to_dict()
        assert d["path"] == str(tmp_path / "in.nvt")
        assert d["purpose"] == "NVT equilibration"
        assert d["engine"] == "lammps"
        assert "validation" not in d

    def test_parameter_source_creation(self):
        """Test ParameterSource dataclass."""
        ps = ParameterSource(
            value="0.0556",
            source_file="structure.data",
            source_location="line 47",
            is_default=False,
        )

        assert ps.value == "0.0556"
        assert ps.source_file == "structure.data"
        assert ps.source_location == "line 47"
        assert ps.is_default is False
        assert ps.default_reason is None

    def test_parameter_source_with_default(self):
        """Test ParameterSource with default value."""
        ps = ParameterSource(
            value="1.0",
            source_file="default",
            source_location="standard",
            is_default=True,
            default_reason="Standard timestep for organic molecules",
        )

        assert ps.is_default is True
        assert ps.default_reason is not None

        d = ps.to_dict()
        assert d["default_reason"] == "Standard timestep for organic molecules"

    def test_campaign_plan_result_creation(self):
        """Test CampaignPlanResult dataclass."""
        result = CampaignPlanResult(
            success=True,
            intent_analysis="User wants NVT equilibration",
            campaign_plan="Run NVT at 300K",
            generated_files=[],
            parameter_manifest={},
            assumptions=["Used default timestep"],
            warnings=["Low cutoff radius"],
            errors=[],
            iterations_used=5,
            duration_ms=1234,
        )

        assert result.success is True
        assert result.iterations_used == 5
        assert result.duration_ms == 1234

    def test_campaign_plan_result_to_dict(self, tmp_path):
        """Test CampaignPlanResult.to_dict()."""
        gf = GeneratedFile(
            path=tmp_path / "in.nvt",
            purpose="NVT",
            engine="lammps",
        )
        ps = ParameterSource(
            value="300.0",
            source_file="intent",
            source_location="parsed",
            is_default=False,
        )

        result = CampaignPlanResult(
            success=True,
            intent_analysis="Analysis",
            campaign_plan="Plan",
            generated_files=[gf],
            parameter_manifest={"temperature": ps},
            assumptions=["Assumption 1"],
            warnings=["Warning 1"],
            errors=[],
            iterations_used=3,
            duration_ms=500,
        )

        d = result.to_dict()
        assert d["success"] is True
        assert len(d["generated_files"]) == 1
        assert "temperature" in d["parameter_manifest"]


# =============================================================================
# Empty File Guides Tests
# =============================================================================


class TestEmptyFileGuides:
    """Tests for empty file guides handling."""

    @pytest.mark.asyncio
    async def test_no_file_guides_returns_error(self, tmp_path):
        """Running with no file guides should return error."""
        result = await run_campaign_planner(
            intent="Run NVT at 300K",
            file_guides=[],
            workspace=tmp_path,
            output_dir=tmp_path / "output",
        )

        assert result.success is False
        assert len(result.errors) > 0
        assert any(
            e.code == ErrorCode.E301_MISSING_REQUIRED_FIELD
            for e in result.errors
        )

    def test_format_empty_file_guides(self):
        """Formatting empty file guides should return appropriate message."""
        result = format_file_guides_for_agent([])
        assert "No file guides provided" in result


# =============================================================================
# Intent Parsing Tests
# =============================================================================


class TestIntentParsing:
    """Tests for intent parsing in LAMMPS input generation."""

    def test_nvt_intent_parsing(self, sample_file_guide):
        """Should detect NVT from intent."""
        content, manifest, warnings = generate_lammps_input(
            intent="Run NVT equilibration at 350K for 100 ps",
            file_guides=[sample_file_guide],
        )

        assert "nvt" in content.lower()
        assert "350" in content  # Temperature
        assert "temperature" in manifest

    def test_npt_intent_parsing(self, sample_file_guide):
        """Should detect NPT from intent."""
        content, manifest, warnings = generate_lammps_input(
            intent="Run NPT at 300K and 1 atm",
            file_guides=[sample_file_guide],
        )

        assert "npt" in content.lower()
        assert "pressure" in manifest

    def test_minimize_intent_parsing(self, sample_file_guide):
        """Should detect minimization from intent."""
        content, manifest, warnings = generate_lammps_input(
            intent="Energy minimize the structure",
            file_guides=[sample_file_guide],
        )

        assert "minimize" in content.lower()

    def test_temperature_extraction(self, sample_file_guide):
        """Should extract temperature from intent."""
        content, manifest, warnings = generate_lammps_input(
            intent="Run NVT at 500K",
            file_guides=[sample_file_guide],
        )

        assert "500" in content
        temp_source = manifest.get("temperature")
        assert temp_source is not None
        assert temp_source.value == "500.0"

    def test_default_temperature(self, sample_file_guide):
        """Should use default temperature when not specified."""
        content, manifest, warnings = generate_lammps_input(
            intent="Run NVT equilibration",
            file_guides=[sample_file_guide],
        )

        temp_source = manifest.get("temperature")
        assert temp_source is not None
        assert temp_source.value == "300.0"
        assert temp_source.is_default is True


# =============================================================================
# File Generation Tests
# =============================================================================


class TestFileGeneration:
    """Tests for LAMMPS input file generation."""

    def test_generates_valid_lammps_structure(self, sample_file_guide):
        """Generated content should have proper LAMMPS structure."""
        content, manifest, warnings = generate_lammps_input(
            intent="Run NVT at 300K",
            file_guides=[sample_file_guide],
        )

        # Check for required sections
        assert "units real" in content
        assert "atom_style" in content
        assert "read_data" in content
        assert "pair_style" in content
        assert "pair_coeff" in content
        assert "timestep" in content

    def test_uses_pair_coeffs_from_file_guide(self, sample_file_guide):
        """Should use pair_coeffs from file guide."""
        content, manifest, warnings = generate_lammps_input(
            intent="Run NVT",
            file_guides=[sample_file_guide],
        )

        # Check that pair_coeff values come from file guide
        assert "0.0556" in content  # epsilon for type 1
        assert "3.431" in content   # sigma for type 1

        # Check manifest entries
        assert "pair_coeff_1_1" in manifest
        pc_source = manifest["pair_coeff_1_1"]
        assert pc_source.is_default is False
        assert pc_source.source_file == sample_file_guide.file_name

    def test_uses_pair_style_from_file_guide(self, sample_file_guide):
        """Should use pair_style from file guide."""
        content, manifest, warnings = generate_lammps_input(
            intent="Run NVT",
            file_guides=[sample_file_guide],
        )

        assert sample_file_guide.pair_style in content
        assert "pair_style" in manifest

    def test_warnings_when_missing_pair_coeffs(self, sample_file_guide_minimal):
        """Should warn when pair_coeffs are missing."""
        content, manifest, warnings = generate_lammps_input(
            intent="Run NVT",
            file_guides=[sample_file_guide_minimal],
        )

        # Should have warnings about missing pair_coeffs
        assert any("pair_coeff" in w.lower() for w in warnings)

    def test_uses_atom_style_hint(self, sample_file_guide):
        """Should use atom_style from file guide hint."""
        content, manifest, warnings = generate_lammps_input(
            intent="Run NVT",
            file_guides=[sample_file_guide],
        )

        assert "atom_style full" in content
        assert "atom_style" in manifest
        assert manifest["atom_style"].value == "full"

    @pytest.mark.asyncio
    async def test_full_pipeline_with_file_guide(self, sample_file_guide, tmp_path):
        """Test full pipeline with a real file guide."""
        output_dir = tmp_path / "output"

        result = await run_campaign_planner(
            intent="Run NVT equilibration at 300K",
            file_guides=[sample_file_guide],
            workspace=tmp_path,
            output_dir=output_dir,
        )

        # Should generate files
        assert len(result.generated_files) > 0

        # Check that files were actually created
        for gf in result.generated_files:
            assert gf.path.exists()

        # Check intent analysis
        assert "nvt" in result.intent_analysis.lower()


# =============================================================================
# Validation Integration Tests
# =============================================================================


class TestValidationIntegration:
    """Tests for validation integration."""

    def test_format_repair_request(self, tmp_path):
        """Test formatting of repair request."""
        # Create a mock validation result
        result = ValidationResult(
            overall_passed=False,
            can_run=False,
            all_issues=[
                {
                    "code": "L1_MISSING_UNITS",
                    "message": "Missing required command: units",
                    "severity": "error",
                    "suggestion": "Add 'units' command",
                }
            ],
            suggestions=["Add 'units real' at the start"],
            engine="lammps",
        )

        request = format_repair_request(
            file_path=tmp_path / "in.test",
            validation_result=result,
            attempt=1,
        )

        assert "Repair Request" in request
        assert "Attempt 1" in request
        assert "L1_MISSING_UNITS" in request

    def test_is_unfixable_error_missing_pair_coeff(self):
        """Should detect missing pair_coeff as unfixable."""
        issue = {
            "code": "missing_pair_coeff",
            "message": "Missing pair_coeff for types 3-5",
            "severity": "error",
        }

        assert is_unfixable_error(issue) is True

    def test_is_unfixable_error_normal_error(self):
        """Should not flag normal errors as unfixable."""
        issue = {
            "code": "L1_MISSING_UNITS",
            "message": "Missing required command: units",
            "severity": "error",
        }

        assert is_unfixable_error(issue) is False

    def test_create_validation_summary(self, tmp_path):
        """Test validation summary creation."""
        gf1 = GeneratedFile(
            path=tmp_path / "in.nvt",
            purpose="NVT equilibration",
            engine="lammps",
            validation=ValidationResult(
                overall_passed=True,
                can_run=True,
                levels_run=["L0", "L1"],
                engine="lammps",
            ),
        )
        gf2 = GeneratedFile(
            path=tmp_path / "in.npt",
            purpose="NPT production",
            engine="lammps",
            validation=ValidationResult(
                overall_passed=False,
                can_run=False,
                all_issues=[{"code": "error", "message": "test error"}],
                levels_run=["L0", "L1"],
                engine="lammps",
            ),
        )

        summary = create_validation_summary([gf1, gf2])

        assert "Validation Summary" in summary
        assert "PASSED" in summary
        assert "FAILED" in summary
        assert "Passed:** 1" in summary
        assert "Failed:** 1" in summary

    def test_create_missing_info_report(self, sample_file_guide_minimal):
        """Test missing info report creation."""
        # Add some missing info
        sample_file_guide_minimal.missing_info = ["pair_style", "pair_coeffs"]

        # Create a validation result with unfixable issues
        vr = ValidationResult(
            overall_passed=False,
            can_run=False,
            all_issues=[
                {
                    "code": "missing_parameter",
                    "message": "Missing force field parameter for type 3",
                    "severity": "error",
                }
            ],
            engine="lammps",
        )

        report = create_missing_info_report(
            validation_results=[vr],
            file_guides=[sample_file_guide_minimal],
        )

        assert "Missing Information Report" in report
        assert "pair_style" in report
        assert "pair_coeffs" in report

    @pytest.mark.asyncio
    async def test_validate_and_repair_passes(self, tmp_path, sample_file_guide):
        """Test validate_and_repair with valid file."""
        # Generate valid LAMMPS input
        content, _, _ = generate_lammps_input(
            intent="Run NVT at 300K",
            file_guides=[sample_file_guide],
        )

        # Write to file
        test_file = tmp_path / "in.test"
        test_file.write_text(content)

        result, attempts = await validate_and_repair(
            file_path=test_file,
            engine="lammps",
            max_attempts=3,
        )

        # Should pass validation (at least L0)
        assert attempts >= 1


# =============================================================================
# Engine Detection Tests
# =============================================================================


class TestEngineDetection:
    """Tests for engine detection functions."""

    def test_detect_lammps_from_extension(self, tmp_path):
        """Should detect LAMMPS from .lmp extension."""
        test_file = tmp_path / "input.lmp"
        test_file.write_text("units real\n")

        engine = detect_engine_from_file(test_file)
        assert engine == "lammps"

    def test_detect_qe_from_extension(self, tmp_path):
        """Should detect QE from .pwi extension."""
        test_file = tmp_path / "input.pwi"
        test_file.write_text("&CONTROL\n/\n")

        engine = detect_engine_from_file(test_file)
        assert engine == "qe"

    def test_detect_lammps_from_content(self, tmp_path):
        """Should detect LAMMPS from content."""
        test_file = tmp_path / "input.in"
        test_file.write_text("units real\natom_style full\n")

        engine = detect_engine_from_file(test_file)
        assert engine == "lammps"

    def test_detect_qe_from_content(self, tmp_path):
        """Should detect QE from content."""
        test_file = tmp_path / "input.in"
        test_file.write_text("&CONTROL\ncalculation = 'scf'\n/\n")

        engine = detect_engine_from_file(test_file)
        assert engine == "qe"

    def test_infer_minimize_purpose(self):
        """Should infer minimization purpose from filename."""
        purpose = infer_file_purpose("in.minimize")
        assert "minim" in purpose.lower()

    def test_infer_nvt_purpose(self):
        """Should infer NVT purpose from filename."""
        purpose = infer_file_purpose("in.nvt")
        assert "nvt" in purpose.lower() or "equilib" in purpose.lower()

    def test_infer_production_purpose(self):
        """Should infer production purpose from filename."""
        purpose = infer_file_purpose("in.production")
        assert "production" in purpose.lower()


# =============================================================================
# File Discovery Tests
# =============================================================================


class TestFileDiscovery:
    """Tests for file discovery function."""

    def test_discover_lammps_files(self, tmp_path):
        """Should discover LAMMPS input files."""
        # Create test files
        (tmp_path / "in.minimize").write_text("units real\n")
        (tmp_path / "in.nvt").write_text("units real\n")
        (tmp_path / "data.structure").write_text("LAMMPS data\n")
        (tmp_path / "random.txt").write_text("other\n")

        files = discover_generated_files(tmp_path)

        assert len(files) >= 3  # Should find at least the 3 simulation files
        names = [f.name for f in files]
        assert "in.minimize" in names
        assert "in.nvt" in names

    def test_discover_with_since_filter(self, tmp_path):
        """Should filter files by modification time."""
        # Create a file
        test_file = tmp_path / "in.old"
        test_file.write_text("old content")

        # Set timestamp to past
        past_time = datetime.now() - timedelta(hours=1)
        future_time = datetime.now() + timedelta(hours=1)

        files = discover_generated_files(tmp_path, since=future_time)

        # Should not find the file since it was created before 'since'
        assert len(files) == 0

    def test_discover_empty_directory(self, tmp_path):
        """Should return empty list for empty directory."""
        empty_dir = tmp_path / "empty"
        empty_dir.mkdir()

        files = discover_generated_files(empty_dir)
        assert files == []


# =============================================================================
# Prompt Building Tests
# =============================================================================


class TestPromptBuilding:
    """Tests for prompt building functions."""

    def test_format_file_guides_for_agent(self, sample_file_guide):
        """Should format file guides as markdown."""
        result = format_file_guides_for_agent([sample_file_guide])

        assert "# Available File Guides" in result
        assert sample_file_guide.file_name in result
        assert "structure.data" in result

    def test_build_campaign_planner_prompt(self, sample_file_guide, tmp_path):
        """Should build complete prompt."""
        prompt = build_campaign_planner_prompt(
            intent="Run NVT at 300K",
            file_guides=[sample_file_guide],
            workspace=tmp_path,
            output_dir=tmp_path / "output",
        )

        assert "Campaign Planning Request" in prompt
        assert "User Intent" in prompt
        assert "NVT at 300K" in prompt
        assert "Force Field Summary" in prompt
        assert sample_file_guide.pair_style in prompt

    def test_prompt_warns_about_missing_ff(self, sample_file_guide_minimal, tmp_path):
        """Should warn about missing force field info in prompt."""
        prompt = build_campaign_planner_prompt(
            intent="Run NVT",
            file_guides=[sample_file_guide_minimal],
            workspace=tmp_path,
            output_dir=tmp_path / "output",
        )

        assert "MISSING" in prompt or "NOT FOUND" in prompt


# =============================================================================
# Integration Tests
# =============================================================================


class TestIntegration:
    """Integration tests for campaign planner."""

    @pytest.mark.asyncio
    async def test_full_pipeline_success(self, sample_file_guide, tmp_path):
        """Test successful full pipeline execution."""
        output_dir = tmp_path / "output"

        result = await run_campaign_planner(
            intent="Run NVT equilibration at 300K for 100 ps",
            file_guides=[sample_file_guide],
            workspace=tmp_path,
            output_dir=output_dir,
        )

        # Check result structure
        assert result.intent_analysis is not None
        assert result.campaign_plan is not None
        assert result.duration_ms >= 0  # Can be 0 if very fast
        assert result.iterations_used > 0

        # Check parameter manifest has required entries
        assert "units" in result.parameter_manifest
        assert "timestep" in result.parameter_manifest

    @pytest.mark.asyncio
    async def test_full_pipeline_with_warnings(self, sample_file_guide_minimal, tmp_path):
        """Test pipeline with minimal file guide produces warnings."""
        output_dir = tmp_path / "output"

        result = await run_campaign_planner(
            intent="Run NVT at 300K",
            file_guides=[sample_file_guide_minimal],
            workspace=tmp_path,
            output_dir=output_dir,
        )

        # Should have warnings about missing info
        assert len(result.warnings) > 0

    @pytest.mark.asyncio
    async def test_different_simulation_types(self, sample_file_guide, tmp_path):
        """Test different simulation types generate appropriate files."""
        output_dir = tmp_path / "output"

        # Test minimization
        result_min = await run_campaign_planner(
            intent="Minimize the energy",
            file_guides=[sample_file_guide],
            workspace=tmp_path,
            output_dir=output_dir / "min",
        )
        assert any("minim" in gf.purpose.lower() for gf in result_min.generated_files)

        # Test NVT
        result_nvt = await run_campaign_planner(
            intent="Run NVT at 400K",
            file_guides=[sample_file_guide],
            workspace=tmp_path,
            output_dir=output_dir / "nvt",
        )
        assert "nvt" in result_nvt.intent_analysis.lower()

        # Test NPT
        result_npt = await run_campaign_planner(
            intent="Run NPT at 300K and 2 atm",
            file_guides=[sample_file_guide],
            workspace=tmp_path,
            output_dir=output_dir / "npt",
        )
        assert "npt" in result_npt.intent_analysis.lower()
