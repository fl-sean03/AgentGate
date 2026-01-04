"""
Tests for Campaign Builder validation tools.

Tests cover:
    - L0: Placeholder detection
    - L1: LAMMPS and QE syntax validation
    - L2: Engine execution (with mocking)
    - L3: Physical reasonableness checks
    - Unified validator
"""

import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from campaign_builder.tools.validation import (
    # L0
    L0Result,
    validate_l0,
    validate_l0_content,
    format_l0_report,
    PLACEHOLDER_PATTERNS,
    # L1 LAMMPS
    L1LAMMPSResult,
    validate_l1_lammps,
    validate_l1_lammps_content,
    parse_lammps_commands,
    REQUIRED_COMMANDS,
    # L1 QE
    L1QEResult,
    validate_l1_qe,
    validate_l1_qe_content,
    parse_qe_namelists,
    parse_qe_cards,
    REQUIRED_NAMELISTS,
    REQUIRED_CARDS,
    # L2
    L2Result,
    validate_l2,
    find_lammps_binary,
    find_qe_binary,
    # L3
    L3Result,
    validate_l3,
    validate_l3_content,
    PhysicsCheck,
    # Unified
    ValidationResult,
    validate_deck,
    validate_deck_content,
    format_validation_report,
)


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def valid_lammps_content():
    """Valid LAMMPS input file content."""
    return """# LAMMPS input file for testing
units real
atom_style full
boundary p p p

read_data structure.data

pair_style lj/cut 10.0
pair_coeff 1 1 0.1 3.4

timestep 1.0

fix 1 all nvt temp 300.0 300.0 100.0

thermo 100
run 1000
"""


@pytest.fixture
def invalid_lammps_content():
    """Invalid LAMMPS input file content (missing required commands)."""
    return """# LAMMPS input file with errors
# Missing units command
atom_style full

pair_coeff 1 1 0.1 3.4  # pair_coeff before pair_style

timestep 1.0
run 1000
"""


@pytest.fixture
def lammps_with_placeholders():
    """LAMMPS content with placeholders."""
    return """# LAMMPS input file with placeholders
units real
atom_style full
boundary p p p

read_data {{structure_file}}

pair_style lj/cut ${CUTOFF}
pair_coeff 1 1 <EPSILON> <SIGMA>

timestep TODO: set appropriate value
fix 1 all nvt temp ??? ??? 100.0

# XXX: Need to add more fixes
run 1000
"""


@pytest.fixture
def valid_qe_content():
    """Valid QE input file content."""
    return """&CONTROL
   calculation = 'scf'
   prefix = 'test'
   outdir = './tmp'
   pseudo_dir = './pseudo'
/
&SYSTEM
   nat = 2
   ntyp = 1
   ecutwfc = 50.0
   ecutrho = 400.0
   ibrav = 2
   celldm(1) = 10.0
/
&ELECTRONS
   conv_thr = 1.0d-8
/
ATOMIC_SPECIES
Si 28.0855 Si.pbe-n-kjpaw.UPF

ATOMIC_POSITIONS (crystal)
Si 0.0 0.0 0.0
Si 0.25 0.25 0.25

K_POINTS (automatic)
4 4 4 1 1 1
"""


@pytest.fixture
def invalid_qe_content():
    """Invalid QE content (missing required elements)."""
    return """&CONTROL
   calculation = 'scf'
/
&SYSTEM
   nat = 3
   ntyp = 1
   ecutwfc = 50.0
/
&ELECTRONS
/
ATOMIC_SPECIES
Si 28.0855 Si.pbe-n-kjpaw.UPF

ATOMIC_POSITIONS (crystal)
Si 0.0 0.0 0.0
Si 0.25 0.25 0.25

K_POINTS (automatic)
4 4 4 1 1 1
"""


# =============================================================================
# L0 Validation Tests
# =============================================================================


class TestL0Validation:
    """Tests for L0 placeholder detection."""

    def test_clean_content_passes(self, valid_lammps_content):
        """Clean content should pass L0."""
        result = validate_l0_content(valid_lammps_content)
        assert result.passed is True
        assert result.total_placeholders == 0
        assert len(result.placeholders) == 0

    def test_detects_handlebars(self):
        """Should detect {{variable}} placeholders."""
        content = "read_data {{structure_file}}"
        result = validate_l0_content(content)
        assert result.passed is False
        assert result.total_placeholders == 1
        assert result.placeholders[0]["pattern"] == "handlebars"

    def test_detects_shell_vars(self):
        """Should detect ${VAR} placeholders."""
        content = "pair_style lj/cut ${CUTOFF}"
        result = validate_l0_content(content)
        assert result.passed is False
        assert result.total_placeholders == 1
        assert result.placeholders[0]["pattern"] == "shell_var"

    def test_detects_angle_brackets(self):
        """Should detect <PLACEHOLDER> patterns."""
        content = "pair_coeff 1 1 <EPSILON> <SIGMA>"
        result = validate_l0_content(content)
        assert result.passed is False
        assert result.total_placeholders == 2

    def test_detects_todo_markers(self):
        """Should detect TODO markers."""
        content = "timestep TODO: set value"
        result = validate_l0_content(content)
        assert result.passed is False
        assert any(p["pattern"] == "todo" for p in result.placeholders)

    def test_detects_fixme_markers(self):
        """Should detect FIXME markers."""
        content = "# FIXME: this is broken"
        result = validate_l0_content(content)
        assert result.passed is False
        assert any(p["pattern"] == "fixme" for p in result.placeholders)

    def test_detects_xxx_markers(self):
        """Should detect XXX markers."""
        content = "# XXX: needs attention"
        result = validate_l0_content(content)
        assert result.passed is False
        assert any(p["pattern"] == "xxx" for p in result.placeholders)

    def test_detects_question_marks(self):
        """Should detect ??? placeholders."""
        content = "fix 1 all nvt temp ??? ??? 100.0"
        result = validate_l0_content(content)
        assert result.passed is False
        assert any(p["pattern"] == "question_marks" for p in result.placeholders)

    def test_detects_underscore_fills(self):
        """Should detect _____ placeholders."""
        content = "pair_coeff 1 1 _______ 3.4"
        result = validate_l0_content(content)
        assert result.passed is False
        assert any(p["pattern"] == "underscore_fill" for p in result.placeholders)

    def test_multiple_placeholders(self, lammps_with_placeholders):
        """Should detect all placeholders in content."""
        result = validate_l0_content(lammps_with_placeholders)
        assert result.passed is False
        assert result.total_placeholders >= 5  # Multiple types

    def test_validate_file(self, tmp_path, valid_lammps_content):
        """Should validate file from path."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(valid_lammps_content)

        result = validate_l0(test_file)
        assert result.passed is True

    def test_file_not_found(self):
        """Should handle missing file."""
        result = validate_l0(Path("/nonexistent/file.lmp"))
        assert result.passed is False
        assert result.error is not None
        assert "not found" in result.error.lower()

    def test_format_report(self, lammps_with_placeholders):
        """Should format report correctly."""
        result = validate_l0_content(lammps_with_placeholders)
        report = format_l0_report(result)

        assert "L0 Validation: FAILED" in report
        assert "Placeholders found:" in report


# =============================================================================
# L1 LAMMPS Validation Tests
# =============================================================================


class TestL1LAMMPSValidation:
    """Tests for L1 LAMMPS syntax validation."""

    def test_valid_content_passes(self, valid_lammps_content):
        """Valid LAMMPS content should pass."""
        result = validate_l1_lammps_content(valid_lammps_content)
        assert result.passed is True
        assert len(result.errors) == 0

    def test_missing_units_detected(self):
        """Should detect missing units command."""
        content = """
atom_style full
read_data structure.data
pair_style lj/cut 10.0
pair_coeff 1 1 0.1 3.4
run 1000
"""
        result = validate_l1_lammps_content(content)
        assert result.passed is False
        assert any("MISSING_UNITS" in e["code"] for e in result.errors)

    def test_missing_atom_style_detected(self):
        """Should detect missing atom_style command."""
        content = """
units real
read_data structure.data
pair_style lj/cut 10.0
pair_coeff 1 1 0.1 3.4
run 1000
"""
        result = validate_l1_lammps_content(content)
        assert result.passed is False
        assert any("MISSING_ATOM_STYLE" in e["code"] for e in result.errors)

    def test_pair_style_order(self):
        """Should detect pair_coeff before pair_style."""
        content = """
units real
atom_style full
read_data structure.data
pair_coeff 1 1 0.1 3.4
pair_style lj/cut 10.0
run 1000
"""
        result = validate_l1_lammps_content(content)
        assert result.passed is False
        assert any("ORDER" in e["code"] for e in result.errors)

    def test_missing_run_warning(self, valid_lammps_content):
        """Should warn about missing run command."""
        content = valid_lammps_content.replace("run 1000", "")
        result = validate_l1_lammps_content(content)
        # This is a warning, not error
        assert any("NO_RUN" in w["code"] for w in result.warnings)

    def test_parse_lammps_commands(self, valid_lammps_content):
        """Should parse LAMMPS commands correctly."""
        commands = parse_lammps_commands(valid_lammps_content)

        cmd_names = [c.name for c in commands]
        assert "units" in cmd_names
        assert "atom_style" in cmd_names
        assert "read_data" in cmd_names
        assert "pair_style" in cmd_names
        assert "run" in cmd_names

    def test_commands_found_list(self, valid_lammps_content):
        """Should list found commands."""
        result = validate_l1_lammps_content(valid_lammps_content)
        assert "units" in result.commands_found
        assert "atom_style" in result.commands_found
        assert "run" in result.commands_found

    def test_validate_file(self, tmp_path, valid_lammps_content):
        """Should validate file from path."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(valid_lammps_content)

        result = validate_l1_lammps(test_file)
        assert result.passed is True

    def test_file_not_found(self):
        """Should handle missing file."""
        result = validate_l1_lammps(Path("/nonexistent/file.lmp"))
        assert result.passed is False
        assert any("FILE_NOT_FOUND" in e["code"] for e in result.errors)


# =============================================================================
# L1 QE Validation Tests
# =============================================================================


class TestL1QEValidation:
    """Tests for L1 QE syntax validation."""

    def test_valid_content_passes(self, valid_qe_content):
        """Valid QE content should pass."""
        result = validate_l1_qe_content(valid_qe_content)
        assert result.passed is True
        assert len(result.errors) == 0

    def test_missing_control_detected(self):
        """Should detect missing &CONTROL namelist."""
        content = """
&SYSTEM
   nat = 2
   ntyp = 1
   ecutwfc = 50.0
/
&ELECTRONS
/
ATOMIC_SPECIES
Si 28.0855 Si.pbe-n-kjpaw.UPF

ATOMIC_POSITIONS (crystal)
Si 0.0 0.0 0.0
Si 0.25 0.25 0.25

K_POINTS (automatic)
4 4 4 1 1 1
"""
        result = validate_l1_qe_content(content)
        assert result.passed is False
        assert any("MISSING_CONTROL" in e["code"] for e in result.errors)

    def test_nat_mismatch_detected(self, invalid_qe_content):
        """Should detect nat/ATOMIC_POSITIONS mismatch."""
        result = validate_l1_qe_content(invalid_qe_content)
        assert result.passed is False
        assert any("NAT_MISMATCH" in e["code"] for e in result.errors)

    def test_missing_ecutwfc_detected(self):
        """Should detect missing ecutwfc."""
        content = """
&CONTROL
/
&SYSTEM
   nat = 2
   ntyp = 1
/
&ELECTRONS
/
ATOMIC_SPECIES
Si 28.0855 Si.pbe-n-kjpaw.UPF

ATOMIC_POSITIONS
Si 0.0 0.0 0.0
Si 0.25 0.25 0.25

K_POINTS automatic
4 4 4 1 1 1
"""
        result = validate_l1_qe_content(content)
        assert result.passed is False
        assert any("MISSING_ECUTWFC" in e["code"] for e in result.errors)

    def test_parse_namelists(self, valid_qe_content):
        """Should parse namelists correctly."""
        namelists, lines = parse_qe_namelists(valid_qe_content)

        assert "CONTROL" in namelists
        assert "SYSTEM" in namelists
        assert "ELECTRONS" in namelists
        assert namelists["SYSTEM"]["nat"] == "2"
        assert namelists["SYSTEM"]["ecutwfc"] == "50.0"

    def test_parse_cards(self, valid_qe_content):
        """Should parse cards correctly."""
        cards, lines = parse_qe_cards(valid_qe_content)

        assert "ATOMIC_SPECIES" in cards
        assert "ATOMIC_POSITIONS" in cards
        assert "K_POINTS" in cards
        # Count non-empty lines in ATOMIC_POSITIONS
        position_count = len([l for l in cards["ATOMIC_POSITIONS"] if l.strip()])
        assert position_count == 2  # Two atoms

    def test_namelists_found_list(self, valid_qe_content):
        """Should list found namelists."""
        result = validate_l1_qe_content(valid_qe_content)
        assert "CONTROL" in result.namelists_found
        assert "SYSTEM" in result.namelists_found

    def test_cards_found_list(self, valid_qe_content):
        """Should list found cards."""
        result = validate_l1_qe_content(valid_qe_content)
        assert "ATOMIC_SPECIES" in result.cards_found
        assert "ATOMIC_POSITIONS" in result.cards_found
        assert "K_POINTS" in result.cards_found

    def test_validate_file(self, tmp_path, valid_qe_content):
        """Should validate file from path."""
        test_file = tmp_path / "test.pwi"
        test_file.write_text(valid_qe_content)

        result = validate_l1_qe(test_file)
        assert result.passed is True


# =============================================================================
# L2 Engine Validation Tests
# =============================================================================


class TestL2Validation:
    """Tests for L2 engine validation."""

    def test_handles_missing_lammps_gracefully(self, tmp_path, valid_lammps_content):
        """Should skip gracefully if LAMMPS not available."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(valid_lammps_content)

        # Mock find_lammps_binary to return None
        with patch(
            "campaign_builder.tools.validation.l2_engine.find_lammps_binary",
            return_value=None,
        ):
            result = validate_l2(test_file, engine="lammps")

        assert result.skipped is True
        assert result.passed is True  # Skipped means pass
        assert "not found" in result.skip_reason.lower()

    def test_handles_missing_qe_gracefully(self, tmp_path, valid_qe_content):
        """Should skip gracefully if QE not available."""
        test_file = tmp_path / "test.pwi"
        test_file.write_text(valid_qe_content)

        with patch(
            "campaign_builder.tools.validation.l2_engine.find_qe_binary",
            return_value=None,
        ):
            result = validate_l2(test_file, engine="qe")

        assert result.skipped is True
        assert result.passed is True

    def test_unknown_engine(self, tmp_path, valid_lammps_content):
        """Should handle unknown engine."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(valid_lammps_content)

        result = validate_l2(test_file, engine="unknown")
        assert result.skipped is True
        assert "Unknown engine" in result.skip_reason

    def test_file_not_found(self):
        """Should handle missing input file."""
        result = validate_l2(Path("/nonexistent/file.lmp"), engine="lammps")
        assert result.passed is False or result.skipped

    @pytest.mark.skipif(
        not find_lammps_binary(),
        reason="LAMMPS not available"
    )
    def test_lammps_execution(self, tmp_path, valid_lammps_content):
        """Test actual LAMMPS execution (if available)."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(valid_lammps_content)

        # Create dummy structure file
        data_file = tmp_path / "structure.data"
        data_file.write_text("""# LAMMPS data file

2 atoms
1 atom types

0.0 10.0 xlo xhi
0.0 10.0 ylo yhi
0.0 10.0 zlo zhi

Masses

1 1.0

Atoms

1 1 1 0.0 0.0 0.0 0.0
2 1 1 0.0 5.0 5.0 5.0
""")

        result = validate_l2(test_file, engine="lammps")
        # Engine may report errors due to missing structure file
        assert result.engine == "lammps"
        assert result.skipped is False


# =============================================================================
# L3 Physics Validation Tests
# =============================================================================


class TestL3Validation:
    """Tests for L3 physics validation."""

    def test_always_passes(self, valid_lammps_content):
        """L3 is advisory, should always pass."""
        result = validate_l3_content(valid_lammps_content, "lammps")
        assert result.passed is True

    def test_detects_high_temperature(self):
        """Should warn about very high temperatures."""
        content = """
units real
atom_style full
read_data structure.data
pair_style lj/cut 10.0
pair_coeff 1 1 0.1 3.4
timestep 1.0
fix 1 all nvt temp 50000.0 50000.0 100.0
run 1000
"""
        result = validate_l3_content(content, "lammps")
        assert any(
            "temperature" in c["name"].lower()
            for c in result.physics_checks
            if not c["passed"]
        )

    def test_detects_large_timestep(self):
        """Should warn about large timestep."""
        content = """
units real
atom_style full
read_data structure.data
pair_style lj/cut 10.0
pair_coeff 1 1 0.1 3.4
timestep 100.0
fix 1 all nvt temp 300.0 300.0 100.0
run 1000
"""
        result = validate_l3_content(content, "lammps")
        # Check for timestep warning
        timestep_checks = [c for c in result.physics_checks if "timestep" in c["name"]]
        if timestep_checks:
            assert not timestep_checks[0]["passed"]

    def test_qe_low_ecutwfc_warning(self):
        """Should warn about low ecutwfc."""
        content = """
&CONTROL
   calculation = 'scf'
/
&SYSTEM
   nat = 2
   ntyp = 1
   ecutwfc = 5.0
/
&ELECTRONS
/
"""
        result = validate_l3_content(content, "qe")
        assert any(
            "ecutwfc" in c["name"] and not c["passed"]
            for c in result.physics_checks
        )

    def test_physics_checks_list(self, valid_lammps_content):
        """Should return list of physics checks."""
        result = validate_l3_content(valid_lammps_content, "lammps")
        assert result.checks_run > 0
        assert len(result.physics_checks) > 0

    def test_validate_file(self, tmp_path, valid_lammps_content):
        """Should validate file from path."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(valid_lammps_content)

        result = validate_l3(test_file, engine="lammps")
        assert result.passed is True

    def test_auto_detect_engine(self, tmp_path, valid_lammps_content):
        """Should auto-detect engine from content."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(valid_lammps_content)

        result = validate_l3(test_file)  # No engine specified
        assert result.checks_run > 0


# =============================================================================
# Unified Validator Tests
# =============================================================================


class TestUnifiedValidator:
    """Tests for unified validate_deck function."""

    def test_all_levels_valid_content(self, tmp_path, valid_lammps_content):
        """Should pass all levels for valid content."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(valid_lammps_content)

        # Skip L2 since engine may not be available
        result = validate_deck(test_file, engine="lammps", levels=["L0", "L1", "L3"])

        assert result.can_run is True
        assert result.l0 is not None
        assert result.l0.passed is True
        assert result.l1 is not None
        assert result.l1.passed is True

    def test_stops_on_l0_failure(self, tmp_path, lammps_with_placeholders):
        """Should stop if L0 fails."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(lammps_with_placeholders)

        result = validate_deck(test_file, engine="lammps")

        assert result.can_run is False
        assert result.l0 is not None
        assert result.l0.passed is False
        # L1 should not be run since L0 failed (with stop_on_blocking_fail=True)

    def test_collects_all_issues(self, tmp_path, invalid_lammps_content):
        """Should collect issues from all levels."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(invalid_lammps_content)

        result = validate_deck(
            test_file,
            engine="lammps",
            levels=["L0", "L1"],
            stop_on_blocking_fail=False,
        )

        assert len(result.all_issues) > 0

    def test_generates_suggestions(self, tmp_path, invalid_lammps_content):
        """Should generate repair suggestions."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(invalid_lammps_content)

        result = validate_deck(
            test_file,
            engine="lammps",
            levels=["L0", "L1"],
            stop_on_blocking_fail=False,
        )

        assert len(result.suggestions) > 0

    def test_validate_content(self, valid_lammps_content):
        """Should validate content directly."""
        result = validate_deck_content(
            valid_lammps_content,
            engine="lammps",
            levels=["L0", "L1"],
        )

        assert result.can_run is True
        assert result.l0.passed is True
        assert result.l1.passed is True

    def test_levels_run_tracking(self, tmp_path, valid_lammps_content):
        """Should track which levels were run."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(valid_lammps_content)

        result = validate_deck(test_file, engine="lammps", levels=["L0", "L1"])

        assert "L0" in result.levels_run
        assert "L1" in result.levels_run

    def test_format_report(self, tmp_path, valid_lammps_content):
        """Should format validation report."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(valid_lammps_content)

        result = validate_deck(test_file, engine="lammps", levels=["L0", "L1"])
        report = format_validation_report(result)

        assert "Validation Report:" in report
        assert "PASSED" in report or "FAILED" in report


# =============================================================================
# Edge Case Tests
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_empty_file(self, tmp_path):
        """Should handle empty file."""
        test_file = tmp_path / "empty.lmp"
        test_file.write_text("")

        l0_result = validate_l0(test_file)
        assert l0_result.passed is True  # No placeholders in empty file

        l1_result = validate_l1_lammps(test_file)
        assert l1_result.passed is False  # Missing required commands

    def test_binary_file(self, tmp_path):
        """Should handle binary file gracefully."""
        test_file = tmp_path / "binary.lmp"
        test_file.write_bytes(b"\x00\x01\x02\x03\x04\x05")

        # Should not crash
        result = validate_l0(test_file)
        # May pass or fail depending on encoding handling

    def test_unicode_content(self, tmp_path):
        """Should handle unicode content."""
        content = """# LAMMPS with unicode
units real
atom_style full
# Temperature: 300 K (approximately 27 C)
# Energy: epsilon = 0.1 kcal/mol
read_data structure.data
pair_style lj/cut 10.0
pair_coeff 1 1 0.1 3.4
run 1000
"""
        test_file = tmp_path / "unicode.lmp"
        test_file.write_text(content, encoding="utf-8")

        result = validate_l1_lammps(test_file)
        assert result is not None

    def test_very_long_file(self, tmp_path):
        """Should handle very long file."""
        lines = ["units real", "atom_style full", "read_data structure.data"]
        for i in range(1000):
            lines.append(f"# Comment line {i}")
        lines.append("pair_style lj/cut 10.0")
        lines.append("pair_coeff 1 1 0.1 3.4")
        lines.append("run 1000")

        content = "\n".join(lines)
        test_file = tmp_path / "long.lmp"
        test_file.write_text(content)

        result = validate_l1_lammps(test_file)
        assert result.passed is True

    def test_line_continuation(self):
        """Should handle LAMMPS line continuation."""
        content = """
units real
atom_style full
read_data structure.data
pair_style lj/cut &
    10.0
pair_coeff 1 1 0.1 3.4
run 1000
"""
        result = validate_l1_lammps_content(content)
        assert "pair_style" in result.commands_found

    def test_inline_comments(self):
        """Should handle inline comments."""
        content = """
units real  # Use real units
atom_style full  # Use full atom style
read_data structure.data  # Load structure
pair_style lj/cut 10.0  # LJ potential
pair_coeff 1 1 0.1 3.4  # Coefficients
run 1000  # Run simulation
"""
        result = validate_l1_lammps_content(content)
        assert result.passed is True


# =============================================================================
# Integration Tests
# =============================================================================


class TestIntegration:
    """Integration tests for validation pipeline."""

    def test_full_validation_pipeline(self, tmp_path, valid_lammps_content):
        """Test complete validation pipeline."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(valid_lammps_content)

        # Run full validation (except L2 due to engine dependency)
        result = validate_deck(test_file, engine="lammps", levels=["L0", "L1", "L3"])

        # Verify all results present
        assert result.l0 is not None
        assert result.l1 is not None
        assert result.l3 is not None

        # Verify to_dict works
        result_dict = result.to_dict()
        assert "overall_passed" in result_dict
        assert "can_run" in result_dict
        assert "l0" in result_dict

    def test_qe_validation_pipeline(self, tmp_path, valid_qe_content):
        """Test QE validation pipeline."""
        test_file = tmp_path / "test.pwi"
        test_file.write_text(valid_qe_content)

        result = validate_deck(test_file, engine="qe", levels=["L0", "L1", "L3"])

        assert result.l0 is not None
        assert result.l0.passed is True
        assert result.l1 is not None
        assert result.l1.passed is True
        assert result.l3 is not None

    def test_auto_engine_detection_lammps(self, tmp_path, valid_lammps_content):
        """Should auto-detect LAMMPS from content."""
        test_file = tmp_path / "test.lmp"
        test_file.write_text(valid_lammps_content)

        result = validate_deck(test_file, levels=["L0", "L1"])

        assert result.engine == "lammps"

    def test_auto_engine_detection_qe(self, tmp_path, valid_qe_content):
        """Should auto-detect QE from content."""
        test_file = tmp_path / "test.pwi"
        test_file.write_text(valid_qe_content)

        result = validate_deck(test_file, levels=["L0", "L1"])

        assert result.engine == "qe"
