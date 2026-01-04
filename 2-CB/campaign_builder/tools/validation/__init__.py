"""
Validation tools for Campaign Builder.

This module provides validators for:
    - L0: Template completeness (placeholder detection)
    - L1: Syntax validation (LAMMPS and Quantum ESPRESSO)
    - L2: Engine acceptance (actual engine execution)
    - L3: Physical reasonableness checks

Usage:
    from campaign_builder.tools.validation import (
        validate_deck,
        validate_l0,
        validate_l1_lammps,
        validate_l1_qe,
        validate_l2,
        validate_l3,
    )

    # Full validation
    result = validate_deck(Path("input.lmp"), engine="lammps")

    # Individual validators
    l0_result = validate_l0(Path("input.lmp"))
    l1_result = validate_l1_lammps(Path("input.lmp"))
"""

# L0 - Template completeness
from .l0_templates import (
    PLACEHOLDER_PATTERNS,
    PlaceholderMatch,
    L0Result,
    validate_l0,
    validate_l0_content,
    format_l0_report,
)

# L1 LAMMPS - Syntax validation
from .l1_lammps import (
    REQUIRED_COMMANDS,
    LAMMPSCommand,
    L1LAMMPSResult,
    parse_lammps_commands,
    validate_l1_lammps,
    validate_l1_lammps_content,
    format_l1_lammps_report,
)

# L1 QE - Syntax validation
from .l1_qe import (
    REQUIRED_NAMELISTS,
    REQUIRED_CARDS,
    L1QEResult,
    parse_qe_namelists,
    parse_qe_cards,
    validate_l1_qe,
    validate_l1_qe_content,
    format_l1_qe_report,
)

# L2 - Engine acceptance
from .l2_engine import (
    DEFAULT_LAMMPS_PATH,
    DEFAULT_QE_PATH,
    L2Result,
    find_lammps_binary,
    find_qe_binary,
    validate_l2,
    validate_l2_lammps,
    validate_l2_qe,
    format_l2_report,
)

# L3 - Physical reasonableness
from .l3_physics import (
    PhysicsCheck,
    L3Result,
    validate_l3,
    validate_l3_content,
    validate_l3_lammps,
    validate_l3_qe,
    format_l3_report,
)

# Unified validator
from .validator import (
    ALL_LEVELS,
    DEFAULT_LEVELS,
    BLOCKING_LEVELS,
    ValidationResult,
    validate_deck,
    validate_deck_content,
    format_validation_report,
    suggest_repairs,
)

# Import ValidationIssue from l1_lammps (canonical location)
from .l1_lammps import ValidationIssue


__all__ = [
    # L0
    "PLACEHOLDER_PATTERNS",
    "PlaceholderMatch",
    "L0Result",
    "validate_l0",
    "validate_l0_content",
    "format_l0_report",
    # L1 LAMMPS
    "REQUIRED_COMMANDS",
    "LAMMPSCommand",
    "L1LAMMPSResult",
    "parse_lammps_commands",
    "validate_l1_lammps",
    "validate_l1_lammps_content",
    "format_l1_lammps_report",
    # L1 QE
    "REQUIRED_NAMELISTS",
    "REQUIRED_CARDS",
    "L1QEResult",
    "parse_qe_namelists",
    "parse_qe_cards",
    "validate_l1_qe",
    "validate_l1_qe_content",
    "format_l1_qe_report",
    # L2
    "DEFAULT_LAMMPS_PATH",
    "DEFAULT_QE_PATH",
    "L2Result",
    "find_lammps_binary",
    "find_qe_binary",
    "validate_l2",
    "validate_l2_lammps",
    "validate_l2_qe",
    "format_l2_report",
    # L3
    "PhysicsCheck",
    "L3Result",
    "validate_l3",
    "validate_l3_content",
    "validate_l3_lammps",
    "validate_l3_qe",
    "format_l3_report",
    # Unified
    "ALL_LEVELS",
    "DEFAULT_LEVELS",
    "BLOCKING_LEVELS",
    "ValidationResult",
    "ValidationIssue",
    "validate_deck",
    "validate_deck_content",
    "format_validation_report",
    "suggest_repairs",
]
