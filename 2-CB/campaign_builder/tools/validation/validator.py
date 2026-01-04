"""
Unified Validation Interface for Campaign Builder.

This module provides a unified interface to run all validation levels
(L0, L1, L2, L3) on simulation input files.

Usage:
    from campaign_builder.tools.validation import validate_deck, ValidationResult

    # Run all validation levels
    result = validate_deck(Path("input.lmp"), engine="lammps")

    # Run specific levels
    result = validate_deck(Path("input.lmp"), levels=["L0", "L1"], engine="lammps")

    if result.can_run:
        print("Input file is ready for simulation")
    else:
        print("Validation failed:", result.all_issues)
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from .l0_templates import L0Result, validate_l0, validate_l0_content
from .l1_lammps import L1LAMMPSResult, validate_l1_lammps, validate_l1_lammps_content
from .l1_qe import L1QEResult, validate_l1_qe, validate_l1_qe_content
from .l2_engine import L2Result, validate_l2
from .l3_physics import L3Result, validate_l3, validate_l3_content

# Try to import FileGuide for type hints
try:
    from campaign_builder.schemas import FileGuide
except ImportError:
    FileGuide = Any  # type: ignore


# =============================================================================
# Constants
# =============================================================================

# All validation levels
ALL_LEVELS = ["L0", "L1", "L2", "L3"]

# Default levels to run
DEFAULT_LEVELS = ["L0", "L1", "L2", "L3"]

# Blocking levels (must pass for simulation to run)
BLOCKING_LEVELS = ["L0", "L1"]


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class ValidationResult:
    """Aggregated result from all validation levels.

    Attributes:
        overall_passed: True if all blocking validations passed
        can_run: True if L0 and L1 passed (minimum for running)
        l0: L0 validation result (if run)
        l1: L1 validation result (if run)
        l2: L2 validation result (if run)
        l3: L3 validation result (if run)
        all_issues: Combined list of all issues
        suggestions: Repair suggestions based on issues
        levels_run: List of levels that were executed
        engine: Engine type
    """

    overall_passed: bool
    can_run: bool
    l0: Optional[L0Result] = None
    l1: Optional[Union[L1LAMMPSResult, L1QEResult]] = None
    l2: Optional[L2Result] = None
    l3: Optional[L3Result] = None
    all_issues: List[Dict[str, Any]] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    levels_run: List[str] = field(default_factory=list)
    engine: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        result = {
            "overall_passed": self.overall_passed,
            "can_run": self.can_run,
            "levels_run": self.levels_run,
            "engine": self.engine,
            "all_issues": self.all_issues,
            "suggestions": self.suggestions,
        }
        if self.l0:
            result["l0"] = self.l0.to_dict()
        if self.l1:
            result["l1"] = self.l1.to_dict()
        if self.l2:
            result["l2"] = self.l2.to_dict()
        if self.l3:
            result["l3"] = self.l3.to_dict()
        return result


# =============================================================================
# Repair Suggestions
# =============================================================================

# Mapping of issue codes to repair suggestions
REPAIR_SUGGESTIONS = {
    # L0
    "handlebars": "Replace {{variable}} placeholders with actual values",
    "shell_var": "Replace ${VAR} placeholders with actual values",
    "angle_bracket": "Replace <PLACEHOLDER> markers with actual values",
    "todo": "Complete TODO items before running simulation",
    "fixme": "Fix FIXME items before running simulation",
    "xxx": "Address XXX markers before running simulation",
    # L1 LAMMPS
    "L1_MISSING_UNITS": "Add 'units real' (or appropriate unit system) at the start",
    "L1_MISSING_ATOM_STYLE": "Add 'atom_style full' (or appropriate style) after units",
    "L1_MISSING_STRUCTURE": "Add 'read_data <filename>' or 'create_box' to define system",
    "L1_PAIR_STYLE_ORDER": "Move 'pair_style' command before 'pair_coeff' commands",
    "L1_MISSING_PAIR_COEFF": "Add pair_coeff commands for all atom type pairs",
    "L1_NO_RUN": "Add 'run N' command to execute simulation steps",
    # L1 QE
    "L1_MISSING_CONTROL": "Add '&CONTROL' namelist with calculation settings",
    "L1_MISSING_SYSTEM": "Add '&SYSTEM' namelist with system parameters",
    "L1_MISSING_ELECTRONS": "Add '&ELECTRONS' namelist with SCF settings",
    "L1_MISSING_ATOMIC_SPECIES": "Add 'ATOMIC_SPECIES' card with species definitions",
    "L1_MISSING_ATOMIC_POSITIONS": "Add 'ATOMIC_POSITIONS' card with atom coordinates",
    "L1_MISSING_K_POINTS": "Add 'K_POINTS' card with k-point sampling",
    "L1_MISSING_NAT": "Add 'nat = N' to &SYSTEM with number of atoms",
    "L1_MISSING_NTYP": "Add 'ntyp = N' to &SYSTEM with number of species",
    "L1_MISSING_ECUTWFC": "Add 'ecutwfc = X' to &SYSTEM with wavefunction cutoff",
    "L1_NAT_MISMATCH": "Update nat to match ATOMIC_POSITIONS count",
    "L1_NTYP_MISMATCH": "Update ntyp to match ATOMIC_SPECIES count",
    # L3
    "temperature": "Check temperature values are appropriate for the system",
    "timestep": "Adjust timestep for stability (typically 1-2 fs for atomistic)",
    "cutoff_vs_box": "Increase box size or decrease cutoff to < half minimum dimension",
    "ecutwfc": "Use appropriate ecutwfc for pseudopotentials (typically 30-80 Ry)",
    "ecutrho_ratio": "Set ecutrho = 4*ecutwfc for NC, 8-12*ecutwfc for US/PAW",
}


def suggest_repairs(issues: List[Dict[str, Any]]) -> List[str]:
    """Generate repair suggestions from issues.

    Args:
        issues: List of validation issues

    Returns:
        List of unique repair suggestions
    """
    suggestions = []
    seen = set()

    for issue in issues:
        code = issue.get("code", "")
        pattern = issue.get("pattern", "")

        # Try code first, then pattern
        suggestion = REPAIR_SUGGESTIONS.get(code) or REPAIR_SUGGESTIONS.get(pattern)

        # Also check issue's own suggestion
        if not suggestion:
            suggestion = issue.get("suggestion")

        if suggestion and suggestion not in seen:
            suggestions.append(suggestion)
            seen.add(suggestion)

    return suggestions


# =============================================================================
# Main Validation Function
# =============================================================================


def validate_deck(
    file_path: Union[str, Path],
    engine: Optional[str] = None,
    levels: Optional[List[str]] = None,
    file_guide: Optional[Any] = None,
    engine_path: Optional[str] = None,
    stop_on_blocking_fail: bool = True,
) -> ValidationResult:
    """Validate a simulation input file through multiple levels.

    Args:
        file_path: Path to input file
        engine: Engine type ("lammps" or "qe"). Auto-detected if not provided.
        levels: List of levels to run (default: all)
        file_guide: Optional FileGuide with parsed structure info
        engine_path: Optional explicit path to engine binary
        stop_on_blocking_fail: Stop if L0/L1 fails (default: True)

    Returns:
        ValidationResult with all validation results
    """
    path = Path(file_path)
    levels_to_run = levels or DEFAULT_LEVELS
    levels_run: List[str] = []
    all_issues: List[Dict[str, Any]] = []

    # Initialize results
    l0_result: Optional[L0Result] = None
    l1_result: Optional[Union[L1LAMMPSResult, L1QEResult]] = None
    l2_result: Optional[L2Result] = None
    l3_result: Optional[L3Result] = None

    # Read file content for L1/L3
    content: Optional[str] = None
    try:
        content = path.read_text(encoding="utf-8")
    except Exception:
        try:
            content = path.read_text(encoding="latin-1")
        except Exception:
            pass

    # Auto-detect engine if not provided
    if not engine and content:
        suffix = path.suffix.lower()
        if suffix in (".lmp", ".lammps") or "units" in content.lower():
            engine = "lammps"
        elif suffix in (".pwi",) or "&CONTROL" in content.upper():
            engine = "qe"

    # Run L0 if requested
    if "L0" in levels_to_run:
        l0_result = validate_l0(path)
        levels_run.append("L0")

        if l0_result.placeholders:
            all_issues.extend(l0_result.placeholders)

        if not l0_result.passed and stop_on_blocking_fail:
            return ValidationResult(
                overall_passed=False,
                can_run=False,
                l0=l0_result,
                all_issues=all_issues,
                suggestions=suggest_repairs(all_issues),
                levels_run=levels_run,
                engine=engine,
            )

    # Run L1 if requested
    if "L1" in levels_to_run and engine:
        engine_lower = engine.lower()

        if engine_lower in ("lammps", "lmp"):
            l1_result = validate_l1_lammps(path)
        elif engine_lower in ("qe", "quantum_espresso", "pw"):
            l1_result = validate_l1_qe(path)

        if l1_result:
            levels_run.append("L1")
            all_issues.extend(l1_result.errors)
            all_issues.extend(l1_result.warnings)

            if not l1_result.passed and stop_on_blocking_fail:
                return ValidationResult(
                    overall_passed=False,
                    can_run=False,
                    l0=l0_result,
                    l1=l1_result,
                    all_issues=all_issues,
                    suggestions=suggest_repairs(all_issues),
                    levels_run=levels_run,
                    engine=engine,
                )

    # Run L2 if requested
    if "L2" in levels_to_run and engine:
        l2_result = validate_l2(path, engine=engine, engine_path=engine_path)
        levels_run.append("L2")

        if l2_result.errors:
            all_issues.extend([{"code": "L2_ERROR", "message": e} for e in l2_result.errors])
        if l2_result.warnings:
            all_issues.extend([{"code": "L2_WARNING", "message": w} for w in l2_result.warnings])

    # Run L3 if requested
    if "L3" in levels_to_run:
        l3_result = validate_l3(path, engine=engine, file_guide=file_guide)
        levels_run.append("L3")

        all_issues.extend(l3_result.warnings)

    # Determine overall status
    l0_passed = l0_result.passed if l0_result else True
    l1_passed = l1_result.passed if l1_result else True
    l2_passed = l2_result.passed if l2_result else True

    can_run = l0_passed and l1_passed
    overall_passed = l0_passed and l1_passed and l2_passed

    return ValidationResult(
        overall_passed=overall_passed,
        can_run=can_run,
        l0=l0_result,
        l1=l1_result,
        l2=l2_result,
        l3=l3_result,
        all_issues=all_issues,
        suggestions=suggest_repairs(all_issues),
        levels_run=levels_run,
        engine=engine,
    )


def validate_deck_content(
    content: str,
    engine: str,
    levels: Optional[List[str]] = None,
    file_guide: Optional[Any] = None,
) -> ValidationResult:
    """Validate simulation input content (not from file).

    Args:
        content: Input file content
        engine: Engine type ("lammps" or "qe")
        levels: List of levels to run (default: L0, L1, L3 - no L2)
        file_guide: Optional FileGuide with parsed structure info

    Returns:
        ValidationResult with validation results

    Note:
        L2 is skipped since it requires a file path.
    """
    # Default levels exclude L2 for content validation
    levels_to_run = levels or ["L0", "L1", "L3"]
    levels_to_run = [l for l in levels_to_run if l != "L2"]

    levels_run: List[str] = []
    all_issues: List[Dict[str, Any]] = []

    l0_result: Optional[L0Result] = None
    l1_result: Optional[Union[L1LAMMPSResult, L1QEResult]] = None
    l3_result: Optional[L3Result] = None

    engine_lower = engine.lower()

    # Run L0
    if "L0" in levels_to_run:
        l0_result = validate_l0_content(content)
        levels_run.append("L0")
        if l0_result.placeholders:
            all_issues.extend(l0_result.placeholders)

    # Run L1
    if "L1" in levels_to_run:
        if engine_lower in ("lammps", "lmp"):
            l1_result = validate_l1_lammps_content(content)
        elif engine_lower in ("qe", "quantum_espresso", "pw"):
            l1_result = validate_l1_qe_content(content)

        if l1_result:
            levels_run.append("L1")
            all_issues.extend(l1_result.errors)
            all_issues.extend(l1_result.warnings)

    # Run L3
    if "L3" in levels_to_run:
        l3_result = validate_l3_content(content, engine, file_guide)
        levels_run.append("L3")
        all_issues.extend(l3_result.warnings)

    # Determine status
    l0_passed = l0_result.passed if l0_result else True
    l1_passed = l1_result.passed if l1_result else True
    can_run = l0_passed and l1_passed

    return ValidationResult(
        overall_passed=can_run,
        can_run=can_run,
        l0=l0_result,
        l1=l1_result,
        l2=None,  # L2 requires file
        l3=l3_result,
        all_issues=all_issues,
        suggestions=suggest_repairs(all_issues),
        levels_run=levels_run,
        engine=engine,
    )


def format_validation_report(result: ValidationResult) -> str:
    """Format full validation result as human-readable report.

    Args:
        result: ValidationResult to format

    Returns:
        Markdown-formatted report string
    """
    lines = []

    # Header
    status = "PASSED" if result.overall_passed else "FAILED"
    lines.append(f"# Validation Report: {status}")
    lines.append("")
    lines.append(f"**Engine:** {result.engine or 'auto-detected'}")
    lines.append(f"**Can Run:** {'Yes' if result.can_run else 'No'}")
    lines.append(f"**Levels Run:** {', '.join(result.levels_run)}")
    lines.append("")

    # Level summaries
    if result.l0:
        l0_status = "PASSED" if result.l0.passed else "FAILED"
        lines.append(f"**L0 (Template):** {l0_status} - {result.l0.total_placeholders} placeholders")

    if result.l1:
        l1_status = "PASSED" if result.l1.passed else "FAILED"
        lines.append(f"**L1 (Syntax):** {l1_status} - {len(result.l1.errors)} errors, {len(result.l1.warnings)} warnings")

    if result.l2:
        if result.l2.skipped:
            lines.append(f"**L2 (Engine):** SKIPPED - {result.l2.skip_reason}")
        else:
            l2_status = "PASSED" if result.l2.passed else "FAILED"
            lines.append(f"**L2 (Engine):** {l2_status} - {len(result.l2.errors)} errors")

    if result.l3:
        lines.append(f"**L3 (Physics):** {result.l3.checks_run} checks, {len(result.l3.warnings)} warnings")

    lines.append("")

    # Issues
    if result.all_issues:
        lines.append("## Issues Found")
        lines.append("")
        for issue in result.all_issues[:20]:  # Limit to first 20
            code = issue.get("code", issue.get("pattern", ""))
            msg = issue.get("message", str(issue))
            lines.append(f"- **{code}:** {msg}")
        if len(result.all_issues) > 20:
            lines.append(f"- ... and {len(result.all_issues) - 20} more")
        lines.append("")

    # Suggestions
    if result.suggestions:
        lines.append("## Suggested Repairs")
        lines.append("")
        for suggestion in result.suggestions:
            lines.append(f"- {suggestion}")
        lines.append("")

    return "\n".join(lines)


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    "ALL_LEVELS",
    "DEFAULT_LEVELS",
    "BLOCKING_LEVELS",
    "ValidationResult",
    "validate_deck",
    "validate_deck_content",
    "format_validation_report",
    "suggest_repairs",
]
