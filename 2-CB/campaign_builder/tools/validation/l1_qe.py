"""
L1 Validation - Quantum ESPRESSO Syntax Validation.

This module provides L1 syntax validation for Quantum ESPRESSO input files.
L1 catches syntax errors:
    - Missing required namelists
    - Missing required cards
    - nat/ntyp consistency
    - Namelist syntax errors

L1 is a BLOCKING validation level.

Usage:
    from campaign_builder.tools.validation.l1_qe import validate_l1_qe, L1QEResult

    result = validate_l1_qe(Path("input.pwi"))
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

# Required namelists for pw.x
REQUIRED_NAMELISTS = ["CONTROL", "SYSTEM", "ELECTRONS"]

# Required cards
REQUIRED_CARDS = ["ATOMIC_SPECIES", "ATOMIC_POSITIONS", "K_POINTS"]

# Required parameters in &SYSTEM
REQUIRED_SYSTEM_PARAMS = ["nat", "ntyp"]

# Card names (all caps)
KNOWN_CARDS = [
    "ATOMIC_SPECIES",
    "ATOMIC_POSITIONS",
    "K_POINTS",
    "CELL_PARAMETERS",
    "CONSTRAINTS",
    "OCCUPATIONS",
    "ATOMIC_FORCES",
    "ADDITIONAL_K_POINTS",
    "SOLVENTS",
    "HUBBARD",
]


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class ValidationIssue:
    """A validation issue (error or warning).

    Attributes:
        code: Issue code like "L1_MISSING_CONTROL"
        message: Human-readable description
        severity: "error" or "warning"
        line_number: Optional line number
        suggestion: Optional fix suggestion
    """

    code: str
    message: str
    severity: str
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
class L1QEResult:
    """Result of L1 Quantum ESPRESSO syntax validation.

    Attributes:
        passed: True if no errors (warnings ok)
        errors: List of error issues
        warnings: List of warning issues
        checks_performed: List of check names that were run
        namelists_found: List of namelist names found
        cards_found: List of card names found
    """

    passed: bool
    errors: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[Dict[str, Any]] = field(default_factory=list)
    checks_performed: List[str] = field(default_factory=list)
    namelists_found: List[str] = field(default_factory=list)
    cards_found: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "passed": self.passed,
            "errors": self.errors,
            "warnings": self.warnings,
            "checks_performed": self.checks_performed,
            "namelists_found": self.namelists_found,
            "cards_found": self.cards_found,
        }


# =============================================================================
# Parser Functions
# =============================================================================


def parse_qe_namelists(content: str) -> Tuple[Dict[str, Dict[str, str]], Dict[str, int]]:
    """Parse Quantum ESPRESSO namelists.

    Args:
        content: Full file content

    Returns:
        Tuple of:
            - Dict mapping namelist name -> {param: value}
            - Dict mapping namelist name -> line number
    """
    namelists: Dict[str, Dict[str, str]] = {}
    namelist_lines: Dict[str, int] = {}

    # Pattern to match namelist start
    namelist_start = re.compile(r"^\s*&(\w+)\s*$", re.IGNORECASE | re.MULTILINE)

    # Find all namelists
    lines = content.split("\n")
    current_namelist: Optional[str] = None
    current_params: Dict[str, str] = {}
    namelist_line = 0

    for line_idx, line in enumerate(lines):
        line_number = line_idx + 1
        stripped = line.strip()

        # Check for namelist start
        match = namelist_start.match(line)
        if match:
            if current_namelist:
                namelists[current_namelist] = current_params
            current_namelist = match.group(1).upper()
            current_params = {}
            namelist_line = line_number
            namelist_lines[current_namelist] = line_number
            continue

        # Check for namelist end
        if stripped == "/" and current_namelist:
            namelists[current_namelist] = current_params
            current_namelist = None
            current_params = {}
            continue

        # Parse parameters within namelist
        if current_namelist and stripped and not stripped.startswith("!"):
            # Handle multiple parameters on one line
            # Remove comments
            if "!" in stripped:
                stripped = stripped[: stripped.index("!")].strip()

            # Split on comma (parameters can be comma-separated)
            parts = re.split(r",(?=\s*\w+\s*=)", stripped)
            for part in parts:
                part = part.strip()
                if "=" in part:
                    # Split on first =
                    eq_pos = part.index("=")
                    param = part[:eq_pos].strip().lower()
                    value = part[eq_pos + 1 :].strip().rstrip(",")
                    # Remove quotes from string values
                    if value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    elif value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    current_params[param] = value

    # Handle unclosed namelist
    if current_namelist:
        namelists[current_namelist] = current_params

    return namelists, namelist_lines


def parse_qe_cards(content: str) -> Tuple[Dict[str, List[str]], Dict[str, int]]:
    """Parse Quantum ESPRESSO cards.

    Args:
        content: Full file content

    Returns:
        Tuple of:
            - Dict mapping card name -> list of content lines
            - Dict mapping card name -> line number
    """
    cards: Dict[str, List[str]] = {}
    card_lines: Dict[str, int] = {}

    # Pattern to match card start (all caps, may have options in parentheses)
    card_pattern = re.compile(r"^([A-Z][A-Z_]+)(?:\s+|\s*\().*$|^([A-Z][A-Z_]+)\s*$")

    lines = content.split("\n")
    current_card: Optional[str] = None
    current_content: List[str] = []
    in_namelist = False

    for line_idx, line in enumerate(lines):
        line_number = line_idx + 1
        stripped = line.strip()

        # Track if we're in a namelist
        if stripped.startswith("&"):
            in_namelist = True
            continue
        if stripped == "/" and in_namelist:
            in_namelist = False
            continue

        # Skip if in namelist
        if in_namelist:
            continue

        # Skip empty lines and comments at card detection
        if not stripped or stripped.startswith("!") or stripped.startswith("#"):
            if current_card:
                current_content.append(line)
            continue

        # Check for card start
        match = card_pattern.match(stripped)
        if match:
            card_name = match.group(1) or match.group(2)
            if card_name in KNOWN_CARDS:
                # Save previous card
                if current_card:
                    cards[current_card] = current_content
                current_card = card_name
                current_content = []
                card_lines[card_name] = line_number
                continue

        # Add content to current card
        if current_card:
            current_content.append(stripped)

    # Save last card
    if current_card:
        cards[current_card] = current_content

    return cards, card_lines


# =============================================================================
# Validation Checks
# =============================================================================


def check_required_namelists(
    namelists: Dict[str, Dict[str, str]],
    namelist_lines: Dict[str, int],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check that required namelists are present.

    Args:
        namelists: Parsed namelists
        namelist_lines: Line numbers for namelists

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = []

    for required in REQUIRED_NAMELISTS:
        checks.append(f"required_{required.lower()}")
        if required not in namelists:
            issues.append(
                ValidationIssue(
                    code=f"L1_MISSING_{required}",
                    message=f"Missing required namelist: &{required}",
                    severity="error",
                    suggestion=f"Add '&{required}' namelist with required parameters",
                )
            )

    return issues, checks


def check_namelist_closure(content: str) -> Tuple[List[ValidationIssue], List[str]]:
    """Check that namelists are properly closed.

    Args:
        content: Full file content

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = ["namelist_closure"]

    lines = content.split("\n")
    open_namelists: List[Tuple[str, int]] = []

    for line_idx, line in enumerate(lines):
        line_number = line_idx + 1
        stripped = line.strip()

        # Check for namelist start
        if stripped.startswith("&"):
            name = stripped[1:].strip().upper()
            open_namelists.append((name, line_number))

        # Check for namelist end
        if stripped == "/":
            if open_namelists:
                open_namelists.pop()
            else:
                issues.append(
                    ValidationIssue(
                        code="L1_NAMELIST_ORPHAN_CLOSE",
                        message="Found '/' without open namelist",
                        severity="warning",
                        line_number=line_number,
                    )
                )

    # Report unclosed namelists
    for name, line_num in open_namelists:
        issues.append(
            ValidationIssue(
                code="L1_NAMELIST_UNCLOSED",
                message=f"Namelist &{name} is not closed",
                severity="error",
                line_number=line_num,
                suggestion="Add '/' to close the namelist",
            )
        )

    return issues, checks


def check_required_cards(
    cards: Dict[str, List[str]],
    card_lines: Dict[str, int],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check that required cards are present.

    Args:
        cards: Parsed cards
        card_lines: Line numbers for cards

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = []

    for required in REQUIRED_CARDS:
        checks.append(f"required_{required.lower()}")
        if required not in cards:
            issues.append(
                ValidationIssue(
                    code=f"L1_MISSING_{required}",
                    message=f"Missing required card: {required}",
                    severity="error",
                    suggestion=f"Add '{required}' card",
                )
            )

    return issues, checks


def check_system_params(
    namelists: Dict[str, Dict[str, str]],
    namelist_lines: Dict[str, int],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check required parameters in &SYSTEM.

    Args:
        namelists: Parsed namelists
        namelist_lines: Line numbers for namelists

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = []

    if "SYSTEM" not in namelists:
        return issues, checks

    system = namelists["SYSTEM"]

    for param in REQUIRED_SYSTEM_PARAMS:
        checks.append(f"system_{param}")
        if param not in system:
            issues.append(
                ValidationIssue(
                    code=f"L1_MISSING_{param.upper()}",
                    message=f"Missing required parameter in &SYSTEM: {param}",
                    severity="error",
                    line_number=namelist_lines.get("SYSTEM"),
                    suggestion=f"Add '{param} = <value>' to &SYSTEM namelist",
                )
            )

    # Check ecutwfc (required for most calculations)
    checks.append("system_ecutwfc")
    if "ecutwfc" not in system:
        issues.append(
            ValidationIssue(
                code="L1_MISSING_ECUTWFC",
                message="Missing ecutwfc in &SYSTEM (wavefunction cutoff)",
                severity="error",
                line_number=namelist_lines.get("SYSTEM"),
                suggestion="Add 'ecutwfc = <value>' to &SYSTEM namelist",
            )
        )

    return issues, checks


def check_nat_consistency(
    namelists: Dict[str, Dict[str, str]],
    cards: Dict[str, List[str]],
    namelist_lines: Dict[str, int],
    card_lines: Dict[str, int],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check that nat matches ATOMIC_POSITIONS count.

    Args:
        namelists: Parsed namelists
        cards: Parsed cards
        namelist_lines: Line numbers for namelists
        card_lines: Line numbers for cards

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = ["nat_consistency"]

    if "SYSTEM" not in namelists or "ATOMIC_POSITIONS" not in cards:
        return issues, checks

    system = namelists["SYSTEM"]
    if "nat" not in system:
        return issues, checks

    try:
        nat = int(system["nat"])
    except ValueError:
        return issues, checks

    # Count non-empty lines in ATOMIC_POSITIONS
    positions = cards["ATOMIC_POSITIONS"]
    position_count = sum(
        1
        for line in positions
        if line.strip() and not line.strip().startswith("!")
    )

    if position_count != nat:
        issues.append(
            ValidationIssue(
                code="L1_NAT_MISMATCH",
                message=f"nat = {nat} but ATOMIC_POSITIONS has {position_count} entries",
                severity="error",
                line_number=card_lines.get("ATOMIC_POSITIONS"),
                suggestion=f"Update nat to {position_count} or fix ATOMIC_POSITIONS",
            )
        )

    return issues, checks


def check_ntyp_consistency(
    namelists: Dict[str, Dict[str, str]],
    cards: Dict[str, List[str]],
    namelist_lines: Dict[str, int],
    card_lines: Dict[str, int],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check that ntyp matches ATOMIC_SPECIES count.

    Args:
        namelists: Parsed namelists
        cards: Parsed cards
        namelist_lines: Line numbers for namelists
        card_lines: Line numbers for cards

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = ["ntyp_consistency"]

    if "SYSTEM" not in namelists or "ATOMIC_SPECIES" not in cards:
        return issues, checks

    system = namelists["SYSTEM"]
    if "ntyp" not in system:
        return issues, checks

    try:
        ntyp = int(system["ntyp"])
    except ValueError:
        return issues, checks

    # Count non-empty lines in ATOMIC_SPECIES
    species = cards["ATOMIC_SPECIES"]
    species_count = sum(
        1
        for line in species
        if line.strip() and not line.strip().startswith("!")
    )

    if species_count != ntyp:
        issues.append(
            ValidationIssue(
                code="L1_NTYP_MISMATCH",
                message=f"ntyp = {ntyp} but ATOMIC_SPECIES has {species_count} entries",
                severity="error",
                line_number=card_lines.get("ATOMIC_SPECIES"),
                suggestion=f"Update ntyp to {species_count} or fix ATOMIC_SPECIES",
            )
        )

    return issues, checks


def check_species_consistency(
    cards: Dict[str, List[str]],
    card_lines: Dict[str, int],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check that all species in ATOMIC_POSITIONS are defined in ATOMIC_SPECIES.

    Args:
        cards: Parsed cards
        card_lines: Line numbers for cards

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = ["species_consistency"]

    if "ATOMIC_SPECIES" not in cards or "ATOMIC_POSITIONS" not in cards:
        return issues, checks

    # Get defined species
    defined_species = set()
    for line in cards["ATOMIC_SPECIES"]:
        parts = line.split()
        if parts and not line.strip().startswith("!"):
            defined_species.add(parts[0])

    # Check used species
    used_species = set()
    for line in cards["ATOMIC_POSITIONS"]:
        parts = line.split()
        if parts and not line.strip().startswith("!"):
            used_species.add(parts[0])

    # Find undefined species
    undefined = used_species - defined_species
    if undefined:
        issues.append(
            ValidationIssue(
                code="L1_SPECIES_MISMATCH",
                message=f"Species in ATOMIC_POSITIONS not defined in ATOMIC_SPECIES: {', '.join(sorted(undefined))}",
                severity="error",
                line_number=card_lines.get("ATOMIC_POSITIONS"),
                suggestion="Add missing species to ATOMIC_SPECIES card",
            )
        )

    return issues, checks


def check_cell_definition(
    namelists: Dict[str, Dict[str, str]],
    cards: Dict[str, List[str]],
    namelist_lines: Dict[str, int],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check that cell is properly defined.

    Args:
        namelists: Parsed namelists
        cards: Parsed cards
        namelist_lines: Line numbers for namelists

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = ["cell_definition"]

    if "SYSTEM" not in namelists:
        return issues, checks

    system = namelists["SYSTEM"]

    # Check if ibrav is defined
    ibrav = system.get("ibrav")
    has_cell_params = "CELL_PARAMETERS" in cards

    if ibrav is None and not has_cell_params:
        issues.append(
            ValidationIssue(
                code="L1_MISSING_CELL",
                message="No cell definition found (need ibrav or CELL_PARAMETERS)",
                severity="error",
                line_number=namelist_lines.get("SYSTEM"),
                suggestion="Add 'ibrav = <value>' or CELL_PARAMETERS card",
            )
        )
    elif ibrav == "0" and not has_cell_params:
        issues.append(
            ValidationIssue(
                code="L1_MISSING_CELL",
                message="ibrav = 0 but no CELL_PARAMETERS card found",
                severity="error",
                line_number=namelist_lines.get("SYSTEM"),
                suggestion="Add CELL_PARAMETERS card with lattice vectors",
            )
        )

    return issues, checks


def check_reasonableness(
    namelists: Dict[str, Dict[str, str]],
    namelist_lines: Dict[str, int],
) -> Tuple[List[ValidationIssue], List[str]]:
    """Check for reasonable values (warnings only).

    Args:
        namelists: Parsed namelists
        namelist_lines: Line numbers for namelists

    Returns:
        Tuple of (issues, checks_performed)
    """
    issues = []
    checks = ["reasonableness"]

    if "SYSTEM" not in namelists:
        return issues, checks

    system = namelists["SYSTEM"]

    # Check ecutwfc range
    if "ecutwfc" in system:
        try:
            ecutwfc = float(system["ecutwfc"])
            if ecutwfc < 10:
                issues.append(
                    ValidationIssue(
                        code="L1_ECUTWFC_LOW",
                        message=f"ecutwfc = {ecutwfc} Ry is unusually low",
                        severity="warning",
                        line_number=namelist_lines.get("SYSTEM"),
                        suggestion="Typical values are 30-100 Ry depending on pseudopotential",
                    )
                )
            elif ecutwfc > 200:
                issues.append(
                    ValidationIssue(
                        code="L1_ECUTWFC_HIGH",
                        message=f"ecutwfc = {ecutwfc} Ry is unusually high",
                        severity="warning",
                        line_number=namelist_lines.get("SYSTEM"),
                        suggestion="Check if such high cutoff is necessary",
                    )
                )
        except ValueError:
            pass

    # Check ecutrho ratio
    if "ecutwfc" in system and "ecutrho" in system:
        try:
            ecutwfc = float(system["ecutwfc"])
            ecutrho = float(system["ecutrho"])
            ratio = ecutrho / ecutwfc if ecutwfc > 0 else 0
            if ratio < 4:
                issues.append(
                    ValidationIssue(
                        code="L1_ECUTRHO_RATIO_LOW",
                        message=f"ecutrho/ecutwfc ratio = {ratio:.1f} is low (typically >= 4)",
                        severity="warning",
                        line_number=namelist_lines.get("SYSTEM"),
                        suggestion="For NC pseudopotentials use 4x, for US/PAW use 8-12x",
                    )
                )
        except ValueError:
            pass

    return issues, checks


# =============================================================================
# Main Validation Functions
# =============================================================================


def validate_l1_qe_content(content: str) -> L1QEResult:
    """Validate QE content for syntax correctness.

    Args:
        content: QE input file content

    Returns:
        L1QEResult with validation results
    """
    # Parse namelists and cards
    namelists, namelist_lines = parse_qe_namelists(content)
    cards, card_lines = parse_qe_cards(content)

    # Collect all issues
    all_errors: List[ValidationIssue] = []
    all_warnings: List[ValidationIssue] = []
    all_checks: List[str] = []

    # Run checks
    checks = [
        (check_required_namelists, (namelists, namelist_lines)),
        (check_namelist_closure, (content,)),
        (check_required_cards, (cards, card_lines)),
        (check_system_params, (namelists, namelist_lines)),
        (check_nat_consistency, (namelists, cards, namelist_lines, card_lines)),
        (check_ntyp_consistency, (namelists, cards, namelist_lines, card_lines)),
        (check_species_consistency, (cards, card_lines)),
        (check_cell_definition, (namelists, cards, namelist_lines)),
        (check_reasonableness, (namelists, namelist_lines)),
    ]

    for check_func, args in checks:
        issues, check_names = check_func(*args)
        all_checks.extend(check_names)
        for issue in issues:
            if issue.severity == "error":
                all_errors.append(issue)
            else:
                all_warnings.append(issue)

    return L1QEResult(
        passed=len(all_errors) == 0,
        errors=[e.to_dict() for e in all_errors],
        warnings=[w.to_dict() for w in all_warnings],
        checks_performed=all_checks,
        namelists_found=list(namelists.keys()),
        cards_found=list(cards.keys()),
    )


def validate_l1_qe(file_path: Union[str, Path]) -> L1QEResult:
    """Validate a QE input file for syntax correctness.

    Args:
        file_path: Path to QE input file

    Returns:
        L1QEResult with validation results
    """
    path = Path(file_path)

    # Check file exists
    if not path.exists():
        return L1QEResult(
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
            return L1QEResult(
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
        return L1QEResult(
            passed=False,
            errors=[
                ValidationIssue(
                    code="L1_READ_ERROR",
                    message=f"Cannot read file: {e}",
                    severity="error",
                ).to_dict()
            ],
        )

    return validate_l1_qe_content(content)


def format_l1_qe_report(result: L1QEResult) -> str:
    """Format L1 QE validation result as human-readable report.

    Args:
        result: L1QEResult to format

    Returns:
        Markdown-formatted report string
    """
    lines = []

    # Header
    status = "PASSED" if result.passed else "FAILED"
    lines.append(f"## L1 QE Validation: {status}")
    lines.append("")

    # Summary
    lines.append(f"**Errors:** {len(result.errors)}")
    lines.append(f"**Warnings:** {len(result.warnings)}")
    lines.append(f"**Namelists found:** {', '.join(result.namelists_found) or 'None'}")
    lines.append(f"**Cards found:** {', '.join(result.cards_found) or 'None'}")
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
    "REQUIRED_NAMELISTS",
    "REQUIRED_CARDS",
    "ValidationIssue",
    "L1QEResult",
    "parse_qe_namelists",
    "parse_qe_cards",
    "validate_l1_qe",
    "validate_l1_qe_content",
    "format_l1_qe_report",
]
