"""
FileType enumeration and detection logic for Campaign Builder.

This module provides:
    - FileType: Enumeration of all supported file types
    - detect_file_type: Function to determine file type from path
"""

from enum import Enum
from pathlib import Path
from typing import Optional


class FileType(Enum):
    """Enumeration of all file types Campaign Builder can handle."""

    # Simulation structure/topology files
    LAMMPS_DATA = "lammps_data"
    LAMMPS_INPUT = "lammps_input"
    QE_INPUT = "qe_input"
    QE_OUTPUT = "qe_output"
    POSCAR = "poscar"
    CIF = "cif"
    XYZ = "xyz"
    PDB = "pdb"

    # Document/data files
    PDF = "pdf"
    EXCEL = "excel"
    CSV = "csv"

    # Code/script files
    PYTHON_SCRIPT = "python_script"
    SHELL_SCRIPT = "shell_script"

    # Data formats
    JSON = "json"
    YAML = "yaml"
    TEXT = "text"

    # Fallback
    UNKNOWN = "unknown"

    @property
    def is_structure_file(self) -> bool:
        """Return True if this is a structure/topology file."""
        return self in {
            FileType.LAMMPS_DATA,
            FileType.POSCAR,
            FileType.CIF,
            FileType.XYZ,
            FileType.PDB,
        }

    @property
    def is_input_script(self) -> bool:
        """Return True if this is a simulation input script."""
        return self in {
            FileType.LAMMPS_INPUT,
            FileType.QE_INPUT,
        }

    @property
    def is_document(self) -> bool:
        """Return True if this is a document file."""
        return self in {
            FileType.PDF,
            FileType.EXCEL,
            FileType.CSV,
        }

    @property
    def is_binary(self) -> bool:
        """Return True if this is a binary file type."""
        return self in {
            FileType.PDF,
            FileType.EXCEL,
        }

    @property
    def get_engine(self) -> Optional[str]:
        """Return the simulation engine for this file type, or None."""
        if self in {FileType.LAMMPS_DATA, FileType.LAMMPS_INPUT}:
            return "lammps"
        elif self in {FileType.QE_INPUT, FileType.QE_OUTPUT}:
            return "qe"
        return None


# Extension to FileType mapping
_EXTENSION_MAP = {
    # LAMMPS
    ".data": FileType.LAMMPS_DATA,
    ".lmp": FileType.LAMMPS_DATA,
    # Note: .lammps and .in need content inspection
    ".pwi": FileType.QE_INPUT,
    ".pwo": FileType.QE_OUTPUT,
    ".out": FileType.QE_OUTPUT,
    # Structure formats
    ".vasp": FileType.POSCAR,
    ".poscar": FileType.POSCAR,
    ".cif": FileType.CIF,
    ".xyz": FileType.XYZ,
    ".pdb": FileType.PDB,
    # Documents
    ".pdf": FileType.PDF,
    ".xlsx": FileType.EXCEL,
    ".xls": FileType.EXCEL,
    ".csv": FileType.CSV,
    # Code
    ".py": FileType.PYTHON_SCRIPT,
    ".sh": FileType.SHELL_SCRIPT,
    ".bash": FileType.SHELL_SCRIPT,
    # Data formats
    ".json": FileType.JSON,
    ".yaml": FileType.YAML,
    ".yml": FileType.YAML,
    ".txt": FileType.TEXT,
}


def _inspect_content_for_in_file(file_path: Path) -> FileType:
    """
    Inspect content of a .in file to distinguish between LAMMPS and QE input.

    Args:
        file_path: Path to the .in file

    Returns:
        FileType.QE_INPUT, FileType.LAMMPS_INPUT, or FileType.UNKNOWN
    """
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            # Read first 100 lines
            lines = []
            for i, line in enumerate(f):
                if i >= 100:
                    break
                lines.append(line.lower())

            content = '\n'.join(lines)

            # Check for QE markers
            if '&control' in content or '&system' in content or '&electrons' in content:
                return FileType.QE_INPUT

            # Check for LAMMPS markers
            if 'units' in content or 'atom_style' in content or 'pair_style' in content:
                return FileType.LAMMPS_INPUT

            # Default to UNKNOWN for .in files
            return FileType.UNKNOWN

    except (OSError, IOError):
        return FileType.UNKNOWN


def _inspect_content_for_lammps_file(file_path: Path) -> FileType:
    """
    Inspect content of a .lammps file to distinguish between input script and data file.

    Args:
        file_path: Path to the .lammps file

    Returns:
        FileType.LAMMPS_INPUT, FileType.LAMMPS_DATA, or FileType.UNKNOWN
    """
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            # Read first 100 lines
            lines = []
            for i, line in enumerate(f):
                if i >= 100:
                    break
                lines.append(line.lower())

            content = '\n'.join(lines)

            # Check for input script markers
            if 'units' in content or 'atom_style' in content or 'pair_style' in content:
                return FileType.LAMMPS_INPUT

            # Check for data file markers (numeric headers)
            if 'atoms' in content and ('types' in content or 'xlo' in content):
                return FileType.LAMMPS_DATA

            # Default to data file for .lammps
            return FileType.LAMMPS_DATA

    except (OSError, IOError):
        return FileType.UNKNOWN


def detect_file_type(file_path: Path) -> FileType:
    """
    Determine the FileType from a file path.

    Detection logic (in priority order):
    1. By filename (exact match): POSCAR, CONTCAR
    2. By extension: Use extension mapping
    3. By content inspection: For ambiguous extensions (.in, .lammps)
    4. Default: UNKNOWN

    Args:
        file_path: Path to the file (can be string or Path)

    Returns:
        The detected FileType
    """
    # Ensure we have a Path object
    if isinstance(file_path, str):
        file_path = Path(file_path)

    filename = file_path.name

    # 1. Check for exact filename matches (case-sensitive)
    if filename in ("POSCAR", "CONTCAR"):
        return FileType.POSCAR

    # 2. Get extension (lowercase)
    extension = file_path.suffix.lower()

    # 3. Handle ambiguous extensions with content inspection
    if extension == ".in":
        return _inspect_content_for_in_file(file_path)

    if extension == ".lammps":
        return _inspect_content_for_lammps_file(file_path)

    # 4. Use extension mapping
    if extension in _EXTENSION_MAP:
        return _EXTENSION_MAP[extension]

    # 5. Default to UNKNOWN
    return FileType.UNKNOWN


__all__ = [
    "FileType",
    "detect_file_type",
]
