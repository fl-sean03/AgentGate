"""
FileAnalyzer agent implementation for Campaign Builder.

This module provides functionality for analyzing files and producing FileGuide objects.
It implements Thrusts 11-12 from the DevGuide:
    - Single file analysis with pre-checks
    - Parallel batch analysis with concurrency limits
    - File discovery with pattern matching

Key functions:
    - pre_check_file: Validate file before analysis
    - detect_file_type: Determine file type from path
    - compute_file_hash: Compute SHA256 hash
    - analyze_file: Analyze a single file
    - analyze_all_files: Analyze multiple files in parallel
    - discover_files: Find supported files in a workspace
    - is_supported_file: Check if file type is supported
"""

import asyncio
import fnmatch
import hashlib
import logging
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

from campaign_builder.schemas import (
    AtomType,
    BondCoeff,
    AngleCoeff,
    DihedralCoeff,
    BoxDimensions,
    CampaignError,
    ErrorCode,
    ErrorSeverity,
    FileGuide,
    FileType,
    PairCoeff,
    Species,
    detect_file_type,
)
from campaign_builder.tools.documents import (
    read_csv,
    read_excel,
    read_pdf,
)


# =============================================================================
# Constants
# =============================================================================

MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB
DEFAULT_MAX_ITERATIONS = 15
DEFAULT_TIMEOUT = 120
DEFAULT_MAX_CONCURRENT = 5

# Supported file extensions
SUPPORTED_EXTENSIONS = {
    # LAMMPS
    ".data", ".lmp", ".lammps", ".in",
    # QE
    ".pwi", ".pwo", ".out",
    # Structure formats
    ".vasp", ".poscar", ".cif", ".xyz", ".pdb",
    # Documents
    ".pdf", ".xlsx", ".xls", ".csv",
}

# Extensions that are always binary
BINARY_EXTENSIONS = {".pdf", ".xlsx", ".xls"}

# Default exclude patterns for file discovery
DEFAULT_EXCLUDE_PATTERNS = [
    "*/__pycache__/*",
    "*/.git/*",
    "*.pyc",
    "*/.DS_Store",
    "*/*.egg-info/*",
    "*/.venv/*",
    "*/venv/*",
    "*/.pytest_cache/*",
    "*/__pycache__",
]

logger = logging.getLogger(__name__)


# =============================================================================
# Result Dataclasses
# =============================================================================


@dataclass
class AnalysisResult:
    """Result of analyzing a single file.

    Attributes:
        success: Whether analysis succeeded
        file_guide: The produced FileGuide (if successful)
        errors: List of errors encountered
        iterations_used: Number of analysis iterations used
        duration_ms: Time taken in milliseconds
    """

    success: bool
    file_guide: Optional[FileGuide]
    errors: List[CampaignError]
    iterations_used: int
    duration_ms: int


@dataclass
class BatchAnalysisResult:
    """Result of analyzing multiple files.

    Attributes:
        total_files: Total number of files analyzed
        successful: Number of successful analyses
        failed: Number of failed analyses
        file_guides: List of produced FileGuides
        errors: Aggregated list of all errors
        total_duration_ms: Total time taken in milliseconds
        parallel: Whether analysis ran in parallel
    """

    total_files: int
    successful: int
    failed: int
    file_guides: List[FileGuide]
    errors: List[CampaignError]
    total_duration_ms: int
    parallel: bool


# =============================================================================
# Pre-Check Functions
# =============================================================================


def pre_check_file(file_path: Path) -> Tuple[bool, Optional[CampaignError]]:
    """
    Run pre-checks on a file before analysis.

    Checks performed:
    1. File exists (E101)
    2. File readable (E103)
    3. File size < 500MB (E102)
    4. Not unsupported binary (E106)
    5. Not empty (E105)

    Args:
        file_path: Path to the file

    Returns:
        Tuple of (passed, error). If passed is True, error is None.
    """
    path = Path(file_path).resolve()

    # 1. Check file exists
    if not path.exists():
        return (False, CampaignError.file_not_found(str(path)))

    # 2. Check file is readable
    try:
        with open(path, "rb") as f:
            # Just try to read a byte
            f.read(1)
    except (PermissionError, OSError) as e:
        return (False, CampaignError.file_unreadable(str(path), str(e)))

    # 3. Check file size
    file_size = path.stat().st_size
    if file_size > MAX_FILE_SIZE_BYTES:
        return (False, CampaignError.file_too_large(str(path), file_size, MAX_FILE_SIZE_BYTES))

    # 4. Check not empty
    if file_size == 0:
        return (False, CampaignError.file_empty(str(path)))

    # 5. Check binary files (only PDF/Excel allowed)
    suffix = path.suffix.lower()
    if suffix not in BINARY_EXTENSIONS:
        try:
            with open(path, "rb") as f:
                chunk = f.read(8192)
                # Check for null bytes (binary indicator)
                if b"\x00" in chunk:
                    return (False, CampaignError.binary_unsupported(str(path)))
        except (PermissionError, OSError):
            pass  # Already checked readability above

    return (True, None)


# =============================================================================
# Hash Computation
# =============================================================================


def compute_file_hash(file_path: Path, algorithm: str = "sha256") -> str:
    """
    Compute cryptographic hash of a file.

    Args:
        file_path: Path to the file
        algorithm: Hash algorithm (default: sha256)

    Returns:
        Hexadecimal hash string
    """
    hasher = hashlib.new(algorithm)
    path = Path(file_path)

    with open(path, "rb") as f:
        while True:
            chunk = f.read(65536)  # 64KB chunks
            if not chunk:
                break
            hasher.update(chunk)

    return hasher.hexdigest()


# =============================================================================
# LAMMPS Data File Parsing
# =============================================================================


def _parse_lammps_data_file(file_path: Path) -> Dict[str, Any]:
    """
    Parse a LAMMPS data file and extract key information.

    Args:
        file_path: Path to the LAMMPS data file

    Returns:
        Dictionary with extracted information
    """
    result: Dict[str, Any] = {
        "atom_count": None,
        "atom_types_count": None,
        "bond_count": None,
        "bond_types_count": None,
        "angle_count": None,
        "angle_types_count": None,
        "dihedral_count": None,
        "dihedral_types_count": None,
        "improper_count": None,
        "box_dimensions": None,
        "atom_types": [],
        "pair_coeffs": [],
        "bond_coeffs": [],
        "angle_coeffs": [],
        "dihedral_coeffs": [],
        "has_velocities": False,
        "has_charges": False,
        "atom_style_hint": None,
        "line_count": 0,
        "warnings": [],
        "parse_errors": [],
    }

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
    except Exception as e:
        result["parse_errors"].append(f"Failed to read file: {e}")
        return result

    result["line_count"] = len(lines)

    current_section = None
    box_bounds = {}

    for line_num, line in enumerate(lines, 1):
        stripped = line.strip()

        # Skip comments and empty lines
        if not stripped or stripped.startswith("#"):
            continue

        # Parse header counts
        lower = stripped.lower()

        # Match patterns like "20 atoms" - only for header lines, not section content
        # Only match if we're not in a section already
        if current_section is None:
            count_match = re.match(r"^\s*(\d+)\s+(\w+)", stripped)
            if count_match:
                count = int(count_match.group(1))
                item_type = count_match.group(2).lower()

                matched_header = True
                if item_type == "atoms":
                    result["atom_count"] = count
                elif item_type == "bonds":
                    result["bond_count"] = count
                elif item_type == "angles":
                    result["angle_count"] = count
                elif item_type == "dihedrals":
                    result["dihedral_count"] = count
                elif item_type == "impropers":
                    result["improper_count"] = count
                elif item_type == "atom" and "types" in lower:
                    result["atom_types_count"] = count
                elif item_type == "bond" and "types" in lower:
                    result["bond_types_count"] = count
                elif item_type == "angle" and "types" in lower:
                    result["angle_types_count"] = count
                elif item_type == "dihedral" and "types" in lower:
                    result["dihedral_types_count"] = count
                else:
                    matched_header = False

                if matched_header:
                    continue

        # Parse type counts with full pattern - only for header lines
        if current_section is None:
            type_count_match = re.match(r"^\s*(\d+)\s+(atom|bond|angle|dihedral|improper)\s+types", lower)
            if type_count_match:
                count = int(type_count_match.group(1))
                item_type = type_count_match.group(2)
                result[f"{item_type}_types_count"] = count
                continue

        # Parse box bounds - only in header section
        if current_section is None:
            box_match = re.match(r"^\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s+(xlo|ylo|zlo)\s+(xhi|yhi|zhi)", stripped)
            if box_match:
                lo = float(box_match.group(1))
                hi = float(box_match.group(2))
                lo_key = box_match.group(3)
                hi_key = box_match.group(4)
                box_bounds[lo_key] = lo
                box_bounds[hi_key] = hi
                continue

            # Parse triclinic tilt
            tilt_match = re.match(r"^\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+xy\s+xz\s+yz", stripped)
            if tilt_match:
                box_bounds["xy"] = float(tilt_match.group(1))
                box_bounds["xz"] = float(tilt_match.group(2))
                box_bounds["yz"] = float(tilt_match.group(3))
                continue

        # Detect section headers - check if line starts with known section name
        section_names = ["Masses", "Pair Coeffs", "Bond Coeffs", "Angle Coeffs",
                         "Dihedral Coeffs", "Atoms", "Velocities", "Bonds",
                         "Angles", "Dihedrals", "Impropers"]
        is_section_header = False
        for section in section_names:
            if stripped == section or stripped.startswith(section + " #"):
                current_section = section
                is_section_header = True
                break
        if is_section_header:
            continue

        # Parse section content
        if current_section == "Masses":
            mass_match = re.match(r"^\s*(\d+)\s+([\d.eE+-]+)\s*(?:#\s*(.*))?", stripped)
            if mass_match:
                type_id = int(mass_match.group(1))
                mass = float(mass_match.group(2))
                label = mass_match.group(3).strip() if mass_match.group(3) else None
                element = _infer_element_from_mass(mass)
                result["atom_types"].append(AtomType(
                    id=type_id,
                    mass=mass,
                    label=label,
                    element=element,
                ))

        elif current_section == "Pair Coeffs":
            # Handle various pair_coeff formats
            parts = stripped.split("#")
            data_part = parts[0].strip()
            comment = parts[1].strip() if len(parts) > 1 else None

            coeff_match = re.match(r"^\s*(\d+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)", data_part)
            if coeff_match:
                result["pair_coeffs"].append(PairCoeff(
                    type1=int(coeff_match.group(1)),
                    type2=int(coeff_match.group(1)),  # Same type for diagonal
                    params=[float(coeff_match.group(2)), float(coeff_match.group(3))],
                    comment=comment,
                    source_line=line_num,
                ))

        elif current_section == "Bond Coeffs":
            parts = stripped.split("#")
            data_part = parts[0].strip()
            tokens = data_part.split()
            if len(tokens) >= 2:
                try:
                    type_id = int(tokens[0])
                    params = [float(t) for t in tokens[1:]]
                    result["bond_coeffs"].append(BondCoeff(
                        type_id=type_id,
                        params=params,
                        source_line=line_num,
                    ))
                except ValueError:
                    pass

        elif current_section == "Angle Coeffs":
            parts = stripped.split("#")
            data_part = parts[0].strip()
            tokens = data_part.split()
            if len(tokens) >= 2:
                try:
                    type_id = int(tokens[0])
                    params = [float(t) for t in tokens[1:]]
                    result["angle_coeffs"].append(AngleCoeff(
                        type_id=type_id,
                        params=params,
                        source_line=line_num,
                    ))
                except ValueError:
                    pass

        elif current_section == "Dihedral Coeffs":
            parts = stripped.split("#")
            data_part = parts[0].strip()
            tokens = data_part.split()
            if len(tokens) >= 2:
                try:
                    type_id = int(tokens[0])
                    params = [float(t) for t in tokens[1:]]
                    result["dihedral_coeffs"].append(DihedralCoeff(
                        type_id=type_id,
                        params=params,
                        source_line=line_num,
                    ))
                except ValueError:
                    pass

        elif current_section == "Atoms":
            # Detect atom style from column count
            parts = stripped.split("#")[0].strip().split()
            if len(parts) >= 7:
                # Likely full style: id mol-id type q x y z
                result["has_charges"] = True
                result["atom_style_hint"] = "full"
            elif len(parts) >= 5:
                # Could be atomic: id type x y z
                if result["atom_style_hint"] is None:
                    result["atom_style_hint"] = "atomic"

        elif current_section == "Velocities":
            result["has_velocities"] = True

    # Create BoxDimensions if we have all bounds
    if all(k in box_bounds for k in ["xlo", "xhi", "ylo", "yhi", "zlo", "zhi"]):
        try:
            result["box_dimensions"] = BoxDimensions(
                xlo=box_bounds["xlo"],
                xhi=box_bounds["xhi"],
                ylo=box_bounds["ylo"],
                yhi=box_bounds["yhi"],
                zlo=box_bounds["zlo"],
                zhi=box_bounds["zhi"],
                xy=box_bounds.get("xy"),
                xz=box_bounds.get("xz"),
                yz=box_bounds.get("yz"),
            )
        except ValueError as e:
            result["parse_errors"].append(f"Invalid box dimensions: {e}")

    return result


def _infer_element_from_mass(mass: float) -> Optional[str]:
    """Infer element symbol from atomic mass."""
    # Common masses and their elements
    mass_to_element = {
        1.008: "H",
        12.011: "C",
        14.007: "N",
        15.999: "O",
        18.998: "F",
        28.086: "Si",
        30.974: "P",
        32.065: "S",
        35.453: "Cl",
        39.948: "Ar",
        55.845: "Fe",
        63.546: "Cu",
        65.38: "Zn",
        79.904: "Br",
        107.868: "Ag",
        126.904: "I",
        196.967: "Au",
    }

    # Find closest mass
    for known_mass, element in mass_to_element.items():
        if abs(mass - known_mass) < 0.5:
            return element
    return None


# =============================================================================
# LAMMPS Input Script Parsing
# =============================================================================


def _parse_lammps_input_file(file_path: Path) -> Dict[str, Any]:
    """
    Parse a LAMMPS input script and extract key information.

    Args:
        file_path: Path to the LAMMPS input file

    Returns:
        Dictionary with extracted information
    """
    result: Dict[str, Any] = {
        "units": None,
        "atom_style": None,
        "pair_style": None,
        "boundary": None,
        "data_file": None,
        "pair_coeffs": [],
        "line_count": 0,
        "warnings": [],
        "parse_errors": [],
    }

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
    except Exception as e:
        result["parse_errors"].append(f"Failed to read file: {e}")
        return result

    result["line_count"] = len(lines)

    for line_num, line in enumerate(lines, 1):
        stripped = line.strip()

        # Skip comments and empty lines
        if not stripped or stripped.startswith("#"):
            continue

        parts = stripped.split()
        if not parts:
            continue

        cmd = parts[0].lower()

        if cmd == "units":
            result["units"] = parts[1] if len(parts) > 1 else None
        elif cmd == "atom_style":
            result["atom_style"] = parts[1] if len(parts) > 1 else None
        elif cmd == "pair_style":
            result["pair_style"] = " ".join(parts[1:]) if len(parts) > 1 else None
        elif cmd == "boundary":
            result["boundary"] = " ".join(parts[1:4]) if len(parts) > 3 else None
        elif cmd == "read_data":
            result["data_file"] = parts[1] if len(parts) > 1 else None
        elif cmd == "pair_coeff":
            # Parse pair_coeff command
            if len(parts) >= 5:
                try:
                    type1 = int(parts[1])
                    type2 = int(parts[2])
                    # Remaining parts are parameters
                    params = []
                    for p in parts[3:]:
                        try:
                            params.append(float(p))
                        except ValueError:
                            break  # Stop at first non-numeric
                    result["pair_coeffs"].append(PairCoeff(
                        type1=type1,
                        type2=type2,
                        params=params,
                        source_line=line_num,
                    ))
                except ValueError:
                    pass

    return result


# =============================================================================
# QE Input Parsing
# =============================================================================


def _parse_qe_input_file(file_path: Path) -> Dict[str, Any]:
    """
    Parse a Quantum ESPRESSO input file and extract key information.

    Args:
        file_path: Path to the QE input file

    Returns:
        Dictionary with extracted information
    """
    result: Dict[str, Any] = {
        "calculation": None,
        "prefix": None,
        "pseudo_dir": None,
        "outdir": None,
        "ecutwfc": None,
        "ecutrho": None,
        "occupations": None,
        "smearing": None,
        "degauss": None,
        "nat": None,
        "ntyp": None,
        "ibrav": None,
        "species": [],
        "kpoints_type": None,
        "kpoints_grid": None,
        "kpoints_shift": None,
        "line_count": 0,
        "warnings": [],
        "parse_errors": [],
    }

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
            lines = content.split("\n")
    except Exception as e:
        result["parse_errors"].append(f"Failed to read file: {e}")
        return result

    result["line_count"] = len(lines)

    # Parse namelist parameters
    namelists = {
        "control": {},
        "system": {},
        "electrons": {},
        "ions": {},
        "cell": {},
    }

    current_namelist = None
    in_atomic_species = False
    in_kpoints = False
    atomic_species_lines = []
    kpoints_lines = []

    for line in lines:
        stripped = line.strip().lower()

        # Detect namelist start
        for nl in namelists:
            if stripped.startswith(f"&{nl}"):
                current_namelist = nl
                break

        # Detect namelist end
        if stripped == "/" and current_namelist:
            current_namelist = None
            continue

        # Parse namelist parameters
        if current_namelist:
            # Parse key = value pairs
            if "=" in stripped:
                parts = stripped.split("=")
                key = parts[0].strip()
                value = parts[1].strip().rstrip(",").strip("'\"")
                namelists[current_namelist][key] = value

        # Detect card sections
        if stripped.startswith("atomic_species"):
            in_atomic_species = True
            in_kpoints = False
            continue
        elif stripped.startswith("k_points"):
            in_kpoints = True
            in_atomic_species = False
            if "automatic" in stripped:
                result["kpoints_type"] = "automatic"
            elif "gamma" in stripped:
                result["kpoints_type"] = "gamma"
            elif "crystal" in stripped:
                result["kpoints_type"] = "crystal"
            continue
        elif stripped.startswith("atomic_positions"):
            in_atomic_species = False
            in_kpoints = False
            continue
        elif stripped.startswith("cell_parameters"):
            in_atomic_species = False
            in_kpoints = False
            continue

        # Collect atomic species
        if in_atomic_species and stripped:
            atomic_species_lines.append(line.strip())

        # Collect k-points
        if in_kpoints and stripped:
            kpoints_lines.append(line.strip())

    # Extract parameters from namelists
    control = namelists["control"]
    system = namelists["system"]

    result["calculation"] = control.get("calculation")
    result["prefix"] = control.get("prefix")
    result["pseudo_dir"] = control.get("pseudo_dir")
    result["outdir"] = control.get("outdir")

    if "ecutwfc" in system:
        try:
            result["ecutwfc"] = float(system["ecutwfc"])
        except ValueError:
            pass

    if "ecutrho" in system:
        try:
            result["ecutrho"] = float(system["ecutrho"])
        except ValueError:
            pass

    if "nat" in system:
        try:
            result["nat"] = int(system["nat"])
        except ValueError:
            pass

    if "ntyp" in system:
        try:
            result["ntyp"] = int(system["ntyp"])
        except ValueError:
            pass

    if "ibrav" in system:
        try:
            result["ibrav"] = int(system["ibrav"])
        except ValueError:
            pass

    result["occupations"] = system.get("occupations")
    result["smearing"] = system.get("smearing")

    if "degauss" in system:
        try:
            result["degauss"] = float(system["degauss"])
        except ValueError:
            pass

    # Parse atomic species
    for line in atomic_species_lines:
        parts = line.split()
        if len(parts) >= 3:
            try:
                result["species"].append(Species(
                    symbol=parts[0],
                    mass=float(parts[1]),
                    pseudopotential=parts[2],
                ))
            except ValueError:
                pass

    # Parse k-points (automatic grid)
    if result["kpoints_type"] == "automatic" and kpoints_lines:
        parts = kpoints_lines[0].split()
        if len(parts) >= 6:
            try:
                result["kpoints_grid"] = [int(parts[0]), int(parts[1]), int(parts[2])]
                result["kpoints_shift"] = [int(parts[3]), int(parts[4]), int(parts[5])]
            except (ValueError, IndexError):
                pass

    return result


# =============================================================================
# Single File Analysis
# =============================================================================


async def analyze_file(
    file_path: Union[str, Path],
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
    timeout: int = DEFAULT_TIMEOUT,
) -> AnalysisResult:
    """
    Analyze a single file and produce a FileGuide.

    Args:
        file_path: Path to the file to analyze
        max_iterations: Maximum analysis iterations (for future agent use)
        timeout: Maximum time in seconds (for future agent use)

    Returns:
        AnalysisResult containing the FileGuide or errors
    """
    start_time = time.time()
    path = Path(file_path).resolve()

    logger.info(f"Starting analysis of {path}")

    # Run pre-checks
    ok, error = pre_check_file(path)
    if not ok:
        return AnalysisResult(
            success=False,
            file_guide=None,
            errors=[error] if error else [],
            iterations_used=0,
            duration_ms=int((time.time() - start_time) * 1000),
        )

    # Detect file type
    file_type = detect_file_type(path)
    logger.debug(f"Detected file type: {file_type}")

    # Compute hash
    file_hash = compute_file_hash(path)

    # Get file metadata
    file_size = path.stat().st_size

    # Parse file based on type
    errors: List[CampaignError] = []
    warnings: List[str] = []
    parse_errors: List[str] = []
    iterations_used = 1

    try:
        if file_type == FileType.LAMMPS_DATA:
            file_guide = await _analyze_lammps_data(path, file_hash, file_size)
        elif file_type == FileType.LAMMPS_INPUT:
            file_guide = await _analyze_lammps_input(path, file_hash, file_size)
        elif file_type == FileType.QE_INPUT:
            file_guide = await _analyze_qe_input(path, file_hash, file_size)
        elif file_type == FileType.PDF:
            file_guide = await _analyze_pdf(path, file_hash, file_size)
        elif file_type == FileType.EXCEL:
            file_guide = await _analyze_excel(path, file_hash, file_size)
        elif file_type == FileType.CSV:
            file_guide = await _analyze_csv(path, file_hash, file_size)
        else:
            # Generic text file analysis
            file_guide = await _analyze_generic_file(path, file_type, file_hash, file_size)

    except asyncio.TimeoutError:
        duration_ms = int((time.time() - start_time) * 1000)
        return AnalysisResult(
            success=False,
            file_guide=None,
            errors=[CampaignError(
                code=ErrorCode.E201_AGENT_TIMEOUT,
                severity=ErrorSeverity.ERROR,
                message=f"Analysis timeout after {timeout}s",
                file_path=str(path),
            )],
            iterations_used=max_iterations,
            duration_ms=duration_ms,
        )
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.exception(f"Error analyzing {path}")
        return AnalysisResult(
            success=False,
            file_guide=None,
            errors=[CampaignError(
                code=ErrorCode.E202_AGENT_FAILED,
                severity=ErrorSeverity.ERROR,
                message=f"Analysis error: {str(e)}",
                file_path=str(path),
            )],
            iterations_used=iterations_used,
            duration_ms=duration_ms,
        )

    duration_ms = int((time.time() - start_time) * 1000)
    logger.info(f"Analysis complete for {path.name} in {duration_ms}ms")

    return AnalysisResult(
        success=True,
        file_guide=file_guide,
        errors=errors,
        iterations_used=iterations_used,
        duration_ms=duration_ms,
    )


async def _analyze_lammps_data(path: Path, file_hash: str, file_size: int) -> FileGuide:
    """Analyze a LAMMPS data file."""
    parsed = _parse_lammps_data_file(path)

    # Determine confidence based on parsing results
    confidence = "high"
    if parsed["parse_errors"]:
        confidence = "low"
    elif parsed["warnings"] or not parsed["box_dimensions"]:
        confidence = "medium"

    # Build summary
    summary_parts = []
    if parsed["atom_count"]:
        summary_parts.append(f"{parsed['atom_count']} atoms")
    if parsed["atom_types_count"]:
        summary_parts.append(f"{parsed['atom_types_count']} atom types")
    if parsed["bond_count"]:
        summary_parts.append(f"{parsed['bond_count']} bonds")
    if parsed["box_dimensions"]:
        box = parsed["box_dimensions"]
        summary_parts.append(f"box {box.lx:.1f}x{box.ly:.1f}x{box.lz:.1f}")

    summary = "LAMMPS data file with " + ", ".join(summary_parts) if summary_parts else "LAMMPS data file"

    return FileGuide(
        file_path=str(path),
        file_name=path.name,
        file_type=FileType.LAMMPS_DATA,
        file_size_bytes=file_size,
        sha256_hash=file_hash,
        purpose="LAMMPS structure/topology file containing atomic coordinates and force field parameters",
        summary=summary,
        confidence=confidence,
        analysis_iterations=1,
        line_count=parsed["line_count"],
        warnings=parsed["warnings"],
        parse_errors=parsed["parse_errors"],
        atom_count=parsed["atom_count"],
        atom_types_count=parsed["atom_types_count"],
        atom_types=parsed["atom_types"] if parsed["atom_types"] else None,
        bond_count=parsed["bond_count"],
        bond_types_count=parsed["bond_types_count"],
        angle_count=parsed["angle_count"],
        angle_types_count=parsed["angle_types_count"],
        dihedral_count=parsed["dihedral_count"],
        dihedral_types_count=parsed["dihedral_types_count"],
        improper_count=parsed["improper_count"],
        box_dimensions=parsed["box_dimensions"],
        pair_coeffs=parsed["pair_coeffs"] if parsed["pair_coeffs"] else None,
        bond_coeffs=parsed["bond_coeffs"] if parsed["bond_coeffs"] else None,
        angle_coeffs=parsed["angle_coeffs"] if parsed["angle_coeffs"] else None,
        dihedral_coeffs=parsed["dihedral_coeffs"] if parsed["dihedral_coeffs"] else None,
        has_velocities=parsed["has_velocities"],
        has_charges=parsed["has_charges"],
        atom_style_hint=parsed["atom_style_hint"],
    )


async def _analyze_lammps_input(path: Path, file_hash: str, file_size: int) -> FileGuide:
    """Analyze a LAMMPS input script."""
    parsed = _parse_lammps_input_file(path)

    confidence = "high"
    if parsed["parse_errors"]:
        confidence = "low"
    elif not parsed["units"]:
        confidence = "medium"

    summary_parts = []
    if parsed["units"]:
        summary_parts.append(f"units: {parsed['units']}")
    if parsed["pair_style"]:
        summary_parts.append(f"pair_style: {parsed['pair_style']}")
    if parsed["data_file"]:
        summary_parts.append(f"reads: {parsed['data_file']}")

    summary = "LAMMPS input script" + (f" ({', '.join(summary_parts)})" if summary_parts else "")

    return FileGuide(
        file_path=str(path),
        file_name=path.name,
        file_type=FileType.LAMMPS_INPUT,
        file_size_bytes=file_size,
        sha256_hash=file_hash,
        purpose="LAMMPS input script defining simulation parameters and commands",
        summary=summary,
        confidence=confidence,
        analysis_iterations=1,
        line_count=parsed["line_count"],
        warnings=parsed["warnings"],
        parse_errors=parsed["parse_errors"],
        pair_style=parsed["pair_style"],
        pair_coeffs=parsed["pair_coeffs"] if parsed["pair_coeffs"] else None,
        atom_style_hint=parsed["atom_style"],
    )


async def _analyze_qe_input(path: Path, file_hash: str, file_size: int) -> FileGuide:
    """Analyze a Quantum ESPRESSO input file."""
    parsed = _parse_qe_input_file(path)

    confidence = "high"
    if parsed["parse_errors"]:
        confidence = "low"
    elif not parsed["calculation"]:
        confidence = "medium"

    summary_parts = []
    if parsed["calculation"]:
        summary_parts.append(f"calculation: {parsed['calculation']}")
    if parsed["nat"]:
        summary_parts.append(f"{parsed['nat']} atoms")
    if parsed["ecutwfc"]:
        summary_parts.append(f"ecutwfc: {parsed['ecutwfc']} Ry")

    summary = "QE input file" + (f" ({', '.join(summary_parts)})" if summary_parts else "")

    return FileGuide(
        file_path=str(path),
        file_name=path.name,
        file_type=FileType.QE_INPUT,
        file_size_bytes=file_size,
        sha256_hash=file_hash,
        purpose="Quantum ESPRESSO input file for DFT calculation",
        summary=summary,
        confidence=confidence,
        analysis_iterations=1,
        line_count=parsed["line_count"],
        warnings=parsed["warnings"],
        parse_errors=parsed["parse_errors"],
        calculation=parsed["calculation"],
        prefix=parsed["prefix"],
        pseudo_dir=parsed["pseudo_dir"],
        outdir=parsed["outdir"],
        ecutwfc=parsed["ecutwfc"],
        ecutrho=parsed["ecutrho"],
        occupations=parsed["occupations"],
        smearing=parsed["smearing"],
        degauss=parsed["degauss"],
        nat=parsed["nat"],
        ntyp=parsed["ntyp"],
        species=parsed["species"] if parsed["species"] else None,
        kpoints_type=parsed["kpoints_type"],
        kpoints_grid=parsed["kpoints_grid"],
        kpoints_shift=parsed["kpoints_shift"],
        ibrav=parsed["ibrav"],
    )


async def _analyze_pdf(path: Path, file_hash: str, file_size: int) -> FileGuide:
    """Analyze a PDF document."""
    result = read_pdf(path)

    if not result.success:
        return FileGuide(
            file_path=str(path),
            file_name=path.name,
            file_type=FileType.PDF,
            file_size_bytes=file_size,
            sha256_hash=file_hash,
            purpose="PDF document (failed to read)",
            summary=f"PDF reading failed: {result.error}",
            confidence="low",
            analysis_iterations=1,
            parse_errors=[result.error] if result.error else [],
        )

    title = result.metadata.get("title") or result.metadata.get("inferred_title")

    return FileGuide(
        file_path=str(path),
        file_name=path.name,
        file_type=FileType.PDF,
        file_size_bytes=file_size,
        sha256_hash=file_hash,
        purpose="PDF document for reference",
        summary=f"PDF with {result.page_count} pages" + (f": {title}" if title else ""),
        confidence=result.extraction_quality,
        analysis_iterations=1,
        page_count=result.page_count,
        title=title,
    )


async def _analyze_excel(path: Path, file_hash: str, file_size: int) -> FileGuide:
    """Analyze an Excel spreadsheet."""
    result = read_excel(path)

    if not result.success:
        return FileGuide(
            file_path=str(path),
            file_name=path.name,
            file_type=FileType.EXCEL,
            file_size_bytes=file_size,
            sha256_hash=file_hash,
            purpose="Excel spreadsheet (failed to read)",
            summary=f"Excel reading failed: {result.error}",
            confidence="low",
            analysis_iterations=1,
            parse_errors=[result.error] if result.error else [],
        )

    sheet_count = len(result.sheet_names)
    first_sheet = result.sheets[0] if result.sheets else None

    summary = f"Excel with {sheet_count} sheet(s)"
    if first_sheet:
        summary += f", {first_sheet.row_count} rows in first sheet"

    return FileGuide(
        file_path=str(path),
        file_name=path.name,
        file_type=FileType.EXCEL,
        file_size_bytes=file_size,
        sha256_hash=file_hash,
        purpose="Excel spreadsheet with tabular data",
        summary=summary,
        confidence="high",
        analysis_iterations=1,
        sheets=result.sheet_names,
        active_sheet=result.sheet_names[0] if result.sheet_names else None,
        columns=first_sheet.headers if first_sheet else None,
        row_count=first_sheet.row_count if first_sheet else None,
        column_types=result.column_types if result.column_types else None,
    )


async def _analyze_csv(path: Path, file_hash: str, file_size: int) -> FileGuide:
    """Analyze a CSV file."""
    result = read_csv(path)

    if not result.success:
        return FileGuide(
            file_path=str(path),
            file_name=path.name,
            file_type=FileType.CSV,
            file_size_bytes=file_size,
            sha256_hash=file_hash,
            purpose="CSV file (failed to read)",
            summary=f"CSV reading failed: {result.error}",
            confidence="low",
            analysis_iterations=1,
            parse_errors=[result.error] if result.error else [],
        )

    summary = f"CSV with {result.row_count} rows, {len(result.headers)} columns"

    return FileGuide(
        file_path=str(path),
        file_name=path.name,
        file_type=FileType.CSV,
        file_size_bytes=file_size,
        sha256_hash=file_hash,
        purpose="CSV file with tabular data",
        summary=summary,
        confidence="high",
        analysis_iterations=1,
        columns=result.headers,
        row_count=result.row_count,
        column_types=result.column_types if result.column_types else None,
    )


async def _analyze_generic_file(
    path: Path, file_type: FileType, file_hash: str, file_size: int
) -> FileGuide:
    """Analyze a generic text file."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        line_count = len(lines)
    except Exception:
        line_count = 0

    return FileGuide(
        file_path=str(path),
        file_name=path.name,
        file_type=file_type,
        file_size_bytes=file_size,
        sha256_hash=file_hash,
        purpose=f"{file_type.value} file",
        summary=f"{file_type.value} file with {line_count} lines",
        confidence="medium",
        analysis_iterations=1,
        line_count=line_count,
    )


# =============================================================================
# Batch Analysis
# =============================================================================


async def analyze_all_files(
    file_paths: List[Union[str, Path]],
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
    max_concurrent: int = DEFAULT_MAX_CONCURRENT,
    timeout_per_file: int = DEFAULT_TIMEOUT,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> BatchAnalysisResult:
    """
    Analyze multiple files in parallel.

    Args:
        file_paths: List of file paths to analyze
        max_iterations: Maximum iterations per file
        max_concurrent: Maximum concurrent analyses
        timeout_per_file: Timeout per file in seconds
        progress_callback: Optional callback(completed, total, current_file)

    Returns:
        BatchAnalysisResult with aggregated results
    """
    if not file_paths:
        return BatchAnalysisResult(
            total_files=0,
            successful=0,
            failed=0,
            file_guides=[],
            errors=[],
            total_duration_ms=0,
            parallel=False,
        )

    paths = [Path(p).resolve() for p in file_paths]
    start_time = time.time()

    semaphore = asyncio.Semaphore(max_concurrent)
    completed_count = 0

    async def analyze_with_semaphore(path: Path, index: int) -> Tuple[Path, AnalysisResult]:
        nonlocal completed_count
        async with semaphore:
            logger.info(f"[{index + 1}/{len(paths)}] Analyzing {path.name}")
            result = await analyze_file(
                path,
                max_iterations=max_iterations,
                timeout=timeout_per_file,
            )
            completed_count += 1
            if progress_callback:
                progress_callback(completed_count, len(paths), path.name)
            return (path, result)

    # Create tasks
    tasks = [
        analyze_with_semaphore(path, i)
        for i, path in enumerate(paths)
    ]

    # Run all tasks
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Process results
    file_guides: List[FileGuide] = []
    errors: List[CampaignError] = []
    successful = 0
    failed = 0

    for item in results:
        if isinstance(item, Exception):
            failed += 1
            errors.append(CampaignError(
                code=ErrorCode.E202_AGENT_FAILED,
                severity=ErrorSeverity.ERROR,
                message=f"Unexpected error: {str(item)}",
            ))
        else:
            path, result = item
            if result.success and result.file_guide:
                successful += 1
                file_guides.append(result.file_guide)
            else:
                failed += 1
                errors.extend(result.errors)

    total_duration_ms = int((time.time() - start_time) * 1000)

    return BatchAnalysisResult(
        total_files=len(paths),
        successful=successful,
        failed=failed,
        file_guides=file_guides,
        errors=errors,
        total_duration_ms=total_duration_ms,
        parallel=max_concurrent > 1,
    )


# =============================================================================
# File Discovery
# =============================================================================


def is_supported_file(path: Path) -> bool:
    """
    Check if a file type is supported for analysis.

    Args:
        path: Path to the file

    Returns:
        True if the file type is supported
    """
    # Check extension
    suffix = path.suffix.lower()
    if suffix in SUPPORTED_EXTENSIONS:
        return True

    # Check exact filename (POSCAR, CONTCAR)
    if path.name in ("POSCAR", "CONTCAR"):
        return True

    return False


def discover_files(
    workspace: Union[str, Path],
    include_patterns: Optional[List[str]] = None,
    exclude_patterns: Optional[List[str]] = None,
) -> List[Path]:
    """
    Discover supported files in a workspace directory.

    Args:
        workspace: Root directory to search
        include_patterns: Glob patterns to include (optional)
        exclude_patterns: Glob patterns to exclude (optional, uses defaults)

    Returns:
        List of discovered file paths, sorted by path
    """
    workspace_path = Path(workspace).resolve()

    if not workspace_path.exists():
        logger.warning(f"Workspace does not exist: {workspace_path}")
        return []

    if not workspace_path.is_dir():
        logger.warning(f"Workspace is not a directory: {workspace_path}")
        return []

    # Use default exclude patterns if none provided
    if exclude_patterns is None:
        exclude_patterns = DEFAULT_EXCLUDE_PATTERNS

    files: List[Path] = []

    for path in workspace_path.rglob("*"):
        if not path.is_file():
            continue

        # Check exclusions
        path_str = str(path)
        excluded = False
        for pattern in exclude_patterns:
            if fnmatch.fnmatch(path_str, pattern):
                excluded = True
                break

        if excluded:
            continue

        # Check inclusions
        if include_patterns:
            included = False
            for pattern in include_patterns:
                if fnmatch.fnmatch(path.name, pattern):
                    included = True
                    break
            if not included:
                continue
        else:
            # Use default supported file check
            if not is_supported_file(path):
                continue

        files.append(path)

    return sorted(files)


def get_file_analyzer_tools(file_type: FileType) -> List[str]:
    """
    Get appropriate tools for a file type.

    Args:
        file_type: The file type to get tools for

    Returns:
        List of tool names
    """
    base_tools = ["Read", "Grep", "Bash", "Glob"]

    if file_type == FileType.PDF:
        return base_tools + ["read_pdf"]
    elif file_type == FileType.EXCEL:
        return base_tools + ["read_excel"]
    elif file_type == FileType.CSV:
        return base_tools + ["read_csv"]
    else:
        return base_tools


def assess_batch_result(result: BatchAnalysisResult) -> ErrorSeverity:
    """
    Determine overall severity of batch result.

    Args:
        result: The batch analysis result

    Returns:
        ErrorSeverity indicating overall status
    """
    if result.successful == 0 and result.total_files > 0:
        return ErrorSeverity.FATAL
    elif result.failed > 0:
        return ErrorSeverity.WARNING
    else:
        return ErrorSeverity.INFO


__all__ = [
    # Result types
    "AnalysisResult",
    "BatchAnalysisResult",
    # Pre-check functions
    "pre_check_file",
    # File utilities
    "detect_file_type",
    "compute_file_hash",
    "is_supported_file",
    # Analysis functions
    "analyze_file",
    "analyze_all_files",
    # Discovery
    "discover_files",
    # Tool helpers
    "get_file_analyzer_tools",
    "assess_batch_result",
    # Constants
    "MAX_FILE_SIZE_BYTES",
    "SUPPORTED_EXTENSIONS",
    "DEFAULT_EXCLUDE_PATTERNS",
]
