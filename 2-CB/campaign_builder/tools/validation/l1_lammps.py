"""
L1 Validation - LAMMPS Syntax Validation.

This module provides L1 syntax validation for LAMMPS input files.
L1 catches syntax errors that any parser would find:
    - Missing required commands
    - Commands in wrong order
    - Incomplete specifications
    - Malformed syntax

L1 is a BLOCKING validation level.

Usage:
    from campaign_builder.tools.validation.l1_lammps import validate_l1_lammps, L1LAMMPSResult

    result = validate_l1_lammps(Path("input.lmp"))
    if not result.passed:
        for error in result.errors:
            print(f"{error['code']}: {error['message']}")
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union


# =============================================================================
# Constants
# =============================================================================

# Required commands that must be present (in typical order)
REQUIRED_COMMANDS = [
    "units",
    "atom_style",
]

# Commands that need structure data
STRUCTURE_COMMANDS = ["read_data", "read_restart", "create_box", "create_atoms"]

# Commands that must come before certain other commands
ORDERING_RULES = [
    # (earlier_command, later_command)
    ("units", "atom_style"),
    ("atom_style", "read_data"),
    ("atom_style", "read_restart"),
    ("pair_style", "pair_coeff"),
    ("bond_style", "bond_coeff"),
    ("angle_style", "angle_coeff"),
    ("dihedral_style", "dihedral_coeff"),
    ("improper_style", "improper_coeff"),
]

# Commands with minimum argument counts
MIN_ARGS = {
    "units": 1,
    "atom_style": 1,
    "dimension": 1,
    "boundary": 3,
    "pair_style": 1,
    "pair_coeff": 2,
    "bond_style": 1,
    "angle_style": 1,
    "fix": 3,  # ID group-ID style
    "compute": 3,  # ID group-ID style
    "dump": 4,  # ID group-ID style N
    "thermo": 1,
    "run": 1,
    "timestep": 1,
    "read_data": 1,
    "read_restart": 1,
}


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class LAMMPSCommand:
    """Parsed LAMMPS command.

    Attributes:
        name: Command name (first token)
        args: Command arguments
        line_number: 1-indexed line number
        raw_line: Original line text
    """

    name: str
    args: List[str]
    line_number: int
    raw_line: str

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "name": self.name,
            "args": self.args,
            "line_number": self.line_number,
            "raw_line": self.raw_line,
        }


@dataclass
class ValidationIssue:
    """A validation issue (error or warning).

    Attributes:
        code: Issue code like "L1_MISSING_UNITS"
        message: Human-readable description
        severity: "error" or "warning"
        line_number: Optional line number
        suggestion: Optional fix suggestion
    """

    code: str
    message: str
    severity: str  # "error" or "warning"
    line_number: Optional[int] = None
    suggestion: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        result = {
            "code": self.code,
            "message": self.message,
            "severity": self.severity,
        }
        if self.line_number is not None:
            result["line_number"] = self.line_number
        if self.suggestion is not None:
            result["suggestion"] = self.suggestion
        return result


@dataclass
class L1LAMMPSResult:
    """Result of L1 LAMMPS syntax validation.

    Attributes:
        passed: True if no errors (warnings ok)
        errors: List of error issues
        warnings: List of warning issues
        checks_performed: List of check names that were run
        commands_found: List of command names found in file
    """

    passed: bool
    errors: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[Dict[str, Any]] = field(default_factory=list)
    checks_performed: List[str] = field(default_factory=list)
    commands_found: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "passed": self.passed,
            "errors": self.errors,
            "warnings": self.warnings,
            "checks_performed": self.checks_performed,
            "commands_found": self.commands_found,
        }


# =============================================================================
# Parser Functions
# =============================================================================


def parse_lammps_line(line: str) -> Tuple[Optional[str], List[str]]:
    """Parse a single LAMMPS line into command and arguments.

    Args:
        line: Raw line text

    Returns:
        Tuple of (command_name, args) or (None, []) for empty/comment lines
    """
    # Strip leading/trailing whitespace
    line = line.strip()

    # Skip empty lines
    if not line:
        return None, []

    # Skip comment lines
    if line.startswith("#"):
        return None, []

    # Remove inline comments
    comment_pos = line.find("#")
    if comment_pos >= 0:
        line = line[:comment_pos].strip()

    # Skip if line becomes empty after removing comment
    if not line:
        return None, []

    # Handle line continuations (not fully - just strip trailing &)
    if line.endswith("&"):
        line = line[:-1].strip()

    # Split on whitespace
    tokens = line.split()
    if not tokens:
        return None, []

    return tokens[0].lower(), tokens[1:]


def parse_lammps_commands(content: str) -> List[LAMMPSCommand]:
    """Parse LAMMPS content into list of commands.

    Args:
        content: Full file content

    Returns:
        List of LAMMPSCommand objects
    """
    commands = []
    lines = content.split("\n")

    # Track line continuation
    continuation_line = ""
    continuation_start = 0

    for line_idx, line in enumerate(lines):
        line_number = line_idx + 1

        # Handle line continuation
        stripped = line.strip()
        if stripped.endswith("&"):
            if not continuation_line:
                continuation_start = line_number
            continuation_line += " " + stripped[:-1]
            continue
        elif continuation_line:
            full_line = continuation_line + " " + stripped
            continuation_line = ""
            line_to_parse = full_line
            actual_line_number = continuation_start
        else:
            line_to_parse = line
            actual_line_number = line_number

        # Parse the line
        cmd_name, args = parse_lammps_line(line_to_parse)
        if cmd_name:
            commands.append(
                LAMMPSCommand(
                    name=cmd_name,
                    args=args,
                    line_number=actual_line_number,
                    raw_line=line_to_parse.strip(),
                )
            )

    return commands


# =============================================================================
# Validation Checks
# =============================================================================


def check_required_commands(
    commands: List[LAMMPSCommand],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check that required commands are present.

    Args:
        commands: List of parsed commands

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = []
    command_names = {cmd.name for cmd in commands}

    for required in REQUIRED_COMMANDS:
        checks.append(f"required_{required}")
        if required not in command_names:
            issues.append(
                ValidationIssue(
                    code=f"L1_MISSING_{required.upper()}",
                    message=f"Missing required command: {required}",
                    severity="error",
                    suggestion=f"Add '{required}' command near the start of the file",
                )
            )

    # Check for structure command (need at least one)
    checks.append("required_structure")
    has_structure = any(cmd.name in STRUCTURE_COMMANDS for cmd in commands)
    if not has_structure:
        issues.append(
            ValidationIssue(
                code="L1_MISSING_STRUCTURE",
                message="No structure command found (read_data, read_restart, create_box, etc.)",
                severity="error",
                suggestion="Add 'read_data' or 'create_box' to define the simulation system",
            )
        )

    return issues, checks


def check_command_order(
    commands: List[LAMMPSCommand],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check that commands are in correct order.

    Args:
        commands: List of parsed commands

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = []

    # Build command -> first line number mapping
    first_occurrence: Dict[str, int] = {}
    for cmd in commands:
        if cmd.name not in first_occurrence:
            first_occurrence[cmd.name] = cmd.line_number

    for earlier, later in ORDERING_RULES:
        checks.append(f"order_{earlier}_before_{later}")

        if earlier in first_occurrence and later in first_occurrence:
            if first_occurrence[earlier] > first_occurrence[later]:
                issues.append(
                    ValidationIssue(
                        code=f"L1_{earlier.upper()}_ORDER",
                        message=f"'{earlier}' (line {first_occurrence[earlier]}) must come before '{later}' (line {first_occurrence[later]})",
                        severity="error",
                        line_number=first_occurrence[later],
                        suggestion=f"Move '{earlier}' command before '{later}'",
                    )
                )

    return issues, checks


def check_argument_counts(
    commands: List[LAMMPSCommand],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check that commands have minimum required arguments.

    Args:
        commands: List of parsed commands

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = ["argument_counts"]

    for cmd in commands:
        if cmd.name in MIN_ARGS:
            min_count = MIN_ARGS[cmd.name]
            if len(cmd.args) < min_count:
                issues.append(
                    ValidationIssue(
                        code=f"L1_{cmd.name.upper()}_ARGS",
                        message=f"'{cmd.name}' requires at least {min_count} argument(s), got {len(cmd.args)}",
                        severity="error",
                        line_number=cmd.line_number,
                        suggestion=f"Check syntax for '{cmd.name}' command",
                    )
                )

    return issues, checks


def check_pair_coefficients(
    commands: List[LAMMPSCommand],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check pair coefficient completeness.

    Args:
        commands: List of parsed commands

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = ["pair_coefficients"]

    # Find pair_style
    pair_styles = [cmd for cmd in commands if cmd.name == "pair_style"]
    pair_coeffs = [cmd for cmd in commands if cmd.name == "pair_coeff"]

    # If pair_style exists but no pair_coeff, that's likely an issue
    # unless it's a style that doesn't need coeffs
    if pair_styles and not pair_coeffs:
        # Some styles don't need explicit pair_coeff (e.g., hybrid overlay with table)
        style = pair_styles[0].args[0] if pair_styles[0].args else ""
        if style not in ["none", "zero"]:
            issues.append(
                ValidationIssue(
                    code="L1_MISSING_PAIR_COEFF",
                    message="pair_style defined but no pair_coeff commands found",
                    severity="warning",
                    line_number=pair_styles[0].line_number,
                    suggestion="Add pair_coeff commands or ensure coefficients are in data file",
                )
            )

    # Check for duplicate pair_coeff (same i j)
    pair_coeff_pairs = set()
    for cmd in pair_coeffs:
        if len(cmd.args) >= 2:
            try:
                # Handle wildcards
                i = cmd.args[0]
                j = cmd.args[1]
                pair_key = (i, j) if i <= j else (j, i)
                if pair_key in pair_coeff_pairs:
                    issues.append(
                        ValidationIssue(
                            code="L1_DUPLICATE_PAIR_COEFF",
                            message=f"Duplicate pair_coeff for types {i} {j}",
                            severity="warning",
                            line_number=cmd.line_number,
                            suggestion="Remove duplicate pair_coeff or check if intentional override",
                        )
                    )
                pair_coeff_pairs.add(pair_key)
            except (ValueError, IndexError):
                pass

    return issues, checks


def check_duplicate_read_data(
    commands: List[LAMMPSCommand],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check for duplicate read_data commands.

    Args:
        commands: List of parsed commands

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = ["duplicate_read_data"]

    read_data_cmds = [cmd for cmd in commands if cmd.name == "read_data"]
    if len(read_data_cmds) > 1:
        issues.append(
            ValidationIssue(
                code="L1_DUPLICATE_READ_DATA",
                message=f"Multiple read_data commands found ({len(read_data_cmds)})",
                severity="warning",
                line_number=read_data_cmds[1].line_number,
                suggestion="Typically only one read_data is needed unless using 'add' keyword",
            )
        )

    return issues, checks


def check_reasonableness(
    commands: List[LAMMPSCommand],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check for reasonable values (warnings only).

    Args:
        commands: List of parsed commands

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = ["reasonableness"]

    # Check for run command
    run_cmds = [cmd for cmd in commands if cmd.name == "run"]
    if not run_cmds:
        issues.append(
            ValidationIssue(
                code="L1_NO_RUN",
                message="No 'run' command found",
                severity="warning",
                suggestion="Add 'run N' to execute simulation steps",
            )
        )

    # Check timestep is positive
    for cmd in commands:
        if cmd.name == "timestep" and cmd.args:
            try:
                dt = float(cmd.args[0])
                if dt <= 0:
                    issues.append(
                        ValidationIssue(
                            code="L1_TIMESTEP_NONPOSITIVE",
                            message=f"Timestep must be positive, got {dt}",
                            severity="error",
                            line_number=cmd.line_number,
                            suggestion="Use a positive timestep value",
                        )
                    )
            except ValueError:
                pass  # Variable reference, can't check

    return issues, checks


# =============================================================================
# Main Validation Functions
# =============================================================================


def validate_l1_lammps_content(content: str) -> L1LAMMPSResult:
    """Validate LAMMPS content for syntax correctness.

    Args:
        content: LAMMPS input file content

    Returns:
        L1LAMMPSResult with validation results
    """
    # Parse commands
    commands = parse_lammps_commands(content)
    command_names = [cmd.name for cmd in commands]

    # Collect all issues
    all_errors: List[ValidationIssue] = []
    all_warnings: List[ValidationIssue] = []
    all_checks: List[str] = []

    # Run checks
    checks = [
        check_required_commands,
        check_command_order,
        check_argument_counts,
        check_pair_coefficients,
        check_duplicate_read_data,
        check_reasonableness,
    ]

    for check_func in checks:
        issues, check_names = check_func(commands)
        all_checks.extend(check_names)
        for issue in issues:
            if issue.severity == "error":
                all_errors.append(issue)
            else:
                all_warnings.append(issue)

    return L1LAMMPSResult(
        passed=len(all_errors) == 0,
        errors=[e.to_dict() for e in all_errors],
        warnings=[w.to_dict() for w in all_warnings],
        checks_performed=all_checks,
        commands_found=command_names,
    )


def validate_l1_lammps(file_path: Union[str, Path]) -> L1LAMMPSResult:
    """Validate a LAMMPS input file for syntax correctness.

    Args:
        file_path: Path to LAMMPS input file

    Returns:
        L1LAMMPSResult with validation results
    """
    path = Path(file_path)

    # Check file exists
    if not path.exists():
        return L1LAMMPSResult(
            passed=False,
            errors=[
                ValidationIssue(
                    code="L1_FILE_NOT_FOUND",
                    message=f"File not found: {path}",
                    severity="error",
                ).to_dict()
            ],
        )

    # Read file
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        try:
            content = path.read_text(encoding="latin-1")
        except Exception as e:
            return L1LAMMPSResult(
                passed=False,
                errors=[
                    ValidationIssue(
                        code="L1_READ_ERROR",
                        message=f"Cannot read file: {e}",
                        severity="error",
                    ).to_dict()
                ],
            )
    except Exception as e:
        return L1LAMMPSResult(
            passed=False,
            errors=[
                ValidationIssue(
                    code="L1_READ_ERROR",
                    message=f"Cannot read file: {e}",
                    severity="error",
                ).to_dict()
            ],
        )

    return validate_l1_lammps_content(content)


def format_l1_lammps_report(result: L1LAMMPSResult) -> str:
    """Format L1 LAMMPS validation result as human-readable report.

    Args:
        result: L1LAMMPSResult to format

    Returns:
        Markdown-formatted report string
    """
    lines = []

    # Header
    status = "PASSED" if result.passed else "FAILED"
    lines.append(f"## L1 LAMMPS Validation: {status}")
    lines.append("")

    # Summary
    lines.append(f"**Errors:** {len(result.errors)}")
    lines.append(f"**Warnings:** {len(result.warnings)}")
    lines.append(f"**Checks performed:** {len(result.checks_performed)}")
    lines.append("")

    # Errors
    if result.errors:
        lines.append("### Errors")
        lines.append("")
        for err in result.errors:
            line_info = f" (line {err['line_number']})" if err.get("line_number") else ""
            lines.append(f"- **{err['code']}**{line_info}: {err['message']}")
            if err.get("suggestion"):
                lines.append(f"  - Suggestion: {err['suggestion']}")
        lines.append("")

    # Warnings
    if result.warnings:
        lines.append("### Warnings")
        lines.append("")
        for warn in result.warnings:
            line_info = f" (line {warn['line_number']})" if warn.get("line_number") else ""
            lines.append(f"- **{warn['code']}**{line_info}: {warn['message']}")
            if warn.get("suggestion"):
                lines.append(f"  - Suggestion: {warn['suggestion']}")
        lines.append("")

    return "\n".join(lines)


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    "REQUIRED_COMMANDS",
    "LAMMPSCommand",
    "ValidationIssue",
    "L1LAMMPSResult",
    "parse_lammps_commands",
    "validate_l1_lammps",
    "validate_l1_lammps_content",
    "format_l1_lammps_report",
]
