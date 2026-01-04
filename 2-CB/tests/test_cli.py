"""Tests for CLI interface."""

import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from campaign_builder.cli import (
    ConsoleProgressReporter,
    configure_logging,
    create_parser,
    display_errors,
    format_error,
    main,
    parse_validation_levels,
)
from campaign_builder.schemas.errors import CampaignError, ErrorCode, ErrorSeverity


class TestArgumentParsing:
    """Tests for CLI argument parsing."""

    def test_create_parser(self):
        """Test parser creation succeeds."""
        parser = create_parser()
        assert parser is not None
        assert parser.prog == 'campaign-builder'

    def test_analyze_subcommand_requires_workspace(self):
        """Test analyze subcommand requires workspace argument."""
        parser = create_parser()
        with pytest.raises(SystemExit):
            parser.parse_args(['analyze'])

    def test_analyze_subcommand_with_workspace(self):
        """Test analyze subcommand with workspace."""
        parser = create_parser()
        args = parser.parse_args(['analyze', '/some/path'])
        assert args.command == 'analyze'
        assert args.workspace == '/some/path'

    def test_analyze_subcommand_options(self):
        """Test analyze subcommand options."""
        parser = create_parser()
        args = parser.parse_args([
            'analyze', '/path',
            '--include', '*.data',
            '--include', '*.in',
            '--exclude', '*.pyc',
            '--max-concurrent', '3',
            '--timeout', '60',
            '--output', 'guides.json'
        ])
        assert args.include_patterns == ['*.data', '*.in']
        assert args.exclude_patterns == ['*.pyc']
        assert args.max_concurrent == 3
        assert args.timeout == 60
        assert args.output == 'guides.json'

    def test_generate_subcommand_requires_intent(self):
        """Test generate subcommand requires intent argument."""
        parser = create_parser()
        with pytest.raises(SystemExit):
            parser.parse_args(['generate', '/path'])

    def test_generate_subcommand_with_intent(self):
        """Test generate subcommand with intent."""
        parser = create_parser()
        args = parser.parse_args(['generate', '/path', 'run equilibration'])
        assert args.command == 'generate'
        assert args.workspace == '/path'
        assert args.intent == 'run equilibration'

    def test_generate_subcommand_options(self):
        """Test generate subcommand options."""
        parser = create_parser()
        args = parser.parse_args([
            'generate', '/path', 'run NVT',
            '--output-dir', '/output',
            '--no-validate',
            '--no-repair',
            '--max-repair-attempts', '5',
            '--file-guides', 'guides.json'
        ])
        assert args.output_dir == '/output'
        assert args.no_validate is True
        assert args.no_repair is True
        assert args.max_repair_attempts == 5
        assert args.file_guides == 'guides.json'

    def test_validate_subcommand_requires_file(self):
        """Test validate subcommand requires file argument."""
        parser = create_parser()
        with pytest.raises(SystemExit):
            parser.parse_args(['validate'])

    def test_validate_subcommand_with_file(self):
        """Test validate subcommand with file."""
        parser = create_parser()
        args = parser.parse_args(['validate', '/path/input.in'])
        assert args.command == 'validate'
        assert args.file == '/path/input.in'

    def test_validate_subcommand_options(self):
        """Test validate subcommand options."""
        parser = create_parser()
        args = parser.parse_args([
            'validate', '/path/input.in',
            '--level', 'L0,L1',
            '--engine', 'lammps',
            '--strict'
        ])
        assert args.level == 'L0,L1'
        assert args.engine == 'lammps'
        assert args.strict is True

    def test_global_options(self):
        """Test global options."""
        parser = create_parser()

        # Verbose
        args = parser.parse_args(['-v', 'analyze', '/path'])
        assert args.verbose == 1

        args = parser.parse_args(['-vv', 'analyze', '/path'])
        assert args.verbose == 2

        # Quiet
        args = parser.parse_args(['-q', 'analyze', '/path'])
        assert args.quiet is True

        # JSON
        args = parser.parse_args(['--json', 'analyze', '/path'])
        assert args.json is True


class TestValidationLevelParsing:
    """Tests for validation level parsing."""

    def test_parse_all(self):
        """Test parsing 'all'."""
        levels = parse_validation_levels('all')
        assert levels == ['L0', 'L1', 'L2', 'L3']

    def test_parse_single_level(self):
        """Test parsing single level."""
        assert parse_validation_levels('L0') == ['L0']
        assert parse_validation_levels('L1') == ['L1']
        assert parse_validation_levels('L2') == ['L2']
        assert parse_validation_levels('L3') == ['L3']

    def test_parse_multiple_levels(self):
        """Test parsing multiple levels."""
        levels = parse_validation_levels('L0,L1,L2')
        assert levels == ['L0', 'L1', 'L2']

    def test_parse_case_insensitive(self):
        """Test case insensitive parsing."""
        levels = parse_validation_levels('l0,l1')
        assert levels == ['L0', 'L1']

    def test_parse_invalid_returns_all(self):
        """Test invalid input returns all levels."""
        levels = parse_validation_levels('invalid')
        assert levels == ['L0', 'L1', 'L2', 'L3']


class TestErrorFormatting:
    """Tests for error formatting."""

    def test_format_simple_error(self):
        """Test formatting simple error."""
        error = CampaignError(
            code=ErrorCode.E101_FILE_NOT_FOUND,
            severity=ErrorSeverity.ERROR,
            message="File not found"
        )
        formatted = format_error(error)
        assert "E101" in formatted
        assert "File not found" in formatted

    def test_format_error_with_file_path(self):
        """Test formatting error with file path."""
        error = CampaignError(
            code=ErrorCode.E101_FILE_NOT_FOUND,
            severity=ErrorSeverity.ERROR,
            message="File not found",
            file_path="/path/to/file.data"
        )
        formatted = format_error(error)
        assert "/path/to/file.data" in formatted

    def test_format_error_with_suggestion(self):
        """Test formatting error with suggestion."""
        error = CampaignError(
            code=ErrorCode.E101_FILE_NOT_FOUND,
            severity=ErrorSeverity.ERROR,
            message="File not found",
            suggestion="Check the file path"
        )
        formatted = format_error(error)
        assert "Suggestion:" in formatted
        assert "Check the file path" in formatted


class TestConsoleProgressReporter:
    """Tests for ConsoleProgressReporter."""

    def test_reporter_init(self):
        """Test reporter initialization."""
        reporter = ConsoleProgressReporter(quiet=False)
        assert reporter.quiet is False
        assert reporter.total == 0
        assert reporter.current == 0

    def test_reporter_quiet_mode(self, capsys):
        """Test reporter in quiet mode."""
        reporter = ConsoleProgressReporter(quiet=True)
        reporter.start(10, "Test")
        reporter.update(5, "Progress")
        reporter.finish("Done")

        captured = capsys.readouterr()
        assert captured.out == ""  # No output in quiet mode

    def test_reporter_normal_mode(self, capsys):
        """Test reporter in normal mode."""
        reporter = ConsoleProgressReporter(quiet=False)
        reporter.start(10, "Test")

        captured = capsys.readouterr()
        assert "[0/10]" in captured.out
        assert "Test" in captured.out

    def test_reporter_callback(self, capsys):
        """Test reporter as callback."""
        reporter = ConsoleProgressReporter(quiet=False)
        reporter("analyzing", 0.5, "Processing files")

        captured = capsys.readouterr()
        assert "[analyzing]" in captured.out
        assert "50%" in captured.out


class TestConfigureLogging:
    """Tests for logging configuration."""

    def test_quiet_mode_sets_error_level(self):
        """Test quiet mode sets ERROR level."""
        import logging
        configure_logging(verbosity=0, quiet=True)
        assert logging.getLogger().level == logging.ERROR

    def test_default_sets_warning_level(self):
        """Test default sets WARNING level."""
        import logging
        configure_logging(verbosity=0, quiet=False)
        assert logging.getLogger().level == logging.WARNING

    def test_verbose_sets_info_level(self):
        """Test -v sets INFO level."""
        import logging
        configure_logging(verbosity=1, quiet=False)
        assert logging.getLogger().level == logging.INFO

    def test_very_verbose_sets_debug_level(self):
        """Test -vv sets DEBUG level."""
        import logging
        configure_logging(verbosity=2, quiet=False)
        assert logging.getLogger().level == logging.DEBUG


class TestAnalyzeCommand:
    """Tests for analyze subcommand."""

    @pytest.mark.asyncio
    async def test_analyze_nonexistent_workspace(self, tmp_path, capsys):
        """Test analyze with nonexistent workspace."""
        from campaign_builder.cli import run_analyze

        # Create mock args
        args = MagicMock()
        args.workspace = str(tmp_path / "nonexistent")
        args.quiet = False
        args.json = False

        result = await run_analyze(args)

        assert result == 1
        captured = capsys.readouterr()
        assert "does not exist" in captured.err

    @pytest.mark.asyncio
    async def test_analyze_not_a_directory(self, tmp_path, capsys):
        """Test analyze with file instead of directory."""
        from campaign_builder.cli import run_analyze

        # Create a file
        test_file = tmp_path / "file.txt"
        test_file.write_text("content")

        args = MagicMock()
        args.workspace = str(test_file)
        args.quiet = False
        args.json = False

        result = await run_analyze(args)

        assert result == 1
        captured = capsys.readouterr()
        assert "not a directory" in captured.err


class TestValidateCommand:
    """Tests for validate subcommand."""

    @pytest.mark.asyncio
    async def test_validate_nonexistent_file(self, capsys):
        """Test validate with nonexistent file."""
        from campaign_builder.cli import run_validate

        args = MagicMock()
        args.file = "/nonexistent/file.in"
        args.json = False

        result = await run_validate(args)

        assert result == 1
        captured = capsys.readouterr()
        assert "does not exist" in captured.err

    @pytest.mark.asyncio
    async def test_validate_not_a_file(self, tmp_path, capsys):
        """Test validate with directory instead of file."""
        from campaign_builder.cli import run_validate

        args = MagicMock()
        args.file = str(tmp_path)  # Directory, not file
        args.json = False

        result = await run_validate(args)

        assert result == 1
        captured = capsys.readouterr()
        assert "not a file" in captured.err


class TestGenerateCommand:
    """Tests for generate subcommand."""

    @pytest.mark.asyncio
    async def test_generate_nonexistent_workspace(self, tmp_path, capsys):
        """Test generate with nonexistent workspace."""
        from campaign_builder.cli import run_generate

        args = MagicMock()
        args.workspace = str(tmp_path / "nonexistent")
        args.intent = "run simulation"
        args.output_dir = None
        args.quiet = False
        args.json = False

        result = await run_generate(args)

        assert result == 1
        captured = capsys.readouterr()
        assert "does not exist" in captured.err

    @pytest.mark.asyncio
    async def test_generate_empty_intent(self, tmp_path, capsys):
        """Test generate with empty intent."""
        from campaign_builder.cli import run_generate

        args = MagicMock()
        args.workspace = str(tmp_path)
        args.intent = ""
        args.output_dir = None
        args.quiet = False
        args.json = False

        result = await run_generate(args)

        assert result == 3  # Configuration error
        captured = capsys.readouterr()
        assert "empty" in captured.err.lower()

    @pytest.mark.asyncio
    async def test_generate_short_intent_warning(self, tmp_path, capsys):
        """Test generate warns on short intent."""
        from campaign_builder.cli import run_generate

        args = MagicMock()
        args.workspace = str(tmp_path)
        args.intent = "run"  # Very short
        args.output_dir = None
        args.quiet = False
        args.json = False
        args.file_guides = None

        # This will fail at import, but we check for the warning
        try:
            await run_generate(args)
        except Exception:
            pass

        captured = capsys.readouterr()
        assert "short" in captured.err.lower()
