"""
Tests for Campaign Builder Orchestration Runner.

Tests cover:
    - Pipeline execution with valid workspace
    - Empty workspace handling
    - Partial failure handling
    - Error aggregation
    - ErrorHandler functionality
    - Artifact generation
"""

import asyncio
import tempfile
from pathlib import Path
from typing import List, Tuple

import pytest

from campaign_builder.agent import (
    run_campaign_builder,
    CampaignBuilderResult,
    GeneratedFile,
    ParameterSource,
    create_failed_result,
    create_partial_success_report,
    with_timeout,
    discover_files,
    analyze_all_files,
    compute_file_hash,
    write_campaign_readme,
    write_parameter_manifest,
    STAGE_DISCOVERING,
    STAGE_ANALYZING,
    STAGE_PLANNING,
    STAGE_VALIDATING,
    STAGE_FINALIZING,
    STAGE_COMPLETE,
)
from campaign_builder.schemas import (
    CampaignError,
    ErrorCode,
    ErrorSeverity,
    ErrorHandler,
    get_recovery_suggestion,
    FileType,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def temp_workspace():
    """Create a temporary workspace directory with test files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        workspace = Path(tmpdir) / "workspace"
        workspace.mkdir()

        # Create some test files
        (workspace / "test.data").write_text(
            "LAMMPS data file\n\n100 atoms\n5 atom types\n\n0.0 50.0 xlo xhi\n"
        )
        (workspace / "input.in").write_text(
            "# LAMMPS input\nunits real\natom_style full\n"
        )
        (workspace / "params.csv").write_text(
            "temperature,pressure\n300,1.0\n350,2.0\n"
        )

        yield workspace


@pytest.fixture
def empty_workspace():
    """Create an empty workspace directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        workspace = Path(tmpdir) / "empty_workspace"
        workspace.mkdir()
        yield workspace


@pytest.fixture
def output_dir():
    """Create a temporary output directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output = Path(tmpdir) / "output"
        output.mkdir()
        yield output


@pytest.fixture
def error_handler():
    """Create a fresh ErrorHandler."""
    return ErrorHandler()


# =============================================================================
# ErrorHandler Tests
# =============================================================================


class TestErrorHandler:
    """Tests for ErrorHandler class."""

    def test_empty_handler(self, error_handler):
        """Test empty handler state."""
        assert len(error_handler) == 0
        assert not error_handler.has_fatal()
        assert not error_handler.has_errors()
        assert error_handler.can_continue()
        assert error_handler.get_errors() == []
        assert error_handler.get_warnings() == []

    def test_add_error(self, error_handler):
        """Test adding an error."""
        err = CampaignError.file_not_found("/test/file.data")
        error_handler.add(err)

        assert len(error_handler) == 1
        assert error_handler.has_errors()
        assert not error_handler.has_fatal()
        assert error_handler.can_continue()
        assert len(error_handler.get_errors()) == 1

    def test_add_warning(self, error_handler):
        """Test adding a warning."""
        error_handler.add_warning("This is a warning", "/test/file.data")

        assert len(error_handler) == 1
        assert not error_handler.has_errors()
        assert error_handler.can_continue()
        assert len(error_handler.get_warnings()) == 1
        assert error_handler.get_warnings()[0].message == "This is a warning"

    def test_fatal_error(self, error_handler):
        """Test fatal error handling."""
        fatal_err = CampaignError(
            code=ErrorCode.E101_FILE_NOT_FOUND,
            severity=ErrorSeverity.FATAL,
            message="Critical error",
        )
        error_handler.add(fatal_err)

        assert error_handler.has_fatal()
        assert error_handler.has_errors()
        assert not error_handler.can_continue()

    def test_get_report(self, error_handler):
        """Test report generation."""
        # Empty report
        report = error_handler.get_report()
        assert "No errors or warnings" in report

        # With errors
        error_handler.add(CampaignError.file_not_found("/test.data"))
        error_handler.add_warning("A warning")

        report = error_handler.get_report()
        assert "Error Report" in report
        assert "ERRORS" in report
        assert "WARNINGS" in report
        assert "Total: 2" in report

    def test_bool_conversion(self, error_handler):
        """Test boolean conversion."""
        assert not bool(error_handler)
        error_handler.add_warning("test")
        assert bool(error_handler)


class TestGetRecoverySuggestion:
    """Tests for get_recovery_suggestion function."""

    def test_explicit_suggestion(self):
        """Test that explicit suggestion is returned."""
        err = CampaignError(
            code=ErrorCode.E101_FILE_NOT_FOUND,
            severity=ErrorSeverity.ERROR,
            message="File not found",
            suggestion="Custom suggestion",
        )
        assert get_recovery_suggestion(err) == "Custom suggestion"

    def test_default_suggestion(self):
        """Test default suggestion for error code."""
        err = CampaignError(
            code=ErrorCode.E101_FILE_NOT_FOUND,
            severity=ErrorSeverity.ERROR,
            message="File not found",
        )
        suggestion = get_recovery_suggestion(err)
        assert "file path" in suggestion.lower() or "verify" in suggestion.lower()

    def test_all_error_codes_have_suggestions(self):
        """Test that all error codes have suggestions."""
        for code in ErrorCode:
            err = CampaignError(
                code=code,
                severity=ErrorSeverity.ERROR,
                message="Test error",
            )
            suggestion = get_recovery_suggestion(err)
            assert suggestion, f"No suggestion for {code}"
            assert len(suggestion) > 0


# =============================================================================
# Helper Function Tests
# =============================================================================


class TestComputeFileHash:
    """Tests for compute_file_hash function."""

    def test_hash_computation(self, temp_workspace):
        """Test file hash computation."""
        file_path = temp_workspace / "test.data"
        hash1 = compute_file_hash(file_path)

        # Should be SHA256 hex string (64 characters)
        assert len(hash1) == 64
        assert all(c in "0123456789abcdef" for c in hash1)

        # Same file should give same hash
        hash2 = compute_file_hash(file_path)
        assert hash1 == hash2

    def test_different_files_different_hashes(self, temp_workspace):
        """Test that different files have different hashes."""
        hash1 = compute_file_hash(temp_workspace / "test.data")
        hash2 = compute_file_hash(temp_workspace / "input.in")
        assert hash1 != hash2


class TestDiscoverFiles:
    """Tests for discover_files function."""

    def test_discover_files(self, temp_workspace, error_handler):
        """Test file discovery in workspace."""
        files = discover_files(temp_workspace, error_handler)

        assert len(files) == 3
        assert not error_handler.has_errors()
        filenames = [f.name for f in files]
        assert "test.data" in filenames
        assert "input.in" in filenames
        assert "params.csv" in filenames

    def test_discover_empty_workspace(self, empty_workspace, error_handler):
        """Test file discovery in empty workspace."""
        files = discover_files(empty_workspace, error_handler)

        assert len(files) == 0
        assert not error_handler.has_errors()

    def test_discover_nonexistent_workspace(self, error_handler):
        """Test file discovery in non-existent workspace."""
        files = discover_files(Path("/nonexistent/path"), error_handler)

        assert len(files) == 0
        assert error_handler.has_fatal()
        assert not error_handler.can_continue()

    def test_discover_with_extension_filter(self, temp_workspace, error_handler):
        """Test file discovery with extension filter."""
        files = discover_files(temp_workspace, error_handler, extensions=[".data"])

        assert len(files) == 1
        assert files[0].name == "test.data"

    def test_skip_hidden_files(self, temp_workspace, error_handler):
        """Test that hidden files are skipped."""
        (temp_workspace / ".hidden").write_text("hidden content")
        files = discover_files(temp_workspace, error_handler)

        filenames = [f.name for f in files]
        assert ".hidden" not in filenames


class TestWithTimeout:
    """Tests for with_timeout function."""

    @pytest.mark.asyncio
    async def test_successful_operation(self):
        """Test successful operation within timeout."""
        async def quick_op():
            return "success"

        result = await with_timeout(quick_op(), 5.0, "quick_op")
        assert result == "success"

    @pytest.mark.asyncio
    async def test_timeout(self):
        """Test operation timeout."""
        async def slow_op():
            await asyncio.sleep(10)
            return "never"

        with pytest.raises(asyncio.TimeoutError) as exc_info:
            await with_timeout(slow_op(), 0.1, "slow_op")

        assert "slow_op" in str(exc_info.value)
        assert "timed out" in str(exc_info.value)


# =============================================================================
# Dataclass Tests
# =============================================================================


class TestGeneratedFile:
    """Tests for GeneratedFile dataclass."""

    def test_basic_creation(self, output_dir):
        """Test GeneratedFile creation."""
        gf = GeneratedFile(
            path=output_dir / "output.lmp",
            file_type="lammps_input",
            description="Generated LAMMPS input file",
            sha256_hash="abc123",
            source_files=["/input/file1.data", "/input/file2.data"],
        )

        assert gf.file_type == "lammps_input"
        assert len(gf.source_files) == 2

    def test_to_dict(self, output_dir):
        """Test GeneratedFile serialization."""
        gf = GeneratedFile(
            path=output_dir / "output.lmp",
            file_type="lammps_input",
            description="Test file",
            sha256_hash="abc123",
        )

        d = gf.to_dict()
        assert "path" in d
        assert d["file_type"] == "lammps_input"
        assert d["sha256_hash"] == "abc123"


class TestParameterSource:
    """Tests for ParameterSource dataclass."""

    def test_basic_creation(self):
        """Test ParameterSource creation."""
        ps = ParameterSource(
            parameter_name="temperature",
            value=300.0,
            source_file="/input/params.csv",
            source_line=5,
            confidence="high",
            notes="From user specification",
        )

        assert ps.parameter_name == "temperature"
        assert ps.value == 300.0
        assert ps.source_line == 5

    def test_to_dict(self):
        """Test ParameterSource serialization."""
        ps = ParameterSource(
            parameter_name="cutoff",
            value=10.0,
            source_file="/input/settings.json",
            confidence="medium",
        )

        d = ps.to_dict()
        assert d["parameter_name"] == "cutoff"
        assert d["value"] == 10.0
        assert d["confidence"] == "medium"
        assert "source_line" not in d  # None excluded


class TestCampaignBuilderResult:
    """Tests for CampaignBuilderResult dataclass."""

    def test_basic_creation(self, temp_workspace, output_dir):
        """Test CampaignBuilderResult creation."""
        result = CampaignBuilderResult(
            success=True,
            intent="Test campaign",
            workspace=temp_workspace,
            files_found=3,
            files_analyzed=3,
            file_guides=[],
            analysis_errors=[],
            campaign_plan="Test plan",
            generated_files=[],
            parameter_manifest={},
            output_directory=output_dir,
            validation_summary="All good",
            readme_path=None,
            manifest_path=None,
            total_duration_ms=100,
            analysis_duration_ms=50,
            planning_duration_ms=50,
            errors=[],
            warnings=[],
            assumptions=[],
        )

        assert result.success
        assert result.files_found == 3

    def test_is_partial_success(self, temp_workspace, output_dir):
        """Test partial success detection."""
        # Fully successful
        result = CampaignBuilderResult(
            success=True,
            intent="Test",
            workspace=temp_workspace,
            files_found=3,
            files_analyzed=3,
            file_guides=[],
            analysis_errors=[],
            campaign_plan=None,
            generated_files=[],
            parameter_manifest={},
            output_directory=output_dir,
            validation_summary="OK",
            readme_path=None,
            manifest_path=None,
            total_duration_ms=0,
            analysis_duration_ms=0,
            planning_duration_ms=0,
            errors=[],
            warnings=[],
            assumptions=[],
        )
        assert not result.is_partial_success()

        # Partial success
        result.analysis_errors = [CampaignError.file_not_found("/test")]
        result.files_analyzed = 2
        assert result.is_partial_success()

    def test_to_dict(self, temp_workspace, output_dir):
        """Test CampaignBuilderResult serialization."""
        result = CampaignBuilderResult(
            success=True,
            intent="Test campaign",
            workspace=temp_workspace,
            files_found=3,
            files_analyzed=3,
            file_guides=[],
            analysis_errors=[],
            campaign_plan="Test plan",
            generated_files=[],
            parameter_manifest={},
            output_directory=output_dir,
            validation_summary="All good",
            readme_path=None,
            manifest_path=None,
            total_duration_ms=100,
            analysis_duration_ms=50,
            planning_duration_ms=50,
            errors=[],
            warnings=[],
            assumptions=["Assumption 1"],
        )

        d = result.to_dict()
        assert d["success"] is True
        assert d["intent"] == "Test campaign"
        assert d["files_found"] == 3
        assert "Assumption 1" in d["assumptions"]


# =============================================================================
# Artifact Writer Tests
# =============================================================================


class TestWriteCampaignReadme:
    """Tests for write_campaign_readme function."""

    def test_readme_generation(self, temp_workspace, output_dir):
        """Test README generation."""
        result = CampaignBuilderResult(
            success=True,
            intent="Build a molecular simulation campaign",
            workspace=temp_workspace,
            files_found=3,
            files_analyzed=3,
            file_guides=[],
            analysis_errors=[],
            campaign_plan="This is the campaign plan",
            generated_files=[],
            parameter_manifest={},
            output_directory=output_dir,
            validation_summary="OK",
            readme_path=None,
            manifest_path=None,
            total_duration_ms=100,
            analysis_duration_ms=50,
            planning_duration_ms=50,
            errors=[],
            warnings=["A warning"],
            assumptions=["An assumption"],
        )

        readme_path = write_campaign_readme(output_dir, "Test intent", result)

        assert readme_path.exists()
        content = readme_path.read_text()
        assert "# Campaign Builder Output" in content
        assert "Test intent" in content
        assert "**Files found:** 3" in content  # Markdown formatting
        assert "A warning" in content
        assert "An assumption" in content


class TestWriteParameterManifest:
    """Tests for write_parameter_manifest function."""

    def test_manifest_generation(self, temp_workspace, output_dir):
        """Test manifest.json generation."""
        result = CampaignBuilderResult(
            success=True,
            intent="Test",
            workspace=temp_workspace,
            files_found=3,
            files_analyzed=3,
            file_guides=[],
            analysis_errors=[],
            campaign_plan=None,
            generated_files=[],
            parameter_manifest={
                "temp": ParameterSource(
                    parameter_name="temp",
                    value=300,
                    source_file="/test.csv",
                )
            },
            output_directory=output_dir,
            validation_summary="OK",
            readme_path=None,
            manifest_path=None,
            total_duration_ms=100,
            analysis_duration_ms=50,
            planning_duration_ms=50,
            errors=[],
            warnings=[],
            assumptions=[],
        )

        manifest_path = write_parameter_manifest(output_dir, result)

        assert manifest_path.exists()
        import json
        with open(manifest_path) as f:
            manifest = json.load(f)

        assert manifest["success"] is True
        assert "parameters" in manifest
        assert "temp" in manifest["parameters"]


# =============================================================================
# Failed Result Tests
# =============================================================================


class TestCreateFailedResult:
    """Tests for create_failed_result function."""

    def test_failed_result(self, temp_workspace, output_dir, error_handler):
        """Test failed result creation."""
        error_handler.add(
            CampaignError(
                code=ErrorCode.E101_FILE_NOT_FOUND,
                severity=ErrorSeverity.FATAL,
                message="Workspace not found",
            )
        )

        result = create_failed_result(
            error_handler,
            temp_workspace,
            "Test intent",
            output_dir,
            duration_ms=100,
        )

        assert not result.success
        assert result.files_found == 0
        assert result.files_analyzed == 0
        assert len(result.errors) == 1
        assert result.validation_summary == "Pipeline failed before validation"


class TestCreatePartialSuccessReport:
    """Tests for create_partial_success_report function."""

    def test_partial_report(self, temp_workspace, output_dir):
        """Test partial success report generation."""
        result = CampaignBuilderResult(
            success=True,
            intent="Test",
            workspace=temp_workspace,
            files_found=5,
            files_analyzed=3,
            file_guides=[],
            analysis_errors=[
                CampaignError.file_not_found("/test1.data"),
                CampaignError.file_unreadable("/test2.data", "Permission denied"),
            ],
            campaign_plan=None,
            generated_files=[],
            parameter_manifest={},
            output_directory=output_dir,
            validation_summary="Partial",
            readme_path=None,
            manifest_path=None,
            total_duration_ms=100,
            analysis_duration_ms=50,
            planning_duration_ms=50,
            errors=[],
            warnings=["Warning 1"],
            assumptions=["Assumption 1"],
        )

        report = create_partial_success_report(result)

        assert "Partial Success Report" in report
        assert "3/5" in report
        assert "test1.data" in report
        assert "Suggestion:" in report


# =============================================================================
# Pipeline Integration Tests
# =============================================================================


class TestRunCampaignBuilder:
    """Tests for run_campaign_builder function."""

    @pytest.mark.asyncio
    async def test_pipeline_with_valid_workspace(self, temp_workspace, output_dir):
        """Test pipeline execution with valid workspace."""
        result = await run_campaign_builder(
            intent="Test simulation campaign",
            workspace=temp_workspace,
            output_dir=output_dir,
        )

        assert result.success
        assert result.files_found == 3
        assert result.files_analyzed == 3
        assert result.readme_path is not None
        assert result.manifest_path is not None
        assert result.readme_path.exists()
        assert result.manifest_path.exists()

    @pytest.mark.asyncio
    async def test_pipeline_with_empty_workspace(self, empty_workspace, output_dir):
        """Test pipeline execution with empty workspace."""
        result = await run_campaign_builder(
            intent="Empty test",
            workspace=empty_workspace,
            output_dir=output_dir,
        )

        assert result.success  # Empty workspace is not a failure
        assert result.files_found == 0
        assert result.files_analyzed == 0
        assert "No files found" in result.warnings[0]

    @pytest.mark.asyncio
    async def test_pipeline_with_nonexistent_workspace(self, output_dir):
        """Test pipeline execution with non-existent workspace."""
        result = await run_campaign_builder(
            intent="Invalid test",
            workspace=Path("/nonexistent/workspace"),
            output_dir=output_dir,
        )

        assert not result.success
        assert len(result.errors) > 0

    @pytest.mark.asyncio
    async def test_pipeline_with_progress_callback(self, temp_workspace, output_dir):
        """Test pipeline execution with progress callback."""
        progress_stages: List[Tuple[str, float, str]] = []

        def progress_callback(stage: str, progress: float, message: str):
            progress_stages.append((stage, progress, message))

        result = await run_campaign_builder(
            intent="Test with progress",
            workspace=temp_workspace,
            output_dir=output_dir,
            progress_callback=progress_callback,
        )

        assert result.success

        # Check that all stages were reported
        stages = [s[0] for s in progress_stages]
        assert STAGE_DISCOVERING in stages
        assert STAGE_ANALYZING in stages
        assert STAGE_PLANNING in stages
        assert STAGE_VALIDATING in stages
        assert STAGE_FINALIZING in stages
        assert STAGE_COMPLETE in stages

    @pytest.mark.asyncio
    async def test_pipeline_timing(self, temp_workspace, output_dir):
        """Test that pipeline records timing information."""
        result = await run_campaign_builder(
            intent="Timing test",
            workspace=temp_workspace,
            output_dir=output_dir,
        )

        # Timing may be 0 for very fast operations
        assert result.total_duration_ms >= 0
        assert result.analysis_duration_ms >= 0
        assert result.planning_duration_ms >= 0
        # Check timing fields are set
        assert isinstance(result.total_duration_ms, int)
        assert isinstance(result.analysis_duration_ms, int)
        assert isinstance(result.planning_duration_ms, int)


class TestAnalyzeAllFiles:
    """Tests for analyze_all_files function."""

    @pytest.mark.asyncio
    async def test_parallel_analysis(self, temp_workspace, error_handler):
        """Test parallel file analysis."""
        files = list(temp_workspace.iterdir())
        file_guides = await analyze_all_files(files, error_handler)

        assert len(file_guides) == len(files)
        assert not error_handler.has_errors()

        # Check each file was analyzed
        for fg in file_guides:
            assert fg.file_path
            assert fg.sha256_hash
            assert fg.file_type

    @pytest.mark.asyncio
    async def test_analysis_with_progress(self, temp_workspace, error_handler):
        """Test analysis with progress callback."""
        progress_updates = []

        def callback(stage, progress, message):
            progress_updates.append((stage, progress, message))

        files = list(temp_workspace.iterdir())
        await analyze_all_files(files, error_handler, callback, max_concurrent=2)

        assert len(progress_updates) == len(files)
        # Progress should be increasing
        progresses = [p[1] for p in progress_updates]
        assert progresses == sorted(progresses)

    @pytest.mark.asyncio
    async def test_analysis_empty_list(self, error_handler):
        """Test analysis with empty file list."""
        file_guides = await analyze_all_files([], error_handler)
        assert file_guides == []
        assert not error_handler.has_errors()
