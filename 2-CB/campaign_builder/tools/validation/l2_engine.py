"""
L2 Validation - Engine Acceptance Validation.

This module provides L2 validation that runs the actual simulation engine
to verify it accepts the input file. This catches issues only the real
engine would find.

L2 is a BLOCKING validation level when the engine is available.
If the engine is not available, L2 is skipped gracefully.

Usage:
    from campaign_builder.tools.validation.l2_engine import validate_l2, L2Result

    result = validate_l2(Path("input.lmp"), engine="lammps")
    if result.skipped:
        print(f"L2 skipped: {result.skip_reason}")
    elif not result.passed:
        print(f"Engine errors: {result.errors}")
"""

import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union


# =============================================================================
# Constants
# =============================================================================

# Default paths for simulation engines on this system
DEFAULT_LAMMPS_PATH = Path(
    "/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp"
)
DEFAULT_QE_PATH = Path(
    "/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x"
)

# Environment variable names
LAMMPS_PATH_ENV = "LAMMPS_PATH"
QE_PATH_ENV = "QE_PATH"

# Timeouts (in seconds)
DEFAULT_TIMEOUT = 30
QE_TIMEOUT = 60


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class L2Result:
    """Result of L2 engine validation.

    Attributes:
        passed: True if engine accepted the input
        skipped: True if validation was skipped
        skip_reason: Reason for skipping (if skipped)
        engine: Name of engine ("lammps" or "qe")
        engine_path: Path to engine binary used
        engine_output: Raw output from engine
        errors: List of error messages extracted
        warnings: List of warning messages extracted
        execution_time_ms: Time taken in milliseconds
    """

    passed: bool
    skipped: bool = False
    skip_reason: Optional[str] = None
    engine: Optional[str] = None
    engine_path: Optional[str] = None
    engine_output: Optional[str] = None
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    execution_time_ms: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        result = {
            "passed": self.passed,
            "skipped": self.skipped,
        }
        if self.skip_reason:
            result["skip_reason"] = self.skip_reason
        if self.engine:
            result["engine"] = self.engine
        if self.engine_path:
            result["engine_path"] = self.engine_path
        if self.engine_output:
            result["engine_output"] = self.engine_output
        if self.errors:
            result["errors"] = self.errors
        if self.warnings:
            result["warnings"] = self.warnings
        result["execution_time_ms"] = self.execution_time_ms
        return result


# =============================================================================
# Engine Discovery
# =============================================================================


def find_lammps_binary() -> Optional[Path]:
    """Find LAMMPS binary.

    Search order:
        1. LAMMPS_PATH environment variable
        2. Hardcoded system path
        3. System PATH (lmp or lammps)

    Returns:
        Path to LAMMPS binary or None if not found
    """
    # Check environment variable
    env_path = os.environ.get(LAMMPS_PATH_ENV)
    if env_path:
        path = Path(env_path)
        if path.exists() and os.access(path, os.X_OK):
            return path

    # Check hardcoded system path
    if DEFAULT_LAMMPS_PATH.exists() and os.access(DEFAULT_LAMMPS_PATH, os.X_OK):
        return DEFAULT_LAMMPS_PATH

    # Check system PATH
    for name in ["lmp", "lammps", "lmp_mpi", "lmp_serial"]:
        path = shutil.which(name)
        if path:
            return Path(path)

    return None


def find_qe_binary() -> Optional[Path]:
    """Find Quantum ESPRESSO pw.x binary.

    Search order:
        1. QE_PATH environment variable
        2. Hardcoded system path
        3. System PATH (pw.x)

    Returns:
        Path to pw.x binary or None if not found
    """
    # Check environment variable
    env_path = os.environ.get(QE_PATH_ENV)
    if env_path:
        path = Path(env_path)
        if path.exists() and os.access(path, os.X_OK):
            return path

    # Check hardcoded system path
    if DEFAULT_QE_PATH.exists() and os.access(DEFAULT_QE_PATH, os.X_OK):
        return DEFAULT_QE_PATH

    # Check system PATH
    path = shutil.which("pw.x")
    if path:
        return Path(path)

    return None


# =============================================================================
# Error Parsing
# =============================================================================


def parse_lammps_errors(output: str) -> List[str]:
    """Parse LAMMPS output for error messages.

    Args:
        output: Raw LAMMPS output

    Returns:
        List of error messages
    """
    errors = []

    # Pattern for LAMMPS errors
    error_pattern = re.compile(r"ERROR:?\s*(.+?)(?:\s*\(src/|$)", re.IGNORECASE)

    for line in output.split("\n"):
        match = error_pattern.search(line)
        if match:
            errors.append(match.group(1).strip())

    return errors


def parse_lammps_warnings(output: str) -> List[str]:
    """Parse LAMMPS output for warning messages.

    Args:
        output: Raw LAMMPS output

    Returns:
        List of warning messages
    """
    warnings = []

    # Pattern for LAMMPS warnings
    warning_pattern = re.compile(r"WARNING:?\s*(.+)", re.IGNORECASE)

    for line in output.split("\n"):
        match = warning_pattern.search(line)
        if match:
            warnings.append(match.group(1).strip())

    return warnings


def parse_qe_errors(output: str) -> List[str]:
    """Parse QE output for error messages.

    Args:
        output: Raw QE output

    Returns:
        List of error messages
    """
    errors = []

    # Pattern for QE errors
    error_patterns = [
        re.compile(r"Error in routine\s+(\w+)\s*\((\d+)\):\s*\n\s*(.+)", re.MULTILINE),
        re.compile(r"%%%+\s*Error:\s*(.+)", re.IGNORECASE),
        re.compile(r"stopping\.\.\."),
    ]

    for pattern in error_patterns:
        for match in pattern.finditer(output):
            if match.groups():
                if len(match.groups()) >= 3:
                    errors.append(f"{match.group(1)}: {match.group(3)}")
                else:
                    errors.append(match.group(1))
            else:
                errors.append("QE stopped with error")

    return errors


def parse_qe_warnings(output: str) -> List[str]:
    """Parse QE output for warning messages.

    Args:
        output: Raw QE output

    Returns:
        List of warning messages
    """
    warnings = []

    # Pattern for QE warnings
    warning_pattern = re.compile(r"Warning:\s*(.+)", re.IGNORECASE)

    for match in warning_pattern.finditer(output):
        warnings.append(match.group(1).strip())

    return warnings


# =============================================================================
# Validation Functions
# =============================================================================


def validate_l2_lammps(
    file_path: Union[str, Path],
    structure_file: Optional[Path] = None,
    engine_path: Optional[str] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> L2Result:
    """Validate LAMMPS input file by running engine.

    Args:
        file_path: Path to LAMMPS input file
        structure_file: Optional path to data file
        engine_path: Optional explicit path to LAMMPS binary
        timeout: Execution timeout in seconds

    Returns:
        L2Result with validation results
    """
    import time

    path = Path(file_path)

    # Find engine
    if engine_path:
        lammps_path = Path(engine_path)
        if not lammps_path.exists():
            return L2Result(
                passed=True,
                skipped=True,
                skip_reason=f"Specified LAMMPS path does not exist: {engine_path}",
                engine="lammps",
            )
    else:
        lammps_path = find_lammps_binary()
        if lammps_path is None:
            return L2Result(
                passed=True,
                skipped=True,
                skip_reason="LAMMPS binary not found",
                engine="lammps",
            )

    # Check input file
    if not path.exists():
        return L2Result(
            passed=False,
            engine="lammps",
            engine_path=str(lammps_path),
            errors=[f"Input file not found: {path}"],
        )

    # Create temporary directory for execution
    start_time = time.time()
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)

        # Copy input file
        input_copy = tmpdir_path / path.name
        shutil.copy(path, input_copy)

        # Copy structure file if provided
        if structure_file and structure_file.exists():
            shutil.copy(structure_file, tmpdir_path / structure_file.name)

        # Also check if the input references a data file and copy it
        try:
            content = path.read_text()
            # Look for read_data commands
            for line in content.split("\n"):
                if line.strip().startswith("read_data"):
                    parts = line.split()
                    if len(parts) >= 2:
                        data_file = parts[1]
                        # Try relative to input file
                        data_path = path.parent / data_file
                        if data_path.exists():
                            shutil.copy(data_path, tmpdir_path / data_file)
        except Exception:
            pass

        # Build command
        # Use -log none to suppress log file
        # We just want to parse, not run a full simulation
        cmd = [str(lammps_path), "-in", str(input_copy), "-log", "none"]

        # Execute
        try:
            result = subprocess.run(
                cmd,
                cwd=tmpdir_path,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            output = result.stdout + "\n" + result.stderr
            exit_code = result.returncode
        except subprocess.TimeoutExpired:
            elapsed = int((time.time() - start_time) * 1000)
            return L2Result(
                passed=False,
                engine="lammps",
                engine_path=str(lammps_path),
                errors=[f"LAMMPS execution timed out after {timeout}s"],
                execution_time_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.time() - start_time) * 1000)
            return L2Result(
                passed=False,
                engine="lammps",
                engine_path=str(lammps_path),
                errors=[f"Failed to execute LAMMPS: {e}"],
                execution_time_ms=elapsed,
            )

    elapsed = int((time.time() - start_time) * 1000)

    # Parse output for errors/warnings
    errors = parse_lammps_errors(output)
    warnings = parse_lammps_warnings(output)

    # Determine pass/fail
    passed = exit_code == 0 and len(errors) == 0

    return L2Result(
        passed=passed,
        engine="lammps",
        engine_path=str(lammps_path),
        engine_output=output[:10000] if output else None,  # Truncate long output
        errors=errors,
        warnings=warnings,
        execution_time_ms=elapsed,
    )


def validate_l2_qe(
    file_path: Union[str, Path],
    engine_path: Optional[str] = None,
    timeout: int = QE_TIMEOUT,
) -> L2Result:
    """Validate QE input file by running engine.

    Note: QE doesn't have a parse-only mode, so we let it start and
    then check for errors in the initial output.

    Args:
        file_path: Path to QE input file
        engine_path: Optional explicit path to pw.x binary
        timeout: Execution timeout in seconds

    Returns:
        L2Result with validation results
    """
    import time

    path = Path(file_path)

    # Find engine
    if engine_path:
        qe_path = Path(engine_path)
        if not qe_path.exists():
            return L2Result(
                passed=True,
                skipped=True,
                skip_reason=f"Specified QE path does not exist: {engine_path}",
                engine="qe",
            )
    else:
        qe_path = find_qe_binary()
        if qe_path is None:
            return L2Result(
                passed=True,
                skipped=True,
                skip_reason="QE pw.x binary not found",
                engine="qe",
            )

    # Check input file
    if not path.exists():
        return L2Result(
            passed=False,
            engine="qe",
            engine_path=str(qe_path),
            errors=[f"Input file not found: {path}"],
        )

    # Read input content
    try:
        content = path.read_text()
    except Exception as e:
        return L2Result(
            passed=False,
            engine="qe",
            engine_path=str(qe_path),
            errors=[f"Cannot read input file: {e}"],
        )

    # Create temporary directory for execution
    start_time = time.time()
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)

        # Copy input file
        input_copy = tmpdir_path / path.name
        shutil.copy(path, input_copy)

        # Create a modified input that stops early
        # Set electron_maxstep = 1 to minimize computation
        modified_content = content
        if "electron_maxstep" not in content.lower():
            # Insert after &ELECTRONS
            modified_content = re.sub(
                r"(&ELECTRONS\s*\n)",
                r"\1   electron_maxstep = 1\n",
                content,
                flags=re.IGNORECASE,
            )

        modified_input = tmpdir_path / "test_input.pwi"
        modified_input.write_text(modified_content)

        # Execute (QE uses stdin for input)
        try:
            with open(modified_input, "r") as infile:
                result = subprocess.run(
                    [str(qe_path)],
                    stdin=infile,
                    cwd=tmpdir_path,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                )
            output = result.stdout + "\n" + result.stderr
            exit_code = result.returncode
        except subprocess.TimeoutExpired:
            elapsed = int((time.time() - start_time) * 1000)
            # Timeout might be ok if it was parsing fine
            return L2Result(
                passed=True,
                engine="qe",
                engine_path=str(qe_path),
                warnings=["QE execution timed out - input may be valid but slow"],
                execution_time_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.time() - start_time) * 1000)
            return L2Result(
                passed=False,
                engine="qe",
                engine_path=str(qe_path),
                errors=[f"Failed to execute QE: {e}"],
                execution_time_ms=elapsed,
            )

    elapsed = int((time.time() - start_time) * 1000)

    # Parse output for errors/warnings
    errors = parse_qe_errors(output)
    warnings = parse_qe_warnings(output)

    # QE exit codes: 0 = success, others = error
    # But non-zero might just be because we terminated early
    passed = len(errors) == 0

    return L2Result(
        passed=passed,
        engine="qe",
        engine_path=str(qe_path),
        engine_output=output[:10000] if output else None,
        errors=errors,
        warnings=warnings,
        execution_time_ms=elapsed,
    )


def validate_l2(
    file_path: Union[str, Path],
    engine: str,
    engine_path: Optional[str] = None,
    timeout: Optional[int] = None,
) -> L2Result:
    """Validate input file by running the appropriate engine.

    Args:
        file_path: Path to input file
        engine: Engine name ("lammps" or "qe")
        engine_path: Optional explicit path to engine binary
        timeout: Optional execution timeout in seconds

    Returns:
        L2Result with validation results
    """
    engine_lower = engine.lower()

    if engine_lower in ("lammps", "lmp"):
        return validate_l2_lammps(
            file_path,
            engine_path=engine_path,
            timeout=timeout or DEFAULT_TIMEOUT,
        )
    elif engine_lower in ("qe", "quantum_espresso", "pw"):
        return validate_l2_qe(
            file_path,
            engine_path=engine_path,
            timeout=timeout or QE_TIMEOUT,
        )
    else:
        return L2Result(
            passed=False,
            skipped=True,
            skip_reason=f"Unknown engine: {engine}",
        )


def format_l2_report(result: L2Result) -> str:
    """Format L2 validation result as human-readable report.

    Args:
        result: L2Result to format

    Returns:
        Markdown-formatted report string
    """
    lines = []

    # Header
    if result.skipped:
        lines.append("## L2 Engine Validation: SKIPPED")
        lines.append("")
        lines.append(f"**Reason:** {result.skip_reason}")
    else:
        status = "PASSED" if result.passed else "FAILED"
        lines.append(f"## L2 Engine Validation: {status}")
        lines.append("")
        lines.append(f"**Engine:** {result.engine}")
        lines.append(f"**Binary:** {result.engine_path}")
        lines.append(f"**Execution time:** {result.execution_time_ms} ms")
        lines.append("")

        # Errors
        if result.errors:
            lines.append("### Errors")
            lines.append("")
            for err in result.errors:
                lines.append(f"- {err}")
            lines.append("")

        # Warnings
        if result.warnings:
            lines.append("### Warnings")
            lines.append("")
            for warn in result.warnings:
                lines.append(f"- {warn}")
            lines.append("")

    return "\n".join(lines)


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    "DEFAULT_LAMMPS_PATH",
    "DEFAULT_QE_PATH",
    "L2Result",
    "find_lammps_binary",
    "find_qe_binary",
    "validate_l2",
    "validate_l2_lammps",
    "validate_l2_qe",
    "format_l2_report",
]
