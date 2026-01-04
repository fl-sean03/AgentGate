"""
FileGuide dataclass and supporting types for Campaign Builder.

FileGuide is the central contract between FileAnalyzer agents and the Campaign Planner.
It captures all information needed for campaign planning in a compact, serializable format.

This module provides:
    - AtomType, PairCoeff, BondCoeff, etc.: Supporting dataclasses
    - Species: QE species information
    - CriticalSection: Important file sections
    - FileGuide: Main dataclass for file analysis results
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from .box_dimensions import BoxDimensions, BoxTilt
from .file_types import FileType


# =============================================================================
# Supporting Dataclasses for LAMMPS
# =============================================================================


@dataclass
class AtomType:
    """LAMMPS atom type information.

    Attributes:
        id: Type ID (1-indexed)
        mass: Atomic mass in g/mol
        label: Comment label if present
        element: Inferred element symbol
        count: How many atoms of this type
    """

    id: int
    mass: float
    label: Optional[str] = None
    element: Optional[str] = None
    count: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary, excluding None values."""
        result = {"id": self.id, "mass": self.mass}
        if self.label is not None:
            result["label"] = self.label
        if self.element is not None:
            result["element"] = self.element
        if self.count is not None:
            result["count"] = self.count
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AtomType":
        """Create AtomType from dictionary."""
        return cls(
            id=int(data["id"]),
            mass=float(data["mass"]),
            label=data.get("label"),
            element=data.get("element"),
            count=int(data["count"]) if "count" in data else None,
        )


@dataclass
class PairCoeff:
    """LAMMPS pair coefficient information.

    Attributes:
        type1: First atom type ID
        type2: Second atom type ID
        style: Pair sub-style if hybrid
        params: Numeric parameters
        comment: Trailing comment
        source_line: Line number in file
    """

    type1: int
    type2: int
    style: Optional[str] = None
    params: List[float] = field(default_factory=list)
    comment: Optional[str] = None
    source_line: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary, excluding None values."""
        result = {
            "type1": self.type1,
            "type2": self.type2,
            "params": self.params,
        }
        if self.style is not None:
            result["style"] = self.style
        if self.comment is not None:
            result["comment"] = self.comment
        if self.source_line is not None:
            result["source_line"] = self.source_line
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PairCoeff":
        """Create PairCoeff from dictionary."""
        return cls(
            type1=int(data["type1"]),
            type2=int(data["type2"]),
            style=data.get("style"),
            params=[float(p) for p in data.get("params", [])],
            comment=data.get("comment"),
            source_line=int(data["source_line"]) if "source_line" in data else None,
        )


@dataclass
class BondCoeff:
    """LAMMPS bond coefficient information.

    Attributes:
        type_id: Bond type ID
        style: Bond sub-style
        params: Numeric parameters
        source_line: Line number in file
    """

    type_id: int
    style: Optional[str] = None
    params: List[float] = field(default_factory=list)
    source_line: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary, excluding None values."""
        result = {"type_id": self.type_id, "params": self.params}
        if self.style is not None:
            result["style"] = self.style
        if self.source_line is not None:
            result["source_line"] = self.source_line
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "BondCoeff":
        """Create BondCoeff from dictionary."""
        return cls(
            type_id=int(data["type_id"]),
            style=data.get("style"),
            params=[float(p) for p in data.get("params", [])],
            source_line=int(data["source_line"]) if "source_line" in data else None,
        )


@dataclass
class AngleCoeff:
    """LAMMPS angle coefficient information.

    Attributes:
        type_id: Angle type ID
        style: Angle sub-style
        params: Numeric parameters
        source_line: Line number in file
    """

    type_id: int
    style: Optional[str] = None
    params: List[float] = field(default_factory=list)
    source_line: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary, excluding None values."""
        result = {"type_id": self.type_id, "params": self.params}
        if self.style is not None:
            result["style"] = self.style
        if self.source_line is not None:
            result["source_line"] = self.source_line
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AngleCoeff":
        """Create AngleCoeff from dictionary."""
        return cls(
            type_id=int(data["type_id"]),
            style=data.get("style"),
            params=[float(p) for p in data.get("params", [])],
            source_line=int(data["source_line"]) if "source_line" in data else None,
        )


@dataclass
class DihedralCoeff:
    """LAMMPS dihedral coefficient information.

    Attributes:
        type_id: Dihedral type ID
        style: Dihedral sub-style
        params: Numeric parameters
        source_line: Line number in file
    """

    type_id: int
    style: Optional[str] = None
    params: List[float] = field(default_factory=list)
    source_line: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary, excluding None values."""
        result = {"type_id": self.type_id, "params": self.params}
        if self.style is not None:
            result["style"] = self.style
        if self.source_line is not None:
            result["source_line"] = self.source_line
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DihedralCoeff":
        """Create DihedralCoeff from dictionary."""
        return cls(
            type_id=int(data["type_id"]),
            style=data.get("style"),
            params=[float(p) for p in data.get("params", [])],
            source_line=int(data["source_line"]) if "source_line" in data else None,
        )


# =============================================================================
# Supporting Dataclasses for QE
# =============================================================================


@dataclass
class Species:
    """Quantum ESPRESSO species information.

    Attributes:
        symbol: Element symbol
        mass: Atomic mass
        pseudopotential: Pseudopotential filename
    """

    symbol: str
    mass: float
    pseudopotential: str

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "symbol": self.symbol,
            "mass": self.mass,
            "pseudopotential": self.pseudopotential,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Species":
        """Create Species from dictionary."""
        return cls(
            symbol=str(data["symbol"]),
            mass=float(data["mass"]),
            pseudopotential=str(data["pseudopotential"]),
        )


# =============================================================================
# General Supporting Dataclasses
# =============================================================================


@dataclass
class CriticalSection:
    """A critical section of a file that requires attention.

    Attributes:
        name: Section name
        start_line: Starting line number
        end_line: Ending line number
        excerpt: Content excerpt (may be truncated)
        importance: Why this section matters
    """

    name: str
    start_line: int
    end_line: int
    excerpt: str
    importance: str

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "excerpt": self.excerpt,
            "importance": self.importance,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CriticalSection":
        """Create CriticalSection from dictionary."""
        return cls(
            name=str(data["name"]),
            start_line=int(data["start_line"]),
            end_line=int(data["end_line"]),
            excerpt=str(data["excerpt"]),
            importance=str(data["importance"]),
        )


# =============================================================================
# FileGuide Dataclass
# =============================================================================


@dataclass
class FileGuide:
    """Complete file analysis guide for Campaign Builder.

    This is the central contract between FileAnalyzer agents and the Campaign Planner.
    It captures all information needed for campaign planning in a compact format.

    Attributes:
        file_path: Absolute path to file
        file_name: Just the filename
        file_type: Detected file type
        file_size_bytes: Size in bytes
        sha256_hash: Hash for provenance
        purpose: What the file is for
        summary: Key takeaways
        confidence: Analysis confidence (high/medium/low)
        analysis_iterations: Agent turns used for analysis
    """

    # Required core fields
    file_path: str
    file_name: str
    file_type: FileType
    file_size_bytes: int
    sha256_hash: str
    purpose: str
    summary: str
    confidence: str
    analysis_iterations: int

    # Optional common fields
    line_count: Optional[int] = None
    warnings: List[str] = field(default_factory=list)
    missing_info: List[str] = field(default_factory=list)
    parse_errors: List[str] = field(default_factory=list)

    # LAMMPS_DATA specific fields
    atom_count: Optional[int] = None
    atom_types_count: Optional[int] = None
    atom_types: Optional[List[AtomType]] = None
    bond_count: Optional[int] = None
    bond_types_count: Optional[int] = None
    angle_count: Optional[int] = None
    angle_types_count: Optional[int] = None
    dihedral_count: Optional[int] = None
    dihedral_types_count: Optional[int] = None
    improper_count: Optional[int] = None
    box_dimensions: Optional[BoxDimensions] = None
    box_tilt: Optional[BoxTilt] = None
    pair_style: Optional[str] = None
    pair_coeffs: Optional[List[PairCoeff]] = None
    bond_style: Optional[str] = None
    bond_coeffs: Optional[List[BondCoeff]] = None
    angle_style: Optional[str] = None
    angle_coeffs: Optional[List[AngleCoeff]] = None
    dihedral_style: Optional[str] = None
    dihedral_coeffs: Optional[List[DihedralCoeff]] = None
    has_velocities: Optional[bool] = None
    has_charges: Optional[bool] = None
    atom_style_hint: Optional[str] = None

    # QE_INPUT specific fields
    calculation: Optional[str] = None
    prefix: Optional[str] = None
    pseudo_dir: Optional[str] = None
    outdir: Optional[str] = None
    ecutwfc: Optional[float] = None
    ecutrho: Optional[float] = None
    occupations: Optional[str] = None
    smearing: Optional[str] = None
    degauss: Optional[float] = None
    nat: Optional[int] = None
    ntyp: Optional[int] = None
    species: Optional[List[Species]] = None
    kpoints_type: Optional[str] = None
    kpoints_grid: Optional[List[int]] = None
    kpoints_shift: Optional[List[int]] = None
    ibrav: Optional[int] = None
    celldm: Optional[List[float]] = None
    cell_parameters_explicit: Optional[bool] = None

    # PDF specific fields
    page_count: Optional[int] = None
    title: Optional[str] = None
    authors: Optional[List[str]] = None
    abstract: Optional[str] = None
    key_findings: Optional[List[str]] = None
    parameters_mentioned: Optional[Dict[str, Any]] = None
    methods_described: Optional[List[str]] = None
    force_fields_referenced: Optional[List[str]] = None
    software_mentioned: Optional[List[str]] = None
    temperatures_mentioned: Optional[List[float]] = None
    pressures_mentioned: Optional[List[float]] = None

    # Excel/CSV specific fields
    sheets: Optional[List[str]] = None
    active_sheet: Optional[str] = None
    columns: Optional[List[str]] = None
    row_count: Optional[int] = None
    column_types: Optional[Dict[str, str]] = None
    data_preview: Optional[str] = None
    numeric_ranges: Optional[Dict[str, Dict[str, float]]] = None
    appears_to_be: Optional[str] = None

    # Critical sections (any file type)
    critical_sections: Optional[List[CriticalSection]] = None

    def __post_init__(self) -> None:
        """Validate fields after initialization."""
        # Validate confidence level
        valid_confidence = {"high", "medium", "low"}
        if self.confidence.lower() not in valid_confidence:
            raise ValueError(
                f"confidence must be one of {valid_confidence}, got '{self.confidence}'"
            )
        self.confidence = self.confidence.lower()

        # Validate required fields are not empty
        if not self.file_path:
            raise ValueError("file_path cannot be empty")
        if not self.file_name:
            raise ValueError("file_name cannot be empty")
        if not self.sha256_hash:
            raise ValueError("sha256_hash cannot be empty")
        if not self.purpose:
            raise ValueError("purpose cannot be empty")
        if not self.summary:
            raise ValueError("summary cannot be empty")

        # Validate file_size_bytes is non-negative
        if self.file_size_bytes < 0:
            raise ValueError("file_size_bytes cannot be negative")

        # Validate analysis_iterations is positive
        if self.analysis_iterations < 1:
            raise ValueError("analysis_iterations must be at least 1")

    def _format_size(self) -> str:
        """Format file size in human-readable form."""
        size = self.file_size_bytes
        for unit in ["B", "KB", "MB", "GB"]:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} TB"

    def to_markdown(self) -> str:
        """Convert FileGuide to markdown format for display.

        Returns:
            Markdown-formatted string representation
        """
        lines = [
            f"## File Guide: {self.file_name}",
            "",
            f"**Type:** {self.file_type.value}",
            f"**Size:** {self._format_size()}",
            f"**Confidence:** {self.confidence}",
            f"**Path:** {self.file_path}",
            "",
            "### Purpose",
            self.purpose,
            "",
            "### Summary",
            self.summary,
            "",
        ]

        # Type-specific sections
        if self.file_type == FileType.LAMMPS_DATA:
            lines.extend(self._lammps_data_markdown())
        elif self.file_type == FileType.QE_INPUT:
            lines.extend(self._qe_input_markdown())
        elif self.file_type == FileType.PDF:
            lines.extend(self._pdf_markdown())
        elif self.file_type in (FileType.EXCEL, FileType.CSV):
            lines.extend(self._spreadsheet_markdown())

        # Warnings
        lines.append("### Warnings")
        if self.warnings:
            for w in self.warnings:
                lines.append(f"- {w}")
        else:
            lines.append("None")
        lines.append("")

        # Missing Information
        lines.append("### Missing Information")
        if self.missing_info:
            for m in self.missing_info:
                lines.append(f"- {m}")
        else:
            lines.append("None")
        lines.append("")

        return "\n".join(lines)

    def _lammps_data_markdown(self) -> List[str]:
        """Generate LAMMPS-specific markdown sections."""
        lines = ["### Structure", ""]

        if self.atom_count is not None:
            lines.append(f"- **Atom count:** {self.atom_count}")
        if self.atom_types_count is not None:
            lines.append(f"- **Atom types:** {self.atom_types_count}")
        if self.bond_count is not None:
            lines.append(f"- **Bonds:** {self.bond_count}")
        if self.angle_count is not None:
            lines.append(f"- **Angles:** {self.angle_count}")
        if self.dihedral_count is not None:
            lines.append(f"- **Dihedrals:** {self.dihedral_count}")

        if self.box_dimensions:
            lines.append(f"- **Box:** {self.box_dimensions.lx:.2f} x {self.box_dimensions.ly:.2f} x {self.box_dimensions.lz:.2f}")
            lines.append(f"- **Volume:** {self.box_dimensions.volume:.2f}")
            if self.box_dimensions.is_triclinic:
                lines.append("- **Triclinic:** Yes")

        lines.append("")

        # Atom Types table
        if self.atom_types:
            lines.extend([
                "### Atom Types",
                "",
                "| ID | Mass | Element | Count |",
                "|----|------|---------|-------|",
            ])
            for at in self.atom_types:
                elem = at.element or "-"
                count = str(at.count) if at.count else "-"
                lines.append(f"| {at.id} | {at.mass:.4f} | {elem} | {count} |")
            lines.append("")

        # Force Field info
        if self.pair_style or self.pair_coeffs:
            lines.append("### Force Field")
            lines.append("")
            if self.pair_style:
                lines.append(f"- **Pair style:** {self.pair_style}")
            if self.bond_style:
                lines.append(f"- **Bond style:** {self.bond_style}")
            if self.angle_style:
                lines.append(f"- **Angle style:** {self.angle_style}")
            lines.append("")

        return lines

    def _qe_input_markdown(self) -> List[str]:
        """Generate QE-specific markdown sections."""
        lines = ["### Calculation Settings", ""]

        if self.calculation:
            lines.append(f"- **Calculation:** {self.calculation}")
        if self.ecutwfc:
            lines.append(f"- **ecutwfc:** {self.ecutwfc} Ry")
        if self.ecutrho:
            lines.append(f"- **ecutrho:** {self.ecutrho} Ry")
        if self.nat:
            lines.append(f"- **nat:** {self.nat}")
        if self.ntyp:
            lines.append(f"- **ntyp:** {self.ntyp}")
        if self.occupations:
            lines.append(f"- **Occupations:** {self.occupations}")
        if self.smearing:
            lines.append(f"- **Smearing:** {self.smearing}")

        lines.append("")

        # Species table
        if self.species:
            lines.extend([
                "### Species",
                "",
                "| Symbol | Mass | Pseudopotential |",
                "|--------|------|-----------------|",
            ])
            for sp in self.species:
                lines.append(f"| {sp.symbol} | {sp.mass:.4f} | {sp.pseudopotential} |")
            lines.append("")

        # K-Points
        if self.kpoints_type or self.kpoints_grid:
            lines.append("### K-Points")
            lines.append("")
            if self.kpoints_type:
                lines.append(f"- **Type:** {self.kpoints_type}")
            if self.kpoints_grid:
                lines.append(f"- **Grid:** {self.kpoints_grid}")
            lines.append("")

        return lines

    def _pdf_markdown(self) -> List[str]:
        """Generate PDF-specific markdown sections."""
        lines = ["### Document Info", ""]

        if self.page_count:
            lines.append(f"- **Pages:** {self.page_count}")
        if self.title:
            lines.append(f"- **Title:** {self.title}")
        if self.authors:
            lines.append(f"- **Authors:** {', '.join(self.authors)}")

        lines.append("")

        if self.abstract:
            lines.extend([
                "### Abstract",
                "",
                self.abstract[:500] + ("..." if len(self.abstract) > 500 else ""),
                "",
            ])

        if self.key_findings:
            lines.append("### Key Findings")
            lines.append("")
            for finding in self.key_findings:
                lines.append(f"- {finding}")
            lines.append("")

        if self.parameters_mentioned:
            lines.append("### Parameters Mentioned")
            lines.append("")
            for key, value in self.parameters_mentioned.items():
                lines.append(f"- **{key}:** {value}")
            lines.append("")

        return lines

    def _spreadsheet_markdown(self) -> List[str]:
        """Generate spreadsheet-specific markdown sections."""
        lines = ["### Sheet Structure", ""]

        if self.sheets:
            lines.append(f"- **Sheets:** {', '.join(self.sheets)}")
        if self.active_sheet:
            lines.append(f"- **Active sheet:** {self.active_sheet}")
        if self.row_count is not None:
            lines.append(f"- **Rows:** {self.row_count}")

        lines.append("")

        if self.columns:
            lines.append("### Columns")
            lines.append("")
            lines.append(", ".join(self.columns))
            lines.append("")

        if self.data_preview:
            lines.extend([
                "### Data Preview",
                "",
                "```",
                self.data_preview,
                "```",
                "",
            ])

        return lines

    def to_dict(self) -> Dict[str, Any]:
        """Convert FileGuide to dictionary for serialization.

        Excludes None values and converts all nested types.

        Returns:
            JSON-serializable dictionary
        """
        result: Dict[str, Any] = {
            "file_path": self.file_path,
            "file_name": self.file_name,
            "file_type": self.file_type.value,
            "file_size_bytes": self.file_size_bytes,
            "sha256_hash": self.sha256_hash,
            "purpose": self.purpose,
            "summary": self.summary,
            "confidence": self.confidence,
            "analysis_iterations": self.analysis_iterations,
        }

        # Optional common fields
        if self.line_count is not None:
            result["line_count"] = self.line_count
        if self.warnings:
            result["warnings"] = self.warnings
        if self.missing_info:
            result["missing_info"] = self.missing_info
        if self.parse_errors:
            result["parse_errors"] = self.parse_errors

        # LAMMPS fields
        if self.atom_count is not None:
            result["atom_count"] = self.atom_count
        if self.atom_types_count is not None:
            result["atom_types_count"] = self.atom_types_count
        if self.atom_types:
            result["atom_types"] = [at.to_dict() for at in self.atom_types]
        if self.bond_count is not None:
            result["bond_count"] = self.bond_count
        if self.bond_types_count is not None:
            result["bond_types_count"] = self.bond_types_count
        if self.angle_count is not None:
            result["angle_count"] = self.angle_count
        if self.angle_types_count is not None:
            result["angle_types_count"] = self.angle_types_count
        if self.dihedral_count is not None:
            result["dihedral_count"] = self.dihedral_count
        if self.dihedral_types_count is not None:
            result["dihedral_types_count"] = self.dihedral_types_count
        if self.improper_count is not None:
            result["improper_count"] = self.improper_count
        if self.box_dimensions:
            result["box_dimensions"] = self.box_dimensions.to_dict()
        if self.box_tilt:
            result["box_tilt"] = self.box_tilt.to_dict()
        if self.pair_style:
            result["pair_style"] = self.pair_style
        if self.pair_coeffs:
            result["pair_coeffs"] = [pc.to_dict() for pc in self.pair_coeffs]
        if self.bond_style:
            result["bond_style"] = self.bond_style
        if self.bond_coeffs:
            result["bond_coeffs"] = [bc.to_dict() for bc in self.bond_coeffs]
        if self.angle_style:
            result["angle_style"] = self.angle_style
        if self.angle_coeffs:
            result["angle_coeffs"] = [ac.to_dict() for ac in self.angle_coeffs]
        if self.dihedral_style:
            result["dihedral_style"] = self.dihedral_style
        if self.dihedral_coeffs:
            result["dihedral_coeffs"] = [dc.to_dict() for dc in self.dihedral_coeffs]
        if self.has_velocities is not None:
            result["has_velocities"] = self.has_velocities
        if self.has_charges is not None:
            result["has_charges"] = self.has_charges
        if self.atom_style_hint:
            result["atom_style_hint"] = self.atom_style_hint

        # QE fields
        if self.calculation:
            result["calculation"] = self.calculation
        if self.prefix:
            result["prefix"] = self.prefix
        if self.pseudo_dir:
            result["pseudo_dir"] = self.pseudo_dir
        if self.outdir:
            result["outdir"] = self.outdir
        if self.ecutwfc is not None:
            result["ecutwfc"] = self.ecutwfc
        if self.ecutrho is not None:
            result["ecutrho"] = self.ecutrho
        if self.occupations:
            result["occupations"] = self.occupations
        if self.smearing:
            result["smearing"] = self.smearing
        if self.degauss is not None:
            result["degauss"] = self.degauss
        if self.nat is not None:
            result["nat"] = self.nat
        if self.ntyp is not None:
            result["ntyp"] = self.ntyp
        if self.species:
            result["species"] = [sp.to_dict() for sp in self.species]
        if self.kpoints_type:
            result["kpoints_type"] = self.kpoints_type
        if self.kpoints_grid:
            result["kpoints_grid"] = self.kpoints_grid
        if self.kpoints_shift:
            result["kpoints_shift"] = self.kpoints_shift
        if self.ibrav is not None:
            result["ibrav"] = self.ibrav
        if self.celldm:
            result["celldm"] = self.celldm
        if self.cell_parameters_explicit is not None:
            result["cell_parameters_explicit"] = self.cell_parameters_explicit

        # PDF fields
        if self.page_count is not None:
            result["page_count"] = self.page_count
        if self.title:
            result["title"] = self.title
        if self.authors:
            result["authors"] = self.authors
        if self.abstract:
            result["abstract"] = self.abstract
        if self.key_findings:
            result["key_findings"] = self.key_findings
        if self.parameters_mentioned:
            result["parameters_mentioned"] = self.parameters_mentioned
        if self.methods_described:
            result["methods_described"] = self.methods_described
        if self.force_fields_referenced:
            result["force_fields_referenced"] = self.force_fields_referenced
        if self.software_mentioned:
            result["software_mentioned"] = self.software_mentioned
        if self.temperatures_mentioned:
            result["temperatures_mentioned"] = self.temperatures_mentioned
        if self.pressures_mentioned:
            result["pressures_mentioned"] = self.pressures_mentioned

        # Spreadsheet fields
        if self.sheets:
            result["sheets"] = self.sheets
        if self.active_sheet:
            result["active_sheet"] = self.active_sheet
        if self.columns:
            result["columns"] = self.columns
        if self.row_count is not None:
            result["row_count"] = self.row_count
        if self.column_types:
            result["column_types"] = self.column_types
        if self.data_preview:
            result["data_preview"] = self.data_preview
        if self.numeric_ranges:
            result["numeric_ranges"] = self.numeric_ranges
        if self.appears_to_be:
            result["appears_to_be"] = self.appears_to_be

        # Critical sections
        if self.critical_sections:
            result["critical_sections"] = [cs.to_dict() for cs in self.critical_sections]

        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FileGuide":
        """Create FileGuide from dictionary.

        Args:
            data: Dictionary with FileGuide data

        Returns:
            New FileGuide instance

        Raises:
            KeyError: If required fields are missing
            ValueError: If field values are invalid
        """
        # Parse file_type from string
        file_type = FileType(data["file_type"])

        # Parse nested structures
        atom_types = None
        if "atom_types" in data:
            atom_types = [AtomType.from_dict(at) for at in data["atom_types"]]

        pair_coeffs = None
        if "pair_coeffs" in data:
            pair_coeffs = [PairCoeff.from_dict(pc) for pc in data["pair_coeffs"]]

        bond_coeffs = None
        if "bond_coeffs" in data:
            bond_coeffs = [BondCoeff.from_dict(bc) for bc in data["bond_coeffs"]]

        angle_coeffs = None
        if "angle_coeffs" in data:
            angle_coeffs = [AngleCoeff.from_dict(ac) for ac in data["angle_coeffs"]]

        dihedral_coeffs = None
        if "dihedral_coeffs" in data:
            dihedral_coeffs = [DihedralCoeff.from_dict(dc) for dc in data["dihedral_coeffs"]]

        box_dimensions = None
        if "box_dimensions" in data:
            box_dimensions = BoxDimensions.from_dict(data["box_dimensions"])

        box_tilt = None
        if "box_tilt" in data:
            box_tilt = BoxTilt.from_dict(data["box_tilt"])

        species = None
        if "species" in data:
            species = [Species.from_dict(sp) for sp in data["species"]]

        critical_sections = None
        if "critical_sections" in data:
            critical_sections = [CriticalSection.from_dict(cs) for cs in data["critical_sections"]]

        return cls(
            # Required fields
            file_path=str(data["file_path"]),
            file_name=str(data["file_name"]),
            file_type=file_type,
            file_size_bytes=int(data["file_size_bytes"]),
            sha256_hash=str(data["sha256_hash"]),
            purpose=str(data["purpose"]),
            summary=str(data["summary"]),
            confidence=str(data["confidence"]),
            analysis_iterations=int(data["analysis_iterations"]),
            # Optional common
            line_count=data.get("line_count"),
            warnings=data.get("warnings", []),
            missing_info=data.get("missing_info", []),
            parse_errors=data.get("parse_errors", []),
            # LAMMPS fields
            atom_count=data.get("atom_count"),
            atom_types_count=data.get("atom_types_count"),
            atom_types=atom_types,
            bond_count=data.get("bond_count"),
            bond_types_count=data.get("bond_types_count"),
            angle_count=data.get("angle_count"),
            angle_types_count=data.get("angle_types_count"),
            dihedral_count=data.get("dihedral_count"),
            dihedral_types_count=data.get("dihedral_types_count"),
            improper_count=data.get("improper_count"),
            box_dimensions=box_dimensions,
            box_tilt=box_tilt,
            pair_style=data.get("pair_style"),
            pair_coeffs=pair_coeffs,
            bond_style=data.get("bond_style"),
            bond_coeffs=bond_coeffs,
            angle_style=data.get("angle_style"),
            angle_coeffs=angle_coeffs,
            dihedral_style=data.get("dihedral_style"),
            dihedral_coeffs=dihedral_coeffs,
            has_velocities=data.get("has_velocities"),
            has_charges=data.get("has_charges"),
            atom_style_hint=data.get("atom_style_hint"),
            # QE fields
            calculation=data.get("calculation"),
            prefix=data.get("prefix"),
            pseudo_dir=data.get("pseudo_dir"),
            outdir=data.get("outdir"),
            ecutwfc=data.get("ecutwfc"),
            ecutrho=data.get("ecutrho"),
            occupations=data.get("occupations"),
            smearing=data.get("smearing"),
            degauss=data.get("degauss"),
            nat=data.get("nat"),
            ntyp=data.get("ntyp"),
            species=species,
            kpoints_type=data.get("kpoints_type"),
            kpoints_grid=data.get("kpoints_grid"),
            kpoints_shift=data.get("kpoints_shift"),
            ibrav=data.get("ibrav"),
            celldm=data.get("celldm"),
            cell_parameters_explicit=data.get("cell_parameters_explicit"),
            # PDF fields
            page_count=data.get("page_count"),
            title=data.get("title"),
            authors=data.get("authors"),
            abstract=data.get("abstract"),
            key_findings=data.get("key_findings"),
            parameters_mentioned=data.get("parameters_mentioned"),
            methods_described=data.get("methods_described"),
            force_fields_referenced=data.get("force_fields_referenced"),
            software_mentioned=data.get("software_mentioned"),
            temperatures_mentioned=data.get("temperatures_mentioned"),
            pressures_mentioned=data.get("pressures_mentioned"),
            # Spreadsheet fields
            sheets=data.get("sheets"),
            active_sheet=data.get("active_sheet"),
            columns=data.get("columns"),
            row_count=data.get("row_count"),
            column_types=data.get("column_types"),
            data_preview=data.get("data_preview"),
            numeric_ranges=data.get("numeric_ranges"),
            appears_to_be=data.get("appears_to_be"),
            # Critical sections
            critical_sections=critical_sections,
        )

    # =========================================================================
    # Factory Methods
    # =========================================================================

    @classmethod
    def for_lammps_data(
        cls,
        file_path: str,
        sha256_hash: str,
        atom_count: int,
        atom_types: List[AtomType],
        box_dimensions: BoxDimensions,
        purpose: str = "LAMMPS structure/topology file",
        summary: str = "LAMMPS data file containing atomic structure",
        confidence: str = "high",
        analysis_iterations: int = 1,
        **kwargs: Any,
    ) -> "FileGuide":
        """Create FileGuide for a LAMMPS data file.

        Args:
            file_path: Absolute path to file
            sha256_hash: File hash
            atom_count: Number of atoms
            atom_types: List of atom types
            box_dimensions: Simulation box dimensions
            purpose: File purpose description
            summary: Analysis summary
            confidence: Confidence level
            analysis_iterations: Number of analysis iterations
            **kwargs: Additional optional fields

        Returns:
            New FileGuide instance for LAMMPS data
        """
        path = Path(file_path)
        return cls(
            file_path=str(path.absolute()),
            file_name=path.name,
            file_type=FileType.LAMMPS_DATA,
            file_size_bytes=path.stat().st_size if path.exists() else 0,
            sha256_hash=sha256_hash,
            purpose=purpose,
            summary=summary,
            confidence=confidence,
            analysis_iterations=analysis_iterations,
            atom_count=atom_count,
            atom_types_count=len(atom_types),
            atom_types=atom_types,
            box_dimensions=box_dimensions,
            **kwargs,
        )

    @classmethod
    def for_qe_input(
        cls,
        file_path: str,
        sha256_hash: str,
        calculation: str,
        nat: int,
        ntyp: int,
        species: List[Species],
        purpose: str = "Quantum ESPRESSO input file",
        summary: str = "QE input file for DFT calculation",
        confidence: str = "high",
        analysis_iterations: int = 1,
        **kwargs: Any,
    ) -> "FileGuide":
        """Create FileGuide for a QE input file.

        Args:
            file_path: Absolute path to file
            sha256_hash: File hash
            calculation: Calculation type (scf, relax, etc.)
            nat: Number of atoms
            ntyp: Number of species
            species: List of species
            purpose: File purpose description
            summary: Analysis summary
            confidence: Confidence level
            analysis_iterations: Number of analysis iterations
            **kwargs: Additional optional fields

        Returns:
            New FileGuide instance for QE input
        """
        path = Path(file_path)
        return cls(
            file_path=str(path.absolute()),
            file_name=path.name,
            file_type=FileType.QE_INPUT,
            file_size_bytes=path.stat().st_size if path.exists() else 0,
            sha256_hash=sha256_hash,
            purpose=purpose,
            summary=summary,
            confidence=confidence,
            analysis_iterations=analysis_iterations,
            calculation=calculation,
            nat=nat,
            ntyp=ntyp,
            species=species,
            **kwargs,
        )

    @classmethod
    def for_pdf(
        cls,
        file_path: str,
        sha256_hash: str,
        page_count: int,
        purpose: str = "PDF document",
        summary: str = "PDF document for reference",
        confidence: str = "medium",
        analysis_iterations: int = 1,
        **kwargs: Any,
    ) -> "FileGuide":
        """Create FileGuide for a PDF document.

        Args:
            file_path: Absolute path to file
            sha256_hash: File hash
            page_count: Number of pages
            purpose: File purpose description
            summary: Analysis summary
            confidence: Confidence level
            analysis_iterations: Number of analysis iterations
            **kwargs: Additional optional fields

        Returns:
            New FileGuide instance for PDF
        """
        path = Path(file_path)
        return cls(
            file_path=str(path.absolute()),
            file_name=path.name,
            file_type=FileType.PDF,
            file_size_bytes=path.stat().st_size if path.exists() else 0,
            sha256_hash=sha256_hash,
            purpose=purpose,
            summary=summary,
            confidence=confidence,
            analysis_iterations=analysis_iterations,
            page_count=page_count,
            **kwargs,
        )

    @classmethod
    def for_excel(
        cls,
        file_path: str,
        sha256_hash: str,
        sheets: List[str],
        columns: List[str],
        row_count: int,
        purpose: str = "Excel spreadsheet",
        summary: str = "Excel file with tabular data",
        confidence: str = "high",
        analysis_iterations: int = 1,
        **kwargs: Any,
    ) -> "FileGuide":
        """Create FileGuide for an Excel spreadsheet.

        Args:
            file_path: Absolute path to file
            sha256_hash: File hash
            sheets: List of sheet names
            columns: List of column headers
            row_count: Number of data rows
            purpose: File purpose description
            summary: Analysis summary
            confidence: Confidence level
            analysis_iterations: Number of analysis iterations
            **kwargs: Additional optional fields

        Returns:
            New FileGuide instance for Excel
        """
        path = Path(file_path)
        return cls(
            file_path=str(path.absolute()),
            file_name=path.name,
            file_type=FileType.EXCEL,
            file_size_bytes=path.stat().st_size if path.exists() else 0,
            sha256_hash=sha256_hash,
            purpose=purpose,
            summary=summary,
            confidence=confidence,
            analysis_iterations=analysis_iterations,
            sheets=sheets,
            columns=columns,
            row_count=row_count,
            **kwargs,
        )


__all__ = [
    "AtomType",
    "PairCoeff",
    "BondCoeff",
    "AngleCoeff",
    "DihedralCoeff",
    "Species",
    "CriticalSection",
    "FileGuide",
]
