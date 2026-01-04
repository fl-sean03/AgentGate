"""
L3 Validation - Physical Reasonableness Checks.

This module provides L3 validation that checks physical reasonableness
of simulation settings. This catches issues that would run but produce
garbage results.

L3 is a NON-BLOCKING validation level (warnings only).

Usage:
    from campaign_builder.tools.validation.l3_physics import validate_l3, L3Result

    result = validate_l3(Path("input.lmp"), engine="lammps")
    for check in result.physics_checks:
        if not check['passed']:
            print(f"Warning: {check['name']}: {check['message']}")
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

# Optional import for FileGuide type hints
try:
    from campaign_builder.schemas import FileGuide, BoxDimensions
except ImportError:
    FileGuide = Any  # type: ignore
    BoxDimensions = Any  # type: ignore


# =============================================================================
# Constants
# =============================================================================

# Temperature ranges (Kelvin)
TEMPERATURE_MIN = 0.0
TEMPERATURE_MAX = 10000.0
TEMPERATURE_TYPICAL_MIN = 1.0
TEMPERATURE_TYPICAL_MAX = 5000.0

# Timestep ranges for different unit systems (femtoseconds equivalent)
TIMESTEP_RANGES = {
    "real": (0.1, 10.0),  # fs, typical 1-2 fs
    "metal": (0.0001, 0.01),  # ps, typical 1-2 fs
    "lj": (0.001, 0.05),  # reduced units
    "si": (1e-18, 1e-14),  # seconds
    "cgs": (1e-18, 1e-14),  # seconds
    "electron": (0.0001, 0.01),  # fs
    "micro": (0.1, 100.0),  # microseconds
    "nano": (0.01, 10.0),  # nanoseconds
}

# Cutoff ratio to minimum box dimension
MIN_CUTOFF_BOX_RATIO = 0.5  # cutoff should be < box/2 for PBC

# QE cutoff ranges (Ry)
ECUTWFC_MIN = 10.0
ECUTWFC_MAX = 200.0
ECUTWFC_TYPICAL_MIN = 20.0
ECUTWFC_TYPICAL_MAX = 100.0

# K-point density (k-points per reciprocal Angstrom)
KPOINT_DENSITY_MIN = 0.01


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class PhysicsCheck:
    """Result of a single physics check.

    Attributes:
        name: Check name
        passed: Whether the check passed
        value: The value that was checked (if applicable)
        expected_range: Expected range as string (if applicable)
        message: Detailed message about the check result
        severity: "warning" or "info"
    """

    name: str
    passed: bool
    value: Optional[Any] = None
    expected_range: Optional[str] = None
    message: str = ""
    severity: str = "warning"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        result = {
            "name": self.name,
            "passed": self.passed,
            "message": self.message,
            "severity": self.severity,
        }
        if self.value is not None:
            result["value"] = self.value
        if self.expected_range is not None:
            result["expected_range"] = self.expected_range
        return result


@dataclass
class L3Result:
    """Result of L3 physical reasonableness validation.

    Attributes:
        passed: Always True (L3 is advisory)
        warnings: List of warning-level issues
        info: List of info-level notes
        physics_checks: List of all physics checks performed
        checks_run: Number of checks performed
    """

    passed: bool = True  # L3 is always "passed" since it's advisory
    warnings: List[Dict[str, Any]] = field(default_factory=list)
    info: List[Dict[str, Any]] = field(default_factory=list)
    physics_checks: List[Dict[str, Any]] = field(default_factory=list)
    checks_run: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "passed": self.passed,
            "warnings": self.warnings,
            "info": self.info,
            "physics_checks": self.physics_checks,
            "checks_run": self.checks_run,
        }


# =============================================================================
# LAMMPS Physics Checks
# =============================================================================


def _parse_lammps_value(content: str, command: str, arg_index: int = 0) -> Optional[str]:
    """Parse a value from a LAMMPS command.

    Args:
        content: File content
        command: Command name to find
        arg_index: Which argument to return (0-indexed)

    Returns:
        The argument value or None
    """
    pattern = re.compile(rf"^\s*{command}\s+(.+?)(?:#.*)?$", re.MULTILINE | re.IGNORECASE)
    match = pattern.search(content)
    if match:
        args = match.group(1).split()
        if len(args) > arg_index:
            return args[arg_index]
    return None


def check_lammps_temperature(content: str) -> List[PhysicsCheck]:
    """Check temperature settings in LAMMPS input.

    Args:
        content: LAMMPS input content

    Returns:
        List of PhysicsCheck results
    """
    checks = []

    # Look for temperature in fix nvt/npt commands
    temp_pattern = re.compile(
        r"fix\s+\w+\s+\w+\s+(?:nvt|npt)\s+temp\s+([\d.e+-]+)\s+([\d.e+-]+)",
        re.IGNORECASE | re.MULTILINE,
    )

    for match in temp_pattern.finditer(content):
        try:
            t_start = float(match.group(1))
            t_end = float(match.group(2))

            # Check start temperature
            if t_start < TEMPERATURE_MIN:
                checks.append(
                    PhysicsCheck(
                        name="temperature_start",
                        passed=False,
                        value=t_start,
                        expected_range=f"> {TEMPERATURE_MIN} K",
                        message=f"Starting temperature {t_start} K is negative",
                        severity="warning",
                    )
                )
            elif t_start > TEMPERATURE_MAX:
                checks.append(
                    PhysicsCheck(
                        name="temperature_start",
                        passed=False,
                        value=t_start,
                        expected_range=f"< {TEMPERATURE_MAX} K",
                        message=f"Starting temperature {t_start} K is unusually high",
                        severity="warning",
                    )
                )
            else:
                checks.append(
                    PhysicsCheck(
                        name="temperature_start",
                        passed=True,
                        value=t_start,
                        message=f"Starting temperature {t_start} K is reasonable",
                        severity="info",
                    )
                )

            # Check end temperature
            if t_end < TEMPERATURE_MIN or t_end > TEMPERATURE_MAX:
                checks.append(
                    PhysicsCheck(
                        name="temperature_end",
                        passed=False,
                        value=t_end,
                        expected_range=f"{TEMPERATURE_MIN}-{TEMPERATURE_MAX} K",
                        message=f"Target temperature {t_end} K is outside normal range",
                        severity="warning",
                    )
                )

        except ValueError:
            pass

    return checks


def check_lammps_timestep(content: str) -> List[PhysicsCheck]:
    """Check timestep setting in LAMMPS input.

    Args:
        content: LAMMPS input content

    Returns:
        List of PhysicsCheck results
    """
    checks = []

    # Get units
    units = _parse_lammps_value(content, "units")
    if not units:
        units = "lj"  # Default

    # Get timestep
    timestep_str = _parse_lammps_value(content, "timestep")
    if timestep_str:
        try:
            timestep = float(timestep_str)

            if units in TIMESTEP_RANGES:
                min_dt, max_dt = TIMESTEP_RANGES[units]
                if timestep < min_dt:
                    checks.append(
                        PhysicsCheck(
                            name="timestep",
                            passed=False,
                            value=timestep,
                            expected_range=f"{min_dt}-{max_dt} ({units} units)",
                            message=f"Timestep {timestep} is unusually small for {units} units",
                            severity="info",
                        )
                    )
                elif timestep > max_dt:
                    checks.append(
                        PhysicsCheck(
                            name="timestep",
                            passed=False,
                            value=timestep,
                            expected_range=f"{min_dt}-{max_dt} ({units} units)",
                            message=f"Timestep {timestep} may be too large for {units} units",
                            severity="warning",
                        )
                    )
                else:
                    checks.append(
                        PhysicsCheck(
                            name="timestep",
                            passed=True,
                            value=timestep,
                            message=f"Timestep {timestep} is reasonable for {units} units",
                            severity="info",
                        )
                    )
        except ValueError:
            pass

    return checks


def check_lammps_cutoff_vs_box(
    content: str, box_dimensions: Optional[Any] = None
) -> List[PhysicsCheck]:
    """Check that cutoff is appropriate for box size.

    Args:
        content: LAMMPS input content
        box_dimensions: Optional BoxDimensions from FileGuide

    Returns:
        List of PhysicsCheck results
    """
    checks = []

    # Get cutoff from pair_style
    pair_style_pattern = re.compile(
        r"pair_style\s+\w+(?:/\w+)?\s+([\d.e+-]+)", re.IGNORECASE | re.MULTILINE
    )
    match = pair_style_pattern.search(content)

    if match and box_dimensions:
        try:
            cutoff = float(match.group(1))

            # Get minimum box dimension
            if hasattr(box_dimensions, "lx"):
                min_box = min(box_dimensions.lx, box_dimensions.ly, box_dimensions.lz)

                # Check cutoff vs box/2
                if cutoff > min_box / 2:
                    checks.append(
                        PhysicsCheck(
                            name="cutoff_vs_box",
                            passed=False,
                            value=cutoff,
                            expected_range=f"< {min_box/2:.2f} (half min box dim)",
                            message=f"Cutoff {cutoff} exceeds half the minimum box dimension ({min_box:.2f})",
                            severity="warning",
                        )
                    )
                elif cutoff > min_box / 2 * 0.9:
                    checks.append(
                        PhysicsCheck(
                            name="cutoff_vs_box",
                            passed=True,
                            value=cutoff,
                            message=f"Cutoff {cutoff} is close to half box size - consider increasing box",
                            severity="info",
                        )
                    )
                else:
                    checks.append(
                        PhysicsCheck(
                            name="cutoff_vs_box",
                            passed=True,
                            value=cutoff,
                            message=f"Cutoff {cutoff} is appropriate for box size",
                            severity="info",
                        )
                    )
        except (ValueError, AttributeError):
            pass

    return checks


def check_lammps_thermostat_damping(content: str) -> List[PhysicsCheck]:
    """Check thermostat damping parameters.

    Args:
        content: LAMMPS input content

    Returns:
        List of PhysicsCheck results
    """
    checks = []

    # Get timestep
    timestep_str = _parse_lammps_value(content, "timestep")
    if not timestep_str:
        return checks

    try:
        timestep = float(timestep_str)
    except ValueError:
        return checks

    # Look for Tdamp in fix nvt/npt
    damp_pattern = re.compile(
        r"fix\s+\w+\s+\w+\s+(?:nvt|npt)\s+.*?temp\s+[\d.e+-]+\s+[\d.e+-]+\s+([\d.e+-]+)",
        re.IGNORECASE | re.MULTILINE,
    )

    match = damp_pattern.search(content)
    if match:
        try:
            tdamp = float(match.group(1))
            ratio = tdamp / timestep if timestep > 0 else 0

            # Typical Tdamp is 100*timestep
            if ratio < 10:
                checks.append(
                    PhysicsCheck(
                        name="thermostat_damping",
                        passed=False,
                        value=tdamp,
                        expected_range=f"~100*timestep ({100*timestep:.4f})",
                        message=f"Thermostat damping {tdamp} is very tight (ratio: {ratio:.1f}x timestep)",
                        severity="warning",
                    )
                )
            elif ratio > 1000:
                checks.append(
                    PhysicsCheck(
                        name="thermostat_damping",
                        passed=False,
                        value=tdamp,
                        expected_range=f"~100*timestep ({100*timestep:.4f})",
                        message=f"Thermostat damping {tdamp} is very loose (ratio: {ratio:.1f}x timestep)",
                        severity="info",
                    )
                )
            else:
                checks.append(
                    PhysicsCheck(
                        name="thermostat_damping",
                        passed=True,
                        value=tdamp,
                        message=f"Thermostat damping {tdamp} is reasonable ({ratio:.1f}x timestep)",
                        severity="info",
                    )
                )
        except ValueError:
            pass

    return checks


def validate_l3_lammps(
    content: str, file_guide: Optional[Any] = None
) -> L3Result:
    """Run all L3 physics checks for LAMMPS.

    Args:
        content: LAMMPS input content
        file_guide: Optional FileGuide with parsed structure info

    Returns:
        L3Result with all check results
    """
    all_checks: List[PhysicsCheck] = []

    # Get box dimensions from file_guide if available
    box_dimensions = None
    if file_guide and hasattr(file_guide, "box_dimensions"):
        box_dimensions = file_guide.box_dimensions

    # Run all checks
    all_checks.extend(check_lammps_temperature(content))
    all_checks.extend(check_lammps_timestep(content))
    all_checks.extend(check_lammps_cutoff_vs_box(content, box_dimensions))
    all_checks.extend(check_lammps_thermostat_damping(content))

    # Separate warnings and info
    warnings = [c.to_dict() for c in all_checks if not c.passed and c.severity == "warning"]
    info = [c.to_dict() for c in all_checks if c.passed or c.severity == "info"]

    return L3Result(
        passed=True,  # L3 is always advisory
        warnings=warnings,
        info=info,
        physics_checks=[c.to_dict() for c in all_checks],
        checks_run=len(all_checks),
    )


# =============================================================================
# QE Physics Checks
# =============================================================================


def _parse_qe_param(content: str, param: str) -> Optional[str]:
    """Parse a parameter value from QE input.

    Args:
        content: QE input content
        param: Parameter name

    Returns:
        Parameter value or None
    """
    pattern = re.compile(
        rf"^\s*{param}\s*=\s*(['\"]?)(.+?)\1\s*[,!/]?\s*$",
        re.MULTILINE | re.IGNORECASE,
    )
    match = pattern.search(content)
    if match:
        return match.group(2).strip()
    return None


def check_qe_ecutwfc(content: str) -> List[PhysicsCheck]:
    """Check wavefunction cutoff in QE input.

    Args:
        content: QE input content

    Returns:
        List of PhysicsCheck results
    """
    checks = []

    ecutwfc_str = _parse_qe_param(content, "ecutwfc")
    if ecutwfc_str:
        try:
            # Handle d notation (e.g., 60.d0)
            ecutwfc_str = ecutwfc_str.lower().replace("d", "e")
            ecutwfc = float(ecutwfc_str)

            if ecutwfc < ECUTWFC_MIN:
                checks.append(
                    PhysicsCheck(
                        name="ecutwfc",
                        passed=False,
                        value=ecutwfc,
                        expected_range=f"{ECUTWFC_TYPICAL_MIN}-{ECUTWFC_TYPICAL_MAX} Ry",
                        message=f"ecutwfc = {ecutwfc} Ry is too low for accurate results",
                        severity="warning",
                    )
                )
            elif ecutwfc > ECUTWFC_MAX:
                checks.append(
                    PhysicsCheck(
                        name="ecutwfc",
                        passed=False,
                        value=ecutwfc,
                        expected_range=f"{ECUTWFC_TYPICAL_MIN}-{ECUTWFC_TYPICAL_MAX} Ry",
                        message=f"ecutwfc = {ecutwfc} Ry is unusually high",
                        severity="info",
                    )
                )
            else:
                checks.append(
                    PhysicsCheck(
                        name="ecutwfc",
                        passed=True,
                        value=ecutwfc,
                        message=f"ecutwfc = {ecutwfc} Ry is reasonable",
                        severity="info",
                    )
                )
        except ValueError:
            pass

    return checks


def check_qe_ecutrho_ratio(content: str) -> List[PhysicsCheck]:
    """Check ecutrho/ecutwfc ratio.

    Args:
        content: QE input content

    Returns:
        List of PhysicsCheck results
    """
    checks = []

    ecutwfc_str = _parse_qe_param(content, "ecutwfc")
    ecutrho_str = _parse_qe_param(content, "ecutrho")

    if ecutwfc_str and ecutrho_str:
        try:
            ecutwfc = float(ecutwfc_str.lower().replace("d", "e"))
            ecutrho = float(ecutrho_str.lower().replace("d", "e"))

            if ecutwfc > 0:
                ratio = ecutrho / ecutwfc

                if ratio < 4:
                    checks.append(
                        PhysicsCheck(
                            name="ecutrho_ratio",
                            passed=False,
                            value=ratio,
                            expected_range="4x for NC, 8-12x for US/PAW",
                            message=f"ecutrho/ecutwfc ratio = {ratio:.1f} is too low",
                            severity="warning",
                        )
                    )
                elif ratio > 16:
                    checks.append(
                        PhysicsCheck(
                            name="ecutrho_ratio",
                            passed=False,
                            value=ratio,
                            expected_range="4x for NC, 8-12x for US/PAW",
                            message=f"ecutrho/ecutwfc ratio = {ratio:.1f} is unusually high",
                            severity="info",
                        )
                    )
                else:
                    checks.append(
                        PhysicsCheck(
                            name="ecutrho_ratio",
                            passed=True,
                            value=ratio,
                            message=f"ecutrho/ecutwfc ratio = {ratio:.1f} is reasonable",
                            severity="info",
                        )
                    )
        except ValueError:
            pass

    return checks


def check_qe_conv_thr(content: str) -> List[PhysicsCheck]:
    """Check convergence threshold.

    Args:
        content: QE input content

    Returns:
        List of PhysicsCheck results
    """
    checks = []

    conv_thr_str = _parse_qe_param(content, "conv_thr")
    if conv_thr_str:
        try:
            conv_thr = float(conv_thr_str.lower().replace("d", "e"))

            if conv_thr > 1e-4:
                checks.append(
                    PhysicsCheck(
                        name="conv_thr",
                        passed=False,
                        value=conv_thr,
                        expected_range="1e-6 to 1e-10",
                        message=f"conv_thr = {conv_thr:.1e} may be too loose for accurate results",
                        severity="warning",
                    )
                )
            elif conv_thr < 1e-12:
                checks.append(
                    PhysicsCheck(
                        name="conv_thr",
                        passed=False,
                        value=conv_thr,
                        expected_range="1e-6 to 1e-10",
                        message=f"conv_thr = {conv_thr:.1e} is very tight, may slow convergence",
                        severity="info",
                    )
                )
            else:
                checks.append(
                    PhysicsCheck(
                        name="conv_thr",
                        passed=True,
                        value=conv_thr,
                        message=f"conv_thr = {conv_thr:.1e} is reasonable",
                        severity="info",
                    )
                )
        except ValueError:
            pass

    return checks


def check_qe_mixing_beta(content: str) -> List[PhysicsCheck]:
    """Check mixing parameter.

    Args:
        content: QE input content

    Returns:
        List of PhysicsCheck results
    """
    checks = []

    mixing_beta_str = _parse_qe_param(content, "mixing_beta")
    if mixing_beta_str:
        try:
            mixing_beta = float(mixing_beta_str.lower().replace("d", "e"))

            if mixing_beta < 0.1:
                checks.append(
                    PhysicsCheck(
                        name="mixing_beta",
                        passed=False,
                        value=mixing_beta,
                        expected_range="0.1 to 0.7",
                        message=f"mixing_beta = {mixing_beta} is very conservative, may slow convergence",
                        severity="info",
                    )
                )
            elif mixing_beta > 0.7:
                checks.append(
                    PhysicsCheck(
                        name="mixing_beta",
                        passed=False,
                        value=mixing_beta,
                        expected_range="0.1 to 0.7",
                        message=f"mixing_beta = {mixing_beta} is aggressive, may cause oscillations",
                        severity="warning",
                    )
                )
            else:
                checks.append(
                    PhysicsCheck(
                        name="mixing_beta",
                        passed=True,
                        value=mixing_beta,
                        message=f"mixing_beta = {mixing_beta} is reasonable",
                        severity="info",
                    )
                )
        except ValueError:
            pass

    return checks


def validate_l3_qe(content: str, file_guide: Optional[Any] = None) -> L3Result:
    """Run all L3 physics checks for QE.

    Args:
        content: QE input content
        file_guide: Optional FileGuide with parsed structure info

    Returns:
        L3Result with all check results
    """
    all_checks: List[PhysicsCheck] = []

    # Run all checks
    all_checks.extend(check_qe_ecutwfc(content))
    all_checks.extend(check_qe_ecutrho_ratio(content))
    all_checks.extend(check_qe_conv_thr(content))
    all_checks.extend(check_qe_mixing_beta(content))

    # Separate warnings and info
    warnings = [c.to_dict() for c in all_checks if not c.passed and c.severity == "warning"]
    info = [c.to_dict() for c in all_checks if c.passed or c.severity == "info"]

    return L3Result(
        passed=True,
        warnings=warnings,
        info=info,
        physics_checks=[c.to_dict() for c in all_checks],
        checks_run=len(all_checks),
    )


# =============================================================================
# Main Validation Functions
# =============================================================================


def validate_l3_content(
    content: str,
    engine: str,
    file_guide: Optional[Any] = None,
) -> L3Result:
    """Validate content for physical reasonableness.

    Args:
        content: Input file content
        engine: Engine name ("lammps" or "qe")
        file_guide: Optional FileGuide with parsed structure info

    Returns:
        L3Result with validation results
    """
    engine_lower = engine.lower()

    if engine_lower in ("lammps", "lmp"):
        return validate_l3_lammps(content, file_guide)
    elif engine_lower in ("qe", "quantum_espresso", "pw"):
        return validate_l3_qe(content, file_guide)
    else:
        return L3Result(
            passed=True,
            warnings=[{"message": f"Unknown engine '{engine}', skipping L3 checks"}],
        )


def validate_l3(
    file_path: Union[str, Path],
    engine: Optional[str] = None,
    file_guide: Optional[Any] = None,
) -> L3Result:
    """Validate a file for physical reasonableness.

    Args:
        file_path: Path to input file
        engine: Engine name (auto-detected if not provided)
        file_guide: Optional FileGuide with parsed structure info

    Returns:
        L3Result with validation results
    """
    path = Path(file_path)

    # Check file exists
    if not path.exists():
        return L3Result(
            passed=True,
            warnings=[{"message": f"File not found: {path}"}],
        )

    # Read file
    try:
        content = path.read_text(encoding="utf-8")
    except Exception:
        try:
            content = path.read_text(encoding="latin-1")
        except Exception as e:
            return L3Result(
                passed=True,
                warnings=[{"message": f"Cannot read file: {e}"}],
            )

    # Auto-detect engine if not provided
    if not engine:
        # Simple heuristics
        suffix = path.suffix.lower()
        if suffix in (".lmp", ".lammps", ".in") or "units" in content.lower():
            engine = "lammps"
        elif suffix in (".pwi", ".in") or "&CONTROL" in content.upper():
            engine = "qe"
        else:
            return L3Result(
                passed=True,
                warnings=[{"message": "Could not auto-detect engine type"}],
            )

    return validate_l3_content(content, engine, file_guide)


def format_l3_report(result: L3Result) -> str:
    """Format L3 validation result as human-readable report.

    Args:
        result: L3Result to format

    Returns:
        Markdown-formatted report string
    """
    lines = []

    # Header
    lines.append("## L3 Physics Validation: ADVISORY")
    lines.append("")
    lines.append(f"**Checks run:** {result.checks_run}")
    lines.append(f"**Warnings:** {len(result.warnings)}")
    lines.append("")

    # Warnings
    if result.warnings:
        lines.append("### Warnings")
        lines.append("")
        for warn in result.warnings:
            name = warn.get("name", "")
            msg = warn.get("message", str(warn))
            if name:
                lines.append(f"- **{name}:** {msg}")
            else:
                lines.append(f"- {msg}")
        lines.append("")

    # Physics checks summary
    if result.physics_checks:
        lines.append("### All Checks")
        lines.append("")
        for check in result.physics_checks:
            status = "OK" if check.get("passed") else "WARN"
            lines.append(f"- [{status}] {check.get('name', 'unknown')}: {check.get('message', '')}")
        lines.append("")

    return "\n".join(lines)


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    "PhysicsCheck",
    "L3Result",
    "validate_l3",
    "validate_l3_content",
    "validate_l3_lammps",
    "validate_l3_qe",
    "format_l3_report",
]
