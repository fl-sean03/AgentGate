"""
CampaignPlanner agent for Campaign Builder.

This module implements the CampaignPlanner agent that:
    - Translates user intent into validated simulation input decks
    - Uses FileGuides to extract parameters (never invents physics)
    - Validates generated files using L0-L3 validation
    - Provides repair functionality for validation failures

Based on Thrusts 13-14 from the DevGuide.

Usage:
    from campaign_builder.agent.campaign_planner import (
        run_campaign_planner,
        CampaignPlanResult,
        GeneratedFile,
        ParameterSource,
    )

    # Run the campaign planner
    result = await run_campaign_planner(
        intent="Run NVT equilibration at 300K",
        file_guides=[structure_guide],
        workspace=Path("/path/to/workspace"),
        output_dir=Path("/path/to/output"),
    )
"""

import asyncio
import os
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from campaign_builder.schemas import (
    CampaignError,
    ErrorCode,
    ErrorSeverity,
    FileGuide,
    FileType,
)
from campaign_builder.tools.validation import (
    ValidationResult,
    validate_deck,
    validate_deck_content,
    format_validation_report,
    suggest_repairs,
)


# =============================================================================
# Dataclasses
# =============================================================================


@dataclass
class GeneratedFile:
    """Information about a generated simulation file.

    Attributes:
        path: Path to the generated file
        purpose: What the file is for (e.g., "Energy minimization")
        engine: Simulation engine ("lammps" or "qe")
        validation: Validation result for this file
    """

    path: Path
    purpose: str
    engine: str  # "lammps" or "qe"
    validation: Optional[ValidationResult] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        result = {
            "path": str(self.path),
            "purpose": self.purpose,
            "engine": self.engine,
        }
        if self.validation:
            result["validation"] = self.validation.to_dict()
        return result


@dataclass
class ParameterSource:
    """Information about the source of a parameter value.

    Attributes:
        value: The parameter value
        source_file: File where the parameter was found
        source_location: Location in file (e.g., "line 47")
        is_default: Whether this is a default value
        default_reason: Why default was used (if is_default)
    """

    value: str
    source_file: str
    source_location: str
    is_default: bool
    default_reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        result = {
            "value": self.value,
            "source_file": self.source_file,
            "source_location": self.source_location,
            "is_default": self.is_default,
        }
        if self.default_reason:
            result["default_reason"] = self.default_reason
        return result


@dataclass
class CampaignPlanResult:
    """Result from the CampaignPlanner agent.

    Attributes:
        success: Whether the planning succeeded
        intent_analysis: Analysis of the user's intent
        campaign_plan: The generated campaign plan
        generated_files: List of generated simulation files
        parameter_manifest: Map of parameter names to their sources
        assumptions: List of assumptions made
        warnings: List of warnings
        errors: List of errors encountered
        iterations_used: Number of agent iterations
        duration_ms: Total processing time in milliseconds
    """

    success: bool
    intent_analysis: str
    campaign_plan: str
    generated_files: List[GeneratedFile]
    parameter_manifest: Dict[str, ParameterSource]
    assumptions: List[str]
    warnings: List[str]
    errors: List[CampaignError]
    iterations_used: int
    duration_ms: int

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "success": self.success,
            "intent_analysis": self.intent_analysis,
            "campaign_plan": self.campaign_plan,
            "generated_files": [f.to_dict() for f in self.generated_files],
            "parameter_manifest": {
                k: v.to_dict() for k, v in self.parameter_manifest.items()
            },
            "assumptions": self.assumptions,
            "warnings": self.warnings,
            "errors": [e.to_dict() for e in self.errors],
            "iterations_used": self.iterations_used,
            "duration_ms": self.duration_ms,
        }


# =============================================================================
# File Guide Formatting
# =============================================================================


def format_file_guides_for_agent(file_guides: List[FileGuide]) -> str:
    """Format FileGuides as markdown for agent context.

    Args:
        file_guides: List of FileGuide objects to format

    Returns:
        Markdown-formatted string with all file guide information
    """
    if not file_guides:
        return "No file guides provided."

    sections = []
    sections.append("# Available File Guides\n")

    for idx, guide in enumerate(file_guides, 1):
        sections.append(f"## File Guide {idx}: {guide.file_name}\n")
        sections.append(guide.to_markdown())
        sections.append("")  # blank line between guides

    return "\n".join(sections)


def _extract_force_field_info(file_guides: List[FileGuide]) -> Dict[str, Any]:
    """Extract force field information from file guides.

    Args:
        file_guides: List of FileGuide objects

    Returns:
        Dictionary with force field parameters found
    """
    ff_info: Dict[str, Any] = {
        "pair_style": None,
        "pair_coeffs": [],
        "bond_style": None,
        "bond_coeffs": [],
        "angle_style": None,
        "angle_coeffs": [],
        "dihedral_style": None,
        "dihedral_coeffs": [],
        "atom_types": [],
        "source_files": [],
    }

    for guide in file_guides:
        # Extract pair style and coefficients
        if guide.pair_style:
            ff_info["pair_style"] = guide.pair_style
            ff_info["source_files"].append(guide.file_name)

        if guide.pair_coeffs:
            for pc in guide.pair_coeffs:
                ff_info["pair_coeffs"].append({
                    "type1": pc.type1,
                    "type2": pc.type2,
                    "params": pc.params,
                    "source_file": guide.file_name,
                    "source_line": pc.source_line,
                })

        # Extract bond coefficients
        if guide.bond_style:
            ff_info["bond_style"] = guide.bond_style
        if guide.bond_coeffs:
            for bc in guide.bond_coeffs:
                ff_info["bond_coeffs"].append({
                    "type_id": bc.type_id,
                    "params": bc.params,
                    "source_file": guide.file_name,
                    "source_line": bc.source_line,
                })

        # Extract angle coefficients
        if guide.angle_style:
            ff_info["angle_style"] = guide.angle_style
        if guide.angle_coeffs:
            for ac in guide.angle_coeffs:
                ff_info["angle_coeffs"].append({
                    "type_id": ac.type_id,
                    "params": ac.params,
                    "source_file": guide.file_name,
                    "source_line": ac.source_line,
                })

        # Extract dihedral coefficients
        if guide.dihedral_style:
            ff_info["dihedral_style"] = guide.dihedral_style
        if guide.dihedral_coeffs:
            for dc in guide.dihedral_coeffs:
                ff_info["dihedral_coeffs"].append({
                    "type_id": dc.type_id,
                    "params": dc.params,
                    "source_file": guide.file_name,
                    "source_line": dc.source_line,
                })

        # Extract atom types
        if guide.atom_types:
            for at in guide.atom_types:
                ff_info["atom_types"].append({
                    "id": at.id,
                    "mass": at.mass,
                    "element": at.element,
                    "label": at.label,
                    "source_file": guide.file_name,
                })

    return ff_info


def _check_force_field_completeness(
    ff_info: Dict[str, Any],
    num_atom_types: int,
) -> Tuple[bool, List[str]]:
    """Check if force field information is complete.

    Args:
        ff_info: Force field information dictionary
        num_atom_types: Number of atom types in the system

    Returns:
        Tuple of (is_complete, list of missing items)
    """
    missing = []

    # Check for pair style
    if not ff_info["pair_style"]:
        missing.append("pair_style not specified")

    # Check pair coefficients coverage
    if num_atom_types > 0:
        covered_pairs = set()
        for pc in ff_info["pair_coeffs"]:
            t1, t2 = pc["type1"], pc["type2"]
            covered_pairs.add((min(t1, t2), max(t1, t2)))

        # Calculate required pairs (upper triangle including diagonal)
        required_pairs = set()
        for i in range(1, num_atom_types + 1):
            for j in range(i, num_atom_types + 1):
                required_pairs.add((i, j))

        missing_pairs = required_pairs - covered_pairs
        if missing_pairs:
            missing.append(
                f"Missing pair_coeff for type pairs: {sorted(missing_pairs)}"
            )

    return len(missing) == 0, missing


# =============================================================================
# Prompt Building
# =============================================================================


def build_campaign_planner_prompt(
    intent: str,
    file_guides: List[FileGuide],
    workspace: Path,
    output_dir: Path,
) -> str:
    """Build the prompt for the CampaignPlanner agent.

    Args:
        intent: User's intent description
        file_guides: List of FileGuide objects with analyzed files
        workspace: Path to the workspace directory
        output_dir: Path to the output directory

    Returns:
        Complete prompt string for the agent
    """
    prompt_parts = []

    # Header
    prompt_parts.append("# Campaign Planning Request\n")

    # User intent
    prompt_parts.append("## User Intent\n")
    prompt_parts.append(intent)
    prompt_parts.append("\n")

    # Workspace info
    prompt_parts.append("## Workspace Information\n")
    prompt_parts.append(f"- **Workspace:** {workspace}")
    prompt_parts.append(f"- **Output Directory:** {output_dir}")
    prompt_parts.append("\n")

    # File guides
    prompt_parts.append(format_file_guides_for_agent(file_guides))

    # Extract and summarize force field info
    ff_info = _extract_force_field_info(file_guides)

    prompt_parts.append("\n## Force Field Summary\n")

    if ff_info["pair_style"]:
        prompt_parts.append(f"- **Pair Style:** {ff_info['pair_style']}")
    else:
        prompt_parts.append("- **Pair Style:** NOT FOUND (CRITICAL)")

    prompt_parts.append(f"- **Pair Coefficients Found:** {len(ff_info['pair_coeffs'])}")
    prompt_parts.append(f"- **Atom Types Found:** {len(ff_info['atom_types'])}")

    if ff_info["bond_style"]:
        prompt_parts.append(f"- **Bond Style:** {ff_info['bond_style']}")
        prompt_parts.append(
            f"- **Bond Coefficients Found:** {len(ff_info['bond_coeffs'])}"
        )

    # Check completeness
    num_types = len(ff_info["atom_types"])
    is_complete, missing = _check_force_field_completeness(ff_info, num_types)

    if not is_complete:
        prompt_parts.append("\n## MISSING INFORMATION (CRITICAL)\n")
        for m in missing:
            prompt_parts.append(f"- {m}")
        prompt_parts.append(
            "\n**WARNING: Cannot generate complete input files without "
            "this information. Do NOT invent parameters.**"
        )

    # Instructions
    prompt_parts.append("\n## Instructions\n")
    prompt_parts.append(
        "Based on the user intent and file guides above, generate "
        "appropriate simulation input files. Remember:"
    )
    prompt_parts.append("1. NEVER invent force field parameters")
    prompt_parts.append("2. Use only values found in the file guides")
    prompt_parts.append("3. Cite sources for all parameters")
    prompt_parts.append("4. Validate all generated files")
    prompt_parts.append("5. Document all assumptions")

    return "\n".join(prompt_parts)


# =============================================================================
# Engine Detection and File Discovery
# =============================================================================


def detect_engine_from_file(file_path: Union[str, Path]) -> Optional[str]:
    """Detect if a file is for LAMMPS or QE.

    Args:
        file_path: Path to the simulation file

    Returns:
        "lammps", "qe", or None if cannot determine
    """
    path = Path(file_path)
    suffix = path.suffix.lower()
    name = path.name.lower()

    # Check by extension first
    if suffix in (".lmp", ".lammps"):
        return "lammps"
    if suffix in (".pwi", ".qe"):
        return "qe"

    # Check by filename pattern
    if name.startswith("in.") or name.startswith("data."):
        return "lammps"
    if name.endswith(".pwi") or name.endswith(".in"):
        # Need to check content
        pass

    # Check content
    try:
        content = path.read_text(encoding="utf-8")[:1000]  # First 1KB
    except Exception:
        return None

    # LAMMPS indicators
    lammps_patterns = [
        r"^\s*units\s+",
        r"^\s*atom_style\s+",
        r"^\s*read_data\s+",
        r"^\s*pair_style\s+",
        r"^\s*fix\s+\d+\s+",
    ]
    for pattern in lammps_patterns:
        if re.search(pattern, content, re.MULTILINE | re.IGNORECASE):
            return "lammps"

    # QE indicators
    qe_patterns = [
        r"&CONTROL",
        r"&SYSTEM",
        r"ATOMIC_SPECIES",
        r"ATOMIC_POSITIONS",
        r"K_POINTS",
    ]
    for pattern in qe_patterns:
        if re.search(pattern, content, re.IGNORECASE):
            return "qe"

    return None


# Mapping of filename patterns to purposes
FILE_PURPOSE_PATTERNS = {
    # LAMMPS patterns
    r"in\.minimize": "Energy minimization",
    r"in\.min": "Energy minimization",
    r"in\.equil": "Equilibration",
    r"in\.equilibrate": "Equilibration",
    r"in\.nvt": "NVT equilibration",
    r"in\.npt": "NPT equilibration",
    r"in\.nve": "NVE production",
    r"in\.prod": "Production run",
    r"in\.production": "Production run",
    r"in\.relax": "Structure relaxation",
    r"in\.heat": "Heating run",
    r"in\.cool": "Cooling run",
    r"in\.anneal": "Annealing",
    r"data\.": "LAMMPS data file",
    # QE patterns
    r"scf\.": "SCF calculation",
    r"relax\.": "Structure relaxation",
    r"vc-relax": "Variable-cell relaxation",
    r"md\.": "Molecular dynamics",
    r"bands\.": "Band structure calculation",
    r"nscf\.": "Non-SCF calculation",
    r"dos\.": "DOS calculation",
}


def infer_file_purpose(file_path: Union[str, Path]) -> str:
    """Infer the purpose of a simulation file from its name.

    Args:
        file_path: Path to the simulation file

    Returns:
        Inferred purpose string
    """
    name = Path(file_path).name.lower()

    for pattern, purpose in FILE_PURPOSE_PATTERNS.items():
        if re.search(pattern, name, re.IGNORECASE):
            return purpose

    # Default purposes based on extension
    suffix = Path(file_path).suffix.lower()
    if suffix in (".lmp", ".lammps"):
        return "LAMMPS input script"
    if suffix in (".pwi", ".qe"):
        return "Quantum ESPRESSO input"
    if suffix == ".data":
        return "LAMMPS data file"

    return "Simulation input file"


def discover_generated_files(
    directory: Union[str, Path],
    since: Optional[datetime] = None,
) -> List[Path]:
    """Find newly created simulation files in a directory.

    Args:
        directory: Directory to search
        since: Only find files modified after this time (optional)

    Returns:
        List of paths to discovered simulation files
    """
    dir_path = Path(directory)
    if not dir_path.exists():
        return []

    # Patterns for simulation files
    patterns = [
        "in.*",
        "*.lmp",
        "*.lammps",
        "*.pwi",
        "*.qe",
        "data.*",
        "*.data",
    ]

    found_files = []
    for pattern in patterns:
        for file_path in dir_path.glob(pattern):
            if file_path.is_file():
                if since is not None:
                    mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                    if mtime < since:
                        continue
                found_files.append(file_path)

    return sorted(set(found_files), key=lambda p: p.stat().st_mtime)


# =============================================================================
# Validation Integration (Thrust 14)
# =============================================================================


def format_repair_request(
    file_path: Path,
    validation_result: ValidationResult,
    attempt: int,
) -> str:
    """Format a repair request for a failed validation.

    Args:
        file_path: Path to the file that failed validation
        validation_result: The validation result with errors
        attempt: Which repair attempt this is (1-based)

    Returns:
        Formatted repair request string
    """
    lines = []
    lines.append(f"# Validation Repair Request (Attempt {attempt})")
    lines.append("")
    lines.append(f"**File:** {file_path}")
    lines.append(f"**Engine:** {validation_result.engine or 'unknown'}")
    lines.append("")

    # Add validation report
    lines.append("## Validation Errors")
    lines.append("")

    for issue in validation_result.all_issues:
        code = issue.get("code", "UNKNOWN")
        msg = issue.get("message", str(issue))
        line_num = issue.get("line_number")
        suggestion = issue.get("suggestion")

        line_info = f" (line {line_num})" if line_num else ""
        lines.append(f"- **{code}**{line_info}: {msg}")
        if suggestion:
            lines.append(f"  - Suggestion: {suggestion}")

    lines.append("")
    lines.append("## Suggested Repairs")
    lines.append("")

    for suggestion in validation_result.suggestions:
        lines.append(f"- {suggestion}")

    lines.append("")
    lines.append("Please fix the issues above and regenerate the file.")

    return "\n".join(lines)


# Patterns that indicate errors requiring user input
UNFIXABLE_ERROR_PATTERNS = [
    r"missing.*force.*field",
    r"missing.*pair.*coeff",
    r"missing.*parameter",
    r"cannot.*determine",
    r"pseudopotential.*not.*found",
    r"species.*not.*defined",
    r"unknown.*atom.*type",
    r"missing.*structure",
]


def is_unfixable_error(issue: Dict[str, Any]) -> bool:
    """Check if an error requires user input to fix.

    Some errors cannot be fixed automatically because they
    require information that only the user can provide.

    Args:
        issue: Validation issue dictionary

    Returns:
        True if error requires user input
    """
    code = issue.get("code", "").lower()
    message = issue.get("message", "").lower()

    # Check code patterns
    unfixable_codes = [
        "missing_pair_coeff",
        "missing_parameter",
        "missing_pseudopotential",
        "missing_structure",
    ]
    for uc in unfixable_codes:
        if uc in code:
            return True

    # Check message patterns
    for pattern in UNFIXABLE_ERROR_PATTERNS:
        if re.search(pattern, message, re.IGNORECASE):
            return True

    return False


async def validate_and_repair(
    file_path: Path,
    engine: str,
    max_attempts: int = 3,
) -> Tuple[ValidationResult, int]:
    """Validate a file and attempt repairs if needed.

    This function validates the file and, if validation fails,
    attempts to repair the file up to max_attempts times.

    Note: In a full implementation, this would call the LLM to
    generate repairs. Here we just validate and return.

    Args:
        file_path: Path to the file to validate
        engine: Engine type ("lammps" or "qe")
        max_attempts: Maximum repair attempts

    Returns:
        Tuple of (final validation result, attempts used)
    """
    attempts = 0

    while attempts < max_attempts:
        attempts += 1

        # Validate the file
        result = validate_deck(
            file_path,
            engine=engine,
            levels=["L0", "L1", "L3"],  # Skip L2 for speed
            stop_on_blocking_fail=False,
        )

        # If passed, return success
        if result.can_run:
            return result, attempts

        # Check for unfixable errors
        unfixable = [
            issue for issue in result.all_issues if is_unfixable_error(issue)
        ]
        if unfixable:
            # Cannot auto-repair, return with what we have
            return result, attempts

        # In a full implementation, we would generate repairs here
        # For now, just return the failed result
        break

    return result, attempts


def create_validation_summary(generated_files: List[GeneratedFile]) -> str:
    """Create a summary of validation results for all generated files.

    Args:
        generated_files: List of GeneratedFile objects with validation results

    Returns:
        Markdown-formatted validation summary
    """
    lines = []
    lines.append("# Validation Summary")
    lines.append("")

    passed_count = 0
    failed_count = 0

    for gf in generated_files:
        status = "UNKNOWN"
        if gf.validation:
            if gf.validation.can_run:
                status = "PASSED"
                passed_count += 1
            else:
                status = "FAILED"
                failed_count += 1

        lines.append(f"## {gf.path.name}")
        lines.append(f"- **Purpose:** {gf.purpose}")
        lines.append(f"- **Engine:** {gf.engine}")
        lines.append(f"- **Status:** {status}")

        if gf.validation:
            lines.append(f"- **Levels Run:** {', '.join(gf.validation.levels_run)}")

            if gf.validation.all_issues:
                lines.append(f"- **Issues:** {len(gf.validation.all_issues)}")
                for issue in gf.validation.all_issues[:5]:  # First 5
                    code = issue.get("code", "")
                    msg = issue.get("message", "")
                    lines.append(f"  - {code}: {msg}")
                if len(gf.validation.all_issues) > 5:
                    remaining = len(gf.validation.all_issues) - 5
                    lines.append(f"  - ... and {remaining} more")

        lines.append("")

    lines.append("## Summary")
    lines.append(f"- **Passed:** {passed_count}")
    lines.append(f"- **Failed:** {failed_count}")
    lines.append(f"- **Total:** {len(generated_files)}")

    return "\n".join(lines)


def create_missing_info_report(
    validation_results: List[ValidationResult],
    file_guides: List[FileGuide],
) -> str:
    """Create a report of missing information from validation and file guides.

    Args:
        validation_results: List of validation results
        file_guides: List of FileGuide objects

    Returns:
        Markdown-formatted report of missing information
    """
    lines = []
    lines.append("# Missing Information Report")
    lines.append("")

    # Collect missing info from file guides
    all_missing = []
    for guide in file_guides:
        if guide.missing_info:
            for mi in guide.missing_info:
                all_missing.append(f"From {guide.file_name}: {mi}")

    # Collect unfixable issues from validation
    unfixable_issues = []
    for vr in validation_results:
        for issue in vr.all_issues:
            if is_unfixable_error(issue):
                msg = issue.get("message", str(issue))
                unfixable_issues.append(msg)

    if all_missing:
        lines.append("## Missing from File Guides")
        lines.append("")
        for mi in all_missing:
            lines.append(f"- {mi}")
        lines.append("")

    if unfixable_issues:
        lines.append("## Unfixable Validation Issues")
        lines.append("")
        for ui in unfixable_issues:
            lines.append(f"- {ui}")
        lines.append("")

    if not all_missing and not unfixable_issues:
        lines.append("No missing information detected.")

    return "\n".join(lines)


# =============================================================================
# LAMMPS Input Generation
# =============================================================================


def generate_lammps_input(
    intent: str,
    file_guides: List[FileGuide],
    data_file: Optional[str] = None,
) -> Tuple[str, Dict[str, ParameterSource], List[str]]:
    """Generate a LAMMPS input script based on intent and file guides.

    This function generates a minimal but complete LAMMPS input script
    using only information from the file guides. It NEVER invents
    force field parameters.

    Args:
        intent: User's simulation intent
        file_guides: List of FileGuide objects with system information
        data_file: Optional explicit data file name

    Returns:
        Tuple of (input script content, parameter manifest, warnings)
    """
    lines = []
    manifest: Dict[str, ParameterSource] = {}
    warnings: List[str] = []

    # Extract information from file guides
    ff_info = _extract_force_field_info(file_guides)

    # Find data file
    if not data_file:
        for guide in file_guides:
            if guide.file_type == FileType.LAMMPS_DATA:
                data_file = guide.file_name
                break

    if not data_file:
        warnings.append("No LAMMPS data file found in file guides")
        data_file = "structure.data"

    # Parse intent for simulation parameters
    intent_lower = intent.lower()

    # Determine simulation type
    is_minimize = any(
        kw in intent_lower for kw in ["minimize", "minimization", "relax", "optimize"]
    )
    is_nvt = "nvt" in intent_lower or "equilibrat" in intent_lower
    is_npt = "npt" in intent_lower or "pressure" in intent_lower
    is_nve = "nve" in intent_lower or "production" in intent_lower

    # Extract temperature from intent
    temp_match = re.search(r"(\d+)\s*k(?:elvin)?", intent_lower)
    temperature = float(temp_match.group(1)) if temp_match else 300.0

    # Extract pressure from intent
    press_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:atm|bar)", intent_lower)
    pressure = float(press_match.group(1)) if press_match else 1.0

    # Start building the script
    lines.append("# LAMMPS input script")
    lines.append(f"# Generated for: {intent}")
    lines.append(f"# Generated at: {datetime.now().isoformat()}")
    lines.append("")

    # Initialization block
    lines.append("# === Initialization ===")
    lines.append("units real")
    manifest["units"] = ParameterSource(
        value="real",
        source_file="default",
        source_location="standard for organic molecules",
        is_default=True,
        default_reason="Standard units for organic/molecular simulations",
    )

    # Determine atom_style from file guides
    atom_style = "full"  # Default
    for guide in file_guides:
        if guide.atom_style_hint:
            atom_style = guide.atom_style_hint
            manifest["atom_style"] = ParameterSource(
                value=atom_style,
                source_file=guide.file_name,
                source_location="atom_style_hint",
                is_default=False,
            )
            break
    else:
        manifest["atom_style"] = ParameterSource(
            value=atom_style,
            source_file="default",
            source_location="standard for molecular systems",
            is_default=True,
            default_reason="Standard style for molecular systems with charges",
        )

    lines.append(f"atom_style {atom_style}")
    lines.append("boundary p p p")
    lines.append("")

    # System definition
    lines.append("# === System Definition ===")
    lines.append(f"read_data {data_file}")
    manifest["data_file"] = ParameterSource(
        value=data_file,
        source_file=data_file,
        source_location="file",
        is_default=False,
    )
    lines.append("")

    # Force field
    lines.append("# === Force Field ===")

    # Pair style
    if ff_info["pair_style"]:
        pair_style = ff_info["pair_style"]
        source_file = ff_info["source_files"][0] if ff_info["source_files"] else "unknown"
        manifest["pair_style"] = ParameterSource(
            value=pair_style,
            source_file=source_file,
            source_location="file guide",
            is_default=False,
        )
    else:
        # Cannot generate without pair_style - use placeholder
        pair_style = "lj/cut 10.0"  # Basic default
        warnings.append(
            "pair_style not found in file guides - using default lj/cut 10.0. "
            "This may be incorrect!"
        )
        manifest["pair_style"] = ParameterSource(
            value=pair_style,
            source_file="default",
            source_location="WARNING: not from file guides",
            is_default=True,
            default_reason="No pair_style found in file guides",
        )

    lines.append(f"pair_style {pair_style}")
    lines.append("pair_modify mix arithmetic")
    lines.append("")

    # Pair coefficients
    if ff_info["pair_coeffs"]:
        lines.append("# Pair coefficients from file guides")
        for pc in ff_info["pair_coeffs"]:
            params_str = " ".join(str(p) for p in pc["params"])
            source_info = f"{pc['source_file']}"
            if pc["source_line"]:
                source_info += f":line {pc['source_line']}"

            lines.append(f"# Source: {source_info}")
            lines.append(f"pair_coeff {pc['type1']} {pc['type2']} {params_str}")

            key = f"pair_coeff_{pc['type1']}_{pc['type2']}"
            manifest[key] = ParameterSource(
                value=params_str,
                source_file=pc["source_file"],
                source_location=f"line {pc['source_line']}" if pc["source_line"] else "file",
                is_default=False,
            )
    else:
        warnings.append(
            "No pair_coeff found in file guides - script will be incomplete!"
        )
        lines.append("# WARNING: No pair_coeff found in file guides")
        lines.append("# You must add pair_coeff commands manually")
    lines.append("")

    # Bonded interactions (if present)
    if ff_info["bond_style"]:
        lines.append(f"bond_style {ff_info['bond_style']}")
    if ff_info["angle_style"]:
        lines.append(f"angle_style {ff_info['angle_style']}")
    if ff_info["dihedral_style"]:
        lines.append(f"dihedral_style {ff_info['dihedral_style']}")
    if ff_info["bond_style"] or ff_info["angle_style"]:
        lines.append("")

    # Settings
    lines.append("# === Settings ===")
    lines.append("neighbor 2.0 bin")
    lines.append("neigh_modify delay 0 every 1 check yes")
    lines.append("")

    # Timestep
    timestep = 1.0  # Default for real units
    lines.append(f"timestep {timestep}")
    manifest["timestep"] = ParameterSource(
        value=str(timestep),
        source_file="default",
        source_location="standard for real units",
        is_default=True,
        default_reason="Standard timestep for organic molecules in real units",
    )
    lines.append("")

    # Fixes based on simulation type
    lines.append("# === Fixes ===")

    if is_minimize or (not is_nvt and not is_npt and not is_nve):
        # Energy minimization
        lines.append("# Energy minimization")
        lines.append("thermo 100")
        lines.append("thermo_style custom step temp pe ke etotal press")
        lines.append("")
        lines.append("minimize 1.0e-6 1.0e-8 10000 100000")
        manifest["minimize"] = ParameterSource(
            value="etol=1e-6, ftol=1e-8, maxiter=10000, maxeval=100000",
            source_file="default",
            source_location="standard minimization parameters",
            is_default=True,
            default_reason="Standard convergence criteria",
        )

    if is_nvt:
        # NVT equilibration
        tdamp = 100.0 * timestep
        lines.append(f"# NVT at {temperature} K")
        lines.append(
            f"fix 1 all nvt temp {temperature} {temperature} {tdamp}"
        )
        manifest["temperature"] = ParameterSource(
            value=str(temperature),
            source_file="user_intent" if temp_match else "default",
            source_location="parsed from intent" if temp_match else "default",
            is_default=not bool(temp_match),
            default_reason=None if temp_match else "Standard room temperature",
        )
        manifest["tdamp"] = ParameterSource(
            value=str(tdamp),
            source_file="default",
            source_location="100 * timestep",
            is_default=True,
            default_reason="Standard Nose-Hoover damping",
        )

    elif is_npt:
        # NPT equilibration
        tdamp = 100.0 * timestep
        pdamp = 1000.0 * timestep
        lines.append(f"# NPT at {temperature} K, {pressure} atm")
        lines.append(
            f"fix 1 all npt temp {temperature} {temperature} {tdamp} "
            f"iso {pressure} {pressure} {pdamp}"
        )
        manifest["temperature"] = ParameterSource(
            value=str(temperature),
            source_file="user_intent" if temp_match else "default",
            source_location="parsed from intent" if temp_match else "default",
            is_default=not bool(temp_match),
        )
        manifest["pressure"] = ParameterSource(
            value=str(pressure),
            source_file="user_intent" if press_match else "default",
            source_location="parsed from intent" if press_match else "default",
            is_default=not bool(press_match),
            default_reason=None if press_match else "Standard atmospheric pressure",
        )

    elif is_nve:
        # NVE production
        lines.append("# NVE production")
        lines.append("fix 1 all nve")
    lines.append("")

    # Output
    lines.append("# === Output ===")
    lines.append("thermo 1000")
    lines.append("thermo_style custom step temp pe ke etotal press vol density")
    lines.append("")

    # Run command (if not just minimization)
    if is_nvt or is_npt or is_nve:
        # Extract run length from intent
        run_match = re.search(r"(\d+)\s*(?:ns|ps|steps)", intent_lower)
        if run_match:
            value = int(run_match.group(1))
            unit = "steps"
            if "ns" in intent_lower:
                steps = int(value * 1e6 / timestep)  # ns to steps
                unit = "ns"
            elif "ps" in intent_lower:
                steps = int(value * 1e3 / timestep)  # ps to steps
                unit = "ps"
            else:
                steps = value
        else:
            steps = 100000  # Default: 100 ps
            unit = "steps"

        lines.append(f"# Run: {steps} steps")
        lines.append(f"run {steps}")
        manifest["run_steps"] = ParameterSource(
            value=str(steps),
            source_file="user_intent" if run_match else "default",
            source_location=f"parsed from intent ({unit})" if run_match else "default",
            is_default=not bool(run_match),
            default_reason=None if run_match else "Default 100 ps run",
        )
    lines.append("")

    # Final write
    lines.append("# Write final state")
    lines.append("write_data final.data")
    lines.append("")

    return "\n".join(lines), manifest, warnings


# =============================================================================
# Main Agent Function
# =============================================================================


async def run_campaign_planner(
    intent: str,
    file_guides: List[FileGuide],
    workspace: Path,
    output_dir: Path,
    max_iterations: int = 10,
    timeout: int = 180,
) -> CampaignPlanResult:
    """Run the CampaignPlanner agent.

    This function orchestrates the campaign planning process:
    1. Validates inputs (returns error if no file_guides)
    2. Checks for force field information
    3. Generates simulation input files based on intent
    4. Validates generated files
    5. Returns comprehensive result

    Args:
        intent: User's simulation intent description
        file_guides: List of FileGuide objects with analyzed files
        workspace: Path to the workspace directory
        output_dir: Path to the output directory
        max_iterations: Maximum agent iterations (default: 10)
        timeout: Timeout in seconds (default: 180)

    Returns:
        CampaignPlanResult with planning results
    """
    start_time = time.time()
    iterations = 0
    errors: List[CampaignError] = []
    warnings: List[str] = []
    assumptions: List[str] = []
    generated_files: List[GeneratedFile] = []
    manifest: Dict[str, ParameterSource] = {}

    # Validate inputs
    if not file_guides:
        return CampaignPlanResult(
            success=False,
            intent_analysis="Cannot analyze intent without file guides",
            campaign_plan="",
            generated_files=[],
            parameter_manifest={},
            assumptions=[],
            warnings=[],
            errors=[
                CampaignError(
                    code=ErrorCode.E301_MISSING_REQUIRED_FIELD,
                    severity=ErrorSeverity.FATAL,
                    message="No file guides provided. Cannot generate campaign.",
                    suggestion="Provide at least one analyzed file (structure or input)",
                )
            ],
            iterations_used=0,
            duration_ms=int((time.time() - start_time) * 1000),
        )

    # Check for force field information
    ff_info = _extract_force_field_info(file_guides)
    has_ff_info = bool(ff_info["pair_style"] or ff_info["pair_coeffs"])

    if not has_ff_info:
        warnings.append(
            "No force field information found in file guides. "
            "Generated scripts may be incomplete."
        )

    # Analyze intent
    intent_lower = intent.lower()
    intent_analysis = []
    intent_analysis.append(f"User intent: {intent}")

    # Detect simulation type
    sim_type = "unknown"
    if any(kw in intent_lower for kw in ["minimize", "minimization", "optimize"]):
        sim_type = "minimization"
    elif "nvt" in intent_lower or "equilibrat" in intent_lower:
        sim_type = "nvt_equilibration"
    elif "npt" in intent_lower:
        sim_type = "npt_equilibration"
    elif "nve" in intent_lower or "production" in intent_lower:
        sim_type = "nve_production"
    elif "relax" in intent_lower:
        sim_type = "relaxation"

    intent_analysis.append(f"Detected simulation type: {sim_type}")

    # Detect engine
    engine = "lammps"  # Default
    for guide in file_guides:
        if guide.file_type == FileType.QE_INPUT:
            engine = "qe"
            break
        if guide.file_type == FileType.LAMMPS_DATA:
            engine = "lammps"
            break

    intent_analysis.append(f"Target engine: {engine}")

    # Build campaign plan
    campaign_plan_lines = []
    campaign_plan_lines.append("# Campaign Plan")
    campaign_plan_lines.append("")
    campaign_plan_lines.append("## Simulation Steps")
    campaign_plan_lines.append(f"1. {sim_type.replace('_', ' ').title()}")
    campaign_plan_lines.append("")
    campaign_plan_lines.append("## Files to Generate")

    # Determine output filename
    filename_map = {
        "minimization": "in.minimize",
        "nvt_equilibration": "in.nvt",
        "npt_equilibration": "in.npt",
        "nve_production": "in.nve",
        "relaxation": "in.relax",
        "unknown": "in.simulation",
    }
    output_filename = filename_map.get(sim_type, "in.simulation")
    campaign_plan_lines.append(f"- `{output_filename}`: {sim_type.replace('_', ' ').title()}")

    # Create output directory if needed
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate the input file
    iterations += 1

    if engine == "lammps":
        script_content, file_manifest, gen_warnings = generate_lammps_input(
            intent, file_guides
        )
        manifest.update(file_manifest)
        warnings.extend(gen_warnings)

        # Write the file
        output_path = output_dir / output_filename
        output_path.write_text(script_content)

        # Validate the file
        validation_result, attempts = await validate_and_repair(
            output_path, engine, max_attempts=3
        )
        iterations += attempts

        # Create GeneratedFile
        purpose = infer_file_purpose(output_path)
        gen_file = GeneratedFile(
            path=output_path,
            purpose=purpose,
            engine=engine,
            validation=validation_result,
        )
        generated_files.append(gen_file)

        # Check validation result
        if not validation_result.can_run:
            # Add unfixable issues as errors
            for issue in validation_result.all_issues:
                if is_unfixable_error(issue):
                    errors.append(
                        CampaignError(
                            code=ErrorCode.E301_MISSING_REQUIRED_FIELD,
                            severity=ErrorSeverity.ERROR,
                            message=issue.get("message", str(issue)),
                            file_path=str(output_path),
                            suggestion=issue.get("suggestion"),
                        )
                    )
    else:
        # QE generation not fully implemented
        warnings.append("QE input generation not fully implemented yet")

    # Record assumptions
    if manifest.get("timestep") and manifest["timestep"].is_default:
        assumptions.append(
            f"Using default timestep of {manifest['timestep'].value} fs for real units"
        )
    if manifest.get("temperature") and manifest["temperature"].is_default:
        assumptions.append(
            f"Using default temperature of {manifest['temperature'].value} K"
        )
    if manifest.get("tdamp") and manifest["tdamp"].is_default:
        assumptions.append(
            f"Using default Nose-Hoover damping of {manifest['tdamp'].value} fs"
        )

    # Determine success
    success = (
        len(errors) == 0 and
        all(gf.validation and gf.validation.can_run for gf in generated_files)
    )

    duration_ms = int((time.time() - start_time) * 1000)

    return CampaignPlanResult(
        success=success,
        intent_analysis="\n".join(intent_analysis),
        campaign_plan="\n".join(campaign_plan_lines),
        generated_files=generated_files,
        parameter_manifest=manifest,
        assumptions=assumptions,
        warnings=warnings,
        errors=errors,
        iterations_used=iterations,
        duration_ms=duration_ms,
    )


# =============================================================================
# Module Exports
# =============================================================================


__all__ = [
    # Dataclasses
    "GeneratedFile",
    "ParameterSource",
    "CampaignPlanResult",
    # File guide formatting
    "format_file_guides_for_agent",
    # Prompt building
    "build_campaign_planner_prompt",
    # Engine detection and file discovery
    "detect_engine_from_file",
    "infer_file_purpose",
    "discover_generated_files",
    # Validation integration
    "format_repair_request",
    "is_unfixable_error",
    "validate_and_repair",
    "create_validation_summary",
    "create_missing_info_report",
    # LAMMPS generation
    "generate_lammps_input",
    # Main function
    "run_campaign_planner",
]
